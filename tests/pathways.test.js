import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePathways, filterPathways } from '../src/proportions.js';
import { collectRows, catalogUniques, formatBytes } from '../src/csv-stream.js';
import { colorForUnit, UNKNOWN_COLOR } from '../src/unit-colors.js';

const rows = [
    { AU_NS: 'BW1_PO1', HECTARES: 10 },
    { AU_NS: 'BW1_MH2', HECTARES: 30 },
    { AU_NS: 'SB1_LC1', HECTARES: 20 },
    { AU_NS: 'SB1_SB1', HECTARES: 80 }
];

function full() {
    return computePathways(rows, { auColumn: 'AU_NS', areaColumn: 'HECTARES', delimiter: '_', units: ['BW1', 'PO1', 'MH2', 'SB1', 'LC1'] });
}

test('computePathways proportions are within each from unit', () => {
    const r = full();
    const bw = r.transitions.filter(t => t.from === 'BW1');
    const sb = r.transitions.filter(t => t.from === 'SB1');
    assert.equal(r.fromUnits.join(','), 'BW1,SB1');
    assert.equal(Math.round(bw.find(t => t.to === 'MH2').proportion * 100), 75);
    assert.equal(Math.round(sb.find(t => t.to === 'SB1').proportion * 100), 80);
});

test('filterPathways hides units and leaves remaining within-from percents', () => {
    const r = filterPathways(full(), ['SB1']);
    assert.deepEqual(r.fromUnits, ['SB1']);
    assert.equal(r.nFrom, 1);
    assert.ok(r.transitions.every(t => t.from === 'SB1'));
    assert.equal(Math.round(r.transitions.find(t => t.to === 'SB1').proportion * 100), 80);
    assert.equal(r.totalHa, 100);
});

test('filterPathways none selected yields empty chart data', () => {
    const r = filterPathways(full(), []);
    assert.equal(r.nFrom, 0);
    assert.equal(r.transitions.length, 0);
    assert.equal(r.parsed, 0);
});

test('colorForUnit is stable and case-insensitive', () => {
    assert.equal(colorForUnit('SB1'), colorForUnit('sb1'));
    assert.equal(colorForUnit('BW1'), '#882255');
    assert.equal(colorForUnit('UnknownX'), UNKNOWN_COLOR);
    assert.equal(colorForUnit('unknownx'), UNKNOWN_COLOR);
    assert.notEqual(colorForUnit('SB1'), colorForUnit('BW1'));
    assert.notEqual(colorForUnit('XX'), colorForUnit('SB1'));
});

test('formatBytes', () => {
    assert.equal(formatBytes(512), '512 B');
    assert.ok(formatBytes(200 * 1024 * 1024).includes('MB'));
});

test('catalogUniques and collectRows stream a CSV string', async () => {
    const csv = 'PLANFU,DEVSTAGE,HA\nSB1,Seed,10\nSB1,Nat,5\nBW1,Nat,8\n';
    const cat = await catalogUniques(csv, ['PLANFU']);
    assert.deepEqual(cat.values.PLANFU, ['BW1', 'SB1']);
    const kept = await collectRows(csv, {
        filterRow: (row) => String(row.PLANFU) === 'SB1'
    });
    assert.equal(kept.rows.length, 2);
    assert.equal(kept.aborted, false);
});
