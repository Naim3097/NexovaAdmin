"use client";
/**
 * The phases editor: a list of phases with a name, the month it starts in
 * (1 = the first month of the project) and how many months it runs. Add,
 * remove, reorder. Posts back as `phase_<i>_*` fields; read with
 * phaseRowsFromForm. Shared by New project and Templates. On a project the
 * Tasks tab edits the real months instead.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_PHASE_MONTHS, type TemplatePhase } from "@/lib/contracts/phases";
import { cn } from "@/lib/utils";

type Row = TemplatePhase & { id: number };

export function PhaseRows({ initial, termMonths, className }: { initial: TemplatePhase[]; /** When known, rows past the term are flagged. */ termMonths?: number; className?: string }) {
    const [rows, setRows] = useState<Row[]>(() => initial.map((p, i) => ({ ...p, id: i + 1 })));
    const [nextId, setNextId] = useState(() => rows.length + 1);

    const update = (id: number, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const remove = (id: number) => setRows((prev) => prev.filter((r) => r.id !== id));
    const move = (id: number, dir: -1 | 1) =>
        setRows((prev) => {
            const i = prev.findIndex((r) => r.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= prev.length) return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    const add = () => {
        setRows((prev) => {
            const last = prev[prev.length - 1];
            const fromMonth = last ? last.fromMonth + last.months : 1;
            return [...prev, { id: nextId, key: "", name: "", summary: "", fromMonth, months: 1 }];
        });
        setNextId((n) => n + 1);
    };
    const num = (v: string, min: number) => Math.min(MAX_PHASE_MONTHS, Math.max(min, Math.round(Number(v) || min)));

    return (
        <div className={className}>
            {/* Marks that the editor was on the form, so an empty list means "no phases" rather than "use the defaults". */}
            <input type="hidden" name="phase_rows" value="1" />
            <ul className="space-y-1.5">
                {rows.length === 0 ? <li className="py-2 text-xs text-muted-foreground">No phases. The project will run without them; add one below.</li> : null}
                {rows.map((r, i) => {
                    const last = r.fromMonth + r.months - 1;
                    const past = termMonths ? r.fromMonth > termMonths : false;
                    const clipped = termMonths ? !past && last > termMonths : false;
                    return (
                        <li key={r.id} className={cn("grid grid-cols-[1.5rem_minmax(0,1fr)_5rem_5rem_auto] items-center gap-2", past && "opacity-60")}>
                            <input type="hidden" name={`phase_${i}_key`} value={r.key} />
                            <input type="hidden" name={`phase_${i}_summary`} value={r.summary} />
                            <span className="text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
                            <Input name={`phase_${i}_name`} value={r.name} onChange={(e) => update(r.id, { name: e.target.value })} placeholder="Phase name" className="h-9" />
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span className="sr-only">From month</span>
                                <span>m</span>
                                <Input
                                    name={`phase_${i}_from`}
                                    type="number"
                                    min={1}
                                    max={MAX_PHASE_MONTHS}
                                    value={r.fromMonth}
                                    onChange={(e) => update(r.id, { fromMonth: num(e.target.value, 1) })}
                                    className="h-9 w-14 px-1.5 text-center"
                                    title="Starts in month"
                                />
                            </label>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Input
                                    name={`phase_${i}_months`}
                                    type="number"
                                    min={1}
                                    max={MAX_PHASE_MONTHS}
                                    value={r.months}
                                    onChange={(e) => update(r.id, { months: num(e.target.value, 1) })}
                                    className="h-9 w-14 px-1.5 text-center"
                                    title="Runs for this many months"
                                />
                                <span>mo</span>
                            </label>
                            <div className="flex items-center gap-0.5">
                                <span className={cn("mr-1 hidden text-[11px] tabular-nums text-muted-foreground sm:inline", (past || clipped) && "text-amber-700 dark:text-amber-400")} title={past ? "Starts after the project ends" : clipped ? "Runs past the end of the project; it will be clipped" : undefined}>
                                    {r.months > 1 ? `m${r.fromMonth}–${last}` : `m${r.fromMonth}`}
                                </span>
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(r.id, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                                    ↑
                                </Button>
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(r.id, 1)} disabled={i === rows.length - 1} aria-label="Move down" title="Move down">
                                    ↓
                                </Button>
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(r.id)} aria-label="Remove phase" title="Remove" className="text-muted-foreground hover:text-destructive">
                                    ✕
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={add}>
                    + Add phase
                </Button>
                <p className="text-[11px] text-muted-foreground">Month 1 is the first month of the project. Phases may overlap.</p>
            </div>
        </div>
    );
}
