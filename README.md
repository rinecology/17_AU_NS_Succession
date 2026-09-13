# Natural succession pathways

**Ontario Ministry of Natural Resources** — prototype (v0.1)

Reads an inventory CSV that **already has** an analysis-unit / succession code (for example `AU_NS` or `yFU_NatSucn_AU` from the Forest Unit Analysis classifier) and turns it into:

- from → to area and **within-from proportions**
- Sankey flow
- heatmap (% of current unit)
- downloadable pathway CSV

This app does **not** assign forest units and does **not** compare natural vs post-renewal (SGR) succession. Assignment stays in [13_sfu_js_shiny](../13_sfu_js_shiny). Post-harvest EST/SGR stays in [5_SPA_AR_FTG](../5_SPA_AR_FTG).

## Quick start

```bash
cd /home/skynet-sis/sis-projects/17_AU_NS_Succession
npm install
npm run dev      # http://localhost:5174
npm run build    # refreshes dist/
```

Analysts after build:

```bash
cd dist
python3 -m http.server 8000
```

Use **Load sample** for a tiny NER-style `BW1_PO1` file.

## Input

| Column | Role |
|---|---|
| AU / pathway code | e.g. `AU_NS`, `yFU_NatSucn_AU` — `BW1_PO1` means current BW1, successor PO1 |
| Area | `HECTARES`, `AREA`, or `Shape_Area` (m² → ha). Optional: record counts if empty |
| Or two columns | Current unit + successor, if the team already split the code |

**Known unit list** defaults to NER Boreal codes from the NatSucn dict. Edit it for other FMUs so `UPCE_UPCE` and `UDF_Succ` parse instead of splitting on the first underscore blindly.

Delimiter: `_` (default), `-`, or auto.

Proportions sum to 100% **within each current unit** (all rows that start as BW1).

## Pipeline

```text
Forest Unit Analysis (SQL → yFU_* / AU_NS)
        ↓ CSV
This app (decode codes → proportions + charts)
```

## Stack

Vite, vanilla JS, Papa Parse, Plotly.js. Browser only; inventory does not leave the machine.
