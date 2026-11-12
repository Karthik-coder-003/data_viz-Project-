/** One country (spatial area) with all its indicator values. null = no data for 2023. */
export interface CountryData {
  iso3: string; // World Bank / ISO 3-letter code, also used to match the map shapes
  name: string;
  values: Record<string, number | null>; // key = FeatureMeta.key
}

/** Description of one indicator (feature), loaded from data/features.json */
export interface FeatureMeta {
  key: string;      // name used in the code, e.g. "gdpPerCapita"
  label: string;    // short label for the UI, e.g. "GDP per capita"
  unit: string;     // e.g. "current US$"
  code: string;     // World Bank series code, e.g. "NY.GDP.PCAP.CD"
  fullName: string; // full World Bank series name
}

/** The current user selection, shared between all visualizations (Task 1, 2 and 3). */
export interface Selection {
  focus: string;      // iso3 of the selected country that the others are compared to
  compare: string[];  // iso3 codes of the countries it is compared to (max MAX_COMPARE)
  features: string[]; // feature keys (max MAX_FEATURES)
}

export interface LabeledValue {
  label: string;
  value: number;
}

/**
 * Original data structure of the template's example dataset (postcodes).
 * Only still used by kmeansClustering.ts, which will be adapted to CountryData in week 5.
 */
export interface DataInterface {
  postCode: number;
  inhabitants: number;
  maleInhabitants: number;
  femaleInhabitants: number;
}
