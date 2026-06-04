/**
 * LeanX webhook verification + payload parsing.
 *
 * Per LeanX docs, the webhook body is:
 *   { "data": "<JWT signed HS256 with HASH_KEY>" }
 *
 * The JWT payload looks like:
 *   {
 *     invoice_no, amount, invoice_status: "SUCCESS"|"PENDING"|"FAILED",
 *     fpx_buyer_name, fpx_transaction_id, transaction_response_time, ...
 *     client_data: { merchant_invoice_no, uuid, order_id }
 *   }
 *
 * If the signature doesn't verify with our `LEANX_HASH_KEY`, the request is
 * untrusted — caller should 401 and log.
 */
import "server-only";
import { jwtVerify } from "jose";
import { env } from "@/lib/env";

export type LeanxWebhookPayload = {
    invoice_no: string;
    amount: string;
    invoice_status: "SUCCESS" | "PENDING" | "FAILED";
    fpx_buyer_name?: string;
    fpx_transaction_id?: string;
    transaction_response_time?: string;
    original_transaction_response_time?: string;
    client_data?: {
        merchant_invoice_no?: string;
        uuid?: string;
        order_id?: string;
    };
    [key: string]: unknown;
};

export async function verifyLeanxWebhook(body: {
    data?: string;
}): Promise<LeanxWebhookPayload> {
    if (!env.LEANX_HASH_KEY) {
        throw new Error(
            "LEANX_HASH_KEY is not set; cannot verify webhook signature.",
        );
    }
    if (!body.data || typeof body.data !== "string") {
        throw new Error("LeanX webhook: missing `data` field");
    }

    // LeanX docs describe `data` as a "Base64-encoded JWT" — but a JWT is
    // already base64url-encoded, so in practice the value IS the JWT string.
    // Some integrators have observed it wrapped in an extra base64 layer;
    // we try the JWT directly first, fall back to a base64 decode if that fails.
    const jwt = looksLikeJwt(body.data)
        ? body.data
        : Buffer.from(body.data, "base64").toString("utf8");

    const secret = new TextEncoder().encode(env.LEANX_HASH_KEY);

    const { payload } = await jwtVerify(jwt, secret, {
        algorithms: ["HS256"],
    });

    return payload as unknown as LeanxWebhookPayload;
}

function looksLikeJwt(s: string): boolean {
    return s.split(".").length === 3;
}
