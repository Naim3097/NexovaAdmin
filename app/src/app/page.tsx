import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Nexova
        </p>
        <h1 className="text-3xl font-semibold sm:text-5xl">
          Operations & Client Portal
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
          Internal tool for the Nexova team and clients. Sign in to continue.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/portal" className={buttonVariants({ size: "lg" })}>
          Client login
        </Link>
        <Link
          href="/login"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          Team sign in
        </Link>
      </div>
    </main>
  );
}
