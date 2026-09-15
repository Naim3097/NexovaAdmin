import Link from "next/link";
import { notFound } from "next/navigation";
import { getPackageById, listPackages } from "@/lib/data/packages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    deletePackageAction,
    publishNewVersionAction,
    updatePackageAction,
} from "@/lib/packages/actions";
import { requireAdminAccess } from "@/lib/auth";
import { PackageFields } from "../package-fields";

export const dynamic = "force-dynamic";

export default async function PackageDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdminAccess();
    const { id } = await params;
    const p = await getPackageById(id);
    if (!p) notFound();
    const history = (await listPackages())
        .filter((x) => x.code === p.code)
        .sort((a, b) => b.version - a.version);

    return (
        <div className="space-y-6">
            <div>
                <Link href="/settings/packages" className="text-xs text-muted-foreground hover:underline">
                    Packages
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-semibold md:text-3xl">
                        {p.name}{" "}
                        <span className="font-mono text-base text-muted-foreground">v{p.version}</span>
                    </h1>
                    <Badge variant={p.active ? "default" : "outline"}>
                        {p.active ? "on offer" : "retired"}
                    </Badge>
                </div>
                {history.length > 1 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                        Versions:{" "}
                        {history.map((h, i) => (
                            <span key={h.id}>
                                {i > 0 ? " · " : ""}
                                {h.id === p.id ? (
                                    <strong>v{h.version}</strong>
                                ) : (
                                    <Link href={`/settings/packages/${h.id}`} className="hover:underline">
                                        v{h.version}
                                    </Link>
                                )}
                                {h.active ? " (on offer)" : ""}
                            </span>
                        ))}
                    </p>
                ) : null}
            </div>

            <form
                action={updatePackageAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={p.id} />
                <div>
                    <h2 className="text-sm font-medium">Edit this version</h2>
                    <p className="text-xs text-muted-foreground">
                        Changes here apply to every deal already referencing v{p.version}. Use it
                        for typos and wording — for a price or scope change, publish a new version
                        below.
                    </p>
                </div>
                <PackageFields defaults={p} />
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        name="active"
                        defaultChecked={p.active}
                        className="size-4 rounded border-input"
                    />
                    On offer for new deals
                </label>
                <div className="flex justify-end">
                    <Button type="submit">Save</Button>
                </div>
            </form>

            <details className="rounded-lg border bg-card">
                <summary className="cursor-pointer p-4 text-sm font-medium">
                    Publish a new version (v{Math.max(...history.map((h) => h.version)) + 1})
                </summary>
                <form action={publishNewVersionAction} className="space-y-4 border-t p-4 md:p-6">
                    <input type="hidden" name="id" value={p.id} />
                    <p className="text-xs text-muted-foreground">
                        Pre-filled from v{p.version}. Publishing makes this the version offered on
                        new deals and retires the others; clients already sold on v{p.version}{" "}
                        keep their terms.
                    </p>
                    <PackageFields defaults={p} />
                    <div className="flex justify-end">
                        <Button type="submit">Publish new version</Button>
                    </div>
                </form>
            </details>

            <form
                action={deletePackageAction}
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
                <input type="hidden" name="id" value={p.id} />
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-destructive">Delete this version</p>
                        <p className="text-xs text-muted-foreground">
                            Only for mistakes. Prefer retiring (untick &ldquo;on offer&rdquo;) once a
                            version has been sold.
                        </p>
                    </div>
                    <Button type="submit" variant="destructive">
                        Delete
                    </Button>
                </div>
            </form>
        </div>
    );
}
