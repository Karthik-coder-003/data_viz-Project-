import * as d3 from "d3";
import { CountryData, FeatureMeta, Selection } from "./types";
import { getSelection, onSelectionChange, setFocus, toggleCompare, MAX_COMPARE } from "./selection";
import { hideTooltip, showTooltipHtml } from "./tooltip";
import { escapeHtml, formatValue } from "./format";

/*
 * Task 2 – Choropleth map (final sketch = Sketch 1: "Color luminance").
 *
 * "Compare the geospatial distribution for up to 5 selected features over the entire spatial region."
 *
 * Visual mapping
 *  - Mark: area (country outline), position = Natural Earth projection of the whole world (Antarctica left out).
 *  - Value -> luminance of ONE hue (same blue as the Task 1 heatmap): darker = higher, as in the sketch.
 *    Values are binned into 5 quantile classes (quintiles over all countries with data), so each shade holds
 *    ~20% of the countries. This keeps the 5 shades easy to tell apart and stops very skewed features
 *    (GDP, population density) from colouring almost the whole world in the lightest shade.
 *  - Grey hatched = country in the dataset but no 2023 value for this feature (same pattern as Task 1).
 *  - Plain light grey = area that is not in the World Bank dataset (e.g. Western Sahara, Taiwan).
 *
 * Link with Task 1 (shared selection in selection.ts)
 *  - The dropdown lists exactly the features ticked for Task 1 (max 5), in the same order.
 *  - The selected country gets a red outline (same red as its row in the heatmap),
 *    the comparison countries get a thick amber outline. Countries too small to see at world scale
 *    (e.g. the Netherlands) also get a ring of the same colour around them.
 *  - Click a country           -> add it to / remove it from the comparison (adds/removes a heatmap row).
 *  - Shift + click a country   -> make it the selected country (pinned top row in the heatmap).
 *
 * Other interaction
 *  - Hover: tooltip with the value, unit, rank out of all countries and the class.
 *  - Scroll / drag: zoom and pan (small European countries are hard to see at world scale).
 *    "Zoom to selection" fits the selected + compared countries, "Reset" shows the whole world.
 */

// Colours: the same light -> dark blue as the Task 1 heatmap, split into 5 steps.
const LOW_COLOR = "#e6eaf0";
const HIGH_COLOR = "#1c4a96";
const N_CLASSES = 5;
const CLASS_COLORS = d3.quantize(d3.interpolateRgb(LOW_COLOR, HIGH_COLOR), N_CLASSES);
const CLASS_NAMES = ["lowest 20%", "low", "middle", "high", "highest 20%"];
const NOT_IN_DATASET = "#f4f4f2";
const BORDER = "#ffffff";
const FOCUS_OUTLINE = "#c0392b"; // = SELECTED_OUTLINE in heatmap.ts
const COMPARE_OUTLINE = "#f5a300";
const HOVER_OUTLINE = "#0b0b0b";

type GeoFeature = d3.ExtendedFeature<d3.GeoGeometryObjects, { iso3: string; name: string; hasData: boolean }>;

export function createMap(
  container: string,
  world: d3.ExtendedFeatureCollection,
  countries: CountryData[],
  features: FeatureMeta[]
): void {
  const root = d3.select(container);
  root.selectAll("*").remove();
  root.classed("placeholder", false).classed("mapPanel", true);

  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const featureByKey = new Map(features.map((f) => [f.key, f]));
  // Antarctica has no data and takes a lot of space at the bottom of the map.
  const shapes = (world.features as GeoFeature[]).filter((f) => f.properties.iso3 !== "ATA");

  // Per feature: quantile colour scale and the sorted values (for the rank in the tooltip).
  const scales = new Map<string, d3.ScaleQuantile<string, never>>();
  const sortedDesc = new Map<string, number[]>();
  for (const f of features) {
    const vals = countries.map((c) => c.values[f.key]).filter((v): v is number => v !== null);
    scales.set(f.key, d3.scaleQuantile<string>().domain(vals).range(CLASS_COLORS));
    sortedDesc.set(f.key, [...vals].sort((a, b) => b - a));
  }
  const rankOf = (key: string, v: number) => {
    const s = sortedDesc.get(key)!;
    return { rank: 1 + d3.bisector((d: number) => -d).left(s, -v), of: s.length };
  };

  // ------------------------------------------------------------ panel layout: header, map, legend
  const header = root.append("div").attr("class", "mapHeader");
  header.append("span").attr("class", "panelTitle").text("Task 2 – Map");
  const pick = header.append("label").attr("class", "mapPick");
  pick.append("span").text("Feature: ");
  const dropdown = pick.append("select").attr("id", "mapFeature");
  const zoomSel = header.append("button").attr("class", "mapButton").text("Zoom to selection");
  const zoomReset = header.append("button").attr("class", "mapButton").text("Reset");
  header
    .append("span")
    .attr("class", "panelSubtitle mapHint")
    .text("Click a country to add/remove it from the comparison · Shift + click to make it the selected country · Scroll to zoom");

  const mapBox = root.append("div").attr("class", "mapBox");
  const svg = mapBox.append("svg").attr("class", "map");
  const legendSvg = root.append("svg").attr("class", "mapLegend").attr("height", 54);
  const emptyHint = mapBox.append("div").attr("class", "mapEmpty").style("display", "none")
    .text("Tick at least one feature in the panel on the left to colour the map.");

  // Hatch pattern for "no data" (same as the heatmap)
  const defs = svg.append("defs");
  addHatch(defs, "mapHatch");
  addHatch(legendSvg.append("defs"), "mapLegendHatch");

  const zoomLayer = svg.append("g");
  const sphere = zoomLayer.append("path").attr("class", "sphere");
  const countryLayer = zoomLayer.append("g");
  const outlineLayer = zoomLayer.append("g").style("pointer-events", "none"); // outlines of selected countries on top
  const markerLayer = zoomLayer.append("g").style("pointer-events", "none"); // rings around small selected countries
  const MARKER_R = 7, SMALL_AREA = 120; // px: countries smaller than this on screen also get a ring
  let zoomK = 1;

  const projection = d3.geoNaturalEarth1();
  const path = d3.geoPath(projection);

  let currentKey: string | null = null;
  let width = 0, height = 0;

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([1, 20])
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform);
      zoomK = event.transform.k;
      markerLayer.selectAll<SVGCircleElement, unknown>("circle").attr("r", MARKER_R / zoomK); // rings keep their screen size
    });
  svg.call(zoom).on("dblclick.zoom", null); // double click would also fire two clicks

  const countryPaths = countryLayer
    .selectAll<SVGPathElement, GeoFeature>("path")
    .data(shapes)
    .join("path")
    .attr("class", "country")
    .style("cursor", (d) => (byIso.has(d.properties.iso3) ? "pointer" : "default"))
    .on("mousemove", function (event: MouseEvent, d) {
      d3.select(this).raise().attr("stroke", HOVER_OUTLINE).attr("stroke-width", 1.5);
      showTooltipHtml(event.pageX, event.pageY, tooltipHtml(d));
    })
    .on("mouseleave", function () {
      d3.select(this).attr("stroke", BORDER).attr("stroke-width", 0.4);
      hideTooltip();
    })
    .on("click", (event: MouseEvent, d) => {
      const iso = d.properties.iso3;
      if (!byIso.has(iso)) return;
      if (event.shiftKey) setFocus(iso);
      else if (!toggleCompare(iso)) {
        showTooltipHtml(event.pageX, event.pageY, `You can compare with at most ${MAX_COMPARE} countries.`);
      }
    });

  // ------------------------------------------------------------ geometry (on start and on resize)
  function layout(): void {
    const node = mapBox.node() as HTMLElement;
    width = Math.max(200, node.clientWidth);
    height = Math.max(150, node.clientHeight);
    svg.attr("width", width).attr("height", height);
    projection.fitExtent([[6, 6], [width - 6, height - 6]], { type: "Sphere" });
    sphere.attr("d", path({ type: "Sphere" }) ?? "");
    countryPaths.attr("d", (d) => path(d) ?? "");
    zoom.extent([[0, 0], [width, height]]).translateExtent([[0, 0], [width, height]]);
    legendSvg.attr("width", (root.node() as HTMLElement).clientWidth - 16);
  }

  // ------------------------------------------------------------ colours + highlighting (on every change)
  function update(s: Selection): void {
    hideTooltip();
    // Dropdown = the Task 1 features. Keep the shown feature if it is still ticked, otherwise take the first.
    if (!currentKey || !s.features.includes(currentKey)) currentKey = s.features[0] ?? null;
    dropdown
      .selectAll("option")
      .data(s.features, (k: any) => k)
      .join("option")
      .attr("value", (k) => k)
      .text((k) => featureByKey.get(k)?.label ?? k);
    dropdown.property("value", currentKey ?? "").property("disabled", !currentKey);
    emptyHint.style("display", currentKey ? "none" : "flex");

    const scale = currentKey ? scales.get(currentKey)! : null;
    countryPaths
      .attr("fill", (d) => {
        const c = byIso.get(d.properties.iso3);
        if (!c) return NOT_IN_DATASET;
        if (!scale || !currentKey) return LOW_COLOR;
        const v = c.values[currentKey];
        return v === null ? "url(#mapHatch)" : scale(v);
      })
      .attr("stroke", BORDER)
      .attr("stroke-width", 0.4);

    // Selection outlines: compared countries first, the selected country last so it is always on top.
    const chosen = [
      ...s.compare.map((iso) => ({ iso, focus: false })),
      ...(s.focus ? [{ iso: s.focus, focus: true }] : []),
    ];
    const outlineData: { iso: string; focus: boolean; f: GeoFeature }[] = [];
    for (const c of chosen) {
      for (const f of shapes) if (f.properties.iso3 === c.iso) outlineData.push({ ...c, f });
    }
    outlineLayer
      .selectAll("path")
      .data(outlineData)
      .join("path")
      .attr("d", (d) => path(d.f) ?? "")
      .attr("fill", "none")
      .attr("stroke", (d) => (d.focus ? FOCUS_OUTLINE : COMPARE_OUTLINE))
      .attr("stroke-width", (d) => (d.focus ? 2.5 : 2))
      .attr("vector-effect", "non-scaling-stroke")
      .attr("stroke-linejoin", "round");

    // Small countries (e.g. the Netherlands, Belgium) are only a few pixels at world scale:
    // also draw a ring around them so the selection can be found without zooming in.
    const markers = chosen
      .map((c) => {
        const parts = shapes.filter((f) => f.properties.iso3 === c.iso);
        if (parts.length === 0) return null;
        const main = parts.map(mainPart).reduce((a, b) => (d3.geoArea(b) > d3.geoArea(a) ? b : a));
        return path.area(main) < SMALL_AREA ? { ...c, xy: path.centroid(main) } : null;
      })
      .filter((m): m is { iso: string; focus: boolean; xy: [number, number] } => m !== null && !isNaN(m.xy[0]));
    markerLayer
      .selectAll("circle")
      .data(markers)
      .join("circle")
      .attr("cx", (d) => d.xy[0])
      .attr("cy", (d) => d.xy[1])
      .attr("r", MARKER_R / zoomK)
      .attr("fill", "none")
      .attr("stroke", (d) => (d.focus ? FOCUS_OUTLINE : COMPARE_OUTLINE))
      .attr("stroke-width", 2)
      .attr("vector-effect", "non-scaling-stroke");

    drawLegend(s);
  }

  // ------------------------------------------------------------ legend (below the map, as in the sketch)
  function drawLegend(s: Selection): void {
    legendSvg.selectAll("g").remove();
    const g = legendSvg.append("g").attr("transform", "translate(8,4)");
    if (!currentKey) return;
    const f = featureByKey.get(currentKey)!;
    const scale = scales.get(currentKey)!;
    const thresholds = scale.quantiles();
    const vals = sortedDesc.get(currentKey)!;
    const min = vals[vals.length - 1], max = vals[0];

    g.append("text").attr("class", "legendTitle").attr("y", 11)
      .text(`${f.label} (${f.unit}) – darker colour = higher`);

    const sw = 92, sh = 14, y = 18;
    const bins = CLASS_COLORS.map((color, i) => ({
      color,
      lo: i === 0 ? min : thresholds[i - 1],
      hi: i === N_CLASSES - 1 ? max : thresholds[i],
      name: CLASS_NAMES[i],
    }));
    const bin = g.selectAll("g.bin").data(bins).join("g").attr("class", "bin")
      .attr("transform", (_, i) => `translate(${i * sw},${y})`);
    bin.append("rect").attr("width", sw - 2).attr("height", sh).attr("fill", (d) => d.color).attr("stroke", "#c9c8c3");
    bin.append("text").attr("y", sh + 13).attr("class", "legendTick")
      .text((d) => `${formatValue(d.lo)} – ${formatValue(d.hi)}`);
    bin.append("title").text((d) => `${d.name} of countries: ${formatValue(d.lo)} – ${formatValue(d.hi)} ${f.unit}`);

    // Extra keys: no data, not in dataset, selected and compared outlines
    let x = N_CLASSES * sw + 18;
    const key = (draw: (k: d3.Selection<SVGGElement, unknown, any, any>) => void, label: string) => {
      const k = g.append("g").attr("transform", `translate(${x},${y})`);
      draw(k);
      k.append("text").attr("x", 20).attr("y", 11).text(label);
      x += 26 + label.length * 6.6;
    };
    const missing = countries.filter((c) => c.values[currentKey!] === null).length;
    key((k) => { k.append("rect").attr("width", 14).attr("height", sh).attr("fill", "url(#mapLegendHatch)").attr("stroke", "#c9c8c3"); },
      `no data (${missing})`);
    key((k) => { k.append("rect").attr("width", 14).attr("height", sh).attr("fill", NOT_IN_DATASET).attr("stroke", "#c9c8c3"); },
      "not in dataset");
    key((k) => { k.append("rect").attr("x", 1).attr("y", 1).attr("width", 12).attr("height", sh - 2).attr("fill", "none").attr("stroke", FOCUS_OUTLINE).attr("stroke-width", 2.5); },
      `selected: ${byIso.get(s.focus)?.name ?? "–"}`);
    key((k) => { k.append("rect").attr("x", 1).attr("y", 1).attr("width", 12).attr("height", sh - 2).attr("fill", "none").attr("stroke", COMPARE_OUTLINE).attr("stroke-width", 2); },
      `compared (${s.compare.length})`);
  }

  function tooltipHtml(d: GeoFeature): string {
    const c = byIso.get(d.properties.iso3);
    const name = `<b>${escapeHtml(c?.name ?? d.properties.name)}</b>`;
    if (!c) return `${name}<br><span class="tipMuted">not in the World Bank dataset</span>`;
    const s = getSelection();
    const role = c.iso3 === s.focus ? " <span class=\"tipMuted\">(selected)</span>"
      : s.compare.includes(c.iso3) ? " <span class=\"tipMuted\">(compared)</span>" : "";
    if (!currentKey) return name + role;
    const f = featureByKey.get(currentKey)!;
    const v = c.values[currentKey];
    if (v === null) return `${name}${role}<br>${escapeHtml(f.label)}: <i>no data for 2023</i>`;
    const { rank, of } = rankOf(currentKey, v);
    const cls = CLASS_COLORS.indexOf(scales.get(currentKey)!(v));
    return `${name}${role}<br>${escapeHtml(f.label)}: <b>${formatValue(v)}</b> ${escapeHtml(f.unit)}<br>` +
      `rank ${rank} of ${of} <span class="tipMuted">(1 = highest; class: ${CLASS_NAMES[cls]})</span>`;
  }

  // ------------------------------------------------------------ zoom buttons
  zoomReset.on("click", () => svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity));
  zoomSel.on("click", () => {
    const s = getSelection();
    const isos = new Set([s.focus, ...s.compare]);
    // Use the largest polygon of each country, so e.g. French Guiana does not stretch the view for France.
    const boxes = shapes.filter((f) => isos.has(f.properties.iso3)).map((f) => path.bounds(mainPart(f)));
    if (boxes.length === 0) return;
    const x0 = d3.min(boxes, (b) => b[0][0])!, y0 = d3.min(boxes, (b) => b[0][1])!;
    const x1 = d3.max(boxes, (b) => b[1][0])!, y1 = d3.max(boxes, (b) => b[1][1])!;
    const k = Math.max(1, Math.min(20, 0.85 / Math.max((x1 - x0) / width, (y1 - y0) / height)));
    const t = d3.zoomIdentity.translate(width / 2, height / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    svg.transition().duration(750).call(zoom.transform, t);
  });
  dropdown.on("change", function () {
    currentKey = (this as HTMLSelectElement).value;
    update(getSelection());
  });

  layout();
  onSelectionChange(update);
  window.addEventListener("resize", () => {
    layout();
    update(getSelection());
  });
}

function mainPart(f: GeoFeature): d3.GeoPermissibleObjects {
  if (f.geometry.type !== "MultiPolygon") return f;
  const polys = (f.geometry as GeoJSON.MultiPolygon).coordinates.map(
    (coordinates) => ({ type: "Polygon", coordinates }) as GeoJSON.Polygon
  );
  return polys.reduce((a, b) => (d3.geoArea(b) > d3.geoArea(a) ? b : a));
}

function addHatch(defs: d3.Selection<SVGDefsElement, unknown, any, any>, id: string): void {
  defs
    .append("pattern")
    .attr("id", id)
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6)
    .attr("patternTransform", "rotate(45)")
    .call((p) => {
      p.append("rect").attr("width", 6).attr("height", 6).attr("fill", "#e9e9e6");
      p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 6).attr("stroke", "#b9b8b3").attr("stroke-width", 1.5);
    });
}
