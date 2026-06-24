/**
 * AGENT API — authorization scopes & key registry.
 *
 * The agent API is protected by an API key, but knowing a key must NOT grant
 * the ability to call every tool. Each tool is classified into a scope, and
 * each configured key is granted an explicit set of scopes. A read-only key
 * (e.g. the scrum-master MCP) therefore cannot reach outbound/irreversible
 * tools (payments, client emails, content approval) even if leaked.
 *
 * Scopes (no implication between them — a key lists every scope it needs):
 *   - "read"        pure internal reads, no external calls, no mutations.
 *   - "write"       mutates internal Nexova state (projects, tasks, content).
 *   - "outbound"    contacts external parties / real-world effects: payment
 *                   links, AI/LLM calls, payment provider reads, team Telegram
 *                   blasts, client-facing content review.
 *   - "email"       sends email to clients (`email.*`). Carved out of outbound
 *                   so it can be granted independently — the scrum-master agent
 *                   has `outbound` but NOT `email`, so it can never email a
 *                   client even if its other config is loosened (Finding NEW-1).
 *   - "destructive" deletions and other irreversible data loss. REQUIRES HUMAN
 *                   APPROVAL — never grant this to an autonomous agent key.
 *                   Reserve it for a human-operated admin key (or the app UI).
 *
 * The scrum-master agent is meant to have [read, write, outbound]: all
 * operational work, but no client email and no deletions. A call to a tool
 * whose scope the key lacks is refused 403.
 *
 * Fail-closed: a tool NOT listed in TOOL_SCOPES defaults to "destructive" (the
 * most restrictive), so a newly-added tool is never silently exposed — even to
 * the full agent key — until it is explicitly classified here.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const SCOPES = ["read", "write", "outbound", "email", "destructive"] as const;
export type Scope = (typeof SCOPES)[number];

/** Minimum key length we accept — rejects low-entropy keys (Finding #2). */
const MIN_KEY_LENGTH = 24;

/**
 * Central, auditable classification of every registered tool. Keep in sync with
 * AGENT_TOOLS in tools.ts. Unknown tools default to "destructive" (fail-closed).
 */
export const TOOL_SCOPES: Record<string, Scope> = {
    // --- reads -------------------------------------------------------------
    "board.summary": "read",
    "standup.tasks": "read",
    "overdue.list": "read",
    "projects.list": "read",
    "project.get": "read",
    "team.list": "read",
    "clients.list": "read",
    "content.list": "read",
    "invoices.list": "read",
    // --- internal writes ---------------------------------------------------
    "projects.create": "write",
    "clients.create": "write",
    "tasks.add": "write",
    "tasks.toggle": "write",
    "tasks.reassign": "write",
    "projects.setPhase": "write",
    "projects.advanceStage": "write",
    "projects.assignStage": "write",
    "content.generatePlan": "write",
    "content.createRequest": "write",
    "invoices.create": "write",
    "team.create": "write",
    // --- outbound / external effects ---------------------------------------
    "ai.summariseSubmission": "outbound",
    "payments.createInvoiceLink": "outbound",
    "payments.checkInvoiceStatus": "outbound",
    "telegram.sendAlert": "outbound",
    "content.submitDraft": "outbound",
    "content.requestChanges": "outbound",
    "content.approve": "outbound",
    // --- client email (separate scope; not granted to the agent) -----------
    "email.sendOnboardingLink": "email",
    // --- destructive / irreversible (HUMAN APPROVAL REQUIRED) --------------
    "projects.delete": "destructive",
    "tasks.delete": "destructive",
    "content.delete": "destructive",
};

/** Scope of a tool by name. Fail-closed to the most restrictive scope. */
export function scopeForTool(name: string): Scope {
    return TOOL_SCOPES[name] ?? "destructive";
}

/** Match a deny pattern (exact name or `prefix.*` glob) against a tool name. */
function matchesPattern(pattern: string, name: string): boolean {
    return pattern.endsWith(".*")
        ? name.startsWith(pattern.slice(0, -1))
        : name === pattern;
}

// ---------------------------------------------------------------------------
// Key registry
// ---------------------------------------------------------------------------

export type AgentKey = {
    /** Human label for logs/telemetry — never the secret. */
    label: string;
    /**
     * Stable, non-secret identity for this key: a truncated hash of the secret.
     * Used to key rate-limit buckets so they can't collide on a user-chosen
     * label or be forged (Finding NEW-3). Never logged as the secret.
     */
    id: string;
    key: string;
    scopes: Scope[];
    /**
     * Specific tools this key may NOT call, even if its scopes would allow them.
     * Entries are exact tool names (`email.sendOnboardingLink`) or a prefix glob
     * (`email.*`). Denied tools are also hidden from the key's GET manifest.
     * Defense-in-depth on top of scopes — withhold a sensitive capability from
     * an otherwise-broad key.
     */
    deny?: string[];
};

const keyEntrySchema = z.object({
    label: z.string().min(1),
    key: z.string().min(MIN_KEY_LENGTH),
    scopes: z.array(z.enum(SCOPES)).min(1),
    deny: z.array(z.string()).optional(),
});

let cached: AgentKey[] | null = null;

/** Truncated SHA-256 of the secret — stable per-key bucket identity. */
function keyId(secret: string): string {
    return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

/**
 * Warn (don't fail) if a deny pattern matches no registered tool — catches
 * typos that would silently fail open, e.g. `project.*` vs `projects.*`
 * (Finding NEW-2).
 */
function validateDeny(label: string, deny: string[] | undefined): void {
    if (!deny) return;
    const names = Object.keys(TOOL_SCOPES);
    for (const pat of deny) {
        if (!names.some((n) => matchesPattern(pat, n))) {
            console.warn(
                `[agent] key "${label}": deny pattern "${pat}" matches no known tool — check for a typo (it currently denies nothing).`,
            );
        }
    }
}

/**
 * Load and validate configured keys. Two sources (both optional):
 *   - AGENT_API_KEYS  — JSON array of { label, key, scopes, deny? }.
 *   - AGENT_API_KEY   — single key (back-compat). Its scopes come from
 *                       AGENT_API_SCOPES (comma list); defaults to "read"
 *                       (least privilege) if unset. AGENT_API_DENY is a comma
 *                       list of withheld tools.
 *
 * Any malformed/short key is dropped with a server-side error (fail-closed) so
 * a misconfiguration locks the endpoint rather than opening it. Result cached;
 * key rotation requires a process restart.
 */
export function loadAgentKeys(): AgentKey[] {
    if (cached) return cached;
    const keys: AgentKey[] = [];

    const raw = process.env.AGENT_API_KEYS?.trim();
    if (raw) {
        try {
            const parsed = z.array(keyEntrySchema).parse(JSON.parse(raw));
            for (const k of parsed) {
                validateDeny(k.label, k.deny);
                keys.push({ ...k, id: keyId(k.key) });
            }
        } catch (e) {
            console.error(
                "[agent] AGENT_API_KEYS is invalid (must be JSON array of {label,key,scopes>=24 chars}); ignoring.",
                e instanceof Error ? e.message : e,
            );
        }
    }

    const single = process.env.AGENT_API_KEY?.trim();
    if (single) {
        if (single.length < MIN_KEY_LENGTH) {
            console.error(
                `[agent] AGENT_API_KEY is shorter than ${MIN_KEY_LENGTH} chars; ignoring (use a high-entropy key, e.g. \`openssl rand -hex 32\`).`,
            );
        } else {
            const scopesRaw = (process.env.AGENT_API_SCOPES ?? "read")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            const scopes = scopesRaw.filter((s): s is Scope =>
                (SCOPES as readonly string[]).includes(s),
            );
            const deny = (process.env.AGENT_API_DENY ?? "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            validateDeny("default", deny.length ? deny : undefined);
            keys.push({
                label: "default",
                id: keyId(single),
                key: single,
                scopes: scopes.length ? scopes : ["read"],
                deny: deny.length ? deny : undefined,
            });
        }
    }

    cached = keys;
    return keys;
}

/**
 * Test-only: reset the memoised key cache. No-op in production so it can't be
 * used to force a reload at runtime (Finding NEW-7).
 */
export const _resetAgentKeyCache: () => void =
    process.env.NODE_ENV === "production"
        ? () => {}
        : () => {
              cached = null;
          };

/** True if any usable key is configured (otherwise the endpoint is locked). */
export function isAgentApiConfigured(): boolean {
    return loadAgentKeys().length > 0;
}

/**
 * Resolve a presented key to its registry entry using a constant-time compare
 * against EVERY configured key (no early exit) to avoid leaking which/whether
 * a key matched via timing. Returns null if no match.
 */
export function resolveAgentKey(provided: string | null): AgentKey | null {
    const keys = loadAgentKeys();
    if (!provided || keys.length === 0) return null;

    const a = Buffer.from(provided);
    let match: AgentKey | null = null;
    for (const entry of keys) {
        const b = Buffer.from(entry.key);
        // Length guard: timingSafeEqual throws on unequal lengths.
        const equal = a.length === b.length && timingSafeEqual(a, b);
        if (equal) match = entry; // keep scanning — don't break early
    }
    return match;
}

/** Tools (by scope) this key may invoke. */
export function keyAllowsScope(key: AgentKey, scope: Scope): boolean {
    return key.scopes.includes(scope);
}

/**
 * True if this key is explicitly denied a tool, by exact name or prefix glob
 * (`email.*` matches every `email.` tool). Denylist beats scope.
 */
export function keyDeniesTool(key: AgentKey, name: string): boolean {
    if (!key.deny || key.deny.length === 0) return false;
    return key.deny.some((pat) => matchesPattern(pat, name));
}

/** Final authorization: the key's scopes allow the tool AND it isn't denied. */
export function keyCanUseTool(key: AgentKey, name: string): boolean {
    return keyAllowsScope(key, scopeForTool(name)) && !keyDeniesTool(key, name);
}
