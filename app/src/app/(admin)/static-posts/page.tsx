/**
 * Static posts (Delivery): the list of static content posts, the work for a
 * project's Static post tasks. A thin wrapper over the shared content list.
 */
import { ContentListView, type ContentListParams } from "../content/_views/list-view";

export const dynamic = "force-dynamic";

export default async function StaticPostsPage({ searchParams }: { searchParams: Promise<ContentListParams> }) {
    return <ContentListView kind="static" params={await searchParams} />;
}
