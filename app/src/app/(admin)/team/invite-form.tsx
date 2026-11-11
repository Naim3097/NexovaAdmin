"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { inviteTeamMemberAction, type InviteState } from "@/lib/team/actions";

const initial: InviteState = { ok: false };

type Option = { value: string; label: string; hint?: string };

export function InviteForm({
    roles,
    systemRoles,
    functions,
}: {
    /** Company roles (the job they do). */
    roles: readonly string[];
    /** Permission sets (one per login), value + label, passed in because the role table is server-only. */
    systemRoles: ReadonlyArray<Option>;
    /** Duties (several allowed). */
    functions: ReadonlyArray<Option>;
}) {
    const [state, formAction, pending] = useActionState(
        inviteTeamMemberAction,
        initial,
    );

    return (
        <div className="space-y-4 rounded-lg border bg-card p-4 md:p-6">
            <div>
                <h2 className="text-sm font-medium">Invite team member</h2>
                <p className="text-xs text-muted-foreground">
                    Creates their login and a one-time link to set a password.
                </p>
            </div>

            <form action={formAction} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" required placeholder="e.g. Danis" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Job</Label>
                        <Select name="role" defaultValue="Other">
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {roles.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {r}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Email</Label>
                        <Input name="email" type="email" required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Phone</Label>
                        <Input name="phone" type="tel" placeholder="+60..." />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Skills (comma-separated)</Label>
                    <Input name="skills" placeholder="React, Figma, Copywriting" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                    <fieldset className="space-y-1.5">
                        <legend className="text-sm font-medium">Access</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {systemRoles.map((r) => (
                                <label key={r.value} className="flex items-center gap-2 text-sm">
                                    <input
                                        type="radio"
                                        name="systemRole"
                                        value={r.value}
                                        defaultChecked={r.value === "user"}
                                        className="size-4 border-input"
                                    />
                                    {r.label}
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Admin and management see everything; a user sees only what is assigned to them.
                        </p>
                    </fieldset>
                    <fieldset className="space-y-1.5">
                        <legend className="text-sm font-medium">Duties</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {functions.map((f) => (
                                <label key={f.value} className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        name="functions"
                                        value={f.value}
                                        className="size-4 rounded border-input"
                                    />
                                    {f.label}
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Each adds pages and work (pipeline, approvals, finance).
                        </p>
                    </fieldset>
                </div>
                <div className="flex justify-end">
                    <Button type="submit" disabled={pending}>
                        {pending ? "Inviting…" : "Invite member"}
                    </Button>
                </div>
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
                        Send this to the teammate. It signs them in once so they
                        can choose a password. Single use.
                    </p>
                </div>
            ) : null}
        </div>
    );
}
