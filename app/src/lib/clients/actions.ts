"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
    CLIENT_STATUSES,
    createClient,
    deleteClient,
    getClientById,
    updateClient,
    type ClientStatus,
} from "@/lib/data/clients";
import { generateMonthlyPlan } from "@/lib/data/content";
import { createServiceClient } from "@/lib/supabase/server";

function asStatus(v: FormDataEntryValue | null): ClientStatus {
    const s = String(v ?? "");
    return (CLIENT_STATUSES as readonly string[]).includes(s)
        ? (s as ClientStatus)
        : "prospect";
}

/** Parse a non-negative integer from a form field, clamped to a sane ceiling. */
function asCount(v: FormDataEntryValue | null, fallback: number): number {
    const n = Number.parseInt(String(v ?? ""), 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(n, 1000);
}

export async function createClientAction(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const c = await createClient({
        name,
        status: asStatus(formData.get("status")),
        contactName: String(formData.get("contactName") ?? "").trim(),
        contactEmail: String(formData.get("contactEmail") ?? "").trim(),
        contactPhone: String(formData.get("contactPhone") ?? "").trim(),
        website: String(formData.get("website") ?? "").trim(),
        industry: String(formData.get("industry") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
    });
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
    redirect(`/settings/clients/${c.id}`);
}

export async function updateClientAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateClient(id, {
        name: String(formData.get("name") ?? "").trim(),
        status: asStatus(formData.get("status")),
        contactName: String(formData.get("contactName") ?? "").trim(),
        contactEmail: String(formData.get("contactEmail") ?? "").trim(),
        contactPhone: String(formData.get("contactPhone") ?? "").trim(),
        website: String(formData.get("website") ?? "").trim(),
        industry: String(formData.get("industry") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        contentRevisionLimit: asCount(formData.get("contentRevisionLimit"), 3),
        monthlyContentQuota: asCount(formData.get("monthlyContentQuota"), 0),
    });
    revalidatePath(`/settings/clients/${id}`);
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
}

export type ClientInviteState = {
    ok: boolean;
    message?: string;
    /** One-time set-password link to share with the client contact. */
    inviteLink?: string;
};

/**
 * Invite a CLIENT to their portal: create (or recover) a Supabase auth user for
 * their contact email, link it to the clients row (user_id), force a
 * set-password step, and return a one-time link to share. Mirrors
 * inviteTeamMemberAction. The signed-in client is kept out of /admin by the
 * admin layout gate (getCurrentClient → redirect /portal).
 */
export async function inviteClientAction(
    _prev: ClientInviteState | undefined,
    formData: FormData,
): Promise<ClientInviteState> {
    const id = String(formData.get("id") ?? "");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!id) return { ok: false, message: "Missing client." };
    if (!email) return { ok: false, message: "A contact email is required." };

    const client = await getClientById(id);
    if (!client) return { ok: false, message: "Client not found." };

    const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"
    ).replace(/\/$/, "");
    const redirectTo = `${siteUrl}/auth/confirm`;

    const confirmLink = (props: {
        hashed_token?: string;
        verification_type?: string;
        action_link?: string;
    }): string | undefined => {
        if (!props.hashed_token) return props.action_link;
        const type = props.verification_type || "invite";
        const q = new URLSearchParams({
            token_hash: props.hashed_token,
            type,
            next: "/auth/set-password",
        });
        return `${siteUrl}/auth/confirm?${q.toString()}`;
    };

    let sb;
    try {
        sb = createServiceClient();
    } catch {
        return {
            ok: false,
            message:
                "Service role key not configured — can't invite. Set SUPABASE_SERVICE_ROLE_KEY.",
        };
    }

    const invite = await sb.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo },
    });

    let userId: string | null;
    let inviteLink: string | undefined;

    if (invite.error) {
        if (!/already|registered|exists/i.test(invite.error.message)) {
            return { ok: false, message: `Couldn't invite: ${invite.error.message}` };
        }
        const recovery = await sb.auth.admin.generateLink({
            type: "recovery",
            email,
            options: { redirectTo },
        });
        if (recovery.error) {
            return { ok: false, message: `Couldn't invite: ${recovery.error.message}` };
        }
        userId = recovery.data.user?.id ?? null;
        inviteLink = confirmLink(recovery.data.properties);
    } else {
        userId = invite.data.user?.id ?? null;
        inviteLink = confirmLink(invite.data.properties);
    }

    if (userId) {
        await sb.auth.admin
            .updateUserById(userId, { user_metadata: { needs_password: true } })
            .catch(() => {});
        await updateClient(id, { userId, contactEmail: email });
    }

    revalidatePath(`/settings/clients/${id}`);
    revalidateTag("clients", "max");
    return {
        ok: true,
        message: `Invited ${client.name}. Share the link below so they can set a password.`,
        inviteLink,
    };
}

/** Issue (or re-issue) the client's portal link token. */
export async function generateClientPortalTokenAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateClient(id, { portalToken: randomUUID() });
    revalidatePath(`/settings/clients/${id}`);
    revalidateTag("clients", "max");
}

/**
 * Generate the client's content plan for a month from their monthly quota.
 * Idempotent per (client, month). Month defaults to the value the form sends.
 */
export async function generateContentPlanAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const month = String(formData.get("month") ?? "").trim();
    if (!id || !/^\d{4}-\d{2}$/.test(month)) return;
    const client = await getClientById(id);
    if (!client) return;
    await generateMonthlyPlan({
        clientName: client.name,
        month,
        quota: client.monthlyContentQuota,
    });
    revalidatePath(`/settings/clients/${id}`);
    revalidatePath("/content");
    revalidatePath("/content/calendar");
}

export async function deleteClientAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteClient(id);
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
    redirect("/settings/clients");
}
