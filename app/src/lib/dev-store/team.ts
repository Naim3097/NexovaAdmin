/**
 * DEV-ONLY local file store for team members.
 * Replaced by Supabase `users` + `roles` + `skills` once provisioned.
 *
 * Roles are kept as a free-string ENUM-like list (not a hard enum) so the
 * agency can add roles later (CTO, Copywriter, etc.) without migrations.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.join(process.cwd(), ".dev-data");
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

export type TeamMember = {
    id: string;
    name: string;
    role: TeamRole;
    email: string;
    phone: string;
    skills: string; // comma-separated for now
    active: boolean;
    createdAt: string;
    updatedAt: string;
};

async function ensureDir() {
    await fs.mkdir(TEAM_DIR, { recursive: true });
}

function fileFor(id: string) {
    return path.join(TEAM_DIR, `${id}.json`);
}

export async function createTeamMember(input: {
    name: string;
    role?: TeamRole;
    email?: string;
    phone?: string;
    skills?: string;
}): Promise<TeamMember> {
    await ensureDir();
    const now = new Date().toISOString();
    const m: TeamMember = {
        id: randomUUID(),
        name: input.name,
        role: input.role ?? "Other",
        email: input.email ?? "",
        phone: input.phone ?? "",
        skills: input.skills ?? "",
        active: true,
        createdAt: now,
        updatedAt: now,
    };
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
        out.push(JSON.parse(raw) as TeamMember);
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
        return JSON.parse(raw) as TeamMember;
    } catch {
        return null;
    }
}

export async function updateTeamMember(
    id: string,
    patch: Partial<Omit<TeamMember, "id" | "createdAt">>,
): Promise<TeamMember> {
    const existing = await getTeamMemberById(id);
    if (!existing) throw new Error(`Team member ${id} not found`);
    const updated: TeamMember = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
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
