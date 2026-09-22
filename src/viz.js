import Plotly from 'plotly.js-dist-min';
import { colorForUnit, hexToRgba } from './unit-colors.js';

const FOREST = '#35594c';
const ROSE = '#b76e79';

export function drawSankey(el, transitions) {
    Plotly.purge(el);
    el.innerHTML = '';
    const df = transitions.filter(t => t.area_ha > 0);
    if (!df.length) {
        el.innerHTML = '<p class="note">No parsed pathways to draw.</p>';
        return;
    }

    const fromNodes = [...new Set(df.map(t => t.from))];
    const toNodes = [...new Set(df.map(t => t.to))];
    // Separate left (current) and right (successor) even when names repeat (BW1 → BW1).
    const labels = [
        ...fromNodes.map(n => n),
        ...toNodes.map(n => n)
    ];
    const idxFrom = Object.fromEntries(fromNodes.map((n, i) => [n, i]));
    const idxTo = Object.fromEntries(toNodes.map((n, i) => [n, fromNodes.length + i]));

    const data = [{
        type: 'sankey',
        arrangement: 'snap',
        node: {
            pad: 16,
            thickness: 18,
            line: { color: '#3a3532', width: 0.4 },
            label: labels,
            color: [
                ...fromNodes.map(n => hexToRgba(colorForUnit(n), 0.92)),
                ...toNodes.map(n => hexToRgba(colorForUnit(n), 0.78))
            ]
        },
        link: {
            source: df.map(t => idxFrom[t.from]),
            target: df.map(t => idxTo[t.to]),
            value: df.map(t => t.area_ha),
            label: df.map(t => `${t.from} → ${t.to}  ${(t.proportion * 100).toFixed(1)}% of ${t.from}`),
            color: df.map(t => hexToRgba(colorForUnit(t.from), 0.38))
        }
    }];

    Plotly.react(el, data, {
        margin: { t: 24, l: 8, r: 8, b: 8 },
        font: { family: 'Segoe UI, system-ui, sans-serif', size: 12, color: '#3a3532' },
        paper_bgcolor: 'rgba(0,0,0,0)',
        height: Math.max(420, 28 * labels.length)
    }, { responsive: true, displaylogo: false });
}

export function drawHeatmap(el, { matrix, fromUnits, toUnits }) {
    Plotly.purge(el);
    el.innerHTML = '';
    if (!fromUnits.length || !toUnits.length) {
        el.innerHTML = '<p class="note">No matrix to draw.</p>';
        return;
    }

    const z = fromUnits.map(fr => toUnits.map(to => (matrix[fr][to] || 0) * 100));
    const text = z.map(row => row.map(v => (v > 0 ? v.toFixed(1) : '')));

    Plotly.react(el, [{
        type: 'heatmap',
        z,
        x: toUnits,
        y: fromUnits,
        text,
        texttemplate: '%{text}',
        colorscale: [
            [0, '#f6f1eb'],
            [0.5, '#c4a882'],
            [1, FOREST]
        ],
        colorbar: { title: '% of from', ticksuffix: '%' },
        hovertemplate: '%{y} → %{x}: %{z:.1f}%<extra></extra>'
    }], {
        margin: { t: 32, l: 64, r: 48, b: 64 },
        xaxis: { title: 'Successor', side: 'bottom' },
        yaxis: { title: 'Current unit', autorange: 'reversed' },
        font: { family: 'Segoe UI, system-ui, sans-serif', size: 12, color: '#3a3532' },
        paper_bgcolor: 'rgba(0,0,0,0)',
        height: Math.max(360, 28 * fromUnits.length + 80)
    }, { responsive: true, displaylogo: false });
}

export { FOREST, ROSE };
