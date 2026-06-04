import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
    return (
        <main className="flex min-h-dvh items-center justify-center p-6">
            <div className="w-full max-w-md space-y-4 text-center">
                <p className="text-5xl font-semibold tracking-tight">404</p>
                <div className="space-y-1">
                    <h1 className="text-base font-semibold">Page not found</h1>
                    <p className="text-sm text-muted-foreground">
                        That page doesn&apos;t exist or may have moved.
                    </p>
                </div>
                <Link href="/dashboard" className={buttonVariants()}>
                    Back to dashboard
                </Link>
            </div>
        </main>
    );
}
