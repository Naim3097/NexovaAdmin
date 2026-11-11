/**
 * Invoice automation for contracts — shared by the contract actions, the work
 * generator and the lifecycle advance. Server-side only (reads/writes the
 * data layer), but not a server-action module.
 */
import type { Contract } from "@/lib/data/contracts";
import { createInvoice, listInvoices, updateInvoice, type Invoice } from "@/lib/data/invoices";
import { listClients } from "@/lib/data/clients";
import type { ScheduleRow } from "@/lib/data/planners";
import { invoiceForMonth } from "@/lib/contracts/helpers";

/**
 * Raise the draft invoice for one row of the proposal's payment schedule
 * (deposit, month n, milestone …). Issued on the row's due date, payable 14
 * days later. Returns the existing invoice when the row was already raised.
 */
export async function raiseScheduleInvoice(c: Contract, row: ScheduleRow, billToAddress = ""): Promise<Invoice | null> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.dueDate) || !(row.amountMyr > 0)) return null;
    if (row.invoiceId) {
        const existing = (await listInvoices()).find((i) => i.id === row.invoiceId);
        if (existing) return existing;
    }
    const dueDate = new Date(Date.parse(`${row.dueDate}T00:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
    const inv = await createInvoice({ clientName: c.clientName, contractId: c.id, issueDate: row.dueDate, dueDate });
    await updateInvoice(inv.id, {
        items: [{ id: crypto.randomUUID(), description: `${c.name} — ${row.label}`, details: c.code, quantity: 1, unitPriceMyr: row.amountMyr }],
        billToAddress,
    });
    return inv;
}

/**
 * Raise the draft invoice for one month of a contract (retainer line
 * prefilled, issue date on the contract's invoice day, due 14 days later).
 * Returns the existing invoice when the month is already raised.
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
