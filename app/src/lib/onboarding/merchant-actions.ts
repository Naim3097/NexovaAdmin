"use server";

/**
 * Server actions for the merchant-registration onboarding flow.
 *
 * Autosave is per step (the invite token doubles as the resume link), document
 * uploads are per field with replace semantics, and the final submit validates
 * the WHOLE submission — data via zod, documents via the adaptive
 * required-docs matrix — so a merchant can never submit half a registration.
 */
import { revalidatePath } from "next/cache";
import {
    appendUploads,
    getSubmissionByToken,
    saveUpload,
    updateSubmission,
    type UploadedFile,
} from "@/lib/data/onboarding";
import {
    MERCHANT_DATA_KEYS,
    clientStatusFor,
    kycRequired,
    merchantFormSchema,
    requiredDocs,
    type MerchantDocKey,
} from "@/lib/onboarding/merchant-schema";
import { notify } from "@/lib/data/notifications";

export type MerchantFormState = {
    ok: boolean;
    message?: string;
    fieldErrors?: Record<string, string[]>;
    /** Doc keys still missing at submit time (review screen highlights them). */
    missingDocs?: string[];
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB — phone photos & PDFs
const UPLOAD_TYPES = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i;

/** Allow-list FormData strings into the merchant data record. */
function pickMerchantFields(formData: FormData): Record<string, string> {
    const out: Record<string, string> = {};
    for (const key of MERCHANT_DATA_KEYS) {
        const v = formData.get(key);
        if (typeof v === "string") out[key] = v;
    }
    return out;
}

async function requireMerchantSubmission(token: string) {
    const sub = await getSubmissionByToken(token);
    if (!sub || sub.checklistSlug !== "merchant-registration") return null;
    return sub;
}

/** Autosave a step's fields. Never validates — drafts are allowed to be incomplete. */
export async function saveMerchantStepAction(
    token: string,
    formData: FormData,
): Promise<MerchantFormState> {
    const sub = await requireMerchantSubmission(token);
    if (!sub) return { ok: false, message: "This link is no longer valid." };
    if (sub.status === "submitted") {
        return { ok: false, message: "This registration was already submitted." };
    }

    await updateSubmission(sub.id, {
        data: { ...sub.data, ...pickMerchantFields(formData) },
    });
    return { ok: true };
}

/**
 * Upload (or replace) one document. Returns the stored file so the client can
 * render the preview immediately.
 */
export async function uploadMerchantDocAction(
    token: string,
    field: MerchantDocKey,
    formData: FormData,
): Promise<
    { ok: true; file: UploadedFile } | { ok: false; message: string }
> {
    const sub = await requireMerchantSubmission(token);
    if (!sub) return { ok: false, message: "This link is no longer valid." };
    if (sub.status === "submitted") {
        return { ok: false, message: "This registration was already submitted." };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
        return { ok: false, message: "Choose a file to upload." };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return {
            ok: false,
            message: "That file is over 15 MB — try a smaller photo or PDF.",
        };
    }
    // The bank statement header must be the exported PDF, not a photo — the
    // gateway rejects screenshots.
    if (field === "bank_statement_header") {
        if (file.type !== "application/pdf") {
            return {
                ok: false,
                message:
                    "The statement header needs to be a PDF — export it from your banking app.",
            };
        }
    } else if (file.type && !UPLOAD_TYPES.test(file.type)) {
        return {
            ok: false,
            message: "Upload a photo (JPG/PNG) or a PDF.",
        };
    }

    const stored = await saveUpload(sub.id, file);
    await updateSubmission(sub.id, { files: { [field]: stored } });
    return { ok: true, file: stored };
}

/**
 * Append one or more files to a MULTI-file asset field (product/service
 * materials). Unlike documents, these accumulate instead of replacing.
 */
export async function uploadMerchantAssetsAction(
    token: string,
    field: "product_materials",
    formData: FormData,
): Promise<
    { ok: true; files: UploadedFile[] } | { ok: false; message: string }
> {
    const sub = await requireMerchantSubmission(token);
    if (!sub) return { ok: false, message: "This link is no longer valid." };
    if (sub.status === "submitted") {
        return { ok: false, message: "This registration was already submitted." };
    }

    const files = formData
        .getAll("files")
        .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) {
        return { ok: false, message: "Choose at least one file." };
    }
    for (const f of files) {
        if (f.size > MAX_UPLOAD_BYTES) {
            return {
                ok: false,
                message: `"${f.name}" is over 15 MB — try a smaller file.`,
            };
        }
        if (f.type && !UPLOAD_TYPES.test(f.type)) {
            return {
                ok: false,
                message: `"${f.name}" isn't a photo or PDF.`,
            };
        }
    }

    const stored = await Promise.all(files.map((f) => saveUpload(sub.id, f)));
    await appendUploads(sub.id, field, stored);
    return { ok: true, files: stored };
}

/** Final submit: full zod validation + adaptive document completeness. */
export async function submitMerchantAction(
    token: string,
    _prev: MerchantFormState,
    formData: FormData,
): Promise<MerchantFormState> {
    const sub = await requireMerchantSubmission(token);
    if (!sub) return { ok: false, message: "This link is no longer valid." };
    if (sub.status === "submitted") {
        return { ok: false, message: "This registration was already submitted." };
    }

    // Merge this request's fields over what autosave already stored, so the
    // final validation always sees the complete picture.
    const merged: Record<string, string> = {};
    for (const key of MERCHANT_DATA_KEYS) {
        const existing = sub.data[key];
        if (typeof existing === "string") merged[key] = existing;
    }
    Object.assign(merged, pickMerchantFields(formData));

    const parsed = merchantFormSchema.safeParse(merged);
    // Documents block submission only on track A ("set up now"). Track B may
    // submit with whatever is uploaded so far; track C skips KYC entirely.
    const docs = kycRequired(merged.gate_answer ?? "")
        ? requiredDocs({
              gate: merged.gate_answer ?? "",
              entityType: merged.entity_type ?? "",
              operatingModel: merged.operating_model ?? "",
              picIsOwner: (merged.pic_is_owner ?? "1") !== "0",
          })
        : [];
    const missingDocs = docs
        .filter((d) => !sub.files[d.key])
        .map((d) => d.key);

    if (!parsed.success || missingDocs.length > 0) {
        // Keep whatever they entered, even on failure.
        await updateSubmission(sub.id, { data: { ...sub.data, ...merged } });
        const fieldErrors: Record<string, string[]> = {};
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                const key = issue.path.join(".") || "_form";
                fieldErrors[key] = fieldErrors[key] ?? [];
                fieldErrors[key].push(issue.message);
            }
        }
        return {
            ok: false,
            message:
                missingDocs.length > 0 && parsed.success
                    ? "A few documents are still missing."
                    : "A few answers need attention.",
            fieldErrors,
            missingDocs,
        };
    }

    const gate = merged.gate_answer ?? "C";
    const now = new Date().toISOString();
    await updateSubmission(sub.id, {
        data: {
            ...sub.data,
            ...merged,
            // Spec §7 system record fields — drive follow-up workflows.
            client_status: clientStatusFor(gate),
            stage1_completed_at: now,
            stage2_completed_at: kycRequired(gate) ? now : null,
            docs_received_date: Object.keys(sub.files).length > 0 ? now : null,
        },
        status: "submitted",
        submittedAt: now,
    });

    const trackLabel =
        gate === "A"
            ? "payment gateway setup — verify documents and submit to the gateway"
            : gate === "B"
              ? "pre-approval — verify the documents on file"
              : "marketing only — no KYC collected";
    await notify({
        kind: "onboarding_submitted",
        title: `Merchant registration submitted: ${sub.clientName}`,
        body: `${merged.display_name || sub.clientName} · ${trackLabel}.`,
        link: `/onboarding/${sub.id}`,
    });
    revalidatePath(`/onboarding/${sub.id}`);
    revalidatePath("/onboarding");
    revalidatePath(`/onboard/${token}`);
    return { ok: true, message: "Submitted" };
}
