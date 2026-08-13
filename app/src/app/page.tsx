import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="space-y-4">
        <div className="flex justify-center">
          <Logo className="h-8 sm:h-10" />
        </div>
        <h1 className="text-3xl font-semibold sm:text-5xl">
          Operations & Client Portal
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground sm:text-base">
          Internal tool for the NexOps team and clients. Sign in to continue.
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
