/**
 * Thin typed fetch wrapper for LeanX API.
 *
 * Reads creds from env at call time (so a missing key fails clearly at the
 * request that needs it, not at module load).
 *
 * LeanX uses an `auth-token` header (not standard `Authorization`) whose value
 * is `LP-<MERCHANT_ID>-MM|<UUID>|<TOKEN>` — copy verbatim from Merchant Portal.
 *
 * Docs: https://docs.leanx.io/api-docs/
 * Server-only.
 */
import "server-only";
import { env } from "@/lib/env";

function requireConfig() {
    if (!env.LEANX_AUTH_TOKEN) {
        throw new Error(
            "LEANX_AUTH_TOKEN is not set. Sign up at leanx.io, grab the auth-token from Merchant Portal → API, paste into .env.local. See docs/pending-production-setup.md.",
        );
    }
    if (!env.LEANX_COLLECTION_UUID) {
        throw new Error(
            "LEANX_COLLECTION_UUID is not set. Create a collection in Merchant Portal, copy its UUID into .env.local.",
        );
    }
    return {
        base: env.LEANX_API_BASE,
        authToken: env.LEANX_AUTH_TOKEN,
        collectionUuid: env.LEANX_COLLECTION_UUID,
    };
}

/**
 * POST to LeanX with the auth-token header. Returns parsed JSON, or throws on
 * non-2xx or non-2000 response_code.
 */
export async function leanxPost<T>(
    path: string,
    body: Record<string, unknown>,
): Promise<T> {
    const { base, authToken } = requireConfig();
    const url = `${base}${path}`;

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "auth-token": authToken,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        // Payment APIs are never cacheable.
        cache: "no-store",
    });

    const text = await res.text();
    let parsed: { response_code?: number; description?: string; data?: T } = {};
    try {
        parsed = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(
            `LeanX ${path}: non-JSON response (HTTP ${res.status}): ${text.slice(0, 300)}`,
        );
    }

    if (!res.ok) {
        throw new Error(
            `LeanX ${path}: HTTP ${res.status} — ${parsed.description ?? text.slice(0, 200)}`,
        );
    }
    if (parsed.response_code !== 2000) {
        throw new Error(
            `LeanX ${path}: response_code=${parsed.response_code} — ${parsed.description ?? "unknown error"}`,
        );
    }
    return parsed.data as T;
}

export function leanxCollectionUuid(): string {
    return requireConfig().collectionUuid;
}
