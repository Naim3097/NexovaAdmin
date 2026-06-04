/**
 * Telegram Bot API client.
 *
 * Uses the bot's HTTP API directly — no SDK needed (Telegram's API is tiny).
 * Reads creds at call time so missing vars fail clearly at request, not load.
 *
 * Docs: https://core.telegram.org/bots/api
 * Server-only.
 */
import "server-only";
import { env } from "@/lib/env";

export type TelegramConfig = {
    botToken: string;
    chatId: string;
};

export function readTelegramConfig(): TelegramConfig | null {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_TEAM_CHAT_ID) {
        return null;
    }
    return {
        botToken: env.TELEGRAM_BOT_TOKEN,
        chatId: env.TELEGRAM_TEAM_CHAT_ID,
    };
}

export function requireTelegramConfig(): TelegramConfig {
    const cfg = readTelegramConfig();
    if (!cfg) {
        throw new Error(
            "TELEGRAM_BOT_TOKEN and/or TELEGRAM_TEAM_CHAT_ID not set. See docs/pending-production-setup.md.",
        );
    }
    return cfg;
}
