/**
 * Static posts review board: each client's static posts by month. A thin
 * wrapper over the shared content board.
 */
import { ContentBoardView, type ContentBoardParams } from "../../content/_views/board-view";

export const dynamic = "force-dynamic";

export default async function StaticPostsBoardPage({ searchParams }: { searchParams: Promise<ContentBoardParams> }) {
    return <ContentBoardView kind="static" params={await searchParams} />;
}
