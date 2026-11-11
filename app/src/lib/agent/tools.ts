/**
 * AGENT TOOL REGISTRY
 *
 * The single source of truth for "what an AI agent can do inside Nexov Admin".
 * Every meaningful capability — read, write, or AI subtask — is registered
 * here with:
 *   - a stable `name` (the agent picks this name when calling)
 *   - a one-line `description` (what it does, when to call it)
 *   - an `inputSchema` (Zod — validates agent's call args)
 *   - an `outputSchema` (Zod — guarantees what the agent receives back)
 *   - an `invoke` function (the actual work)
 *
 * This file is also what we'll later compile into a Gemini/Claude
 * function-calling manifest for the "agent controls the whole system" phase.
 * Do NOT call the underlying actions/AI helpers directly from the agent path
 * — always go through a registered tool, so the agent can never do anything
 * the registry doesn't know about.
 *
 * Convention: tool name = `<entity>.<verb>` (e.g. `leads.create`, `ai.summariseSubmission`).
 */
import { z } from "zod";
import {
    summariseOnboardingSubmission,
    SummarySchema,
} from "@/lib/ai/summarize-submission";
import { sendEmail } from "@/lib/email/send";
import { renderOnboardingLinkEmail } from "@/lib/email/templates/onboarding-link";
import {
    checkInvoicePaymentStatus,
    generateInvoicePaymentLink,
} from "@/lib/payments/send-invoice";
import { sendTelegram, escapeMd } from "@/lib/telegram/send";
import {
    approveContent,
    createContentRequest,
    generateMonthlyPlan,
    requestChanges,
    submitDraft,
    listContentPosts,
    deleteContentPost,
} from "@/lib/data/content";
import { listClients, createClient } from "@/lib/data/clients";
import {
    listContracts,
    getContractById,
    CONTRACT_STAGE_LABEL,
    CONTRACT_STATUSES,
    type Contract,
} from "@/lib/data/contracts";
import {
    listWorks,
    getWorkById,
    updateWork,
    TASK_STATUSES,
    type TaskStatus,
    type Work,
    type WorkPatch,
    type WorkShare,
} from "@/lib/data/works";
import { LINE_TYPE_LABEL, SEATS } from "@/lib/data/planners";
import {
    awaitsApprovalFrom,
    involves,
    isOpen,
    isOverdue,
    members,
    nextDue,
    pendingFrom,
    progress,
    splitTotal,
} from "@/lib/works/helpers";
import {
    listInvoices,
    createInvoice,
    updateInvoice,
    computeTotals,
} from "@/lib/data/invoices";
import { listTeamMembers, createTeamMember, TEAM_ROLES } from "@/lib/data/team";
import { withHours } from "@/lib/capacity/helpers";
import { syncTaskForPost } from "@/lib/works/sync";
import {
    createQuotation,
    updateQuotation,
    computeTotals as computeQuotationTotals,
} from "@/lib/data/quotations";

// ---------------------------------------------------------------------------
// Tool type
// ---------------------------------------------------------------------------

export type AgentTool<TIn = unknown, TOut = unknown> = {
    name: string;
    description: string;
    inputSchema: z.ZodType<TIn>;
    outputSchema: z.ZodType<TOut>;
    invoke: (input: TIn) => Promise<TOut>;
};

// ---------------------------------------------------------------------------
// Tools — register new entries as features land
// ---------------------------------------------------------------------------

const summariseSubmissionInput = z.object({
    clientName: z.string().min(1),
    serviceType: z.string().min(1),
    submission: z.record(z.string(), z.unknown()),
});

export const aiSummariseSubmission: AgentTool<
    z.infer<typeof summariseSubmissionInput>,
    z.infer<typeof SummarySchema>
> = {
    name: "ai.summariseSubmission",
    description:
        "Turn a raw onboarding submission (JSON) into a 3-5 sentence brief and 3-7 actionable tasks (each with a required skill). Use after a client submits their intake form.",
    inputSchema: summariseSubmissionInput,
    outputSchema: SummarySchema,
    invoke: (input) => summariseOnboardingSubmission(input),
};

// ---------------------------------------------------------------------------
// Email tools
// ---------------------------------------------------------------------------

const sendOnboardingLinkInput = z.object({
    clientName: z.string().min(1),
    clientEmail: z.email(),
    link: z.url(),
    fromTeamMember: z.string().min(1).optional(),
});

const emailResultSchema = z.object({
    id: z.string(),
    to: z.array(z.string()),
    sentAt: z.string(),
});

export const emailSendOnboardingLink: AgentTool<
    z.infer<typeof sendOnboardingLinkInput>,
    z.infer<typeof emailResultSchema>
> = {
    name: "email.sendOnboardingLink",
    description:
        "Email a client their onboarding form link. Use after creating an onboarding submission, when the client's email is known.",
    inputSchema: sendOnboardingLinkInput,
    outputSchema: emailResultSchema,
    invoke: async (input) => {
        // Anti-abuse (Finding #7): never let this become an open relay.
        // 1) The recipient must match a known client's contact email — we
        //    don't email arbitrary addresses.
        const clients = await listClients();
        const norm = (s: string) => s.trim().toLowerCase();
        const recipient = norm(input.clientEmail);
        const known = clients.some((c) => norm(c.contactEmail) === recipient);
        if (!known) {
            throw new Error(
                "Recipient email does not match any known client contact; refusing to send.",
            );
        }
        // 2) The link must point at our own app origin — no attacker URLs in a
        //    branded email from our sender.
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
        let sameOrigin = false;
        try {
            sameOrigin = new URL(input.link).origin === new URL(siteUrl).origin;
        } catch {
            sameOrigin = false;
        }
        if (!sameOrigin) {
            throw new Error(
                "Onboarding link must point at this application's origin; refusing to send.",
            );
        }

        const { subject, html, text } = renderOnboardingLinkEmail({
            clientName: input.clientName,
            link: input.link,
            fromTeamMember: input.fromTeamMember,
        });
        return sendEmail({
            to: input.clientEmail,
            subject,
            html,
            text,
        });
    },
};

// ---------------------------------------------------------------------------
// Payment tools (LeanX, Malaysian FPX)
// ---------------------------------------------------------------------------

const createInvoiceLinkInput = z.object({
    invoiceId: z.string().min(1),
    customerEmail: z.email().optional(),
    customerPhone: z.string().optional(),
    customerName: z.string().optional(),
    successUrl: z.url().optional(),
});

const paymentLinkResultSchema = z.object({
    provider: z.literal("leanx"),
    url: z.string(),
    externalId: z.string(),
    raw: z.record(z.string(), z.unknown()),
});

export const paymentsCreateInvoiceLink: AgentTool<
    z.infer<typeof createInvoiceLinkInput>,
    z.infer<typeof paymentLinkResultSchema>
> = {
    name: "payments.createInvoiceLink",
    description:
        "Generate a LeanX payment link for an invoice and stamp it onto the invoice row. Returns the URL the client opens to pay. Throws if LeanX is not configured or the invoice has no items.",
    inputSchema: createInvoiceLinkInput,
    outputSchema: paymentLinkResultSchema,
    invoke: (input) =>
        generateInvoicePaymentLink({
            invoiceId: input.invoiceId,
            successUrl: input.successUrl,
            customer: {
                fullName: input.customerName,
                email: input.customerEmail,
                phoneNumber: input.customerPhone,
            },
        }),
};

const checkInvoiceStatusInput = z.object({
    invoiceId: z.string().min(1),
});

const paymentStatusResultSchema = z.object({
    provider: z.literal("leanx"),
    externalId: z.string(),
    status: z.enum(["pending", "paid", "failed", "unknown"]),
    amount: z.number().optional(),
    paidAt: z.string().optional(),
    raw: z.record(z.string(), z.unknown()),
});

export const paymentsCheckInvoiceStatus: AgentTool<
    z.infer<typeof checkInvoiceStatusInput>,
    z.infer<typeof paymentStatusResultSchema>
> = {
    name: "payments.checkInvoiceStatus",
    description:
        "Manually query LeanX for an invoice's payment status (use when the webhook hasn't arrived or you suspect a stale state). Returns paid / pending / failed / unknown.",
    inputSchema: checkInvoiceStatusInput,
    outputSchema: paymentStatusResultSchema,
    invoke: (input) => checkInvoicePaymentStatus(input.invoiceId),
};

// ---------------------------------------------------------------------------
// Telegram tools
// ---------------------------------------------------------------------------

const telegramSendInput = z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(0).max(2000).optional(),
    link: z.string().optional(), // path (e.g. /leads/123) or absolute URL
});

const telegramSendResult = z.object({
    ok: z.boolean(),
    messageId: z.number().optional(),
    error: z.string().optional(),
});

export const telegramSendAlert: AgentTool<
    z.infer<typeof telegramSendInput>,
    z.infer<typeof telegramSendResult>
> = {
    name: "telegram.sendAlert",
    description:
        "Send a one-off team alert to the configured Telegram team chat. Use for urgent things the in-app notification doesn't capture (e.g. AI flagging a high-value lead, anomaly detected). Most events should go through `notify()` which already pushes to Telegram — use this only when no notify-kind fits.",
    inputSchema: telegramSendInput,
    outputSchema: telegramSendResult,
    invoke: async (input) => {
        const lines = [
            `🔔 *${escapeMd(input.title)}*`,
            input.body ? escapeMd(input.body) : null,
        ].filter(Boolean) as string[];
        return sendTelegram({
            text: lines.join("\n"),
            buttons: input.link
                ? [{ text: "Open", url: absoluteLink(input.link) }]
                : undefined,
        });
    },
};

function absoluteLink(pathOrUrl: string): string {
    if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
    const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/$/, "");
    return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

// ---------------------------------------------------------------------------
// Content review tools (the Axtra loop, native in Nexov Admin)
// ---------------------------------------------------------------------------

const generatePlanInput = z.object({
    clientName: z.string().min(1),
    month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
    quota: z.number().int().min(0).optional(),
});
const generatePlanResult = z.object({
    created: z.number(),
    existing: z.number(),
});

export const contentGeneratePlan: AgentTool<
    z.infer<typeof generatePlanInput>,
    z.infer<typeof generatePlanResult>
> = {
    name: "content.generatePlan",
    description:
        "Generate a client's monthly content plan (N placeholder content items) from their retainer quota. Idempotent per (client, month): does nothing if a plan already exists. Omit `quota` to use the client's configured monthlyContentQuota.",
    inputSchema: generatePlanInput,
    outputSchema: generatePlanResult,
    invoke: async (input) => {
        let quota = input.quota;
        if (quota === undefined) {
            const clients = await listClients();
            const c = clients.find(
                (x) =>
                    x.name.trim().toLowerCase() ===
                    input.clientName.trim().toLowerCase(),
            );
            quota = c?.monthlyContentQuota ?? 0;
        }
        return generateMonthlyPlan({
            clientName: input.clientName,
            month: input.month,
            quota,
        });
    },
};

const submitDraftInput = z.object({
    contentId: z.string().min(1),
    draftNumber: z.string().min(1), // 'Draft 1'..'Draft 3' | 'Final Draft'
    fileUrl: z.url(),
    caption: z.string().optional(),
});
const reviewStateResult = z.object({
    id: z.string(),
    reviewStatus: z.string(),
    draftNumber: z.string(),
});

export const contentSubmitDraft: AgentTool<
    z.infer<typeof submitDraftInput>,
    z.infer<typeof reviewStateResult>
> = {
    name: "content.submitDraft",
    description:
        "Submit a new draft version of a content item for client review (moves it to 'awaiting_client' and notifies). draftNumber is one of 'Draft 1','Draft 2','Draft 3','Final Draft'. fileUrl is the asset link (single image/video; use the UI for carousels).",
    inputSchema: submitDraftInput,
    outputSchema: reviewStateResult,
    invoke: async (input) => {
        const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(input.fileUrl);
        const p = await submitDraft({
            id: input.contentId,
            draftNumber: input.draftNumber,
            media: [
                {
                    url: input.fileUrl,
                    type: isVideo ? "video" : "image",
                    name: "asset",
                },
            ],
            caption: input.caption,
        });
        return {
            id: p.id,
            reviewStatus: p.reviewStatus,
            draftNumber: p.draftNumber,
        };
    },
};

const requestChangesInput = z.object({
    contentId: z.string().min(1),
    body: z.string().min(1),
    fileUrl: z.url().optional(),
});
const requestChangesResult = z.object({
    ok: z.boolean(),
    error: z.string().optional(),
    reviewStatus: z.string().optional(),
    revisionsUsed: z.number().optional(),
});

export const contentRequestChanges: AgentTool<
    z.infer<typeof requestChangesInput>,
    z.infer<typeof requestChangesResult>
> = {
    name: "content.requestChanges",
    description:
        "Record client-requested changes on a content item's current draft. Consumes one revision cycle (capped by the client's revision limit) and moves it to 'changes_requested'. Returns ok:false with an error if the cap is reached, the item is already approved, or there is no draft yet.",
    inputSchema: requestChangesInput,
    outputSchema: requestChangesResult,
    invoke: async (input) => {
        const r = await requestChanges({
            id: input.contentId,
            body: input.body,
            fileUrl: input.fileUrl,
        });
        if (r.error) return { ok: false, error: r.error };
        await syncTaskForPost(input.contentId, "changes", "client (via agent)", input.body);
        return {
            ok: true,
            reviewStatus: r.post?.reviewStatus,
            revisionsUsed: r.post?.revisionsUsed,
        };
    },
};

const approveInput = z.object({
    contentId: z.string().min(1),
    by: z.string().optional(),
});
const approveResult = z.object({
    id: z.string(),
    reviewStatus: z.string(),
    approvedAt: z.string().nullable(),
});

export const contentApprove: AgentTool<
    z.infer<typeof approveInput>,
    z.infer<typeof approveResult>
> = {
    name: "content.approve",
    description:
        "Approve a content item's current draft on the client's behalf (terminal state). Stamps approvedAt/by and notifies.",
    inputSchema: approveInput,
    outputSchema: approveResult,
    invoke: async (input) => {
        const p = await approveContent({
            id: input.contentId,
            by: input.by,
        });
        await syncTaskForPost(p.id, "approved", input.by ?? "client (via agent)", "");
        return {
            id: p.id,
            reviewStatus: p.reviewStatus,
            approvedAt: p.approvedAt,
        };
    },
};

const createRequestInput = z.object({
    clientName: z.string().min(1),
    title: z.string().min(1),
    instructions: z.string().optional(),
});
const createRequestResult = z.object({
    id: z.string(),
    title: z.string(),
    origin: z.string(),
});

export const contentCreateRequest: AgentTool<
    z.infer<typeof createRequestInput>,
    z.infer<typeof createRequestResult>
> = {
    name: "content.createRequest",
    description:
        "Log a one-off content request from a client (origin 'request'). Creates a content item and notifies the team.",
    inputSchema: createRequestInput,
    outputSchema: createRequestResult,
    invoke: async (input) => {
        const p = await createContentRequest({
            clientName: input.clientName,
            title: input.title,
            instructions: input.instructions,
        });
        return { id: p.id, title: p.title, origin: p.origin };
    },
};

// ---------------------------------------------------------------------------
// Scrum-master READ tools (standup, overdue tracking, board summary)
//
// Delivery work is Client → Contract → Works (tasks). Each work sits under one
// contract in one month and one contract phase, carries a due date, a status
// (not_started → in_progress → pending_approval → completed) and a %
// responsibility split across team members. `content_posts` carry their own
// `scheduledFor` due date + review state. These read tools flatten those into
// the shape a scrum master needs. All are pure reads — safe to call freely.
// ---------------------------------------------------------------------------

/** Today as YYYY-MM-DD (UTC). Used for overdue comparisons. */
function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve a person's name as the agent typed it to the exact team-member name
 * stored on works (split members and the account manager are exact strings).
 * Falls back to the trimmed input when nobody matches, so the filter still
 * applies (and simply matches nothing).
 */
async function canonicalMemberName(name: string): Promise<string> {
    const key = name.trim().toLowerCase();
    const team = await listTeamMembers();
    return team.find((m) => m.name.trim().toLowerCase() === key)?.name ?? name.trim();
}

/** Works grouped by contract id (one listWorks() call feeds every contract). */
function groupByContract(works: Work[]): Map<string, Work[]> {
    const out = new Map<string, Work[]>();
    for (const w of works) {
        const list = out.get(w.contractId);
        if (list) list.push(w);
        else out.set(w.contractId, [w]);
    }
    return out;
}

// ---- shared shapes --------------------------------------------------------

const workShare = z.object({
    /** dm (digital marketer), creative, dev, seo, am (account manager). */
    seat: z.enum(SEATS),
    /** Team member name holding the seat ("" = nobody yet). */
    member: z.string(),
    pct: z.number(),
});

const contractSummary = z.object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    clientName: z.string(),
    accountManager: z.string(),
    status: z.string(),
    stage: z.string(),
    stageLabel: z.string(),
    /** What the contract needs, as the account manager entered it: "8 content posts / month · 1 campaign / month · 2 branding items once". "" = none recorded. Tasks are generated from these. */
    requirements: z.string(),
    /** Default person per seat (dm / creative / dev / seo / am) that generated tasks are assigned from. Seats nobody holds are absent. */
    crew: z.record(z.string(), z.string()),
    tasksDone: z.number(),
    tasksTotal: z.number(),
    overdueTasks: z.number(),
    nextDueDate: z.string().nullable(),
    nextDueTitle: z.string().nullable(),
});

/** "8 content posts / month · 1 campaign / month · 2 branding items once". */
function requirementsLabel(c: Pick<Contract, "requirements">): string {
    return c.requirements
        .map((r) => {
            const label = LINE_TYPE_LABEL[r.type];
            const noun = r.count === 1 ? label : `${label}s`;
            return `${r.count} ${noun.toLowerCase()}${r.cadence === "monthly" ? " / month" : " once"}${r.channel ? ` (${r.channel})` : ""}`;
        })
        .join(" · ");
}

function toContractSummary(
    c: Contract,
    works: Work[],
    today: string,
): z.infer<typeof contractSummary> {
    const p = progress(works);
    const next = nextDue(works);
    const crew: Record<string, string> = {};
    for (const seat of SEATS) {
        const who = c.crew[seat];
        if (who) crew[seat] = who;
    }
    return {
        id: c.id,
        code: c.code,
        name: c.name,
        clientName: c.clientName,
        accountManager: c.accountManager,
        status: c.status,
        stage: c.stage,
        stageLabel: CONTRACT_STAGE_LABEL[c.stage],
        requirements: requirementsLabel(c),
        crew,
        tasksDone: p.done,
        tasksTotal: p.total,
        overdueTasks: works.filter((w) => isOverdue(w, today)).length,
        nextDueDate: next?.dueDate ?? null,
        nextDueTitle: next?.title ?? null,
    };
}

const taskDetail = z.object({
    id: z.string(),
    title: z.string(),
    type: z.string(),
    channel: z.string(),
    month: z.string(),
    phaseName: z.string(),
    dueDate: z.string(),
    status: z.string(),
    /** Everyone holding a share (deduplicated). */
    members: z.array(z.string()),
    split: z.array(workShare),
    /** none | am | client — who signs the task off. */
    approver: z.string(),
    milestone: z.boolean(),
    overdue: z.boolean(),
});

function toTaskDetail(w: Work, today: string): z.infer<typeof taskDetail> {
    return {
        id: w.id,
        title: w.title,
        type: w.type,
        channel: w.channel,
        month: w.month,
        phaseName: w.phaseName,
        dueDate: w.dueDate,
        status: w.status,
        members: members(w),
        split: w.split.map((s) => ({ seat: s.seat, member: s.member, pct: s.pct })),
        approver: w.approver,
        milestone: w.milestone,
        overdue: isOverdue(w, today),
    };
}

// ---- team.list ------------------------------------------------------------

const teamListInput = z.object({
    activeOnly: z.boolean().optional().default(true),
});
const teamMemberSummary = z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    active: z.boolean(),
    /** Open (not completed) contract tasks this person holds a share of or must approve. */
    openTasks: z.number(),
    /** Of those, how many are past their due date. */
    overdueTasks: z.number(),
    /** Tasks waiting on this person's approval (as account manager). */
    awaitingApproval: z.number(),
});
const teamListResult = z.object({
    members: z.array(teamMemberSummary),
});

export const teamList: AgentTool<
    z.infer<typeof teamListInput>,
    z.infer<typeof teamListResult>
> = {
    name: "team.list",
    description:
        "List team members with their current workload: open contract tasks they hold a share of (or must approve), how many of those are overdue, and how many await their approval. Use to see who owns what before reassigning or chasing work. activeOnly defaults true.",
    inputSchema: teamListInput,
    outputSchema: teamListResult,
    invoke: async (input) => {
        const today = todayISO();
        const [team, works] = await Promise.all([listTeamMembers(), listWorks()]);
        const open = works.filter(isOpen);
        const rows = (input.activeOnly ? team.filter((m) => m.active) : team).map((m) => {
            // involves("") matches everything — a nameless member owns nothing.
            const mine = m.name ? open.filter((w) => involves(w, m.name)) : [];
            return {
                id: m.id,
                name: m.name,
                role: m.role,
                active: m.active,
                openTasks: mine.length,
                overdueTasks: mine.filter((w) => isOverdue(w, today)).length,
                awaitingApproval: mine.filter((w) => awaitsApprovalFrom(w, m.name)).length,
            };
        });
        return { members: rows };
    },
};

// ---- contracts.list -------------------------------------------------------

const contractsListInput = z.object({
    status: z.enum(CONTRACT_STATUSES).optional(),
    clientName: z.string().optional(),
    /** Team member name: only contracts with an open task that person holds a share of (or must approve). */
    assignee: z.string().optional(),
});
const contractsListResult = z.object({
    contracts: z.array(contractSummary),
});

export const contractsList: AgentTool<
    z.infer<typeof contractsListInput>,
    z.infer<typeof contractsListResult>
> = {
    name: "contracts.list",
    description:
        "List contracts (the signed job with a client — every task lives under one) with lifecycle stage, status, the requirements its tasks are generated from, its crew, tasks done/total, overdue count and the next due task. Optional filters: status (draft/active/completed/cancelled), clientName, assignee (only contracts with an open task that person holds a share of or must approve).",
    inputSchema: contractsListInput,
    outputSchema: contractsListResult,
    invoke: async (input) => {
        const norm = (s: string) => s.trim().toLowerCase();
        const today = todayISO();
        const [contracts, works] = await Promise.all([listContracts(), listWorks()]);
        const byContract = groupByContract(works);
        let list = contracts;
        if (input.status) list = list.filter((c) => c.status === input.status);
        if (input.clientName) {
            const client = norm(input.clientName);
            list = list.filter((c) => norm(c.clientName) === client);
        }
        if (input.assignee) {
            const who = await canonicalMemberName(input.assignee);
            list = list.filter((c) =>
                (byContract.get(c.id) ?? []).some((w) => isOpen(w) && involves(w, who)),
            );
        }
        return {
            contracts: list.map((c) =>
                toContractSummary(c, byContract.get(c.id) ?? [], today),
            ),
        };
    },
};

// ---- tasks.list -----------------------------------------------------------

const tasksListInput = z.object({
    /** Team member name: tasks they hold a share of, or must approve. */
    assignee: z.string().optional(),
    clientName: z.string().optional(),
    /** Defaults to every open task (not completed). Pass a status to see just that column (including completed). */
    status: z.enum(TASK_STATUSES).optional(),
});
const taskListItem = taskDetail.extend({
    contractId: z.string(),
    contractCode: z.string(),
    contractName: z.string(),
    clientName: z.string(),
    accountManager: z.string(),
    /** True while the task sits with its approver (account manager, or the client via them). */
    awaitingApproval: z.boolean(),
    /** Who the task is waiting on right now ("" when nobody). */
    waitingOn: z.string(),
});
const tasksListResult = z.object({
    asOf: z.string(),
    tasks: z.array(taskListItem),
});

export const tasksList: AgentTool<
    z.infer<typeof tasksListInput>,
    z.infer<typeof tasksListResult>
> = {
    name: "tasks.list",
    description:
        "Flatten in-flight work into a single list for a daily standup: every open contract task (not completed) with its contract code, client, phase, due date, status, the people holding a share, whether it awaits approval and whether it is overdue (ordered by due date, overdue first). Optional filters: assignee, clientName, status (pass 'completed' to see finished work). The `id` is the workId for tasks.setStatus / tasks.setSplit.",
    inputSchema: tasksListInput,
    outputSchema: tasksListResult,
    invoke: async (input) => {
        const norm = (s: string) => s.trim().toLowerCase();
        const today = todayISO();
        const [contracts, works] = await Promise.all([listContracts(), listWorks()]);
        const contractById = new Map(contracts.map((c) => [c.id, c] as const));
        let list = input.status
            ? works.filter((w) => w.status === input.status)
            : works.filter(isOpen);
        if (input.clientName) {
            const client = norm(input.clientName);
            list = list.filter((w) => norm(w.clientName) === client);
        }
        if (input.assignee) {
            const who = await canonicalMemberName(input.assignee);
            list = list.filter((w) => involves(w, who));
        }
        return {
            asOf: today,
            tasks: list.map((w) => {
                const c = contractById.get(w.contractId);
                return {
                    ...toTaskDetail(w, today),
                    contractId: w.contractId,
                    contractCode: c?.code ?? "",
                    contractName: c?.name ?? "",
                    clientName: w.clientName,
                    accountManager: w.accountManager,
                    awaitingApproval: w.status === "pending_approval",
                    waitingOn: pendingFrom(w),
                };
            }),
        };
    },
};

// ---- overdue.list ---------------------------------------------------------

const overdueInput = z.object({});
const overdueContentItem = z.object({
    id: z.string(),
    title: z.string(),
    clientName: z.string(),
    assignee: z.string(),
    scheduledFor: z.string(),
    status: z.string(),
    reviewStatus: z.string(),
});
const overdueInvoiceItem = z.object({
    id: z.string(),
    number: z.string(),
    clientName: z.string(),
    dueDate: z.string(),
    status: z.string(),
});
const overdueResult = z.object({
    asOf: z.string(),
    content: z.array(overdueContentItem),
    invoices: z.array(overdueInvoiceItem),
});

export const overdueList: AgentTool<
    z.infer<typeof overdueInput>,
    z.infer<typeof overdueResult>
> = {
    name: "overdue.list",
    description:
        "List everything past its due date and not finished: content posts whose scheduledFor is in the past but aren't yet posted/archived or client-approved, and invoices past dueDate that aren't paid/void. Use for the 9am/4pm overdue nudge — @-mention the assignee (content) or follow up on the client (invoices).",
    inputSchema: overdueInput,
    outputSchema: overdueResult,
    invoke: async () => {
        const today = todayISO();
        const [posts, invoices] = await Promise.all([
            listContentPosts(),
            listInvoices(),
        ]);
        const content = posts
            .filter(
                (p) =>
                    p.scheduledFor &&
                    p.scheduledFor < today &&
                    p.status !== "posted" &&
                    p.status !== "archived" &&
                    p.reviewStatus !== "approved",
            )
            .map((p) => ({
                id: p.id,
                title: p.title,
                clientName: p.clientName,
                assignee: p.assignee,
                scheduledFor: p.scheduledFor,
                status: p.status,
                reviewStatus: p.reviewStatus,
            }));
        const overdueInvoices = invoices
            .filter(
                (i) =>
                    i.dueDate < today &&
                    i.status !== "paid" &&
                    i.status !== "void",
            )
            .map((i) => ({
                id: i.id,
                number: i.number,
                clientName: i.clientName,
                dueDate: i.dueDate,
                status: i.status,
            }));
        return { asOf: today, content, invoices: overdueInvoices };
    },
};

// ---- board.summary --------------------------------------------------------

const boardSummaryInput = z.object({});
const boardSummaryResult = z.object({
    contractsByStatus: z.record(z.string(), z.number()),
    contractsByStage: z.record(z.string(), z.number()),
    tasksByStatus: z.record(z.string(), z.number()),
    contentByReviewStatus: z.record(z.string(), z.number()),
    openTaskTotal: z.number(),
    overdueTaskCount: z.number(),
    awaitingApprovalCount: z.number(),
    overdueContentCount: z.number(),
    overdueInvoiceCount: z.number(),
});

export const boardSummary: AgentTool<
    z.infer<typeof boardSummaryInput>,
    z.infer<typeof boardSummaryResult>
> = {
    name: "board.summary",
    description:
        "Sprint/board summary in one call: contract counts by status and by lifecycle stage, task counts by status, content counts by review status, total open tasks, tasks awaiting approval, and overdue counts (tasks, content, invoices). Use for the daily standup header and the weekly sprint summary.",
    inputSchema: boardSummaryInput,
    outputSchema: boardSummaryResult,
    invoke: async () => {
        const today = todayISO();
        const [contracts, works, posts, invoices] = await Promise.all([
            listContracts(),
            listWorks(),
            listContentPosts(),
            listInvoices(),
        ]);
        const byStatus: Record<string, number> = {};
        const byStage: Record<string, number> = {};
        for (const c of contracts) {
            byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
            byStage[c.stage] = (byStage[c.stage] ?? 0) + 1;
        }
        const prog = progress(works);
        const tasksByStatus: Record<string, number> = {};
        for (const s of TASK_STATUSES) tasksByStatus[s] = prog[s];
        const openTaskTotal = prog.total - prog.completed;
        const overdueTaskCount = works.filter((w) => isOverdue(w, today)).length;
        const byReview: Record<string, number> = {};
        let overdueContentCount = 0;
        for (const p of posts) {
            byReview[p.reviewStatus] = (byReview[p.reviewStatus] ?? 0) + 1;
            if (
                p.scheduledFor &&
                p.scheduledFor < today &&
                p.status !== "posted" &&
                p.status !== "archived" &&
                p.reviewStatus !== "approved"
            )
                overdueContentCount++;
        }
        const overdueInvoiceCount = invoices.filter(
            (i) => i.dueDate < today && i.status !== "paid" && i.status !== "void",
        ).length;
        return {
            contractsByStatus: byStatus,
            contractsByStage: byStage,
            tasksByStatus,
            contentByReviewStatus: byReview,
            openTaskTotal,
            overdueTaskCount,
            awaitingApprovalCount: prog.pending_approval,
            overdueContentCount,
            overdueInvoiceCount,
        };
    },
};

// ---- contract.get ---------------------------------------------------------

const contractGetInput = z.object({
    contractId: z.string().min(1),
});
const contractGetResult = contractSummary.extend({
    startDate: z.string(),
    /** "" = open-ended (rolling retainer). */
    endDate: z.string(),
    valueMyr: z.number(),
    /** YYYY-MM-DD the client signed; null = not signed yet. */
    signedAt: z.string().nullable(),
    /** Every task under the contract, by month and phase. */
    tasks: z.array(taskDetail),
});

export const contractGet: AgentTool<
    z.infer<typeof contractGetInput>,
    z.infer<typeof contractGetResult>
> = {
    name: "contract.get",
    description:
        "Full detail for one contract: its terms (dates, value, signed date, lifecycle stage), the requirements and crew its tasks are generated from, plus every task under it — month, phase, due date, status, who holds which share, who approves. Use this to find the workId before calling tasks.setStatus / tasks.setSplit. Get contractId from contracts.list.",
    inputSchema: contractGetInput,
    outputSchema: contractGetResult,
    invoke: async (input) => {
        const c = await getContractById(input.contractId);
        if (!c) throw new Error(`Contract ${input.contractId} not found`);
        const today = todayISO();
        const works = (await listWorks()).filter((w) => w.contractId === c.id);
        return {
            ...toContractSummary(c, works, today),
            startDate: c.startDate,
            endDate: c.endDate,
            valueMyr: c.valueMyr,
            signedAt: c.signedAt,
            tasks: works.map((w) => toTaskDetail(w, today)),
        };
    },
};

// ---------------------------------------------------------------------------
// Scrum-master WRITE tools (move work along the board)
//
// Thin wrappers over the works data layer. The status moves mirror the app's
// own actions (src/lib/works/actions.ts — start, submit, approve, send back,
// complete, reopen) including the timestamps each one stamps; that file is a
// "use server" module, so the transitions are replicated here rather than
// imported. Each tool throws if the work id is unknown or the move is not
// allowed — the dispatcher surfaces that as a 500 with the message, so the
// agent learns what went wrong. The task's new state is returned so the agent
// can confirm it in one round-trip. There is deliberately no create or delete
// here: tasks are generated from the contract's requirements (or added by hand
// in the app) and are never removed through the agent API.
// ---------------------------------------------------------------------------

/** Compact view of a task returned after a mutation. */
const taskStateResult = z.object({
    id: z.string(),
    contractId: z.string(),
    title: z.string(),
    status: z.enum(TASK_STATUSES),
    previousStatus: z.enum(TASK_STATUSES),
    members: z.array(z.string()),
    split: z.array(workShare),
    approver: z.string(),
    startedAt: z.string().nullable(),
    submittedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
});
type TaskStateResult = z.infer<typeof taskStateResult>;

function toTaskState(w: Work, previousStatus: TaskStatus = w.status): TaskStateResult {
    return {
        id: w.id,
        contractId: w.contractId,
        title: w.title,
        status: w.status,
        previousStatus,
        members: members(w),
        split: w.split.map((s) => ({ seat: s.seat, member: s.member, pct: s.pct })),
        approver: w.approver,
        startedAt: w.startedAt,
        submittedAt: w.submittedAt,
        completedAt: w.completedAt,
    };
}

/**
 * The patch that moves `w` to `next`, mirroring src/lib/works/actions.ts.
 * Returns null when the move is not allowed from the current status.
 */
function statusPatch(
    w: Work,
    next: TaskStatus,
    actor: string,
    note: string,
    now: string,
): WorkPatch | null {
    const from = w.status;
    switch (next) {
        case "in_progress":
            // Start.
            if (from === "not_started") return { status: next, startedAt: now };
            // Send back for changes — a "changes" review never moves forward.
            if (from === "pending_approval") {
                return {
                    status: next,
                    review: { decision: "changes", note, by: actor, at: now },
                };
            }
            return null;
        case "pending_approval":
            if (from !== "not_started" && from !== "in_progress") return null;
            // Submit. With nobody to approve, submitting completes it outright.
            if (w.approver === "none") {
                return { status: "completed", submittedAt: now, completedAt: now };
            }
            return {
                status: next,
                submittedAt: now,
                review: { decision: null, note: "", by: "", at: null },
            };
        case "completed":
            // Approve (on the account manager's / client's behalf).
            if (from === "pending_approval") {
                return {
                    status: next,
                    completedAt: now,
                    review: { decision: "approved", note, by: actor, at: now },
                };
            }
            // Mark it done regardless of where it is (the AM's "complete").
            if (from === "not_started" || from === "in_progress") {
                return { status: next, completedAt: now };
            }
            return null;
        case "not_started":
            // Reopen: clear every timestamp, the submission and the review.
            if (from === "not_started") return null;
            return {
                status: next,
                startedAt: null,
                submittedAt: null,
                completedAt: null,
                submission: { url: "", note: "" },
                review: { decision: null, note: "", by: "", at: null },
            };
    }
}

// ---- tasks.setStatus ------------------------------------------------------

const tasksSetStatusInput = z.object({
    workId: z.string().min(1),
    status: z.enum(TASK_STATUSES),
    /** Reviewer note, recorded when approving (→ completed) or sending back (pending_approval → in_progress). */
    note: z.string().optional(),
    /** Who is acting (team member name); recorded as the reviewer on approvals / change requests. Defaults to "Agent". */
    by: z.string().optional(),
});

export const tasksSetStatus: AgentTool<
    z.infer<typeof tasksSetStatusInput>,
    TaskStateResult
> = {
    name: "tasks.setStatus",
    description:
        "Move a contract task along its lifecycle. not_started → in_progress starts it (stamps startedAt); → pending_approval submits it (stamps submittedAt; completes outright when its approver is 'none'); pending_approval → completed approves it on the approver's behalf (stamps completedAt + review); pending_approval → in_progress sends it back for changes (pass note); not_started/in_progress → completed marks it done directly; anything → not_started reopens it and clears its timestamps. Get workId from tasks.list / contract.get. Throws if the move is not allowed; same status is a no-op.",
    inputSchema: tasksSetStatusInput,
    outputSchema: taskStateResult,
    invoke: async (input) => {
        const w = await getWorkById(input.workId);
        if (!w) throw new Error(`Work ${input.workId} not found`);
        if (w.status === input.status) return toTaskState(w);
        const patch = statusPatch(
            w,
            input.status,
            input.by?.trim() || "Agent",
            input.note?.trim() ?? "",
            new Date().toISOString(),
        );
        if (!patch) {
            throw new Error(
                `Cannot move "${w.title}" from ${w.status} to ${input.status}`,
            );
        }
        const updated = await updateWork(w.id, patch);
        return toTaskState(updated, w.status);
    },
};

// ---- tasks.setSplit -------------------------------------------------------

const splitShareInput = z.object({
    /** Seat the share belongs to: dm (digital marketer), creative, dev, seo, am (account manager). */
    seat: z.enum(SEATS),
    /** Team member name holding the seat ("" = leave the seat unassigned). */
    member: z.string(),
    /** Whole-number percentage of the task. All shares must total 100. */
    pct: z.number().int().min(1).max(100),
});
const tasksSetSplitInput = z.object({
    workId: z.string().min(1),
    split: z.array(splitShareInput).min(1),
});

export const tasksSetSplit: AgentTool<
    z.infer<typeof tasksSetSplitInput>,
    TaskStateResult
> = {
    name: "tasks.setSplit",
    description:
        "Set who is responsible for a contract task and by how much: the full responsibility split as [{seat, member, pct}] (seats: dm/creative/dev/seo/am; member is a team member name or '' for an unfilled seat; pct values must total 100). Replaces the existing split — use this to assign or reassign work. Get the current split from contract.get / tasks.list.",
    inputSchema: tasksSetSplitInput,
    outputSchema: taskStateResult,
    invoke: async (input) => {
        const w = await getWorkById(input.workId);
        if (!w) throw new Error(`Work ${input.workId} not found`);
        const total = splitTotal(input.split);
        if (total !== 100) throw new Error(`Split must total 100% (got ${total}%)`);
        const team = await listTeamMembers();
        const prevHours = new Map(w.split.map((s) => [s.member.trim().toLowerCase(), s.hours]));
        const split: WorkShare[] = withHours(
            input.split.map((s) => {
                const member = s.member.trim();
                if (!member) return { seat: s.seat, member: "", pct: s.pct };
                const key = member.toLowerCase();
                const hit = team.find((m) => m.name.trim().toLowerCase() === key);
                if (!hit) throw new Error(`Unknown team member: ${member}`);
                return { seat: s.seat, member: hit.name, pct: s.pct, hours: prevHours.get(key) };
            }),
            team,
            w.type,
        );
        const updated = await updateWork(w.id, { split });
        return toTaskState(updated);
    },
};

// ---------------------------------------------------------------------------
// Clients, content list, invoices list
// ---------------------------------------------------------------------------

// ---- clients.list ---------------------------------------------------------

const clientsListInput = z.object({
    status: z.enum(["prospect", "active", "paused", "churned"]).optional(),
});
const clientSummary = z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    contactName: z.string(),
    contactEmail: z.string(),
    industry: z.string(),
    monthlyContentQuota: z.number(),
});
const clientsListResult = z.object({ clients: z.array(clientSummary) });

export const clientsList: AgentTool<
    z.infer<typeof clientsListInput>,
    z.infer<typeof clientsListResult>
> = {
    name: "clients.list",
    description:
        "List the agency's clients (optionally filter by status: prospect/active/paused/churned). Use to see who exists (every contract belongs to a client), or to answer 'who are our clients'.",
    inputSchema: clientsListInput,
    outputSchema: clientsListResult,
    invoke: async (input) => {
        let clients = await listClients();
        if (input.status) clients = clients.filter((c) => c.status === input.status);
        return {
            clients: clients.map((c) => ({
                id: c.id,
                name: c.name,
                status: c.status,
                contactName: c.contactName,
                contactEmail: c.contactEmail,
                industry: c.industry,
                monthlyContentQuota: c.monthlyContentQuota,
            })),
        };
    },
};

// ---- clients.create -------------------------------------------------------

const clientsCreateInput = z.object({
    name: z.string().min(1),
    status: z.enum(["prospect", "active", "paused", "churned"]).optional(),
    contactName: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
    industry: z.string().optional(),
    notes: z.string().optional(),
});
const clientCreateResult = z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
});

export const clientsCreate: AgentTool<
    z.infer<typeof clientsCreateInput>,
    z.infer<typeof clientCreateResult>
> = {
    name: "clients.create",
    description:
        "Create a new client record (defaults to status 'prospect'). Use before a contract is drawn up so it can attach to a real client (contracts themselves are created in the app, not by the agent). Name must be unique.",
    inputSchema: clientsCreateInput,
    outputSchema: clientCreateResult,
    invoke: async (input) => {
        const c = await createClient(input);
        return { id: c.id, name: c.name, status: c.status };
    },
};

// ---- content.list ---------------------------------------------------------

const contentListInput = z.object({
    clientName: z.string().optional(),
    reviewStatus: z
        .enum(["none", "awaiting_client", "changes_requested", "approved"])
        .optional(),
    status: z
        .enum(["idea", "draft", "review", "scheduled", "posted", "archived"])
        .optional(),
    planMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
const contentSummary = z.object({
    id: z.string(),
    title: z.string(),
    clientName: z.string(),
    status: z.string(),
    reviewStatus: z.string(),
    assignee: z.string(),
    scheduledFor: z.string(),
    planMonth: z.string(),
});
const contentListResult = z.object({ posts: z.array(contentSummary) });

export const contentList: AgentTool<
    z.infer<typeof contentListInput>,
    z.infer<typeof contentListResult>
> = {
    name: "content.list",
    description:
        "Browse the full content pipeline (not just overdue). Optional filters: clientName, reviewStatus (none/awaiting_client/changes_requested/approved), status (idea/draft/review/scheduled/posted/archived), planMonth (YYYY-MM). Use to see a client's plan or what's awaiting review.",
    inputSchema: contentListInput,
    outputSchema: contentListResult,
    invoke: async (input) => {
        const norm = (s: string) => s.trim().toLowerCase();
        let posts = await listContentPosts();
        if (input.clientName)
            posts = posts.filter((p) => norm(p.clientName) === norm(input.clientName!));
        if (input.reviewStatus)
            posts = posts.filter((p) => p.reviewStatus === input.reviewStatus);
        if (input.status) posts = posts.filter((p) => p.status === input.status);
        if (input.planMonth)
            posts = posts.filter((p) => p.planMonth === input.planMonth);
        return {
            posts: posts.map((p) => ({
                id: p.id,
                title: p.title,
                clientName: p.clientName,
                status: p.status,
                reviewStatus: p.reviewStatus,
                assignee: p.assignee,
                scheduledFor: p.scheduledFor,
                planMonth: p.planMonth,
            })),
        };
    },
};

// ---- invoices.list --------------------------------------------------------

const invoicesListInput = z.object({
    status: z.enum(["draft", "sent", "paid", "overdue", "void"]).optional(),
    clientName: z.string().optional(),
});
const invoiceSummary = z.object({
    id: z.string(),
    number: z.string(),
    clientName: z.string(),
    status: z.string(),
    issueDate: z.string(),
    dueDate: z.string(),
    totalMyr: z.number(),
});
const invoicesListResult = z.object({ invoices: z.array(invoiceSummary) });

export const invoicesList: AgentTool<
    z.infer<typeof invoicesListInput>,
    z.infer<typeof invoicesListResult>
> = {
    name: "invoices.list",
    description:
        "List all invoices (not just overdue), optionally filtered by status (draft/sent/paid/overdue/void) or clientName. Each entry includes its computed MYR total. Use for proactive billing follow-up.",
    inputSchema: invoicesListInput,
    outputSchema: invoicesListResult,
    invoke: async (input) => {
        const norm = (s: string) => s.trim().toLowerCase();
        let invoices = await listInvoices();
        if (input.status) invoices = invoices.filter((i) => i.status === input.status);
        if (input.clientName)
            invoices = invoices.filter((i) => norm(i.clientName) === norm(input.clientName!));
        return {
            invoices: invoices.map((i) => {
                const subtotal = i.items.reduce(
                    (s, it) => s + (it.quantity || 0) * (it.unitPriceMyr || 0),
                    0,
                );
                const totalMyr =
                    Math.round(subtotal * (1 + (i.taxRatePct || 0) / 100) * 100) / 100;
                return {
                    id: i.id,
                    number: i.number,
                    clientName: i.clientName,
                    status: i.status,
                    issueDate: i.issueDate,
                    dueDate: i.dueDate,
                    totalMyr,
                };
            }),
        };
    },
};

// ---- invoices.create ------------------------------------------------------

const invoiceLineItemInput = z.object({
    description: z.string().min(1),
    /** Optional secondary line (sub-detail / scope note) shown under the description. */
    details: z.string().optional(),
    quantity: z.number().positive(),
    unitPriceMyr: z.number().nonnegative(),
});

const invoicesCreateInput = z.object({
    clientName: z.string().min(1),
    /** Contract this invoice bills against (from contracts.list). */
    contractId: z.string().optional(),
    /** Line items (description + qty + unit price in MYR). At least one. */
    items: z.array(invoiceLineItemInput).min(1),
    /** YYYY-MM-DD. Defaults to today. */
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** YYYY-MM-DD. Defaults to issue date + 14 days. */
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Tax/SST rate as a percent (e.g. 6 for 6%). Defaults to 6. */
    taxRatePct: z.number().min(0).max(100).optional(),
    notes: z.string().optional(),
});
const invoicesCreateResult = z.object({
    id: z.string(),
    number: z.string(),
    clientName: z.string(),
    status: z.string(),
    issueDate: z.string(),
    dueDate: z.string(),
    subtotalMyr: z.number(),
    taxMyr: z.number(),
    totalMyr: z.number(),
});

export const invoicesCreate: AgentTool<
    z.infer<typeof invoicesCreateInput>,
    z.infer<typeof invoicesCreateResult>
> = {
    name: "invoices.create",
    description:
        "Create a new invoice (and its quotation line items) for a client. Starts at status 'draft' with an auto-assigned number (INV-YYYY-NNNN). Pass items[] with description/quantity/unitPriceMyr; totals are computed (taxRatePct defaults to 6% SST). Optionally link a contractId and set issueDate/dueDate (default: today / +14 days). After creating, use payments.createInvoiceLink to generate a payment link.",
    inputSchema: invoicesCreateInput,
    outputSchema: invoicesCreateResult,
    invoke: async (input) => {
        const created = await createInvoice({
            clientName: input.clientName,
            contractId: input.contractId ?? null,
            issueDate: input.issueDate,
            dueDate: input.dueDate,
            taxRatePct: input.taxRatePct,
        });
        // createInvoice starts with no items/notes — fill them in one update.
        const inv = await updateInvoice(created.id, {
            items: input.items.map((it) => ({
                id: "",
                description: it.description,
                details: it.details ?? "",
                quantity: it.quantity,
                unitPriceMyr: it.unitPriceMyr,
            })),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
        });
        const { subtotal, tax, total } = computeTotals(inv);
        return {
            id: inv.id,
            number: inv.number,
            clientName: inv.clientName,
            status: inv.status,
            issueDate: inv.issueDate,
            dueDate: inv.dueDate,
            subtotalMyr: subtotal,
            taxMyr: tax,
            totalMyr: total,
        };
    },
};

// ---- quotations.create ----------------------------------------------------

const quotationLineItemInput = z.object({
    description: z.string().min(1),
    /** Optional sub-points (one bullet per line) shown under the description. */
    details: z.string().optional(),
    quantity: z.number().positive(),
    unitPriceMyr: z.number().nonnegative(),
});

const quotationsCreateInput = z.object({
    clientName: z.string().min(1),
    /** Line items (description + qty + unit price in MYR). At least one. */
    items: z.array(quotationLineItemInput).min(1),
    /** Document title, e.g. "Website Enhancement & Backend Optimization". */
    subject: z.string().optional(),
    /** "Scope includes" bullets — one per line. */
    scopeIncludes: z.string().optional(),
    /** "Exclusions" bullets — one per line. */
    exclusions: z.string().optional(),
    /** "Terms & Conditions" bullets — one per line. */
    terms: z.string().optional(),
    notes: z.string().optional(),
    /** YYYY-MM-DD. Defaults to today. */
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** YYYY-MM-DD. Quote validity deadline. */
    validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    /** Tax/SST rate as a percent (e.g. 6 for 6%). Defaults to 6. */
    taxRatePct: z.number().min(0).max(100).optional(),
    /** Print the acceptance / signature block. */
    showAcceptance: z.boolean().optional(),
});
const quotationsCreateResult = z.object({
    id: z.string(),
    number: z.string(),
    clientName: z.string(),
    status: z.string(),
    issueDate: z.string(),
    validUntil: z.string(),
    subtotalMyr: z.number(),
    taxMyr: z.number(),
    totalMyr: z.number(),
});

export const quotationsCreate: AgentTool<
    z.infer<typeof quotationsCreateInput>,
    z.infer<typeof quotationsCreateResult>
> = {
    name: "quotations.create",
    description:
        "Create a new quotation (the pre-sale document, separate from an invoice) for a client. Starts at status 'draft' with an auto number (QUO-YYYY-NNNN). Pass items[] with description/quantity/unitPriceMyr; totals are computed (taxRatePct defaults to 6% SST). Optionally set subject, scopeIncludes/exclusions/terms (bullets, one per line), validUntil, and showAcceptance. Once the client accepts, a human can convert it into an invoice in the app.",
    inputSchema: quotationsCreateInput,
    outputSchema: quotationsCreateResult,
    invoke: async (input) => {
        const created = await createQuotation({
            clientName: input.clientName,
            issueDate: input.issueDate,
            validUntil: input.validUntil,
            taxRatePct: input.taxRatePct,
            terms: input.terms,
            showAcceptance: input.showAcceptance,
        });
        // createQuotation starts with no items/sections — fill them in one update.
        const q = await updateQuotation(created.id, {
            items: input.items.map((it) => ({
                id: "",
                description: it.description,
                details: it.details ?? "",
                quantity: it.quantity,
                unitPriceMyr: it.unitPriceMyr,
            })),
            ...(input.subject !== undefined ? { subject: input.subject } : {}),
            ...(input.scopeIncludes !== undefined
                ? { scopeIncludes: input.scopeIncludes }
                : {}),
            ...(input.exclusions !== undefined
                ? { exclusions: input.exclusions }
                : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
        });
        const { subtotal, tax, total } = computeQuotationTotals(q);
        return {
            id: q.id,
            number: q.number,
            clientName: q.clientName,
            status: q.status,
            issueDate: q.issueDate,
            validUntil: q.validUntil,
            subtotalMyr: subtotal,
            taxMyr: tax,
            totalMyr: total,
        };
    },
};

// ---- team.create ----------------------------------------------------------

const teamCreateInput = z.object({
    name: z.string().min(1),
    role: z.enum(TEAM_ROLES).optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    /** Free-text skills (comma-separated), used by assignment suggestions. */
    skills: z.string().optional(),
});
const teamCreateResult = z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    active: z.boolean(),
});

export const teamCreate: AgentTool<
    z.infer<typeof teamCreateInput>,
    z.infer<typeof teamCreateResult>
> = {
    name: "team.create",
    description:
        "Add a new team member (starts active). role is one of CEO/Closer/Frontend/Backend/UI/UX/Content/Ads/SEO/PM/Other (defaults to Other). Use to onboard staff so contract tasks can be assigned to them via tasks.setSplit. This only creates the member record; it does not create a login account.",
    inputSchema: teamCreateInput,
    outputSchema: teamCreateResult,
    invoke: async (input) => {
        const m = await createTeamMember({
            name: input.name,
            role: input.role,
            email: input.email,
            phone: input.phone,
            skills: input.skills,
        });
        return { id: m.id, name: m.name, role: m.role, active: m.active };
    },
};

// ---------------------------------------------------------------------------
// DESTRUCTIVE tools (deletions — HUMAN APPROVAL REQUIRED)
//
// These are classified "destructive" in agent/scopes.ts. The autonomous
// scrum-master key ([read, write, outbound]) does NOT carry that scope, so the
// API refuses these calls with "requires human approval". They exist so a
// human-operated admin key (or a future approval flow) can perform deletions
// through the same audited path — never silently from the agent. Contracts
// and their tasks are never deleted through the agent API at all.
// ---------------------------------------------------------------------------

const deletedResult = z.object({
    id: z.string(),
    deleted: z.literal(true),
});

const contentDeleteInput = z.object({ contentId: z.string().min(1) });

export const contentDelete: AgentTool<
    z.infer<typeof contentDeleteInput>,
    z.infer<typeof deletedResult>
> = {
    name: "content.delete",
    description:
        "Permanently delete a content post (and its drafts/feedback). Irreversible — requires human approval (destructive scope).",
    inputSchema: contentDeleteInput,
    outputSchema: deletedResult,
    invoke: async (input) => {
        await deleteContentPost(input.contentId);
        return { id: input.contentId, deleted: true };
    },
};

// ---------------------------------------------------------------------------
// Master registry
// ---------------------------------------------------------------------------

export const AGENT_TOOLS: AgentTool[] = [
    aiSummariseSubmission as unknown as AgentTool,
    emailSendOnboardingLink as unknown as AgentTool,
    paymentsCreateInvoiceLink as unknown as AgentTool,
    paymentsCheckInvoiceStatus as unknown as AgentTool,
    telegramSendAlert as unknown as AgentTool,
    contentGeneratePlan as unknown as AgentTool,
    contentSubmitDraft as unknown as AgentTool,
    contentRequestChanges as unknown as AgentTool,
    contentApprove as unknown as AgentTool,
    contentCreateRequest as unknown as AgentTool,
    // Scrum-master reads
    teamList as unknown as AgentTool,
    contractsList as unknown as AgentTool,
    contractGet as unknown as AgentTool,
    tasksList as unknown as AgentTool,
    overdueList as unknown as AgentTool,
    boardSummary as unknown as AgentTool,
    // Scrum-master writes
    tasksSetStatus as unknown as AgentTool,
    tasksSetSplit as unknown as AgentTool,
    // Clients + listing reads
    clientsList as unknown as AgentTool,
    clientsCreate as unknown as AgentTool,
    contentList as unknown as AgentTool,
    invoicesList as unknown as AgentTool,
    // Billing + team writes
    invoicesCreate as unknown as AgentTool,
    quotationsCreate as unknown as AgentTool,
    teamCreate as unknown as AgentTool,
    // Destructive (human approval required — not in the agent key's scopes)
    contentDelete as unknown as AgentTool,
];

/** Look up a tool by name. Throws if unknown — the agent must not invent tools. */
export function getTool(name: string): AgentTool {
    const t = AGENT_TOOLS.find((x) => x.name === name);
    if (!t) throw new Error(`Unknown agent tool: ${name}`);
    return t;
}
