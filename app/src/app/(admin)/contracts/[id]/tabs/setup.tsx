/**
 * Details tab (`?tab=setup`): the one-time things — the status (stage), the
 * terms on file, who the account manager is (and the transfer that moves the
 * role), the contract's details, and the danger zone (cancel / reactivate /
 * delete). The #account-manager id is a link target, so it keeps its name.
 */
import Link from "next/link";
import { CONTRACT_STAGES, CONTRACT_STAGE_LABEL } from "@/lib/data/contracts";
import { computeTotals as quoteTotals } from "@/lib/data/quotations";
import {
    acceptHandoverAction,
    cancelHandoverAction,
    declineHandoverAction,
    deleteContractAction,
    requestHandoverAction,
    saveTermsAction,
    setContractStatusAction,
    setStageAction,
    updateContractAction,
} from "@/lib/contracts/actions";
import { fmtMyrShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PendingButton } from "@/components/pending-button";
import { SaveButton } from "@/components/save-button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { fmtMyr } from "../../ui";
import { CARD, type ContractView } from "../shared";

export function SetupTab({ v }: { v: ContractView }) {
    return (
        <>
            <section id="setup" className="grid gap-4 lg:grid-cols-2">
                <Lifecycle v={v} />
                <Terms v={v} />
            </section>
            <AccountManager v={v} />
            <Details v={v} />
            <DangerZone v={v} />
        </>
    );
}

/** Small text input for the optional notes on the transfer forms. */
const NOTE_INPUT = "h-8 px-2 text-xs md:text-xs";

/**
 * Who owns the relationship, and the transfer that moves the role. Anyone may
 * set the first account manager; once there is one, only they can pass the
 * role on, and it moves only when the colleague they name accepts. Admins get
 * no override here — that is the owner's rule, not an oversight.
 */
function AccountManager({ v }: { v: ContractView }) {
    const { c, handover, isAccountManager, isHandoverTarget, actor, activeTeam, asField } = v;
    const since = handover ? handover.at.slice(0, 10) : "";
    const others = activeTeam.filter((m) => m.name.trim().toLowerCase() !== c.accountManager.trim().toLowerCase());
    const idField = <input type="hidden" name="id" value={c.id} />;

    let body: React.ReactNode;
    if (!c.accountManager) {
        // No account manager yet: anyone may set the first one (no lock to respect).
        body = (
            <form action={updateContractAction} className="flex flex-wrap items-end gap-2">
                {idField}
                {asField}
                <div className="min-w-56 space-y-1.5">
                    <Label className="text-xs">Assign an account manager</Label>
                    <Select name="accountManager" required>
                        <SelectTrigger className="h-9 w-full">
                            <SelectValue placeholder="Pick a team member" />
                        </SelectTrigger>
                        <SelectContent>
                            {activeTeam.map((m) => (
                                <SelectItem key={m.id} value={m.name}>
                                    {m.name} ({m.role})
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <PendingButton size="sm" pendingLabel="Assigning…">
                    Assign
                </PendingButton>
            </form>
        );
    } else if (isHandoverTarget && handover) {
        body = (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm font-medium">{handover.by || c.accountManager} asked you to take over this contract</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    {since}
                    {handover.note ? ` · ${handover.note}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <form action={acceptHandoverAction}>
                        {idField}
                        {asField}
                        <PendingButton size="sm" pendingLabel="Accepting…">
                            Accept
                        </PendingButton>
                    </form>
                    <form action={declineHandoverAction} className="flex flex-wrap items-center gap-2">
                        {idField}
                        {asField}
                        <Input name="note" placeholder="Why not (optional)" className={cn(NOTE_INPUT, "w-56")} />
                        <PendingButton size="sm" variant="outline" pendingLabel="Declining…">
                            Decline
                        </PendingButton>
                    </form>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    Accepting makes you the account manager; sign-offs, open tasks and the plan move to you. Declining leaves everything with{" "}
                    {c.accountManager}.
                </p>
            </div>
        );
    } else if (isAccountManager && handover) {
        body = (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p>
                    Transfer to <span className="font-medium">{handover.to}</span> pending since {since}
                    {handover.note ? <span className="text-muted-foreground"> · {handover.note}</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Nothing changes until {handover.to} accepts; you stay account manager meanwhile.</p>
                <form action={cancelHandoverAction} className="mt-2">
                    {idField}
                    {asField}
                    <PendingButton size="sm" variant="outline" pendingLabel="Withdrawing…">
                        Withdraw
                    </PendingButton>
                </form>
            </div>
        );
    } else if (isAccountManager) {
        body =
            others.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other active team member to transfer this contract to.</p>
            ) : (
                <>
                    <form action={requestHandoverAction} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
                        {idField}
                        {asField}
                        <div className="space-y-1.5">
                            <Label className="text-xs">Colleague</Label>
                            <Select name="to" required>
                                <SelectTrigger className="h-9 w-full">
                                    <SelectValue placeholder="Pick a colleague" />
                                </SelectTrigger>
                                <SelectContent>
                                    {others.map((m) => (
                                        <SelectItem key={m.id} value={m.name}>
                                            {m.name} ({m.role})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Note (optional)</Label>
                            <Input name="note" placeholder="Why, and anything they should know" className="h-9" />
                        </div>
                        <PendingButton pendingLabel="Asking…">Transfer to…</PendingButton>
                    </form>
                    <p className="mt-1.5 text-xs text-muted-foreground">They accept or decline; you stay account manager until they accept and can withdraw meanwhile.</p>
                </>
            );
    } else {
        body = (
            <div className="text-sm text-muted-foreground">
                <p>Only the account manager can transfer this contract.</p>
                {handover ? (
                    <p className="mt-1 text-amber-700 dark:text-amber-400">
                        Transfer to {handover.to} pending since {since}
                        {handover.note ? ` · ${handover.note}` : ""}
                    </p>
                ) : null}
                {!actor ? <p className="mt-1">Pick who you are (top right) to act as the account manager or the colleague asked to take over.</p> : null}
            </div>
        );
    }

    return (
        <section id="account-manager" className={cn(CARD, "scroll-mt-4", handover && "border-amber-500/40")}>
            <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
                <div className="min-w-0 basis-64">
                    <h2 className="text-sm font-medium">Account manager</h2>
                    <p className="mt-1 text-lg font-semibold">{c.accountManager || <span className="font-normal text-muted-foreground">unassigned</span>}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {c.accountManager
                            ? "Owns the client, signs off the work and edits the plan; only they can transfer the contract."
                            : "Owns the client, signs off the work and edits the plan; anyone may set the first one."}
                    </p>
                </div>
                <div className="min-w-0 flex-1 basis-96">{body}</div>
            </div>
        </section>
    );
}

function Lifecycle({ v }: { v: ContractView }) {
    const { c, stageIdx, nextStage, asField } = v;
    return (
        <div className={CARD}>
            <h2 className="text-sm font-medium">Status</h2>
            <ol className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <li className="rounded-md border border-transparent bg-emerald-500/15 px-2 py-1 text-emerald-700 dark:text-emerald-400">Deal closed ✓</li>
                {CONTRACT_STAGES.map((s, i) => (
                    <li
                        key={s}
                        className={cn(
                            "rounded-md border px-2 py-1",
                            i < stageIdx && "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                            i === stageIdx && "border-primary bg-primary/10 font-medium text-primary",
                            i > stageIdx && "text-muted-foreground",
                        )}
                    >
                        {CONTRACT_STAGE_LABEL[s]}
                        {i < stageIdx ? " ✓" : ""}
                    </li>
                ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
                {nextStage ? (
                    <form action={setStageAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="stage" value={nextStage} />
                        {asField}
                        <PendingButton size="sm" pendingLabel="Moving…">
                            Next → {CONTRACT_STAGE_LABEL[nextStage]}
                        </PendingButton>
                    </form>
                ) : null}
                {c.stage === "signed" ? (
                    <form action={setStageAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="stage" value="official" />
                        {asField}
                        <Button type="submit" size="sm" variant="outline">
                            Existing client · skip onboarding
                        </Button>
                    </form>
                ) : null}
                {stageIdx > 0 ? (
                    <form action={setStageAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="stage" value={CONTRACT_STAGES[stageIdx - 1]} />
                        {asField}
                        <Button type="submit" size="sm" variant="ghost" className="text-muted-foreground">
                            Back
                        </Button>
                    </form>
                ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
                &quot;{CONTRACT_STAGE_LABEL.signed}&quot; stamps the signed date; &quot;{CONTRACT_STAGE_LABEL.official}&quot; makes the client active.
            </p>
        </div>
    );
}

function Terms({ v }: { v: ContractView }) {
    const { c, checks, invoiceChecks, clientQuotes, asField } = v;
    return (
        <div className={CARD}>
            <h2 className="text-sm font-medium">
                Terms{" "}
                {c.signedAt ? (
                    <span className="text-emerald-700 dark:text-emerald-400">· signed {c.signedAt}</span>
                ) : (
                    <span className="text-red-600 dark:text-red-400">· not signed</span>
                )}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {checks
                    .filter((x) => x.key !== "invoice")
                    .map((x) => (
                        <li key={x.key} className={cn(!x.ok && x.urgent ? "text-red-600 dark:text-red-400" : x.ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                            {x.ok ? "✓" : x.urgent ? "✗" : "○"} {x.label}
                            <span className="text-muted-foreground"> · {x.detail}</span>
                        </li>
                    ))}
                <li className={cn(invoiceChecks.some((x) => !x.ok && x.urgent) ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400")}>
                    {invoiceChecks.some((x) => !x.ok && x.urgent) ? "✗" : "✓"} Invoices
                    <span className="text-muted-foreground">
                        {" "}
                        · {invoiceChecks.filter((x) => x.ok).length}/{invoiceChecks.length} in place ·{" "}
                        <Link href={v.tabHref("money")} className="underline">
                            Billing
                        </Link>
                    </span>
                </li>
            </ul>

            <form action={saveTermsAction} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={c.id} />
                {asField}
                <div className="space-y-1.5">
                    <Label className="text-xs">Reference / contract no.</Label>
                    <Input name="reference" defaultValue={c.reference} placeholder="e.g. MSA-2026-04 or quote no." />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">From quote</Label>
                    <Select name="quotationId" defaultValue={c.quotationId ?? "none"}>
                        <SelectTrigger className="h-9 w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">— none —</SelectItem>
                            {clientQuotes.map((q) => (
                                <SelectItem key={q.id} value={q.id}>
                                    {q.number} · {q.status} · {fmtMyr(quoteTotals(q).total)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Contract value (MYR)</Label>
                    <Input name="valueMyr" type="number" min={0} step={1} defaultValue={c.valueMyr || ""} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Signed on</Label>
                    <Input name="signedAt" type="date" defaultValue={c.signedAt ?? ""} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Signed by</Label>
                    <Input name="signedBy" defaultValue={c.signedBy} placeholder="Client signatory" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Signed copy link</Label>
                    <Input name="fileUrl" type="url" defaultValue={c.fileUrl} placeholder="https://drive…" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Terms</Label>
                    <Textarea name="terms" rows={3} defaultValue={c.terms} placeholder="What the client is paying for, in a few lines. Printed on the Agreement." />
                </div>
                <div className="flex justify-end sm:col-span-2">
                    <SaveButton label="Save terms" />
                </div>
            </form>
        </div>
    );
}

function Details({ v }: { v: ContractView }) {
    const { c, quotation, asField } = v;
    return (
        <section className={CARD}>
            <h2 className="text-sm font-medium">Details</h2>
            <p className="mt-1 text-xs text-muted-foreground">
                Reference <span className="text-foreground">{c.reference || "—"}</span>
                {" · "}
                Quote{" "}
                {quotation ? (
                    <Link href={`/quotes/${quotation.id}`} className="underline">
                        {quotation.number} · {fmtMyrShort(quoteTotals(quotation).total)}
                    </Link>
                ) : (
                    "—"
                )}
                {" · "}
                {c.fileUrl ? (
                    <a href={c.fileUrl} target="_blank" rel="noreferrer" className="underline">
                        Signed copy
                    </a>
                ) : (
                    "no signed copy"
                )}
                {" · "}
                <Link href={`/contracts/${c.id}/document${v.asQ}`} className="underline">
                    Agreement
                </Link>
            </p>
            {/* No accountManager field here on purpose: updateContractAction leaves the AM alone when the field is absent. */}
            <form action={updateContractAction} className="mt-3 grid gap-3 md:grid-cols-4">
                <input type="hidden" name="id" value={c.id} />
                {asField}
                <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-xs">Name</Label>
                    <Input name="name" defaultValue={c.name} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">Start</Label>
                    <Input name="startDate" type="date" defaultValue={c.startDate} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-xs">End (blank = open-ended)</Label>
                    <Input name="endDate" type="date" defaultValue={c.endDate} />
                </div>
                <div className="space-y-1.5 md:col-span-4">
                    <Label className="text-xs">Notes</Label>
                    <Textarea name="notes" rows={2} defaultValue={c.notes} />
                </div>
                <div className="flex items-center justify-end md:col-span-4">
                    <SaveButton />
                </div>
            </form>
        </section>
    );
}

/** Cancel / reactivate (status) and delete. The stage carries the everyday status; this is the escape hatch. */
function DangerZone({ v }: { v: ContractView }) {
    const { c, asField } = v;
    const cancelled = c.status === "cancelled";
    return (
        <section className={cn(CARD, "border-destructive/30")}>
            <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
            <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3">
                <form action={setContractStatusAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value={cancelled ? "active" : "cancelled"} />
                    {asField}
                    <Button type="submit" size="sm" variant={cancelled ? "outline" : "destructive"}>
                        {cancelled ? "Reactivate contract" : "Cancel contract"}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {cancelled ? "Sets the contract back to active; the stage stays where it was." : "Marks the contract cancelled; its tasks and invoices stay as they are."}
                    </p>
                </form>
                <form action={deleteContractAction}>
                    <input type="hidden" name="id" value={c.id} />
                    {asField}
                    <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                        Delete contract
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">Detaches its invoices, posts and campaigns; the tasks stay as they are.</p>
                </form>
            </div>
        </section>
    );
}
