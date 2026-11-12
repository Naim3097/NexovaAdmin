/**
 * Old address of the Content board: sends you to the Static posts board with
 * the query (client, month) kept, now that content is split by kind.
 */
import { redirect } from "next/navigation";
import { kindHref } from "@/lib/content/kind";

export default async function ContentBoardRedirectPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    redirect(kindHref("static", "board", await searchParams));
}
