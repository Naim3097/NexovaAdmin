/**
 * The acting person as the board, calendar and quick edit see them. Server
 * pages build it from the acting member and hand it to client components.
 */
import type { TeamMember } from "@/lib/data/team";
import { isManager } from "@/lib/roles";
import type { Actor } from "@/lib/works/transitions";

/** Nobody picked (the dev bypass with no acting member) acts as management, like the pages do. */
export function actorOf(member: Pick<TeamMember, "name" | "systemRoles"> | null | undefined): Actor {
    return { name: member?.name ?? "", manager: !member || isManager(member) };
}
