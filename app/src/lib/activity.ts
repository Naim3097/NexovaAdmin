/**
 * Activity feed aggregator.
 *
 * Derives a unified timeline from the existing dev-store JSON files.
 * No new persistent store — events are computed on read from the timestamps
 * already on each record. Trade-off: we cannot show full status-change history
 * (only the latest state), but we avoid dual-writes and stay in sync with the
 * source of truth automatically.
 *
 * When Supabase lands, replace this with a real `activity_events` table
 * written to by triggers or in the action layer. The shape here is a
 * deliberate template for that future table.
 */
import { computeTotals } from "@/lib/data/invoices";
import {
    listLeads,
    listProjects,
    listInvoices,
    listContentPosts,
    listCampaigns,
    listSubmissions,
} from "@/lib/data/reads";

export const ACTIVITY_ENTITIES = [
    "lead",
    "project",
    "invoice",
    "content",
    "campaign",
    "onboarding",
] as const;
export type ActivityEntity = (typeof ACTIVITY_ENTITIES)[number];

export const ACTIVITY_KINDS = [
    "lead.created",
    "lead.status",
    "project.created",
    "project.status",
    "project.phase",
    "project.task",
    "project.deliverable",
    "project.deliverable_approved",
    "project.signoff",
    "invoice.created",
    "invoice.sent",
    "invoice.paid",
    "content.scheduled",
    "content.posted",
    "campaign.created",
    "campaign.metric",
    "onboarding.created",
    "onboarding.submitted",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type ActivityEvent = {
    id: string;
    at: string; // ISO
    entity: ActivityEntity;
    entityId: string;
    kind: ActivityKind;
    title: string;
    detail: string;
    href: string;
    amountMyr: number; // 0 when not applicable
    actor: string; // "" when unknown
};

const MIN_GAP_MS = 1500; // ignore status events that fire within ~creation window

function isMeaningfullyAfter(updatedAt: string, createdAt: string): boolean {
    return Date.parse(updatedAt) - Date.parse(createdAt) > MIN_GAP_MS;
}

export async function listActivity(): Promise<ActivityEvent[]> {
    const [leads, projects, invoices, content, campaigns, onboardings] =
        await Promise.all([
            listLeads(),
            listProjects(),
            listInvoices(),
            listContentPosts(),
            listCampaigns(),
            listSubmissions(),
        ]);

    const out: ActivityEvent[] = [];

    // Leads
    for (const l of leads) {
        out.push({
            id: `lead:${l.id}:created`,
            at: l.createdAt,
            entity: "lead",
            entityId: l.id,
            kind: "lead.created",
            title: `New lead: ${l.name}${l.company ? ` · ${l.company}` : ""}`,
            detail: `Source: ${l.source.replace(/_/g, " ")}${l.estValueMyr > 0
                    ? ` · est. MYR ${l.estValueMyr.toLocaleString()}`
                    : ""
                }`,
            href: `/leads/${l.id}`,
            amountMyr: l.estValueMyr || 0,
            actor: "",
        });
        if (l.status !== "new" && isMeaningfullyAfter(l.updatedAt, l.createdAt)) {
            out.push({
                id: `lead:${l.id}:status:${l.status}`,
                at: l.updatedAt,
                entity: "lead",
                entityId: l.id,
                kind: "lead.status",
                title: `Lead → ${l.status}: ${l.name}`,
                detail:
                    l.status === "won" && l.estValueMyr > 0
                        ? `Won MYR ${l.estValueMyr.toLocaleString()}`
                        : "",
                href: `/leads/${l.id}`,
                amountMyr: l.status === "won" ? l.estValueMyr || 0 : 0,
                actor: "",
            });
        }
    }

    // Onboardings
    for (const s of onboardings) {
        out.push({
            id: `onboarding:${s.id}:created`,
            at: s.createdAt,
            entity: "onboarding",
            entityId: s.id,
            kind: "onboarding.created",
            title: `Onboarding started: ${s.clientName}`,
            detail: s.checklistSlug,
            href: `/onboarding/${s.id}`,
            amountMyr: 0,
            actor: "",
        });
        if (s.submittedAt) {
            out.push({
                id: `onboarding:${s.id}:submitted`,
                at: s.submittedAt,
                entity: "onboarding",
                entityId: s.id,
                kind: "onboarding.submitted",
                title: `Onboarding submitted: ${s.clientName}`,
                detail: "",
                href: `/onboarding/${s.id}`,
                amountMyr: 0,
                actor: "",
            });
        }
    }

    // Projects + tasks
    for (const p of projects) {
        out.push({
            id: `project:${p.id}:created`,
            at: p.createdAt,
            entity: "project",
            entityId: p.id,
            kind: "project.created",
            title: `Project created: ${p.name}`,
            detail: p.clientName,
            href: `/projects/${p.id}`,
            amountMyr: 0,
            actor: "",
        });
        if (
            p.status !== "kickoff" &&
            isMeaningfullyAfter(p.updatedAt, p.createdAt)
        ) {
            out.push({
                id: `project:${p.id}:status:${p.status}`,
                at: p.updatedAt,
                entity: "project",
                entityId: p.id,
                kind: "project.status",
                title: `Project → ${p.status}: ${p.name}`,
                detail: p.clientName,
                href: `/projects/${p.id}`,
                amountMyr: 0,
                actor: "",
            });
        }
        for (const t of p.tasks) {
            out.push({
                id: `project:${p.id}:task:${t.id}`,
                at: t.createdAt,
                entity: "project",
                entityId: p.id,
                kind: "project.task",
                title: `Task added on ${p.name}: ${t.title}`,
                detail: t.assignee ? `Assignee: ${t.assignee}` : "",
                href: `/projects/${p.id}`,
                amountMyr: 0,
                actor: t.assignee ?? "",
            });
        }
        for (const d of p.deliverables) {
            out.push({
                id: `project:${p.id}:deliverable:${d.id}`,
                at: d.createdAt,
                entity: "project",
                entityId: p.id,
                kind: "project.deliverable",
                title: `Deliverable added on ${p.name}: ${d.title}`,
                detail: `Phase: ${d.phase.replace(/_/g, " ")}`,
                href: `/projects/${p.id}`,
                amountMyr: 0,
                actor: "",
            });
            if (d.approvedAt) {
                out.push({
                    id: `project:${p.id}:deliverable:${d.id}:approved`,
                    at: d.approvedAt,
                    entity: "project",
                    entityId: p.id,
                    kind: "project.deliverable_approved",
                    title: `Approved on ${p.name}: ${d.title}`,
                    detail: d.approvedBy
                        ? `By ${d.approvedBy}`
                        : "",
                    href: `/projects/${p.id}`,
                    amountMyr: 0,
                    actor: d.approvedBy,
                });
            }
        }
        if (
            p.phase !== "discovery" &&
            isMeaningfullyAfter(p.updatedAt, p.createdAt)
        ) {
            out.push({
                id: `project:${p.id}:phase:${p.phase}`,
                at: p.updatedAt,
                entity: "project",
                entityId: p.id,
                kind: "project.phase",
                title: `${p.name} → phase ${p.phase.replace(/_/g, " ")}`,
                detail: p.clientName,
                href: `/projects/${p.id}`,
                amountMyr: 0,
                actor: "",
            });
        }
        if (p.signoff.signedAt) {
            out.push({
                id: `project:${p.id}:signoff`,
                at: p.signoff.signedAt,
                entity: "project",
                entityId: p.id,
                kind: "project.signoff",
                title: `Signoff: ${p.name}`,
                detail: `By ${p.signoff.signedBy}`,
                href: `/projects/${p.id}`,
                amountMyr: 0,
                actor: p.signoff.signedBy,
            });
        }
    }

    // Invoices
    for (const inv of invoices) {
        const totals = computeTotals(inv);
        out.push({
            id: `invoice:${inv.id}:created`,
            at: inv.createdAt,
            entity: "invoice",
            entityId: inv.id,
            kind: "invoice.created",
            title: `Invoice ${inv.number}: ${inv.clientName}`,
            detail: `MYR ${totals.total.toLocaleString()}`,
            href: `/invoices/${inv.id}`,
            amountMyr: totals.total,
            actor: "",
        });
        if (
            (inv.status === "sent" || inv.status === "overdue") &&
            isMeaningfullyAfter(inv.updatedAt, inv.createdAt)
        ) {
            out.push({
                id: `invoice:${inv.id}:sent`,
                at: inv.updatedAt,
                entity: "invoice",
                entityId: inv.id,
                kind: "invoice.sent",
                title: `Invoice sent: ${inv.number}`,
                detail: `${inv.clientName} · MYR ${totals.total.toLocaleString()}`,
                href: `/invoices/${inv.id}`,
                amountMyr: totals.total,
                actor: "",
            });
        }
        if (inv.paidAt) {
            out.push({
                id: `invoice:${inv.id}:paid`,
                at: inv.paidAt,
                entity: "invoice",
                entityId: inv.id,
                kind: "invoice.paid",
                title: `Invoice paid: ${inv.number}`,
                detail: `${inv.clientName} · MYR ${totals.total.toLocaleString()}`,
                href: `/invoices/${inv.id}`,
                amountMyr: totals.total,
                actor: "",
            });
        }
    }

    // Content
    for (const c of content) {
        out.push({
            id: `content:${c.id}:scheduled`,
            at: c.createdAt,
            entity: "content",
            entityId: c.id,
            kind: "content.scheduled",
            title: `Content scheduled: ${c.title}`,
            detail: `${c.platform} · ${c.scheduledFor}${c.scheduledTime ? ` ${c.scheduledTime}` : ""
                }`,
            href: `/content/calendar`,
            amountMyr: 0,
            actor: c.assignee ?? "",
        });
        if (c.postedAt) {
            out.push({
                id: `content:${c.id}:posted`,
                at: c.postedAt,
                entity: "content",
                entityId: c.id,
                kind: "content.posted",
                title: `Content posted: ${c.title}`,
                detail: `${c.platform}`,
                href: `/content/calendar`,
                amountMyr: 0,
                actor: c.assignee ?? "",
            });
        }
    }

    // Campaigns + each metric snapshot
    for (const cam of campaigns) {
        out.push({
            id: `campaign:${cam.id}:created`,
            at: cam.createdAt,
            entity: "campaign",
            entityId: cam.id,
            kind: "campaign.created",
            title: `Campaign created: ${cam.name}`,
            detail: `${cam.clientName} · ${cam.platform} · ${cam.objective}`,
            href: `/campaigns/${cam.id}`,
            amountMyr: 0,
            actor: "",
        });
        for (const m of cam.metrics) {
            out.push({
                id: `campaign:${cam.id}:metric:${m.id}`,
                at: m.createdAt,
                entity: "campaign",
                entityId: cam.id,
                kind: "campaign.metric",
                title: `Snapshot ${m.date}: ${cam.name}`,
                detail: `Spend MYR ${m.spendMyr.toLocaleString()} · ${m.clicks} clicks · ${m.leadsReported} leads`,
                href: `/campaigns/${cam.id}`,
                amountMyr: m.spendMyr,
                actor: "",
            });
        }
    }

    // Newest first
    out.sort((a, b) => b.at.localeCompare(a.at));
    return out;
}

export type ActivityFilter = {
    entity?: ActivityEntity | "all";
    kind?: ActivityKind | "all";
    sinceDays?: number; // limit to last N days
    limit?: number;
};

export async function listActivityFiltered(
    f: ActivityFilter = {},
): Promise<ActivityEvent[]> {
    const all = await listActivity();
    const cutoff = f.sinceDays
        ? Date.now() - f.sinceDays * 24 * 60 * 60 * 1000
        : 0;
    let filtered = all.filter((e) => {
        if (f.entity && f.entity !== "all" && e.entity !== f.entity)
            return false;
        if (f.kind && f.kind !== "all" && e.kind !== f.kind) return false;
        if (cutoff && Date.parse(e.at) < cutoff) return false;
        return true;
    });
    if (f.limit) filtered = filtered.slice(0, f.limit);
    return filtered;
}
