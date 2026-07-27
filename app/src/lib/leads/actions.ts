"use server";

import { revalidatePath, revalidateTag } from "next/cache";
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
import {
    billingAddressFor,
    createClient as createClientRecord,
    listClients,
    updateClient as updateClientRecord,
} from "@/lib/data/clients";
import { addInvoiceItem, createInvoice, updateInvoice } from "@/lib/data/invoices";
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
        billingAddress: String(formData.get("billingAddress") ?? "").trim(),
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

/**
 * Promote a won lead into a client record (the missing "deal → client" step).
 * Idempotent by client name: if a client with the same name already exists we
 * reuse it rather than create a duplicate. Marks the lead "won" and links it.
 */
export async function promoteLeadToClientAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const lead = await getLeadById(id);
    if (!lead) return;

    const clientName = (lead.company || lead.name).trim();
    const existing = (await listClients()).find(
        (c) => c.name.trim().toLowerCase() === clientName.toLowerCase(),
    );

    const client =
        existing ??
        (await createClientRecord({
            name: clientName,
            status: "active",
            contactName: lead.name,
            contactEmail: lead.email,
            contactPhone: lead.phone,
            billingAddress: lead.billingAddress,
            notes: lead.interestedIn ? `Interested in: ${lead.interestedIn}` : "",
        }));
    // Existing client without an address yet? Carry the lead's forward.
    if (existing && !existing.billingAddress && lead.billingAddress) {
        await updateClientRecord(existing.id, {
            billingAddress: lead.billingAddress,
        });
    }

    if (lead.status !== "won") {
        await updateLead(id, { status: "won" });
    }

    await recordAudit({
        entity: "lead",
        entityId: id,
        kind: "status",
        summary: existing
            ? `Promoted to existing client: ${client.name}`
            : `Promoted to new client: ${client.name}`,
    });
    await notify({
        kind: "lead_won",
        title: `Client ${existing ? "linked" : "created"}: ${client.name}`,
        body: `From lead ${lead.name}${lead.company ? ` (${lead.company})` : ""}`,
        link: `/settings/clients/${client.id}`,
    });

    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    revalidatePath("/pipeline");
    revalidatePath("/settings/clients");
    revalidatePath("/dashboard");
    revalidateTag("clients", "max");
    redirect(`/settings/clients/${client.id}`);
}

/**
 * Deposit-before-work, made real (playbook: Closed → Deposit received).
 * Creates a DRAFT deposit invoice for the lead's client — 50% of the estimated
 * value as a starting line (fully editable on the invoice) — and lands you on
 * it to adjust + send. Work should kick off once this is paid.
 */
/**
 * Upfront invoice from a won lead. Flexible by deal type:
 *   one-off project → 50% deposit (default)
 *   retainer        → 100% (full first payment before work starts)
 * The closer picks the % and can override the base amount (defaults to the
 * lead's estimated value). The line's sub-points state the base so "% of
 * what" is always visible on the invoice.
 */
export async function createDepositInvoiceAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const lead = await getLeadById(id);
    if (!lead) return;

    const pctRaw = Number(formData.get("pct"));
    const pct = Number.isFinite(pctRaw) ? Math.min(100, Math.max(1, pctRaw)) : 50;
    const baseRaw = Number(formData.get("baseMyr"));
    const base =
        Number.isFinite(baseRaw) && baseRaw > 0
            ? baseRaw
            : Math.max(0, lead.estValueMyr || 0);
    const amount = Math.round(base * (pct / 100) * 100) / 100;

    const clientName = (lead.company || lead.name).trim();
    const inv = await createInvoice({ clientName });
    // Bill-to: the lead's own address first (deal may predate the client
    // record), else whatever the client record has.
    const billTo = lead.billingAddress || (await billingAddressFor(clientName));
    if (billTo) await updateInvoice(inv.id, { billToAddress: billTo });
    const label =
        pct >= 100
            ? "Full upfront payment"
            : `Project deposit (${pct}%)`;
    await addInvoiceItem(inv.id, {
        description: `${label}${lead.interestedIn ? ` — ${lead.interestedIn}` : ""}`,
        details:
            pct >= 100
                ? ""
                : `${pct}% of MYR ${base.toLocaleString(undefined, { minimumFractionDigits: 2 })} total`,
        quantity: 1,
        unitPriceMyr: amount,
    });

    await recordAudit({
        entity: "lead",
        entityId: id,
        kind: "update",
        summary: `${label} invoice ${inv.number} created (MYR ${amount.toFixed(2)})`,
    });

    revalidatePath("/invoices");
    revalidatePath(`/leads/${id}`);
    redirect(`/invoices/${inv.id}`);
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
