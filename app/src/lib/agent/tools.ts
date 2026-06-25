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
    listProjects,
    getProjectById,
    createProject,
    instantiateProjectStages,
    addProjectTask,
    toggleProjectTask,
    setProjectTaskAssignee,
    setProjectPhase,
    advanceProjectStage,
    setProjectStageAssignee,
    deleteProject,
    deleteProjectTask,
} from "@/lib/data/projects";
import { SERVICE_CATEGORIES } from "@/lib/dev-store/services";
import {
    listInvoices,
    createInvoice,
    updateInvoice,
    computeTotals,
} from "@/lib/data/invoices";
import { listTeamMembers, createTeamMember, TEAM_ROLES } from "@/lib/data/team";

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
// There is no standalone "tasks" table: delivery work lives as embedded
// `tasks[]` / `stages[]` on each project, and `content_posts` carry their own
// `scheduledFor` due date + review state. These read tools flatten those into
// the shape a scrum master needs. All are pure reads — safe to call freely.
// ---------------------------------------------------------------------------

/** Today as YYYY-MM-DD (UTC). Used for overdue comparisons. */
function todayISO(): string {
    return new Date().toISOString().slice(0, 10);
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
    openTasks: z.number(),
    activeStages: z.number(),
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
        "List team members with their current workload (count of open project tasks + active workflow stages assigned to them). Use to see who owns what before assigning or chasing work. activeOnly defaults true.",
    inputSchema: teamListInput,
    outputSchema: teamListResult,
    invoke: async (input) => {
        const [members, projects] = await Promise.all([
            listTeamMembers(),
            listProjects(),
        ]);
        const norm = (s: string) => s.trim().toLowerCase();
        const members2 = (input.activeOnly ? members.filter((m) => m.active) : members).map(
            (m) => {
                const key = norm(m.name);
                let openTasks = 0;
                let activeStages = 0;
                for (const p of projects) {
                    for (const t of p.tasks) {
                        if (!t.done && norm(t.assignee) === key) openTasks++;
                    }
                    for (const s of p.stages) {
                        if (s.state === "active" && norm(s.assignee) === key) activeStages++;
                    }
                }
                return {
                    id: m.id,
                    name: m.name,
                    role: m.role,
                    active: m.active,
                    openTasks,
                    activeStages,
                };
            },
        );
        return { members: members2 };
    },
};

// ---- projects.list --------------------------------------------------------

const projectsListInput = z.object({
    status: z
        .enum(["kickoff", "in_progress", "review", "delivered", "on_hold"])
        .optional(),
    clientName: z.string().optional(),
    assignee: z.string().optional(),
});
const projectSummary = z.object({
    id: z.string(),
    name: z.string(),
    clientName: z.string(),
    status: z.string(),
    phase: z.string(),
    activeStage: z.string().nullable(),
    openTaskCount: z.number(),
});
const projectsListResult = z.object({
    projects: z.array(projectSummary),
});

export const projectsListTool: AgentTool<
    z.infer<typeof projectsListInput>,
    z.infer<typeof projectsListResult>
> = {
    name: "projects.list",
    description:
        "List delivery projects with status, phase, the current active workflow stage, and open-task count. Optional filters: status, clientName, assignee (only projects with an open task OR active stage owned by that person).",
    inputSchema: projectsListInput,
    outputSchema: projectsListResult,
    invoke: async (input) => {
        const norm = (s: string) => s.trim().toLowerCase();
        let projects = await listProjects();
        if (input.status) projects = projects.filter((p) => p.status === input.status);
        if (input.clientName)
            projects = projects.filter((p) => norm(p.clientName) === norm(input.clientName!));
        if (input.assignee) {
            const a = norm(input.assignee);
            projects = projects.filter(
                (p) =>
                    p.tasks.some((t) => !t.done && norm(t.assignee) === a) ||
                    p.stages.some((s) => s.state === "active" && norm(s.assignee) === a),
            );
        }
        return {
            projects: projects.map((p) => ({
                id: p.id,
                name: p.name,
                clientName: p.clientName,
                status: p.status,
                phase: p.phase,
                activeStage: p.stages.find((s) => s.state === "active")?.label ?? null,
                openTaskCount: p.tasks.filter((t) => !t.done).length,
            })),
        };
    },
};

// ---- standup.tasks --------------------------------------------------------

const standupInput = z.object({
    assignee: z.string().optional(),
});
const standupItem = z.object({
    projectId: z.string(),
    projectName: z.string(),
    clientName: z.string(),
    kind: z.enum(["task", "stage"]),
    /** The task id (kind=task) or stage id (kind=stage) — pass to tasks.toggle / projects.assignStage. */
    itemId: z.string(),
    title: z.string(),
    assignee: z.string(),
    phase: z.string(),
});
const standupResult = z.object({
    items: z.array(standupItem),
});

export const standupTasks: AgentTool<
    z.infer<typeof standupInput>,
    z.infer<typeof standupResult>
> = {
    name: "standup.tasks",
    description:
        "Flatten all in-flight work into a single list for a daily standup: every incomplete project task and every active workflow stage, each tagged with its project, client, and assignee. Optional assignee filter. (Project tasks have no due date in this system — use overdue.list for date-based overdue tracking.)",
    inputSchema: standupInput,
    outputSchema: standupResult,
    invoke: async (input) => {
        const norm = (s: string) => s.trim().toLowerCase();
        const projects = await listProjects();
        const items: z.infer<typeof standupItem>[] = [];
        for (const p of projects) {
            for (const t of p.tasks) {
                if (t.done) continue;
                items.push({
                    projectId: p.id,
                    projectName: p.name,
                    clientName: p.clientName,
                    kind: "task",
                    itemId: t.id,
                    title: t.title,
                    assignee: t.assignee,
                    phase: t.phase || p.phase,
                });
            }
            for (const s of p.stages) {
                if (s.state !== "active") continue;
                items.push({
                    projectId: p.id,
                    projectName: p.name,
                    clientName: p.clientName,
                    kind: "stage",
                    itemId: s.id,
                    title: s.label,
                    assignee: s.assignee,
                    phase: p.phase,
                });
            }
        }
        const filtered = input.assignee
            ? items.filter((i) => norm(i.assignee) === norm(input.assignee!))
            : items;
        return { items: filtered };
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
    projectsByStatus: z.record(z.string(), z.number()),
    projectsByPhase: z.record(z.string(), z.number()),
    contentByReviewStatus: z.record(z.string(), z.number()),
    openTaskTotal: z.number(),
    overdueContentCount: z.number(),
    overdueInvoiceCount: z.number(),
});

export const boardSummary: AgentTool<
    z.infer<typeof boardSummaryInput>,
    z.infer<typeof boardSummaryResult>
> = {
    name: "board.summary",
    description:
        "Sprint/board summary in one call: project counts by status and by phase, content counts by review status, total open tasks, and overdue counts. Use for the daily standup header and the weekly sprint summary.",
    inputSchema: boardSummaryInput,
    outputSchema: boardSummaryResult,
    invoke: async () => {
        const today = todayISO();
        const [projects, posts, invoices] = await Promise.all([
            listProjects(),
            listContentPosts(),
            listInvoices(),
        ]);
        const byStatus: Record<string, number> = {};
        const byPhase: Record<string, number> = {};
        let openTaskTotal = 0;
        for (const p of projects) {
            byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
            byPhase[p.phase] = (byPhase[p.phase] ?? 0) + 1;
            openTaskTotal += p.tasks.filter((t) => !t.done).length;
        }
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
            projectsByStatus: byStatus,
            projectsByPhase: byPhase,
            contentByReviewStatus: byReview,
            openTaskTotal,
            overdueContentCount,
            overdueInvoiceCount,
        };
    },
};

// ---- project.get ----------------------------------------------------------

const projectGetInput = z.object({
    projectId: z.string().min(1),
});
const projectDetailTask = z.object({
    id: z.string(),
    title: z.string(),
    done: z.boolean(),
    assignee: z.string(),
    phase: z.string(),
});
const projectDetailStage = z.object({
    id: z.string(),
    label: z.string(),
    ownerRole: z.string(),
    assignee: z.string(),
    state: z.string(),
});
const projectGetResult = z.object({
    id: z.string(),
    name: z.string(),
    clientName: z.string(),
    status: z.string(),
    phase: z.string(),
    tasks: z.array(projectDetailTask),
    stages: z.array(projectDetailStage),
});

export const projectGet: AgentTool<
    z.infer<typeof projectGetInput>,
    z.infer<typeof projectGetResult>
> = {
    name: "project.get",
    description:
        "Full detail for one project including every task id and stage id (which the write tools need). Use this to find the taskId / stageId before calling tasks.toggle or projects.assignStage.",
    inputSchema: projectGetInput,
    outputSchema: projectGetResult,
    invoke: async (input) => {
        const p = await getProjectById(input.projectId);
        if (!p) throw new Error(`Project ${input.projectId} not found`);
        return {
            id: p.id,
            name: p.name,
            clientName: p.clientName,
            status: p.status,
            phase: p.phase,
            tasks: p.tasks.map((t) => ({
                id: t.id,
                title: t.title,
                done: t.done,
                assignee: t.assignee,
                phase: t.phase || "",
            })),
            stages: p.stages.map((s) => ({
                id: s.id,
                label: s.label,
                ownerRole: s.ownerRole,
                assignee: s.assignee,
                state: s.state,
            })),
        };
    },
};

// ---------------------------------------------------------------------------
// Scrum-master WRITE tools (move work along the board)
//
// All thin wrappers over the existing project data helpers. Each throws if the
// project/task/stage id is unknown — the dispatcher surfaces that as a 500 with
// the message, so the agent learns the id was wrong. The full project is
// returned so the agent can confirm the new state in one round-trip.
// ---------------------------------------------------------------------------

const PROJECT_PHASE_VALUES = [
    "discovery",
    "design",
    "build",
    "qa",
    "client_review",
    "launch",
    "closed",
] as const;

/** Compact view of a project returned after a mutation. */
const projectStateResult = z.object({
    id: z.string(),
    name: z.string(),
    status: z.string(),
    phase: z.string(),
    activeStage: z.string().nullable(),
    openTaskCount: z.number(),
});
type ProjectStateResult = z.infer<typeof projectStateResult>;

function toProjectState(p: {
    id: string;
    name: string;
    status: string;
    phase: string;
    stages: { label: string; state: string }[];
    tasks: { done: boolean }[];
}): ProjectStateResult {
    return {
        id: p.id,
        name: p.name,
        status: p.status,
        phase: p.phase,
        activeStage: p.stages.find((s) => s.state === "active")?.label ?? null,
        openTaskCount: p.tasks.filter((t) => !t.done).length,
    };
}

// ---- projects.create ------------------------------------------------------

const projectsCreateInput = z.object({
    name: z.string().min(1),
    clientName: z.string().min(1),
    /**
     * Optional service category. If given, the project's delivery stage
     * pipeline is instantiated from that category's workflow template (stages
     * auto-assigned to the first active member of each owner role). Omit to
     * create a bare project (no stages) and add tasks/stages manually.
     */
    serviceCategory: z.enum(SERVICE_CATEGORIES).optional(),
});

export const projectsCreate: AgentTool<
    z.infer<typeof projectsCreateInput>,
    ProjectStateResult
> = {
    name: "projects.create",
    description:
        "Create a new delivery project for a client (starts at status 'kickoff', phase 'discovery'). Optionally pass serviceCategory (website|ads|seo|content|app|branding|retainer|other) to auto-build its stage pipeline from that template. After creating, use tasks.add / projects.assignStage to assign work to individuals.",
    inputSchema: projectsCreateInput,
    outputSchema: projectStateResult,
    invoke: async (input) => {
        let p = await createProject({
            name: input.name,
            clientName: input.clientName,
        });
        if (input.serviceCategory) {
            p = await instantiateProjectStages(p.id, input.serviceCategory);
        }
        return toProjectState(p);
    },
};

// ---- tasks.add ------------------------------------------------------------

const tasksAddInput = z.object({
    projectId: z.string().min(1),
    title: z.string().min(1),
    assignee: z.string().optional(),
    phase: z.enum(PROJECT_PHASE_VALUES).optional(),
});

export const tasksAdd: AgentTool<
    z.infer<typeof tasksAddInput>,
    ProjectStateResult
> = {
    name: "tasks.add",
    description:
        "Add a checklist task to a project (starts incomplete). assignee is a team member name; phase tags the task to a delivery phase. Use when a standup surfaces work that isn't tracked yet.",
    inputSchema: tasksAddInput,
    outputSchema: projectStateResult,
    invoke: async (input) => {
        const p = await addProjectTask(
            input.projectId,
            input.title,
            input.assignee ?? "",
            input.phase ?? "",
        );
        return toProjectState(p);
    },
};

// ---- tasks.toggle ---------------------------------------------------------

const tasksToggleInput = z.object({
    projectId: z.string().min(1),
    taskId: z.string().min(1),
});

export const tasksToggle: AgentTool<
    z.infer<typeof tasksToggleInput>,
    ProjectStateResult
> = {
    name: "tasks.toggle",
    description:
        "Flip a project task's done state (incomplete ↔ done). Use to tick off work someone reports finished, or to reopen it. Get task ids from standup.tasks / projects.list.",
    inputSchema: tasksToggleInput,
    outputSchema: projectStateResult,
    invoke: async (input) => {
        const p = await toggleProjectTask(input.projectId, input.taskId);
        return toProjectState(p);
    },
};

// ---- projects.setPhase ----------------------------------------------------

const setPhaseInput = z.object({
    projectId: z.string().min(1),
    phase: z.enum(PROJECT_PHASE_VALUES),
});

export const projectsSetPhase: AgentTool<
    z.infer<typeof setPhaseInput>,
    ProjectStateResult
> = {
    name: "projects.setPhase",
    description:
        "Set a project's delivery phase (discovery → design → build → qa → client_review → launch → closed). This is the high-level phase, separate from the stage pipeline; use projects.advanceStage to move the stage flow.",
    inputSchema: setPhaseInput,
    outputSchema: projectStateResult,
    invoke: async (input) => {
        const p = await setProjectPhase(input.projectId, input.phase);
        return toProjectState(p);
    },
};

// ---- projects.advanceStage ------------------------------------------------

const advanceStageInput = z.object({
    projectId: z.string().min(1),
});

export const projectsAdvanceStage: AgentTool<
    z.infer<typeof advanceStageInput>,
    ProjectStateResult
> = {
    name: "projects.advanceStage",
    description:
        "Mark the project's current active workflow stage done and activate the next pending one. Use when a stage owner reports their stage complete. No-op-safe if nothing is active (activates the first pending stage instead).",
    inputSchema: advanceStageInput,
    outputSchema: projectStateResult,
    invoke: async (input) => {
        const p = await advanceProjectStage(input.projectId);
        return toProjectState(p);
    },
};

// ---- projects.assignStage -------------------------------------------------

const assignStageInput = z.object({
    projectId: z.string().min(1),
    stageId: z.string().min(1),
    assignee: z.string().min(1),
});

export const projectsAssignStage: AgentTool<
    z.infer<typeof assignStageInput>,
    ProjectStateResult
> = {
    name: "projects.assignStage",
    description:
        "Reassign a workflow stage to a different team member (the stage's PIC). assignee is a team member name. Get stageId from projects.list / the project detail.",
    inputSchema: assignStageInput,
    outputSchema: projectStateResult,
    invoke: async (input) => {
        const p = await setProjectStageAssignee(
            input.projectId,
            input.stageId,
            input.assignee,
        );
        return toProjectState(p);
    },
};

// ---------------------------------------------------------------------------
// Clients, content list, invoices list, task reassignment
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
        "List the agency's clients (optionally filter by status: prospect/active/paused/churned). Use to see who exists before creating a project, or to answer 'who are our clients'.",
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
        "Create a new client record (defaults to status 'prospect'). Use before/while creating a project so the project can attach to a real client. Name must be unique.",
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
    projectId: z.string().optional(),
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
        "Create a new invoice (and its quotation line items) for a client. Starts at status 'draft' with an auto-assigned number (INV-YYYY-NNNN). Pass items[] with description/quantity/unitPriceMyr; totals are computed (taxRatePct defaults to 6% SST). Optionally link a projectId and set issueDate/dueDate (default: today / +14 days). After creating, use payments.createInvoiceLink to generate a payment link.",
    inputSchema: invoicesCreateInput,
    outputSchema: invoicesCreateResult,
    invoke: async (input) => {
        const created = await createInvoice({
            clientName: input.clientName,
            projectId: input.projectId ?? null,
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
        "Add a new team member (starts active). role is one of CEO/Closer/Frontend/Backend/UI/UX/Content/Ads/SEO/PM/Other (defaults to Other). Use to onboard staff so work can be assigned to them via tasks.add / projects.assignStage. This only creates the member record; it does not create a login account.",
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

// ---- tasks.reassign -------------------------------------------------------

const tasksReassignInput = z.object({
    projectId: z.string().min(1),
    taskId: z.string().min(1),
    assignee: z.string().min(1),
});

export const tasksReassign: AgentTool<
    z.infer<typeof tasksReassignInput>,
    ProjectStateResult
> = {
    name: "tasks.reassign",
    description:
        "Change the assignee (PIC) of an existing project task. assignee is a team member name. Get the taskId from standup.tasks (itemId) or project.get. Use to move a task to a different person without recreating it.",
    inputSchema: tasksReassignInput,
    outputSchema: projectStateResult,
    invoke: async (input) => {
        const p = await setProjectTaskAssignee(
            input.projectId,
            input.taskId,
            input.assignee,
        );
        return toProjectState(p);
    },
};

// ---------------------------------------------------------------------------
// DESTRUCTIVE tools (deletions — HUMAN APPROVAL REQUIRED)
//
// These are classified "destructive" in agent/scopes.ts. The autonomous
// scrum-master key ([read, write, outbound]) does NOT carry that scope, so the
// API refuses these calls with "requires human approval". They exist so a
// human-operated admin key (or a future approval flow) can perform deletions
// through the same audited path — never silently from the agent.
// ---------------------------------------------------------------------------

const deletedResult = z.object({
    id: z.string(),
    deleted: z.literal(true),
});

const projectsDeleteInput = z.object({ projectId: z.string().min(1) });

export const projectsDelete: AgentTool<
    z.infer<typeof projectsDeleteInput>,
    z.infer<typeof deletedResult>
> = {
    name: "projects.delete",
    description:
        "Permanently delete a project and its embedded tasks/stages. Irreversible — requires human approval (destructive scope); the scrum-master agent cannot call this.",
    inputSchema: projectsDeleteInput,
    outputSchema: deletedResult,
    invoke: async (input) => {
        await deleteProject(input.projectId);
        return { id: input.projectId, deleted: true };
    },
};

const tasksDeleteInput = z.object({
    projectId: z.string().min(1),
    taskId: z.string().min(1),
});

export const tasksDelete: AgentTool<
    z.infer<typeof tasksDeleteInput>,
    ProjectStateResult
> = {
    name: "tasks.delete",
    description:
        "Permanently remove a task from a project. Irreversible — requires human approval (destructive scope). Prefer tasks.toggle to mark work done; use delete only to remove a mistaken task.",
    inputSchema: tasksDeleteInput,
    outputSchema: projectStateResult,
    invoke: async (input) => {
        const p = await deleteProjectTask(input.projectId, input.taskId);
        return toProjectState(p);
    },
};

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
    projectsListTool as unknown as AgentTool,
    projectGet as unknown as AgentTool,
    standupTasks as unknown as AgentTool,
    overdueList as unknown as AgentTool,
    boardSummary as unknown as AgentTool,
    // Scrum-master writes
    projectsCreate as unknown as AgentTool,
    tasksAdd as unknown as AgentTool,
    tasksToggle as unknown as AgentTool,
    tasksReassign as unknown as AgentTool,
    projectsSetPhase as unknown as AgentTool,
    projectsAdvanceStage as unknown as AgentTool,
    projectsAssignStage as unknown as AgentTool,
    // Clients + listing reads
    clientsList as unknown as AgentTool,
    clientsCreate as unknown as AgentTool,
    contentList as unknown as AgentTool,
    invoicesList as unknown as AgentTool,
    // Billing + team writes
    invoicesCreate as unknown as AgentTool,
    teamCreate as unknown as AgentTool,
    // Destructive (human approval required — not in the agent key's scopes)
    projectsDelete as unknown as AgentTool,
    tasksDelete as unknown as AgentTool,
    contentDelete as unknown as AgentTool,
];

/** Look up a tool by name. Throws if unknown — the agent must not invent tools. */
export function getTool(name: string): AgentTool {
    const t = AGENT_TOOLS.find((x) => x.name === name);
    if (!t) throw new Error(`Unknown agent tool: ${name}`);
    return t;
}
