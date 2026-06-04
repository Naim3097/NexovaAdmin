import { listAuditForEntity, type AuditEntity } from "@/lib/data/audit";

const FIELD_LABEL: Record<string, string> = {
    name: "Name",
    company: "Company",
    email: "Email",
    phone: "Phone",
    source: "Source",
    sourceCampaignId: "Source campaign",
    interestedIn: "Interested in",
    estValueMyr: "Est. value (MYR)",
    notes: "Notes",
    score: "Score",
    status: "Status",
    phase: "Phase",
    clientName: "Client",
    projectId: "Project",
    issueDate: "Issue date",
    dueDate: "Due date",
    taxRatePct: "Tax rate %",
};

function label(field: string): string {
    return FIELD_LABEL[field] ?? field;
}

function shorten(v: string, max = 80): string {
    if (!v) return "—";
    return v.length > max ? v.slice(0, max - 1) + "…" : v;
}

export async function HistoryPanel({
    entity,
    entityId,
    title = "History",
    limit = 25,
}: {
    entity: AuditEntity;
    entityId: string;
    title?: string;
    limit?: number;
}) {
    const events = (await listAuditForEntity(entity, entityId)).slice(0, limit);

    return (
        <section className="rounded-lg border bg-card">
            <header className="flex items-center justify-between border-b p-4">
                <h2 className="text-sm font-semibold">{title}</h2>
                <span className="text-xs text-muted-foreground">
                    {events.length === 0
                        ? "No changes recorded"
                        : `${events.length} event${events.length === 1 ? "" : "s"}`}
                </span>
            </header>
            {events.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                    Field-level changes will appear here as the record is
                    edited.
                </p>
            ) : (
                <ol className="divide-y">
                    {events.map((ev) => (
                        <li key={ev.id} className="p-4">
                            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                                <span className="font-medium">
                                    {ev.summary}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {new Date(ev.at).toLocaleString()}
                                    {ev.actor ? ` · ${ev.actor}` : ""}
                                </span>
                            </div>
                            {ev.changes.length > 0 ? (
                                <ul className="mt-2 space-y-1 text-xs">
                                    {ev.changes.map((c) => (
                                        <li
                                            key={c.field}
                                            className="font-mono text-muted-foreground"
                                        >
                                            <span className="text-foreground">
                                                {label(c.field)}:
                                            </span>{" "}
                                            <span className="line-through">
                                                {shorten(c.before)}
                                            </span>{" "}
                                            →{" "}
                                            <span className="text-foreground">
                                                {shorten(c.after)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}
