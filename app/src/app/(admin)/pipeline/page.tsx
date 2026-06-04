import Link from "next/link";
import { LEAD_STATUSES, listLeads, type LeadStatus } from "@/lib/data/leads";
import { Button } from "@/components/ui/button";
import { setLeadStatusAction } from "@/lib/leads/actions";

export const dynamic = "force-dynamic";

const COLUMN_LABELS: Record<LeadStatus, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    proposal: "Proposal",
    won: "Won",
    lost: "Lost",
};

function nextStatus(current: LeadStatus): LeadStatus | null {
    const order: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "won"];
    const i = order.indexOf(current);
    if (i === -1 || i === order.length - 1) return null;
    return order[i + 1];
}

export default async function PipelinePage() {
    const leads = await listLeads();
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
                        Drag-and-drop coming later. For now, use “Advance →” to move a card.
                    </p>
                </div>
                <div className="rounded-md border bg-card px-3 py-2 text-sm">
                    Open pipeline value: <strong>MYR {totalValue.toLocaleString()}</strong>
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
                                    return (
                                        <li
                                            key={l.id}
                                            className="rounded-md border bg-background p-3 text-sm shadow-sm"
                                        >
                                            <Link
                                                href={`/leads/${l.id}`}
                                                className="font-medium hover:underline"
                                            >
                                                {l.name}
                                            </Link>
                                            {l.company ? (
                                                <p className="truncate text-xs text-muted-foreground">
                                                    {l.company}
                                                </p>
                                            ) : null}
                                            {l.estValueMyr > 0 ? (
                                                <p className="mt-1 text-xs">
                                                    MYR {l.estValueMyr.toLocaleString()}
                                                </p>
                                            ) : null}
                                            {next ? (
                                                <form
                                                    action={setLeadStatusAction}
                                                    className="mt-2"
                                                >
                                                    <input type="hidden" name="id" value={l.id} />
                                                    <input type="hidden" name="status" value={next} />
                                                    <Button
                                                        type="submit"
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-7 w-full text-xs"
                                                    >
                                                        Advance → {COLUMN_LABELS[next]}
                                                    </Button>
                                                </form>
                                            ) : null}
                                            {l.status !== "lost" && l.status !== "won" ? (
                                                <form
                                                    action={setLeadStatusAction}
                                                    className="mt-1"
                                                >
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
