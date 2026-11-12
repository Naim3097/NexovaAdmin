/**
 * New project. The account manager enters the client, the terms, the
 * DELIVERABLES (free rows: "Awareness post on Instagram, 4 a week", "Website,
 * once"), the phases (month 1 = the first month of the project) and the team
 * (one person per role). On submit the project is created; with a signed
 * date the tasks for every month of its term are added at once, without one
 * it is a draft and the tasks appear once it is marked signed.
 *
 * Server-rendered form; a rejected submit comes back here with `?error=` and
 * every field it carried (the deliverable and phase rows included), so
 * nothing typed is lost.
 */
import Link from "next/link";
import { getActingMember, requireTeamAccess } from "@/lib/auth";
import { BILLING_CADENCES, type Requirement } from "@/lib/data/contracts";
import { listClients } from "@/lib/data/clients";
import { listTeamMembers } from "@/lib/data/team";
import { listWorks } from "@/lib/data/works";
import { listProjectTemplates } from "@/lib/data/project-templates";
import { SelectNav } from "@/components/select-nav";
import { SEATS, SEAT_LABEL, type Seat } from "@/lib/data/planners";
import { proposeCrew } from "@/lib/contracts/generate";
import { createContractWithTasksAction } from "@/lib/contracts/actions";
import { normalizeRequirement } from "@/lib/contracts/requirements";
import { DEFAULT_TEMPLATE_PHASES, normalizeTemplatePhases, type TemplatePhase } from "@/lib/contracts/phases";
import { todayKey } from "@/lib/works/helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/pending-button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { cadenceOption } from "../ui";
import { DeliverableRows } from "../deliverable-rows";
import { PhaseRows } from "../phase-rows";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const NEW_CLIENT = "__new";
const SEL = "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm dark:bg-input/30";

const ERRORS: Record<string, string> = {
    name: "Give the project a name.",
    client: "Pick a client, or type the name of a new one.",
    requirements: "Set the scope: at least one deliverable with a count above zero.",
    dates: "The end date is before the start date.",
};

export default async function NewContractPage({ searchParams }: { searchParams: Promise<SP> }) {
    await requireTeamAccess();
    const sp = await searchParams;
    const one = (k: string) => {
        const v = sp[k];
        return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
    };
    const has = (k: string) => sp[k] !== undefined;
    const [member, clients, team, works, projectTemplates] = await Promise.all([
        getActingMember(one("as") || undefined),
        listClients(),
        listTeamMembers(),
        listWorks(),
        listProjectTemplates(),
    ]);
    const today = todayKey();
    const thisMonth = today.slice(0, 7);
    const activeTeam = team.filter((m) => m.active);
    const asParam = one("as") || undefined;
    const error = one("error");

    // Start from: Custom (blank form) or a template (Settings → Templates), which
    // prefills months, deliverables and phases. A rejected submit keeps what was typed.
    const tpl = projectTemplates.find((t) => t.id === one("template")) ?? null;
    const startFor = one("startDate") || today;
    /** Last day of the final month: start + months. */
    const endOfTerm = (start: string, months: number): string => {
        const [y, m] = start.split("-").map(Number);
        if (!y || !m) return "";
        const d = new Date(Date.UTC(y, m - 1 + months, 0));
        return d.toISOString().slice(0, 10);
    };
    const tplEnd = tpl ? endOfTerm(startFor, tpl.months) : "";
    const startFromHref = (id: string) => {
        const q = new URLSearchParams();
        if (id) q.set("template", id);
        if (asParam) q.set("as", asParam);
        if (clientParam) q.set("client", clientParam);
        const s = q.toString();
        return s ? `/projects/new?${s}` : "/projects/new";
    };

    // Prefills: what came back from a rejected submit, else the `?client=` link, else sensible defaults.
    const clientParam = one("clientName") || one("client");
    const clientPick = clientParam === NEW_CLIENT ? NEW_CLIENT : (clients.find((c) => c.name === clientParam)?.name ?? "");
    const clientRecord = clients.find((c) => c.name === clientPick);
    const defaultAm =
        one("accountManager") ||
        (member && activeTeam.some((m) => m.name === member.name) ? member.name : "") ||
        clientRecord?.dealOwner ||
        "";
    const proposed = proposeCrew({ accountManager: defaultAm }, team, works, thisMonth);
    const crewDefault = (seat: Seat) => one(`crew_${seat}`) || proposed[seat] || "";

    // The row editors start from what a rejected submit sent back (`del_<i>_*` and
    // `phase_<i>_*`, read the way the action reads the form: in order, up to the
    // first missing row, rows without a count or a name dropped), else from the
    // template, else from one blank row / the built-in phases.
    const deliverablesFromUrl = (): Requirement[] | null => {
        if (!has("del_0_type")) return null;
        const out: Requirement[] = [];
        for (let i = 0; has(`del_${i}_type`); i += 1) {
            const r = normalizeRequirement({
                type: one(`del_${i}_type`),
                name: one(`del_${i}_name`),
                count: Number(one(`del_${i}_count`)) || 0,
                per: one(`del_${i}_per`),
                channel: one(`del_${i}_channel`),
            });
            if (r) out.push(r);
        }
        return out;
    };
    const phasesFromUrl = (): TemplatePhase[] | null => {
        if (!has("phase_0_name")) return null;
        const raw: Array<Partial<TemplatePhase>> = [];
        for (let i = 0; has(`phase_${i}_name`); i += 1) {
            raw.push({
                key: one(`phase_${i}_key`),
                name: one(`phase_${i}_name`),
                summary: one(`phase_${i}_summary`),
                fromMonth: Number(one(`phase_${i}_from`)) || 1,
                months: Number(one(`phase_${i}_months`)) || 1,
            });
        }
        return normalizeTemplatePhases(raw);
    };
    const initialDeliverables: Requirement[] = deliverablesFromUrl() ?? tpl?.requirements ?? [];
    const initialPhases: TemplatePhase[] = phasesFromUrl() ?? tpl?.phases ?? DEFAULT_TEMPLATE_PHASES;

    return (
        <div className="space-y-4">
            <div>
                <Link href={`/projects${asParam ? `?as=${encodeURIComponent(asParam)}` : ""}`} className="text-sm text-muted-foreground hover:underline">
                    Back to projects
                </Link>
                <h1 className="mt-2 text-2xl font-semibold md:text-3xl">New project</h1>
                <p className="text-sm text-muted-foreground">
                    Set the client, the deliverables (what, how many, how often), the phases and the team. Once the project is signed, the
                    tasks for every month of its term are added at once (three months ahead when open-ended).
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    <SelectNav
                        label="Start from"
                        value={tpl?.id ?? ""}
                        options={[
                            { value: "", label: "Custom", href: startFromHref("") },
                            ...projectTemplates.map((t) => ({ value: t.id, label: `${t.name} · ${t.months} mo`, href: startFromHref(t.id) })),
                        ]}
                    />
                    {tpl ? (
                        <span className="text-muted-foreground">
                            {tpl.months} month{tpl.months === 1 ? "" : "s"}, deliverables and phases prefilled from the {tpl.name} template. Change anything below.
                        </span>
                    ) : (
                        <Link href="/settings/templates" className="text-muted-foreground underline">
                            Templates
                        </Link>
                    )}
                </div>
            </div>

            {error ? (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {ERRORS[error] ?? "The project could not be created. Check the form and try again."}
                </p>
            ) : null}

            <form action={createContractWithTasksAction} className="space-y-4">
                {asParam ? <input type="hidden" name="as" value={asParam} /> : null}
                {tpl ? <input type="hidden" name="templateName" value={tpl.name} /> : null}

                {/* 1 · Who and what */}
                <section className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-4 md:p-6">
                    <h2 className="text-sm font-medium md:col-span-4">1 · Client and terms</h2>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Project name</Label>
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
                        <p className="text-[11px] text-muted-foreground">Created in onboarding, with this account manager recorded as its deal owner.</p>
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
                        <Input name="endDate" type="date" defaultValue={one("endDate") || tplEnd} aria-invalid={error === "dates" || undefined} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Signed on (blank = not yet)</Label>
                        <Input name="signedAt" type="date" defaultValue={one("signedAt")} />
                        <p className="text-[11px] text-muted-foreground">Tasks appear once the project is signed. Leave empty to create a draft.</p>
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
                                    {cadenceOption(b)}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Amount (MYR)</Label>
                            <Input name="amountMyr" type="number" min={0} step={1} defaultValue={one("amountMyr")} placeholder="per month, or the one-off total" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Invoice day</Label>
                            <Input name="invoiceDay" type="number" min={1} max={28} defaultValue={one("invoiceDay") || 1} />
                        </div>
                    </div>
                    <div className="space-y-1.5 md:col-span-4">
                        <Label className="text-sm">Notes</Label>
                        <Textarea name="notes" rows={1} defaultValue={one("notes")} />
                    </div>
                </section>

                {/* 2 · Scope: the deliverable rows */}
                <section id="requirements" className={cn("rounded-lg border bg-card p-4 md:p-6", error === "requirements" && "border-destructive/60")}>
                    <h2 className="text-sm font-medium">2 · Scope</h2>
                    <p className="text-xs text-muted-foreground">
                        One row per deliverable: the task type, a name (it becomes the task title), how many, how often (a week, a month or once) and the
                        channel. At least one row is needed; two rows of the same type are fine.
                    </p>
                    <DeliverableRows initial={initialDeliverables} className="mt-3" />
                </section>

                {/* 3 · Phases: relative months, placed against the start date when the project is created */}
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">3 · Phases</h2>
                    <p className="text-xs text-muted-foreground">
                        The timeline the tasks fall into. Months are counted from the start date above (month 1 is the first month of the project); the
                        real months are set when it is created and can be changed from the Tasks tab (the pencil next to each phase).
                    </p>
                    <PhaseRows initial={initialPhases} termMonths={tpl?.months} className="mt-3" />
                </section>

                {/* 4 · Team */}
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">4 · Team</h2>
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
                    <Button variant="ghost" nativeButton={false} render={<Link href={`/projects${asParam ? `?as=${encodeURIComponent(asParam)}` : ""}`} />}>
                        Cancel
                    </Button>
                    <PendingButton pendingLabel="Creating project…">Create project</PendingButton>
                </div>
            </form>
        </div>
    );
}
