import {
    ADS_PLATFORMS,
    ADS_PLATFORM_LABELS,
    DELIVERABLE_LABELS,
    DELIVERABLE_TYPES,
    REPORT_CADENCES,
    type Package,
} from "@/lib/data/packages";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

/**
 * The package form body, shared by create / edit / publish-new-version so the
 * three forms can never drift. Server-safe (plain inputs, no client state);
 * `packageFromForm` in lib/packages/actions.ts is the matching parser.
 */
export function PackageFields({ defaults }: { defaults?: Package }) {
    const qty = (type: (typeof DELIVERABLE_TYPES)[number]) =>
        defaults?.deliverables.find((d) => d.type === type)?.qtyPerMonth ?? 0;
    return (
        <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-sm">Name</Label>
                    <Input name="name" required defaultValue={defaults?.name} placeholder="Growth" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">
                        Code <span className="text-muted-foreground">(stable across versions)</span>
                    </Label>
                    <Input name="code" defaultValue={defaults?.code} placeholder="growth" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-sm">Perfect for</Label>
                    <Input name="tagline" defaultValue={defaults?.tagline} placeholder="Businesses that already have products, but need a marketing team." />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Monthly fee (MYR, excl. SST)</Label>
                    <Input name="monthlyFeeMyr" type="number" min="0" step="0.01" defaultValue={defaults?.monthlyFeeMyr ?? 0} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Minimum term (months)</Label>
                    <Input name="minimumTermMonths" type="number" min="1" step="1" defaultValue={defaults?.minimumTermMonths ?? 6} />
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-sm">Advertising platforms managed</Label>
                <div className="flex flex-wrap gap-4">
                    {ADS_PLATFORMS.map((p) => (
                        <label key={p} className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                name="platforms"
                                value={p}
                                defaultChecked={defaults?.platforms.includes(p) ?? false}
                                className="size-4 rounded border-input"
                            />
                            {ADS_PLATFORM_LABELS[p]}
                        </label>
                    ))}
                </div>
            </div>

            <div className="space-y-1.5">
                <Label className="text-sm">
                    Deliverables per month{" "}
                    <span className="text-muted-foreground">(0 = not included · these become fulfilment quotas)</span>
                </Label>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {DELIVERABLE_TYPES.map((t) => (
                        <div key={t} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{DELIVERABLE_LABELS[t]}</Label>
                            <Input name={`deliverable_${t}`} type="number" min="0" step="1" defaultValue={qty(t)} />
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-sm">Reporting</Label>
                    <Select name="reportCadence" defaultValue={defaults?.reportCadence ?? "monthly"}>
                        <SelectTrigger className="h-10">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {REPORT_CADENCES.map((c) => (
                                <SelectItem key={c} value={c}>
                                    {c} performance report
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Website</Label>
                    <label className="flex h-10 items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            name="websiteIncluded"
                            defaultChecked={defaults?.websiteIncluded ?? false}
                            className="size-4 rounded border-input"
                        />
                        Website included in the package
                    </label>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                    <Label className="text-sm">Website line (as it reads on quotes and agreements)</Label>
                    <Input name="websiteLabel" defaultValue={defaults?.websiteLabel} placeholder="FREE custom website (valued at RM5,000) — built in the first month" />
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-sm">Also included (one per line)</Label>
                    <Textarea name="includes" rows={7} defaultValue={defaults?.includes} placeholder={"Full Nexova CMS\nDedicated account manager"} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Not included (one per line)</Label>
                    <Textarea name="notIncluded" rows={7} defaultValue={defaults?.notIncluded} placeholder={"Advertising spend — paid by the client\nDomain fees"} />
                </div>
            </div>
        </div>
    );
}
