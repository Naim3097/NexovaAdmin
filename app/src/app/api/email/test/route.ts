/**
 * Dev-only email smoke test.
 *
 * GET /api/email/test?to=you@example.com
 *   → sends the "onboarding link" template to the given address.
 *
 * In Resend test mode, `to` must equal the address you signed up to Resend
 * with. Disabled in production.
 */
import { NextResponse } from "next/server";
import { emailSendOnboardingLink } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Disabled in production" }, { status: 404 });
    }

    const url = new URL(req.url);
    const to = url.searchParams.get("to");
    if (!to) {
        return NextResponse.json(
            { error: "Pass ?to=you@example.com" },
            { status: 400 },
        );
    }

    try {
        const result = await emailSendOnboardingLink.invoke({
            clientName: "Test Client",
            clientEmail: to,
            link: "http://localhost:3001/onboard/test-token-abc123",
            fromTeamMember: "Danis",
        });
        return NextResponse.json({ ok: true, result });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: (e as Error).message },
            { status: 500 },
        );
    }
}
