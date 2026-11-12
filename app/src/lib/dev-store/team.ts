/**
 * DEV-ONLY local file store for team members.
 * Replaced by Supabase `users` + `roles` + `skills` once provisioned.
 *
 * Roles are kept as a free-string ENUM-like list (not a hard enum) so the
 * agency can add roles later (CTO, Copywriter, etc.) without migrations.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { devDataRoot } from "@/lib/dev-store/root";
import { randomUUID } from "node:crypto";
import { isLineType, type LineType } from "@/lib/dev-store/planners";
import { JOB_ROLE_SUGGESTIONS, normalizeCategory, type TeamCategory } from "@/lib/team/categories";
import { DEFAULT_HOURS_BY_TYPE, DEFAULT_WEEKLY_HOURS, deliveryWeeklyHours, roundHours, setAsideWeekly } from "@/lib/team/hours";

export { CATEGORY_LABEL, CATEGORY_SHORT, TEAM_CATEGORIES, defaultFunctionsFor, isTeamCategory, type TeamCategory } from "@/lib/team/categories";

// The hours maths lives in @/lib/team/hours (pure, client-safe); re-exported here.
export { DEFAULT_HOURS_BY_TYPE, DEFAULT_WEEKLY_HOURS, deliveryWeeklyHours, roundHours, setAsideWeekly };

const ROOT = devDataRoot();
const TEAM_DIR = path.join(ROOT, "team");

/** Job role is free text now; these are the suggestions the field offers. */
export const TEAM_ROLES = JOB_ROLE_SUGGESTIONS;
export type TeamRole = string;

/**
 * SYSTEM roles = permission sets (what a login may see and do, and which home
 * it lands on). Assigned by an admin; a person may hold several. Distinct from
 * the COMPANY role (`role`, TEAM_ROLES), which is the job the person does and
 * which they set themselves on their profile.
 */
export const SYSTEM_ROLES = ["admin", "management", "user"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];
export const SYSTEM_ROLE_LABEL: Record<SystemRole, string> = {
    admin: "Admin",
    management: "Management",
    user: "User",
};
export function isSystemRole(v: string): v is SystemRole {
    return (SYSTEM_ROLES as readonly string[]).includes(v);
}

/**
 * FUNCTIONS = duties an admin or manager hands to a user (several allowed).
 * Delivery opens every page except the Dashboard and Finances; finance opens
 * Finances. They add pages, never permissions beyond "user". Being an account
 * manager or a deal owner follows from projects and clients, not from here.
 */
export const FUNCTIONS = ["delivery", "finance"] as const;
export type TeamFunction = (typeof FUNCTIONS)[number];
export const FUNCTION_LABEL: Record<TeamFunction, string> = {
    delivery: "Delivery",
    finance: "Finance",
};
export function isFunction(v: string): v is TeamFunction {
    return (FUNCTIONS as readonly string[]).includes(v);
}
/** The first cut had account_manager / sales duties; they were delivery people. */
export function legacyFunction(v: unknown): TeamFunction | null {
    if (typeof v !== "string") return null;
    if (isFunction(v)) return v;
    if (v === "account_manager" || v === "sales") return "delivery";
    return null;
}

/**
 * Hours a week a person sets aside for work that leaves no task behind
 * ("Management 6h", "Onboarding 2h", "Sales 4h"): free rows, as many as they
 * like, edited on their profile. Delivery capacity = weekly hours − the rows.
 */
export type SetAside = { label: string; hours: number };
const LEGACY_RESERVED_LABEL: Record<string, string> = {
    management: "Management",
    account_manager: "Account management",
    sales: "Sales",
    finance: "Contracts & invoicing",
};
/** Rows as written, or the old `reservedHours` record turned into rows. */
export function normalizeSetAside(raw: unknown): SetAside[] {
    const out: SetAside[] = [];
    if (Array.isArray(raw)) {
        for (const r of raw as Array<Partial<SetAside>>) {
            const label = String(r?.label ?? "").trim();
            const hours = roundHours(Number(r?.hours));
            if (label && hours > 0) out.push({ label, hours });
        }
        return out;
    }
    if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
            const hours = roundHours(Number(v));
            if (hours > 0) out.push({ label: LEGACY_RESERVED_LABEL[k] ?? k, hours });
        }
    }
    return out;
}


export type TeamMember = {
    id: string;
    name: string;
    /** Job role: the title people read ("Chief Executive Officer"); free text. */
    role: TeamRole;
    /** Job category: what the app maps to task seats and duties (see @/lib/team/categories). */
    category: TeamCategory;
    email: string;
    phone: string;
    skills: string; // comma-separated for now
    active: boolean;
    userId: string | null; // linked Supabase auth user, if invited
    /** Legacy coarse level, kept in sync: admin ⇔ systemRoles includes "admin". */
    accessLevel: "admin" | "standard";
    /** Permission sets this login holds (see SYSTEM_ROLES). */
    systemRoles: SystemRole[];
    /** Duties handed to this person by an admin or manager (see FUNCTIONS). */
    functions: TeamFunction[];
    /** Available working hours per week — the capacity line. */
    weeklyHours: number;
    /** Hours a week set aside for other work, as labelled rows; delivery capacity = weekly − these. */
    setAside: SetAside[];
    /**
     * The hours THIS person needs per task type ("a reel takes me 3h"). Every
     * task assigned to them is prefilled from here; they edit the task only
     * when it ran longer. Missing types fall back to DEFAULT_HOURS_BY_TYPE.
     */
    hoursByType: Partial<Record<LineType, number>>;
    /** Internal hourly cost (MYR), admin/finance only; 0 = not set. */
    costRateMyr: number;
    /** Days off per month (leave, public holidays), YYYY-MM → days, taken off that month's capacity. */
    daysOff: Record<string, number>;
    createdAt: string;
    updatedAt: string;
};


function normalizeHoursByType(raw: unknown): Partial<Record<LineType, number>> {
    const out: Partial<Record<LineType, number>> = {};
    if (!raw || typeof raw !== "object") return out;
    const legacy: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const h = roundHours(Number(v));
        if (h <= 0) continue;
        if (isLineType(k)) out[k] = h;
        else legacy[k] = h;
    }
    // Older tables: "post" hours stand for statics and videos, "branding" for other work.
    if (legacy.post) {
        out.static ??= legacy.post;
        out.video ??= legacy.post;
    }
    if (legacy.branding) out.custom ??= legacy.branding;
    return out;
}


/** YYYY-MM → whole days off, dropping junk keys and zeros. */
export function normalizeDaysOff(raw: unknown): Record<string, number> {
    const out: Record<string, number> = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const d = Math.round(Number(v));
        if (/^\d{4}-\d{2}$/.test(k) && d > 0) out[k] = d;
    }
    return out;
}

export function normalizeTeamMember(raw: Partial<TeamMember> & { id: string }): TeamMember {
    const now = new Date().toISOString();
    const accessLevel = raw.accessLevel === "admin" ? "admin" : "standard";
    // Legacy role names (account_manager / sales / finance / member) from the
    // first cut become functions + "user".
    const rawRoles = (raw.systemRoles ?? []) as string[];
    const legacyFunctions = rawRoles.map(legacyFunction).filter((f): f is TeamFunction => f !== null);
    const roles = rawRoles.filter(isSystemRole);
    const systemRoles: SystemRole[] =
        roles.length > 0 || legacyFunctions.length > 0 || rawRoles.includes("member")
            ? [...new Set<SystemRole>(roles.length > 0 ? roles : ["user"])]
            : accessLevel === "admin"
              ? ["admin", "management"]
              : ["user"];
    const functions = [...new Set([...((raw.functions ?? []) as unknown[]).map(legacyFunction).filter((f): f is TeamFunction => f !== null), ...legacyFunctions])];
    return {
        id: raw.id,
        name: raw.name ?? "",
        role: String(raw.role ?? "").trim(),
        category: normalizeCategory(raw.category, String(raw.role ?? "")),
        email: raw.email ?? "",
        phone: raw.phone ?? "",
        skills: raw.skills ?? "",
        active: raw.active ?? true,
        userId: raw.userId ?? null,
        accessLevel: systemRoles.includes("admin") ? "admin" : "standard",
        systemRoles,
        functions,
        weeklyHours: roundHours(Number(raw.weeklyHours)) || DEFAULT_WEEKLY_HOURS,
        setAside: normalizeSetAside(raw.setAside ?? (raw as { reservedHours?: unknown }).reservedHours),
        hoursByType: normalizeHoursByType(raw.hoursByType),
        costRateMyr: Number(raw.costRateMyr) > 0 ? Number(raw.costRateMyr) : 0,
        daysOff: normalizeDaysOff(raw.daysOff),
        createdAt: raw.createdAt ?? now,
        updatedAt: raw.updatedAt ?? now,
    };
}

async function ensureDir() {
    await fs.mkdir(TEAM_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(TEAM_DIR, `${id}.json`);
}

export type CreateTeamMemberInput = {
    name: string;
    role?: TeamRole;
    category?: TeamCategory;
    email?: string;
    phone?: string;
    skills?: string;
    userId?: string | null;
    accessLevel?: "admin" | "standard";
    systemRoles?: SystemRole[];
    functions?: TeamFunction[];
    weeklyHours?: number;
    setAside?: SetAside[];
    hoursByType?: Partial<Record<LineType, number>>;
    costRateMyr?: number;
    daysOff?: Record<string, number>;
};

export function buildTeamMember(input: CreateTeamMemberInput): TeamMember {
    const now = new Date().toISOString();
    return normalizeTeamMember({
        id: randomUUID(),
        name: input.name,
        role: input.role ?? "",
        category: input.category,
        email: input.email ?? "",
        phone: input.phone ?? "",
        skills: input.skills ?? "",
        active: true,
        userId: input.userId ?? null,
        accessLevel: input.accessLevel ?? "standard",
        systemRoles: input.systemRoles,
        functions: input.functions,
        weeklyHours: input.weeklyHours,
        setAside: input.setAside,
        hoursByType: input.hoursByType,
        costRateMyr: input.costRateMyr,
        daysOff: input.daysOff,
        createdAt: now,
        updatedAt: now,
    });
}

export async function createTeamMember(input: CreateTeamMemberInput): Promise<TeamMember> {
    await ensureDir();
    const m = buildTeamMember(input);
    await fs.writeFile(fileFor(m.id), JSON.stringify(m, null, 2), "utf8");
    return m;
}

export async function listTeamMembers(): Promise<TeamMember[]> {
    await ensureDir();
    const entries = await fs.readdir(TEAM_DIR);
    const out: TeamMember[] = [];
    for (const entry of entries) {
        if (!entry.endsWith(".json")) continue;
        const raw = await fs.readFile(path.join(TEAM_DIR, entry), "utf8");
        out.push(normalizeTeamMember(JSON.parse(raw)));
    }
    return out.sort((a, b) => {
        // Active first, then name
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

export async function getTeamMemberById(
    id: string,
): Promise<TeamMember | null> {
    try {
        const raw = await fs.readFile(fileFor(id), "utf8");
        return normalizeTeamMember(JSON.parse(raw));
    } catch {
        return null;
    }
}

export async function getTeamMemberByUserId(
    userId: string,
): Promise<TeamMember | null> {
    const all = await listTeamMembers();
    return all.find((m) => m.userId === userId) ?? null;
}

export async function updateTeamMember(
    id: string,
    patch: Partial<Omit<TeamMember, "id" | "createdAt">>,
): Promise<TeamMember> {
    const existing = await getTeamMemberById(id);
    if (!existing) throw new Error(`Team member ${id} not found`);
    const updated: TeamMember = normalizeTeamMember({
        ...existing,
        ...patch,
        // accessLevel follows the system roles when those are being set.
        accessLevel: patch.systemRoles ? (patch.systemRoles.includes("admin") ? "admin" : "standard") : (patch.accessLevel ?? existing.accessLevel),
        systemRoles:
            patch.systemRoles ??
            (patch.accessLevel && patch.accessLevel !== existing.accessLevel
                ? patch.accessLevel === "admin"
                    ? [...new Set<SystemRole>(["admin", ...existing.systemRoles])]
                    : existing.systemRoles.filter((r) => r !== "admin")
                : existing.systemRoles),
        updatedAt: new Date().toISOString(),
    });
    await fs.writeFile(fileFor(id), JSON.stringify(updated, null, 2), "utf8");
    return updated;
}

export async function deleteTeamMember(id: string): Promise<void> {
    try {
        await fs.unlink(fileFor(id));
    } catch {
        // ignore
    }
}
