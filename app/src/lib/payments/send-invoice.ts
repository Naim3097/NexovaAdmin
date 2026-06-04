/**
 * High-level "send this invoice to the client" entry point.
 *
 * Given an invoice id:
 *   1. Loads the invoice + computes the total (MYR).
 *   2. Generates a payment link via the chosen provider (LeanX today).
 *   3. Stamps the link + provider + external id back onto the invoice row.
 *   4. Returns the link so the caller can email/share it.
 *
 * Provider-neutral on purpose — adding Stripe later means one new branch here.
 */
import "server-only";
import { env } from "@/lib/env";
import { getInvoiceById, updateInvoice, computeTotals } from "@/lib/data/invoices";
import { leanxCreatePaymentLink } from "./leanx/create";
import { leanxLookupPayment } from "./leanx/lookup";
import type { PaymentLinkResult, PaymentStatusResult } from "./types";

export type GenerateInvoiceLinkInput = {
    invoiceId: string;
    /** Where LeanX redirects the user after they finish (success/fail/cancel). */
    successUrl?: string;
    /** Optional override if the invoice's client lacks contact details. */
    customer?: {
        fullName?: string;
        email?: string;
        phoneNumber?: string;
    };
};

export async function generateInvoicePaymentLink(
    input: GenerateInvoiceLinkInput,
): Promise<PaymentLinkResult> {
    const inv = await getInvoiceById(input.invoiceId);
    if (!inv) throw new Error(`Invoice ${input.invoiceId} not found`);

    const totals = computeTotals(inv);
    if (totals.total <= 0) {
        throw new Error(
            `Invoice ${inv.number} has zero total — add line items before generating a payment link.`,
        );
    }

    const fullName = input.customer?.fullName ?? inv.clientName;
    const email = input.customer?.email ?? "noreply@example.com"; // LeanX requires it
    const phone = input.customer?.phoneNumber ?? "0000000000";

    const callbackUrl = `${env.NEXT_PUBLIC_SITE_URL}/api/webhooks/leanx`;
    const redirectUrl =
        input.successUrl ?? `${env.NEXT_PUBLIC_SITE_URL}/invoices/${inv.id}`;

    const result = await leanxCreatePaymentLink({
        amountMyr: totals.total,
        invoiceRef: inv.number,
        redirectUrl,
        callbackUrl,
        fullName,
        email,
        phoneNumber: phone,
    });

    await updateInvoice(inv.id, {
        paymentProvider: result.provider,
        paymentLink: result.url,
        paymentExternalId: result.externalId,
        paymentMeta: result.raw,
        paymentLinkCreatedAt: new Date().toISOString(),
        // Bump status from draft → sent the moment a link exists (still editable).
        status: inv.status === "draft" ? "sent" : inv.status,
    });

    return result;
}

export async function checkInvoicePaymentStatus(
    invoiceId: string,
): Promise<PaymentStatusResult> {
    const inv = await getInvoiceById(invoiceId);
    if (!inv) throw new Error(`Invoice ${invoiceId} not found`);
    if (!inv.paymentExternalId) {
        throw new Error(
            `Invoice ${inv.number} has no payment link yet — generate one first.`,
        );
    }
    return leanxLookupPayment(inv.paymentExternalId);
}
