# World Development Indicators – Interactive Visualization

An interactive web page for comparing countries on World Bank development indicators (2023).
Pick one country, choose up to 9 others to compare it with and up to 5 indicators. A heatmap (Task 1) shows how they stand next to each other, and a world map (Task 2) shows how each indicator is spread over all countries, with your selection outlined.

Built with **TypeScript** and **D3.js** for the course *Data Visualization (KEN4224)*, Maastricht University.

![Screenshot of the heatmap comparing the Netherlands with five countries](docs/screenshot.png)

---

## Quick start

You need **[Node.js](https://nodejs.org/en/download) version 22.15 or newer**; the current LTS version works. Check with:

```bash
node -v
```

Then:

```bash
git clone <your-repository-url>
cd <repository-folder>
npm install        # first time only: downloads D3, TypeScript and webpack
npm run start      # starts the page at http://localhost:8080
```

Your browser opens the page automatically. If it doesn't, go to **http://localhost:8080** yourself.

To stop the program, click in the terminal and press **Ctrl + C**.

> **Tip:** Use Ctrl + C, not Ctrl + Z. Ctrl + Z only pauses the server: it keeps port 8080 busy, and the next `npm run start` won't work until you close that terminal.

---

## How to use it

### Task 1 – the heatmap

| What you do | What happens |
|---|---|
| Choose a country in **Selected country** | It becomes the main country: pinned as the top row with a red outline |
| Type a name in **Compare with** and press Enter | That country is added as a row (max 9) |
| Click **×** on a country chip | That row is removed |
| Tick a box under **Features** | That indicator is added as a column (max 5, in the order you tick them) |
| Click a **country name** in the heatmap | That country becomes the selected country |
| Click a **column title** | Rows are sorted by that column: high → low, low → high, then back to normal. The selected country stays on top |
| Hover over a **cell** | A tooltip shows the exact value, the unit and the country's rank among all countries |

### Task 2 – the map

| What you do | What happens |
|---|---|
| Pick a feature in the **Feature** dropdown above the map | The map is coloured by that feature. The dropdown lists the features ticked for Task 1 |
| Click a country on the map | It is added to (or removed from) the comparison, so it gets a row in the heatmap |
| **Shift + click** a country | It becomes the selected country |
| Hover over a country | A tooltip shows the value, the unit, the rank and the colour class |
| Scroll / drag on the map | Zoom and pan |
| **Zoom to selection** / **Reset** | Zooms to the selected and compared countries / shows the whole world again |

**Reading the map:** one blue, darker = higher. The countries are split into 5 equal groups (quintiles) per feature, so each shade holds about 20% of the countries; the legend under the map shows the value range of each shade. The selected country has a **red** outline and the compared countries an **amber** outline; very small countries also get a ring of that colour. Grey hatched = no 2023 value; plain light grey = not in the World Bank dataset.

### Reading the heatmap

**Reading the colours:** each column is coloured on its own. Light means the country is near the **lowest** of all 217 countries for that indicator; dark means near the **highest**. The number in each cell is always the real value. A grey striped cell with "–" means the World Bank has no 2023 value for that country.

---

## The data

| | |
|---|---|
| **Indicators** | World Bank, [World Development Indicators](https://databank.worldbank.org/source/world-development-indicators), 2023 values, licence CC BY 4.0 |
| **Country outlines** | [Natural Earth](https://www.naturalearthdata.com/), 1:10m Admin 0 – Countries v5.1.1, public domain |
| **Coverage** | 217 countries × 14 indicators |

The 14 indicators: GDP, GDP per capita, life expectancy, fertility rate, population aged 65+, urban population, population density, internet users, CO₂ emissions per capita, unemployment, inflation, health expenditure, women in parliament and trade.

Missing values are kept as missing; they are never replaced with 0. Number of countries without a 2023 value:

| Indicator | Missing | Indicator | Missing |
|---|---|---|---|
| GDP | 13 | CO₂ per capita | 14 |
| GDP per capita | 13 | Unemployment | 33 |
| Life expectancy | 0 | Inflation | 40 |
| Fertility rate | 0 | Health expenditure | 25 |
| Population 65+ | 0 | Women in parliament | 31 |
| Urban population | 0 | Trade | 41 |
| Population density | 2 | Internet users | 36 |

The cleaned files are already included in `dist/data/`, so you don't need to download anything to run the project.

### Re-creating the data files (optional)

`preprocessing/preprocess.py` turns the raw downloads into the files in `dist/data/`. It uses only the Python standard library (Python 3.8+).

```bash
python3 preprocessing/preprocess.py \
    <path/to/WDI_extract_Data.csv> \
    <path/to/ne_10m_admin_0_countries> \
    dist/data
```

The second argument is the shapefile path **without** the `.shp` extension. The script:

- converts the WDI extract from one row per country per indicator to one row per country
- matches every country to its outline using the World Bank code (`WB_A3`), with ISO codes as a fallback; all 217 countries match
- simplifies the outlines (Douglas–Peucker, about 2 km tolerance), shrinking the map file from 8.8 MB to 1.7 MB. The ring order already suits D3, so `@turf/rewind` isn't needed

---

## Project structure

```
├── dist/                    everything the browser loads
│   ├── index.html           page layout
│   ├── style.css            styling
│   └── data/
│       ├── countries.csv    217 countries × 14 indicators (empty cell = no data)
│       ├── features.json    label, unit and World Bank code of each indicator
│       └── world.geojson    country outlines (for the map)
├── src/                     TypeScript source code
│   ├── index.ts             start-up: loads the data and builds the page
│   ├── data.ts              loads the files in dist/data
│   ├── selection.ts         shared selection state (selected country, compared countries, features)
│   ├── controls.ts          selection panel on the left
│   ├── heatmap.ts           Task 1: the heatmap
│   ├── map.ts               Task 2: the choropleth world map
│   ├── tooltip.ts           tooltip helper
│   ├── format.ts            number formatting
│   ├── types.ts             TypeScript types
│   ├── barChart.ts          example chart from the course template (not used)
│   └── kmeansClustering.ts  k-means from the course template (for the clustering view)
├── preprocessing/
│   └── preprocess.py        builds dist/data from the raw downloads
├── docs/screenshot.png
├── package.json             dependencies and npm scripts
├── tsconfig.json            TypeScript settings
└── webpack.config.js        bundling settings
```

### How the views are linked

All views share one selection, defined in `src/selection.ts`. Each view registers once with `onSelectionChange(...)` and redraws whenever the selection changes. Changing the selection anywhere, in the panel or by clicking in a chart, updates every view.

To add a new view, write a function that calls `onSelectionChange(s => { ... })` and draws from `s.focus`, `s.compare` and `s.features`, then call it in `src/index.ts`. `heatmap.ts` and `map.ts` are complete examples.

---

## Available commands

| Command | What it does |
|---|---|
| `npm install` | Installs the dependencies (run once, and again after `package.json` changes) |
| `npm run start` | Starts a local server at http://localhost:8080 that rebuilds and reloads when you save a file |
| `npm run build` | Builds `dist/bundle.js` once. After that, `dist/` can be served by any static web server |

To host the built page (for example on GitHub Pages), run `npm run build` and publish the `dist/` folder. Opening `dist/index.html` straight from your file system won't work, because browsers block loading the data files that way. Serve it with a web server instead.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Unsupported engine` warning or the server won't start | Your Node.js is too old. Install version 22.15 or newer from nodejs.org, open a new terminal and run `npm install` again |
| `npm: command not found` | Node.js isn't installed or the terminal was opened before installing it. Install Node.js, then open a new terminal |
| `Port 8080 is already in use` / the page doesn't open | An earlier server is still running. Close that terminal (or press Ctrl + C in it), then run `npm run start` again. Or check the terminal output: webpack may say it's running on another port such as 8081 |
| The page is empty and says *"Could not load the data"* (or the map says *"Could not load the map"*) | Check that `dist/data/` contains `countries.csv`, `features.json` and `world.geojson`, and that you opened the page through `npm run start`, not by double-clicking `index.html` |
| The browser shows *"Not secure"* | Normal for `http://localhost`. The page runs only on your own computer |
| Errors after pulling new changes | Run `npm install` again |
| Something else | Open the browser's developer tools (F12) and look at the **Console** tab for error messages |

---

## Credits

- Course code template: *Data Visualization (KEN4224)*, Maastricht University. `barChart.ts`, `tooltip.ts` and `kmeansClustering.ts` come from the template; `tooltip.ts` was extended with an HTML tooltip.
- `map.ts` is our own code. It uses D3's `geoNaturalEarth1` projection, `geoPath`, `scaleQuantile` and `zoom` as described in the [d3-geo](https://d3js.org/d3-geo) and [d3-zoom](https://d3js.org/d3-zoom) documentation; the colours, hatch pattern and tooltip style are reused from `heatmap.ts` so both views look the same.
- [D3.js](https://d3js.org/) by Mike Bostock and contributors (ISC licence).
- Data: World Bank (CC BY 4.0) and Natural Earth (public domain).
