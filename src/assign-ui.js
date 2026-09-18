import Papa from 'papaparse';
import {
    stripBomHeaders,
    headerList,
    detectValueColumn,
    detectProportionColumn,
    detectPolytypeColumn,
    suggestStratumPairs,
    assignPostRenewal,
    qaToCsv,
    unmatchedToCsv,
    unusedLookupToCsv
} from './assign.js';
import { detectAreaColumn } from './parse.js';

let inventory = [];
let lookup = [];
let inventoryName = '';
let lookupName = '';
let lastResult = null;
let switchToChart = null;

export function initAssign(opts = {}) {
    switchToChart = opts.switchToChart || null;
    bindDrop('prs-inv-drop', 'prs-inv-input', 'prs-inv-browse', file => loadFile(file, 'inventory'));
    bindDrop('prs-lu-drop', 'prs-lu-input', 'prs-lu-browse', file => loadFile(file, 'lookup'));
    document.getElementById('prs-sample-btn')?.addEventListener('click', loadSample);
    document.getElementById('prs-add-stratum')?.addEventListener('click', () => addStratumRow());
    document.getElementById('prs-assign-btn')?.addEventListener('click', runAssign);
    document.getElementById('prs-download-inv')?.addEventListener('click', downloadInventory);
    document.getElementById('prs-download-qa')?.addEventListener('click', downloadQa);
    document.getElementById('prs-chart-btn')?.addEventListener('click', chartAssigned);
    document.getElementById('prs-reset-btn')?.addEventListener('click', resetAssign);
}

function bindDrop(zoneId, inputId, browseId, onFile) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);
    const browse = document.getElementById(browseId);
    if (!zone || !input) return;
    browse?.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files[0]) onFile(input.files[0]); });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
    });
}

function parseCsv(source) {
    return new Promise((resolve, reject) => {
        const opts = {
            header: true,
            skipEmptyLines: true,
            complete: res => {
                const data = stripBomHeaders(res.data || []);
                if (!data.length) reject(new Error('CSV has no data rows.'));
                else resolve(data);
            },
            error: err => reject(err)
        };
        if (typeof source === 'string') Papa.parse(source, opts);
        else Papa.parse(source, opts);
    });
}

async function loadFile(file, which) {
    hideBanner();
    const name = file.name || '';
    if (!name.toLowerCase().endsWith('.csv')) {
        showBanner('Please use a CSV file. Save Excel as CSV UTF-8 first.');
        return;
    }
    try {
        const data = await parseCsv(file);
        if (which === 'inventory') {
            inventory = data;
            inventoryName = name;
            chip('prs-inv-chip', name, data.length);
        } else {
            lookup = data;
            lookupName = name;
            chip('prs-lu-chip', name, data.length);
        }
        maybeShowConfig();
    } catch (err) {
        showBanner(err.message || String(err));
    }
}

async function loadSample() {
    hideBanner();
    try {
        const [invText, luText] = await Promise.all([
            fetch('./sample_au_prs_inventory.csv').then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); }),
            fetch('./sample_au_prs_lookup.csv').then(r => { if (!r.ok) throw new Error(r.statusText); return r.text(); })
        ]);
        inventory = await parseCsv(invText);
        lookup = await parseCsv(luText);
        inventoryName = 'sample_au_prs_inventory.csv';
        lookupName = 'sample_au_prs_lookup.csv';
        chip('prs-inv-chip', inventoryName, inventory.length);
        chip('prs-lu-chip', lookupName, lookup.length);
        maybeShowConfig();
        showBanner('Loaded sample inventory and lookup (SB1 Seed is 45 / 55).', 'info');
    } catch (err) {
        showBanner('Could not load sample: ' + err.message);
    }
}

function chip(id, name, n) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `<div class="file-chip-meta"><strong>${esc(name)}</strong> <span>${n.toLocaleString()} rows</span></div>`;
}

function maybeShowConfig() {
    if (!inventory.length || !lookup.length) return;
    fillMapping();
    showEl('assign-config-section', true);
    showEl('assign-results-section', false);
    setAssignStep('map');
}

function fillMapping() {
    const luH = headerList(lookup);
    const invH = headerList(inventory);
    fillSelect('prs-value-col', luH, detectValueColumn(luH));
    fillSelect('prs-prop-col', luH, detectProportionColumn(luH));
    fillSelect('prs-area-col', invH, detectAreaColumn(invH), true);
    const poly = detectPolytypeColumn(invH);
    fillSelect('prs-poly-col', invH, poly, true);
    const polySel = document.getElementById('prs-poly-filter');
    polySel.innerHTML = '<option value="">No filter</option>';
    if (poly) {
        const vals = [...new Set(inventory.map(r => String(r[poly] ?? '').trim()).filter(Boolean))].sort();
        for (const v of vals) {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = v;
            if (v.toUpperCase() === 'FOR') o.selected = true;
            polySel.appendChild(o);
        }
    }
    const out = document.getElementById('prs-out-col');
    if (out && !out.value) out.value = detectValueColumn(luH) || 'AU_PRS';
    const pairs = suggestStratumPairs(luH, invH);
    const box = document.getElementById('prs-stratum-list');
    box.innerHTML = '';
    if (pairs.length) pairs.forEach(p => addStratumRow(p.lookup, p.inventory));
    else addStratumRow();
    document.getElementById('prs-value-col').onchange = () => {
        const v = document.getElementById('prs-value-col').value;
        if (v && !document.getElementById('prs-out-col').value) document.getElementById('prs-out-col').value = v;
    };
}

function addStratumRow(luVal = '', invVal = '') {
    const luH = headerList(lookup);
    const invH = headerList(inventory);
    const box = document.getElementById('prs-stratum-list');
    const row = document.createElement('div');
    row.className = 'stratum-row';
    row.innerHTML = `
        <select class="form-control prs-lu-stratum"></select>
        <span class="stratum-arrow">→</span>
        <select class="form-control prs-inv-stratum"></select>
        <button type="button" class="btn btn-secondary btn-tiny prs-remove-stratum" title="Remove">Remove</button>
    `;
    box.appendChild(row);
    fillSelectEl(row.querySelector('.prs-lu-stratum'), luH, luVal);
    fillSelectEl(row.querySelector('.prs-inv-stratum'), invH, invVal);
    row.querySelector('.prs-remove-stratum').addEventListener('click', () => {
        if (box.children.length <= 1) return;
        row.remove();
    });
}

function readStratumPairs() {
    const lu = [...document.querySelectorAll('.prs-lu-stratum')].map(s => s.value);
    const inv = [...document.querySelectorAll('.prs-inv-stratum')].map(s => s.value);
    return { lookupStratumCols: lu, inventoryStratumCols: inv };
}

function runAssign() {
    hideBanner();
    if (!inventory.length || !lookup.length) {
        showBanner('Upload both the inventory and the lookup CSV.');
        return;
    }
    const { lookupStratumCols, inventoryStratumCols } = readStratumPairs();
    if (!lookupStratumCols.length || lookupStratumCols.some(c => !c) || inventoryStratumCols.some(c => !c)) {
        showBanner('Each stratum row needs a lookup column and an inventory column.');
        return;
    }
    const outCol = (document.getElementById('prs-out-col').value || 'AU_PRS').trim();
    const seedRaw = document.getElementById('prs-seed').value;
    try {
        lastResult = assignPostRenewal(inventory, lookup, {
            lookupStratumCols,
            inventoryStratumCols,
            valueCol: document.getElementById('prs-value-col').value,
            proportionCol: document.getElementById('prs-prop-col').value,
            areaCol: document.getElementById('prs-area-col').value,
            outCol,
            seed: seedRaw === '' ? 1 : Number(seedRaw),
            fillBlanksOnly: document.getElementById('prs-fill-blanks').checked,
            polytypeCol: document.getElementById('prs-poly-col').value,
            polytypeFilter: document.getElementById('prs-poly-filter').value,
            caseInsensitive: document.getElementById('prs-case').checked,
            collapseDevstage: document.getElementById('prs-collapse').checked
        });
    } catch (err) {
        showBanner(err.message || String(err));
        return;
    }
    renderAssignResults(lastResult);
    showEl('assign-results-section', true);
    setAssignStep('results');
    document.getElementById('assign-results-section').scrollIntoView({ behavior: 'smooth' });

    const msgs = [];
    if (lastResult.warnings.length) {
        msgs.push(lastResult.warnings.map(w => `${w.stratum}: ${w.message}`).join(' '));
    }
    if (lastResult.stats.unmatchedN) {
        msgs.push(`${lastResult.stats.unmatchedN.toLocaleString()} inventory row(s) did not match the lookup (${lastResult.stats.unmatchedHa.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha).`);
    }
    if (lastResult.stats.unusedLookupN) {
        msgs.push(`${lastResult.stats.unusedLookupN.toLocaleString()} lookup stratum(s) had no matching inventory rows.`);
    }
    if (lastResult.stats.flagged) {
        msgs.push(`${lastResult.stats.flagged} pathway(s) differ from the lookup by more than 5 percentage points (whole polygons cannot be split).`);
    }
    if (msgs.length) showBanner(msgs.join(' '), 'info');
}

function renderAssignResults(result) {
    const s = result.stats;
    const area = (ha) => result.areaUnit === 'count'
        ? `${ha.toLocaleString()} rec`
        : `${ha.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`;
    document.getElementById('prs-stat-assigned').textContent = s.assignedN.toLocaleString();
    document.getElementById('prs-stat-area').textContent = area(s.assignedHa);
    document.getElementById('prs-stat-unmatched').textContent = s.unmatchedN.toLocaleString();
    document.getElementById('prs-stat-strata').textContent = `${s.usedStrata} / ${s.lookupStrata}`;

    const qaEl = document.getElementById('prs-qa-table');
    let html = '<thead><tr><th>Stratum</th><th>Value</th><th>n</th><th>Expected ha</th><th>Observed ha</th><th>Expected %</th><th>Observed %</th><th>Δ pp</th></tr></thead><tbody>';
    for (const r of result.qa) {
        html += `<tr class="${r.flag ? 'is-flag' : ''}">
            <td>${esc(r.stratum)}</td><td>${esc(r.value)}</td>
            <td class="num">${r.n.toLocaleString()}</td>
            <td class="num">${r.expected_ha.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td class="num">${r.observed_ha.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td class="num">${r.expected_pct.toFixed(1)}</td>
            <td class="num">${r.observed_pct.toFixed(1)}</td>
            <td class="num">${r.diff_pct.toFixed(1)}</td>
        </tr>`;
    }
    qaEl.innerHTML = html + '</tbody>';

    const um = document.getElementById('prs-unmatched-wrap');
    if (result.unmatched.length) {
        um.hidden = false;
        let uhtml = '<thead><tr><th>Stratum</th><th>Rows</th><th>Area (ha)</th></tr></thead><tbody>';
        for (const u of result.unmatched.slice(0, 40)) {
            uhtml += `<tr><td>${esc(u.label)}</td><td class="num">${u.n.toLocaleString()}</td>
                <td class="num">${u.ha.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td></tr>`;
        }
        document.getElementById('prs-unmatched-table').innerHTML = uhtml + '</tbody>';
    } else {
        um.hidden = true;
    }

    const uu = document.getElementById('prs-unused-wrap');
    if (result.unusedLookup.length) {
        uu.hidden = false;
        let lhtml = '<thead><tr><th>Stratum</th><th>Pathways in lookup</th></tr></thead><tbody>';
        for (const u of result.unusedLookup.slice(0, 40)) {
            lhtml += `<tr><td>${esc(u.label)}</td><td>${esc(u.values)}</td></tr>`;
        }
        document.getElementById('prs-unused-table').innerHTML = lhtml + '</tbody>';
    } else {
        uu.hidden = true;
    }
}

function downloadInventory() {
    if (!lastResult?.rows?.length) return;
    const csv = Papa.unparse(lastResult.rows);
    saveBlob(csv, suffix(inventoryName, `with_${lastResult.outCol}`) + '.csv');
}

function downloadQa() {
    if (!lastResult) return;
    let csv = qaToCsv(lastResult.qa);
    if (lastResult.unmatched.length) {
        csv += '\n\n# inventory_strata_not_in_lookup\n' + unmatchedToCsv(lastResult.unmatched);
    }
    if (lastResult.unusedLookup.length) {
        csv += '\n\n# lookup_strata_not_in_inventory\n' + unusedLookupToCsv(lastResult.unusedLookup);
    }
    saveBlob(csv, suffix(inventoryName, 'AU_QA') + '.csv');
}

function chartAssigned() {
    if (!lastResult?.rows?.length) return;
    if (!switchToChart) return;
    switchToChart(lastResult.rows, {
        auColumn: lastResult.outCol,
        fileName: suffix(inventoryName, lastResult.outCol) + '.csv'
    });
}

function resetAssign() {
    inventory = [];
    lookup = [];
    lastResult = null;
    inventoryName = '';
    lookupName = '';
    const invIn = document.getElementById('prs-inv-input');
    const luIn = document.getElementById('prs-lu-input');
    if (invIn) invIn.value = '';
    if (luIn) luIn.value = '';
    const invChip = document.getElementById('prs-inv-chip');
    const luChip = document.getElementById('prs-lu-chip');
    if (invChip) invChip.hidden = true;
    if (luChip) luChip.hidden = true;
    showEl('assign-config-section', false);
    showEl('assign-results-section', false);
    hideBanner();
    setAssignStep('upload');
}

function suffix(name, tag) {
    const base = (name || 'inventory').replace(/\.csv$/i, '');
    return `${base}_${tag}`;
}

function saveBlob(text, filename) {
    const blob = new Blob([text], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

function fillSelect(id, headers, selected, allowNone = false) {
    fillSelectEl(document.getElementById(id), headers, selected, allowNone);
}

function fillSelectEl(sel, headers, selected, allowNone = false) {
    if (!sel) return;
    sel.innerHTML = '';
    if (allowNone) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'None';
        sel.appendChild(o);
    }
    for (const h of headers) {
        const o = document.createElement('option');
        o.value = h;
        o.textContent = h;
        sel.appendChild(o);
    }
    if (selected && headers.includes(selected)) sel.value = selected;
}

function setAssignStep(name) {
    const order = ['upload', 'map', 'results'];
    const map = { upload: 'assign-step-upload', map: 'assign-step-map', results: 'assign-step-results' };
    document.querySelectorAll('#assign-steps li').forEach(li => li.classList.remove('is-current', 'is-done'));
    const i = order.indexOf(name);
    order.forEach((k, idx) => {
        const el = document.getElementById(map[k]);
        if (!el) return;
        if (idx < i) el.classList.add('is-done');
        if (idx === i) el.classList.add('is-current');
    });
}

function showEl(id, on) {
    const el = document.getElementById(id);
    if (el) el.hidden = !on;
}

function showBanner(msg, type = 'error') {
    const el = document.getElementById('app-banner');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
    el.className = 'app-banner' + (msg ? ` is-${type}` : '');
}
function hideBanner() { showBanner(''); }

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export { resetAssign, setAssignStep };
