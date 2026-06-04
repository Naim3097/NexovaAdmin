import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/logo";
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
