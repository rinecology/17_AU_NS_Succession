# Quick Action Plan: Get Assignment Working

## TL;DR
Your app is working perfectly. The issue is **your lookup table is incomplete**—it only has 3 DEVSTAGE codes but your inventory has 11+. Fix the lookup and everything works.

---

## Step 1: Decide How to Fix (Choose One)

### Option A: Expand Lookup (Recommended) ⭐
Add missing DEVSTAGE codes to lookup for DEPHARV, LOWMGMT, THINPRE, etc.
- Time: 30-60 min (if you know the proportions)
- Coverage: 100% of inventory
- See: `LOOKUP_FIX_GUIDE.md`

### Option B: Filter Inventory
Remove rows with unmapped DEVSTAGE before upload (keep only Nat/Plant/Seed)
- Time: 5 min
- Coverage: ~85% of inventory (loses 18K ha)
- Trade-off: Quick but loses data

### Option C: Standardize Lookup Format
Convert lookup from FIM codes to simple codes
- Time: 15 min
- Coverage: 100% (once you add missing codes)
- See: Step 3 in `LOOKUP_FIX_GUIDE.md`

---

## Step 2: Prepare Updated Lookup

### For Option A (Expand):
Add new rows for each missing stratum. CSV format:
```
PLANFU,DEVSTAGE,AU_PRS,Proportion
SB1,DEPHARV,SB1_Depharv_AU1,50
SB1,DEPHARV,SB1_Depharv_AU2,50
SP1,DEPHARV,SP1_Depharv_AU1,60
SP1,DEPHARV,SP1_Depharv_AU2,40
... (one row per stratum + pathway combination)
```

**Questions to answer**:
- How should DEPHARV inventory be distributed?
- How should LOWMGMT inventory be distributed?
- How should THINPRE inventory be distributed?

### For Option C (Standardize):
Convert existing lookup to match inventory format:
```
Search & Replace in CSV:
ESTNAT → Nat
ESTPLANT → Plant  
ESTSEED → Seed

Then add missing DEVSTAGE codes as above.
```

---

## Step 3: Test in the App

### Upload & Configure:
1. Click "Choose File" for Inventory
2. Click "Choose File" for Lookup (your fixed version)
3. Click "Load Sample" (if testing first)

### Check Configuration:
- Lookup Value Column: `AU_PRS` ✓
- Lookup Proportion Column: `Proportion` ✓
- Stratum Mappings: `PLANFU → PLANFU`, `DEVSTAGE → DEVSTAGE` ✓
- **If using FIM codes**: Check "Collapse FIM DEVSTAGE" ✓
- **If using simple codes**: Leave unchecked ✗

### Run Assignment:
1. Click "Run Assignment"
2. Watch for success banner

### Review Results:
Look for in the results:
- ✅ **"X rows assigned"** (should be most of your inventory)
- ✅ **"Y ha assigned"** (should be most of your area)
- ⚠️ **"Z rows unmatched"** (should be 0 or very small)
- ⚠️ **"A lookup strata unused"** (should be 0 or very small)
- ✅ **"Deviations > 5pp"** (normal due to whole-polygon constraint)

### Check QA Report:
Download `*_AU_QA.csv`:

#### Section 1: Main QA Table
```
stratum,value,n,expected_ha,observed_ha,expected_pct,observed_pct,diff_pct
SB1 | Seed,SB1_Seed_SB1_LC1,15,45.0,42.5,45.0,42.5,-2.5
SB1 | Seed,SB1_Seed_SB1_SB1,20,55.0,52.5,55.0,52.5,-2.5
```
✅ Observed should be close to expected (±5% is OK)

#### Section 2: Unmatched Inventory
```
# inventory_strata_not_in_lookup
stratum,n,area_ha
```
✅ Should be EMPTY (or minimal)

#### Section 3: Unused Lookup
```
# lookup_strata_not_in_inventory
stratum,n_pathways,values
```
✅ Should be EMPTY (or minimal)

---

## Step 4: Download Results

### Assigned Inventory
Click "Download Inventory" → CSV with your new AU_PRS column filled in

### QA Report
Click "Download QA" → CSV showing:
- Matching accuracy
- Unmatched inventory
- Unused lookup strata

### Optional: Visualize
Click "Show Chart" to see the distribution of assignments

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Still getting 0 matches | Checkbox state wrong | Try flipping "Collapse FIM DEVSTAGE" |
| Still getting 0 matches | Column names wrong | Verify PLANFU, DEVSTAGE, AU_PRS in lookup |
| Large unmatched count | Missing DEVSTAGE codes | Add them to lookup |
| Observed % way off from expected | Polygons too large | Acceptable due to no splitting |
| Proportions don't sum to 100% | Error in lookup | Check your Proportion values |

---

## Success Criteria

Once fixed, you should see:
- ✅ 95%+ of inventory rows assigned
- ✅ All major DEVSTAGE codes used
- ✅ QA shows observed ≈ expected (within 5pp)
- ✅ No entries in "inventory_strata_not_in_lookup" section

---

## Questions?

Refer to:
- `ANALYSIS_LOOKUP_MISMATCH.md` - Why it's not matching
- `LOOKUP_FIX_GUIDE.md` - How to fix the lookup
- `APP_FEATURE_VERIFICATION.md` - How the app works (with code)
