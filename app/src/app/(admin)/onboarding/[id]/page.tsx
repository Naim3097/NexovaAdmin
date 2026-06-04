import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSubmissionById } from "@/lib/data/onboarding";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SERVICE_CATEGORIES } from "@/lib/dev-store/services";
import {
    convertToProjectAction,
    deleteSubmissionAction,
    regenerateSummaryAction,
    regenerateTokenAction,
    saveNotesAction,
} from "@/lib/onboarding/actions";
import { CopyLinkButton } from "./copy-link-button";
import { SendLinkForm } from "./send-link-form";

export const dynamic = "force-dynamic";

const REPEATER_KEYS = ["services_json", "team_json", "testimonials_json", "faq_json"];
const HIDDEN_KEYS = new Set(["style", "goal", "_ai"]); // shown in their own sections below

type AiSummary = {
    brief?: string;
    error?: string;
    generatedAt?: string;
};

export default async function OnboardingDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const sub = await getSubmissionById(id);
    if (!sub) notFound();

    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("host") ?? "localhost:3000";
    const link = `${proto}://${host}/onboard/${sub.token}`;

    const logo = sub.files.logo as { url: string; name: string } | undefined;
    const photos = (sub.files.photos as { url: string; name: string }[] | undefined) ?? [];
    const ai = (sub.data._ai as AiSummary | undefined) ?? undefined;
    const canRegenerate = sub.status === "submitted";

    return (
        <div className="space-y-6">
            <div>
                <Link href="/onboarding" className="text-sm text-muted-foreground hover:underline">
                    ← Back to onboarding
                </Link>
                <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <h1 className="text-2xl font-semibold md:text-3xl">{sub.clientName}</h1>
                    <Badge variant={sub.status === "submitted" ? "default" : "secondary"}>
                        {sub.status}
                    </Badge>
                </div>
            </div>

            {/* AI brief + suggested tasks */}
            {sub.status === "submitted" || ai ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-medium">AI brief</h2>
                            <p className="text-xs text-muted-foreground">
                                Auto-generated from the submission. Review before sharing with the team.
                            </p>
                        </div>
                        {canRegenerate ? (
                            <form action={regenerateSummaryAction}>
                                <input type="hidden" name="id" value={sub.id} />
                                <Button type="submit" variant="outline" size="sm">
                                    {ai?.brief || ai?.error ? "Regenerate" : "Generate"}
                                </Button>
                            </form>
                        ) : null}
                    </div>

                    {ai?.error ? (
                        <p className="text-sm text-destructive">
                            AI generation failed: {ai.error}
                            <br />
                            <span className="text-xs text-muted-foreground">
                                Click Regenerate to try again.
                            </span>
                        </p>
                    ) : ai?.brief ? (
                        <>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                {ai.brief}
                            </p>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Delivery tasks come from the project&apos;s workflow
                                pipeline (set when you convert), not the AI.
                            </p>
                            {ai.generatedAt ? (
                                <p className="mt-3 text-xs text-muted-foreground">
                                    Generated {new Date(ai.generatedAt).toLocaleString()}
                                </p>
                            ) : null}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            No AI brief yet — click Generate.
                        </p>
                    )}
                </section>
            ) : null}

            {/* Shareable link */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Shareable link</h2>
                <p className="mt-1 break-all text-sm text-muted-foreground">{link}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <CopyLinkButton link={link} />
                    <Link
                        href={`/onboard/${sub.token}`}
                        target="_blank"
                        className="text-sm underline"
                    >
                        Open in new tab
                    </Link>
                    <form action={regenerateTokenAction}>
                        <input type="hidden" name="id" value={sub.id} />
                        <Button type="submit" variant="outline" size="sm">
                            Regenerate link
                        </Button>
                    </form>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                    Regenerating invalidates the old link. Use this if a link was sent to the wrong person.
                </p>

                <div className="mt-4 border-t pt-4">
                    <SendLinkForm id={sub.id} />
                </div>
            </section>

            {/* Internal notes */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <form action={saveNotesAction} className="space-y-2">
                    <input type="hidden" name="id" value={sub.id} />
                    <Label htmlFor="notes" className="text-sm font-medium">
                        Internal notes
                    </Label>
                    <Textarea
                        id="notes"
                        name="notes"
                        defaultValue={sub.notes}
                        rows={3}
                        placeholder="Visible to the team only."
                    />
                    <Button type="submit" size="sm">
                        Save notes
                    </Button>
                </form>
            </section>

            {/* Logo */}
            {logo ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">Logo</h2>
                    <div className="mt-3 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logo.url} alt={logo.name} className="size-20 object-contain" />
                        <div className="text-sm text-muted-foreground">{logo.name}</div>
                    </div>
                </section>
            ) : null}

            {/* Photos */}
            {photos.length > 0 ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">Photos ({photos.length})</h2>
                    <ul className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
                        {photos.map((p, i) => (
                            <li key={i} className="overflow-hidden rounded-md border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <a href={p.url} target="_blank" rel="noreferrer">
                                    <img
                                        src={p.url}
                                        alt={p.name}
                                        className="aspect-square w-full object-cover"
                                    />
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            {/* Repeaters */}
            {REPEATER_KEYS.map((key) => (
                <RepeaterSection
                    key={key}
                    label={key.replace(/_json$/, "").replace(/_/g, " ")}
                    raw={sub.data[key]}
                />
            ))}

            {/* Plain key/value submitted data */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="mb-3 text-sm font-medium">Submitted fields</h2>
                {Object.keys(sub.data).filter((k) => !REPEATER_KEYS.includes(k) && !HIDDEN_KEYS.has(k) && !k.startsWith("$")).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Client hasn&apos;t filled anything in yet.
                    </p>
                ) : (
                    <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {Object.entries(sub.data)
                            .filter(([k]) => !REPEATER_KEYS.includes(k) && !HIDDEN_KEYS.has(k) && !k.startsWith("$"))
                            .map(([key, value]) => (
                                <div key={key} className="space-y-0.5">
                                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                        {key.replace(/_/g, " ")}
                                    </dt>
                                    <dd className="whitespace-pre-wrap text-sm">
                                        {String(value) || <span className="text-muted-foreground">—</span>}
                                    </dd>
                                </div>
                            ))}
                    </dl>
                )}
                {(typeof sub.data.style === "string" && sub.data.style) ||
                    (typeof sub.data.goal === "string" && sub.data.goal) ? (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        {typeof sub.data.goal === "string" && sub.data.goal ? (
                            <div>
                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Goal</dt>
                                <dd className="text-sm">{sub.data.goal}</dd>
                            </div>
                        ) : null}
                        {typeof sub.data.style === "string" && sub.data.style ? (
                            <div>
                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Style</dt>
                                <dd className="text-sm">{sub.data.style}</dd>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </section>

            {/* Convert + delete */}
            <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between md:p-6">
                <div>
                    <h2 className="text-sm font-medium">Actions</h2>
                    <p className="text-xs text-muted-foreground">
                        {sub.status === "submitted"
                            ? "Convert this submission into a tracked project."
                            : "Submission is still a draft — you can convert it once submitted."}
                    </p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                    <form action={convertToProjectAction} className="flex items-end gap-2">
                        <input type="hidden" name="id" value={sub.id} />
                        <div className="space-y-1">
                            <Label className="text-xs">Service / workflow</Label>
                            <Select name="serviceCategory" defaultValue="website">
                                <SelectTrigger className="h-9 w-40">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SERVICE_CATEGORIES.map((c) => (
                                        <SelectItem key={c} value={c}>
                                            {c}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button type="submit" disabled={sub.status !== "submitted"}>
                            Convert to project
                        </Button>
                    </form>
                    <form action={deleteSubmissionAction}>
                        <input type="hidden" name="id" value={sub.id} />
                        <Button type="submit" variant="destructive">
                            Delete submission
                        </Button>
                    </form>
                </div>
            </section>

            <p className="text-xs text-muted-foreground">
                Created {new Date(sub.createdAt).toLocaleString()} · Last updated{" "}
                {new Date(sub.updatedAt).toLocaleString()}
                {sub.submittedAt
                    ? ` · Submitted ${new Date(sub.submittedAt).toLocaleString()}`
                    : ""}
            </p>
        </div>
    );
}

function RepeaterSection({ label, raw }: { label: string; raw: unknown }) {
    let rows: Record<string, string>[] = [];
    if (Array.isArray(raw)) {
        rows = raw as Record<string, string>[];
    } else if (typeof raw === "string" && raw.trim() !== "") {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) rows = parsed as Record<string, string>[];
        } catch {
            /* ignore */
        }
    }
    if (rows.length === 0) return null;
    return (
        <section className="rounded-lg border bg-card p-4 md:p-6">
            <h2 className="mb-3 text-sm font-medium capitalize">{label} ({rows.length})</h2>
            <ul className="space-y-3">
                {rows.map((row, i) => (
                    <li key={i} className="rounded-md border p-3">
                        <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {Object.entries(row).map(([k, v]) => (
                                <div key={k}>
                                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                        {k}
                                    </dt>
                                    <dd className="whitespace-pre-wrap text-sm">{String(v ?? "") || <span className="text-muted-foreground">—</span>}</dd>
                                </div>
                            ))}
                        </dl>
                    </li>
                ))}
            </ul>
        </section>
    );
}
