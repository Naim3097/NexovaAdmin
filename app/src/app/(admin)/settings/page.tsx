import Link from "next/link";
import {
    Building2,
    Boxes,
    UserCog,
    SlidersHorizontal,
} from "lucide-react";
import { listClients } from "@/lib/data/clients";
import { listServices } from "@/lib/data/services";
import { listTeamMembers } from "@/lib/data/team";
import { getAgencyProfile } from "@/lib/data/agency";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
    const [clients, services, team, agency] = await Promise.all([
        listClients(),
        listServices(),
        listTeamMembers(),
        getAgencyProfile(),
    ]);

    const agencyConfigured =
        agency.updatedAt > new Date(0).toISOString();

    const cards = [
        {
            href: "/settings/clients",
            label: "Clients",
            count: `${clients.length} record${clients.length === 1 ? "" : "s"}`,
            description:
                "Profile, contact, status. Linked by name to leads / projects / content / invoices.",
            icon: Building2,
        },
        {
            href: "/settings/services",
            label: "Services catalog",
            count: `${services.filter((s) => s.active).length} active`,
            description:
                "Default offerings + unit pricing (MYR). Used as suggestions on new invoices.",
            icon: Boxes,
        },
        {
            href: "/team",
            label: "Team",
            count: `${team.filter((m) => m.active).length} active`,
            description:
                "Members, roles, contact. Source of assignee dropdowns across the app.",
            icon: UserCog,
        },
        {
            href: "/settings/agency",
            label: "Agency profile",
            count: agencyConfigured ? "configured" : "not set",
            description:
                "Legal name, SST no., contact, address, bank details, default invoice footer. Used on invoice headers and exported reports.",
            icon: SlidersHorizontal,
        },
    ];

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold md:text-3xl">Settings</h1>
                <p className="text-sm text-muted-foreground">
                    Structured directories that everything else references.
                </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {cards.map(({ href, label, count, description, icon: Icon }) => {
                    const isPlaceholder = href === "#";
                    const className = `block rounded-lg border bg-card p-5 transition-colors ${isPlaceholder
                        ? "opacity-60"
                        : "hover:bg-accent"
                        }`;
                    const inner = (
                        <>
                            <div className="flex items-start justify-between gap-3">
                                <Icon className="size-5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">
                                    {count}
                                </span>
                            </div>
                            <p className="mt-3 font-medium">{label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {description}
                            </p>
                        </>
                    );
                    if (isPlaceholder) {
                        return (
                            <div key={label} className={className}>
                                {inner}
                            </div>
                        );
                    }
                    return (
                        <Link key={label} href={href} className={className}>
                            {inner}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
