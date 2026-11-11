"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTING_AS_COOKIE } from "@/lib/auth";
import { listTeamMembers } from "@/lib/data/team";
import { homeFor } from "@/lib/roles";

/**
 * DEV_AUTH_BYPASS only. There is no login, so the sidebar picker remembers who
 * this browser acts as in a cookie that `getActingMember()` falls back to when
 * a page received no `?as=`. With a real login the linked member always wins,
 * so outside the bypass these just bounce home.
 */
function bypassEnabled() {
    return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_BYPASS === "1";
}

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** Remember the picked member (by name) and land on their home. */
export async function setActingMemberAction(formData: FormData) {
    if (!bypassEnabled()) redirect("/");
    const want = String(formData.get("as") ?? "").trim().toLowerCase();
    const team = await listTeamMembers().catch(() => []);
    const member = want ? team.find((m) => m.name.trim().toLowerCase() === want) : undefined;
    const jar = await cookies();
    if (!member) {
        // Nothing (or an unknown name) picked: forget any previous pick and
        // stay on the all-access dashboard rather than guessing.
        jar.delete(ACTING_AS_COOKIE);
        redirect("/dashboard");
    }
    jar.set(ACTING_AS_COOKIE, member.name, {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        maxAge: THIRTY_DAYS,
    });
    redirect(homeFor(member));
}

/** Forget the pick. The dashboard then shows the picker again with everything visible. */
export async function clearActingMemberAction() {
    const jar = await cookies();
    jar.delete(ACTING_AS_COOKIE);
    redirect("/dashboard");
}
