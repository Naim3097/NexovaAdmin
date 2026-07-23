import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentClient, getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LoginForm } from "../login/login-form";
import { signOutAndSwitch } from "../login/actions";

/**
 * Client-facing login. Same Supabase auth as the agency /login, but branded for
 * clients and lands them in their portal. Logged-out clients hitting /portal are
 * redirected here by the portal layout.
 */
export default async function PortalLoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const sp = await searchParams;

    // Already signed in? Only CLIENTS pass through — a staff session on the
    // client door gets an explicit switch screen (mirror of /login).
    const user = await getCurrentUser();
    if (user) {
        const client = await getCurrentClient();
        if (client) redirect("/portal");
        return (
            <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
                <div className="w-full max-w-sm">
                    <div className="mb-6 flex justify-center">
                        <Logo className="h-7" />
                    </div>
                    <div className="space-y-4 rounded-xl border bg-card p-8 shadow-md">
                        <h1 className="text-center text-xl font-semibold tracking-tight">
                            Client sign in
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            This browser is signed in as{" "}
                            <strong>team ({user.email})</strong>. To sign in as a
                            client, that session has to end first (it will log
                            out any open admin tabs).
                        </p>
                        <form action={signOutAndSwitch}>
                            <input type="hidden" name="to" value="/portal-login" />
                            <Button type="submit" className="w-full">
                                Sign out &amp; continue to client sign in
                            </Button>
                        </form>
                        <Link
                            href="/dashboard"
                            className="block text-center text-sm text-muted-foreground hover:underline"
                        >
                            Stay signed in — go to the dashboard
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    const errorMessage =
        sp.error === "link"
            ? "This link has expired or was already used. Ask your agency for a new one."
            : sp.error === "auth"
              ? "We couldn't verify that link. Please try again, or ask for a new one."
              : sp.error;

    return (
        <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
            <div className="w-full max-w-sm">
                <div className="mb-6 flex justify-center">
                    <Logo className="h-7" />
                </div>
                <div className="space-y-6 rounded-xl border bg-card p-8 shadow-md">
                    <div className="space-y-1 text-center">
                        <h1 className="text-xl font-semibold tracking-tight">
                            Your content portal
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Sign in to review, approve, and request content.
                        </p>
                    </div>

                    {errorMessage ? (
                        <p
                            role="alert"
                            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                        >
                            {errorMessage}
                        </p>
                    ) : null}

                    <LoginForm next="/portal" />
                </div>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                    Need access? Ask your agency for an invite link.
                </p>
            </div>
        </main>
    );
}
