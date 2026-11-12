/**
 * Reading the row editors back from a form. The deliverable rows post as
 * `del_<i>_type / _name / _count / _per / _channel`, the phase rows as
 * `phase_<i>_key / _name / _summary / _from / _months`, with `i` counting
 * from 0 and no gaps. Pure, shared by the project and template actions.
 */
import { normalizeRequirement, type Requirement } from "@/lib/contracts/requirements";
import { normalizeTemplatePhases, type TemplatePhase } from "@/lib/contracts/phases";

const MAX_ROWS = 60;

function str(v: FormDataEntryValue | null): string {
    return typeof v === "string" ? v.trim() : "";
}

/** Rows without a count (or with 0) are skipped, so an empty extra row never blocks a save. */
export function deliverablesFromForm(fd: FormData): Requirement[] {
    const out: Requirement[] = [];
    for (let i = 0; i < MAX_ROWS; i += 1) {
        const type = fd.get(`del_${i}_type`);
        if (type === null) break;
        const r = normalizeRequirement({
            type: str(type),
            name: str(fd.get(`del_${i}_name`)),
            count: Number(str(fd.get(`del_${i}_count`))) || 0,
            per: str(fd.get(`del_${i}_per`)),
            channel: str(fd.get(`del_${i}_channel`)),
        });
        if (r) out.push(r);
    }
    return out;
}

/** Rows without a name are skipped. Keys are kept when given, so renaming keeps a phase's tasks. */
export function phaseRowsFromForm(fd: FormData): TemplatePhase[] {
    const raw: Array<Partial<TemplatePhase>> = [];
    for (let i = 0; i < MAX_ROWS; i += 1) {
        const name = fd.get(`phase_${i}_name`);
        if (name === null) break;
        raw.push({
            key: str(fd.get(`phase_${i}_key`)),
            name: str(name),
            summary: str(fd.get(`phase_${i}_summary`)),
            fromMonth: Number(str(fd.get(`phase_${i}_from`))) || 1,
            months: Number(str(fd.get(`phase_${i}_months`))) || 1,
        });
    }
    return normalizeTemplatePhases(raw);
}

/** Did the form carry any deliverable rows at all (as opposed to an older form without them). */
export function hasDeliverableRows(fd: FormData): boolean {
    return fd.get("del_0_type") !== null;
}

/** Was the phase editor on the form: then its rows are the answer, even when there are none. */
export function hasPhaseRows(fd: FormData): boolean {
    return fd.get("phase_rows") !== null || fd.get("phase_0_name") !== null;
}
