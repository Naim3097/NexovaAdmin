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

const ROOT = devDataRoot();
const TEAM_DIR = path.join(ROOT, "team");

export const TEAM_ROLES = [
    "CEO",
    "Closer",
    "Frontend",
    "Backend",
    "UI/UX",
    "Content",
    "Ads",
    "SEO",
    "PM",
    "Other",
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

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
 * A function adds pages and duties — Pipeline for sales, approvals for an
 * account manager, Finance for finance — never permissions beyond "user".
 */
export const FUNCTIONS = ["account_manager", "sales", "finance"] as const;
export type TeamFunction = (typeof FUNCTIONS)[number];
export const FUNCTION_LABEL: Record<TeamFunction, string> = {
    account_manager: "Account manager",
    sales: "Sales",
    finance: "Contract & finance",
};
export function isFunction(v: string): v is TeamFunction {
    return (FUNCTIONS as readonly string[]).includes(v);
}

/**
 * Hours per week reserved for a hat that leaves no task behind (selling,
 * invoicing, managing). Delivery capacity = weekly hours − reserved hours.
 */
export const RESERVED_KEYS = ["management", ...FUNCTIONS] as const;
export type ReservedKey = (typeof RESERVED_KEYS)[number];
export const RESERVED_LABEL: Record<ReservedKey, string> = {
    management: "Management",
    account_manager: "Account management",
    sales: "Sales",
    finance: "Contracts & invoicing",
};
export function isReservedKey(v: string): v is ReservedKey {
    return (RESERVED_KEYS as readonly string[]).includes(v);
}

/** Default working hours per task type, used when a member has not set their own. */
export const DEFAULT_HOURS_BY_TYPE: Record<LineType, number> = {
    post: 2,
    campaign: 6,
    seo: 4,
    website: 8,
    branding: 6,
    custom: 2,
};
export const DEFAULT_WEEKLY_HOURS = 32;

export type TeamMember = {
    id: string;
    name: string;
    /** Company role — the job they do (self-editable on the profile). */
    role: TeamRole;
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
    /** Weekly hours reserved per hat (see RESERVED_KEYS); delivery capacity = weekly − these. */
    reservedHours: Partial<Record<ReservedKey, number>>;
    /**
     * The hours THIS person needs per task type ("a reel takes me 3h"). Every
     * task assigned to them is prefilled from here; they edit the task only
     * when it ran longer. Missing types fall back to DEFAULT_HOURS_BY_TYPE.
     */
    hoursByType: Partial<Record<LineType, number>>;
    /** Internal hourly cost (MYR), admin/finance only; 0 = not set. */
    costRateMyr: number;
    createdAt: string;
    updatedAt: string;
};

/** Round to the quarter hour; never negative. */
export function roundHours(h: number): number {
    const n = Number(h);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 4) / 4;
}

function normalizeHoursByType(raw: unknown): Partial<Record<LineType, number>> {
    const out: Partial<Record<LineType, number>> = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (isLineType(k)) {
            const h = roundHours(Number(v));
            if (h > 0) out[k] = h;
        }
    }
    return out;
}

function normalizeReserved(raw: unknown): Partial<Record<ReservedKey, number>> {
    const out: Partial<Record<ReservedKey, number>> = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (isReservedKey(k)) {
            const h = roundHours(Number(v));
            if (h > 0) out[k] = h;
        }
    }
    return out;
}

/** Hours per week left for delivery tasks after the reserved hats. Never below 0. */
export function deliveryWeeklyHours(m: Pick<TeamMember, "weeklyHours" | "reservedHours">): number {
    const reserved = Object.values(m.reservedHours ?? {}).reduce((s, h) => s + (h || 0), 0);
    return Math.max(0, roundHours((m.weeklyHours || DEFAULT_WEEKLY_HOURS) - reserved));
}

export function normalizeTeamMember(raw: Partial<TeamMember> & { id: string }): TeamMember {
    const now = new Date().toISOString();
    const accessLevel = raw.accessLevel === "admin" ? "admin" : "standard";
    // Legacy role names (account_manager / sales / finance / member) from the
    // first cut become functions + "user".
    const rawRoles = (raw.systemRoles ?? []) as string[];
    const legacyFunctions = rawRoles.filter(isFunction);
    const roles = rawRoles.filter(isSystemRole);
    const systemRoles: SystemRole[] =
        roles.length > 0 || legacyFunctions.length > 0 || rawRoles.includes("member")
            ? [...new Set<SystemRole>(roles.length > 0 ? roles : ["user"])]
            : accessLevel === "admin"
              ? ["admin", "management"]
              : ["user"];
    const functions = [...new Set([...(raw.functions ?? []).filter(isFunction), ...legacyFunctions])];
    return {
        id: raw.id,
        name: raw.name ?? "",
        role: raw.role && (TEAM_ROLES as readonly string[]).includes(raw.role) ? raw.role : "Other",
        email: raw.email ?? "",
        phone: raw.phone ?? "",
        skills: raw.skills ?? "",
        active: raw.active ?? true,
        userId: raw.userId ?? null,
        accessLevel: systemRoles.includes("admin") ? "admin" : "standard",
        systemRoles,
        functions,
        weeklyHours: roundHours(Number(raw.weeklyHours)) || DEFAULT_WEEKLY_HOURS,
        reservedHours: normalizeReserved(raw.reservedHours),
        hoursByType: normalizeHoursByType(raw.hoursByType),
        costRateMyr: Number(raw.costRateMyr) > 0 ? Number(raw.costRateMyr) : 0,
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
    email?: string;
    phone?: string;
    skills?: string;
    userId?: string | null;
    accessLevel?: "admin" | "standard";
    systemRoles?: SystemRole[];
    functions?: TeamFunction[];
    weeklyHours?: number;
    reservedHours?: Partial<Record<ReservedKey, number>>;
    hoursByType?: Partial<Record<LineType, number>>;
    costRateMyr?: number;
};

export function buildTeamMember(input: CreateTeamMemberInput): TeamMember {
    const now = new Date().toISOString();
    return normalizeTeamMember({
        id: randomUUID(),
        name: input.name,
        role: input.role ?? "Other",
        email: input.email ?? "",
        phone: input.phone ?? "",
        skills: input.skills ?? "",
        active: true,
        userId: input.userId ?? null,
        accessLevel: input.accessLevel ?? "standard",
        systemRoles: input.systemRoles,
        functions: input.functions,
        weeklyHours: input.weeklyHours,
        reservedHours: input.reservedHours,
        hoursByType: input.hoursByType,
        costRateMyr: input.costRateMyr,
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
