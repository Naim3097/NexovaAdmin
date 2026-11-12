"use client";
/**
 * "Why was it lost?" — the small pop-up the board opens when a deal is dropped
 * on Lost, and the lead page opens from its Lost button and its Edit control.
 * A reason from LOST_REASONS and an optional note. Save hands the pick back;
 * closing any other way (Escape, the X, the backdrop) hands back null, and the
 * caller decides what that means — the board files the deal under "Other" so
 * a drop never silently fails, the lead page simply does nothing.
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LOST_REASONS, LOST_REASON_LABEL, isLostReason, type LostReasonKey } from "@/lib/leads/lost";

export type LostPick = { reason: LostReasonKey; note: string };

export function LostReasonDialog({
    open,
    name,
    reason: initialReason = "other",
    note: initialNote = "",
    editing = false,
    onClose,
}: {
    open: boolean;
    /** The deal, for the title. */
    name: string;
    reason?: LostReasonKey;
    note?: string;
    /** True when the deal is already lost and only the reason changes. */
    editing?: boolean;
    /** The pick on Save; null when the dialog was dismissed. */
    onClose: (pick: LostPick | null) => void;
}) {
    const [reason, setReason] = useState<LostReasonKey>(initialReason);
    const [note, setNote] = useState(initialNote);
    // Save closes the dialog too; this tells the close handler not to report a dismissal on top.
    const saved = useRef(false);

    const save = () => {
        saved.current = true;
        onClose({ reason, note: note.trim() });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next && !saved.current) onClose(null);
            }}
        >
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle className="pr-6 leading-snug">{editing ? "Lost reason" : "Why was it lost?"}</DialogTitle>
                    <DialogDescription>{name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <Label htmlFor="lost-reason" className="text-xs text-muted-foreground">
                            Reason
                        </Label>
                        <Select
                            value={reason}
                            items={LOST_REASON_LABEL}
                            onValueChange={(v) => {
                                if (isLostReason(v)) setReason(v);
                            }}
                        >
                            <SelectTrigger id="lost-reason" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LOST_REASONS.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {LOST_REASON_LABEL[r]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="lost-note" className="text-xs text-muted-foreground">
                            Note <span className="font-normal">(optional)</span>
                        </Label>
                        <Textarea
                            id="lost-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            placeholder="What they said, who they went with…"
                            className="min-h-14 text-sm"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onClose(null)}>
                        {editing ? "Cancel" : "Skip"}
                    </Button>
                    <Button type="button" onClick={save}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
