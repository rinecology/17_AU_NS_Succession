import { parseCode } from './parse.js';

function toHa(value, unit) {
    const n = Number(String(value ?? '').replace(/,/g, ''));
    if (!Number.isFinite(n)) return 0;
    if (unit === 'm2') return n / 10000;
    return n;
}

function guessAreaUnit(columnName, sampleValues) {
    if (/m2|shape_area|poly_area/i.test(columnName || '')) return 'm2';
    const nums = sampleValues.map(Number).filter(n => Number.isFinite(n) && n > 0);
    if (nums.length && nums.every(n => n > 5000)) return 'm2';
    return 'ha';
}

/**
 * Roll inventory rows into from → to area and within-from proportions.
 */
export function computePathways(rows, options) {
    const {
        mode = 'code',
        auColumn = '',
        fromColumn = '',
        toColumn = '',
        areaColumn = '',
        delimiter = '_',
        units = []
    } = options;

    const areaUnit = areaColumn
        ? guessAreaUnit(areaColumn, rows.slice(0, 40).map(r => r[areaColumn]))
        : 'count';

    const flows = new Map();
    let parsed = 0;
    let unparsed = 0;
    let totalHa = 0;

    for (const row of rows) {
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
            continue;
        }

        parsed++;
        totalHa += ha;
        const key = `${from}\t${to}`;
        const cur = flows.get(key) || { from, to, area_ha: 0, n: 0 };
        cur.area_ha += ha;
        cur.n += 1;
        flows.set(key, cur);
    }

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
        areaUnit: areaColumn ? areaUnit : 'count',
        nFrom: fromUnits.length
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
