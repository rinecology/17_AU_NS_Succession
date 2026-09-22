export function showWork(title, detail = '') {
    const el = document.getElementById('work-overlay');
    if (!el) return;
    const t = document.getElementById('work-title');
    const d = document.getElementById('work-detail');
    const bar = document.getElementById('work-bar');
    if (t) t.textContent = title || 'Working';
    if (d) d.textContent = detail || '';
    if (bar) bar.style.width = '0%';
    el.hidden = false;
}

export function updateWork(title, detail, pct) {
    const t = document.getElementById('work-title');
    const d = document.getElementById('work-detail');
    const bar = document.getElementById('work-bar');
    if (title != null && t) t.textContent = title;
    if (detail != null && d) d.textContent = detail;
    if (bar && Number.isFinite(pct)) bar.style.width = `${Math.max(0, Math.min(100, pct * 100)).toFixed(1)}%`;
}

export function hideWork() {
    const el = document.getElementById('work-overlay');
    if (el) el.hidden = true;
}

export function progressLine({ rowsSeen, bytes, total, extra = '' }) {
    const parts = [];
    if (rowsSeen) parts.push(`${rowsSeen.toLocaleString()} rows`);
    if (bytes && total) parts.push(`${((bytes / total) * 100).toFixed(0)}% of file`);
    if (extra) parts.push(extra);
    return parts.join(' · ');
}
