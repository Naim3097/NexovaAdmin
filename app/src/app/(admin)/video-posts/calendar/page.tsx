/**
 * Video posts calendar: reels and videos on their scheduled day, a month at a
 * time. A thin wrapper over the shared content calendar.
 */
import { ContentCalendarView, type ContentCalendarParams } from "../../content/_views/calendar-view";

export const dynamic = "force-dynamic";

export default async function VideoPostsCalendarPage({ searchParams }: { searchParams: Promise<ContentCalendarParams> }) {
    return <ContentCalendarView kind="video" params={await searchParams} />;
}
