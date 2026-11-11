/**
 * Where the JSON dev store lives.
 *
 * Locally: `app/.dev-data` (gitignored, written by the seed and the app).
 * On Vercel (read-only bundle): a copy of the shipped `seed-data` snapshot is
 * made in the instance's temp dir on first use, so the mock-up can read and
 * write. That copy is per instance and disappears on cold start — fine for a
 * click-through demo, never for real data.
 * `DEV_DATA_DIR` overrides both.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let resolved: string | null = null;

export function devDataRoot(): string {
    if (resolved) return resolved;
    const explicit = process.env.DEV_DATA_DIR?.trim();
    if (explicit) {
        resolved = explicit;
        return resolved;
    }
    const local = path.join(process.cwd(), ".dev-data");
    if (!process.env.VERCEL) {
        resolved = local;
        return resolved;
    }
    const tmp = path.join(os.tmpdir(), "nexops-dev-data");
    const marker = path.join(tmp, ".ready");
    if (!fs.existsSync(marker)) {
        const snapshot = path.join(process.cwd(), "seed-data");
        try {
            fs.mkdirSync(tmp, { recursive: true });
            if (fs.existsSync(snapshot)) fs.cpSync(snapshot, tmp, { recursive: true });
            fs.writeFileSync(marker, new Date().toISOString(), "utf8");
        } catch {
            // A failed copy leaves an empty store; the app still renders.
        }
    }
    resolved = tmp;
    return resolved;
}

/**
 * True when running as the shared mock-up (demo data, no login): either the
 * explicit NEXOPS_MOCKUP=1, or a Vercel deployment of a `mockup/…` branch
 * (Vercel exposes the branch as VERCEL_GIT_COMMIT_REF). Production (main)
 * never matches.
 */
export function isMockup(): boolean {
    if (process.env.NEXOPS_MOCKUP === "1") return true;
    return (process.env.VERCEL_GIT_COMMIT_REF ?? "").startsWith("mockup/");
}

/**
 * The no-login bypass: on locally with DEV_AUTH_BYPASS=1, never in
 * production — except for the shared mock-up, which is always open.
 */
export function bypassEnabled(): boolean {
    if (isMockup()) return true;
    return process.env.DEV_AUTH_BYPASS === "1" && process.env.NODE_ENV !== "production";
}
