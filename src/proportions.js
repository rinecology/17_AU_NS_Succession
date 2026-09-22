import { parseCode } from './parse.js';
import { streamCsv } from './csv-stream.js';

export function toHa(value, unit) {
    const n = Number(String(value ?? '').replace(/,/g, ''));
    if (!Number.isFinite(n)) return 0;
    if (unit === 'm2') return n / 10000;
    return n;
}

export function guessAreaUnit(columnName, sampleValues) {
    if (/m2|shape_area|poly_area/i.test(columnName || '')) return 'm2';
    const nums = (sampleValues || []).map(Number).filter(n => Number.isFinite(n) && n > 0);
    if (nums.length && nums.every(n => n > 5000)) return 'm2';
    return 'ha';
}

function finishFlows(flows, parsed, unparsed, totalHa, areaUnit) {
    const byFrom = new Map();
    for (const f of flows.values()) {
        byFrom.set(f.from, (byFrom.get(f.from) || 0) + f.area_ha);
    }

    const transitions = [...flows.values()]
        .map(f => {
            const fromTotal = byFrom.get(f.from) || 0;
            return {
                from: f.from,
                to: f.to,
                area_ha: f.area_ha,
                n: f.n,
                proportion: fromTotal > 0 ? f.area_ha / fromTotal : 0
            };
        })
        .sort((a, b) => a.from.localeCompare(b.from) || b.area_ha - a.area_ha);

    const fromUnits = [...byFrom.keys()].sort();
    const toUnits = [...new Set(transitions.map(t => t.to))].sort();

    const matrix = {};
    for (const fr of fromUnits) {
        matrix[fr] = {};
        for (const to of toUnits) matrix[fr][to] = 0;
    }
    for (const t of transitions) {
        matrix[t.from][t.to] = t.proportion;
    }

    return {
        transitions,
        matrix,
        fromUnits,
        toUnits,
        parsed,
        unparsed,
        totalHa,
        areaUnit,
        nFrom: fromUnits.length
    };
}

export function createPathwayAccumulator(options = {}) {
    const {
        mode = 'code',
        auColumn = '',
        fromColumn = '',
        toColumn = '',
        areaColumn = '',
        delimiter = '_',
        units = []
    } = options;

    const samples = [];
    let areaUnit = areaColumn ? guessAreaUnit(areaColumn, []) : 'count';
    const flows = new Map();
    let parsed = 0;
    let unparsed = 0;
    let totalHa = 0;

    function lockUnit() {
        if (!areaColumn) {
            areaUnit = 'count';
            return;
        }
        areaUnit = guessAreaUnit(areaColumn, samples);
    }

    function add(row) {
        if (areaColumn && samples.length < 40) {
            samples.push(row[areaColumn]);
            if (samples.length === 40) lockUnit();
        }

        let from = '';
        let to = '';
        let ok = false;

        if (mode === 'columns' && fromColumn && toColumn) {
            from = String(row[fromColumn] ?? '').trim();
            to = String(row[toColumn] ?? '').trim();
            ok = Boolean(from && to);
        } else {
            const decoded = parseCode(row[auColumn], { delimiter, units });
            from = decoded.from;
            to = decoded.to;
            ok = decoded.parsed;
        }

        const ha = areaColumn ? toHa(row[areaColumn], areaUnit) : 1;
        if (!ok || ha === 0) {
            unparsed++;
            return;
        }

        parsed++;
        totalHa += ha;
        const key = `${from}\t${to}`;
        const cur = flows.get(key) || { from, to, area_ha: 0, n: 0 };
        cur.area_ha += ha;
        cur.n += 1;
        flows.set(key, cur);
    }

    function finish() {
        if (areaColumn) lockUnit();
        return finishFlows(flows, parsed, unparsed, totalHa, areaColumn ? areaUnit : 'count');
    }

    return { add, finish };
}

/**
 * Roll inventory rows into from → to area and within-from proportions.
 */
export function computePathways(rows, options) {
    const acc = createPathwayAccumulator(options);
    for (const row of rows || []) acc.add(row);
    return acc.finish();
}

export async function computePathwaysFromFile(file, options, { onProgress } = {}) {
    const acc = createPathwayAccumulator(options);
    await streamCsv(file, {
        onProgress,
        onChunk: (rows) => {
            for (const row of rows) acc.add(row);
        }
    });
    return acc.finish();
}

/**
 * Restrict a pathway result to selected current (from) units.
 * Within-from percentages are unchanged.
 */
export function filterPathways(result, selectedFrom) {
    if (!result) return result;
    const all = result.fromUnits || [];
    if (selectedFrom == null) return result;
    if (selectedFrom.length === all.length && all.every(u => selectedFrom.includes(u))) {
        return result;
    }
    const allow = new Set(selectedFrom);
    const transitions = (result.transitions || []).filter(t => allow.has(t.from));
    const fromUnits = all.filter(u => allow.has(u));
    const toUnits = [...new Set(transitions.map(t => t.to))].sort();
    const matrix = {};
    for (const fr of fromUnits) {
        matrix[fr] = {};
        for (const to of toUnits) matrix[fr][to] = 0;
    }
    let totalHa = 0;
    let parsed = 0;
    for (const t of transitions) {
        matrix[t.from][t.to] = t.proportion;
        totalHa += t.area_ha;
        parsed += t.n;
    }
    return {
        ...result,
        transitions,
        matrix,
        fromUnits,
        toUnits,
        parsed,
        totalHa,
        nFrom: fromUnits.length,
        filtered: true
    };
}

export function transitionsToCsv(transitions) {
    const header = 'from,to,area_ha,n,proportion,percent';
    const lines = transitions.map(t =>
        [t.from, t.to, t.area_ha.toFixed(4), t.n, t.proportion.toFixed(6), (t.proportion * 100).toFixed(2)]
            .join(',')
    );
    return [header, ...lines].join('\n');
}
