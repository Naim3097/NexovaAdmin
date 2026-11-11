import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentClient, getCurrentUser } from "@/lib/auth";
import { listClients } from "@/lib/data/clients";
import { listContentPosts } from "@/lib/data/content";
import { listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import {
    contractsOf,
    isDevBypass,
    linkedContentIds,
    postsWaitingFor,
    tasksWaitingFor,
} from "@/lib/portal/resolve-client";
import { PortalNav, type PortalWaiting } from "./portal-nav";

/**
 * What the Approvals badge shows: tasks + content posts waiting on the client
 * (exactly what /portal/approvals lists). A layout cannot read `?client=`, so
 * under the dev bypass it hands the nav a count per client and the nav picks
 * by the URL.
 */
async function waitingBadge(): Promise<{
    waiting: PortalWaiting;
    preview: boolean;
}> {
    const client = await getCurrentClient();
    const preview = !client && isDevBypass();
    if (!client && !preview) return { waiting: 0, preview: false };
    const [contracts, works, posts] = await Promise.all([
        listContracts(),
        listWorks(),
        listContentPosts(),
    ]);
    const countFor = (c: { name: string }) => {
        const waitingTasks = tasksWaitingFor(works, contractsOf(contracts, c));
        return waitingTasks.length + postsWaitingFor(posts, c, linkedContentIds(waitingTasks)).length;
    };
    if (client) return { waiting: countFor(client), preview: false };
    const clients = await listClients();
    return {
        waiting: Object.fromEntries(
            clients.map((c) => [c.name.trim().toLowerCase(), countFor(c)]),
        ),
        preview: true,
    };
}

export default async function PortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/portal-login");
    const { waiting, preview } = await waitingBadge();

    return (
        <div className="canvas-glow flex min-h-dvh flex-col bg-background">
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl">
                <span className="font-semibold">NexOps Portal</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
            </header>
            <main className="flex-1 overflow-y-auto p-4 pb-28">
                <div className="mx-auto w-full max-w-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
                    {children}
                </div>
            </main>
            <Suspense fallback={null}>
                <PortalNav waiting={waiting} preview={preview} />
            </Suspense>
        </div>
    );
}
