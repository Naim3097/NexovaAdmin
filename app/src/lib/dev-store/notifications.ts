/**
 * DEV-ONLY local file store for notifications.
 *
 * Single global inbox (no per-user recipient yet) — the project is currently
 * single-tenant via DEV_AUTH_BYPASS. When real auth lands, add `recipient`
 * + filter on read.
 *
 * Replaced by Supabase `notifications` table once provisioned.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
const NOTIF_DIR = path.join(ROOT, "notifications");

export const NOTIFICATION_KINDS = [
    "lead_new",
    "lead_won",
    "lead_lost",
    "deliverable_approved",
    "project_signoff",
    "invoice_issued",
    "invoice_paid",
    "invoice_overdue",
    "onboarding_submitted",
    "stage_advanced",
    "content_draft_submitted",
    "content_changes_requested",
    "content_approved",
    "system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type Notification = {
    id: string;
    kind: NotificationKind;
    title: string;
    body: string;
    /** Workspace-relative link to the related record. Empty = no link. */
    link: string;
    createdAt: string;
    readAt: string | null;
};

async function ensureDir() {
    await fs.mkdir(NOTIF_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(NOTIF_DIR, `${id}.json`);
}

/**
 * Create a notification. Designed to be called from server actions on
 * meaningful events. Failures are silently swallowed — a failed
 * notification must NEVER break the originating action.
 */
export async function notify(input: {
    kind: NotificationKind;
    title: string;
    body?: string;
    link?: string;
}): Promise<void> {
    try {
        await ensureDir();
        const n: Notification = {
            id: randomUUID(),
            kind: input.kind,
            title: input.title,
            body: input.body ?? "",
            link: input.link ?? "",
            createdAt: new Date().toISOString(),
            readAt: null,
        };
        await fs.writeFile(fileFor(n.id), JSON.stringify(n, null, 2), "utf8");
    } catch {
        // Notifications are best-effort.
    }
}

export async function listNotifications(): Promise<Notification[]> {
    await ensureDir();
    const entries = await fs.readdir(NOTIF_DIR);
    const out: Notification[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        try {
            const raw = await fs.readFile(
                path.join(NOTIF_DIR, entry),
                "utf8",
            );
            out.push(JSON.parse(raw) as Notification);
        } catch {
            // skip corrupt file
        }
    }
    // Newest first
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function unreadCount(): Promise<number> {
    const all = await listNotifications();
    return all.filter((n) => !n.readAt).length;
}

export async function markNotificationRead(id: string): Promise<void> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        const n = JSON.parse(raw) as Notification;
        if (n.readAt) return;
        n.readAt = new Date().toISOString();
        await fs.writeFile(fileFor(id), JSON.stringify(n, null, 2), "utf8");
    } catch {
        // ignore
    }
}

export async function markAllNotificationsRead(): Promise<void> {
    const all = await listNotifications();
    const now = new Date().toISOString();
    await Promise.all(
        all
            .filter((n) => !n.readAt)
            .map((n) =>
                fs.writeFile(
                    fileFor(n.id),
                    JSON.stringify({ ...n, readAt: now }, null, 2),
                    "utf8",
                ),
            ),
    );
}

export async function deleteNotification(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}

export async function clearReadNotifications(): Promise<void> {
    const all = await listNotifications();
    await Promise.all(
        all.filter((n) => n.readAt).map((n) => deleteNotification(n.id)),
    );
}
