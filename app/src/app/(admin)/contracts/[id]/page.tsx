/**
 * Contract page. Client → Contract → Tasks. The header (stage, health,
 * everyday actions) is always on; below it one tab at a time, picked by
 * `?tab=`: Tasks (default, `work`) · Client · Scope (`plan`) · Billing (`money`) ·
 * Details (`setup`) · Activity (`history`).
 * Everything is server-rendered; the view state lives in the URL (see
 * shared.tsx). Only members on the contract (its account manager, anyone
 * holding or approving a task on it) and managers may open it.
 */
import { notFound, redirect } from "next/navigation";
import { getAccessLevel, getActingMember, getCurrentTeamMember, requireTeamAccess } from "@/lib/auth";
import { getContractById, listContracts } from "@/lib/data/contracts";
import { listWorks } from "@/lib/data/works";
import { listQuotations } from "@/lib/data/quotations";
import { listInvoices } from "@/lib/data/invoices";
import { listClients } from "@/lib/data/clients";
import { listTeamMembers } from "@/lib/data/team";
import { listPhaseTemplates } from "@/lib/data/phase-templates";
import { canOpenContract } from "@/lib/scope";
import { HistoryPanel } from "@/components/history-panel";
import { ContractHeader } from "./header";
import { deriveView, type SP } from "./shared";
import { WorkTab } from "./tabs/work";
import { ClientTab } from "./tabs/client";
import { PlanTab } from "./tabs/plan";
import { MoneyTab } from "./tabs/money";
import { SetupTab } from "./tabs/setup";

export const dynamic = "force-dynamic";

export default async function ContractDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<SP>;
}) {
    await requireTeamAccess();
    const { id } = await params;
    const sp = await searchParams;
    const asRaw = sp.as;
    const as = ((Array.isArray(asRaw) ? asRaw[0] : asRaw) ?? "").trim();

    const [c, contracts, clients, team, invoices, quotations, allWorks, linked, member, access, templates] = await Promise.all([
        getContractById(id),
        listContracts(),
        listClients(),
        listTeamMembers(),
        listInvoices(),
        listQuotations(),
        listWorks(),
        getCurrentTeamMember(),
        getActingMember(as || undefined),
        getAccessLevel(),
        listPhaseTemplates(),
    ]);
    if (!c) notFound();
    if (!canOpenContract(member, c, allWorks)) redirect(as ? `/contracts?as=${encodeURIComponent(as)}` : "/contracts");

    const v = deriveView({ c, contracts, clients, team, invoices, quotations, allWorks, linked, member, access, templates, sp });

    return (
        <div className="space-y-6">
            <ContractHeader v={v} />
            {v.tab === "work" ? (
                <WorkTab v={v} />
            ) : v.tab === "client" ? (
                <ClientTab v={v} />
            ) : v.tab === "plan" ? (
                <PlanTab v={v} />
            ) : v.tab === "money" ? (
                <MoneyTab v={v} />
            ) : v.tab === "setup" ? (
                <SetupTab v={v} />
            ) : (
                <HistoryPanel entity="contract" entityId={c.id} />
            )}
        </div>
    );
}
