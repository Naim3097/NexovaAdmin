import Link from "next/link";
import { SERVICE_CATEGORIES, listServices } from "@/lib/data/services";
import { Badge } from "@/components/ui/badge";
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
import { createServiceAction } from "@/lib/services/actions";

export const dynamic = "force-dynamic";

export default async function SettingsServicesPage() {
    const services = await listServices();
    const fmt = (n: number) =>
        n.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings"
                    className="text-xs text-muted-foreground hover:underline"
                >
                    Settings
                </Link>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
                    Services
                </h1>
                <p className="text-sm text-muted-foreground">
                    {services.filter((s) => s.active).length} active ·{" "}
                    {services.length} total. Used as suggestions on invoice
                    line items.
                </p>
            </div>

            <form
                action={createServiceAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <h2 className="text-sm font-medium">Add service</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input
                            name="name"
                            required
                            placeholder="Website — landing page"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Category</Label>
                        <Select name="category" defaultValue="other">
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
                        <Input
                            name="unit"
                            defaultValue="project"
                            placeholder="project / month / hour"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Default price (MYR)</Label>
                        <Input
                            name="defaultPrice"
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue="0"
                        />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Description</Label>
                        <Input name="description" />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Add service</Button>
                </div>
            </form>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">Catalog</div>
                {services.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No services yet.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {services.map((s) => (
                            <li
                                key={s.id}
                                className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/settings/services/${s.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {s.name}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {s.category} · per {s.unit} · MYR{" "}
                                        {fmt(s.defaultPrice)}
                                    </p>
                                </div>
                                <Badge variant={s.active ? "default" : "outline"}>
                                    {s.active ? "active" : "inactive"}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
