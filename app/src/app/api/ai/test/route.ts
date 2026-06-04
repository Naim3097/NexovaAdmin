/**
 * Dev-only AI smoke test endpoint.
 *
 * GET /api/ai/test            → "ping": tiny generation to confirm the key works
 * GET /api/ai/test?demo=brief → runs the onboarding summariser on hard-coded sample
 *
 * Disabled in production. Use this to verify provider wiring without going
 * through the UI flow.
 */
import { NextResponse } from "next/server";
import { generateText } from "@/lib/ai/generate";
import { aiSummariseSubmission } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Disabled in production" }, { status: 404 });
    }

    const url = new URL(req.url);
    const demo = url.searchParams.get("demo");

    try {
        if (demo === "brief") {
            const result = await aiSummariseSubmission.invoke({
                clientName: "Kopi Kita Sdn Bhd",
                serviceType: "Website Creation",
                submission: {
                    business_name: "Kopi Kita",
                    tagline: "Honest coffee, made here",
                    about_us:
                        "Small KL-based roastery, 3 cafe outlets. Targeting young professionals. Currently sells via WhatsApp and Shopee.",
                    goal: "sell",
                    style: "Warm, Minimal",
                    services_json: [
                        { name: "Single-origin beans (250g)", description: "Subscription option" },
                        { name: "Brewing gear", description: "" },
                    ],
                    references: "blueottlecoffee.com, https://kopitiamcoffee.example",
                    pricing: "RM 35–90 per 250g bag",
                    operating_hours: "Mon-Sat 8am-6pm",
                },
            });
            return NextResponse.json({ ok: true, result });
        }

        // Default: ping
        const text = await generateText(
            "In exactly 8 words, describe a digital agency that loves Malaysian clients.",
        );
        return NextResponse.json({ ok: true, text });
    } catch (e) {
        return NextResponse.json(
            { ok: false, error: (e as Error).message },
            { status: 500 },
        );
    }
}
