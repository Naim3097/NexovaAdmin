import { getCurrentUser } from "@/lib/auth";
import {
    REPORT_KINDS,
    buildReportCsv,
    reportFilename,
    type ReportKind,
} from "@/lib/reports";

export const dynamic = "force-dynamic";

function isReportKind(v: string | null): v is ReportKind {
    return !!v && (REPORT_KINDS as readonly string[]).includes(v);
}

export async function GET(req: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const url = new URL(req.url);
    const kind = url.searchParams.get("kind");
    if (!isReportKind(kind)) {
        return new Response(
            `Unknown report kind. Valid: ${REPORT_KINDS.join(", ")}`,
            { status: 400 },
        );
    }

    const yearParam = url.searchParams.get("year");
    const year = yearParam ? Number.parseInt(yearParam, 10) : undefined;
    const fromDate = url.searchParams.get("from") ?? undefined;
    const toDate = url.searchParams.get("to") ?? undefined;

    const csv = await buildReportCsv(kind, {
        year: Number.isFinite(year) ? year : undefined,
        fromDate,
        toDate,
    });
    const filename = reportFilename(kind, { year });

    // BOM so Excel auto-detects UTF-8 (no mojibake on names like "Müller")
    const body = "\uFEFF" + csv;

    return new Response(body, {
        status: 200,
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
        },
    });
}
