import Link from "next/link";
import { TEAM_ROLES, listTeamMembers } from "@/lib/data/team";
import { Badge } from "@/components/ui/badge";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
    const members = await listTeamMembers();
    const active = members.filter((m) => m.active).length;
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Team</h1>
                    <p className="text-sm text-muted-foreground">
                        {active} active · {members.length} total
                    </p>
                </div>
                <Link
                    href="/my-work"
                    className="text-sm font-medium underline"
                >
                    My work →
                </Link>
            </div>

            <InviteForm roles={TEAM_ROLES} />

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">Members</div>
                {members.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No members yet.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {members.map((m) => (
                            <li
                                key={m.id}
                                className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/team/${m.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {m.name}
                                    </Link>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {m.role}
                                        {m.email ? ` · ${m.email}` : ""}
                                        {m.skills ? ` · ${m.skills}` : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Link
                                        href={`/my-work?member=${encodeURIComponent(m.name)}`}
                                        className="text-xs underline text-muted-foreground"
                                    >
                                        Their work →
                                    </Link>
                                    <Badge variant={m.userId ? "secondary" : "outline"}>
                                        {m.userId ? "has login" : "no login"}
                                    </Badge>
                                    <Badge variant={m.active ? "default" : "outline"}>
                                        {m.active ? "active" : "inactive"}
                                    </Badge>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
