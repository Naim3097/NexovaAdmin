"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActingMember } from "@/lib/auth";
import {
    DEFAULT_WEEKLY_HOURS,
    createTeamMember,
    deleteTeamMember,
    getTeamMemberByUserId,
    isFunction,
    isSystemRole,
    listTeamMembers,
    roundHours,
    updateTeamMember,
    type SetAside,
    type SystemRole,
    type TeamFunction,
    type TeamMember,
    type TeamRole,
} from "@/lib/data/team";
import { normalizeDaysOff } from "@/lib/dev-store/team";
import { LINE_TYPES, type LineType } from "@/lib/data/planners";
import { hasRole, isAdmin, isManager } from "@/lib/roles";
import { defaultFunctionsFor, isTeamCategory, type TeamCategory } from "@/lib/team/categories";
import { createServiceClient } from "@/lib/supabase/server";

/** Never keep a longer job role than this, whatever the form sends. */
const MAX_JOB_ROLE = 80;

/** The job role as typed ("Chief Executive Officer"): free text, trimmed, inner spaces collapsed. */
function asJobRole(v: FormDataEntryValue | null): TeamRole {
    return String(v ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_JOB_ROLE);
}

/** The job category picked, or null when the field is missing or not one of TEAM_CATEGORIES. */
function asCategory(v: FormDataEntryValue | null): TeamCategory | null {
    const s = String(v ?? "").trim();
    return isTeamCategory(s) ? s : null;
}

/**
 * The one `systemRole` picked (admin / management / user). A login holds
 * exactly one permission set; anything unknown or blank is a plain user.
 */
function asSystemRole(formData: FormData): SystemRole {
    const s = String(formData.get("systemRole") ?? "");
    return isSystemRole(s) ? s : "user";
}

/** Checked `functions` boxes (Delivery / Finance) — the duties handed to this person. */
function asFunctions(formData: FormData): TeamFunction[] {
    return [...new Set(formData.getAll("functions").map(String).filter(isFunction))];
}

/**
 * Duties for a NEW person: the boxes as ticked when the form showed them
 * (`functions_shown`, so unticking both really means none), else what the
 * category starts with (Business support: finance; everyone else: delivery).
 */
function newMemberFunctions(formData: FormData, category: TeamCategory | null): TeamFunction[] {
    if (formData.has("functions_shown")) return asFunctions(formData);
    return category ? defaultFunctionsFor(category) : asFunctions(formData);
}

/** A quarter-hour number, or null when the field was left blank / is not a number. */
function asHours(v: FormDataEntryValue | null): number | null {
    const s = String(v ?? "").trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? roundHours(n) : null;
}

/** Never read more rows than this, whatever the form sends. */
const MAX_SET_ASIDE_ROWS = 100;

/**
 * The set-aside rows from `aside_<i>_label` / `aside_<i>_hours`, numbered
 * from 0. Reading stops at the first missing label field; a row with an
 * empty label or hours ≤ 0 is skipped. Labels are kept once each.
 */
function asSetAside(formData: FormData): SetAside[] {
    const out: SetAside[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < MAX_SET_ASIDE_ROWS; i += 1) {
        const raw = formData.get(`aside_${i}_label`);
        if (raw === null) break;
        const label = String(raw).trim();
        const hours = asHours(formData.get(`aside_${i}_hours`));
        if (!label || !hours || hours <= 0) continue;
        const key = label.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ label, hours });
    }
    return out;
}

/** Never read more rows than this, whatever the form sends. */
const MAX_DAYS_OFF_ROWS = 100;

/**
 * The days-off rows from `off_<i>_month` / `off_<i>_days`, numbered from 0.
 * Reading stops at the first missing month field; a row with no YYYY-MM month
 * or days ≤ 0 is skipped, and the same month twice adds up.
 */
function asDaysOff(formData: FormData): Record<string, number> {
    const raw: Record<string, number> = {};
    for (let i = 0; i < MAX_DAYS_OFF_ROWS; i += 1) {
        const month = formData.get(`off_${i}_month`);
        if (month === null) break;
        const key = String(month).trim();
        const days = Math.round(Number(String(formData.get(`off_${i}_days`) ?? "").trim()));
        if (!/^\d{4}-\d{2}$/.test(key) || !Number.isFinite(days) || days <= 0) continue;
        raw[key] = (raw[key] ?? 0) + days;
    }
    return normalizeDaysOff(raw);
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
 * `admin` — adds members, changes system roles, the record and the cost
 * rate, deletes. `manager` — admin OR management: hands out duties and
 * set-aside hours. Both follow the acting member's system roles (under the
 * dev bypass that is whoever was picked, so stepping through the app as a
 * plain user really behaves like one); nobody resolved counts as admin so the
 * bypass user can never be locked out.
 */
async function actor(as?: string): Promise<{ me: TeamMember | null; admin: boolean; manager: boolean }> {
    const me = await getActingMember(as);
    return { me, admin: isAdmin(me), manager: isManager(me) };
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
    if (!(await actor()).admin) return { ok: false, message: "Only admins invite team members." };
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = asJobRole(formData.get("role"));
    const category = asCategory(formData.get("category"));
    const phone = String(formData.get("phone") ?? "").trim();
    const skills = String(formData.get("skills") ?? "").trim();
    const systemRoles: SystemRole[] = [asSystemRole(formData)];
    const functions = newMemberFunctions(formData, category);
    if (!name) return { ok: false, message: "Name is required." };
    if (!email) return { ok: false, message: "Email is required." };
    if (!role) return { ok: false, message: "Job role is required." };
    if (!category) return { ok: false, message: "Pick a job category." };

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

    const m = await createTeamMember({ name, role, category, email, phone, skills, userId, systemRoles, functions });
    revalidatePath("/team");
    return {
        ok: true,
        message: `Invited ${m.name}. Share the link below so they can set a password.`,
        inviteLink,
    };
}

/** Admins only: add a member without a login. */
export async function createTeamMemberAction(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return;
    if (!(await actor(String(formData.get("as") ?? ""))).admin) return;
    const category = asCategory(formData.get("category"));
    const m = await createTeamMember({
        name,
        role: asJobRole(formData.get("role")),
        // No category picked: the store derives one from the job role.
        category: category ?? undefined,
        email: String(formData.get("email") ?? "").trim(),
        phone: String(formData.get("phone") ?? "").trim(),
        skills: String(formData.get("skills") ?? "").trim(),
        systemRoles: [asSystemRole(formData)],
        functions: newMemberFunctions(formData, category),
    });
    revalidatePath("/team");
    redirect(`/team/${m.id}`);
}

/** Admin edit of a member's record (identity, contact, hours, cost rate). The job is set by `setJobAction`. */
export async function updateTeamMemberAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const { admin } = await actor(String(formData.get("as") ?? ""));
    if (!admin) return;
    const weekly = asHours(formData.get("weeklyHours"));
    const cost = Number(String(formData.get("costRateMyr") ?? "").trim());
    await updateTeamMember(id, {
        name: String(formData.get("name") ?? "").trim(),
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
 * Admin or management sets a person's job: the job ROLE people read (free
 * text) and the job CATEGORY the app maps to task seats. A category that is
 * not one of TEAM_CATEGORIES leaves the stored one alone. Duties are not
 * touched here; they stay as handed out.
 */
export async function setJobAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const { manager } = await actor(String(formData.get("as") ?? ""));
    if (!manager) return;
    const category = asCategory(formData.get("category"));
    await updateTeamMember(id, {
        role: asJobRole(formData.get("role")),
        ...(category ? { category } : {}),
    });
    revalidatePath(`/team/${id}`);
    revalidatePath("/team");
    revalidatePath("/profile");
    revalidatePath("/works");
    revalidatePath("/dashboard");
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

/** Admin or management hands out the duties (Delivery, Finance) from the two checkboxes. */
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
 * Admin or management sets the hours a week a person spends on work that
 * leaves no task behind (management, onboarding, sales…), as labelled rows;
 * people see them as "Non-delivery hours". Delivery capacity = weekly hours −
 * these.
 */
export async function setSetAsideAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const { manager } = await actor(String(formData.get("as") ?? ""));
    if (!manager) return;
    await updateTeamMember(id, { setAside: asSetAside(formData) });
    revalidatePath(`/team/${id}`);
    revalidatePath("/team");
    revalidatePath("/profile");
    revalidatePath("/home");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard");
}

/**
 * Days off per month (leave; Kuala Lumpur public holidays already come off), taken off that month's
 * available hours. People enter their own on their profile; an admin or
 * manager enters anyone's on the Team page. `return=profile` sends the
 * person back to their profile with a saved note; the Team page just reloads.
 */
export async function setDaysOffAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const as = String(formData.get("as") ?? "").trim();
    const { me, manager } = await actor(as);
    if (!manager && me?.id !== id) return;
    await updateTeamMember(id, { daysOff: asDaysOff(formData) });
    revalidatePath(`/team/${id}`);
    revalidatePath("/team");
    revalidatePath("/profile");
    revalidatePath("/home");
    revalidatePath("/dashboard");
    revalidatePath("/dashboard");
    if (String(formData.get("return") ?? "") === "profile") {
        const q = new URLSearchParams({ saved: "days-off" });
        if (as) q.set("as", as);
        redirect(`/profile?${q.toString()}`);
    }
}

/**
 * Self-service profile: the job role they do, contact, availability, their
 * non-delivery hours and the hours they need per task type. Never touches
 * system roles, duties or the cost rate — those are the admin's. The job
 * category changes here only for admin or management editing themselves
 * (for everyone else it is read only and set on the Team page). The target is
 * always the acting member, never a submitted id.
 */
export async function updateProfileAction(formData: FormData) {
    const as = String(formData.get("as") ?? "").trim();
    const { me, manager } = await actor(as);
    if (!me) return;
    const weekly = asHours(formData.get("weeklyHours"));
    const category = manager ? asCategory(formData.get("category")) : null;
    await updateTeamMember(me.id, {
        role: asJobRole(formData.get("role")),
        ...(category ? { category } : {}),
        phone: String(formData.get("phone") ?? "").trim(),
        skills: String(formData.get("skills") ?? "").trim(),
        weeklyHours: weekly && weekly > 0 ? weekly : DEFAULT_WEEKLY_HOURS,
        setAside: asSetAside(formData),
        hoursByType: hoursTableFrom(formData),
    });
    revalidatePath("/profile");
    revalidatePath("/team");
    revalidatePath(`/team/${me.id}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard");
    const q = new URLSearchParams({ saved: "1" });
    if (as) q.set("as", as);
    redirect(`/profile?${q.toString()}`);
}

/** Admins only. */
export async function deleteTeamMemberAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const { admin } = await actor(String(formData.get("as") ?? ""));
    if (!admin) return;
    await deleteTeamMember(id);
    revalidatePath("/team");
    redirect("/team");
}
