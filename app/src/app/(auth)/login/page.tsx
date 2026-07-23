import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentClient, getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { LoginForm } from "./login-form";
import { signOutAndSwitch } from "./actions";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; error?: string }>;
}) {
    const sp = await searchParams;
    const next = sp.next ?? "/dashboard";

    // Already signed in? Only bounce STAFF through — a client session on the
    // team door gets an explicit switch screen instead of silently landing in
    // their portal (one browser = one session; switching must end it).
    const user = await getCurrentUser();
    if (user) {
        const client = await getCurrentClient();
        if (!client) redirect(next);
        return (
            <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
                <div className="w-full max-w-sm">
                    <div className="mb-6 flex justify-center">
                        <Logo className="h-7" />
                    </div>
                    <div className="space-y-4 rounded-xl border bg-card p-8 shadow-md">
                        <h1 className="text-center text-xl font-semibold tracking-tight">
                            Team sign in
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            This browser is signed in to the{" "}
                            <strong>client portal</strong> as{" "}
                            <strong>{client.name}</strong>. To sign in as team,
                            that session has to end first (it will log out any
                            open portal tabs).
                        </p>
                        <form action={signOutAndSwitch}>
                            <input
                                type="hidden"
                                name="to"
                                value={`/login?next=${encodeURIComponent(next)}`}
                            />
                            <Button type="submit" className="w-full">
                                Sign out &amp; continue to team sign in
                            </Button>
                        </form>
                        <Link
                            href="/portal"
                            className="block text-center text-sm text-muted-foreground hover:underline"
                        >
                            Stay signed in — go to the client portal
                        </Link>
                    </div>
                </div>
            </main>
        );
    }

    const errorMessage =
        sp.error === "link"
            ? "This link has expired or was already used. Ask your admin for a new invite link."
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
                            Sign in
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Welcome back. Enter your details to continue.
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

                    <LoginForm next={next} />
                </div>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                    <Link href="/" className="hover:text-foreground hover:underline">
                        Back to home
                    </Link>
                </p>
            </div>
        </main>
    );
}
