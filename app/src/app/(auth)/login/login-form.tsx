"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type LoginState } from "./actions";

const initial: LoginState = { ok: false };

export function LoginForm({ next }: { next: string }) {
    const [state, formAction, pending] = useActionState(signIn, initial);

    return (
        <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    placeholder="you@example.com"
                    className="h-10"
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={6}
                    placeholder="Your password"
                    className="h-10"
                />
            </div>
            <Button type="submit" className="h-10 w-full" disabled={pending}>
                {pending ? "Signing in…" : "Sign in"}
            </Button>
            {state.message ? (
                <p
                    role="status"
                    className={`text-sm ${state.ok ? "text-green-600" : "text-destructive"}`}
                >
                    {state.message}
                </p>
            ) : null}
            <p className="text-center text-xs text-muted-foreground">
                No account? Ask your admin to add you.
            </p>
        </form>
    );
}
