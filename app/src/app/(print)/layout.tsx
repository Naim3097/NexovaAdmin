import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Minimal layout for print/share routes — no sidebar, no nav chrome.
 * Auth is still required (same getCurrentUser as the admin layout).
 * Pages here are designed to look right both on screen and through
 * the browser's "Print to PDF" dialog.
 */
export default async function PrintLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    return <div className="min-h-dvh bg-background">{children}</div>;
}
