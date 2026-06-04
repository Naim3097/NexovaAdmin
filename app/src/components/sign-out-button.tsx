import { LogOut } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";

/**
 * Server Action button — POSTs to the action via a small form so it works
 * without JS. Used in the admin sidebar footer.
 */
export function SignOutButton({
    variant = "icon",
}: {
    variant?: "icon" | "full";
}) {
    return (
        <form action={signOutAction}>
            {variant === "full" ? (
                <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <LogOut className="size-4" aria-hidden="true" />
                    Sign out
                </button>
            ) : (
                <button
                    type="submit"
                    aria-label="Sign out"
                    className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <LogOut className="size-4" aria-hidden="true" />
                </button>
            )}
        </form>
    );
}
