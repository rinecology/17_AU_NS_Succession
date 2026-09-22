import Papa from 'papaparse';

export const LARGE_FILE_BYTES = 200 * 1024 * 1024;
export const HARD_CEILING_BYTES = 900 * 1024 * 1024;
export const MAX_RETAINED_ROWS = 500000;
export const CHUNK_SIZE = 2 * 1024 * 1024;

export function formatBytes(n) {
    if (n == null || !Number.isFinite(n)) return '?';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function isLargeFile(file) {
    return (file?.size || 0) >= LARGE_FILE_BYTES;
}

export function isHardCeiling(file) {
    return (file?.size || 0) >= HARD_CEILING_BYTES;
}

function cleanHeader(h) {
    return String(h ?? '').replace(/^\uFEFF/, '').trim();
}

export function peekHeaders(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            preview: 8,
            skipEmptyLines: true,
            transformHeader: cleanHeader,
            complete: (res) => {
                const headers = (res.meta.fields || []).map(cleanHeader).filter(Boolean);
                if (!headers.length && res.data?.[0]) {
                    resolve({ headers: Object.keys(res.data[0]).map(cleanHeader), preview: res.data });
                    return;
                }
                resolve({ headers, preview: res.data || [] });
            },
            error: (err) => reject(err || new Error('Could not read CSV headers.'))
        });
    });
}

export function streamCsv(file, { onChunk, onProgress } = {}) {
    return new Promise((resolve, reject) => {
        let rowsSeen = 0;
        let aborted = false;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            worker: false,
            chunkSize: CHUNK_SIZE,
            transformHeader: cleanHeader,
            chunk: (results, parser) => {
                const rows = results.data || [];
                rowsSeen += rows.length;
                try {
                    onChunk?.(rows, parser);
                } catch (err) {
                    aborted = true;
                    try { parser.abort(); } catch { /* ignore */ }
                    reject(err);
                    return;
                }
                const cursor = results.meta?.cursor;
                if (onProgress && file.size) {
                    onProgress({
                        rowsSeen,
                        bytes: cursor || 0,
                        total: file.size,
                        pct: cursor ? Math.min(1, cursor / file.size) : 0
                    });
                }
            },
            complete: () => resolve({ rowsSeen, aborted }),
            error: (err) => {
                if (aborted) {
                    resolve({ rowsSeen, aborted: true });
                    return;
                }
                reject(err || new Error('CSV stream failed.'));
            }
        });
    });
}

export async function catalogUniques(file, columns, { onProgress } = {}) {
    const cols = (columns || []).filter(Boolean);
    const sets = Object.fromEntries(cols.map(c => [c, new Set()]));
    const { rowsSeen } = await streamCsv(file, {
        onProgress,
        onChunk: (rows) => {
            for (const row of rows) {
                for (const c of cols) {
                    const v = String(row[c] ?? '').trim();
                    if (v) sets[c].add(v);
                }
            }
        }
    });
    return {
        rowsSeen,
        values: Object.fromEntries(cols.map(c => [c, [...sets[c]].sort((a, b) => a.localeCompare(b))]))
    };
}

export async function collectRows(file, { filterRow, maxRows = MAX_RETAINED_ROWS, onProgress } = {}) {
    const kept = [];
    let rowsSeen = 0;
    let aborted = false;
    let abortReason = null;
    await streamCsv(file, {
        onProgress,
        onChunk: (rows, parser) => {
            if (aborted) return;
            for (const row of rows) {
                rowsSeen++;
                if (filterRow && !filterRow(row)) continue;
                kept.push(row);
                if (kept.length > maxRows) {
                    aborted = true;
                    abortReason = `Kept more than ${maxRows.toLocaleString()} rows. Narrow the forest-unit selection.`;
                    try { parser.abort(); } catch { /* ignore */ }
                    break;
                }
            }
        }
    });
    return { rows: kept, rowsSeen, aborted, abortReason };
}
