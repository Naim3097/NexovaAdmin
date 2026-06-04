"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    sendOnboardingLinkAction,
    type FormState,
} from "@/lib/onboarding/actions";

const initial: FormState = { ok: false };

export function SendLinkForm({ id }: { id: string }) {
    const [state, formAction, pending] = useActionState(
        sendOnboardingLinkAction,
        initial,
    );

    return (
        <form action={formAction} className="space-y-3">
            <input type="hidden" name="id" value={id} />
            <div className="space-y-2">
                <Label htmlFor="link-email">Send onboarding link to</Label>
                <div className="flex flex-col gap-2 md:flex-row">
                    <Input
                        id="link-email"
                        name="email"
                        type="email"
                        inputMode="email"
                        required
                        placeholder="client@example.com"
                        className="md:max-w-sm"
                    />
                    <Button type="submit" disabled={pending}>
                        {pending ? "Sending…" : "Send link"}
                    </Button>
                </div>
            </div>
            {state.message ? (
                <p
                    role="status"
                    className={`text-sm ${state.ok ? "text-emerald-600" : "text-destructive"}`}
                >
                    {state.message}
                </p>
            ) : null}
        </form>
    );
}
