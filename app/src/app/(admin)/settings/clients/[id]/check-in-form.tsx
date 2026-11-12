"use client";
/**
 * Log a check-in on the client page: the day we last spoke and one line on
 * what was said. Saves through logCheckInAction and refreshes, so the Clients
 * tab's "last check-in" and health move at once.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logCheckInAction } from "@/lib/clients/actions";

export function CheckInForm({ clientId, today }: { clientId: string; today: string }) {
    const router = useRouter();
    const [pending, start] = useTransition();
    const [date, setDate] = useState(today);
    const [note, setNote] = useState("");

    const submit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        start(async () => {
            const r = await logCheckInAction(clientId, date, note);
            if (!r.ok) {
                toast.error(r.reason);
                return;
            }
            toast.success(`Check-in logged for ${date}`);
            setNote("");
            router.refresh();
        });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="space-y-1.5 sm:w-44">
                <Label className="text-sm" htmlFor="check-in-date">
                    Date
                </Label>
                <Input id="check-in-date" type="date" value={date} max={today} required disabled={pending} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1.5">
                <Label className="text-sm" htmlFor="check-in-note">
                    What was said
                </Label>
                <Input id="check-in-note" value={note} maxLength={500} disabled={pending} placeholder="Happy with October; wants the renewal quote by the 20th" onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button type="submit" variant="outline" disabled={pending || !date}>
                {pending ? "Logging…" : "Log check-in"}
            </Button>
        </form>
    );
}
