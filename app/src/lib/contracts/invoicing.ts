/**
 * Invoice automation for projects — shared by the project actions and the
 * demo seed. A project bills monthly (one invoice per month) or once
 * (one-off). Server-side only (reads/writes the data layer), but not a
 * server-action module.
 */
import type { Contract } from "@/lib/data/contracts";
import { createInvoice, listInvoices, updateInvoice, type Invoice } from "@/lib/data/invoices";
import { listClients } from "@/lib/data/clients";
import { invoiceForMonth } from "@/lib/contracts/helpers";

/**
 * Raise the draft invoice for one month of a project (retainer line
 * prefilled, issue date on the project's invoice day, due 14 days later).
 * Returns the existing invoice when the month is already raised. On a one-off
 * project it raises the single invoice for the whole amount.
 */
export async function raiseMonthInvoice(c: Contract, month: string): Promise<Invoice | null> {
    if (!/^\d{4}-\d{2}$/.test(month)) return null;
    const invoices = await listInvoices();
    const existing = c.billing.cadence === "monthly" ? invoiceForMonth(c, invoices, month) : undefined;
    if (existing) return existing;
    const day = String(c.billing.invoiceDay || 1).padStart(2, "0");
    const issueDate = `${month}-${day}`;
    const dueDate = new Date(Date.parse(`${issueDate}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
    const client = (await listClients()).find((x) => x.name === c.clientName);
    const inv = await createInvoice({
        clientName: c.clientName,
        contractId: c.id,
        issueDate,
        dueDate,
    });
    await updateInvoice(inv.id, {
        items: [
            {
                id: crypto.randomUUID(),
                description: c.billing.cadence === "monthly" ? `${c.name} — ${month}` : c.name,
                details: c.code,
                quantity: 1,
                unitPriceMyr: c.billing.amountMyr,
            },
        ],
        billToAddress: client?.billingAddress ?? "",
    });
    return inv;
}
