/**
 * Video posts (Delivery): the list of reels and videos, the work for a
 * project's Video post tasks. A thin wrapper over the shared content list.
 */
import { ContentListView, type ContentListParams } from "../content/_views/list-view";

export const dynamic = "force-dynamic";

export default async function VideoPostsPage({ searchParams }: { searchParams: Promise<ContentListParams> }) {
    return <ContentListView kind="video" params={await searchParams} />;
}
