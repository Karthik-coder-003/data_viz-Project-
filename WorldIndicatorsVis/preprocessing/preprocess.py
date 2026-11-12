"""
Pre-processing for the KEN4224 project.

Input  (raw downloads):
  - World Bank WDI extract  (P_Data_Extract_From_World_Development_Indicators / *_Data.csv)
  - Natural Earth 1:10m admin-0 countries shapefile (ne_10m_admin_0_countries.shp/.dbf)

Output (written into the website's dist/data folder):
  - countries.csv   one row per country, one column per indicator (empty cell = no data)
  - features.json   metadata for each indicator (key, short label, full name, unit, WDI code)
  - world.geojson   simplified country outlines, property "iso3" matches countries.csv

Usage:  python3 preprocess.py <wdi_data.csv> <shapefile_without_extension> <output_dir>
Only the Python standard library is used.
"""
import csv, json, os, struct, sys

# ---------------------------------------------------------------- indicators
# key (used in code)  -> (WDI series code, short label for the UI, unit)
FEATURES = [
    ("gdp",            "NY.GDP.MKTP.CD",       "GDP",                       "current US$"),
    ("gdpPerCapita",   "NY.GDP.PCAP.CD",       "GDP per capita",            "current US$"),
    ("lifeExpectancy", "SP.DYN.LE00.IN",       "Life expectancy",           "years"),
    ("fertilityRate",  "SP.DYN.TFRT.IN",       "Fertility rate",            "births per woman"),
    ("aged65plus",     "SP.POP.65UP.TO.ZS",    "Population aged 65+",       "% of population"),
    ("urbanPop",       "SP.URB.TOTL.IN.ZS",    "Urban population",          "% of population"),
    ("popDensity",     "EN.POP.DNST",          "Population density",        "people per km²"),
    ("internetUsers",  "IT.NET.USER.ZS",       "Internet users",            "% of population"),
    ("co2PerCapita",   "EN.GHG.CO2.PC.CE.AR5", "CO₂ emissions per capita",  "t CO₂e per person"),
    ("unemployment",   "SL.UEM.TOTL.ZS",       "Unemployment",              "% of labour force"),
    ("inflation",      "FP.CPI.TOTL.ZG",       "Inflation",                 "annual %"),
    ("healthSpending", "SH.XPD.CHEX.GD.ZS",    "Health expenditure",        "% of GDP"),
    ("womenInParliament", "SG.GEN.PARL.ZS",    "Women in parliament",       "% of seats"),
    ("trade",          "NE.TRD.GNFS.ZS",       "Trade",                     "% of GDP"),
]
CODE_TO_KEY = {code: key for key, code, _, _ in FEATURES}


def read_wdi(path):
    """Long format (country x series) -> {iso3: {"name":..., key: value or None}}"""
    countries, full_names = {}, {}
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader)
        value_col = len(header) - 1  # last column is the year (2023)
        for row in reader:
            if len(row) < 5 or not row[1] or row[3] not in CODE_TO_KEY:
                continue  # skips blank rows and the "Data from database" footer
            name, iso3, series_name, code = row[0], row[1], row[2], row[3]
            raw = row[value_col].strip()
            value = None if raw in ("", "..") else float(raw)
            entry = countries.setdefault(iso3, {"name": name})
            entry[CODE_TO_KEY[code]] = value
            full_names[code] = series_name
    return countries, full_names


# ---------------------------------------------------------------- shapefile
def read_dbf(path):
    with open(path, "rb") as f:
        hdr = f.read(32)
        n = struct.unpack("<I", hdr[4:8])[0]
        hlen = struct.unpack("<H", hdr[8:10])[0]
        rlen = struct.unpack("<H", hdr[10:12])[0]
        fields = []
        while True:
            d = f.read(32)
            if d[0] == 0x0D:
                break
            fields.append((d[:11].split(b"\x00")[0].decode(), d[16]))
        f.seek(hlen)
        rows = []
        for _ in range(n):
            rec, pos, row = f.read(rlen), 1, {}
            for name, ln in fields:
                row[name] = rec[pos:pos + ln].decode("utf-8", "replace").replace("\x00", "").strip()
                pos += ln
            rows.append(row)
    return rows


def read_shp_rings(path):
    """Returns, per record, a list of rings (lists of [lon, lat])."""
    out = []
    with open(path, "rb") as f:
        f.seek(100)
        while True:
            head = f.read(8)
            if len(head) < 8:
                break
            length = struct.unpack(">i", head[4:8])[0] * 2
            content = f.read(length)
            shape_type = struct.unpack("<i", content[:4])[0]
            if shape_type == 0:
                out.append([])
                continue
            num_parts, num_points = struct.unpack("<2i", content[36:44])
            parts = list(struct.unpack(f"<{num_parts}i", content[44:44 + 4 * num_parts]))
            p0 = 44 + 4 * num_parts
            pts = struct.unpack(f"<{2 * num_points}d", content[p0:p0 + 16 * num_points])
            parts.append(num_points)
            rings = []
            for a, b in zip(parts[:-1], parts[1:]):
                rings.append([[pts[2 * i], pts[2 * i + 1]] for i in range(a, b)])
            out.append(rings)
    return out


def signed_area(ring):
    s = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        s += x1 * y2 - x2 * y1
    return s / 2  # > 0 counter-clockwise, < 0 clockwise


def douglas_peucker(points, tol):
    """Classic Douglas-Peucker line simplification (iterative)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[b]
        dx, dy = x2 - x1, y2 - y1
        norm = (dx * dx + dy * dy) ** 0.5
        best, idx = -1.0, -1
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm if norm else ((px - x1) ** 2 + (py - y1) ** 2) ** 0.5
            if d > best:
                best, idx = d, i
        if best > tol:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def simplify(ring, decimals=2, tol=0.02):
    """Simplify the outline (~2 km tolerance), round coordinates and drop repeated points."""
    if tol:
        ring = douglas_peucker(ring, tol)
    res = []
    for x, y in ring:
        p = [round(x, decimals), round(y, decimals)]
        if not res or p != res[-1]:
            res.append(p)
    if res and res[0] != res[-1]:
        res.append(res[0])
    return res


def rings_to_multipolygon(rings, min_area=0.002):
    """Shapefile convention: outer rings clockwise, holes counter-clockwise.
    d3-geo uses the same convention (clockwise exterior), so no rewind is needed.
    Tiny islands are dropped, but each country keeps at least its largest outer ring."""
    polygons, current = [], None
    outers = [r for r in rings if signed_area(r) < 0]
    largest = max(outers, key=lambda r: abs(signed_area(r))) if outers else None
    for ring in rings:
        area = signed_area(ring)
        small = abs(area) < min_area
        if area < 0:  # outer ring
            if small and ring is not largest:
                current = None
                continue
            r = simplify(ring)
            if len(r) < 4 or signed_area(r) >= 0:  # degenerated or flipped by rounding
                r = simplify(ring, 4, tol=0)
            current = [r]
            polygons.append(current)
        elif current is not None and not small:  # hole of the previous outer ring
            r = simplify(ring)
            if len(r) >= 4 and signed_area(r) > 0:
                current.append(r)
    return polygons


def main(wdi_csv, shp_base, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    countries, full_names = read_wdi(wdi_csv)

    # --- countries.csv
    keys = [k for k, _, _, _ in FEATURES]
    with open(os.path.join(out_dir, "countries.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["iso3", "name"] + keys)
        for iso3 in sorted(countries, key=lambda c: countries[c]["name"]):
            c = countries[iso3]
            w.writerow([iso3, c["name"]] + ["" if c.get(k) is None else repr(c[k]) for k in keys])

    # --- features.json
    meta = [{"key": k, "label": label, "unit": unit, "code": code, "fullName": full_names.get(code, label)}
            for k, code, label, unit in FEATURES]
    with open(os.path.join(out_dir, "features.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    # --- world.geojson
    attrs = read_dbf(shp_base + ".dbf")
    shapes = read_shp_rings(shp_base + ".shp")
    features, matched = [], set()
    for a, rings in zip(attrs, shapes):
        # The World Bank code (WB_A3) matches the WDI "Country Code" best; fall back to ISO / ADM0 codes.
        candidates = [a.get("WB_A3"), a.get("ISO_A3_EH"), a.get("ISO_A3"), a.get("ADM0_A3")]
        if a.get("ADM0_A3") == "KOS":
            candidates.insert(0, "XKX")  # Kosovo uses XKX at the World Bank
        iso3 = next((c for c in candidates if c in countries), None)
        if iso3 is None:
            iso3 = next((c for c in candidates if c and c != "-99"), a.get("ADM0_A3"))
        else:
            if iso3 in matched:  # e.g. a separate overseas part with the same code: merge it
                pass
            matched.add(iso3)
        polys = rings_to_multipolygon(rings)
        if not polys:
            continue
        features.append({
            "type": "Feature",
            "properties": {"iso3": iso3, "name": a.get("ADMIN"), "hasData": iso3 in countries},
            "geometry": {"type": "MultiPolygon", "coordinates": polys},
        })
    with open(os.path.join(out_dir, "world.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

    # --- report
    print(f"countries in WDI: {len(countries)}")
    for k in keys:
        missing = sum(1 for c in countries.values() if c.get(k) is None)
        print(f"  {k:18s} missing {missing:3d}")
    unmatched = sorted(set(countries) - matched)
    print(f"WDI countries without a shape ({len(unmatched)}):",
          ", ".join(f"{c} ({countries[c]['name']})" for c in unmatched))
    print(f"shapes written: {len(features)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
