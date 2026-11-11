"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccessLevel, getActingMember, getCurrentTeamMember } from "@/lib/auth";
import {
    DEFAULT_WEEKLY_HOURS,
    RESERVED_KEYS,
    createTeamMember,
    deleteTeamMember,
    getTeamMemberByUserId,
    isFunction,
    isSystemRole,
    listTeamMembers,
    roundHours,
    TEAM_ROLES,
    updateTeamMember,
    type ReservedKey,
    type SystemRole,
    type TeamFunction,
    type TeamMember,
    type TeamRole,
} from "@/lib/data/team";
import { LINE_TYPES, type LineType } from "@/lib/data/planners";
import { hasRole, isManager } from "@/lib/roles";
import { createServiceClient } from "@/lib/supabase/server";

function asRole(v: FormDataEntryValue | null): TeamRole {
    const s = String(v ?? "");
    return (TEAM_ROLES as readonly string[]).includes(s)
        ? (s as TeamRole)
        : "Other";
}

/**
 * The one `systemRole` picked (admin / management / user). A login holds
 * exactly one permission set; anything unknown or blank is a plain user.
 */
function asSystemRole(formData: FormData): SystemRole {
    const s = String(formData.get("systemRole") ?? "");
    return isSystemRole(s) ? s : "user";
}

/** Checked `functions` boxes — the duties handed to this person. */
function asFunctions(formData: FormData): TeamFunction[] {
    return [...new Set(formData.getAll("functions").map(String).filter(isFunction))];
}

/** The `reserved_<key>` fields; blank or 0 drops the hat. */
function asReservedHours(formData: FormData): Partial<Record<ReservedKey, number>> {
    const out: Partial<Record<ReservedKey, number>> = {};
    for (const k of RESERVED_KEYS) {
        const h = asHours(formData.get(`reserved_${k}`));
        if (h && h > 0) out[k] = h;
    }
    return out;
}

/** A quarter-hour number, or null when the field was left blank / is not a number. */
function asHours(v: FormDataEntryValue | null): number | null {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? roundHours(n) : null;
}

/** The per-type hours table from `hours_<type>` fields. Blank = use the default. */
function hoursTableFrom(formData: FormData): Partial<Record<LineType, number>> {
    const out: Partial<Record<LineType, number>> = {};
    for (const t of LINE_TYPES) {
        const h = asHours(formData.get(`hours_${t}`));
        if (h && h > 0) out[t] = h;
    }
    return out;
}

/**
 * Who is acting, and whether they may administer the team.
 *
 * `admin` — may change system roles, the record and the cost rate. With a
 * real login that is the legacy access level (bootstrap rule included).
 * `manager` — admin OR management: may hand out functions and reserved hours.
 * Under the dev bypass "acting as" someone follows THEIR system role, so
 * stepping through the app as a plain user really behaves like one — while
 * with nobody picked the bypass user stays admin and can never be locked out.
 */
async function actor(as?: string): Promise<{ me: TeamMember | null; admin: boolean; manager: boolean }> {
    const [me, linked, access] = await Promise.all([
        getActingMember(as),
        getCurrentTeamMember(),
        getAccessLevel(),
    ]);
    const simulated = Boolean(me) && !linked;
    const admin = simulated ? hasRole(me, "admin") : access === "admin";
    return { me, admin, manager: admin || isManager(me) };
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
    const systemRoles: SystemRole[] = [asSystemRole(formData)];
    const functions = asFunctions(formData);
    if (!name) return { ok: false, message: "Name is required." };
    if (!email) return { ok: false, message: "Email is required." };

    const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001"
    ).replace(/\/$/, "");
    const redirectTo = `${siteUrl}/auth/confirm`;

    // Build a server-side confirmation link from the token hash. This verifies
    // via /auth/confirm (verifyOtp → cookie session) instead of the raw
    // action_link, which uses a URL-hash redirect that breaks in a fresh
    // browser. Falls back to the action_link if the hash isn't present.
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
        inviteLink = confirmLink(recovery.data.properties);
    } else {
        userId = invite.data.user?.id ?? null;
        inviteLink = confirmLink(invite.data.properties);
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

    const m = await createTeamMember({ name, role, email, phone, skills, userId, systemRoles, functions });
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
        systemRoles: [asSystemRole(formData)],
        functions: asFunctions(formData),
    });
    revalidatePath("/team");
    redirect(`/team/${m.id}`);
}

/** Admin edit of a member's record (identity, company role, hours, cost rate). */
export async function updateTeamMemberAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const { admin } = await actor(String(formData.get("as") ?? ""));
    if (!admin) return;
    const weekly = asHours(formData.get("weeklyHours"));
    const cost = Number(String(formData.get("costRateMyr") ?? "").trim());
    await updateTeamMember(id, {
        name: String(formData.get("name") ?? "").trim(),
        role: asRole(formData.get("role")),
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        skills: String(formData.get("skills") ?? "").trim(),
        active: String(formData.get("active") ?? "") === "on",
        weeklyHours: weekly && weekly > 0 ? weekly : DEFAULT_WEEKLY_HOURS,
        costRateMyr: Number.isFinite(cost) && cost > 0 ? Math.round(cost * 100) / 100 : 0,
    });
    revalidatePath(`/team/${id}`);
    revalidatePath("/team");
}

/**
 * Admin sets the ONE permission set a login holds (admin / management /
 * user). The last active admin always keeps "admin" — removing it would lock
 * everyone out of /team and settings.
 */
export async function setSystemRolesAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const { admin } = await actor(String(formData.get("as") ?? ""));
    if (!admin) return;
    let role = asSystemRole(formData);
    if (role !== "admin") {
        const team = await listTeamMembers();
        const target = team.find((m) => m.id === id);
        const otherAdmin = team.some((m) => m.id !== id && m.active && hasRole(m, "admin"));
        if (target && target.active && hasRole(target, "admin") && !otherAdmin) {
            role = "admin";
        }
    }
    await updateTeamMember(id, { systemRoles: [role] });
    revalidatePath(`/team/${id}`);
    revalidatePath("/team");
    revalidatePath("/profile");
    revalidatePath("/home");
}

/** Admin or management hands out the duties (account manager, sales, finance). */
export async function setFunctionsAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const { manager } = await actor(String(formData.get("as") ?? ""));
    if (!manager) return;
    await updateTeamMember(id, { functions: asFunctions(formData) });
    revalidatePath(`/team/${id}`);
    revalidatePath("/team");
    revalidatePath("/profile");
    revalidatePath("/home");
}

/**
 * Admin or management sets the hours per week a hat takes (selling,
 * invoicing, managing). Delivery capacity = weekly hours − these.
 */
export async function setReservedHoursAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const { manager } = await actor(String(formData.get("as") ?? ""));
    if (!manager) return;
    await updateTeamMember(id, { reservedHours: asReservedHours(formData) });
    revalidatePath(`/team/${id}`);
    revalidatePath("/team");
    revalidatePath("/profile");
    revalidatePath("/home");
    revalidatePath("/management");
}

/**
 * Self-service profile: the job they do, contact, availability and the hours
 * they need per task type. Never touches system roles or the cost rate — those
 * are the admin's. The target is always the acting member, never a submitted id.
 */
export async function updateProfileAction(formData: FormData) {
    const as = String(formData.get("as") ?? "").trim();
    const { me } = await actor(as);
    if (!me) return;
    const weekly = asHours(formData.get("weeklyHours"));
    await updateTeamMember(me.id, {
        role: asRole(formData.get("role")),
        phone: String(formData.get("phone") ?? "").trim(),
        skills: String(formData.get("skills") ?? "").trim(),
        weeklyHours: weekly && weekly > 0 ? weekly : DEFAULT_WEEKLY_HOURS,
        hoursByType: hoursTableFrom(formData),
    });
    revalidatePath("/profile");
    revalidatePath("/team");
    revalidatePath(`/team/${me.id}`);
    const q = new URLSearchParams({ saved: "1" });
    if (as) q.set("as", as);
    redirect(`/profile?${q.toString()}`);
}

export async function deleteTeamMemberAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteTeamMember(id);
    revalidatePath("/team");
    redirect("/team");
}
