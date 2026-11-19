import { loadCountries, loadFeatures, loadWorld } from "./data";
import { createControls } from "./controls";
import { createHeatmap } from "./heatmap";
import { createMap } from "./map";
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
  try {
    createMap("#geoVis", await loadWorld(), countries, features); // Task 2 (week 4)
  } catch (error) {
    console.error(error);
    document.getElementById("geoVis")!.textContent = "Could not load the map. Check that dist/data contains world.geojson.";
  }
  // TODO week 5: add the clustering in #clusterVis.

  // ...then set a starting selection, which draws everything once.
  setInitialSelection({
    focus: "NLD",
    compare: ["DEU", "BEL", "FRA"],
    features: ["gdpPerCapita", "lifeExpectancy", "fertilityRate", "urbanPop"],
  });
}
