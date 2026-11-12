/**
 * Pipeline — every deal by stage, as a board. Drag a card to another column
 * to move the deal along (or to Won / Lost — Lost asks for the reason); the
 * lead page keeps its own "Move to" buttons. Each card links the deal to its
 * latest quote and, once won, to the client's project or to creating one. A
 * strip above the board shows each deal owner's open, stuck and won numbers.
 */
import { redirect } from "next/navigation";
import { getActingMember, getCurrentTeamMember } from "@/lib/auth";
import { LEAD_STATUSES, listLeads } from "@/lib/data/leads";
import { listContracts, type Contract } from "@/lib/data/contracts";
import { listQuotations, type Quotation } from "@/lib/data/quotations";
import { seesPipeline } from "@/lib/scope";
import { ownerStats } from "@/lib/dashboard/sales";
import { fmtMyrShort } from "@/lib/format";
import { todayYmd } from "@/lib/management/metrics";
import { LeadBoard, type BoardLead } from "./lead-board";
import { OwnerStrip } from "./owner-strip";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

const norm = (s: string) => s.trim().toLowerCase();

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const sp = await searchParams;
    const [me, linked] = await Promise.all([getActingMember(one(sp, "as") || undefined), getCurrentTeamMember()]);
    if (!seesPipeline(me)) redirect("/home");
    // The server actions learn who is acting from `as` only under the dev bypass (a real login resolves itself).
    const asParam = me && !linked ? me.name : undefined;

    const [leads, contracts, quotations] = await Promise.all([listLeads(), listContracts(), listQuotations()]);
    // The client's project (the deal's company, or the contact's name when
    // there is no company), newest first; and the latest quotation on it.
    const contractByClient = new Map<string, Contract>();
    for (const c of contracts) {
        if (c.status === "cancelled") continue;
        const key = norm(c.clientName);
        const cur = contractByClient.get(key);
        if (!cur || c.createdAt > cur.createdAt) contractByClient.set(key, c);
    }
    const quoteByClient = new Map<string, Quotation>();
    for (const q of quotations) {
        const key = norm(q.clientName);
        const cur = quoteByClient.get(key);
        if (!cur || q.updatedAt > cur.updatedAt) quoteByClient.set(key, q);
    }
    // A project's own quotation beats the latest one on the client.
    for (const [key, c] of contractByClient) {
        const q = c.quotationId ? quotations.find((x) => x.id === c.quotationId) : undefined;
        if (q) quoteByClient.set(key, q);
    }

    // What a card needs, and nothing the browser should not get.
    const cards: BoardLead[] = leads.map((l) => {
        const clientName = l.company || l.name;
        const contract = contractByClient.get(norm(clientName));
        const quote = quoteByClient.get(norm(clientName));
        return {
            id: l.id,
            name: l.name,
            company: l.company,
            estValueMyr: l.estValueMyr,
            status: l.status,
            clientName,
            quote: quote ? { id: quote.id, number: quote.number, status: quote.status } : null,
            contract: contract ? { id: contract.id, code: contract.code } : null,
            lostReason: l.lostReason,
            lostNote: l.lostNote,
        };
    });

    const totalValue = leads.filter((l) => l.status !== "lost").reduce((sum, l) => sum + (l.estValueMyr || 0), 0);
    // Per owner, with the Sales tab's maths so the strip and the dashboard agree.
    const today = todayYmd();
    const owners = ownerStats({ leads, month: today.slice(0, 7), today });

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Pipeline</h1>
                    <p className="text-sm text-muted-foreground">
                        Drag a deal to the next stage (or to Won / Lost); price it on a quote, and once won the account manager creates the project.
                    </p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2 text-sm">
                    Open pipeline: <strong>{fmtMyrShort(totalValue)}</strong>
                </div>
            </div>

            <OwnerStrip owners={owners} />

            <LeadBoard leads={cards} stages={LEAD_STATUSES} asParam={asParam} />
        </div>
    );
}
