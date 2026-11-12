/**
 * Delivery tab: the head of delivery's view. Numbers first (six tiles), then
 * the ranked Attention list, status per project, the weekly flow beside review
 * age, and the projects most behind. The maths live in
 * `@/lib/dashboard/delivery`; this file only lays them out. Under All time the
 * tiles and bars cover every month; the weekly flow stays the last few weeks.
 */
import type { DashboardData } from "@/lib/dashboard/data";
import { BEHIND_ROWS, FLOW_WEEKS, buildDeliverySnapshot } from "@/lib/dashboard/delivery";
import { buildOverviewSnapshot } from "@/lib/management/overview";
import { Legend } from "@/components/bars";
import { Section, shortMonthLabel } from "@/app/(admin)/management/ui";
import { AttentionList } from "@/app/(admin)/dashboard/attention";
import { TileGrid } from "./tile-grid";
import { BehindTable, ProjectStatusBars, ReviewAge, STATUS_SERIES, WeeklyFlow } from "./delivery-detail";

export function DeliveryView({ data }: { data: DashboardData }) {
    const { works, contracts, clients, month, today, current, allTime } = data;
    const snap = buildDeliverySnapshot({ works, contracts, clients, month, today });
    // The Attention list is about today, not a month; All time reads it on the current month.
    const overview = buildOverviewSnapshot({ team: data.team, contracts, works, invoices: data.invoices, leads: data.leads, month: allTime ? current : month }, today);
    const when = allTime ? "in any month" : month === current ? "this month" : `in ${shortMonthLabel(month)}`;
    const doneLabel = allTime ? "Done · all time" : month === current ? "Done this month" : `Done · ${shortMonthLabel(month)}`;
    return (
        <>
            <TileGrid tiles={snap.tiles} />
            <Section id="attention" title="Attention" description="Ranked. Your call unless an owner is named.">
                <AttentionList items={overview.decisions} all={overview.allDecisions} team={data.team} />
            </Section>
            <Section
                id="projects"
                title="Status per project"
                description={`Every project with tasks ${when}, the most overdue first. Internal projects included.`}
                action={<Legend series={STATUS_SERIES} className="justify-end" />}
            >
                <ProjectStatusBars rows={snap.projects} allTime={allTime} />
            </Section>
            <div className="grid gap-6 lg:grid-cols-2">
                <Section id="flow" title="Weekly flow" description={`The last ${FLOW_WEEKS} weeks: tasks finished against deadlines that slipped.`}>
                    <WeeklyFlow weeks={snap.weeks} />
                </Section>
                <Section id="review-age" title="Review age" description="Tasks waiting for sign-off, by how long they have waited and who signs.">
                    <ReviewAge rows={snap.reviewAge} />
                </Section>
            </div>
            <Section id="behind" title="Behind" description={`The ${BEHIND_ROWS} projects most behind, worst first: late tasks, then blocked, then unfinished ${when}.`}>
                <BehindTable rows={snap.behind} doneLabel={doneLabel} />
            </Section>
        </>
    );
}
