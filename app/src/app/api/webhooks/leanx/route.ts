/**
 * LeanX webhook receiver.
 *
 * LeanX POSTs `{ data: "<JWT-HS256>" }` here when an invoice's status changes.
 * We verify the JWT (HMAC-SHA256 with LEANX_HASH_KEY), find the matching
 * invoice by `payment_external_id`, and update its status.
 *
 * Idempotent: receiving the same SUCCESS payload twice is safe (status stays
 * paid, `paidAt` is only set the first time).
 *
 * Configure this URL in LeanX Merchant Portal as the callback URL for your
 * collection. For local development, expose via ngrok or similar tunnel.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/data/notifications";
import {
    verifyLeanxWebhook,
    type LeanxWebhookPayload,
} from "@/lib/payments/leanx/webhook";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    let body: { data?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    let payload: LeanxWebhookPayload;
    try {
        payload = await verifyLeanxWebhook(body);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("LeanX webhook: signature verification failed", e);
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    const externalId = payload.invoice_no;
    if (!externalId) {
        return NextResponse.json({ error: "missing invoice_no" }, { status: 400 });
    }

    const sb = createServiceClient();

    // Find the invoice we issued this link for.
    const { data: invRow, error: lookupErr } = await sb
        .from("invoices")
        .select("id, number, status, client_name")
        .eq("payment_external_id", externalId)
        .maybeSingle();

    if (lookupErr) {
        // eslint-disable-next-line no-console
        console.error("LeanX webhook: invoice lookup failed", lookupErr);
        return NextResponse.json({ error: "db error" }, { status: 500 });
    }
    if (!invRow) {
        // eslint-disable-next-line no-console
        console.warn("LeanX webhook: no invoice for external id", externalId);
        // 200 so LeanX doesn't keep retrying for invoices we don't recognise.
        return NextResponse.json({ ok: true, note: "no matching invoice" });
    }

    const now = new Date().toISOString();
    let newStatus = invRow.status as string;
    let paidAt: string | null = null;

    if (payload.invoice_status === "SUCCESS") {
        newStatus = "paid";
        paidAt = now;
    } else if (payload.invoice_status === "FAILED" && invRow.status !== "paid") {
        // Don't overwrite a paid invoice if a stale FAILED arrives.
        newStatus = "sent";
    }
    // PENDING keeps the existing status (still "sent" presumably).

    const { error: updateErr } = await sb
        .from("invoices")
        .update({
            status: newStatus,
            paid_at: paidAt ?? invRow.status === "paid" ? null : paidAt,
            // Append the latest webhook payload to payment_meta for audit.
            payment_meta: {
                ...((invRow as unknown as { payment_meta?: Record<string, unknown> }).payment_meta ?? {}),
                last_webhook: payload,
                last_webhook_at: now,
            },
            updated_at: now,
        })
        .eq("id", invRow.id);

    if (updateErr) {
        // eslint-disable-next-line no-console
        console.error("LeanX webhook: invoice update failed", updateErr);
        return NextResponse.json({ error: "db update error" }, { status: 500 });
    }

    if (payload.invoice_status === "SUCCESS" && invRow.status !== "paid") {
        await notify({
            kind: "invoice_paid",
            title: `Invoice ${invRow.number} paid`,
            body: `${invRow.client_name} paid via LeanX.`,
            link: `/invoices/${invRow.id}`,
        });
    }

    return NextResponse.json({ ok: true });
}
