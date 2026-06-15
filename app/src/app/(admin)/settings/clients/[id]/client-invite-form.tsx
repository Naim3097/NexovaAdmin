"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    inviteClientAction,
    type ClientInviteState,
} from "@/lib/clients/actions";

const initial: ClientInviteState = { ok: false };

export function ClientInviteForm({
    clientId,
    defaultEmail,
    linked,
}: {
    clientId: string;
    defaultEmail: string;
    linked: boolean;
}) {
    const [state, formAction, pending] = useActionState(
        inviteClientAction,
        initial,
    );

    return (
        <div className="space-y-3 border-t pt-4">
            <div>
                <p className="text-sm font-medium">Portal login</p>
                <p className="text-xs text-muted-foreground">
                    {linked
                        ? "This client has a portal login. Re-invite to send a fresh set-password link."
                        : "Invite the client to their portal — creates a login and a one-time set-password link."}
                </p>
            </div>
            <form
                action={formAction}
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
            >
                <input type="hidden" name="id" value={clientId} />
                <div className="flex-1 space-y-1.5">
                    <Label className="text-sm">Client contact email</Label>
                    <Input
                        name="email"
                        type="email"
                        required
                        defaultValue={defaultEmail}
                        placeholder="client@company.com"
                    />
                </div>
                <Button type="submit" variant="outline" disabled={pending}>
                    {pending
                        ? "Inviting…"
                        : linked
                            ? "Re-invite"
                            : "Invite to portal"}
                </Button>
            </form>

            {state.message ? (
                <p
                    role="status"
                    className={`text-sm ${state.ok ? "text-green-600" : "text-destructive"}`}
                >
                    {state.message}
                </p>
            ) : null}

            {state.ok && state.inviteLink ? (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3">
                    <p className="text-xs font-medium">Set-password link</p>
                    <p className="break-all rounded bg-background p-2 font-mono text-[11px]">
                        {state.inviteLink}
                    </p>
                    <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(
                                    state.inviteLink!,
                                );
                                toast.success("Invite link copied");
                            } catch {
                                toast.error("Couldn't copy — select it manually");
                            }
                        }}
                    >
                        Copy link
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                        Send to the client. Signs them in once to choose a
                        password, then lands them in their portal. Single use.
                    </p>
                </div>
            ) : null}
        </div>
    );
}
