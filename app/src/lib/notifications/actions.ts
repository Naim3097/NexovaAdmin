"use server";

import { revalidatePath } from "next/cache";
import {
    clearReadNotifications,
    deleteNotification,
    markAllNotificationsRead,
    markNotificationRead,
} from "@/lib/data/notifications";

function asStr(v: FormDataEntryValue | null): string {
    return typeof v === "string" ? v.trim() : "";
}

function bumpAll() {
    revalidatePath("/notifications");
    revalidatePath("/dashboard");
    revalidatePath("/(admin)", "layout");
}

export async function markNotificationReadAction(formData: FormData) {
    const id = asStr(formData.get("id"));
    if (!id) return;
    await markNotificationRead(id);
    bumpAll();
}

export async function markAllNotificationsReadAction() {
    await markAllNotificationsRead();
    bumpAll();
}

export async function deleteNotificationAction(formData: FormData) {
    const id = asStr(formData.get("id"));
    if (!id) return;
    await deleteNotification(id);
    bumpAll();
}

export async function clearReadNotificationsAction() {
    await clearReadNotifications();
    bumpAll();
}
