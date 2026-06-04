import Link from "next/link";
import { notFound } from "next/navigation";
import { SERVICE_CATEGORIES, getServiceById } from "@/lib/data/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    deleteServiceAction,
    updateServiceAction,
} from "@/lib/services/actions";

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const s = await getServiceById(id);
    if (!s) notFound();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings/services"
                    className="text-xs text-muted-foreground hover:underline"
                >
                    Services
                </Link>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
                    {s.name}
                </h1>
            </div>

            <form
                action={updateServiceAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={s.id} />
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" defaultValue={s.name} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Category</Label>
                        <Select name="category" defaultValue={s.category}>
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {SERVICE_CATEGORIES.map((c) => (
                                    <SelectItem key={c} value={c}>
                                        {c}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Unit</Label>
                        <Input name="unit" defaultValue={s.unit} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Default price (MYR)</Label>
                        <Input
                            name="defaultPrice"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={s.defaultPrice}
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Description</Label>
                    <Input name="description" defaultValue={s.description} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        name="active"
                        defaultChecked={s.active}
                        className="size-4 rounded border-input"
                    />
                    Active
                </label>
                <div className="flex justify-end">
                    <Button type="submit">Save</Button>
                </div>
            </form>

            <form
                action={deleteServiceAction}
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
                <input type="hidden" name="id" value={s.id} />
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-destructive">
                            Delete service
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Removes the catalog entry only.
                        </p>
                    </div>
                    <Button type="submit" variant="destructive">
                        Delete
                    </Button>
                </div>
            </form>
        </div>
    );
}
