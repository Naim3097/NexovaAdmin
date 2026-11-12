/**
 * Project costs other than people's time: ad spend paid on the client's
 * behalf, freelancers, software, anything else. Anyone on the project can
 * add a row; only an admin deletes one. Margin on the Money dashboard is
 * billed minus planned hours times each person's cost rate minus these rows.
 * Pure module.
 */
export const COST_KINDS = ["ad_spend", "freelancer", "software", "other"] as const;
export type CostKind = (typeof COST_KINDS)[number];

export const COST_KIND_LABEL: Record<CostKind, string> = {
    ad_spend: "Ad spend",
    freelancer: "Freelancer",
    software: "Software",
    other: "Other",
};

export type ProjectCost = {
    id: string;
    label: string;
    kind: CostKind;
    amountMyr: number;
    /** YYYY-MM-DD the cost was incurred; the month it lands in. */
    date: string;
    /** Who added it. */
    addedBy: string;
};

export function isCostKind(v: unknown): v is CostKind {
    return typeof v === "string" && (COST_KINDS as readonly string[]).includes(v);
}

/** Drops junk rows, rounds amounts, sorts newest first. */
export function normalizeCosts(raw: unknown): ProjectCost[] {
    if (!Array.isArray(raw)) return [];
    const out: ProjectCost[] = [];
    for (const r of raw as Array<Partial<ProjectCost>>) {
        if (!r || typeof r !== "object") continue;
        const amountMyr = Math.max(0, Math.round((Number(r.amountMyr) || 0) * 100) / 100);
        const date = String(r.date ?? "").slice(0, 10);
        if (!amountMyr || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        out.push({
            id: String(r.id ?? "") || `${date}-${out.length}`,
            label: String(r.label ?? "").trim(),
            kind: isCostKind(r.kind) ? r.kind : "other",
            amountMyr,
            date,
            addedBy: String(r.addedBy ?? "").trim(),
        });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Sum of the rows dated on or before `through` (YYYY-MM-DD); all rows when empty. */
export function costsTotal(costs: ProjectCost[], through = ""): number {
    return costs.filter((c) => !through || c.date <= through).reduce((s, c) => s + c.amountMyr, 0);
}
