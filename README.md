# Quetta Valley Through NISAR

An interactive map exploring **relative radar line-of-sight (LOS) change** across the Quetta Valley using provisional NISAR L-band observations from 20 June to 18 October 2026.

The dashboard lets you step through the observation dates, animate the sequence, and inspect a local time series by selecting a point on the map.

> **Important:** This is an exploratory analysis of provisional data. The displayed values are relative LOS changes, not confirmed vertical subsidence or uplift. The sign convention has not been independently confirmed, and the apparent signal is comparable to the estimated 2–3 cm noise level.

## Open the dashboard

If GitHub Pages is enabled for this repository, open the published site from the repository's **About** section. Otherwise, run it locally using the steps below.

## Run locally

The dashboard loads JSON and image assets with browser `fetch()`, so open it through a local web server rather than double-clicking `index.html`.

1. Clone or download this repository.
2. Open a terminal in the project folder.
3. Start a local server:

   ```bash
   python -m http.server 8000
   ```

4. Visit [http://localhost:8000](http://localhost:8000).

The page loads MapLibre GL JS and Chart.js from their public CDNs, and uses an Esri basemap. An internet connection is required for those external assets and map tiles.

## Using the map

- Move the date slider to inspect each acquisition date.
- Press **Play** to animate the sequence.
- Use the map navigation controls to zoom and pan.
- Click inside the dashed study-area boundary to inspect a point.
- The time-series chart averages up to nine nearby grid cells, using cells valid on the final date so the same locations are compared through time.
- Open **About this map** for the processing summary and limitations.

## Study area and observations

| Item | Description |
|---|---|
| Study area | Quetta Valley, Pakistan |
| Geographic bounds | 66.8–67.2° E, 30.0–30.35° N |
| Product | NISAR L2 GUNW, Provisional |
| Track / frame | Track 92 / Frame 73 |
| Acquisition geometry | Descending |
| Radar | L-band, HH |
| Observation period | 20 June–18 October 2026 |
| Interferogram pairs | 9 chained pairs |
| Pair spacing | Mostly 12 days, with one 24-day gap |
| Display grid | 160 × 160 cells |
| Display units | Centimeters (cm), relative LOS change |

## Processing overview

The dashboard data were prepared from nine consecutive interferogram pairs:

1. Mask pixels with coherence at or below 0.5, and pixels outside the connected unwrapped component.
2. Subtract the estimated ionospheric phase screen.
3. For each pair, subtract the median phase change over valid pixels in the Quetta study region.
4. Convert phase from radians to centimeters using approximately 1.941 cm/radian.
5. Chain the pair-wise changes to form the displayed time sequence.

Each pair is referenced to its own regional median. **This is not an independently surveyed or validated stable ground reference point.** An exploratory low-variability pixel search produced fragmented candidate regions, so no individual stable reference area is claimed.

## Understanding the values

The map displays cumulative **relative line-of-sight (LOS) change** since 20 June 2026. LOS is the radar satellite's viewing direction; it is not the same as vertical movement.

- Positive and negative values indicate opposite directions of relative LOS change.
- The direction toward or away from the satellite has not yet been confirmed for this processing.
- The first date is zero by definition because it is the start of the chained time series.
- Masked cells have no displayed reliable value.
- Small differences should be interpreted cautiously because the estimated noise in apparently stable areas is about 2–3 cm.

The map is intended to highlight patterns for further investigation. It does **not** establish that a location is sinking, rising, or undergoing a specific geological process.

## Data and limitations

- The source product is marked **Provisional** and is not fully validated.
- Estimated noise in apparently stable areas is approximately 2–3 cm.
- Tropospheric and solid-Earth-tide corrections have **not** been applied.
- Every pair uses a regional-median reference, not a confirmed stable point.
- Only one descending track is used, so the result is LOS-only and cannot independently resolve vertical and horizontal motion.
- Approximately 57% of pixels remain valid on the final date.
- The observation period is about four months; it is too short to establish a long-term trend.
- The candidate signal should not be treated as proof of ground deformation without independent validation and further analysis.

## Dashboard data files

- `data/meta.json` — dates, map bounds, frame paths, display range, grid dimensions, and processing notes.
- `data/cube.json` — per-date values in centimeters for the interactive point time series.
- `data/frames/` — map overlay images, one for each date.
- `index.html`, `style.css`, `app.js` — dashboard structure, styling, and interactions.

The exported grid is 160 × 160. Its rows run from north to south and columns from west to east. Masked values in the time-series cube are represented as `null`.

## Acknowledgements

NISAR is a joint mission of NASA and the Indian Space Research Organisation (ISRO). The provisional L2 GUNW data used for this exploration were obtained through the ASF DAAC.

---

This project is an exploratory visualization and should not be used as a substitute for validated geodetic measurements or official hazard information.
