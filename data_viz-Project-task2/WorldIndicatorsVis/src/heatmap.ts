import * as d3 from "d3";
import { CountryData, FeatureMeta, Selection } from "./types";
import { getSelection, onSelectionChange, setFocus } from "./selection";
import { hideTooltip, showTooltipHtml } from "./tooltip";
import { escapeHtml, formatValue } from "./format";

/*
 * Task 1 – Heatmap (final sketch = detailed sketch 1: [7] Heatmap).
 *
 * Rows    = the selected country (pinned on top, red outline) + up to 9 comparison countries.
 * Columns = the ticked features (max 5), in the order they were ticked.
 * Cell text = raw value. Cell fill = (v - min) / (max - min) of that feature over ALL 217 countries,
 *             so light = lowest in the world, dark = highest in the world (per column).
 * Missing values are drawn as a grey hatched cell with "–".
 *
 * Operations (numbers as in the sketch):
 *  1 click a row name     -> that country becomes the selected country (pinned top row)
 *  2 hover a cell         -> tooltip with raw value, unit and rank out of all countries with data
 *  3 click a column title -> sort the comparison rows by that feature (▼ high-low, ▲ low-high, again = off);
 *                            the selected country stays pinned on top
 *  4/5 chips and checkboxes in the selection panel add/remove rows and columns (controls.ts)
 *  6 legend on the right: light = lowest, dark = highest of all 217, per column
 */

// Colours (sequential, one hue light -> dark; text colour flips to white on dark cells)
const LOW_COLOR = "#e6eaf0";
const HIGH_COLOR = "#1c4a96";
const SELECTED_OUTLINE = "#c0392b";
const SELECTED_NAME_BG = "#fbeeb0";
const TEXT_DARK = "#0b0b0b";
const TEXT_LIGHT = "#ffffff";
const DARK_THRESHOLD = 0.55; // above this normalised value the cell text is white

// Features whose colour uses a log10 scale instead of a linear one (for very right-skewed features).
// The sketch lists this as optional for GDP per capita; add "gdpPerCapita" here to switch it on.
const LOG_SCALED: string[] = [];

// Size limits of one cell (px)
const MAX_CELL_W = 170, MIN_CELL_W = 90;
const MAX_CELL_H = 56, MIN_CELL_H = 30;

interface SortState { key: string; descending: boolean }

export function createHeatmap(container: string, countries: CountryData[], features: FeatureMeta[]): void {
  const root = d3.select(container);
  const featureByKey = new Map(features.map((f) => [f.key, f]));
  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const color = d3.scaleSequential(d3.interpolateRgb(LOW_COLOR, HIGH_COLOR)).domain([0, 1]);

  // Pre-compute per feature: min/max over all countries (for the colour) and the sorted values (for the rank).
  const stats = new Map<string, { min: number; max: number; sortedDesc: number[] }>();
  const scaled = (key: string, v: number) => (LOG_SCALED.includes(key) ? Math.log10(Math.max(v, 1e-9)) : v);
  for (const f of features) {
    const vals = countries.map((c) => c.values[f.key]).filter((v): v is number => v !== null);
    const sv = vals.map((v) => scaled(f.key, v));
    stats.set(f.key, { min: d3.min(sv)!, max: d3.max(sv)!, sortedDesc: vals.sort((a, b) => b - a) });
  }
  const normalise = (key: string, v: number) => {
    const s = stats.get(key)!;
    return s.max === s.min ? 0.5 : (scaled(key, v) - s.min) / (s.max - s.min);
  };
  const rankOf = (key: string, v: number) => {
    const s = stats.get(key)!;
    return { rank: 1 + d3.bisector((d: number) => -d).left(s.sortedDesc, -v), of: s.sortedDesc.length };
  };

  let sort: SortState | null = null;

  root.selectAll("*").remove();
  root.append("div").attr("class", "panelTitle").text("Task 1 – Heatmap");
  root
    .append("div")
    .attr("class", "panelSubtitle")
    .text("Colour = value scaled between the lowest and highest of all 217 countries, per column (light = low, dark = high). Click a country name to select it, click a column title to sort.");
  const svg = root.append("svg").attr("class", "heatmap");

  function draw(s: Selection): void {
    hideTooltip();
    svg.selectAll("*").remove();

    const cols = s.features.map((k) => featureByKey.get(k)).filter((f): f is FeatureMeta => !!f);
    if (sort && !s.features.includes(sort.key)) sort = null; // sorted column was removed

    // Row order: selected country pinned first, then the comparison countries (sorted if requested).
    let others = s.compare.map((iso) => byIso.get(iso)).filter((c): c is CountryData => !!c);
    if (sort) {
      const { key, descending } = sort;
      others = [...others].sort((a, b) => {
        const va = a.values[key], vb = b.values[key];
        if (va === null) return 1; // missing values always at the bottom
        if (vb === null) return -1;
        return descending ? vb - va : va - vb;
      });
    }
    const focus = byIso.get(s.focus);
    const rows = focus ? [focus, ...others] : others;

    const node = root.node() as HTMLElement;
    if (rows.length === 0 || cols.length === 0) {
      svg.attr("width", 0).attr("height", 0);
      root.select(".hint").remove();
      root.append("p").attr("class", "hint").text("Select at least one country and one feature in the panel on the left.");
      return;
    }
    root.select(".hint").remove();

    // ------------------------------------------------------------ layout
    const margin = { top: 52, right: 110, bottom: 10, left: 160 };
    const availW = node.clientWidth - 24 - margin.left - margin.right;
    const availH = node.clientHeight - 64 - margin.top - margin.bottom;
    const cellW = Math.max(MIN_CELL_W, Math.min(MAX_CELL_W, availW / cols.length));
    const cellH = Math.max(MIN_CELL_H, Math.min(MAX_CELL_H, availH / rows.length));
    const width = margin.left + cols.length * cellW + margin.right;
    const height = margin.top + rows.length * cellH + margin.bottom;
    svg.attr("width", width).attr("height", Math.max(height, margin.top + 170));

    // Hatch pattern for missing values
    const defs = svg.append("defs");
    defs
      .append("pattern")
      .attr("id", "missingHatch")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8)
      .attr("patternTransform", "rotate(45)")
      .call((p) => {
        p.append("rect").attr("width", 8).attr("height", 8).attr("fill", "#f1f1ef");
        p.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 8).attr("stroke", "#c9c8c3").attr("stroke-width", 2);
      });

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // ------------------------------------------------------------ column headers (operation 3: sort)
    const header = g
      .selectAll("g.colHeader")
      .data(cols)
      .join("g")
      .attr("class", "colHeader")
      .attr("transform", (_, j) => `translate(${j * cellW + cellW / 2},0)`)
      .style("cursor", "pointer")
      .on("click", (_, f) => {
        if (!sort || sort.key !== f.key) sort = { key: f.key, descending: true };
        else if (sort.descending) sort = { key: f.key, descending: false };
        else sort = null;
        draw(getSelection());
      });
    header
      .append("title")
      .text((f) => `${f.fullName}\nClick to sort (high → low, low → high, off)`);
    header
      .append("text")
      .attr("class", "colLabel")
      .attr("y", -24)
      .attr("text-anchor", "middle")
      .text((f) => {
        const arrow = sort && sort.key === f.key ? (sort.descending ? " ▼" : " ▲") : " ⇅";
        return f.label + arrow;
      });
    header
      .append("text")
      .attr("class", "colUnit")
      .attr("y", -9)
      .attr("text-anchor", "middle")
      .text((f) => f.unit);

    // ------------------------------------------------------------ rows
    const row = g
      .selectAll("g.row")
      .data(rows, (d: any) => d.iso3)
      .join("g")
      .attr("class", "row")
      .attr("transform", (_, i) => `translate(0,${i * cellH})`);

    // Row names (operation 1: click to select)
    const name = row
      .append("g")
      .attr("class", "rowName")
      .style("cursor", (d) => (d.iso3 === s.focus ? "default" : "pointer"))
      .on("click", (_, d) => setFocus(d.iso3));
    name
      .filter((d) => d.iso3 === s.focus)
      .append("rect")
      .attr("x", -margin.left + 6)
      .attr("y", 3)
      .attr("width", margin.left - 12)
      .attr("height", cellH - 6)
      .attr("rx", 3)
      .attr("fill", SELECTED_NAME_BG);
    name
      .append("text")
      .attr("x", -12)
      .attr("y", cellH / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "end")
      .attr("class", (d) => (d.iso3 === s.focus ? "rowLabel selected" : "rowLabel"))
      .text((d) => d.name);
    name.append("title").text((d) => (d.iso3 === s.focus ? "Selected country" : `Click to make ${d.name} the selected country`));

    // Cells
    const cell = row
      .selectAll("g.cell")
      .data((c) => cols.map((f) => ({ c, f, v: c.values[f.key] })))
      .join("g")
      .attr("class", "cell")
      .attr("transform", (_, j) => `translate(${j * cellW},0)`);

    cell
      .append("rect")
      .attr("x", 1)
      .attr("y", 1)
      .attr("width", cellW - 2)
      .attr("height", cellH - 2)
      .attr("rx", 3)
      .attr("fill", (d) => (d.v === null ? "url(#missingHatch)" : color(normalise(d.f.key, d.v))));

    cell
      .append("text")
      .attr("x", cellW / 2)
      .attr("y", cellH / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("class", "cellValue")
      .style("fill", (d) => (d.v !== null && normalise(d.f.key, d.v) > DARK_THRESHOLD ? TEXT_LIGHT : TEXT_DARK))
      .style("font-weight", (d) => (d.c.iso3 === s.focus ? 700 : 400))
      .text((d) => formatValue(d.v));

    // Operation 2: tooltip with raw value + unit + rank
    cell
      .on("mousemove", (event: MouseEvent, d) => {
        let body: string;
        if (d.v === null) {
          body = `${escapeHtml(d.f.label)}: <i>no data for 2023</i>`;
        } else {
          const { rank, of } = rankOf(d.f.key, d.v);
          const third = rank <= of / 3 ? "high" : rank > (2 * of) / 3 ? "low" : "middle";
          body =
            `${escapeHtml(d.f.label)}: <b>${formatValue(d.v)}</b> ${escapeHtml(d.f.unit)}<br>` +
            `rank ${rank} of ${of} <span class="tipMuted">(${third}; 1 = highest)</span>`;
        }
        showTooltipHtml(event.pageX, event.pageY, `<b>${escapeHtml(d.c.name)}</b><br>${body}`);
      })
      .on("mouseleave", hideTooltip);

    // Selected country: red outline around the whole pinned row
    if (focus) {
      g.append("rect")
        .attr("x", -3)
        .attr("y", -1)
        .attr("width", cols.length * cellW + 6)
        .attr("height", cellH + 2)
        .attr("rx", 5)
        .attr("fill", "none")
        .attr("stroke", SELECTED_OUTLINE)
        .attr("stroke-width", 2.5)
        .style("pointer-events", "none");
    }

    // ------------------------------------------------------------ legend (operation 6)
    const legendH = Math.min(160, Math.max(100, rows.length * cellH - 20));
    const lx = cols.length * cellW + 28;
    const grad = defs.append("linearGradient").attr("id", "heatLegend").attr("x1", 0).attr("x2", 0).attr("y1", 1).attr("y2", 0);
    d3.range(0, 1.01, 0.1).forEach((t) => grad.append("stop").attr("offset", t).attr("stop-color", color(t)));
    const legend = g.append("g").attr("class", "legend").attr("transform", `translate(${lx},0)`);
    legend.append("text").attr("x", 0).attr("y", -9).attr("class", "legendTitle").text("per column");
    legend.append("rect").attr("width", 14).attr("height", legendH).attr("rx", 3).attr("fill", "url(#heatLegend)").attr("stroke", "#c9c8c3");
    legend.append("text").attr("x", 20).attr("y", 10).text("highest");
    legend.append("text").attr("x", 20).attr("y", legendH).text("lowest");
    legend.append("text").attr("x", 20).attr("y", legendH / 2 + 4).attr("class", "legendNote").text("of 217");
    const miss = legend.append("g").attr("transform", `translate(0,${legendH + 16})`);
    miss.append("rect").attr("width", 14).attr("height", 14).attr("rx", 2).attr("fill", "url(#missingHatch)").attr("stroke", "#c9c8c3");
    miss.append("text").attr("x", 20).attr("y", 11).text("no data");
  }

  onSelectionChange(draw);
  // Redraw when the window is resized so the cells keep fitting the panel
  window.addEventListener("resize", () => draw(getSelection()));
}
