/**
 * Dev-only Telegram smoke test.
 *
 * GET /api/telegram/test → sends a sample alert to the configured team chat.
 * Returns 200 on success, 500 with the error message if Telegram rejected it.
 */
import { NextResponse } from "next/server";
import { sendTelegram, escapeMd } from "@/lib/telegram/send";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Disabled in production" }, { status: 404 });
    }

    const text = [
        `🔔 *Nexov Admin — Telegram wiring test*`,
        escapeMd(
            `If you're seeing this, the bot token + chat id are working. Real alerts (new leads, paid invoices, etc.) will land here.`,
        ),
    ].join("\n");

    const res = await sendTelegram({
        text,
        buttons: [
            {
                text: "Open Nexov Admin",
                url: env.NEXT_PUBLIC_SITE_URL,
            },
        ],
    });

    return NextResponse.json(res, { status: res.ok ? 200 : 500 });
}
