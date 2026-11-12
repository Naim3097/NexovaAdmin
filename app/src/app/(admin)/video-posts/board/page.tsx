/**
 * Video posts review board: each client's reels and videos by month. A thin
 * wrapper over the shared content board.
 */
import { ContentBoardView, type ContentBoardParams } from "../../content/_views/board-view";

export const dynamic = "force-dynamic";

export default async function VideoPostsBoardPage({ searchParams }: { searchParams: Promise<ContentBoardParams> }) {
    return <ContentBoardView kind="video" params={await searchParams} />;
}
