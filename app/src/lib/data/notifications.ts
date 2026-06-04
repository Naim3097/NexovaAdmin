/**
 * Notifications data adapter (single-table cutover).
 *
 * `notify` is best-effort: failures are silently swallowed (matches dev-store).
 * `markAllNotificationsRead` and `clearReadNotifications` are bulk ops — done
 * via `update where read_at is null` / `delete where read_at is not null`
 * instead of fetch-then-loop.
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, NotificationRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devNotif from "@/lib/dev-store/notifications";
import { sendTelegram } from "@/lib/telegram/send";
import { renderTelegramFromNotify } from "@/lib/telegram/templates";

export { NOTIFICATION_KINDS } from "@/lib/dev-store/notifications";
export type {
    Notification,
    NotificationKind,
} from "@/lib/dev-store/notifications";

type Notification = devNotif.Notification;
type NotificationKind = devNotif.NotificationKind;

type NotifInsert = Database["public"]["Tables"]["notifications"]["Insert"];

const TABLE = "notifications" as const;

function rowToNotification(row: NotificationRow): Notification {
    return {
        id: row.id,
        kind: row.kind as NotificationKind,
        title: row.title,
        body: row.body,
        link: row.link,
        createdAt: row.created_at,
        readAt: row.read_at,
    };
}

export async function notify(input: {
    kind: NotificationKind;
    title: string;
    body?: string;
    link?: string;
}): Promise<void> {
    // 1) Persist the in-app notification.
    if (!isSupabaseEnabled("notifications")) {
        await devNotif.notify(input);
    } else {
        try {
            const sb = createServiceClient();
            const insert: NotifInsert = {
                id: randomUUID(),
                kind: input.kind,
                title: input.title,
                body: input.body ?? "",
                link: input.link ?? "",
            };
            await sb.from(TABLE).insert(insert);
        } catch {
            // In-app notifications are best-effort.
        }
    }

    // 2) Fan out to Telegram (best-effort, never throws). The template module
    //    decides which kinds are worth pushing — low-noise kinds skip.
    try {
        const msg = renderTelegramFromNotify({
            kind: input.kind,
            title: input.title,
            body: input.body,
            link: input.link,
        });
        if (msg) {
            await sendTelegram({
                text: msg.text,
                buttons: msg.button ? [msg.button] : undefined,
            });
        }
    } catch {
        // Telegram is best-effort.
    }
}

export async function listNotifications(): Promise<Notification[]> {
    if (!isSupabaseEnabled("notifications")) return devNotif.listNotifications();
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: false });
    if (error) throw new Error(`listNotifications: ${error.message}`);
    return (data as NotificationRow[]).map(rowToNotification);
}

export async function unreadCount(): Promise<number> {
    if (!isSupabaseEnabled("notifications")) return devNotif.unreadCount();
    try {
        const sb = createServiceClient();
        const { count, error } = await sb
            .from(TABLE)
            .select("id", { count: "exact", head: true })
            .is("read_at", null);
        if (error) throw new Error(`unreadCount: ${error.message}`);
        return count ?? 0;
    } catch {
        return 0;
    }
}

export async function markNotificationRead(id: string): Promise<void> {
    if (!isSupabaseEnabled("notifications")) {
        return devNotif.markNotificationRead(id);
    }
    try {
        const sb = createServiceClient();
        await sb
            .from(TABLE)
            .update({ read_at: new Date().toISOString() })
            .eq("id", id)
            .is("read_at", null);
    } catch {
        // ignore
    }
}

export async function markAllNotificationsRead(): Promise<void> {
    if (!isSupabaseEnabled("notifications")) {
        return devNotif.markAllNotificationsRead();
    }
    const sb = createServiceClient();
    await sb
        .from(TABLE)
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
}

export async function deleteNotification(id: string): Promise<void> {
    if (!isSupabaseEnabled("notifications")) {
        return devNotif.deleteNotification(id);
    }
    try {
        const sb = createServiceClient();
        await sb.from(TABLE).delete().eq("id", id);
    } catch {
        // ignore
    }
}

export async function clearReadNotifications(): Promise<void> {
    if (!isSupabaseEnabled("notifications")) {
        return devNotif.clearReadNotifications();
    }
    const sb = createServiceClient();
    await sb.from(TABLE).delete().not("read_at", "is", null);
}
