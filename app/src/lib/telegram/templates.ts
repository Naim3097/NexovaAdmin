/**
 * Message templates for each notify-kind that's worth pushing to Telegram.
 *
 * Why a switch and not 10 separate templates: the data we have is uniform
 * (kind + title + body + link), so one place to format keeps tone consistent
 * and adding kinds is one switch arm.
 *
 * Returns null if a kind shouldn't be Telegram-ified (e.g. low-noise system
 * events) — caller treats null as "skip".
 */
import "server-only";
import { escapeMd } from "./send";
import { env } from "@/lib/env";

import type { NotificationKind } from "@/lib/data/notifications";

export type TelegramMessage = {
    text: string;
    button?: { text: string; url: string };
};

const EMOJI: Partial<Record<NotificationKind, string>> = {
    lead_new: "🟢",
    lead_won: "💰",
    lead_lost: "⚪",
    onboarding_submitted: "📝",
    invoice_issued: "📤",
    invoice_paid: "✅",
    invoice_overdue: "⚠️",
    project_signoff: "🎉",
    deliverable_approved: "👍",
    stage_advanced: "➡️",
    quote_sent: "📄",
    quote_accepted: "🤝",
    task_due_soon: "⏰",
};

/** Which kinds should ping Telegram. The rest stay in-app only. */
const TELEGRAM_KINDS = new Set<NotificationKind>([
    "lead_new",
    "lead_won",
    "lead_lost",
    "onboarding_submitted",
    "invoice_issued",
    "invoice_paid",
    "invoice_overdue",
    "project_signoff",
    "stage_advanced",
    "quote_accepted",
    "task_due_soon",
]);

export function renderTelegramFromNotify(args: {
    kind: NotificationKind;
    title: string;
    body?: string | null;
    link?: string | null;
}): TelegramMessage | null {
    if (!TELEGRAM_KINDS.has(args.kind)) return null;

    const emoji = EMOJI[args.kind] ?? "🔔";
    const lines = [
        `${emoji} *${escapeMd(args.title)}*`,
        args.body ? escapeMd(args.body) : null,
    ].filter(Boolean) as string[];

    const text = lines.join("\n");

    const button = args.link
        ? {
              text: "Open in Nexov Admin",
              url: absoluteUrl(args.link),
          }
        : undefined;

    return { text, button };
}

function absoluteUrl(pathOrUrl: string): string {
    if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
    const base = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
