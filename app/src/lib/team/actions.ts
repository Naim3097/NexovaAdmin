"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    createTeamMember,
    deleteTeamMember,
    getTeamMemberByUserId,
    TEAM_ROLES,
    updateTeamMember,
    type TeamRole,
} from "@/lib/data/team";
import { createServiceClient } from "@/lib/supabase/server";

function asRole(v: FormDataEntryValue | null): TeamRole {
    const s = String(v ?? "");
    return (TEAM_ROLES as readonly string[]).includes(s)
        ? (s as TeamRole)
        : "Other";
}

export type InviteState = {
    ok: boolean;
    message?: string;
    /** Supabase action link — share so the teammate can set their password. */
    inviteLink?: string;
};

/**
 * Invite a teammate: create (or find) their Supabase auth user, link it to a
 * `team_members` row, and return a one-time link they use to set a password.
 *
 * We use `generateLink` (not `inviteUserByEmail`) so the link is returned to
 * the admin to share directly — the team can be onboarded immediately without
 * waiting on email/SMTP setup. Once Supabase Auth SMTP (Resend) is configured,
 * this can switch to auto-sending.
 */
export async function inviteTeamMemberAction(
    _prev: InviteState | undefined,
    formData: FormData,
): Promise<InviteState> {
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = asRole(formData.get("role"));
    const phone = String(formData.get("phone") ?? "").trim();
    const skills = String(formData.get("skills") ?? "").trim();
    if (!name) return { ok: false, message: "Name is required." };
    if (!email) return { ok: false, message: "Email is required." };

    const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"
    ).replace(/\/$/, "");
    const redirectTo = `${siteUrl}/auth/callback?next=/auth/set-password`;

    let sb;
    try {
        sb = createServiceClient();
    } catch {
        return {
            ok: false,
            message:
                "Service role key not configured — can't invite users. Set SUPABASE_SERVICE_ROLE_KEY.",
        };
    }

    // Create the auth user + invite link (or recover an existing user).
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
        // User already exists — issue a set-password (recovery) link instead.
        const recovery = await sb.auth.admin.generateLink({
            type: "recovery",
            email,
            options: { redirectTo },
        });
        if (recovery.error) {
            return {
                ok: false,
                message: `Couldn't invite: ${recovery.error.message}`,
            };
        }
        userId = recovery.data.user?.id ?? null;
        inviteLink = recovery.data.properties?.action_link;
    } else {
        userId = invite.data.user?.id ?? null;
        inviteLink = invite.data.properties?.action_link;
    }

    // Flag the account as needing a password. The admin area forces the
    // set-password step while this is set, so an invited user can't slip
    // straight into the app regardless of how GoTrue resolves the invite
    // redirect. Cleared when they choose a password.
    if (userId) {
        await sb.auth.admin
            .updateUserById(userId, { user_metadata: { needs_password: true } })
            .catch(() => {});
    }

    // Already linked to a member row? Don't duplicate — just resend the link.
    if (userId) {
        const existing = await getTeamMemberByUserId(userId);
        if (existing) {
            return {
                ok: true,
                message: `${existing.name} already has an account — here's a fresh set-password link.`,
                inviteLink,
            };
        }
    }

    const m = await createTeamMember({ name, role, email, phone, skills, userId });
    revalidatePath("/team");
    return {
        ok: true,
        message: `Invited ${m.name}. Share the link below so they can set a password.`,
        inviteLink,
    };
}

export async function createTeamMemberAction(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    const m = await createTeamMember({
        name,
        role: asRole(formData.get("role")),
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        skills: String(formData.get("skills") ?? "").trim(),
    });
    revalidatePath("/team");
    redirect(`/team/${m.id}`);
}

export async function updateTeamMemberAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateTeamMember(id, {
        name: String(formData.get("name") ?? "").trim(),
        role: asRole(formData.get("role")),
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        skills: String(formData.get("skills") ?? "").trim(),
        active: String(formData.get("active") ?? "") === "on",
    });
    revalidatePath(`/team/${id}`);
    revalidatePath("/team");
}

export async function deleteTeamMemberAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteTeamMember(id);
    revalidatePath("/team");
    redirect("/team");
}
