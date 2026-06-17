import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, FileText, Folder, Receipt, Images } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

const NAV = [
    { href: "/portal", label: "Home", icon: Home },
    { href: "/portal/content", label: "Content", icon: Images },
    { href: "/portal/billing", label: "Billing", icon: Receipt },
    { href: "/portal/onboarding", label: "Forms", icon: FileText },
    { href: "/portal/projects", label: "Projects", icon: Folder },
];

export default async function PortalLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/portal-login");

    return (
        <div className="flex min-h-dvh flex-col">
            <header className="flex h-14 items-center justify-between border-b bg-card px-4">
                <span className="font-semibold">Nexova Portal</span>
                <span className="text-xs text-muted-foreground">{user.email}</span>
            </header>
            <main className="flex-1 overflow-y-auto p-4 pb-24">{children}</main>
            <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t bg-background">
                {NAV.map(({ href, label, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                        <Icon className="size-5" />
                        {label}
                    </Link>
                ))}
            </nav>
        </div>
    );
}
