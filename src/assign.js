// Area-weighted post-renewal (and similar) assignment from a stratum lookup table.
// Whole polygons are not split, so observed % can miss the target on tiny strata.

import { guessAreaUnit, toHa } from './proportions.js';

const PREFERRED_STRATA = ['PLANFU', 'DEVSTAGE', 'SGR', 'S_I', 'TREATMENT', 'YIELD'];
const VALUE_NAMES = ['AU_PRS', 'POST_RENEWAL', 'SI_AU', 'PATHWAY', 'AU'];
const PROP_NAMES = ['PROPORTION', 'PERCENT', 'FU_PRO', 'PR_PRO', 'PCT', 'SHARE', 'PRO'];
const IGNORE_STRATA = new Set([
    'objectid', 'polyid', 'fid', 'id', 'area', 'hectares', 'area_ha', 'ha',
    'shape_area', 'shape_length', 'gis_area', 'polyarea', 'proportion',
    'percent', 'fu_pro', 'pr_pro', 'pct', 'share', 'pro', 'au_prs', 'au_ns',
    'post_renewal', 'si_au', 'pathway', 'au', 'polytype'
]);

export function stripBomHeaders(rows) {
    if (!rows?.length) return rows || [];
    return rows.map(row => {
        const out = {};
        for (const [k, v] of Object.entries(row)) {
            out[String(k).replace(/^\uFEFF/, '').trim()] = v;
        }
        return out;
    });
}

export function headerList(rows) {
    return rows.length ? Object.keys(rows[0]) : [];
}

function findHeader(headers, names) {
    const lower = headers.map(h => h.toLowerCase());
    for (const name of names) {
        const i = lower.indexOf(name.toLowerCase());
        if (i >= 0) return headers[i];
    }
    return '';
}

export function detectValueColumn(headers) {
    return findHeader(headers, VALUE_NAMES);
}

export function detectProportionColumn(headers) {
    return findHeader(headers, PROP_NAMES);
}

export function detectPolytypeColumn(headers) {
    return findHeader(headers, ['POLYTYPE', 'POLY_TYPE']);
}

export function suggestStratumPairs(lookupHeaders, inventoryHeaders) {
    const luLower = lookupHeaders.map(h => h.toLowerCase());
    const invLower = inventoryHeaders.map(h => h.toLowerCase());
    const pairs = [];

    for (const name of PREFERRED_STRATA) {
        const li = luLower.indexOf(name.toLowerCase());
        const ii = invLower.indexOf(name.toLowerCase());
        if (li >= 0 && ii >= 0) {
            pairs.push({ lookup: lookupHeaders[li], inventory: inventoryHeaders[ii] });
        }
    }
    if (pairs.length) return pairs;

    for (let i = 0; i < lookupHeaders.length; i++) {
        if (IGNORE_STRATA.has(luLower[i])) continue;
        const j = invLower.indexOf(luLower[i]);
        if (j >= 0 && !IGNORE_STRATA.has(invLower[j])) {
            pairs.push({ lookup: lookupHeaders[i], inventory: inventoryHeaders[j] });
        }
    }
    return pairs;
}

export function cellKey(value, caseInsensitive) {
    const s = String(value ?? '').trim();
    return caseInsensitive ? s.toUpperCase() : s;
}

export function stratumKey(row, columns, { caseInsensitive = true } = {}) {
    return columns.map(col => {
        const v = row[col];
        return cellKey(v, caseInsensitive);
    }).join('\t');
}

export function formatStratum(values) {
    return values.map(v => (v == null || v === '' ? '(blank)' : String(v).trim())).join(' | ');
}

/**
 * Convert a list of weights to probabilities that sum to 1.
 * 45/55 (percent) and 0.45/0.55 (already proportions) are both accepted.
 */
export function normalizeProportions(values, { tol = 1e-6 } = {}) {
    const nums = values.map(v => {
        const n = Number(String(v ?? '').replace(/,/g, ''));
        return Number.isFinite(n) ? n : 0;
    });
    if (!nums.length) throw new Error('Proportions vector is empty.');
    if (nums.some(n => n < 0)) throw new Error('Proportions cannot be negative.');
    let p = nums.slice();
    const max = Math.max(...p);
    const sum = p.reduce((a, b) => a + b, 0);
    if (sum <= 0) throw new Error('Proportions must sum to a positive value.');
    if (max > 1 + tol) p = p.map(n => n / 100);
    const s = p.reduce((a, b) => a + b, 0);
    const renormalized = Math.abs(s - 1) > 0.02;
    if (Math.abs(s - 1) > tol) p = p.map(n => n / s);
    return { p, renormalized, originalSum: sum, treatedAsPercent: max > 1 + tol };
}

export function mulberry32(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function rng() {
        a += 0x6D2B79F5;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function pickBestRemaining(remaining, rng) {
    let best = remaining[0];
    const idxs = [0];
    for (let i = 1; i < remaining.length; i++) {
        if (remaining[i] > best + 1e-12) {
            best = remaining[i];
            idxs.length = 0;
            idxs.push(i);
        } else if (Math.abs(remaining[i] - best) <= 1e-12) {
            idxs.push(i);
        }
    }
    return idxs[Math.floor(rng() * idxs.length)];
}

/**
 * Build lookup groups: stratumKey → { label, pathways: [{ value, p }], renormalized }
 */
export function buildLookupGroups(lookupRows, {
    lookupStratumCols,
    valueCol,
    proportionCol,
    caseInsensitive = true
} = {}) {
    if (!lookupStratumCols?.length) throw new Error('Select at least one stratum column.');
    if (!valueCol) throw new Error('Select the lookup value column (e.g. AU_PRS).');
    if (!proportionCol) throw new Error('Select the proportion column.');

    const buckets = new Map();
    for (const row of lookupRows) {
        const key = stratumKey(row, lookupStratumCols, { caseInsensitive });
        const value = String(row[valueCol] ?? '').trim();
        if (!value) continue;
        const label = formatStratum(lookupStratumCols.map(c => row[c]));
        if (!buckets.has(key)) buckets.set(key, { label, values: new Map() });
        const g = buckets.get(key);
        const prev = g.values.get(value) || 0;
        const n = Number(String(row[proportionCol] ?? '').replace(/,/g, ''));
        g.values.set(value, prev + (Number.isFinite(n) ? n : 0));
    }

    const groups = new Map();
    const warnings = [];
    for (const [key, g] of buckets) {
        const entries = [...g.values.entries()];
        try {
            const { p, renormalized, originalSum, treatedAsPercent } = normalizeProportions(entries.map(e => e[1]));
            if (renormalized) {
                warnings.push({
                    stratum: g.label,
                    message: `Proportions summed to ${originalSum}${treatedAsPercent ? ' (treated as %)' : ''}; normalized to 100%.`
                });
            }
            groups.set(key, {
                label: g.label,
                pathways: entries.map((e, i) => ({ value: e[0], p: p[i], weight: e[1] }))
            });
        } catch (err) {
            warnings.push({ stratum: g.label, message: err.message });
        }
    }
    return { groups, warnings };
}

/**
 * Assign outCol on a copy of inventory so each stratum’s area shares match lookup proportions.
 */
export function assignPostRenewal(inventory, lookup, options = {}) {
    const {
        lookupStratumCols,
        inventoryStratumCols,
        valueCol,
        proportionCol,
        areaCol = '',
        outCol = 'AU_PRS',
        seed = 1,
        fillBlanksOnly = false,
        polytypeCol = '',
        polytypeFilter = '',
        caseInsensitive = true
    } = options;

    if (!inventoryStratumCols?.length || inventoryStratumCols.length !== lookupStratumCols.length) {
        throw new Error('Each lookup stratum column needs a matching inventory column.');
    }

    const { groups, warnings } = buildLookupGroups(lookup, {
        lookupStratumCols,
        valueCol,
        proportionCol,
        caseInsensitive
    });

    const areaUnit = areaCol
        ? guessAreaUnit(areaCol, inventory.slice(0, 40).map(r => r[areaCol]))
        : 'count';

    const rng = mulberry32(seed);
    const rows = inventory.map(r => ({ ...r }));
    if (rows.length && !(outCol in rows[0])) {
        for (const r of rows) r[outCol] = '';
    }

    const byKey = new Map();
    let skippedFilter = 0;
    let skippedFilterHa = 0;
    let skippedFilled = 0;
    let skippedFilledHa = 0;
    let unmatchedN = 0;
    let unmatchedHa = 0;
    const unmatched = new Map();

    const filterVal = polytypeFilter ? cellKey(polytypeFilter, caseInsensitive) : '';

    for (const row of rows) {
        const ha = areaCol ? toHa(row[areaCol], areaUnit) : 1;
        row._ha = ha;

        if (filterVal && polytypeCol) {
            if (cellKey(row[polytypeCol], caseInsensitive) !== filterVal) {
                skippedFilter++;
                skippedFilterHa += ha;
                continue;
            }
        }

        if (fillBlanksOnly && String(row[outCol] ?? '').trim() !== '') {
            skippedFilled++;
            skippedFilledHa += ha;
            continue;
        }

        const key = stratumKey(row, inventoryStratumCols, { caseInsensitive });
        const label = formatStratum(inventoryStratumCols.map(c => row[c]));

        if (!groups.has(key)) {
            unmatchedN++;
            unmatchedHa += ha;
            const u = unmatched.get(key) || { label, n: 0, ha: 0 };
            u.n++;
            u.ha += ha;
            unmatched.set(key, u);
            continue;
        }

        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(row);
    }

    const qa = [];
    let assignedN = 0;
    let assignedHa = 0;

    for (const [key, groupRows] of byKey) {
        const g = groups.get(key);
        const shuffled = shuffle(groupRows, rng);
        const total = shuffled.reduce((s, r) => s + r._ha, 0);
        const remaining = g.pathways.map(pw => pw.p * total);
        const gotHa = g.pathways.map(() => 0);
        const gotN = g.pathways.map(() => 0);

        for (const row of shuffled) {
            const i = pickBestRemaining(remaining, rng);
            row[outCol] = g.pathways[i].value;
            remaining[i] -= row._ha;
            gotHa[i] += row._ha;
            gotN[i] += 1;
            assignedN++;
            assignedHa += row._ha;
        }

        for (let i = 0; i < g.pathways.length; i++) {
            const expectedPct = g.pathways[i].p * 100;
            const observedPct = total > 0 ? (gotHa[i] / total) * 100 : 0;
            const diff = observedPct - expectedPct;
            qa.push({
                stratum: g.label,
                value: g.pathways[i].value,
                n: gotN[i],
                expected_ha: g.pathways[i].p * total,
                observed_ha: gotHa[i],
                expected_pct: expectedPct,
                observed_pct: observedPct,
                diff_pct: diff,
                flag: Math.abs(diff) > 5
            });
        }
    }

    qa.sort((a, b) => a.stratum.localeCompare(b.stratum) || b.expected_pct - a.expected_pct);

    for (const r of rows) delete r._ha;

    const unusedLookup = [];
    for (const [key, g] of groups) {
        if (!byKey.has(key)) {
            unusedLookup.push({
                label: g.label,
                nPathways: g.pathways.length,
                values: g.pathways.map(p => p.value).join(', ')
            });
        }
    }
    unusedLookup.sort((a, b) => a.label.localeCompare(b.label));

    return {
        rows,
        outCol,
        areaUnit: areaCol ? areaUnit : 'count',
        warnings,
        qa,
        unmatched: [...unmatched.values()].sort((a, b) => b.ha - a.ha),
        unusedLookup,
        stats: {
            assignedN,
            assignedHa,
            unmatchedN,
            unmatchedHa,
            skippedFilter,
            skippedFilterHa,
            skippedFilled,
            skippedFilledHa,
            lookupStrata: groups.size,
            usedStrata: byKey.size,
            unusedLookupN: unusedLookup.length,
            flagged: qa.filter(r => r.flag).length
        }
    };
}

export function qaToCsv(qa) {
    const header = 'stratum,value,n,expected_ha,observed_ha,expected_pct,observed_pct,diff_pct,flag';
    const lines = qa.map(r => [
        csvCell(r.stratum),
        csvCell(r.value),
        r.n,
        r.expected_ha.toFixed(4),
        r.observed_ha.toFixed(4),
        r.expected_pct.toFixed(4),
        r.observed_pct.toFixed(4),
        r.diff_pct.toFixed(4),
        r.flag ? 'Y' : ''
    ].join(','));
    return [header, ...lines].join('\n');
}

export function unmatchedToCsv(unmatched) {
    const header = 'stratum,n,area_ha';
    const lines = unmatched.map(u => [csvCell(u.label), u.n, u.ha.toFixed(4)].join(','));
    return [header, ...lines].join('\n');
}

export function unusedLookupToCsv(unusedLookup) {
    const header = 'stratum,n_pathways,values';
    const lines = unusedLookup.map(u => [csvCell(u.label), u.nPathways, csvCell(u.values)].join(','));
    return [header, ...lines].join('\n');
}

function csvCell(s) {
    const t = String(s ?? '');
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
