/**
 * Static posts vs Video posts: which Delivery page a content post sits on.
 *
 * Delivery splits content in two. A project's "Static post" and "Video post"
 * tasks each bring a content post (`createLinkedItem`: video → "reel",
 * static → "post"), and each kind has its own list, board and calendar under
 * /static-posts and /video-posts. The rule lives here so every page, count and
 * quota sorts the same way. Pure, type-only imports plus pure helpers, so a
 * client component may use it too.
 *
 * The rule: a post is a VIDEO when its own type is reel or video, or when the
 * task it is the work for is a Video post task; everything else (post,
 * carousel, story, article, email) is STATIC. The post type always exists, so
 * it decides when there is no task; the task keeps a Video post task's post on
 * the video page even if its type was later edited to something else.
 */
import type { Contract } from "@/lib/data/contracts";
import type { ContentPost, ContentType } from "@/lib/data/content";
import type { Work } from "@/lib/data/works";
import { activeContractsFor } from "@/lib/clients/revenue";
import { tasksPerMonth } from "@/lib/contracts/requirements";

export const CONTENT_KINDS = ["static", "video"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export function isContentKind(v: unknown): v is ContentKind {
    return typeof v === "string" && (CONTENT_KINDS as readonly string[]).includes(v);
}

/** Post types that are moving pictures. */
export const VIDEO_CONTENT_TYPES: ReadonlySet<ContentType> = new Set<ContentType>(["reel", "video"]);

/** Page title, also the Delivery menu label. */
export const CONTENT_KIND_LABEL: Record<ContentKind, string> = {
    static: "Static posts",
    video: "Video posts",
};

/** One line under the title: what the page holds. */
export const CONTENT_KIND_BLURB: Record<ContentKind, string> = {
    static: "Image posts, carousels, stories and articles: the work for every Static post task.",
    video: "Reels and videos: the work for every Video post task.",
};

/** The task type that brings a post of this kind (its label is the task name on the project). */
export const CONTENT_KIND_TASK: Record<ContentKind, string> = {
    static: "Static post",
    video: "Video post",
};

export const CONTENT_KIND_PATH: Record<ContentKind, string> = {
    static: "/static-posts",
    video: "/video-posts",
};

/** The three views each kind has. */
export const CONTENT_VIEWS = ["list", "board", "calendar"] as const;
export type ContentView = (typeof CONTENT_VIEWS)[number];

type Params = Record<string, string | string[] | undefined>;

/** `/static-posts/board?client=…`: a view of a kind, with the given query (empty values dropped). */
export function kindHref(kind: ContentKind, view: ContentView = "list", params: Params = {}): string {
    const path = view === "list" ? CONTENT_KIND_PATH[kind] : `${CONTENT_KIND_PATH[kind]}/${view}`;
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        for (const s of Array.isArray(v) ? v : [v]) if (s) q.append(k, s);
    }
    const qs = q.toString();
    return qs ? `${path}?${qs}` : path;
}

/** Post id → the type of the task it is the work for (only posts that came from a task). */
export function linkedTaskTypes(works: readonly Pick<Work, "type" | "linked">[]): Map<string, Work["type"]> {
    const out = new Map<string, Work["type"]>();
    for (const w of works) if (w.linked?.kind === "content") out.set(w.linked.id, w.type);
    return out;
}

/** Static or video, by the rule above. `taskType` is the linked task's type, if any. */
export function contentKind(post: Pick<ContentPost, "type">, taskType?: string | null): ContentKind {
    return VIDEO_CONTENT_TYPES.has(post.type) || taskType === "video" ? "video" : "static";
}

/** The posts of one kind; `taskTypes` from `linkedTaskTypes`. */
export function postsOfKind<P extends Pick<ContentPost, "id" | "type">>(
    posts: readonly P[],
    kind: ContentKind,
    taskTypes: ReadonlyMap<string, string>,
): P[] {
    return posts.filter((p) => contentKind(p, taskTypes.get(p.id)) === kind);
}

/**
 * Posts of one kind a month the client's ACTIVE projects promise: the
 * deliverable rows of that task type (weekly rows count four weeks, one-off
 * rows 0), the per-kind share of `clientContentQuota`.
 */
export function kindContentQuota(clientName: string, contracts: Contract[], kind: ContentKind): number {
    return activeContractsFor(clientName, contracts).reduce(
        (sum, c) => sum + c.requirements.filter((r) => r.type === kind).reduce((s, r) => s + tasksPerMonth(r), 0),
        0,
    );
}
