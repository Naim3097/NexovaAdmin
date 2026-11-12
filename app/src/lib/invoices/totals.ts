/**
 * Invoice totals: subtotal, tax and total from the lines. Pure, no I/O, so
 * client components can import it. The dev store re-exports it.
 */
import type { Invoice } from "@/lib/dev-store/invoices";

export function computeTotals(invoice: Pick<Invoice, "items" | "taxRatePct">): {
    subtotal: number;
    tax: number;
    total: number;
} {
    const subtotal = invoice.items.reduce(
        (sum, it) => sum + (it.quantity || 0) * (it.unitPriceMyr || 0),
        0,
    );
    const tax = +(subtotal * ((invoice.taxRatePct || 0) / 100)).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), tax, total };
}
