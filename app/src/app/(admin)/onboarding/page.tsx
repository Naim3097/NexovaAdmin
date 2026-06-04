import Link from "next/link";
import { listSubmissions } from "@/lib/data/onboarding";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createOnboardingLinkAction } from "@/lib/onboarding/actions";
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

export default async function OnboardingListPage() {
    const submissions = await listSubmissions();

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold md:text-3xl">Onboarding</h1>
                    <p className="text-sm text-muted-foreground">
                        Send a client a link to fill in their website brief.
                    </p>
                </div>
            </div>

            <form
                action={createOnboardingLinkAction}
                className="flex flex-col gap-2 rounded-lg border bg-card p-4 md:flex-row md:items-end"
            >
                <div className="flex-1 space-y-1.5">
                    <label className="text-sm font-medium">Client name</label>
                    <Input name="clientName" list="clients-datalist" placeholder="e.g. Lean.x Sdn Bhd" required />
                </div>
                <Button type="submit" className="md:w-auto">
                    Create onboarding link
                </Button>
            </form>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">Recent submissions</div>
                {submissions.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">
                        No submissions yet. Create one above.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {submissions.map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-4 p-4">
                                <div>
                                    <Link
                                        href={`/onboarding/${s.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {s.clientName}
                                    </Link>
                                    <p className="text-xs text-muted-foreground">
                                        Created {new Date(s.createdAt).toLocaleString()}
                                    </p>
                                </div>
                                <Badge
                                    variant={s.status === "submitted" ? "default" : "secondary"}
                                >
                                    {s.status}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
