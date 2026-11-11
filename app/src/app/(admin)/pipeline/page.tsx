import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getActingMember } from "@/lib/auth";
import { LEAD_STATUSES, listLeads, type LeadStatus } from "@/lib/data/leads";
import { listContracts, type Contract } from "@/lib/data/contracts";
import { listQuotations, type Quotation } from "@/lib/data/quotations";
import { seesPipeline } from "@/lib/scope";
import { fmtMyrShort, fmtMyrWhole } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { setLeadStatusAction } from "@/lib/leads/actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, key: string): string {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
}

const COLUMN_LABELS: Record<LeadStatus, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal: "Quoted",
    won: "Won",
    lost: "Lost",
};

function nextStatus(current: LeadStatus): LeadStatus | null {
    const order: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won"];
    const i = order.indexOf(current);
    if (i === -1 || i === order.length - 1) return null;
    return order[i + 1];
}

const norm = (s: string) => s.trim().toLowerCase();

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const sp = await searchParams;
    const me = await getActingMember(one(sp, "as"));
    if (!seesPipeline(me)) redirect("/home");

    const [leads, contracts, quotations] = await Promise.all([listLeads(), listContracts(), listQuotations()]);
    // The client's contract (the deal's company, or the contact's name when
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
    // A contract's own quotation beats the latest one on the client.
    for (const [key, c] of contractByClient) {
        const q = c.quotationId ? quotations.find((x) => x.id === c.quotationId) : undefined;
        if (q) quoteByClient.set(key, q);
    }
    const grouped: Record<LeadStatus, typeof leads> = {
        new: [],
        contacted: [],
        qualified: [],
        proposal: [],
        won: [],
        lost: [],
    };
    for (const l of leads) grouped[l.status].push(l);

    const totalValue = leads
        .filter((l) => l.status !== "lost")
        .reduce((sum, l) => sum + (l.estValueMyr || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Pipeline</h1>
                    <p className="text-sm text-muted-foreground">
                        Move deals along with the button; price them on a quote, and once won the account manager creates the contract.
                    </p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2 text-sm">
                    Open pipeline: <strong>{fmtMyrShort(totalValue)}</strong>
                </div>
            </div>

            <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                <div className="grid min-w-[900px] grid-cols-6 gap-3 md:min-w-0">
                    {LEAD_STATUSES.map((s) => (
                        <div key={s} className="rounded-lg border bg-muted/30 p-3">
                            <div className="mb-3 flex items-center justify-between">
                                <h2 className="text-sm font-medium">{COLUMN_LABELS[s]}</h2>
                                <span className="text-xs text-muted-foreground">
                                    {grouped[s].length}
                                </span>
                            </div>
                            <ul className="space-y-2">
                                {grouped[s].map((l) => {
                                    const next = nextStatus(l.status);
                                    const clientName = l.company || l.name;
                                    const contract = contractByClient.get(norm(clientName));
                                    const quote = quoteByClient.get(norm(clientName));
                                    return (
                                        <li
                                            key={l.id}
                                            className="rounded-lg border bg-card p-3 text-sm shadow-xs transition-shadow hover:shadow-sm"
                                        >
                                            <Link
                                                href={`/leads/${l.id}`}
                                                className="block truncate font-medium hover:text-primary"
                                            >
                                                {l.name}
                                            </Link>
                                            {l.company ? (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {l.company}
                                                </p>
                                            ) : null}
                                            {l.estValueMyr > 0 ? (
                                                <p className="mt-1.5 text-xs font-medium tabular-nums">
                                                    {fmtMyrWhole(l.estValueMyr)}
                                                </p>
                                            ) : null}
                                            {next || (l.status !== "lost" && l.status !== "won") ? (
                                                <div className="mt-2.5 space-y-1 border-t pt-2.5">
                                                    {next ? (
                                                        <form action={setLeadStatusAction}>
                                                            <input type="hidden" name="id" value={l.id} />
                                                            <input type="hidden" name="status" value={next} />
                                                            <Button
                                                                type="submit"
                                                                size="sm"
                                                                className="h-7 w-full text-xs"
                                                                title={`Move to ${COLUMN_LABELS[next]}`}
                                                            >
                                                                {COLUMN_LABELS[next]}
                                                                <ArrowRight className="size-3.5" />
                                                            </Button>
                                                        </form>
                                                    ) : null}
                                                    {l.status !== "lost" && l.status !== "won" ? (
                                                        <form action={setLeadStatusAction}>
                                                            <input type="hidden" name="id" value={l.id} />
                                                            <input type="hidden" name="status" value="lost" />
                                                            <Button
                                                                type="submit"
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 w-full text-xs text-muted-foreground"
                                                            >
                                                                Mark lost
                                                            </Button>
                                                        </form>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                            {l.status !== "lost" && (quote || l.status === "won" || l.status === "proposal") ? (
                                                <div className="mt-2.5 space-y-1 border-t pt-2.5 text-xs">
                                                    {quote ? (
                                                        <Link
                                                            href={`/quotes/${quote.id}`}
                                                            className="block font-medium text-primary hover:underline"
                                                        >
                                                            Quote {quote.number} · {quote.status}
                                                        </Link>
                                                    ) : (
                                                        <Link
                                                            href="/quotes"
                                                            className="block text-muted-foreground hover:underline"
                                                        >
                                                            Write a quote
                                                        </Link>
                                                    )}
                                                    {l.status === "won" ? (
                                                        contract ? (
                                                            <Link
                                                                href={`/contracts/${contract.id}`}
                                                                className="block font-medium text-primary hover:underline"
                                                            >
                                                                Contract {contract.code} →
                                                            </Link>
                                                        ) : (
                                                            <Link
                                                                href={`/contracts/new?client=${encodeURIComponent(clientName)}`}
                                                                className="block font-medium text-primary hover:underline"
                                                            >
                                                                Create contract
                                                            </Link>
                                                        )
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        </li>
                                    );
                                })}
                                {grouped[s].length === 0 ? (
                                    <li className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                                        Empty
                                    </li>
                                ) : null}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
