/**
 * Create a LeanX payment link (bill page).
 *
 * Endpoint: POST /api/v1/merchant/create-bill-page
 * Docs: https://docs.leanx.io/api-docs/
 *
 * The returned `redirect_url` is what we email the client. Their payment status
 * arrives async via /api/webhooks/leanx (see ./webhook.ts).
 */
import "server-only";
import { leanxCollectionUuid, leanxPost } from "./client";
import type { PaymentLinkResult } from "../types";

export type LeanxCreateBillInput = {
    /** Amount in MYR. We round to 2 decimal places below. */
    amountMyr: number;
    /** Our internal reference (we use the invoice id or number). */
    invoiceRef: string;
    /** Where LeanX bounces the user after payment (success / fail / cancel). */
    redirectUrl: string;
    /** Webhook URL LeanX POSTs to on status change. */
    callbackUrl: string;
    fullName: string;
    email: string;
    phoneNumber: string;
};

type LeanxBillPageData = {
    collection_uuid: string;
    redirect_url: string; // hosted payment page URL
    bill_no: string;
    invoice_ref: string;
};

export async function leanxCreatePaymentLink(
    input: LeanxCreateBillInput,
): Promise<PaymentLinkResult> {
    const data = await leanxPost<LeanxBillPageData>(
        "/api/v1/merchant/create-bill-page",
        {
            collection_uuid: leanxCollectionUuid(),
            amount: input.amountMyr.toFixed(2),
            invoice_ref: input.invoiceRef,
            redirect_url: input.redirectUrl,
            callback_url: input.callbackUrl,
            full_name: input.fullName,
            email: input.email,
            phone_number: input.phoneNumber,
        },
    );

    return {
        provider: "leanx",
        url: data.redirect_url,
        externalId: data.bill_no,
        raw: data as unknown as Record<string, unknown>,
    };
}
