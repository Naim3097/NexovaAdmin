"use client";
/**
 * The deliverables editor: free rows, any number, two of the same type if you
 * like. Each row: task type, a name ("Awareness post on Instagram"), how many,
 * how often (a week / a month / once) and an optional channel. Posts back as
 * `del_<i>_*` fields; read with deliverablesFromForm. Shared by New project,
 * the Plan tab and Templates.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_CHANNEL, ONCE_BY_DEFAULT, PER_LABEL, REQUIREMENT_PERS, type Requirement, type RequirementPer } from "@/lib/contracts/requirements";
import { LINE_TYPES, LINE_TYPE_LABEL, type LineType } from "@/lib/planners/vocab";
import { cn } from "@/lib/utils";

type Row = Requirement & { id: number };

const SEL = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

function blank(id: number, type: LineType = "static"): Row {
    return { id, type, name: "", count: 1, per: ONCE_BY_DEFAULT.has(type) ? "once" : "month", channel: "" };
}

export function DeliverableRows({ initial, startEmpty = false, className }: { initial: Requirement[]; startEmpty?: boolean; className?: string }) {
    const [rows, setRows] = useState<Row[]>(() => {
        const seed = initial.length ? initial : startEmpty ? [] : [blank(1)];
        return seed.map((r, i) => ({ ...r, id: i + 1 }));
    });
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
        setRows((prev) => [...prev, blank(nextId)]);
        setNextId((n) => n + 1);
    };

    return (
        <div className={className}>
            <div className="-mx-3 overflow-x-auto px-3 md:mx-0 md:px-0">
                <table className="w-full min-w-[720px] text-sm">
                    <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                            <th className="w-36 py-1.5 pr-2 font-medium">Type</th>
                            <th className="py-1.5 pr-2 font-medium">Name</th>
                            <th className="w-20 py-1.5 pr-2 font-medium">How many</th>
                            <th className="w-28 py-1.5 pr-2 font-medium">How often</th>
                            <th className="w-36 py-1.5 pr-2 font-medium">Channel</th>
                            <th className="w-24 py-1.5 font-medium" aria-label="Row actions" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-3 text-xs text-muted-foreground">
                                    No deliverables yet. Add the first one below.
                                </td>
                            </tr>
                        ) : null}
                        {rows.map((r, i) => (
                            <tr key={r.id} className="border-b last:border-0">
                                <td className="py-2 pr-2">
                                    <select
                                        name={`del_${i}_type`}
                                        value={r.type}
                                        onChange={(e) => {
                                            const type = e.target.value as LineType;
                                            update(r.id, { type, per: r.name === "" && r.count === 1 ? (ONCE_BY_DEFAULT.has(type) ? "once" : "month") : r.per });
                                        }}
                                        className={SEL}
                                    >
                                        {LINE_TYPES.map((t) => (
                                            <option key={t} value={t}>
                                                {LINE_TYPE_LABEL[t]}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td className="py-2 pr-2">
                                    <Input
                                        name={`del_${i}_name`}
                                        value={r.name}
                                        onChange={(e) => update(r.id, { name: e.target.value })}
                                        placeholder={LINE_TYPE_LABEL[r.type]}
                                        className="h-9"
                                    />
                                </td>
                                <td className="py-2 pr-2">
                                    <Input
                                        name={`del_${i}_count`}
                                        type="number"
                                        min={1}
                                        max={99}
                                        step={1}
                                        value={r.count || ""}
                                        onChange={(e) => update(r.id, { count: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                                        className="h-9"
                                    />
                                </td>
                                <td className="py-2 pr-2">
                                    <select name={`del_${i}_per`} value={r.per} onChange={(e) => update(r.id, { per: e.target.value as RequirementPer })} className={SEL}>
                                        {REQUIREMENT_PERS.map((p) => (
                                            <option key={p} value={p}>
                                                {PER_LABEL[p]}
                                            </option>
                                        ))}
                                    </select>
                                </td>
                                <td className="py-2 pr-2">
                                    <Input
                                        name={`del_${i}_channel`}
                                        value={r.channel}
                                        onChange={(e) => update(r.id, { channel: e.target.value })}
                                        placeholder={DEFAULT_CHANNEL[r.type]}
                                        className="h-9"
                                    />
                                </td>
                                <td className="py-2">
                                    <div className="flex items-center justify-end gap-0.5">
                                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(r.id, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                                            ↑
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(r.id, 1)} disabled={i === rows.length - 1} aria-label="Move down" title="Move down">
                                            ↓
                                        </Button>
                                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(r.id)} aria-label="Remove row" title="Remove" className={cn("text-muted-foreground hover:text-destructive")}>
                                            ✕
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={add}>
                    + Add deliverable
                </Button>
                <p className="text-[11px] text-muted-foreground">
                    The name becomes the task title. &ldquo;A week&rdquo; means every working week (Mon–Thu); &ldquo;once&rdquo; lands in the first month.
                </p>
            </div>
        </div>
    );
}
