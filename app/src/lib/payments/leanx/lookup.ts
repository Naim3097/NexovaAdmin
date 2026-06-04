/**
 * Look up a LeanX payment by invoice number.
 *
 * Endpoint: POST /api/v1/merchant/manual-checking-transaction?invoice_no=...
 *
 * Use for: manual reconciliation, "Refresh status" button on invoice page,
 * and as the agent's `payments.checkInvoiceStatus` tool.
 */
import "server-only";
import { leanxPost } from "./client";
import type { PaymentStatus, PaymentStatusResult } from "../types";

type LeanxLookupData = {
    transaction_details?: {
        invoice_no?: string;
        fpx_invoice_no?: string;
        amount?: string;
        invoice_status?: "SUCCESS" | "PENDING" | "FAILED";
        providerTypeReference?: string;
        bank_provider?: string;
        amount_with_fee?: number;
        fee?: number;
    };
    customer_details?: {
        name?: string;
        phone_number?: string;
        email?: string;
    };
};

function mapStatus(s?: string): PaymentStatus {
    if (s === "SUCCESS") return "paid";
    if (s === "PENDING") return "pending";
    if (s === "FAILED") return "failed";
    return "unknown";
}

export async function leanxLookupPayment(
    invoiceNo: string,
): Promise<PaymentStatusResult> {
    const data = await leanxPost<LeanxLookupData>(
        `/api/v1/merchant/manual-checking-transaction?invoice_no=${encodeURIComponent(invoiceNo)}`,
        {},
    );
    const t = data.transaction_details ?? {};
    return {
        provider: "leanx",
        externalId: t.invoice_no ?? invoiceNo,
        status: mapStatus(t.invoice_status),
        amount: t.amount ? Number(t.amount) : undefined,
        raw: data as unknown as Record<string, unknown>,
    };
}
