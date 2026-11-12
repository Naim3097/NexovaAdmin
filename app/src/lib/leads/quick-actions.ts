"use server";
/**
 * The pipeline board's direct edits: move a deal to another stage (a drop on a
 * column) and record why a deal was lost. Plain arguments in, a result out, so
 * the client component can show the move at once and offer Undo in a toast —
 * Undo is the same call back to `from`. The lead page's status forms
 * (setLeadStatusAction) run through this very function, so both write the same
 * audit entry and send the same won / lost notification.
 *
 * A move to Lost carries the reason the team picked; a move without one keeps
 * whatever reason the lead already has (Undo back to Lost restores it), and a
 * move out of Lost leaves the reason in place so nothing is thrown away.
 */
import { revalidatePath } from "next/cache";
import { getActingMember } from "@/lib/auth";
import { recordAudit } from "@/lib/data/audit";
import { LEAD_STATUSES, getLeadById, updateLead, type Lead, type LeadStatus } from "@/lib/data/leads";
import { notify } from "@/lib/data/notifications";
import { isLostReason, lostReasonLabel, type LostReasonKey } from "@/lib/leads/lost";

export type MoveLeadResult = { ok: true; from: LeadStatus } | { ok: false; reason: string };
export type LostReasonResult = { ok: true } | { ok: false; reason: string };

/** The pick from the lost-reason dialog; an unknown reason is filed as "other" so the move never fails on it. */
function lostPatch(reason: string | undefined, note: string | undefined): { lostReason: LostReasonKey; lostNote: string } | null {
    if (reason === undefined) return null;
    return { lostReason: isLostReason(reason) ? reason : "other", lostNote: (note ?? "").trim() };
}

function revalidateLead(id: string) {
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
}

/** Move a lead to `to`. `as` is the `?as=` pick under the dev bypass, so the audit trail names who acted. */
export async function moveLeadAction(input: { id: string; to: LeadStatus; as?: string; lostReason?: string; lostNote?: string }): Promise<MoveLeadResult> {
    if (!input.id) return { ok: false, reason: "Lead not found" };
    if (!(LEAD_STATUSES as readonly string[]).includes(input.to)) return { ok: false, reason: "Unknown stage" };
    const before = await getLeadById(input.id);
    if (!before) return { ok: false, reason: "Lead not found" };
    const from = before.status;
    const lost = input.to === "lost" ? lostPatch(input.lostReason, input.lostNote) : null;

    // Any human action acknowledges an auto-intake lead — the "New" remark goes.
    await updateLead(input.id, { status: input.to, autoIntake: false, ...(lost ?? {}) });

    if (from !== input.to) {
        const reason = lost?.lostReason ?? before.lostReason;
        // With a real login the audit trail resolves the actor itself; under the dev bypass the pick says who.
        const picked = input.as ? (await getActingMember(input.as))?.name : undefined;
        await recordAudit({
            entity: "lead",
            entityId: input.id,
            kind: "status",
            summary: `Status: ${from} → ${input.to}${input.to === "lost" && reason ? ` (${lostReasonLabel(reason)})` : ""}`,
            ...(picked ? { actor: picked } : {}),
            changes: [
                { field: "status", before: from, after: input.to },
                ...(lost && lost.lostReason !== before.lostReason ? [{ field: "lostReason", before: before.lostReason, after: lost.lostReason }] : []),
            ],
        });
        if (input.to === "won" || input.to === "lost") {
            await notify({
                kind: input.to === "won" ? "lead_won" : "lead_lost",
                title: `Lead ${input.to}: ${before.name}${before.company ? ` (${before.company})` : ""}`,
                body: input.to === "won" ? `Estimated value: MYR ${before.estValueMyr.toLocaleString()}` : reason ? `Reason: ${lostReasonLabel(reason)}${lost?.lostNote ? ` — ${lost.lostNote}` : ""}` : "",
                link: `/leads/${input.id}`,
            });
        }
    } else if (lost) {
        // Already lost: only the reason changed.
        await auditLostReason(input.id, before, lost.lostReason, input.as);
    }

    revalidateLead(input.id);
    return { ok: true, from };
}

/** Change why a lead was lost (the lead page's Edit control). Does not touch the status. */
export async function setLostReasonAction(input: { id: string; reason: string; note?: string; as?: string }): Promise<LostReasonResult> {
    if (!input.id) return { ok: false, reason: "Lead not found" };
    if (!isLostReason(input.reason)) return { ok: false, reason: "Pick a reason" };
    const before = await getLeadById(input.id);
    if (!before) return { ok: false, reason: "Lead not found" };
    const note = (input.note ?? "").trim();
    if (before.lostReason === input.reason && before.lostNote === note) return { ok: true };

    await updateLead(input.id, { lostReason: input.reason, lostNote: note, autoIntake: false });
    await auditLostReason(input.id, before, input.reason, input.as);
    revalidateLead(input.id);
    return { ok: true };
}

async function auditLostReason(id: string, before: Lead, reason: LostReasonKey, as?: string) {
    const picked = as ? (await getActingMember(as))?.name : undefined;
    await recordAudit({
        entity: "lead",
        entityId: id,
        kind: "update",
        summary: `Lost reason: ${lostReasonLabel(reason)}`,
        ...(picked ? { actor: picked } : {}),
        changes: before.lostReason !== reason ? [{ field: "lostReason", before: before.lostReason, after: reason }] : [],
    });
}
