/**
 * Display formatting shared by dashboards and lists. Keep numbers short on
 * tiles and summaries; full amounts belong on invoices and documents.
 */

/** "RM 10k", "RM 10.5k", "RM 1.2M", "RM 850". For tiles and summaries. */
export function fmtMyrShort(n: number): string {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}RM ${trim(abs / 1_000_000)}M`;
    if (abs >= 1_000) return `${sign}RM ${trim(abs / 1_000)}k`;
    return `${sign}RM ${Math.round(abs).toLocaleString("en-MY")}`;
}

/** "RM 10,500.00" — full amount for invoices, quotes and documents. */
export function fmtMyr(n: number): string {
    return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "RM 10,500" — full amount without cents, for list rows. */
export function fmtMyrWhole(n: number): string {
    return `RM ${Math.round(n).toLocaleString("en-MY")}`;
}

/** 10.5 → "10.5", 10 → "10", 1.25 → "1.3" (one decimal, trimmed). */
function trim(v: number): string {
    return `${Number(v.toFixed(1))}`;
}

/** "12%" from a 0–1 ratio (or 0–100 when `percent` is true). */
export function fmtPct(v: number, percent = false): string {
    const p = percent ? v : v * 100;
    if (!Number.isFinite(p)) return "—";
    return `${Math.round(p)}%`;
}

/** Short count: 1250 → "1.3k". */
export function fmtCount(n: number): string {
    if (Math.abs(n) >= 1_000) return `${trim(n / 1_000)}k`;
    return `${Math.round(n)}`;
}
