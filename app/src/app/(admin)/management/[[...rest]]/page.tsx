/**
 * The Management detail pages are retired: the Dashboard tabs, Tasks and
 * Projects cover what they showed. Old links (/management, /management/team,
 * /management/work#…) land on the Dashboard tab that took each one over, with
 * a valid `?month=` carried along. ui.tsx next door stays: other pages use it.
 */
import { redirect } from "next/navigation";
import { isMonth } from "@/lib/management/metrics";

/** Which Dashboard tab took over each old detail page. */
const TAB_FOR: Record<string, string> = {
    team: "team",
    pipeline: "sales",
    clients: "clients",
    work: "delivery",
    projects: "delivery",
};

export default async function RetiredManagementPage({
    params,
    searchParams,
}: {
    params: Promise<{ rest?: string[] }>;
    searchParams: Promise<{ month?: string | string[] }>;
}) {
    const [{ rest }, sp] = await Promise.all([params, searchParams]);
    const tab = TAB_FOR[rest?.[0] ?? ""] ?? "team";
    const month = Array.isArray(sp.month) ? sp.month[0] : sp.month;
    redirect(isMonth(month) ? `/dashboard?tab=${tab}&month=${month}` : `/dashboard?tab=${tab}`);
}
