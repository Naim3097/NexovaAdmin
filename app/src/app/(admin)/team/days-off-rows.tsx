"use client";

/**
 * Days-off rows editor: the days a person is away in a month (leave; Kuala
 * Lumpur public holidays already come off capacity), one row per month, add
 * and remove. Lives inside a server-action form and posts plain fields
 * `off_<i>_month` / `off_<i>_days`, numbered from 0 without gaps, so the
 * reader (`asDaysOff` in @/lib/team/actions) stops at the first missing month.
 * Used on a member's Team page and on the Profile, in the same shape as the
 * non-delivery hours rows.
 */
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { key: number; month: string; days: string };

/** YYYY-MM one month after `ym`; `ym` itself when it is not a month. */
function monthAfter(ym: string): string {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

export function DaysOffRows({
    daysOff,
    startMonth,
    idPrefix = "off",
}: {
    daysOff: Record<string, number>;
    /** YYYY-MM the first new row starts on (this month); later rows take the month after the last one. */
    startMonth: string;
    /** Prefix for element ids, so two editors on one page never clash. */
    idPrefix?: string;
}) {
    const [list, setList] = useState<Row[]>(() =>
        Object.entries(daysOff)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([month, days], i) => ({ key: i, month, days: String(days) })),
    );
    const [nextKey, setNextKey] = useState(Object.keys(daysOff).length);
    const total = list.reduce((s, r) => s + (Number(r.days) > 0 ? Math.round(Number(r.days)) : 0), 0);

    function add() {
        const months = list.map((r) => r.month).filter(Boolean).sort();
        const last = months[months.length - 1];
        setList((l) => [...l, { key: nextKey, month: last ? monthAfter(last) : startMonth, days: "" }]);
        setNextKey((k) => k + 1);
    }

    function remove(key: number) {
        setList((l) => l.filter((r) => r.key !== key));
    }

    function patch(key: number, change: Partial<Pick<Row, "month" | "days">>) {
        setList((l) => l.map((r) => (r.key === key ? { ...r, ...change } : r)));
    }

    return (
        <div className="space-y-3">
            {list.length === 0 ? (
                <p className="text-sm text-muted-foreground">No days off entered — every working day counts as available.</p>
            ) : (
                <ul className="space-y-2">
                    {list.map((r, i) => (
                        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2">
                            <div className="space-y-1">
                                <Label htmlFor={`${idPrefix}_${i}_month`} className={i === 0 ? "text-xs text-muted-foreground" : "sr-only"}>
                                    Month
                                </Label>
                                <Input
                                    id={`${idPrefix}_${i}_month`}
                                    name={`off_${i}_month`}
                                    type="month"
                                    value={r.month}
                                    onChange={(e) => patch(r.key, { month: e.target.value })}
                                    placeholder="YYYY-MM"
                                    pattern="\d{4}-\d{2}"
                                    className="h-9 tabular-nums"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor={`${idPrefix}_${i}_days`} className={i === 0 ? "text-xs text-muted-foreground" : "sr-only"}>
                                    Days off
                                </Label>
                                <Input
                                    id={`${idPrefix}_${i}_days`}
                                    name={`off_${i}_days`}
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={31}
                                    step={1}
                                    value={r.days}
                                    onChange={(e) => patch(r.key, { days: e.target.value })}
                                    placeholder="0"
                                    className="h-9 tabular-nums"
                                />
                            </div>
                            <Button type="button" variant="ghost" size="icon-lg" onClick={() => remove(r.key)} aria-label={`Remove ${r.month || "this row"}`}>
                                <X className="size-4" aria-hidden="true" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={add}>
                    <Plus className="size-4" aria-hidden="true" />
                    Add a month
                </Button>
                <p className="text-xs text-muted-foreground tabular-nums">
                    {total > 0 ? `${total} day${total === 1 ? "" : "s"} off in all` : "No days off"} · blank rows and 0 are dropped on save; the same month twice adds up.
                </p>
            </div>
        </div>
    );
}
