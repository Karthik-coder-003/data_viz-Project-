import * as d3 from "d3";
import { CountryData, FeatureMeta } from "./types";

/*
 * Loading of the pre-processed data in dist/data.
 * The files are produced by preprocessing/preprocess.py from the raw World Bank and Natural Earth downloads.
 */

/** Loads the indicator metadata (labels and units). */
export async function loadFeatures(): Promise<FeatureMeta[]> {
  const response = await fetch("./data/features.json");
  if (!response.ok) throw new Error("Could not load data/features.json");
  return (await response.json()) as FeatureMeta[];
}

/**
 * Loads countries.csv: one row per country, one column per feature.
 * d3.csvParse is used instead of splitting on "," because some country names
 * contain commas (e.g. "Korea, Rep.") and are therefore quoted in the file.
 */
export async function loadCountries(features: FeatureMeta[]): Promise<CountryData[]> {
  const response = await fetch("./data/countries.csv");
  if (!response.ok) throw new Error("Could not load data/countries.csv");
  const rows = d3.csvParse(await response.text());

  return rows.map((row) => {
    const values: Record<string, number | null> = {};
    for (const f of features) {
      const raw = row[f.key];
      // An empty cell means the World Bank has no 2023 value for this country.
      values[f.key] = raw === undefined || raw === "" ? null : Number(raw);
      if (values[f.key] !== null && isNaN(values[f.key] as number)) {
        console.error(`Invalid value for ${row.name} / ${f.key}: ${raw}`);
        values[f.key] = null;
      }
    }
    return { iso3: row.iso3!, name: row.name!, values };
  });
}

/**
 * Loads the country outlines for the geospatial visualization (week 4).
 * Each feature has properties.iso3, which matches CountryData.iso3.
 * The rings already follow d3's winding order, so no @turf/rewind is needed.
 */
export async function loadWorld(): Promise<d3.ExtendedFeatureCollection> {
  const response = await fetch("./data/world.geojson");
  if (!response.ok) throw new Error("Could not load data/world.geojson");
  return (await response.json()) as d3.ExtendedFeatureCollection;
}
