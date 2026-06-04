import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string; error?: string }>;
}) {
    const sp = await searchParams;
    const next = sp.next ?? "/dashboard";

    // If already signed in, bounce to the requested destination.
    const user = await getCurrentUser();
    if (user) redirect(next);

    return (
        <main className="flex min-h-dvh items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6 shadow-sm">
                <div className="space-y-1 text-center">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        Nexova
                    </p>
                    <h1 className="text-2xl font-semibold">Sign in</h1>
                    <p className="text-sm text-muted-foreground">
                        Sign in with your email and password.
                    </p>
                </div>

                {sp.error ? (
                    <p
                        role="alert"
                        className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    >
                        {sp.error}
                    </p>
                ) : null}

                <LoginForm next={next} />

                <p className="text-center text-xs text-muted-foreground">
                    <Link href="/" className="hover:underline">
                        Back to home
                    </Link>
                </p>
            </div>
        </main>
    );
}
