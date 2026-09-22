// Stable colours keyed to forest-unit codes. Same unit → same colour
// whether the filter shows 2 units or 20. Unknown codes hash into FALLBACK.

/** Paul Tol + Okabe–Ito mix, assigned to NER Boreal units. */
export const UNIT_COLORS = {
    PR1: '#EE7733',
    PW1: '#DDAA33',
    PRW: '#CCBB44',
    LH1: '#004488',
    TH1: '#4477AA',
    SBOG: '#66CCEE',
    SB1: '#009988',
    PJ1: '#EE6677',
    LC1: '#228833',
    UPCE: '#44AA99',
    PJ2: '#BB5566',
    SP1: '#332288',
    SF1: '#117733',
    PO1: '#AA3377',
    BW1: '#882255',
    MH1: '#CC6677',
    MC1: '#AA4499',
    MH2: '#661100',
    MC2: '#663333',
    UDF: '#BBBBBB',
    Succ: '#777777'
};

/** Codes not in UNIT_COLORS (and blank). Distinct from UDF silver. */
export const UNKNOWN_COLOR = '#8A8580';

export function isMappedUnit(code) {
    const raw = String(code ?? '').trim();
    if (!raw) return false;
    if (UNIT_COLORS[raw]) return true;
    const upper = raw.toUpperCase();
    return Object.keys(UNIT_COLORS).some(k => k.toUpperCase() === upper);
}

export function colorForUnit(code) {
    const raw = String(code ?? '').trim();
    if (!raw) return UNKNOWN_COLOR;
    if (UNIT_COLORS[raw]) return UNIT_COLORS[raw];
    const upper = raw.toUpperCase();
    for (const [k, v] of Object.entries(UNIT_COLORS)) {
        if (k.toUpperCase() === upper) return v;
    }
    return UNKNOWN_COLOR;
}

export function hexToRgba(hex, alpha = 1) {
    const h = String(hex || '').replace('#', '');
    const n = h.length === 3
        ? h.split('').map(c => c + c).join('')
        : h;
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
