import Link from "next/link";
import {
    ADS_PLATFORM_LABELS,
    listPackages,
    summarizeDeliverables,
} from "@/lib/data/packages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createPackageAction } from "@/lib/packages/actions";
import { requireAdminAccess } from "@/lib/auth";
import { PackageFields } from "./package-fields";

export const dynamic = "force-dynamic";

export default async function SettingsPackagesPage() {
    await requireAdminAccess();
    const packages = await listPackages();
    const active = packages.filter((p) => p.active);
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

    return (
        <div className="space-y-6">
            <div>
                <Link href="/settings" className="text-xs text-muted-foreground hover:underline">
                    Settings
                </Link>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Packages</h1>
                <p className="text-sm text-muted-foreground">
                    {active.length} on offer · {packages.length} versions in total. Fixed-price
                    managed-growth packages; a price or scope change publishes a new version
                    so clients keep the terms they signed.
                </p>
            </div>

            <div className="rounded-lg border bg-card">
                <div className="border-b p-4 text-sm font-medium">Catalog</div>
                {packages.length === 0 ? (
                    <p className="p-6 text-sm text-muted-foreground">No packages yet.</p>
                ) : (
                    <ul className="divide-y">
                        {packages.map((p) => (
                            <li
                                key={p.id}
                                className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/settings/packages/${p.id}`}
                                        className="font-medium hover:underline"
                                    >
                                        {p.name}
                                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                                            v{p.version}
                                        </span>
                                    </Link>
                                    <p className="text-xs text-muted-foreground">
                                        MYR {fmt(p.monthlyFeeMyr)}/month · min. {p.minimumTermMonths} months ·{" "}
                                        {p.platforms.length
                                            ? p.platforms
                                                  .map((k) => ADS_PLATFORM_LABELS[k].replace(" (Facebook & Instagram)", ""))
                                                  .join(" · ")
                                            : "no ads platforms"}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {summarizeDeliverables(p) || "no monthly deliverables"}
                                        {p.websiteIncluded ? " · website included" : ""}
                                        {` · ${p.reportCadence} report`}
                                    </p>
                                </div>
                                <Badge variant={p.active ? "default" : "outline"}>
                                    {p.active ? "on offer" : "retired"}
                                </Badge>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <form
                action={createPackageAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <div>
                    <h2 className="text-sm font-medium">Add a package</h2>
                    <p className="text-xs text-muted-foreground">
                        For a new tier. To change the price or scope of an existing package, open
                        it and publish a new version instead.
                    </p>
                </div>
                <PackageFields />
                <div className="flex justify-end">
                    <Button type="submit">Add package</Button>
                </div>
            </form>
        </div>
    );
}
