import { notFound } from "next/navigation";
import { getSubmissionByToken } from "@/lib/data/onboarding";
import { OnboardingForm } from "./onboarding-form";
import { MerchantForm } from "./merchant-form";

export const dynamic = "force-dynamic";

type StoredFile = { url: string; name: string };

export default async function OnboardPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const submission = await getSubmissionByToken(token);
    if (!submission) notFound();

    const isMerchant = submission.checklistSlug === "merchant-registration";

    if (submission.status === "submitted") {
        return (
            <div className="mx-auto max-w-2xl p-6">
                <div className="rounded-lg border bg-card p-6 text-center">
                    <h1 className="text-2xl font-semibold">Thanks, {submission.clientName}!</h1>
                    <p className="mt-2 text-muted-foreground">
                        {isMerchant
                            ? "Your registration has been received. We'll verify your details within 1–2 business days and let you know when you're live."
                            : "Your onboarding details have been received. Our team will be in touch shortly to kick off the build."}
                    </p>
                </div>
            </div>
        );
    }

    if (isMerchant) {
        // Documents are single files; product materials accumulate as an array.
        const files: Record<string, StoredFile> = {};
        let materials: StoredFile[] = [];
        for (const [key, value] of Object.entries(submission.files)) {
            if (!value) continue;
            if (Array.isArray(value)) {
                if (key === "product_materials") {
                    materials = value.map((v) => ({ url: v.url, name: v.name }));
                }
            } else {
                files[key] = { url: value.url, name: value.name };
            }
        }
        return (
            <div className="mx-auto max-w-xl p-4 md:p-6">
                <MerchantForm
                    token={token}
                    clientName={submission.clientName}
                    initialData={submission.data}
                    initialFiles={files}
                    initialMaterials={materials}
                />
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
