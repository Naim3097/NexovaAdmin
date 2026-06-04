"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    recordManualPaymentAction,
    type ActionResult,
} from "@/lib/invoices/actions";
import { useState } from "react";

const initial: ActionResult = { ok: false };

type Props = {
    invoiceId: string;
    invoiceTotal: number;
    isPaid: boolean;
};

const METHODS = [
    { value: "bank_transfer", label: "Bank transfer (TT / IBG / FPX manual)" },
    { value: "cheque", label: "Cheque" },
    { value: "cash", label: "Cash" },
    { value: "credit_card", label: "Credit card (offline)" },
    { value: "other", label: "Other" },
];

export function ManualPaymentForm({ invoiceId, invoiceTotal, isPaid }: Props) {
    const today = new Date().toISOString().slice(0, 10);
    const [method, setMethod] = useState<string>("bank_transfer");
    const [state, formAction, pending] = useActionState(
        recordManualPaymentAction,
        initial,
    );

    return (
        <section className="rounded-lg border bg-card p-4 md:p-6">
            <h2 className="text-sm font-medium">
                Record manual payment{" "}
                <span className="text-xs font-normal text-muted-foreground">
                    (bank transfer / cheque / cash)
                </span>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
                Use this when the client pays outside LeanX (e.g. direct bank
                transfer for big clients).
            </p>

            {isPaid ? (
                <p className="mt-3 rounded-md border bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                    Already marked paid. Records below are for reference only — re-recording will
                    update the payment metadata.
                </p>
            ) : null}

            <form action={formAction} className="mt-4 space-y-3">
                <input type="hidden" name="id" value={invoiceId} />
                <input type="hidden" name="method" value={method} />

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Payment method</Label>
                        <Select value={method} onValueChange={(v) => setMethod(v ?? "bank_transfer")}>
                            <SelectTrigger className="h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {METHODS.map((m) => (
                                    <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="reference" className="text-sm">
                            Reference (optional)
                        </Label>
                        <Input
                            id="reference"
                            name="reference"
                            placeholder="TT12345 / Cheque 0042 / etc."
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="amount" className="text-sm">
                            Amount received (MYR)
                        </Label>
                        <Input
                            id="amount"
                            name="amount"
                            type="number"
                            step="0.01"
                            defaultValue={invoiceTotal.toFixed(2)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="paidDate" className="text-sm">
                            Paid date
                        </Label>
                        <Input
                            id="paidDate"
                            name="paidDate"
                            type="date"
                            defaultValue={today}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="paymentNotes" className="text-sm">
                        Notes (optional)
                    </Label>
                    <Textarea
                        id="paymentNotes"
                        name="paymentNotes"
                        rows={2}
                        placeholder="e.g. confirmed via WhatsApp on 3 June"
                    />
                </div>

                <Button type="submit" disabled={pending}>
                    {pending ? "Recording…" : "Mark as paid"}
                </Button>

                {state.message ? (
                    <p
                        role="status"
                        className={`text-sm ${state.ok ? "text-emerald-600" : "text-destructive"}`}
                    >
                        {state.message}
                    </p>
                ) : null}
            </form>
        </section>
    );
}
