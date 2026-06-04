/**
 * Send a Telegram message to the configured team chat.
 *
 * Failure policy: returns { ok: false, error } instead of throwing. Telegram
 * outages or bad config should NEVER block the underlying action (lead create,
 * payment received, etc.). The error gets logged for visibility.
 *
 * Server-only.
 */
import "server-only";
import { readTelegramConfig } from "./client";

export type TelegramSendInput = {
    /** Markdown-formatted text (Telegram MarkdownV2 — see escape helper). */
    text: string;
    /** Optional override (advanced — link buttons etc). Most callers won't need. */
    parseMode?: "MarkdownV2" | "HTML";
    /** Override the chat id (e.g. send to a specific user, not the team). */
    chatId?: string;
    /** Optional inline keyboard, e.g. [{ text: "Open", url: "https://..." }]. */
    buttons?: Array<{ text: string; url: string }>;
};

export type TelegramSendResult = {
    ok: boolean;
    error?: string;
    messageId?: number;
};

export async function sendTelegram(
    input: TelegramSendInput,
): Promise<TelegramSendResult> {
    const cfg = readTelegramConfig();
    if (!cfg) {
        // Silent no-op when Telegram isn't configured — useful in dev / before signup.
        // eslint-disable-next-line no-console
        console.warn("Telegram skip — bot token / chat id not set.");
        return { ok: false, error: "Telegram not configured" };
    }

    const url = `https://api.telegram.org/bot${cfg.botToken}/sendMessage`;

    // Telegram rejects inline-button URLs that aren't HTTPS public URLs.
    // In dev, links are `http://localhost:3001/...` — drop those buttons and
    // append the URL into the message text instead so it's still copyable.
    const validButtons = (input.buttons ?? []).filter((b) =>
        b.url.startsWith("https://"),
    );
    const droppedButtons = (input.buttons ?? []).filter(
        (b) => !b.url.startsWith("https://"),
    );

    let text = input.text;
    if (droppedButtons.length > 0) {
        const lines = droppedButtons.map(
            (b) => `${escapeMd(b.text)}: ${escapeMd(b.url)}`,
        );
        text = `${text}\n\n${lines.join("\n")}`;
    }

    const body: Record<string, unknown> = {
        chat_id: input.chatId ?? cfg.chatId,
        text,
        parse_mode: input.parseMode ?? "MarkdownV2",
        disable_web_page_preview: true,
    };
    if (validButtons.length > 0) {
        body.reply_markup = {
            inline_keyboard: [validButtons.map((b) => ({ text: b.text, url: b.url }))],
        };
    }

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
        const data = (await res.json()) as {
            ok: boolean;
            description?: string;
            result?: { message_id?: number };
        };
        if (!data.ok) {
            // eslint-disable-next-line no-console
            console.warn("Telegram send failed:", data.description);
            return { ok: false, error: data.description };
        }
        return { ok: true, messageId: data.result?.message_id };
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("Telegram send threw:", (e as Error).message);
        return { ok: false, error: (e as Error).message };
    }
}

/**
 * Escape user-controlled text for Telegram MarkdownV2. Telegram is picky:
 * `_`, `*`, `[`, `]`, `(`, `)`, `~`, etc. must be backslash-escaped or the
 * whole message fails to parse.
 */
export function escapeMd(s: string): string {
    return s.replace(/[_*\[\]()~`>#+\-=|{}.!]/g, (m) => `\\${m}`);
}
