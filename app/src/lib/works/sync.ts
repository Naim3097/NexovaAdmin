/**
 * One approval per deliverable.
 *
 * A planner post becomes BOTH a task (the board) and a content post (where the
 * draft is reviewed). Approving either must settle the other, otherwise the
 * client sees the same piece twice and the team gets mixed signals. These two
 * helpers are called by every approval path (task page, My work, My clients,
 * the portal, the AI tools) after the primary record has been updated.
 */
import { approveContent, getContentPostById, requestChanges } from "@/lib/data/content";
import { listWorks, updateWork, type Work } from "@/lib/data/works";
import { recordAudit } from "@/lib/data/audit";

export type Decision = "approved" | "changes";

/** Task decided → settle its linked content post (no-op when there is none or it already matches). */
export async function syncLinkedContent(w: Pick<Work, "linked" | "title">, decision: Decision, by: string, note: string): Promise<void> {
    if (w.linked?.kind !== "content") return;
    const post = await getContentPostById(w.linked.id).catch(() => null);
    if (!post) return;
    if (decision === "approved") {
        if (post.reviewStatus !== "approved") await approveContent({ id: post.id, by });
        return;
    }
    if (post.reviewStatus === "awaiting_client") {
        await requestChanges({ id: post.id, body: note || `Changes requested on the task "${w.title}".` });
    }
}

/** Content post decided → settle the task that is waiting on that post (no-op when none is pending). */
export async function syncTaskForPost(postId: string, decision: Decision, by: string, note: string): Promise<Work | null> {
    const all = await listWorks();
    const w = all.find((x) => x.linked?.kind === "content" && x.linked.id === postId && x.status === "pending_approval");
    if (!w) return null;
    const now = new Date().toISOString();
    const updated = await updateWork(
        w.id,
        decision === "approved"
            ? { status: "completed", completedAt: now, review: { decision: "approved", note, by, at: now } }
            : { status: "in_progress", review: { decision: "changes", note, by, at: now } },
    );
    await recordAudit({
        entity: "work",
        entityId: w.id,
        kind: "update",
        summary: `${w.title}: ${decision === "approved" ? "approved" : "changes requested"} through the content review${note ? ` — ${note}` : ""}`,
        actor: by,
        changes: [{ field: "status", before: w.status, after: updated.status }],
    });
    return updated;
}
