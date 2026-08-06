import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, FileText, ClipboardList, Receipt, Images } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

const NAV = [
    { href: "/portal", label: "Home", icon: Home },
    { href: "/portal/content", label: "Content", icon: Images },
    { href: "/portal/reports", label: "Reports", icon: FileText },
    { href: "/portal/billing", label: "Billing", icon: Receipt },
    { href: "/portal/onboarding", label: "Forms", icon: ClipboardList },
];

export default async function PortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/portal-login");

    return (
        <div className="canvas-glow flex min-h-dvh flex-col bg-background">
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl">
                <span className="font-semibold">NexOps Portal</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
            </header>
            <main className="flex-1 overflow-y-auto p-4 pb-24">
                <div className="mx-auto w-full max-w-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
                    {children}
                </div>
            </main>
            <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-border/60 bg-background/70 backdrop-blur-xl">
                {NAV.map(({ href, label, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className="flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <Icon className="size-5" />
                        {label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
