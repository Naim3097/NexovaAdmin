/**
 * Money tab detail: the invoice and contract lists behind the numbers —
 * overdue, due soon, drafts to issue, contracts to prepare, receipts.
 * Server component — no state.
 */
import Link from "next/link";
import { DRAFT_WINDOW_DAYS, DUE_SOON_DAYS, PAID_WINDOW_DAYS, type FinanceSnapshot } from "@/lib/management/finance";
import { Section, plural } from "@/app/(admin)/management/ui";
import { ContractRows, InvoiceRows } from "@/app/(admin)/finance/rows";

export function MoneyDetail({ fin }: { fin: FinanceSnapshot }) {
    const k = fin.kpis;
    return (
        <>
            <Section
                id="overdue"
                title="Overdue invoices"
                description="Sent and past the due date, latest first — open one to remind or record payment."
                action={
                    <Link href="/invoices" className="text-xs underline">
                        All invoices
                    </Link>
                }
            >
                <InvoiceRows rows={fin.overdue} mode="overdue" empty="Nothing overdue — every sent invoice is inside its terms." />
            </Section>

            <Section id="due-soon" title={`Due within ${DUE_SOON_DAYS} days`} description="Sent but not yet due; a nudge now keeps them off the overdue list.">
                <InvoiceRows rows={fin.dueSoon} mode="due_soon" empty={`Nothing falls due in the next ${DUE_SOON_DAYS} days.`} />
            </Section>

            <Section
                id="drafts"
                title="Drafts to issue"
                description={`Draft invoices due inside ${DRAFT_WINDOW_DAYS} days (or already past) — open one, check the lines, mark it sent.`}
            >
                <InvoiceRows rows={fin.drafts} mode="draft" empty={`No drafts due within ${DRAFT_WINDOW_DAYS} days.${k.draftsAll ? ` ${plural(k.draftsAll, "draft")} further out.` : ""}`} />
            </Section>

            <Section
                id="prepare"
                title="Contracts to prepare"
                description="Active contracts with no signed copy on file, and drafts not yet active."
                action={
                    <Link href="/contracts" className="text-xs underline">
                        All contracts
                    </Link>
                }
            >
                <ContractRows rows={fin.toPrepare} empty="Every active contract is signed and no draft is waiting." />
            </Section>

            <Section id="receipts" title={`Receipts · last ${PAID_WINDOW_DAYS} days`} description="Invoices marked paid, most recent first.">
                <InvoiceRows rows={fin.receipts} mode="receipt" empty={`No payments recorded in the last ${PAID_WINDOW_DAYS} days.`} />
            </Section>
        </>
    );
}
