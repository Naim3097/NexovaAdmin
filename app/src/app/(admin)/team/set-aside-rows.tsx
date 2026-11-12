"use client";

/**
 * Non-delivery hours editor (stored as `setAside`): the hours a week a person
 * spends on work that leaves no task behind ("Management 6h", "Onboarding
 * 2h", "Sales 4h"), one row per label, add and remove. Lives inside a server-action form and posts plain
 * fields `aside_<i>_label` / `aside_<i>_hours`, numbered from 0 without gaps,
 * so the reader (`asSetAside` in @/lib/team/actions) stops at the first
 * missing label. Used on a member's Team page and on the person's Profile.
 */
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HOUR_STEP, fmtHours } from "@/lib/capacity/helpers";
import type { SetAside } from "@/lib/data/team";

type Row = { key: number; label: string; hours: string };

/** Suggested labels, offered as a datalist so the same words get reused across the team. */
const SUGGESTIONS = ["Management", "Onboarding", "Sales", "Account management", "Contracts & invoicing", "Hiring", "Admin"];

export function SetAsideRows({
    rows,
    /** Prefix for element ids, so two editors on one page never clash. */
    idPrefix = "aside",
}: {
    rows: SetAside[];
    idPrefix?: string;
}) {
    const [list, setList] = useState<Row[]>(() => rows.map((r, i) => ({ key: i, label: r.label, hours: String(r.hours) })));
    const [nextKey, setNextKey] = useState(rows.length);
    const total = list.reduce((s, r) => s + (Number(r.hours) > 0 ? Number(r.hours) : 0), 0);
    const listId = `${idPrefix}-labels`;

    function add() {
        setList((l) => [...l, { key: nextKey, label: "", hours: "" }]);
        setNextKey((k) => k + 1);
    }

    function remove(key: number) {
        setList((l) => l.filter((r) => r.key !== key));
    }

    function patch(key: number, change: Partial<Pick<Row, "label" | "hours">>) {
        setList((l) => l.map((r) => (r.key === key ? { ...r, ...change } : r)));
    }

    return (
        <div className="space-y-3">
            <datalist id={listId}>
                {SUGGESTIONS.map((s) => (
                    <option key={s} value={s} />
                ))}
            </datalist>

            {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">No non-delivery hours — every working hour goes to tasks.</p>
            ) : (
                <ul className="space-y-2">
                    {list.map((r, i) => (
                        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
                            <div className="space-y-1">
                                <Label htmlFor={`${idPrefix}_${i}_label`} className={i === 0 ? "text-xs text-muted-foreground" : "sr-only"}>
                                    What for
                                </Label>
                                <Input
                                    id={`${idPrefix}_${i}_label`}
                                    name={`aside_${i}_label`}
                                    list={listId}
                                    value={r.label}
                                    onChange={(e) => patch(r.key, { label: e.target.value })}
                                    placeholder="Management"
                                    autoComplete="off"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`${idPrefix}_${i}_hours`} className={i === 0 ? "text-xs text-muted-foreground" : "sr-only"}>
                                    Hours a week
                                </Label>
                                <Input
                                    id={`${idPrefix}_${i}_hours`}
                                    name={`aside_${i}_hours`}
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step={HOUR_STEP}
                                    value={r.hours}
                                    onChange={(e) => patch(r.key, { hours: e.target.value })}
                                    placeholder="0"
                                    className="h-9 tabular-nums"
                                />
                            </div>
                            <Button type="button" variant="ghost" size="icon-lg" onClick={() => remove(r.key)} aria-label={`Remove ${r.label || "this row"}`}>
                                <X className="size-4" aria-hidden="true" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={add}>
                    <Plus className="size-4" aria-hidden="true" />
                    Add a row
                </Button>
                <p className="text-xs text-muted-foreground tabular-nums">
                    {total > 0 ? `Non-delivery hours: ${fmtHours(total)} a week` : "No non-delivery hours"} · blank rows and 0h are dropped on save.
                </p>
            </div>
        </div>
    );
}
