/**
 * Static posts calendar: static posts on their scheduled day, a month at a
 * time. A thin wrapper over the shared content calendar.
 */
import { ContentCalendarView, type ContentCalendarParams } from "../../content/_views/calendar-view";

export const dynamic = "force-dynamic";

export default async function StaticPostsCalendarPage({ searchParams }: { searchParams: Promise<ContentCalendarParams> }) {
    return <ContentCalendarView kind="static" params={await searchParams} />;
}
