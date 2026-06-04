/**
 * Team members data adapter (single-table cutover).
 */
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import type { Database, TeamMemberRow } from "@/lib/supabase/types";
import { isSupabaseEnabled } from "@/lib/data/flag";
import * as devTeam from "@/lib/dev-store/team";

export { TEAM_ROLES } from "@/lib/dev-store/team";
export type { TeamMember, TeamRole } from "@/lib/dev-store/team";

type TeamMember = devTeam.TeamMember;
type TeamRole = devTeam.TeamRole;
type UpdatePatch = Partial<Omit<TeamMember, "id" | "createdAt">>;

type TeamInsert = Database["public"]["Tables"]["team_members"]["Insert"];
type TeamUpdate = Database["public"]["Tables"]["team_members"]["Update"];

const TABLE = "team_members" as const;

function rowToMember(row: TeamMemberRow): TeamMember {
    return {
        id: row.id,
        name: row.name,
        role: row.role as TeamRole,
        email: row.email,
        phone: row.phone,
        skills: row.skills,
        active: row.active,
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function memberToInsert(m: TeamMember): TeamInsert {
    return {
        id: m.id,
        name: m.name,
        role: m.role,
        email: m.email,
        phone: m.phone,
        skills: m.skills,
        active: m.active,
        user_id: m.userId,
        created_at: m.createdAt,
        updated_at: m.updatedAt,
    };
}

function patchToUpdate(patch: UpdatePatch): TeamUpdate {
    const out: TeamUpdate = {};
    if (patch.name !== undefined) out.name = patch.name;
    if (patch.role !== undefined) out.role = patch.role;
    if (patch.email !== undefined) out.email = patch.email;
    if (patch.phone !== undefined) out.phone = patch.phone;
    if (patch.skills !== undefined) out.skills = patch.skills;
    if (patch.active !== undefined) out.active = patch.active;
    if (patch.userId !== undefined) out.user_id = patch.userId;
    if (patch.updatedAt !== undefined) out.updated_at = patch.updatedAt;
    return out;
}

export async function createTeamMember(input: {
    name: string;
    role?: TeamRole;
    email?: string;
    phone?: string;
    skills?: string;
    userId?: string | null;
}): Promise<TeamMember> {
    if (!isSupabaseEnabled("team")) return devTeam.createTeamMember(input);
    const now = new Date().toISOString();
    const m: TeamMember = {
        id: randomUUID(),
        name: input.name,
        role: input.role ?? "Other",
        email: input.email ?? "",
        phone: input.phone ?? "",
        skills: input.skills ?? "",
        active: true,
        userId: input.userId ?? null,
        createdAt: now,
        updatedAt: now,
    };
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .insert(memberToInsert(m))
        .select("*")
        .single();
    if (error) throw new Error(`createTeamMember: ${error.message}`);
    return rowToMember(data as TeamMemberRow);
}

export async function listTeamMembers(): Promise<TeamMember[]> {
    if (!isSupabaseEnabled("team")) return devTeam.listTeamMembers();
    const sb = createServiceClient();
    const { data, error } = await sb.from(TABLE).select("*");
    if (error) throw new Error(`listTeamMembers: ${error.message}`);
    return (data as TeamMemberRow[]).map(rowToMember).sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}

export async function getTeamMemberById(
    id: string,
): Promise<TeamMember | null> {
    if (!isSupabaseEnabled("team")) return devTeam.getTeamMemberById(id);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(`getTeamMemberById: ${error.message}`);
    return data ? rowToMember(data as TeamMemberRow) : null;
}

export async function getTeamMemberByUserId(
    userId: string,
): Promise<TeamMember | null> {
    if (!isSupabaseEnabled("team")) return devTeam.getTeamMemberByUserId(userId);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw new Error(`getTeamMemberByUserId: ${error.message}`);
    return data ? rowToMember(data as TeamMemberRow) : null;
}

export async function updateTeamMember(
    id: string,
    patch: UpdatePatch,
): Promise<TeamMember> {
    if (!isSupabaseEnabled("team")) return devTeam.updateTeamMember(id, patch);
    const sb = createServiceClient();
    const { data, error } = await sb
        .from(TABLE)
        .update(patchToUpdate(patch))
        .eq("id", id)
        .select("*")
        .single();
    if (error) throw new Error(`updateTeamMember: ${error.message}`);
    return rowToMember(data as TeamMemberRow);
}

export async function deleteTeamMember(id: string): Promise<void> {
    if (!isSupabaseEnabled("team")) return devTeam.deleteTeamMember(id);
    const sb = createServiceClient();
    const { error } = await sb.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`deleteTeamMember: ${error.message}`);
}
