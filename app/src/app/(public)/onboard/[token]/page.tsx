import { notFound } from "next/navigation";
import { getSubmissionByToken } from "@/lib/data/onboarding";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const submission = await getSubmissionByToken(token);
    if (!submission) notFound();

    if (submission.status === "submitted") {
        return (
            <div className="mx-auto max-w-2xl p-6">
                <div className="rounded-lg border bg-card p-6 text-center">
                    <h1 className="text-2xl font-semibold">Thanks, {submission.clientName}!</h1>
                    <p className="mt-2 text-muted-foreground">
                        Your onboarding details have been received. Our team will
                        be in touch shortly to kick off the build.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl p-4 md:p-6">
            <header className="mb-6">
                <h1 className="text-2xl font-semibold md:text-3xl">
                    Welcome, {submission.clientName}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Tell us about your business so we can start building your
                    website. You can save and come back later — this link stays
                    valid.
                </p>
            </header>
            <OnboardingForm
                token={token}
                initialData={submission.data}
                logo={(submission.files.logo as { url: string; name: string } | undefined) ?? null}
                photos={(submission.files.photos as { url: string; name: string }[] | undefined) ?? []}
            />
        </div>
    );
}
