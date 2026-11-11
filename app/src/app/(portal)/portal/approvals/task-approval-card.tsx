import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { LINE_TYPE_LABEL } from "@/lib/data/planners";
import type { Work } from "@/lib/data/works";
import { daysBetween } from "@/lib/works/helpers";
import {
    approveTaskAsClientAction,
    requestTaskChangesAsClientAction,
} from "@/lib/portal/actions";

/** "Submitted today" / "Submitted 3 days ago" from the task's submittedAt. */
export function submittedAgo(w: Pick<Work, "submittedAt">, today: string): string {
    if (!w.submittedAt) return "";
    const days = daysBetween(w.submittedAt.slice(0, 10), today);
    if (days <= 0) return "Submitted today";
    if (days === 1) return "Submitted yesterday";
    return `Submitted ${days} days ago`;
}

/**
 * One task waiting for the client, with Approve / Changes inline.
 * Client-facing only: never the owners, hours or internal notes.
 * `clientField` is the dev-preview client name carried into the actions
 * (null with a real login).
 */
export function TaskApprovalCard({
    task,
    contractName,
    today,
    clientField,
}: {
    task: Work;
    contractName: string;
    today: string;
    clientField: string | null;
}) {
    const { url, note } = task.submission;
    const meta = [LINE_TYPE_LABEL[task.type], contractName, task.phaseName]
        .filter(Boolean)
        .join(" · ");
    const ago = submittedAgo(task, today);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">{task.title}</CardTitle>
                    <Badge variant="secondary">Your approval</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{meta}</p>
                {ago ? (
                    <p className="text-xs text-muted-foreground">{ago}</p>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {url || note ? (
                    <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                        {url ? (
                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-sm font-medium text-primary underline-offset-4 hover:underline"
                            >
                                Open the work ↗
                            </a>
                        ) : null}
                        {note ? (
                            <p className="whitespace-pre-wrap text-xs">{note}</p>
                        ) : null}
                    </div>
                ) : null}

                <div className="space-y-3 border-t pt-3">
                    <form action={approveTaskAsClientAction}>
                        <input type="hidden" name="id" value={task.id} />
                        {clientField ? (
                            <input type="hidden" name="client" value={clientField} />
                        ) : null}
                        <Button type="submit" size="lg" className="w-full">
                            ✓ Approve
                        </Button>
                    </form>

                    <form
                        action={requestTaskChangesAsClientAction}
                        className="space-y-2"
                    >
                        <input type="hidden" name="id" value={task.id} />
                        {clientField ? (
                            <input type="hidden" name="client" value={clientField} />
                        ) : null}
                        <Textarea
                            name="comment"
                            rows={2}
                            required
                            placeholder="What should change?"
                        />
                        <Button
                            type="submit"
                            variant="outline"
                            className="w-full"
                        >
                            Changes
                        </Button>
                    </form>
                </div>
            </CardContent>
        </Card>
    );
}
