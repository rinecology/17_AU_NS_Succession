# Succession pathways

**Ontario Ministry of Natural Resources** — prototype (v0.2)

Two tasks in one browser app:

1. **Chart pathways** — decode an existing AU column (`AU_NS`, `AU_PRS`, `yFU_NatSucn_AU`, …) into from → to area, Sankey, and heatmap.
2. **Assign post-renewal** — join a lookup table of stratum proportions onto an inventory and write a user-named column (typically `AU_PRS`) so **area** shares match the lookup.

Natural-succession **SQL assignment** still lives in [13_sfu_js_shiny](../13_sfu_js_shiny). Building SGR/EST proportion tables still lives in [5_SPA_AR_FTG](../5_SPA_AR_FTG). This app **applies** a PRS lookup and **charts** either column.

Polygons are not split. Observed % can miss the lookup on small strata or when one polygon is larger than a target share.

## Quick start

```bash
cd /home/skynet-sis/sis-projects/17_AU_NS_Succession
npm install
npm run dev      # http://localhost:5174
npm test         # assigner + code-parse checks
npm run build    # refreshes dist/
```

Analysts after build:

```bash
cd dist
python3 -m http.server 8000
```

**Chart:** **Load sample** for a tiny NER-style `BW1_PO1` file.  
**Assign:** **Load sample** for a Hearst-style `PLANFU` + `DEVSTAGE` lookup (SB1 Seed = 45 / 55).

## Chart input

| Column | Role |
|---|---|
| AU / pathway code | e.g. `AU_NS`, `AU_PRS` — `BW1_PO1` or `SB1_Seed_SB1_LC1` (first token → last token) |
| Area | `HECTARES`, `AREA_HA`, `HA`, or `Shape_Area` (m² → ha). Optional: record counts if empty |
| Or two columns | Current unit + successor, if the team already split the code |

**Known unit list** defaults to NER Boreal codes. Edit it for other FMUs so `UPCE_UPCE` and `UDF_Succ` parse instead of splitting on the first underscore blindly.

Delimiter: `_` (default), `-`, or auto. Proportions sum to 100% **within each current unit**.

## Assign input

| File | Role |
|---|---|
| Lookup CSV | Stratum keys + value + proportion (e.g. `PLANFU`, `DEVSTAGE`, `AU_PRS`, `Proportion`) |
| Inventory CSV | Same stratum keys, plus area (`AREA_HA` / `HA` / `Shape_Area`) |

The UI maps lookup columns to inventory columns. Optional: keep `POLYTYPE = FOR`, case-insensitive match (`NAT` = `Nat`), collapse FIM `DEVSTAGE` to Nat / Plant / Seed, fill blanks only, random seed.

Excel lookups must be saved as **CSV UTF-8** first.

## Pipeline

```text
Forest Unit Analysis (SQL → yFU_* / AU_NS)
        ↓
This app, Chart — decode AU_NS → Sankey / heatmap

Lookup table (PLANFU + DEVSTAGE + % )
        + inventory CSV
        ↓
This app, Assign — write AU_PRS by area
        ↓
This app, Chart — decode AU_PRS → Sankey / heatmap
```

## Stack

Vite, vanilla JS, Papa Parse, Plotly.js. Browser only; inventory does not leave the machine.
