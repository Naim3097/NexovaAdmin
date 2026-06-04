"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    generatePaymentLinkAction,
    refreshPaymentStatusAction,
    type ActionResult,
} from "@/lib/invoices/actions";

const initial: ActionResult = { ok: false };

type Props = {
    invoiceId: string;
    paymentLink: string | null;
    paymentExternalId: string | null;
    paymentLinkCreatedAt: string | null;
    clientName: string;
};

export function PaymentSection({
    invoiceId,
    paymentLink,
    paymentExternalId,
    paymentLinkCreatedAt,
    clientName,
}: Props) {
    const [genState, genAction, genPending] = useActionState(
        generatePaymentLinkAction,
        initial,
    );
    const [refreshState, refreshAction, refreshPending] = useActionState(
        refreshPaymentStatusAction,
        initial,
    );

    const buttonLabel = paymentLink ? "Regenerate link" : "Generate payment link";

    return (
        <section className="rounded-lg border bg-card p-4 md:p-6">
            <h2 className="text-sm font-medium">
                Online payment link{" "}
                <span className="text-xs font-normal text-muted-foreground">
                    (LeanX / FPX — for clients who prefer one-click pay)
                </span>
            </h2>

            {paymentLink ? (
                <div className="mt-3 space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Payment link
                    </p>
                    <p className="break-all text-sm">
                        <a
                            href={paymentLink}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                        >
                            {paymentLink}
                        </a>
                    </p>
                    <p className="text-xs text-muted-foreground">
                        LeanX bill no: <span className="font-mono">{paymentExternalId}</span>
                        {paymentLinkCreatedAt
                            ? ` · Created ${new Date(paymentLinkCreatedAt).toLocaleString()}`
                            : ""}
                    </p>
                </div>
            ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                    No payment link yet. Generate one to send the client.
                </p>
            )}

            <form action={genAction} className="mt-4 space-y-3">
                <input type="hidden" name="id" value={invoiceId} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="customerName" className="text-sm">
                            Client full name
                        </Label>
                        <Input
                            id="customerName"
                            name="customerName"
                            defaultValue={clientName}
                            placeholder="Required by LeanX"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="customerEmail" className="text-sm">
                            Client email
                        </Label>
                        <Input
                            id="customerEmail"
                            name="customerEmail"
                            type="email"
                            placeholder="client@example.com"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="customerPhone" className="text-sm">
                            Client phone
                        </Label>
                        <Input
                            id="customerPhone"
                            name="customerPhone"
                            type="tel"
                            placeholder="0123456789"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={genPending}>
                        {genPending ? "Generating…" : buttonLabel}
                    </Button>
                    {paymentExternalId ? (
                        <form action={refreshAction}>
                            <input type="hidden" name="id" value={invoiceId} />
                            <Button type="submit" variant="outline" disabled={refreshPending}>
                                {refreshPending ? "Checking…" : "Refresh status"}
                            </Button>
                        </form>
                    ) : null}
                </div>
                {genState.message ? (
                    <p
                        role="status"
                        className={`text-sm ${genState.ok ? "text-emerald-600" : "text-destructive"}`}
                    >
                        {genState.message}
                    </p>
                ) : null}
                {refreshState.message ? (
                    <p
                        role="status"
                        className={`text-sm ${refreshState.ok ? "text-emerald-600" : "text-destructive"}`}
                    >
                        {refreshState.message}
                    </p>
                ) : null}
            </form>
        </section>
    );
}
