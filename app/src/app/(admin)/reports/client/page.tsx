import Link from "next/link";
import { redirect } from "next/navigation";
import { listAllClientNames } from "@/lib/reports";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export const dynamic = "force-dynamic";

const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
];

async function openClientReportAction(formData: FormData) {
    "use server";
    const client = String(formData.get("client") ?? "").trim();
    const month = String(formData.get("month") ?? "").trim();
    if (!client || !/^\d{4}-\d{2}$/.test(month)) return;
    redirect(`/reports/client/${encodeURIComponent(client)}/${month}`);
}

export default async function ClientReportPickerPage() {
    const clients = (await listAllClientNames()).filter(
        (c) => c !== "Nexov",
    );
    // Last 12 months, current first
    const now = new Date();
    const months: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const label = `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
        months.push({ value, label });
    }

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/reports"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    Back to reports
                </Link>
                <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
                    Client monthly report
                </h1>
                <p className="text-sm text-muted-foreground">
                    Generate a printable monthly summary for a client.
                    Pulls campaigns, content, SEO, projects, and invoicing
                    activity for the chosen month.
                </p>
            </div>

            {clients.length === 0 ? (
                <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
                    No client activity yet. Add a campaign / project / invoice
                    against a client (other than &quot;Nexov&quot;) first.
                </p>
            ) : (
                <form
                    action={openClientReportAction}
                    className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label className="text-sm">Client</Label>
                            <Select name="client" defaultValue={clients[0]}>
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {clients.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {c}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm">Month</Label>
                            <Select name="month" defaultValue={months[0].value}>
                                <SelectTrigger className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {months.map((m) => (
                                        <SelectItem key={m.value} value={m.value}>
                                            {m.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit">Open report</Button>
                    </div>
                </form>
            )}
        </div>
    );
}
