/** /activity folded into the Dashboard's Activity tab; the filters carry over. */
import { redirect } from "next/navigation";

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ entity?: string | string[]; range?: string | string[] }> }) {
    const sp = await searchParams;
    const p = new URLSearchParams({ tab: "activity" });
    const entity = Array.isArray(sp.entity) ? sp.entity[0] : sp.entity;
    const range = Array.isArray(sp.range) ? sp.range[0] : sp.range;
    if (entity) p.set("entity", entity);
    if (range) p.set("range", range);
    redirect(`/dashboard?${p.toString()}`);
}
