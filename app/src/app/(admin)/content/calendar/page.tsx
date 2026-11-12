/**
 * Old address of the Content calendar: sends you to the Static posts calendar
 * with the query (month) kept, now that content is split by kind.
 */
import { redirect } from "next/navigation";
import { kindHref } from "@/lib/content/kind";

export default async function ContentCalendarRedirectPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    redirect(kindHref("static", "calendar", await searchParams));
}
