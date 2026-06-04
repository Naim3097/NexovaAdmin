"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
    CAMPAIGN_FEE_MODELS,
    CAMPAIGN_OBJECTIVES,
    CAMPAIGN_PLATFORMS,
    CAMPAIGN_STATUSES,
    addCampaignMetric,
    createCampaign,
    deleteCampaign,
    deleteCampaignMetric,
    updateCampaign,
    type CampaignFeeModel,
    type CampaignObjective,
    type CampaignPlatform,
    type CampaignStatus,
} from "@/lib/data/campaigns";

function asPlatform(v: FormDataEntryValue | null): CampaignPlatform {
    const s = String(v ?? "");
    return (CAMPAIGN_PLATFORMS as readonly string[]).includes(s)
        ? (s as CampaignPlatform)
        : "meta";
}
function asObjective(v: FormDataEntryValue | null): CampaignObjective {
    const s = String(v ?? "");
    return (CAMPAIGN_OBJECTIVES as readonly string[]).includes(s)
        ? (s as CampaignObjective)
        : "leads";
}
function asStatus(v: FormDataEntryValue | null): CampaignStatus {
    const s = String(v ?? "");
    return (CAMPAIGN_STATUSES as readonly string[]).includes(s)
        ? (s as CampaignStatus)
        : "planning";
}
function asFeeModel(v: FormDataEntryValue | null): CampaignFeeModel {
    const s = String(v ?? "");
    return (CAMPAIGN_FEE_MODELS as readonly string[]).includes(s)
        ? (s as CampaignFeeModel)
        : "none";
}
function num(v: FormDataEntryValue | null): number {
    const n = Number(String(v ?? "0"));
    return Number.isFinite(n) ? n : 0;
}

export async function createCampaignAction(formData: FormData) {
    const name = String(formData.get("name") ?? "").trim();
    const clientName = String(formData.get("clientName") ?? "").trim();
    if (!name || !clientName) return;
    const c = await createCampaign({
        name,
        clientName,
        platform: asPlatform(formData.get("platform")),
        objective: asObjective(formData.get("objective")),
        startDate: String(formData.get("startDate") ?? "").trim(),
        endDate: String(formData.get("endDate") ?? "").trim(),
        monthlyBudgetMyr: num(formData.get("monthlyBudgetMyr")),
        feeModel: asFeeModel(formData.get("feeModel")),
        flatFeeMyr: num(formData.get("flatFeeMyr")),
        percentFee: num(formData.get("percentFee")),
        externalId: String(formData.get("externalId") ?? "").trim(),
        landingUrl: String(formData.get("landingUrl") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
    });
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    redirect(`/campaigns/${c.id}`);
}

export async function updateCampaignAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateCampaign(id, {
        name: String(formData.get("name") ?? "").trim(),
        clientName: String(formData.get("clientName") ?? "").trim(),
        platform: asPlatform(formData.get("platform")),
        objective: asObjective(formData.get("objective")),
        status: asStatus(formData.get("status")),
        startDate: String(formData.get("startDate") ?? "").trim(),
        endDate: String(formData.get("endDate") ?? "").trim(),
        monthlyBudgetMyr: num(formData.get("monthlyBudgetMyr")),
        feeModel: asFeeModel(formData.get("feeModel")),
        flatFeeMyr: num(formData.get("flatFeeMyr")),
        percentFee: num(formData.get("percentFee")),
        externalId: String(formData.get("externalId") ?? "").trim(),
        landingUrl: String(formData.get("landingUrl") ?? "").trim(),
        notes: String(formData.get("notes") ?? "").trim(),
    });
    revalidatePath(`/campaigns/${id}`);
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
}

export async function setCampaignStatusAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await updateCampaign(id, { status: asStatus(formData.get("status")) });
    revalidatePath(`/campaigns/${id}`);
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
}

export async function deleteCampaignAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteCampaign(id);
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
    redirect("/campaigns");
}

export async function addCampaignMetricAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const date = String(formData.get("date") ?? "").trim();
    if (!id || !date) return;
    await addCampaignMetric(id, {
        date,
        spendMyr: num(formData.get("spendMyr")),
        impressions: num(formData.get("impressions")),
        clicks: num(formData.get("clicks")),
        leadsReported: num(formData.get("leadsReported")),
        conversionsReported: num(formData.get("conversionsReported")),
        notes: String(formData.get("notes") ?? "").trim(),
    });
    revalidatePath(`/campaigns/${id}`);
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
}

export async function deleteCampaignMetricAction(formData: FormData) {
    const id = String(formData.get("id") ?? "");
    const metricId = String(formData.get("metricId") ?? "");
    if (!id || !metricId) return;
    await deleteCampaignMetric(id, metricId);
    revalidatePath(`/campaigns/${id}`);
    revalidatePath("/campaigns");
    revalidatePath("/dashboard");
}
