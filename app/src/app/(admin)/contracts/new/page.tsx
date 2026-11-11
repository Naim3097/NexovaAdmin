/**
 * New contract. The account manager enters the client, the terms, the phase
 * template, the SCOPE (so many posts a month, one website…) and the team
 * (one person per role). On submit the contract is created and the tasks for
 * every month of its term are added at once.
 *
 * Server-rendered form; a rejected submit comes back here with `?error=` and
 * every field it carried, so nothing typed is lost.
 */
import Link from "next/link";
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { BILLING_CADENCES, REQUIREMENT_CADENCES, type Requirement } from "@/lib/data/contracts";
import { listClients } from "@/lib/data/clients";
import { listTeamMembers } from "@/lib/data/team";
import { listWorks } from "@/lib/data/works";
import { listPhaseTemplates } from "@/lib/data/phase-templates";
import { LINE_TYPES, LINE_TYPE_LABEL, SEATS, SEAT_LABEL, type LineType, type Seat } from "@/lib/data/planners";
import { DEFAULT_CHANNEL, proposeCrew } from "@/lib/contracts/generate";
import { createContractWithTasksAction } from "@/lib/contracts/actions";
import { todayKey } from "@/lib/works/helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/pending-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { cadenceLabel } from "../ui";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const NEW_CLIENT = "__new";
const SEL = "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm dark:bg-input/30";
const SEL_SM = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

const ERRORS: Record<string, string> = {
    name: "Give the contract a name.",
    client: "Pick a client, or type the name of a new one.",
    requirements: "Set the scope: at least one task type with a count above zero.",
    dates: "The end date is before the start date.",
};

/** Types that are usually delivered once rather than every month. */
const ONCE_BY_DEFAULT: ReadonlySet<LineType> = new Set<LineType>(["website", "branding"]);

export default async function NewContractPage({ searchParams }: { searchParams: Promise<SP> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const one = (k: string) => {
        const v = sp[k];
        return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
    };
    const [member, clients, team, works, templates] = await Promise.all([
        getActingMember(one("as") || undefined),
        listClients(),
        listTeamMembers(),
        listWorks(),
        listPhaseTemplates(),
    ]);
    const today = todayKey();
    const thisMonth = today.slice(0, 7);
    const activeTeam = team.filter((m) => m.active);
    const asParam = one("as") || undefined;
    const error = one("error");

    // Prefills: what came back from a rejected submit, else the `?client=` link, else sensible defaults.
    const clientParam = one("clientName") || one("client");
    const clientPick = clientParam === NEW_CLIENT ? NEW_CLIENT : (clients.find((c) => c.name === clientParam)?.name ?? "");
    const clientRecord = clients.find((c) => c.name === clientPick);
    const defaultAm =
        one("accountManager") ||
        (member && activeTeam.some((m) => m.name === member.name) ? member.name : "") ||
        clientRecord?.accountManager ||
        "";
    const defaultTemplate = one("templateId") || templates.find((t) => t.isDefault)?.id || templates[0]?.id || "";
    const proposed = proposeCrew({ accountManager: defaultAm }, team, works, thisMonth);
    const crewDefault = (seat: Seat) => one(`crew_${seat}`) || proposed[seat] || "";
    const reqDefault = (type: LineType): Requirement => ({
        type,
        count: Math.max(0, Math.round(Number(one(`req_${type}_count`)) || 0)),
        cadence: one(`req_${type}_cadence`) === "once" || (!one(`req_${type}_cadence`) && ONCE_BY_DEFAULT.has(type)) ? "once" : "monthly",
        channel: one(`req_${type}_channel`),
    });

    return (
        <div className="space-y-4">
            <div>
                <Link href={`/contracts${asParam ? `?as=${encodeURIComponent(asParam)}` : ""}`} className="text-sm text-muted-foreground hover:underline">
                    Back to contracts
                </Link>
                <h1 className="mt-2 text-2xl font-semibold md:text-3xl">New contract</h1>
                <p className="text-sm text-muted-foreground">
                    Set the scope and the team; the tasks for every month of the term are added straight away (three months ahead when
                    open-ended).
                </p>
            </div>

            {error ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {ERRORS[error] ?? "The contract could not be created. Check the form and try again."}
                </p>
            ) : null}

            <form action={createContractWithTasksAction} className="space-y-4">
                {asParam ? <input type="hidden" name="as" value={asParam} /> : null}

                {/* 1 · Who and what */}
                <section className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4 md:p-6">
                    <h2 className="text-sm font-medium md:col-span-4">1 · Client and terms</h2>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Contract name</Label>
                        <Input name="name" required defaultValue={one("name")} placeholder="e.g. Lean.x — Growth retainer 2026" aria-invalid={error === "name" || undefined} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Client</Label>
                        <select name="clientName" defaultValue={clientPick || "none"} className={cn(SEL, error === "client" && "border-destructive")}>
                            <option value="none">— pick a client —</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.name}>
                                    {c.name} ({c.status})
                                </option>
                            ))}
                            <option value={NEW_CLIENT}>— new client (name below) —</option>
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">…or a new client</Label>
                        <Input name="newClientName" defaultValue={one("newClientName")} placeholder="New client name" />
                        <p className="text-[11px] text-muted-foreground">Created in onboarding under this account manager.</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Account manager</Label>
                        <select name="accountManager" defaultValue={defaultAm || "none"} className={SEL}>
                            <option value="none">— unassigned —</option>
                            {activeTeam.map((m) => (
                                <option key={m.id} value={m.name}>
                                    {m.name} ({m.role})
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Start</Label>
                        <Input name="startDate" type="date" required defaultValue={one("startDate") || today} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">End (blank = open-ended)</Label>
                        <Input name="endDate" type="date" defaultValue={one("endDate")} aria-invalid={error === "dates" || undefined} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Signed on (blank = not yet)</Label>
                        <Input name="signedAt" type="date" defaultValue={one("signedAt")} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Reference / contract no.</Label>
                        <Input name="reference" defaultValue={one("reference")} placeholder="MSA-2026-04" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Contract value (MYR)</Label>
                        <Input name="valueMyr" type="number" min={0} step={1} defaultValue={one("valueMyr")} placeholder="57240" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Billing</Label>
                        <select name="cadence" defaultValue={one("cadence") || "monthly"} className={SEL}>
                            {BILLING_CADENCES.map((b) => (
                                <option key={b} value={b}>
                                    {cadenceLabel(b)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Amount (MYR)</Label>
                            <Input name="amountMyr" type="number" min={0} step={1} defaultValue={one("amountMyr")} placeholder="per month / milestone" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Invoice day</Label>
                            <Input name="invoiceDay" type="number" min={1} max={28} defaultValue={one("invoiceDay") || 1} />
                        </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Phase template</Label>
                        {templates.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                                No phase templates yet — the contract starts without phases.{" "}
                                <Link href="/settings/phases" className="underline">
                                    Add templates
                                </Link>
                                .
                            </p>
                        ) : (
                            <select name="templateId" defaultValue={defaultTemplate} className={SEL}>
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                        {t.isDefault ? " (default)" : ""} · {t.phases.map((ph) => ph.name).join(" → ") || "no phases"}
                                    </option>
                                ))}
                            </select>
                        )}
                        <p className="text-[11px] text-muted-foreground">The phases are copied onto the contract and spread over its months; edit them on the Scope tab.</p>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Notes</Label>
                        <Textarea name="notes" rows={1} defaultValue={one("notes")} />
                    </div>
                </section>

                {/* 2 · Scope */}
                <section id="requirements" className={cn("rounded-lg border bg-card p-4 md:p-6", error === "requirements" && "border-destructive/60")}>
                    <h2 className="text-sm font-medium">2 · Scope</h2>
                    <p className="text-xs text-muted-foreground">One line per task type: how many, how often, and on which channel; at least one line is needed.</p>
                    <div className="-mx-4 mt-3 overflow-x-auto px-4 md:mx-0 md:px-0">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead>
                                <tr className="border-b text-left text-xs text-muted-foreground">
                                    <th className="py-1.5 pr-3 font-medium">Task type</th>
                                    <th className="w-24 py-1.5 pr-3 font-medium">Count</th>
                                    <th className="w-36 py-1.5 pr-3 font-medium">How often</th>
                                    <th className="py-1.5 font-medium">Channel (optional)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {LINE_TYPES.map((t) => {
                                    const r = reqDefault(t);
                                    return (
                                        <tr key={t} className="border-b last:border-0">
                                            <td className="py-2 pr-3 font-medium">{LINE_TYPE_LABEL[t]}</td>
                                            <td className="py-2 pr-3">
                                                <Input name={`req_${t}_count`} type="number" min={0} max={99} step={1} defaultValue={r.count || ""} placeholder="0" className="h-9" />
                                            </td>
                                            <td className="py-2 pr-3">
                                                <select name={`req_${t}_cadence`} defaultValue={r.cadence} className={SEL_SM}>
                                                    {REQUIREMENT_CADENCES.map((cd) => (
                                                        <option key={cd} value={cd}>
                                                            {cd === "monthly" ? "every month" : "once"}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="py-2">
                                                <Input name={`req_${t}_channel`} defaultValue={r.channel} placeholder={DEFAULT_CHANNEL[t]} className="h-9" />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* 3 · Team */}
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">3 · Team</h2>
                    <p className="text-xs text-muted-foreground">
                        One person per role; tasks are assigned from here, prefilled with whoever fits with the lightest load this month
                        ({activeTeam.length} active members).
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {SEATS.map((seat) => (
                            <div key={seat} className="space-y-1.5">
                                <Label className="text-sm">{SEAT_LABEL[seat]}</Label>
                                <select name={`crew_${seat}`} defaultValue={crewDefault(seat) || "none"} className={SEL}>
                                    <option value="none">— open —</option>
                                    {activeTeam.map((m) => (
                                        <option key={m.id} value={m.name}>
                                            {m.name} ({m.role})
                                        </option>
                                    ))}
                                </select>
                                {proposed[seat] ? <p className="text-[11px] text-muted-foreground">suggested: {proposed[seat]}</p> : null}
                            </div>
                        ))}
                    </div>
                </section>

                <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button variant="ghost" nativeButton={false} render={<Link href={`/contracts${asParam ? `?as=${encodeURIComponent(asParam)}` : ""}`} />}>
                        Cancel
                    </Button>
                    <PendingButton pendingLabel="Creating contract and tasks…">Create contract and add tasks</PendingButton>
                </div>
            </form>
        </div>
    );
}
