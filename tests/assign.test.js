import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeProportions,
    stratumKey,
    assignPostRenewal,
    suggestStratumPairs,
    detectValueColumn,
    detectProportionColumn
} from '../src/assign.js';
import { parseCode } from '../src/parse.js';

test('normalizeProportions accepts percent and unit interval', () => {
    const a = normalizeProportions([45, 55]);
    assert.deepEqual(a.p.map(n => Number(n.toFixed(6))), [0.45, 0.55]);
    assert.equal(a.treatedAsPercent, true);
    assert.equal(a.renormalized, false);

    const b = normalizeProportions([0.45, 0.55]);
    assert.deepEqual(b.p.map(n => Number(n.toFixed(6))), [0.45, 0.55]);
    assert.equal(b.treatedAsPercent, false);

    const c = normalizeProportions([40, 50]);
    assert.ok(c.renormalized);
    assert.equal(Number(c.p.reduce((s, n) => s + n, 0).toFixed(6)), 1);
});

test('stratumKey is case-insensitive', () => {
    const row = { PLANFU: 'sb1', DEVSTAGE: 'seed' };
    assert.equal(
        stratumKey(row, ['PLANFU', 'DEVSTAGE'], { caseInsensitive: true }),
        'SB1\tSEED'
    );
    const lookup = { PLANFU: 'SB1', DEVSTAGE: 'Seed' };
    assert.equal(
        stratumKey(lookup, ['PLANFU', 'DEVSTAGE'], { caseInsensitive: true }),
        'SB1\tSEED'
    );
});

test('parseCode keeps two-part NS codes and splits four-part PRS codes', () => {
    assert.deepEqual(parseCode('BW1_PO1').from, 'BW1');
    assert.deepEqual(parseCode('BW1_PO1').to, 'PO1');
    assert.equal(parseCode('UDF_Succ').to, 'Succ');
    const prs = parseCode('SB1_Seed_SB1_LC1');
    assert.equal(prs.from, 'SB1');
    assert.equal(prs.to, 'LC1');
    assert.equal(parseCode('MH2_Plant_PO1_PO1').to, 'PO1');
    assert.equal(parseCode('NOT_A_CODE').parsed, false);
});

test('column detection prefers AU_PRS and Proportion', () => {
    const h = ['PLANFU', 'DEVSTAGE', 'AU_PRS', 'Proportion', 'HA'];
    assert.equal(detectValueColumn(h), 'AU_PRS');
    assert.equal(detectProportionColumn(h), 'Proportion');
    const pairs = suggestStratumPairs(h, ['PLANFU', 'DEVSTAGE', 'AREA_HA']);
    assert.deepEqual(pairs, [
        { lookup: 'PLANFU', inventory: 'PLANFU' },
        { lookup: 'DEVSTAGE', inventory: 'DEVSTAGE' }
    ]);
});

function lookupSb1() {
    return [
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', AU_PRS: 'SB1_Seed_SB1_LC1', Proportion: 45 },
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', AU_PRS: 'SB1_Seed_SB1_SB1', Proportion: 55 },
        { PLANFU: 'SB1', DEVSTAGE: 'Nat', AU_PRS: 'SB1_Nat_SB1_SB1', Proportion: 85 },
        { PLANFU: 'SB1', DEVSTAGE: 'Nat', AU_PRS: 'SB1_Nat_SB1_LC1', Proportion: 15 }
    ];
}

test('area-weighted assignment hits 45/55 on equal-sized polygons', () => {
    const inv = [];
    for (let i = 0; i < 20; i++) {
        inv.push({ PLANFU: 'SB1', DEVSTAGE: 'Seed', AREA_HA: 5, POLYTYPE: 'FOR', POLYID: String(i) });
    }
    const result = assignPostRenewal(inv, lookupSb1(), {
        lookupStratumCols: ['PLANFU', 'DEVSTAGE'],
        inventoryStratumCols: ['PLANFU', 'DEVSTAGE'],
        valueCol: 'AU_PRS',
        proportionCol: 'Proportion',
        areaCol: 'AREA_HA',
        outCol: 'AU_PRS',
        seed: 1,
        polytypeCol: 'POLYTYPE',
        polytypeFilter: 'FOR'
    });
    const byVal = {};
    for (const row of result.rows) {
        byVal[row.AU_PRS] = (byVal[row.AU_PRS] || 0) + Number(row.AREA_HA);
    }
    assert.equal(byVal['SB1_Seed_SB1_LC1'], 45);
    assert.equal(byVal['SB1_Seed_SB1_SB1'], 55);
    assert.equal(result.stats.assignedN, 20);
    assert.equal(result.stats.flagged, 0);
});

test('same seed is reproducible; POLYTYPE filter skips WAT', () => {
    const inv = [
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', AREA_HA: 10, POLYTYPE: 'FOR' },
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', AREA_HA: 20, POLYTYPE: 'FOR' },
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', AREA_HA: 70, POLYTYPE: 'FOR' },
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', AREA_HA: 999, POLYTYPE: 'WAT' }
    ];
    const opts = {
        lookupStratumCols: ['PLANFU', 'DEVSTAGE'],
        inventoryStratumCols: ['PLANFU', 'DEVSTAGE'],
        valueCol: 'AU_PRS',
        proportionCol: 'Proportion',
        areaCol: 'AREA_HA',
        outCol: 'AU_PRS',
        seed: 7,
        polytypeCol: 'POLYTYPE',
        polytypeFilter: 'FOR'
    };
    const a = assignPostRenewal(inv, lookupSb1(), opts);
    const b = assignPostRenewal(inv, lookupSb1(), opts);
    assert.deepEqual(a.rows.map(r => r.AU_PRS), b.rows.map(r => r.AU_PRS));
    assert.equal(a.rows[3].AU_PRS, '');
    assert.equal(a.stats.skippedFilter, 1);
});

test('unmatched strata stay blank (NEWSEED does not match Seed)', () => {
    const inv = [
        { PLANFU: 'SB1', DEVSTAGE: 'NEWSEED', AREA_HA: 40, POLYTYPE: 'FOR' },
        { PLANFU: 'SB1', DEVSTAGE: 'NEWSEED', AREA_HA: 60, POLYTYPE: 'FOR' },
        { PLANFU: 'PJ1', DEVSTAGE: 'Nat', AREA_HA: 8, POLYTYPE: 'FOR' }
    ];
    const base = {
        lookupStratumCols: ['PLANFU', 'DEVSTAGE'],
        inventoryStratumCols: ['PLANFU', 'DEVSTAGE'],
        valueCol: 'AU_PRS',
        proportionCol: 'Proportion',
        areaCol: 'AREA_HA',
        outCol: 'AU_PRS',
        seed: 1,
        polytypeFilter: ''
    };
    const result = assignPostRenewal(inv, lookupSb1(), base);
    // NEWSEED does not match Seed (no collapse), and PJ1 not in lookup
    assert.equal(result.rows[0].AU_PRS, '');
    assert.equal(result.rows[1].AU_PRS, '');
    assert.equal(result.rows[2].AU_PRS, '');
    assert.equal(result.stats.unmatchedN, 3);
});

test('sample lookup + inventory: SB1 Seed area is 45/55 after POLYTYPE filter', async () => {
    const { readFileSync } = await import('node:fs');
    const Papa = (await import('papaparse')).default;
    const inv = Papa.parse(readFileSync('public/sample_au_prs_inventory.csv', 'utf8'), { header: true, skipEmptyLines: true }).data;
    const lu = Papa.parse(readFileSync('public/sample_au_prs_lookup.csv', 'utf8'), { header: true, skipEmptyLines: true }).data;
    const result = assignPostRenewal(inv, lu, {
        lookupStratumCols: ['PLANFU', 'DEVSTAGE'],
        inventoryStratumCols: ['PLANFU', 'DEVSTAGE'],
        valueCol: 'AU_PRS',
        proportionCol: 'Proportion',
        areaCol: 'AREA_HA',
        outCol: 'AU_PRS',
        seed: 1,
        polytypeCol: 'POLYTYPE',
        polytypeFilter: 'FOR'
    });
    const seed = result.qa.filter(r => r.stratum === 'SB1 | Seed');
    const byVal = Object.fromEntries(seed.map(r => [r.value, r.observed_ha]));
    assert.equal(byVal['SB1_Seed_SB1_LC1'] + byVal['SB1_Seed_SB1_SB1'], 106);
    const pct = seed.find(r => r.value === 'SB1_Seed_SB1_LC1').observed_pct;
    assert.ok(Math.abs(pct - 45) < 10, `LC1 observed ${pct}`);
    assert.ok(result.rows.some(r => r.POLYTYPE === 'WAT' && !r.AU_PRS));
    assert.ok(result.unmatched.some(u => u.label.includes('PJ1')));
    assert.ok(result.unusedLookup.some(u => u.label === 'LC1 | Seed'));
    assert.equal(result.stats.unusedLookupN, 1);
});

test('Shape_Area is converted from m² to ha', () => {
    const inv = [
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', Shape_Area: 450000 },
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', Shape_Area: 550000 }
    ];
    const result = assignPostRenewal(inv, lookupSb1(), {
        lookupStratumCols: ['PLANFU', 'DEVSTAGE'],
        inventoryStratumCols: ['PLANFU', 'DEVSTAGE'],
        valueCol: 'AU_PRS',
        proportionCol: 'Proportion',
        areaCol: 'Shape_Area',
        outCol: 'AU_PRS',
        seed: 1
    });
    assert.equal(result.areaUnit, 'm2');
    assert.equal(Math.round(result.stats.assignedHa), 100);
});

test('fillBlanksOnly leaves existing AU_PRS values', () => {
    const inv = [
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', AREA_HA: 45, AU_PRS: 'KEEP' },
        { PLANFU: 'SB1', DEVSTAGE: 'Seed', AREA_HA: 55, AU_PRS: '' }
    ];
    const result = assignPostRenewal(inv, lookupSb1(), {
        lookupStratumCols: ['PLANFU', 'DEVSTAGE'],
        inventoryStratumCols: ['PLANFU', 'DEVSTAGE'],
        valueCol: 'AU_PRS',
        proportionCol: 'Proportion',
        areaCol: 'AREA_HA',
        outCol: 'AU_PRS',
        fillBlanksOnly: true,
        seed: 1
    });
    assert.equal(result.rows[0].AU_PRS, 'KEEP');
    assert.ok(result.rows[1].AU_PRS);
    assert.equal(result.stats.skippedFilled, 1);
});
