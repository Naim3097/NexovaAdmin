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
} from "@/lib/data/content";
import { listClients } from "@/lib/data/clients";

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
];

/** Look up a tool by name. Throws if unknown — the agent must not invent tools. */
export function getTool(name: string): AgentTool {
    const t = AGENT_TOOLS.find((x) => x.name === name);
    if (!t) throw new Error(`Unknown agent tool: ${name}`);
    return t;
}
