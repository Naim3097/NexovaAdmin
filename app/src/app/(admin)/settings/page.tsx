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

    // Going-live setup status — read straight from env so the team can see at a
    // glance what external configuration is still pending.
    const has = (v: string | undefined) => !!v && v.trim().length > 0;
    const resendFrom = process.env.RESEND_FROM ?? "";
    const setupChecks: Array<{
        label: string;
        state: "ok" | "warn" | "todo";
        detail: string;
    }> = [
        {
            label: "AI (Gemini)",
            state: has(process.env.GEMINI_API_KEY) ? "ok" : "todo",
            detail: has(process.env.GEMINI_API_KEY)
                ? "Key set — briefs & summaries live."
                : "Set GEMINI_API_KEY.",
        },
        {
            label: "Client email (Resend)",
            state: !has(process.env.RESEND_API_KEY)
                ? "todo"
                : resendFrom.includes("resend.dev") || resendFrom === ""
                  ? "warn"
                  : "ok",
            detail: !has(process.env.RESEND_API_KEY)
                ? "Set RESEND_API_KEY."
                : resendFrom.includes("resend.dev") || resendFrom === ""
                  ? "Test domain — only reaches your own inbox. Verify a custom domain + set RESEND_FROM."
                  : `Sending as ${resendFrom}.`,
        },
        {
            label: "Payments (LeanX)",
            state:
                has(process.env.LEANX_AUTH_TOKEN) &&
                has(process.env.LEANX_COLLECTION_UUID) &&
                has(process.env.LEANX_HASH_KEY)
                    ? "ok"
                    : "todo",
            detail:
                has(process.env.LEANX_AUTH_TOKEN) &&
                has(process.env.LEANX_COLLECTION_UUID) &&
                has(process.env.LEANX_HASH_KEY)
                    ? "Credentials set — payment links live."
                    : "Complete KYC, then set LEANX_AUTH_TOKEN, LEANX_COLLECTION_UUID, LEANX_HASH_KEY.",
        },
        {
            label: "Telegram alerts",
            state:
                has(process.env.TELEGRAM_BOT_TOKEN) &&
                has(process.env.TELEGRAM_TEAM_CHAT_ID)
                    ? "ok"
                    : "todo",
            detail:
                has(process.env.TELEGRAM_BOT_TOKEN) &&
                has(process.env.TELEGRAM_TEAM_CHAT_ID)
                    ? "Bot + chat set."
                    : "Set TELEGRAM_BOT_TOKEN + TELEGRAM_TEAM_CHAT_ID.",
        },
    ];

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

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4">
                    <p className="text-sm font-medium">Setup status</p>
                    <p className="text-xs text-muted-foreground">
                        External services needed to go fully live. Staff invite
                        emails also need Supabase Auth SMTP configured (see docs).
                    </p>
                </div>
                <ul className="divide-y">
                    {setupChecks.map((c) => (
                        <li
                            key={c.label}
                            className="flex items-start justify-between gap-3 p-4"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium">{c.label}</p>
                                <p className="text-xs text-muted-foreground">
                                    {c.detail}
                                </p>
                            </div>
                            <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    c.state === "ok"
                                        ? "bg-green-500/15 text-green-700 dark:text-green-400"
                                        : c.state === "warn"
                                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                          : "bg-muted text-muted-foreground"
                                }`}
                            >
                                {c.state === "ok"
                                    ? "ready"
                                    : c.state === "warn"
                                      ? "test mode"
                                      : "todo"}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
