import { notFound } from "next/navigation";
import {
    PROJECT_PHASES,
    getProjectByPortalToken,
    type ProjectPhase,
} from "@/lib/data/projects";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const PHASE_LABEL: Record<ProjectPhase, string> = {
    discovery: "Discovery",
    design: "Design",
    build: "Build",
    qa: "QA",
    client_review: "Client review",
    launch: "Launch",
    closed: "Closed",
};

export default async function ClientPortalPage({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const project = await getProjectByPortalToken(token);
    if (!project) notFound();

    const currentIdx = PROJECT_PHASES.indexOf(project.phase);
    const stages = project.stages ?? [];
    const hasStages = stages.length > 0;
    const activeStage = stages.find((s) => s.state === "active");
    const approvedDeliverables = project.deliverables.filter(
        (d) => d.approvedAt,
    );

    return (
        <div className="space-y-6">
            <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {project.clientName}
                </p>
                <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
                    {project.name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge>
                        {hasStages
                            ? (activeStage?.label ?? "Completed")
                            : PHASE_LABEL[project.phase]}
                    </Badge>
                    <Badge variant="outline">
                        {project.status.replace(/_/g, " ")}
                    </Badge>
                    {project.signoff.signedAt ? (
                        <Badge variant="secondary">Signed off</Badge>
                    ) : null}
                </div>
            </div>

            {/* Progress — real per-project pipeline if set, else phase fallback */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Project progress</h2>
                <ol className="mt-4 space-y-2">
                    {hasStages
                        ? stages.map((s, idx) => {
                              const done = s.state === "done";
                              const active = s.state === "active";
                              return (
                                  <li
                                      key={s.id}
                                      className="flex items-center gap-3 text-sm"
                                  >
                                      <span
                                          className={
                                              done
                                                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                                                  : active
                                                      ? "flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary text-primary"
                                                      : "flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground"
                                          }
                                          aria-hidden
                                      >
                                          {done ? "✓" : idx + 1}
                                      </span>
                                      <span
                                          className={
                                              active
                                                  ? "font-medium"
                                                  : done
                                                      ? ""
                                                      : "text-muted-foreground"
                                          }
                                      >
                                          {s.label}
                                      </span>
                                  </li>
                              );
                          })
                        : PROJECT_PHASES.map((p, idx) => {
                              const done = idx < currentIdx;
                              const active = idx === currentIdx;
                              return (
                                  <li
                                      key={p}
                                      className="flex items-center gap-3 text-sm"
                                  >
                                      <span
                                          className={
                                              done
                                                  ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                                                  : active
                                                      ? "flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary text-primary"
                                                      : "flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground"
                                          }
                                          aria-hidden
                                      >
                                          {done ? "✓" : idx + 1}
                                      </span>
                                      <span
                                          className={
                                              active
                                                  ? "font-medium"
                                                  : done
                                                      ? ""
                                                      : "text-muted-foreground"
                                          }
                                      >
                                          {PHASE_LABEL[p]}
                                      </span>
                                  </li>
                              );
                          })}
                </ol>
            </section>

            {/* Approved deliverables */}
            <section className="rounded-lg border bg-card p-4 md:p-6">
                <h2 className="text-sm font-medium">Approved deliverables</h2>
                <p className="text-xs text-muted-foreground">
                    Items that have been formally approved on this project.
                </p>
                {approvedDeliverables.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                        Nothing approved yet.
                    </p>
                ) : (
                    <ul className="mt-3 divide-y">
                        {approvedDeliverables.map((d) => (
                            <li key={d.id} className="py-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <p className="font-medium">{d.title}</p>
                                    <span className="text-xs text-muted-foreground">
                                        {PHASE_LABEL[d.phase]} ·{" "}
                                        {d.approvedAt
                                            ? new Date(
                                                d.approvedAt,
                                            ).toLocaleDateString()
                                            : ""}
                                    </span>
                                </div>
                                {d.url ? (
                                    <a
                                        href={d.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-1 block break-all text-xs text-primary hover:underline"
                                    >
                                        {d.url}
                                    </a>
                                ) : null}
                                {d.notes ? (
                                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                                        {d.notes}
                                    </p>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Sign-off */}
            {project.signoff.signedAt ? (
                <section className="rounded-lg border bg-card p-4 md:p-6">
                    <h2 className="text-sm font-medium">Sign-off</h2>
                    <p className="mt-2 text-sm">
                        Signed off on{" "}
                        {new Date(
                            project.signoff.signedAt,
                        ).toLocaleDateString()}
                        {project.signoff.signedBy
                            ? ` by ${project.signoff.signedBy}`
                            : ""}
                        .
                    </p>
                    {project.signoff.notes ? (
                        <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                            {project.signoff.notes}
                        </p>
                    ) : null}
                </section>
            ) : null}
        </div>
    );
}
