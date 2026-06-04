/**
 * Generic email sender.
 *
 * Every email in the app routes through here. Reasons:
 *  - Single retry on transient provider errors.
 *  - Centralised "from" address (test mode vs production).
 *  - Single place to attach observability (Sentry, PostHog) later.
 *  - Single place to enforce "test-mode only sends to verified email" if we
 *    ever want a hard guardrail.
 *
 * Server-only.
 */
import "server-only";
import { defaultFromAddress, resendClient } from "./client";

export type SendEmailInput = {
    to: string | string[];
    subject: string;
    html: string;
    /** Plain-text fallback. Optional — Resend auto-strips HTML if omitted. */
    text?: string;
    /** Override `from`. Almost always leave undefined (uses `defaultFromAddress`). */
    from?: string;
    /** ReplyTo header (e.g. set so clients reply directly to the closer). */
    replyTo?: string;
};

export type SendEmailResult = {
    id: string;
    to: string[];
    sentAt: string;
};

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const from = input.from ?? defaultFromAddress();
    const to = Array.isArray(input.to) ? input.to : [input.to];

    const attempt = async () => {
        const res = await resendClient().emails.send({
            from,
            to,
            subject: input.subject,
            html: input.html,
            ...(input.text ? { text: input.text } : {}),
            ...(input.replyTo ? { replyTo: input.replyTo } : {}),
        });
        if (res.error) throw new Error(res.error.message);
        if (!res.data?.id) throw new Error("Resend returned no message id");
        return res.data.id;
    };

    let id: string;
    try {
        id = await attempt();
    } catch (firstErr) {
        // eslint-disable-next-line no-console
        console.warn("Email send first attempt failed, retrying in 1s:", (firstErr as Error).message);
        await new Promise((r) => setTimeout(r, 1000));
        id = await attempt();
    }

    return { id, to, sentAt: new Date().toISOString() };
}
