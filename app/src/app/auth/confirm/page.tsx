import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { confirmLinkAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Landing page for one-time invite / recovery links.
 *
 * Shows a single "Continue" button rather than verifying on page load. Link
 * previews (WhatsApp, Telegram, Slack, mail scanners) only issue GET requests,
 * so the token survives being shared in a chat; verification happens on the
 * POST behind the button, i.e. when a real person taps it.
 */
export default async function ConfirmPage({
    searchParams,
}: {
    searchParams: Promise<{
        token_hash?: string;
        type?: string;
        next?: string;
    }>;
}) {
    const sp = await searchParams;
    const tokenHash = sp.token_hash ?? "";
    const type = sp.type ?? "";
    const next = sp.next ?? "/dashboard";

    if (!tokenHash || !type) redirect("/login?error=link");

    return (
        <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
            <div className="w-full max-w-sm">
                <div className="mb-6 flex justify-center">
                    <Logo className="h-7" />
                </div>
                <div className="space-y-5 rounded-xl border bg-card p-8 shadow-md">
                    <div className="space-y-1 text-center">
                        <h1 className="text-xl font-semibold tracking-tight">
                            Welcome to Nexov Admin
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Tap continue to set your password. This link works
                            once and signs you in as yourself, even if someone
                            else used this browser before.
                        </p>
                    </div>
                    <form action={confirmLinkAction}>
                        <input
                            type="hidden"
                            name="token_hash"
                            value={tokenHash}
                        />
                        <input type="hidden" name="type" value={type} />
                        <input type="hidden" name="next" value={next} />
                        <Button type="submit" size="lg" className="w-full">
                            Continue
                        </Button>
                    </form>
                    <p className="text-center text-xs text-muted-foreground">
                        Didn&apos;t expect this? You can close this page safely.
                    </p>
                </div>
            </div>
        </main>
    );
}
