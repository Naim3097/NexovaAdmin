import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = {
    id: string;
    description: string;
    details: string;
    quantity: number;
    unitPriceMyr: number;
};

/**
 * Inline-editable line-item row for invoice/quotation detail tables.
 *
 * A <form> can't span table cells, so the inputs live in their cells and
 * associate with a small form (in the actions cell) via the `form` attribute —
 * the browser includes them in that form's submission. Update writes the row;
 * Remove is its own form as before. Sub-points stay read-only here.
 */
export function EditableItemRow({
    docId,
    item,
    updateAction,
    deleteAction,
    fmt,
}: {
    docId: string;
    item: Item;
    updateAction: (formData: FormData) => Promise<void>;
    deleteAction: (formData: FormData) => Promise<void>;
    fmt: (n: number) => string;
}) {
    const fid = `item-edit-${item.id}`;
    const bullets = item.details
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean);
    return (
        <tr>
            <td className="py-2 pr-2">
                <Input
                    name="description"
                    form={fid}
                    required
                    defaultValue={item.description}
                    className="h-8 text-sm"
                />
                {bullets.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                        {bullets.map((b, bi) => (
                            <li key={bi}>{b}</li>
                        ))}
                    </ul>
                ) : null}
            </td>
            <td className="py-2 pr-2 text-right">
                <Input
                    name="quantity"
                    form={fid}
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={item.quantity}
                    className="h-8 w-16 text-right text-sm tabular-nums"
                />
            </td>
            <td className="py-2 pr-2 text-right">
                <Input
                    name="unitPriceMyr"
                    form={fid}
                    type="number"
                    step="0.01"
                    defaultValue={item.unitPriceMyr}
                    className="h-8 w-24 text-right text-sm tabular-nums"
                />
            </td>
            <td className="py-2 pr-2 text-right tabular-nums">
                {fmt(item.quantity * item.unitPriceMyr)}
            </td>
            <td className="py-2 text-right whitespace-nowrap">
                <form id={fid} action={updateAction} className="inline">
                    <input type="hidden" name="id" value={docId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                    >
                        Update
                    </Button>
                </form>
                <form action={deleteAction} className="inline">
                    <input type="hidden" name="id" value={docId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <Button
                        type="submit"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground"
                    >
                        Remove
                    </Button>
                </form>
            </td>
        </tr>
    );
}
