"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    appendUploads,
    createSubmission,
    deleteSubmission,
    getSubmissionById,
    getSubmissionByToken,
    regenerateToken,
    saveUpload,
    updateSubmission,
    type UploadedFile,
} from "@/lib/data/onboarding";
import { createProject, instantiateProjectStages } from "@/lib/data/projects";
import { onboardingFormSchema } from "@/lib/onboarding/schema";
import { notify } from "@/lib/data/notifications";
import { aiSummariseSubmission, emailSendOnboardingLink } from "@/lib/agent/tools";
import { headers } from "next/headers";
import {
    SERVICE_CATEGORIES,
    type ServiceCategory,
} from "@/lib/dev-store/services";

function asServiceCategory(v: FormDataEntryValue | null): ServiceCategory {
    const s = String(v ?? "").trim();
    return (SERVICE_CATEGORIES as readonly string[]).includes(s)
        ? (s as ServiceCategory)
        : "website";
}

/**
 * Run the AI summariser against a submission and persist the result under
 * `data._ai`. Retries once on failure (Gemini 503s are common, usually
 * transient). Catches and logs final failure — the caller still gets the
 * submission, the UI shows the error + a Regenerate button.
 */
async function generateAndStoreSummary(submissionId: string) {
    const sub = await getSubmissionById(submissionId);
    if (!sub) return;

    const attempt = () =>
        aiSummariseSubmission.invoke({
            clientName: sub.clientName,
            serviceType: "Website Creation",
            submission: sub.data,
        });

    try {
        let summary;
        try {
            summary = await attempt();
        } catch (firstErr) {
            // Most Gemini failures are transient overload — give it one quick retry.
            // eslint-disable-next-line no-console
            console.warn(
                "AI summary first attempt failed, retrying in 2s:",
                (firstErr as Error).message,
            );
            await new Promise((r) => setTimeout(r, 2000));
            summary = await attempt();
        }
        await updateSubmission(submissionId, {
            data: {
                ...sub.data,
                _ai: {
                    ...summary,
                    generatedAt: new Date().toISOString(),
                },
            },
        });
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error("AI summary failed for submission", submissionId, e);
        await updateSubmission(submissionId, {
            data: {
                ...sub.data,
                _ai: {
                    error: (e as Error).message,
                    generatedAt: new Date().toISOString(),
                },
            },
        });
    }
}

export type FormState = {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string[]>;
};

// ---------- public form ----------

function parseFormFields(formData: FormData) {
    const obj: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
        // Skip Next.js Server Action internals ($ACTION_ID, $ACTION_REF_*, etc.).
        // They leak into FormData when using <form action={serverAction}>.
        if (key.startsWith("$")) continue;
        if (typeof value === "string") obj[key] = value;
    }
    // Strip empty rows from repeater JSON strings — users often add a row
    // then leave it blank. Empty rows would fail validation noisily.
    for (const k of ["services_json", "team_json", "testimonials_json", "faq_json"]) {
        if (obj[k]) obj[k] = filterEmptyRows(obj[k]);
    }
    return obj;
}

/**
 * Given a JSON-encoded array of objects, remove rows where ALL values are
 * empty strings (after trimming). Returns the re-stringified array, or the
 * original string if parsing fails (caller's zod will surface that error).
 */
function filterEmptyRows(raw: string): string {
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return raw;
        const filtered = parsed.filter((row) => {
            if (!row || typeof row !== "object") return false;
            return Object.values(row as Record<string, unknown>).some(
                (v) => typeof v === "string" && v.trim() !== "",
            );
        });
        return JSON.stringify(filtered);
    } catch {
        return raw;
    }
}

async function handleUploads(submissionId: string, formData: FormData) {
    const filesPatch: Record<string, UploadedFile> = {};

    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > 0) {
        filesPatch.logo = await saveUpload(submissionId, logo);
    }

    // Multi-file: photos
    const photos = formData
        .getAll("photos")
        .filter((f): f is File => f instanceof File && f.size > 0);
    if (photos.length > 0) {
        const uploaded = await Promise.all(
            photos.map((p) => saveUpload(submissionId, p)),
        );
        await appendUploads(submissionId, "photos", uploaded);
    }

    return filesPatch;
}

export async function saveDraftAction(
    token: string,
    _prev: FormState,
    formData: FormData,
): Promise<FormState> {
    const sub = await getSubmissionByToken(token);
    if (!sub) return { ok: false, message: "Invalid link" };

    const raw = parseFormFields(formData);
    const filesPatch = await handleUploads(sub.id, formData);

    await updateSubmission(sub.id, {
        data: { ...sub.data, ...raw },
        files: filesPatch,
    });
    revalidatePath(`/onboard/${token}`);
    return { ok: true, message: "Draft saved" };
}

export async function submitOnboardingAction(
    token: string,
    _prev: FormState,
    formData: FormData,
): Promise<FormState> {
    const sub = await getSubmissionByToken(token);
    if (!sub) return { ok: false, message: "Invalid link" };

    const raw = parseFormFields(formData);
    const filesPatch = await handleUploads(sub.id, formData);
    const parsed = onboardingFormSchema.safeParse(raw);

    if (!parsed.success) {
        await updateSubmission(sub.id, {
            data: { ...sub.data, ...raw },
            files: filesPatch,
        });
        // Revalidate so the form remounts with the just-saved data — preserves
        // everything the client typed even when validation fails.
        revalidatePath(`/onboard/${token}`);
        return {
            ok: false,
            message: "Please fix the errors below.",
            fieldErrors: zodFlatten(parsed.error),
        };
    }

    // Persist the parsed (typed) values; raw strings for repeaters are kept too
    await updateSubmission(sub.id, {
        data: { ...sub.data, ...raw },
        files: filesPatch,
        status: "submitted",
        submittedAt: new Date().toISOString(),
    });
    // Generate AI brief + tasks. Awaited so it's ready when admin opens the
    // detail page; wrapped in try/catch so AI outages can't block submission.
    await generateAndStoreSummary(sub.id);

    await notify({
        kind: "onboarding_submitted",
        title: `Onboarding submitted: ${sub.clientName}`,
        body: "Review the AI brief and convert to a project when ready.",
        link: `/onboarding/${sub.id}`,
    });
    revalidatePath(`/onboarding/${sub.id}`);
    revalidatePath("/onboarding");
    return {
        ok: true,
        message: "Submitted! Your project team has been notified.",
    };
}

/** Admin: re-run the AI summariser on an existing submission. */
export async function regenerateSummaryAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await generateAndStoreSummary(id);
    revalidatePath(`/onboarding/${id}`);
}

/**
 * Admin: email the onboarding link to the client.
 * Returns a result object so the page can show a success/error toast.
 */
export async function sendOnboardingLinkAction(
    _prev: FormState,
    formData: FormData,
): Promise<FormState> {
    const id = String(formData.get("id") ?? "");
    const email = String(formData.get("email") ?? "").trim();
    if (!id) return { ok: false, message: "Missing submission id" };
    if (!email) return { ok: false, message: "Enter a recipient email" };

    const sub = await getSubmissionById(id);
    if (!sub) return { ok: false, message: "Submission not found" };

    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("host") ?? "localhost:3001";
    const link = `${proto}://${host}/onboard/${sub.token}`;

    try {
        await emailSendOnboardingLink.invoke({
            clientName: sub.clientName,
            clientEmail: email,
            link,
        });
        revalidatePath(`/onboarding/${id}`);
        return { ok: true, message: `Sent to ${email}` };
    } catch (e) {
        return { ok: false, message: `Send failed: ${(e as Error).message}` };
    }
}

// ---------- admin actions ----------

export async function createOnboardingLinkAction(formData: FormData) {
    const clientName = String(formData.get("clientName") ?? "").trim();
    if (!clientName) return;
    const sub = await createSubmission({ clientName });
    revalidatePath("/onboarding");
    redirect(`/onboarding/${sub.id}`);
}

export async function deleteSubmissionAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteSubmission(id);
    revalidatePath("/onboarding");
    redirect("/onboarding");
}

export async function regenerateTokenAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await regenerateToken(id);
    revalidatePath(`/onboarding/${id}`);
}

export async function saveNotesAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const notes = String(formData.get("notes") ?? "");
    if (!id) return;
    await updateSubmission(id, { notes });
    revalidatePath(`/onboarding/${id}`);
}

export async function convertToProjectAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    const sub = await getSubmissionById(id);
    if (!sub) return;
    const projectName =
        (typeof sub.data.business_name === "string" && sub.data.business_name) ||
        sub.clientName ||
        "Untitled project";
    const category = asServiceCategory(formData.get("serviceCategory"));
    const proj = await createProject({
        name: projectName,
        clientName: sub.clientName,
        onboardingSubmissionId: sub.id,
    });

    // Generate the delivery pipeline from the service's workflow template
    // (replaces AI task seeding). The AI brief stays on the submission.
    try {
        await instantiateProjectStages(proj.id, category);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error("Instantiating project stages failed", proj.id, e);
    }

    revalidatePath("/projects");
    revalidatePath(`/onboarding/${id}`);
    redirect(`/projects/${proj.id}`);
}

// ---------- helpers ----------

function zodFlatten(
    err: import("zod").ZodError,
): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const issue of err.issues) {
        const key = issue.path.join(".") || "_form";
        out[key] = out[key] ?? [];
        out[key].push(issue.message);
    }
    return out;
}
