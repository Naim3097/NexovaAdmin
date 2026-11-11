/**
 * /home is gone: managers land on the Dashboard, everyone else on My tasks.
 * Kept as a redirect so old links and the pages that still send people to
 * /home keep working.
 */
import { redirect } from "next/navigation";
import { getActingMember } from "@/lib/auth";
import { homeFor } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ as?: string | string[] }> }) {
    const sp = await searchParams;
    const as = ((Array.isArray(sp.as) ? sp.as[0] : sp.as) ?? "").trim();
    const member = await getActingMember(as || undefined);
    const home = homeFor(member);
    redirect(as ? `${home}?as=${encodeURIComponent(as)}` : home);
}
