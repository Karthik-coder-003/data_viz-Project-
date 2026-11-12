import { loadCountries, loadFeatures } from "./data";
import { createControls } from "./controls";
import { createHeatmap } from "./heatmap";
import { setInitialSelection } from "./selection";
import { CountryData, FeatureMeta } from "./types";

// Note: loading the data takes a moment, so these are only filled after startUp() has awaited the files.
let features: FeatureMeta[];
let countries: CountryData[];

startUp();
async function startUp(): Promise<void> {
  try {
    features = await loadFeatures();
    countries = await loadCountries(features);
  } catch (error) {
    console.error(error);
    document.getElementById("multivariateVis")!.textContent =
      "Could not load the data. Check that dist/data contains countries.csv and features.json.";
    return;
  }
  console.log(`Loaded ${countries.length} countries and ${features.length} features`);

  // Build the visualizations first so they subscribe to selection changes...
  createControls("#controls", countries, features);
  createHeatmap("#multivariateVis", countries, features); // Task 1 (week 3)
  // TODO week 4: add the map, e.g. createMap("#geoVis", await loadWorld(), countries, features);
  // TODO week 5: add the clustering in #clusterVis.

  // ...then set a starting selection, which draws everything once.
  setInitialSelection({
    focus: "NLD",
    compare: ["DEU", "BEL", "FRA"],
    features: ["gdpPerCapita", "lifeExpectancy", "fertilityRate", "urbanPop"],
  });
}
