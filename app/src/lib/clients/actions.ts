"use server";

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
import { getContractById, updateContract } from "@/lib/data/contracts";
import { normalizeRenewalStatus, renewalLabel } from "@/lib/contracts/renewal";
import { recordAudit } from "@/lib/data/audit";
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

/** The deal-owner select sends "none" for nobody. */
function asDealOwner(v: FormDataEntryValue | null): string {
    const s = String(v ?? "").trim();
    return s === "none" ? "" : s;
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
        billingAddress: String(formData.get("billingAddress") ?? "").trim(),
        website: String(formData.get("website") ?? "").trim(),
        industry: String(formData.get("industry") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        dealOwner: asDealOwner(formData.get("dealOwner")),
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
        billingAddress: String(formData.get("billingAddress") ?? "").trim(),
        website: String(formData.get("website") ?? "").trim(),
        industry: String(formData.get("industry") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
        contentRevisionLimit: asCount(formData.get("contentRevisionLimit"), 3),
        dealOwner: asDealOwner(formData.get("dealOwner")),
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

/**
 * Revoke a client's portal access (offboarding SOP 6): unlink the auth user
 * from the client record. Their login then resolves to no client and the
 * role-aware door bounces them — no data is deleted, and a later re-invite
 * (same email) relinks cleanly.
 */
export async function revokeClientPortalAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const client = await getClientById(id);
    if (!client || !client.userId) return;
    await updateClient(id, { userId: null });
    await recordAudit({
        entity: "client",
        entityId: id,
        kind: "update",
        summary: `Portal access revoked for ${client.name}`,
    });
    revalidatePath(`/settings/clients/${id}`);
    revalidateTag("clients", "max");
}

export async function deleteClientAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteClient(id);
    revalidatePath("/settings/clients");
    revalidateTag("clients", "max");
    redirect("/settings/clients");
}

/** The small actions below answer the form at once instead of redirecting. */
export type ActionResult = { ok: true } | { ok: false; reason: string };

/**
 * Log a check-in with the client: the day we last spoke and one line on what
 * was said. Feeds the Clients tab's "last check-in" and its health rule, so
 * the client page and the dashboard are refreshed together.
 */
export async function logCheckInAction(clientId: string, date: string, note: string): Promise<ActionResult> {
    const id = String(clientId ?? "").trim();
    const day = String(date ?? "").trim();
    const text = String(note ?? "").trim().slice(0, 500);
    if (!id) return { ok: false, reason: "Missing client." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, reason: "Pick the day of the check-in." };
    if (day > new Date().toISOString().slice(0, 10)) return { ok: false, reason: "A check-in cannot be in the future." };
    const client = await getClientById(id);
    if (!client) return { ok: false, reason: "Client not found." };
    await updateClient(id, { lastCheckInAt: day, lastCheckInNote: text });
    await recordAudit({
        entity: "client",
        entityId: id,
        kind: "update",
        summary: `Check-in with ${client.name} on ${day}${text ? `: ${text}` : ""}`,
    });
    revalidatePath(`/settings/clients/${id}`);
    revalidatePath("/settings/clients");
    revalidatePath("/dashboard");
    revalidateTag("clients", "max");
    return { ok: true };
}

/**
 * Where the renewal stands on a project nearing its end ("" = not discussed).
 * Set from the client page; the Clients tab colours its renewal chips from it.
 */
export async function setRenewalStatusAction(contractId: string, status: string): Promise<ActionResult> {
    const id = String(contractId ?? "").trim();
    if (!id) return { ok: false, reason: "Missing project." };
    const contract = await getContractById(id);
    if (!contract) return { ok: false, reason: "Project not found." };
    const next = normalizeRenewalStatus(status);
    if (next === contract.renewalStatus) return { ok: true };
    await updateContract(id, { renewalStatus: next });
    await recordAudit({
        entity: "contract",
        entityId: id,
        kind: "update",
        summary: `Renewal on ${contract.code || contract.name}: ${renewalLabel(next)}`,
    });
    revalidatePath(`/projects/${id}`);
    revalidatePath("/projects");
    // Every client page lists its projects; the id of this one's client is not to hand.
    revalidatePath("/settings/clients", "layout");
    revalidatePath("/dashboard");
    return { ok: true };
}
