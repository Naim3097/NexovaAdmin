"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    createTeamMember,
    deleteTeamMember,
    TEAM_ROLES,
    updateTeamMember,
    type TeamRole,
} from "@/lib/data/team";

function asRole(v: FormDataEntryValue | null): TeamRole {
    const s = String(v ?? "");
    return (TEAM_ROLES as readonly string[]).includes(s)
        ? (s as TeamRole)
        : "Other";
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
