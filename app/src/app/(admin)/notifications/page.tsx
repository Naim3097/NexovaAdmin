import Link from "next/link";
import {
    listNotifications,
    type NotificationKind,
} from "@/lib/data/notifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    clearReadNotificationsAction,
    deleteNotificationAction,
    markAllNotificationsReadAction,
    markNotificationReadAction,
} from "@/lib/notifications/actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<NotificationKind, string> = {
    lead_new: "New lead",
    lead_won: "Lead won",
    lead_lost: "Lead lost",
    deliverable_approved: "Deliverable approved",
    project_signoff: "Project signed off",
    invoice_issued: "Invoice issued",
    invoice_paid: "Invoice paid",
    invoice_overdue: "Invoice overdue",
    onboarding_submitted: "Onboarding submitted",
    stage_advanced: "Stage advanced",
    content_draft_submitted: "Draft sent for review",
    content_changes_requested: "Changes requested",
    content_approved: "Content approved",
    quote_sent: "Quotation sent",
    quote_accepted: "Quotation accepted",
    task_due_soon: "Task due soon",
    system: "System",
};

const KIND_TONE: Record<
    NotificationKind,
    "default" | "secondary" | "outline" | "destructive"
> = {
    lead_new: "default",
    lead_won: "default",
    lead_lost: "secondary",
    deliverable_approved: "default",
    project_signoff: "default",
    invoice_issued: "secondary",
    invoice_paid: "default",
    invoice_overdue: "destructive",
    onboarding_submitted: "secondary",
    stage_advanced: "default",
    content_draft_submitted: "secondary",
    content_changes_requested: "destructive",
    content_approved: "default",
    quote_sent: "secondary",
    quote_accepted: "default",
    task_due_soon: "secondary",
    system: "outline",
};

export default async function NotificationsPage() {
    const all = await listNotifications();
    const unread = all.filter((n) => !n.readAt);
    const read = all.filter((n) => n.readAt);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        Notifications
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {unread.length} unread · {all.length} total
                    </p>
                </div>
                <div className="flex gap-2">
                    {unread.length > 0 ? (
                        <form action={markAllNotificationsReadAction}>
                            <Button type="submit" size="sm" variant="outline">
                                Mark all read
                            </Button>
                        </form>
                    ) : null}
                    {read.length > 0 ? (
                        <form action={clearReadNotificationsAction}>
                            <Button
                                type="submit"
                                size="sm"
                                variant="destructive"
                            >
                                Clear read
                            </Button>
                        </form>
                    ) : null}
                </div>
            </div>

            <Section
                title="Unread"
                items={unread}
                emptyText="No unread notifications."
            />
            <Section
                title="Read"
                items={read}
                emptyText="No read notifications yet."
                muted
            />
        </div>
    );
}

function Section({
    title,
    items,
    emptyText,
    muted,
}: {
    title: string;
    items: Awaited<ReturnType<typeof listNotifications>>;
    emptyText: string;
    muted?: boolean;
}) {
    return (
        <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b p-4 text-sm font-medium">
                <span>
                    {title} ({items.length})
                </span>
            </div>
            {items.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">{emptyText}</p>
            ) : (
                <ul className="divide-y">
                    {items.map((n) => (
                        <li
                            key={n.id}
                            className={`flex flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between ${muted ? "opacity-70" : ""}`}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-2">
                                    <Badge variant={KIND_TONE[n.kind]}>
                                        {KIND_LABEL[n.kind]}
                                    </Badge>
                                    {n.link ? (
                                        <Link
                                            href={n.link}
                                            className="font-medium hover:underline"
                                        >
                                            {n.title}
                                        </Link>
                                    ) : (
                                        <span className="font-medium">
                                            {n.title}
                                        </span>
                                    )}
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(n.createdAt).toLocaleString()}
                                    </span>
                                </div>
                                {n.body ? (
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {n.body}
                                    </p>
                                ) : null}
                            </div>
                            <div className="flex shrink-0 gap-1">
                                {!n.readAt ? (
                                    <form action={markNotificationReadAction}>
                                        <input
                                            type="hidden"
                                            name="id"
                                            value={n.id}
                                        />
                                        <Button
                                            type="submit"
                                            size="sm"
                                            variant="outline"
                                        >
                                            Mark read
                                        </Button>
                                    </form>
                                ) : null}
                                <form action={deleteNotificationAction}>
                                    <input
                                        type="hidden"
                                        name="id"
                                        value={n.id}
                                    />
                                    <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                    >
                                        Delete
                                    </Button>
                                </form>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
