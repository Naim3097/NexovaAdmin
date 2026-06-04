import { NextResponse } from "next/server";
import { readUpload } from "@/lib/data/onboarding";

export const dynamic = "force-dynamic";

/**
 * DEV-ONLY file server for uploads stored under `.dev-data/uploads/`.
 * Replaced by Supabase Storage signed URLs once provisioned.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const { path } = await params;
    if (!path || path.length < 2) return new NextResponse("Not found", { status: 404 });
    const [submissionId, fileName] = path;
    const file = await readUpload(submissionId, fileName);
    if (!file) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(file.buffer as unknown as BodyInit, {
        headers: {
            "Content-Type": file.type,
            "Cache-Control": "private, max-age=300",
        },
    });
}
