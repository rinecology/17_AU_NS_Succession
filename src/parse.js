// Decode planning-team AU / succession codes into from → to.

/** NER Boreal units that appear in the colleague NatSucn dict. Teams can replace this list. */
export const NER_BOREAL_UNITS = [
    'PR1', 'PW1', 'PRW', 'LH1', 'TH1', 'SBOG', 'SB1', 'PJ1', 'LC1', 'UPCE',
    'PJ2', 'SP1', 'SF1', 'PO1', 'BW1', 'MH1', 'MC1', 'MH2', 'MC2', 'UDF', 'Succ'
];

export function parseUnitList(text) {
    return [...new Set(
        String(text || '')
            .split(/[\s,;]+/)
            .map(s => s.trim())
            .filter(Boolean)
    )].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/**
 * Split a code such as BW1_PO1, BW1-MH2, UDF_Succ using longest known-unit prefix.
 * @returns {{ from: string, to: string, raw: string, parsed: boolean }}
 */
export function parseCode(raw, { delimiter = '_', units = NER_BOREAL_UNITS } = {}) {
    const code = String(raw ?? '').trim();
    if (!code) return { from: '', to: '', raw: code, parsed: false };

    const delims = delimiter === 'auto' ? ['_', '-', '/', '→', '>'] : [delimiter];
    const unitSet = units.map(u => u.toUpperCase());
    const byLen = [...units].sort((a, b) => b.length - a.length);

    for (const d of delims) {
        if (!code.includes(d)) continue;
        const parts = code.split(d).filter(Boolean);
        // Post-renewal style: PLANFU_DEVSTAGE_from_to (SB1_Seed_SB1_LC1) → SB1 → LC1
        if (parts.length >= 4) {
            return { from: parts[0], to: parts[parts.length - 1], raw: code, parsed: true };
        }
        const idx = findSplit(code, d, byLen);
        if (idx > 0) {
            const from = code.slice(0, idx);
            const to = code.slice(idx + d.length);
            if (from && to) {
                return { from, to, raw: code, parsed: true };
            }
        }
    }

    // Single token that is itself a known unit (stay)
    if (unitSet.includes(code.toUpperCase())) {
        return { from: code, to: code, raw: code, parsed: true };
    }

    return { from: '', to: '', raw: code, parsed: false };
}

function findSplit(code, delim, unitsByLen) {
    const upper = code.toUpperCase();
    for (const u of unitsByLen) {
        const U = u.toUpperCase();
        if (upper.startsWith(U) && code.slice(u.length).startsWith(delim)) {
            return u.length;
        }
    }
    return -1;
}

export function detectAuColumn(headers) {
    const lower = headers.map(h => h.toLowerCase());
    const preferred = [
        'au_ns', 'au_succ', 'yfu_natsucn_au', 'yfu_au', 'au_ns_code',
        'pathway', 'succ_au', 'au_prs', 'post_renewal', 'si_au'
    ];
    for (const key of preferred) {
        const i = lower.indexOf(key);
        if (i >= 0) return headers[i];
    }
    const fuzzy = headers.find(h => /au.?ns|au.?prs|natsucn|succ|post.?renew/i.test(h) || /^yfu_/i.test(h));
    return fuzzy || '';
}

export function detectAreaColumn(headers) {
    const lower = headers.map(h => h.toLowerCase());
    const preferred = ['hectares', 'area_ha', 'area_hectares', 'ha', 'area', 'shape_area', 'poly_area'];
    for (const key of preferred) {
        const i = lower.indexOf(key);
        if (i >= 0) return headers[i];
    }
    return '';
}

export function detectFromToColumns(headers) {
    const lower = headers.map(h => h.toLowerCase());
    const fromKeys = ['from_fu', 'pre_fu', 'from', 'current_fu', 'sfu'];
    const toKeys = ['to_fu', 'post_fu', 'to', 'next_fu', 'succ_fu'];
    let fromCol = '';
    let toCol = '';
    for (const key of fromKeys) {
        const i = lower.indexOf(key);
        if (i >= 0) { fromCol = headers[i]; break; }
    }
    for (const key of toKeys) {
        const i = lower.indexOf(key);
        if (i >= 0) { toCol = headers[i]; break; }
    }
    return { fromCol, toCol };
}
