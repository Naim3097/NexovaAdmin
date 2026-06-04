/**
 * Provider-neutral payment types.
 *
 * Today only LeanX is wired. Adding Stripe / Billplz later means:
 *   - new directory `src/lib/payments/<provider>/`
 *   - new branch in `createPaymentLink` switch
 *   - extend `PaymentProvider` union below
 *
 * The rest of the app talks only to the high-level functions in
 * `src/lib/payments/send-invoice.ts`.
 */

export type PaymentProvider = "leanx";

export type PaymentLinkResult = {
    provider: PaymentProvider;
    /** URL to send the client. They open it to pay. */
    url: string;
    /** Provider-side identifier (e.g. LeanX `bill_no`). Use for reconciliation. */
    externalId: string;
    /** Raw provider response, kept for audit. */
    raw: Record<string, unknown>;
};

export type PaymentStatus = "pending" | "paid" | "failed" | "unknown";

export type PaymentStatusResult = {
    provider: PaymentProvider;
    externalId: string;
    status: PaymentStatus;
    amount?: number;
    paidAt?: string;
    raw: Record<string, unknown>;
};
