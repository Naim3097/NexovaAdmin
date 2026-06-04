import Link from "next/link";
import { CLIENT_STATUSES, listClients } from "@/lib/data/clients";
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
import { createClientAction } from "@/lib/clients/actions";

export const dynamic = "force-dynamic";

export default async function SettingsClientsPage() {
    const clients = await listClients();
    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings"
                    className="text-xs text-muted-foreground hover:underline"
                >
                    Settings
                </Link>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Clients</h1>
                <p className="text-sm text-muted-foreground">
                    {clients.length} record{clients.length === 1 ? "" : "s"}.
                    Names match what&apos;s used everywhere else.
                </p>
            </div>

            <form
                action={createClientAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <h2 className="text-sm font-medium">Add client</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" required placeholder="Lean.x Sdn Bhd" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Status</Label>
                        <Select name="status" defaultValue="prospect">
                            <SelectTrigger className="h-10">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CLIENT_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>
                                        {s}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Contact name</Label>
                        <Input name="contactName" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Contact email</Label>
                        <Input name="contactEmail" type="email" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Phone</Label>
                        <Input name="contactPhone" type="tel" placeholder="+60..." />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Industry</Label>
                        <Input name="industry" placeholder="F&B, SaaS, ..." />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-sm">Website</Label>
                        <Input name="website" type="url" placeholder="https://" />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="submit">Add client</Button>
                </div>
            </form>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">Directory</div>
                {clients.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No clients yet.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {clients.map((c) => (
                            <li
                                key={c.id}
                                className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/settings/clients/${c.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {c.name}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {c.contactName || "—"}
                                        {c.contactEmail ? ` · ${c.contactEmail}` : ""}
                                        {c.industry ? ` · ${c.industry}` : ""}
                                    </p>
                                </div>
                                <Badge
                                    variant={
                                        c.status === "active"
                                            ? "default"
                                            : c.status === "churned"
                                                ? "destructive"
                                                : "outline"
                                    }
                                >
                                    {c.status}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
