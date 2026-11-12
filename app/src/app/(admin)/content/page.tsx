/**
 * Old address of the Content list. Content is split into Static posts and
 * Video posts now, so /content sends you to Static posts with the query kept
 * (old links and bookmarks keep working). Post pages stay at /content/[id].
 */
import { redirect } from "next/navigation";
import { kindHref } from "@/lib/content/kind";

export default async function ContentRedirectPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    redirect(kindHref("static", "list", await searchParams));
}
