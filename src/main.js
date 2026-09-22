import Papa from 'papaparse';
import {
    NER_BOREAL_UNITS,
    parseUnitList,
    detectAuColumn,
    detectAreaColumn,
    detectFromToColumns
} from './parse.js';
import { computePathways, computePathwaysFromFile, filterPathways, transitionsToCsv } from './proportions.js';
import { drawSankey, drawHeatmap } from './viz.js';
import { initAssign } from './assign-ui.js';
import { peekHeaders, isLargeFile, formatBytes } from './csv-stream.js';
import { showWork, updateWork, hideWork, progressLine } from './work-overlay.js';

let currentData = [];
let currentFile = null;
let currentFileName = '';
let lastResult = null;
let lastFullResult = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('unit-list').value = NER_BOREAL_UNITS.join(', ');
    bindUpload();
    document.getElementById('run-btn').addEventListener('click', run);
    document.getElementById('download-csv-btn').addEventListener('click', downloadCsv);
    document.getElementById('reset-btn').addEventListener('click', reset);
    document.getElementById('sample-btn').addEventListener('click', loadSample);
    document.getElementById('fu-all')?.addEventListener('click', () => setAllFuChecks(true));
    document.getElementById('fu-none')?.addEventListener('click', () => setAllFuChecks(false));
    document.querySelectorAll('input[name="mode"]').forEach(r => {
        r.addEventListener('change', syncModeUi);
    });
    document.querySelectorAll('.task-tab').forEach(btn => {
        btn.addEventListener('click', () => setTask(btn.dataset.task));
    });
    initAssign({ switchToChart });
});

function setTask(name) {
    const chart = name === 'chart';
    document.getElementById('chart-task').hidden = !chart;
    document.getElementById('assign-task').hidden = chart;
    document.querySelectorAll('.task-tab').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.task === name);
    });
    hideBanner();
}

function switchToChart(rows, { auColumn = '', fileName = 'assigned.csv' } = {}) {
    currentData = rows;
    currentFile = null;
    currentFileName = fileName;
    setTask('chart');
    showFileChip(fileName, { rows: rows.length });
    fillColumnSelects(Object.keys(rows[0] || {}));
    if (auColumn) {
        const sel = document.getElementById('au-column');
        if ([...sel.options].some(o => o.value === auColumn)) sel.value = auColumn;
        const codeRadio = document.querySelector('input[name="mode"][value="code"]');
        if (codeRadio) codeRadio.checked = true;
        syncModeUi();
    }
    showEl('config-section', true);
    showEl('results-section', false);
    setStep('configure');
    run();
}

function bindUpload() {
    const zone = document.getElementById('drop-zone');
    const input = document.getElementById('file-input');
    document.getElementById('browse-btn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
        if (input.files[0]) readFile(input.files[0]);
    });
    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const f = e.dataTransfer.files[0];
        if (f) readFile(f);
    });
}

async function readFile(file) {
    hideBanner();
    if (!file.name.toLowerCase().endsWith('.csv')) {
        showBanner('Please drop a CSV file.');
        return;
    }
    currentFile = file;
    currentFileName = file.name;
    currentData = [];
    lastResult = null;
    lastFullResult = null;
    try {
        showWork('Reading headers…', formatBytes(file.size));
        const { headers } = await peekHeaders(file);
        hideWork();
        if (!headers.length) {
            showBanner('CSV has no header row.');
            return;
        }
        if (!isLargeFile(file)) {
            showWork('Loading CSV…', formatBytes(file.size));
            currentData = await parseCsvFull(file);
            hideWork();
            if (!currentData.length) {
                showBanner('CSV has no data rows.');
                return;
            }
            showFileChip(file.name, { rows: currentData.length, bytes: file.size });
        } else {
            showFileChip(file.name, { bytes: file.size, large: true });
            showBanner(
                `${formatBytes(file.size)} file. Pathways will be summed while streaming — the full table is not kept in memory.`,
                'info'
            );
        }
        fillColumnSelects(headers);
        showEl('config-section', true);
        showEl('results-section', false);
        setStep('configure');
    } catch (err) {
        hideWork();
        showBanner(err.message || String(err));
    }
}

function parseCsvFull(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: h => String(h ?? '').replace(/^\uFEFF/, '').trim(),
            complete: (res) => resolve(res.data || []),
            error: (err) => reject(err || new Error('Could not parse CSV.'))
        });
    });
}

async function loadSample() {
    hideBanner();
    try {
        const text = await fetch('./sample_au_ns.csv').then(r => {
            if (!r.ok) throw new Error(r.statusText);
            return r.text();
        });
        const res = Papa.parse(text, { header: true, skipEmptyLines: true });
        currentData = res.data;
        currentFile = null;
        currentFileName = 'sample_au_ns.csv';
        showFileChip('sample_au_ns.csv', { rows: res.data.length });
        fillColumnSelects(Object.keys(res.data[0]));
        showEl('config-section', true);
        showEl('results-section', false);
        setStep('configure');
    } catch (err) {
        showBanner('Could not load sample: ' + err.message);
    }
}

function fillColumnSelects(headers) {
    fillSelect('au-column', headers, detectAuColumn(headers));
    fillSelect('area-column', headers, detectAreaColumn(headers), true);
    const { fromCol, toCol } = detectFromToColumns(headers);
    fillSelect('from-column', headers, fromCol);
    fillSelect('to-column', headers, toCol);
    syncModeUi();
}

function fillSelect(id, headers, selected, allowNone = false) {
    const sel = document.getElementById(id);
    sel.innerHTML = '';
    if (allowNone) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'None (count records)';
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

function syncModeUi() {
    const mode = document.querySelector('input[name="mode"]:checked')?.value || 'code';
    const cols = mode === 'columns';
    document.getElementById('au-col-group').hidden = cols;
    document.getElementById('delim-group').hidden = cols;
    document.getElementById('from-col-group').hidden = !cols;
    document.getElementById('to-col-group').hidden = !cols;
}

async function run() {
    hideBanner();
    if (!currentData.length && !currentFile) {
        showBanner('Upload a CSV first.');
        return;
    }
    const mode = document.querySelector('input[name="mode"]:checked')?.value || 'code';
    const options = {
        mode,
        auColumn: document.getElementById('au-column').value,
        fromColumn: document.getElementById('from-column').value,
        toColumn: document.getElementById('to-column').value,
        areaColumn: document.getElementById('area-column').value,
        delimiter: document.getElementById('delimiter').value,
        units: parseUnitList(document.getElementById('unit-list').value)
    };

    let result;
    try {
        if (currentData.length) {
            result = computePathways(currentData, options);
        } else {
            showWork('Computing pathways…', `Streaming ${formatBytes(currentFile.size)}`);
            result = await computePathwaysFromFile(currentFile, options, {
                onProgress: (p) => updateWork(
                    'Computing pathways…',
                    progressLine(p),
                    p.pct
                )
            });
            hideWork();
        }
    } catch (err) {
        hideWork();
        showBanner(err.message || String(err));
        return;
    }

    lastFullResult = result;
    lastResult = result;
    fillFuFilter(result.fromUnits);
    renderPathwayView(result);
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });

    if (!result.transitions.length) {
        showBanner('No pathways parsed. Check the AU column, delimiter, and known-unit list.');
        return;
    }
    if (result.unparsed) {
        showBanner(`${result.unparsed.toLocaleString()} row(s) could not be decoded. They are omitted from the charts.`, 'info');
    }
}

function fillFuFilter(fromUnits) {
    const box = document.getElementById('fu-filter-list');
    if (!box) return;
    box.innerHTML = '';
    for (const u of fromUnits || []) {
        const lab = document.createElement('label');
        lab.className = 'fu-chip';
        lab.innerHTML = `<input type="checkbox" class="fu-from-check" value="${esc(u)}" checked> ${esc(u)}`;
        lab.querySelector('input').addEventListener('change', applyFuFilter);
        box.appendChild(lab);
    }
}

function selectedFromUnits() {
    return [...document.querySelectorAll('.fu-from-check:checked')].map(el => el.value);
}

function setAllFuChecks(on) {
    document.querySelectorAll('.fu-from-check').forEach(el => { el.checked = on; });
    applyFuFilter();
}

function applyFuFilter() {
    if (!lastFullResult) return;
    const selected = selectedFromUnits();
    lastResult = filterPathways(lastFullResult, selected);
    renderPathwayView(lastResult);
}

function renderPathwayView(result) {
    document.getElementById('stat-parsed').textContent = result.parsed.toLocaleString();
    document.getElementById('stat-unparsed').textContent = (lastFullResult?.unparsed ?? result.unparsed).toLocaleString();
    document.getElementById('stat-from').textContent = result.nFrom.toLocaleString();
    const areaLabel = result.areaUnit === 'count'
        ? `${result.totalHa.toLocaleString()} rec`
        : `${result.totalHa.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`;
    document.getElementById('stat-area').textContent = areaLabel;

    renderTable(result.transitions);
    showEl('results-section', true);
    setStep('results');
    drawSankey(document.getElementById('sankey'), result.transitions);
    drawHeatmap(document.getElementById('heatmap'), result);
}

function renderTable(rows) {
    const el = document.getElementById('path-table');
    let html = '<thead><tr><th>From</th><th>To</th><th>Area (ha)</th><th>Records</th><th>% of from</th></tr></thead><tbody>';
    for (const t of rows) {
        html += `<tr>
            <td>${esc(t.from)}</td><td>${esc(t.to)}</td>
            <td class="num">${t.area_ha.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td class="num">${t.n.toLocaleString()}</td>
            <td class="num">${(t.proportion * 100).toFixed(1)}</td>
        </tr>`;
    }
    el.innerHTML = html + '</tbody>';
}

function downloadCsv() {
    if (!lastResult?.transitions.length) return;
    const blob = new Blob([transitionsToCsv(lastResult.transitions)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'natural_succession_pathways.csv';
    a.click();
    URL.revokeObjectURL(a.href);
}

function showFileChip(name, { rows, bytes, large } = {}) {
    const el = document.getElementById('file-info');
    el.hidden = false;
    const bits = [];
    if (rows != null) bits.push(`${rows.toLocaleString()} rows`);
    if (bytes != null) bits.push(formatBytes(bytes));
    if (large) bits.push('streamed');
    el.innerHTML = `<div class="file-chip-meta"><strong>${esc(name)}</strong> <span>${bits.join(' · ')}</span></div>
        <button type="button" class="btn btn-secondary" id="change-file">Change file</button>`;
    document.getElementById('change-file').addEventListener('click', () => document.getElementById('file-input').click());
}

function reset() {
    currentData = [];
    currentFile = null;
    currentFileName = '';
    lastResult = null;
    lastFullResult = null;
    document.getElementById('file-input').value = '';
    document.getElementById('file-info').hidden = true;
    showEl('config-section', false);
    showEl('results-section', false);
    hideBanner();
    setStep('upload');
}

function setStep(name) {
    const map = { upload: 'step-upload', configure: 'step-configure', results: 'step-results' };
    document.querySelectorAll('#chart-steps li').forEach(li => {
        li.classList.remove('is-current', 'is-done');
    });
    const order = ['upload', 'configure', 'results'];
    const i = order.indexOf(name);
    order.forEach((k, idx) => {
        const el = document.getElementById(map[k]);
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
    el.hidden = !msg;
    el.textContent = msg || '';
    el.className = 'app-banner' + (msg ? ` is-${type}` : '');
}
function hideBanner() { showBanner(''); }

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
