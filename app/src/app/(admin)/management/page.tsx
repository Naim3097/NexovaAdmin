/**
 * /management folded into the Dashboard's Team tab; the five detail pages
 * (/management/team, /pipeline, /work, /contracts, /clients) stay.
 */
import { redirect } from "next/navigation";
import { isMonth } from "@/lib/management/metrics";

export default async function ManagementPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
    const sp = await searchParams;
    const month = Array.isArray(sp.month) ? sp.month[0] : sp.month;
    redirect(isMonth(month) ? `/dashboard?tab=team&month=${month}` : "/dashboard?tab=team");
}
