/**
 * The Agreement: the printable contract document (letter and scope of work).
 * Everything comes from the project itself — its scope, phases, tasks,
 * value, billing and invoices — plus the quote when one is linked. Amounts
 * here are the full figures. This page is the contract, so it keeps the
 * "contract" wording; only the container is called the project.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { getContractById, PER_LABEL, requirementName, type Requirement } from "@/lib/data/contracts";
import { LINE_TYPE_LABEL } from "@/lib/data/planners";
import { getQuotationById, computeTotals as quoteTotals } from "@/lib/data/quotations";
import { listInvoices, computeTotals } from "@/lib/data/invoices";
import { listWorks, type Work } from "@/lib/data/works";
import { groupByMonth, monthLabel, todayKey } from "@/lib/works/helpers";
import { lineList } from "@/lib/planners/helpers";
import { contractMonths, DEFAULT_CHANNEL } from "@/lib/contracts/generate";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const PROVIDER = "Nexova Digital";

function money(n: number): string {
    return `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(ymd: string | null | undefined): string {
    if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return "—";
    return new Date(`${ymd.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function shortMonth(ym: string): string {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "—";
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-MY", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Awareness post on Instagram: 4 a week on Instagram" / "Website: once" / "Branding: 2, once". */
function requirementSentence(r: Requirement): string {
    const name = requirementName(r);
    if (r.per === "once") return r.count === 1 ? `${name}: once` : `${name}: ${r.count}, once`;
    return `${name}: ${r.count} ${PER_LABEL[r.per]} on ${r.channel || DEFAULT_CHANNEL[r.type]}`;
}

function Doc({ n, title, children }: { n: number | string; title: string; children: React.ReactNode }) {
    return (
        <section className="doc-section space-y-3">
            <h2 className="border-b pb-1 text-lg font-semibold">
                {n}. {title}
            </h2>
            {children}
        </section>
    );
}

const th = "py-1.5 pr-3 text-left text-xs font-medium text-muted-foreground";
const td = "py-1.5 pr-3 align-top";

function TaskTable({ rows }: { rows: Work[] }) {
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="border-b">
                    <th className={th}>Deliverable</th>
                    <th className={th}>Type</th>
                    <th className={th}>Channel</th>
                    <th className={th}>Month</th>
                    <th className={th}>Due</th>
                    <th className={`${th} pr-0`}>Client sign-off</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((w) => (
                    <tr key={w.id} className="border-b last:border-0">
                        <td className={td}>
                            {w.title}
                            {w.milestone ? (
                                <span title="Milestone" className="ml-1 text-amber-500">
                                    ◆
                                </span>
                            ) : null}
                        </td>
                        <td className={td}>{LINE_TYPE_LABEL[w.type]}</td>
                        <td className={`${td} text-muted-foreground`}>{w.channel || "—"}</td>
                        <td className={`${td} whitespace-nowrap`}>{monthLabel(w.month)}</td>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{w.dueDate || "—"}</td>
                        <td className={`${td} pr-0`}>{w.approver === "client" ? "Yes" : "No"}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function SignatureBlock({ party, name, date }: { party: string; name: string; date?: string | null }) {
    return (
        <div className="space-y-5 text-sm">
            <p className="font-medium">{party}</p>
            <div>
                <div className="h-8 border-b" />
                <p className="mt-1 text-xs text-muted-foreground">Signature</p>
            </div>
            <div>
                <div className="h-6 border-b">{name ? <span>{name}</span> : null}</div>
                <p className="mt-1 text-xs text-muted-foreground">Name</p>
            </div>
            <div>
                <div className="h-6 border-b tabular-nums">{date ? <span>{date}</span> : null}</div>
                <p className="mt-1 text-xs text-muted-foreground">Date</p>
            </div>
        </div>
    );
}

export default async function ContractDocumentPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ as?: string }>;
}) {
    await requireTeamAccess();
    const { id } = await params;
    const sp = await searchParams;
    const as = (sp.as ?? "").trim();
    const [c, invoices, allWorks, linked] = await Promise.all([getContractById(id), listInvoices(), listWorks(), getCurrentTeamMember()]);
    if (!c) notFound();
    const quotation = c.quotationId ? await getQuotationById(c.quotationId) : null;

    const today = todayKey();
    const actor = linked?.name ?? as;
    const asQ = actor && !linked ? `?as=${encodeURIComponent(actor)}` : "";

    const works = allWorks
        .filter((w) => w.contractId === c.id)
        .sort((a, b) => a.month.localeCompare(b.month) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.title.localeCompare(b.title));
    const contractInvoices = invoices.filter((i) => i.contractId === c.id && i.status !== "void").sort((a, b) => a.issueDate.localeCompare(b.issueDate));
    const invoiced = contractInvoices.reduce((s, i) => s + computeTotals(i).total, 0);
    const paid = contractInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + computeTotals(i).total, 0);
    const phases = c.phases;
    const byPhase = phases.map((ph) => ({ ph, list: works.filter((w) => w.phaseKey === ph.key || (!w.phaseKey && w.phaseName === ph.name)) }));
    const unphased = works.filter((w) => !byPhase.some((g) => g.list.includes(w)));
    const milestones = works.filter((w) => w.milestone).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
    const months = contractMonths(c);
    const signatory = c.signedBy || "";

    return (
        <div className="space-y-4">
            {/* Print stylesheet: only the document itself goes to paper. */}
            <style>{`
                @media print {
                    .no-print, .canvas-glow > :not(main) { display: none !important; }
                    main { padding: 0 !important; overflow: visible !important; }
                    body { background: white !important; }
                    @page { margin: 16mm; }
                    .doc-section, tr, li { break-inside: avoid; }
                    h1, h2, h3 { break-after: avoid; }
                    details { display: none !important; }
                }
            `}</style>

            {/* Top bar */}
            <div className="no-print flex flex-wrap items-center justify-between gap-3">
                <Link href={`/projects/${c.id}${asQ}`} className="text-sm text-muted-foreground hover:underline">
                    Back to project
                </Link>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                    {quotation ? (
                        <Link href={`/quotes/${quotation.id}`} className="font-medium underline">
                            Quote {quotation.number}
                        </Link>
                    ) : null}
                    <PrintButton />
                </div>
            </div>

            <article className="mx-auto w-full max-w-4xl space-y-8 rounded-lg border bg-card p-6 md:p-10 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0">
                {/* Title block */}
                <div className="border-b pb-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {PROVIDER} · Agreement and scope of work
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold md:text-3xl">{c.name}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {c.code}
                        {c.reference ? ` · ${c.reference}` : ""} · {c.clientName} · {fmtDate(c.startDate)}
                        {c.endDate ? ` → ${fmtDate(c.endDate)}` : " → open-ended"}
                    </p>
                </div>

                {/* 1 · Summary */}
                <Doc n={1} title="Summary">
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-xs text-muted-foreground">Client</dt>
                            <dd className="font-medium">{c.clientName}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Provider</dt>
                            <dd className="font-medium">{PROVIDER}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Contract</dt>
                            <dd className="font-medium">
                                {c.code}
                                {c.reference ? ` · ${c.reference}` : ""}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Account manager</dt>
                            <dd className="font-medium">{c.accountManager || "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Term</dt>
                            <dd className="font-medium">
                                {fmtDate(c.startDate)}
                                {c.endDate ? ` → ${fmtDate(c.endDate)}` : " → open-ended, rolling month by month"}
                                {c.endDate ? ` · ${months.length} month${months.length === 1 ? "" : "s"}` : ""}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-muted-foreground">Signature</dt>
                            <dd className="font-medium">
                                {c.signedAt ? `Signed${signatory ? ` by ${signatory}` : ""} on ${fmtDate(c.signedAt)}` : "Not yet signed"}
                            </dd>
                        </div>
                    </dl>
                    <div>
                        <h3 className="text-sm font-medium">Scope</h3>
                        {c.requirements.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No scope recorded on the project yet.</p>
                        ) : (
                            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                                {c.requirements.map((r, i) => (
                                    <li key={`${r.type}-${i}`}>{requirementSentence(r)}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Doc>

                {/* 2 · Deliverables */}
                <Doc n={2} title="Deliverables">
                    {works.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No deliverables scheduled yet.</p>
                    ) : phases.length > 0 ? (
                        <div className="space-y-5">
                            {byPhase.map(({ ph, list }, i) => (
                                <div key={ph.key}>
                                    <h3 className="text-sm font-medium">
                                        {i + 1}. {ph.name}
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                            {ph.startMonth || ph.endMonth ? `${shortMonth(ph.startMonth)} → ${shortMonth(ph.endMonth)} · ` : ""}
                                            {list.length} item{list.length === 1 ? "" : "s"}
                                        </span>
                                    </h3>
                                    {ph.summary ? <p className="mb-1 text-xs text-muted-foreground">{ph.summary}</p> : null}
                                    {list.length === 0 ? <p className="text-xs text-muted-foreground">Nothing scheduled in this phase.</p> : <TaskTable rows={list} />}
                                </div>
                            ))}
                            {unphased.length > 0 ? (
                                <div>
                                    <h3 className="text-sm font-medium">
                                        Other deliverables
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                            {unphased.length} item{unphased.length === 1 ? "" : "s"}
                                        </span>
                                    </h3>
                                    <TaskTable rows={unphased} />
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {[...groupByMonth(works)].map(([m, list]) => (
                                <div key={m}>
                                    <h3 className="text-sm font-medium">
                                        {monthLabel(m)}
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                            {list.length} item{list.length === 1 ? "" : "s"}
                                        </span>
                                    </h3>
                                    <TaskTable rows={list} />
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        ◆ marks a milestone.{c.endDate ? "" : " On an open-ended contract, each further month is scheduled as it comes."}
                    </p>
                </Doc>

                {/* 3 · Timeline */}
                <Doc n={3} title="Timeline">
                    {phases.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No phases defined.</p>
                    ) : (
                        <ol className="space-y-1 text-sm">
                            {phases.map((ph, i) => (
                                <li key={ph.key} className="flex flex-wrap items-baseline gap-x-3">
                                    <span className="w-40 shrink-0 font-medium">
                                        {i + 1}. {ph.name}
                                    </span>
                                    <span className="tabular-nums text-muted-foreground">
                                        {ph.startMonth || ph.endMonth ? `${shortMonth(ph.startMonth)} → ${shortMonth(ph.endMonth)}` : "months not set"}
                                    </span>
                                    {ph.summary ? <span className="text-xs text-muted-foreground">· {ph.summary}</span> : null}
                                </li>
                            ))}
                        </ol>
                    )}
                    <div>
                        <h3 className="text-sm font-medium">Milestones</h3>
                        {milestones.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No milestones recorded.</p>
                        ) : (
                            <ul className="mt-1 space-y-1 text-sm">
                                {milestones.map((w) => (
                                    <li key={w.id} className="flex gap-3">
                                        <span className="w-28 shrink-0 tabular-nums text-muted-foreground">{w.dueDate || "—"}</span>
                                        <span>
                                            ◆ {w.title}
                                            {w.channel ? <span className="text-muted-foreground"> · {w.channel}</span> : null}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Doc>

                {/* 4 · Fees */}
                <Doc n={4} title="Fees">
                    <p className="text-sm">
                        Contract value <span className="font-semibold">{c.valueMyr ? money(c.valueMyr) : "not set"}</span> · billed{" "}
                        {c.billing.cadence.replace(/_/g, " ")}
                        {c.billing.amountMyr ? ` at ${money(c.billing.amountMyr)}` : ""}
                        {c.billing.cadence === "monthly" ? ` on day ${c.billing.invoiceDay} of the month` : ""}
                        {c.billing.cadence === "monthly" && c.billing.amountMyr && c.endDate ? ` · ${months.length} × ${money(c.billing.amountMyr)} = ${money(months.length * c.billing.amountMyr)}` : ""}
                    </p>
                    {quotation ? (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className={th}>Item · quote {quotation.number}</th>
                                    <th className={`${th} text-right`}>Qty</th>
                                    <th className={`${th} text-right`}>Unit</th>
                                    <th className={`${th} pr-0 text-right`}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotation.items.map((it) => (
                                    <tr key={it.id} className="border-b last:border-0">
                                        <td className={td}>
                                            {it.description}
                                            {it.details ? <p className="whitespace-pre-line text-xs text-muted-foreground">{it.details}</p> : null}
                                        </td>
                                        <td className={`${td} text-right tabular-nums`}>{it.quantity}</td>
                                        <td className={`${td} text-right tabular-nums`}>{money(it.unitPriceMyr)}</td>
                                        <td className={`${td} pr-0 text-right tabular-nums`}>{money(it.quantity * it.unitPriceMyr)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="text-sm">
                                <tr>
                                    <td colSpan={3} className="pt-2 pr-3 text-right text-muted-foreground">
                                        Subtotal
                                    </td>
                                    <td className="pt-2 text-right tabular-nums">{money(quoteTotals(quotation).subtotal)}</td>
                                </tr>
                                <tr>
                                    <td colSpan={3} className="pr-3 text-right text-muted-foreground">
                                        Tax {quotation.taxRatePct}%
                                    </td>
                                    <td className="text-right tabular-nums">{money(quoteTotals(quotation).tax)}</td>
                                </tr>
                                <tr className="font-semibold">
                                    <td colSpan={3} className="pr-3 text-right">
                                        Total
                                    </td>
                                    <td className="text-right tabular-nums">{money(quoteTotals(quotation).total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : null}
                    <div>
                        <h3 className="text-sm font-medium">Invoices under this contract</h3>
                        {contractInvoices.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No invoice raised yet.</p>
                        ) : (
                            <table className="mt-1 w-full text-sm">
                                <thead>
                                    <tr className="border-b">
                                        <th className={th}>Invoice</th>
                                        <th className={th}>Issued</th>
                                        <th className={th}>Due</th>
                                        <th className={th}>Status</th>
                                        <th className={`${th} pr-0 text-right`}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contractInvoices.map((i) => (
                                        <tr key={i.id} className="border-b last:border-0">
                                            <td className={td}>
                                                <Link href={`/invoices/${i.id}`} className="underline">
                                                    {i.number}
                                                </Link>
                                            </td>
                                            <td className={`${td} tabular-nums`}>{i.issueDate}</td>
                                            <td className={`${td} tabular-nums`}>{i.dueDate}</td>
                                            <td className={td}>{i.status === "sent" && i.dueDate < today ? "overdue" : i.status}</td>
                                            <td className={`${td} pr-0 text-right tabular-nums`}>{money(computeTotals(i).total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="text-sm">
                                        <td colSpan={4} className="pt-2 pr-3 text-right text-muted-foreground">
                                            Invoiced {money(invoiced)} · paid {money(paid)}
                                        </td>
                                        <td className="pt-2 text-right font-semibold tabular-nums">{money(invoiced - paid)} open</td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </Doc>

                {/* 5 · Terms */}
                <Doc n={5} title="Terms">
                    {c.terms ? (
                        lineList(c.terms).length > 1 ? (
                            <ul className="list-disc space-y-1 pl-5 text-sm">
                                {lineList(c.terms).map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        ) : (
                            <p className="whitespace-pre-line text-sm">{c.terms}</p>
                        )
                    ) : (
                        <p className="text-sm text-muted-foreground">No terms recorded. Add them on the Contract tab of the project page.</p>
                    )}
                    <p className="text-sm">Any change to the scope, timeline or fees is agreed in writing and recorded on the contract as a change.</p>
                </Doc>

                {/* 6 · Signatures */}
                <Doc n={6} title="Signatures">
                    <p className="text-sm">
                        {c.signedAt
                            ? `Signed${signatory ? ` by ${signatory}` : ""} on ${fmtDate(c.signedAt)}.`
                            : "This agreement takes effect once both parties have signed below."}
                        {c.fileUrl ? (
                            <>
                                {" "}
                                <a href={c.fileUrl} target="_blank" rel="noreferrer" className="underline">
                                    Signed copy
                                </a>
                            </>
                        ) : null}
                    </p>
                    <div className="grid gap-10 sm:grid-cols-2">
                        <SignatureBlock party={`For ${PROVIDER}`} name={c.accountManager} />
                        <SignatureBlock party={`For ${c.clientName}`} name={signatory} date={c.signedAt} />
                    </div>
                </Doc>
            </article>
        </div>
    );
}
