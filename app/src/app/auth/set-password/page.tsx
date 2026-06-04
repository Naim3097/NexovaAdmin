"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Where invited teammates land after clicking their one-time link. The auth
 * callback has already exchanged the code for a session, so here we just let
 * them choose a password, then send them into the app.
 */
export default function SetPasswordPage() {
    const router = useRouter();
    const [checking, setChecking] = useState(true);
    const [hasSession, setHasSession] = useState(false);
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data }) => {
            setHasSession(!!data.user);
            setChecking(false);
        });
    }, []);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (password.length < 8) {
            setError("Use at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            setError("Passwords don't match.");
            return;
        }
        setPending(true);
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password });
        setPending(false);
        if (error) {
            setError(error.message);
            return;
        }
        router.replace("/dashboard");
    }

    return (
        <main className="flex min-h-dvh items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-1 text-center">
                    <h1 className="text-xl font-semibold">Set your password</h1>
                    <p className="text-sm text-muted-foreground">
                        Choose a password to finish setting up your account.
                    </p>
                </div>

                {checking ? (
                    <p className="text-center text-sm text-muted-foreground">
                        Checking your link…
                    </p>
                ) : !hasSession ? (
                    <p className="text-center text-sm text-destructive">
                        This link has expired or already been used. Ask your
                        admin to send a fresh invite link.
                    </p>
                ) : (
                    <form onSubmit={onSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">New password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="new-password"
                                required
                                minLength={8}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirm">Confirm password</Label>
                            <Input
                                id="confirm"
                                type="password"
                                autoComplete="new-password"
                                required
                                minLength={8}
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                className="h-11"
                            />
                        </div>
                        <Button
                            type="submit"
                            className="h-11 w-full"
                            disabled={pending}
                        >
                            {pending ? "Saving…" : "Save password & continue"}
                        </Button>
                        {error ? (
                            <p role="status" className="text-sm text-destructive">
                                {error}
                            </p>
                        ) : null}
                    </form>
                )}
            </div>
        </main>
    );
}
