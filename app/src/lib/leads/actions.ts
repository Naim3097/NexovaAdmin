"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    createLead,
    deleteLead,
    getLeadById,
    LEAD_SOURCES,
    LEAD_STATUSES,
    listLeads,
    updateLead,
    type Lead,
    type LeadSource,
    type LeadStatus,
} from "@/lib/data/leads";
import { listTeamMembers } from "@/lib/data/team";
import { createSubmission } from "@/lib/data/onboarding";
import { pickAssignee, scoreLead } from "@/lib/leads/scoring";
import { notify } from "@/lib/data/notifications";
import { diffFields, recordAudit } from "@/lib/data/audit";

function asStatus(v: FormDataEntryValue | null): LeadStatus {
    const s = String(v ?? "");
    return (LEAD_STATUSES as readonly string[]).includes(s)
        ? (s as LeadStatus)
        : "new";
}

function asSource(v: FormDataEntryValue | null): LeadSource {
    const s = String(v ?? "");
    return (LEAD_SOURCES as readonly string[]).includes(s)
        ? (s as LeadSource)
        : "other";
}

function nullableId(v: FormDataEntryValue | null): string | null {
    const s = String(v ?? "").trim();
    return s.length > 0 && s !== "none" ? s : null;
}

export async function createLeadAction(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const lead = await createLead({
        name,
        company: String(formData.get("company") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        source: asSource(formData.get("source")),
        sourceCampaignId: nullableId(formData.get("sourceCampaignId")),
        interestedIn: String(formData.get("interestedIn") ?? "").trim(),
        estValueMyr: Number(formData.get("estValueMyr") ?? 0) || 0,
        notes: String(formData.get("notes") ?? "").trim(),
    });
    // Score + auto-assign in a single follow-up update.
    const [allLeads, team] = await Promise.all([
        listLeads(),
        listTeamMembers(),
    ]);
    const fresh = (await getLeadById(lead.id)) ?? lead;
    const breakdown = scoreLead(fresh);
    const assignee = pickAssignee(team, allLeads);
    await updateLead(lead.id, {
        score: breakdown.score,
        assignedTo: assignee?.name ?? "",
    });
    await recordAudit({
        entity: "lead",
        entityId: lead.id,
        kind: "create",
        summary: `Lead created: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
    });
    await notify({
        kind: "lead_new",
        title: `New lead: ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
        body:
            `Score ${breakdown.score} (${breakdown.band})` +
            (assignee ? ` · assigned to ${assignee.name}` : " · unassigned"),
        link: `/leads/${lead.id}`,
    });
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
    redirect(`/leads/${lead.id}`);
}

export async function updateLeadAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const patch: Partial<Omit<Lead, "id" | "createdAt">> = {
        name: String(formData.get("name") ?? "").trim(),
        company: String(formData.get("company") ?? "").trim(),
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        source: asSource(formData.get("source")),
        sourceCampaignId: nullableId(formData.get("sourceCampaignId")),
        interestedIn: String(formData.get("interestedIn") ?? "").trim(),
        estValueMyr: Number(formData.get("estValueMyr") ?? 0) || 0,
        notes: String(formData.get("notes") ?? "").trim(),
    };
    // Re-score whenever scoring inputs change.
    const existing = await getLeadById(id);
    if (existing) {
        const candidate: Lead = { ...existing, ...patch };
        patch.score = scoreLead(candidate).score;
    }
    await updateLead(id, patch);
    if (existing) {
        const after = (await getLeadById(id)) ?? existing;
        const changes = diffFields(
            existing as unknown as Record<string, unknown>,
            after as unknown as Record<string, unknown>,
            [
                "name",
                "company",
                "email",
                "phone",
                "source",
                "sourceCampaignId",
                "interestedIn",
                "estValueMyr",
                "notes",
                "score",
            ],
        );
        if (changes.length > 0) {
            await recordAudit({
                entity: "lead",
                entityId: id,
                kind: "update",
                summary: `Lead updated (${changes.length} field${changes.length === 1 ? "" : "s"})`,
                changes,
            });
        }
    }
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
}

export async function setLeadStatusAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const status = asStatus(formData.get("status"));
    if (!id) return;
    const before = await getLeadById(id);
    await updateLead(id, { status });
    if (before && before.status !== status) {
        await recordAudit({
            entity: "lead",
            entityId: id,
            kind: "status",
            summary: `Status: ${before.status} → ${status}`,
            changes: [{ field: "status", before: before.status, after: status }],
        });
    }
    if (before && before.status !== status && (status === "won" || status === "lost")) {
        await notify({
            kind: status === "won" ? "lead_won" : "lead_lost",
            title: `Lead ${status}: ${before.name}${before.company ? ` (${before.company})` : ""}`,
            body:
                status === "won"
                    ? `Estimated value: MYR ${before.estValueMyr.toLocaleString()}`
                    : "",
            link: `/leads/${id}`,
        });
    }
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
}

export async function deleteLeadAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteLead(id);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    revalidatePath("/dashboard");
    redirect("/leads");
}

export async function setLeadAssigneeAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const raw = String(formData.get("assignedTo") ?? "").trim();
    const assignedTo = raw === "none" ? "" : raw;
    await updateLead(id, { assignedTo });
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
}

export async function rescoreLeadAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const lead = await getLeadById(id);
    if (!lead) return;
    const breakdown = scoreLead(lead);
    await updateLead(id, { score: breakdown.score });
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
}

export async function convertLeadToOnboardingAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const lead = await getLeadById(id);
    if (!lead) return;
    const sub = await createSubmission({
        clientName: lead.company || lead.name,
    });
    await updateLead(id, {
        onboardingSubmissionId: sub.id,
        status: "won",
    });
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    revalidatePath("/onboarding");
    redirect(`/onboarding/${sub.id}`);
}
