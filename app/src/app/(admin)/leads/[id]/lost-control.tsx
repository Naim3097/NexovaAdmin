"use client";
/**
 * The lead page's two ways into the lost-reason dialog: the "Lost" button in
 * the Move to row (moves the deal and records why in one save) and the "Edit"
 * control beside the recorded reason once the deal is lost. Dismissing the
 * dialog here does nothing — on this page the move is deliberate.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LOST_REASON_LABEL, type LostReason } from "@/lib/leads/lost";
import { moveLeadAction, setLostReasonAction } from "@/lib/leads/quick-actions";
import { LostReasonDialog, type LostPick } from "@/app/(admin)/pipeline/lost-reason-dialog";

export function LostReasonControl({
    id,
    name,
    mode,
    lostReason,
    lostNote,
    asParam,
}: {
    id: string;
    name: string;
    /** "move": the deal is open and this marks it lost. "edit": it is lost; change the reason. */
    mode: "move" | "edit";
    lostReason: LostReason;
    lostNote: string;
    /** `?as=` under the dev bypass, so the server knows who is acting. */
    asParam?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, start] = useTransition();

    const save = (pick: LostPick) =>
        start(async () => {
            const r =
                mode === "edit"
                    ? await setLostReasonAction({ id, reason: pick.reason, note: pick.note, as: asParam })
                    : await moveLeadAction({ id, to: "lost", as: asParam, lostReason: pick.reason, lostNote: pick.note });
            if (!r.ok) {
                toast.error(r.reason);
                return;
            }
            toast.success(mode === "edit" ? `Lost reason: ${LOST_REASON_LABEL[pick.reason]}` : `Lost: ${name}`, { description: LOST_REASON_LABEL[pick.reason] });
            router.refresh();
        });

    return (
        <>
            {mode === "edit" ? (
                <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={() => setOpen(true)}>
                    Edit
                </Button>
            ) : (
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setOpen(true)}>
                    Lost
                </Button>
            )}
            {open ? (
                <LostReasonDialog
                    open
                    name={name}
                    editing={mode === "edit"}
                    reason={lostReason || "other"}
                    note={lostNote}
                    onClose={(pick) => {
                        setOpen(false);
                        if (pick) save(pick);
                    }}
                />
            ) : null}
        </>
    );
}
