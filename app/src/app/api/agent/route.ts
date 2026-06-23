/**
 * External agent API — the single programmatic entry point into Nexov Admin.
 *
 * This is what the Nexova scrum-master MCP server (or any external automation)
 * talks to. It does NOT expose the database directly: every call is dispatched
 * through the `AGENT_TOOLS` registry (src/lib/agent/tools.ts), so callers can
 * only ever do what a tool explicitly allows, with Zod-validated args.
 *
 *   GET  /api/agent              → tool manifest, FILTERED to the caller's scopes
 *   POST /api/agent  { tool, input } → run one tool, return its output
 *
 * Auth & authorization:
 *   - Every request carries `x-api-key`. The key resolves (constant-time) to a
 *     registry entry with an explicit scope set (see agent/scopes.ts).
 *   - A tool is only runnable if the key's scopes include the tool's scope, so
 *     a read-only key can never trigger outbound/irreversible tools.
 *   - No keys configured → endpoint is locked (503). Fail closed, never open.
 *
 * Hardening: brute-force throttle on auth failures, per-scope rate limits,
 * generic error bodies (no internal/DB message or schema leakage), no-store.
 */
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AGENT_TOOLS, getTool } from "@/lib/agent/tools";
import {
    isAgentApiConfigured,
    resolveAgentKey,
    scopeForTool,
    keyCanUseTool,
    type AgentKey,
} from "@/lib/agent/scopes";
import {
    checkAuthFailureRate,
    checkToolRate,
} from "@/lib/agent/rate-limit";

export const dynamic = "force-dynamic";

/** Responses never get cached anywhere — they carry business data (Finding #8). */
const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
    return NextResponse.json(body, {
        status: init?.status ?? 200,
        headers: { ...NO_STORE, ...(init?.headers ?? {}) },
    });
}

/**
 * Client identity for the brute-force throttle. `x-forwarded-for` is trivially
 * spoofable, so we only trust it when AGENT_TRUST_PROXY is set (i.e. the app
 * sits behind a proxy/load balancer that rewrites the header). Otherwise we
 * fall back to a single global bucket — a coarse but un-spoofable cap on total
 * auth failures across all callers (Finding NEW-4). Behind a trusted proxy,
 * set AGENT_TRUST_PROXY=1 to get per-IP granularity.
 */
function authFailureIdentity(req: NextRequest): string {
    if (process.env.AGENT_TRUST_PROXY !== "1") return "global";
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    return req.headers.get("x-real-ip")?.trim() || "global";
}

type AuthOk = { kind: "ok"; key: AgentKey };
type AuthErr = { kind: "err"; res: NextResponse };

/** Resolve + authorize the caller, with a brute-force throttle on failures. */
function authenticate(req: NextRequest): AuthOk | AuthErr {
    if (!isAgentApiConfigured()) {
        return {
            kind: "err",
            res: json({ error: "Agent API is disabled (no API key configured)." }, { status: 503 }),
        };
    }

    const key = resolveAgentKey(req.headers.get("x-api-key"));
    if (!key) {
        // Throttle repeated failures so a key can't be brute-forced.
        const rl = checkAuthFailureRate(authFailureIdentity(req));
        if (!rl.ok) {
            return {
                kind: "err",
                res: json(
                    { error: "Too many requests" },
                    { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
                ),
            };
        }
        return { kind: "err", res: json({ error: "Unauthorized" }, { status: 401 }) };
    }

    return { kind: "ok", key };
}

/** GET → discovery manifest, filtered to the tools this key may call. */
export async function GET(req: NextRequest) {
    const auth = authenticate(req);
    if (auth.kind === "err") return auth.res;

    const tools = AGENT_TOOLS.filter((t) => keyCanUseTool(auth.key, t.name)).map(
        (t) => {
            let inputSchema: unknown;
            try {
                inputSchema = z.toJSONSchema(t.inputSchema);
            } catch {
                inputSchema = null; // schema not representable as JSON Schema
            }
            return { name: t.name, description: t.description, scope: scopeForTool(t.name), inputSchema };
        },
    );

    return json({ tools, count: tools.length });
}

const callSchema = z.object({
    tool: z.string().min(1),
    input: z.unknown().optional(),
});

/** POST → run a single tool. Body: { tool: string, input?: unknown }. */
export async function POST(req: NextRequest) {
    const auth = authenticate(req);
    if (auth.kind === "err") return auth.res;
    const { key } = auth;

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = callSchema.safeParse(body);
    if (!parsed.success) {
        return json({ error: "Body must be { tool: string, input?: object }" }, { status: 400 });
    }

    const toolName = parsed.data.tool;
    const scope = scopeForTool(toolName);

    // Authorize (scope + denylist in one check). Use a single uniform response
    // for "out of scope", "denied", and "unknown tool" so an under-privileged
    // caller can't probe which tools exist or infer a tool's scope from the
    // error wording (Finding NEW-5). Legitimate callers learn what they can do
    // from the scope-filtered GET manifest, not by probing.
    if (!keyCanUseTool(key, toolName)) {
        return json(
            {
                error: `Tool "${toolName}" is not available to this key (it may not exist, be out of scope, or require human approval).`,
            },
            { status: 403 },
        );
    }

    let tool;
    try {
        tool = getTool(toolName);
    } catch {
        // Reached only by a key whose scopes DO cover this name (e.g. an admin
        // key for an unclassified/destructive-default name) — safe to be exact.
        return json({ error: `Unknown tool: ${toolName}` }, { status: 404 });
    }

    // Per-scope rate limit, keyed by the key's stable non-secret id (Finding
    // NEW-3) so buckets can't collide on a user-chosen label.
    const rl = checkToolRate(key.id, scope);
    if (!rl.ok) {
        return json(
            { error: "Too many requests" },
            { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        );
    }

    const inputCheck = tool.inputSchema.safeParse(parsed.data.input ?? {});
    if (!inputCheck.success) {
        // Surface only the offending field paths — never messages/values or the
        // full schema tree (Finding #5).
        const fields = inputCheck.error.issues.map((i) => i.path.join(".")).filter(Boolean);
        return json({ error: "Invalid tool input", fields }, { status: 422 });
    }

    try {
        const output = await tool.invoke(inputCheck.data);
        return json({ tool: tool.name, output });
    } catch (e) {
        // Generic body + correlation id; the real error stays in server logs
        // only (Finding #3) so we don't leak internal/DB/provider messages.
        const ref = randomUUID();
        console.error(`agent tool "${tool.name}" failed [ref=${ref}]`, e);
        return json(
            { error: "Tool execution failed", tool: tool.name, ref },
            { status: 500 },
        );
    }
}
