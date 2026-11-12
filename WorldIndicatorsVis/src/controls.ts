import * as d3 from "d3";
import { CountryData, FeatureMeta, Selection } from "./types";
import { MAX_COMPARE, MAX_FEATURES, onSelectionChange, setFocus, toggleCompare, toggleFeature } from "./selection";

/*
 * Selection panel (left column): choose the focus country, the countries to compare with, and the features.
 * Built with plain d3 DOM manipulation, no UI libraries.
 */
export function createControls(container: string, countries: CountryData[], features: FeatureMeta[]): void {
  const root = d3.select(container);
  root.selectAll("*").remove();
  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const sorted = [...countries].sort((a, b) => d3.ascending(a.name, b.name));

  // ---------------------------------------------------------------- focus country
  root.append("h3").text("Selected country");
  const focusSelect = root.append("select").attr("id", "focusSelect").attr("class", "fullWidth");
  focusSelect
    .selectAll("option")
    .data(sorted)
    .join("option")
    .attr("value", (d) => d.iso3)
    .text((d) => d.name);
  focusSelect.on("change", function () {
    setFocus((this as HTMLSelectElement).value);
  });

  // ---------------------------------------------------------------- comparison countries
  root.append("h3").text(`Compare with (max ${MAX_COMPARE})`);
  const addRow = root.append("div").attr("class", "row");
  const addInput = addRow
    .append("input")
    .attr("id", "compareInput")
    .attr("list", "countryList")
    .attr("placeholder", "Type a country name…")
    .attr("class", "fullWidth");
  addRow
    .append("datalist")
    .attr("id", "countryList")
    .selectAll("option")
    .data(sorted)
    .join("option")
    .attr("value", (d) => d.name);

  const message = root.append("div").attr("class", "message");
  const chips = root.append("div").attr("class", "chips");

  const nameToIso = new Map(sorted.map((c) => [c.name.toLowerCase(), c.iso3]));
  addInput.on("change", function () {
    const input = this as HTMLInputElement;
    const iso3 = nameToIso.get(input.value.trim().toLowerCase());
    if (!iso3) {
      message.text(`"${input.value}" is not a country in the dataset.`);
      return;
    }
    if (!toggleCompare(iso3)) message.text(`You can compare with at most ${MAX_COMPARE} countries.`);
    input.value = "";
  });

  // ---------------------------------------------------------------- features
  root.append("h3").text(`Features (max ${MAX_FEATURES})`);
  const featureList = root.append("div").attr("class", "featureList");
  const featureRows = featureList
    .selectAll("label")
    .data(features)
    .join("label")
    .attr("class", "featureRow")
    .attr("title", (d) => d.fullName);
  featureRows
    .append("input")
    .attr("type", "checkbox")
    .attr("value", (d) => d.key)
    .on("change", function (event, d) {
      if (!toggleFeature(d.key)) {
        (this as HTMLInputElement).checked = false;
        message.text(`You can select at most ${MAX_FEATURES} features.`);
      }
    });
  featureRows.append("span").text((d) => ` ${d.label}`);
  featureRows.append("span").attr("class", "unit").text((d) => ` (${d.unit})`);

  // ---------------------------------------------------------------- keep the panel in sync with the selection
  onSelectionChange((s: Selection) => {
    message.text("");
    (focusSelect.node() as HTMLSelectElement).value = s.focus;

    chips
      .selectAll<HTMLSpanElement, string>("span.chip")
      .data(s.compare, (d) => d)
      .join((enter) => {
        const chip = enter.append("span").attr("class", "chip");
        chip.append("span").attr("class", "chipLabel");
        chip
          .append("button")
          .attr("title", "Remove")
          .text("×")
          .on("click", (event, d) => toggleCompare(d));
        return chip;
      })
      .select(".chipLabel")
      .text((d) => byIso.get(d)?.name ?? d);

    featureRows.select("input").property("checked", (d) => s.features.includes(d.key));
    const full = s.features.length >= MAX_FEATURES;
    featureRows.classed("disabled", (d) => full && !s.features.includes(d.key));
  });
}
