"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bulkDeleteContentAction } from "@/lib/content/actions";

export type ContentRow = {
    id: string;
    title: string;
    scheduledFor: string;
    status: string;
};

/**
 * Selectable content list on the client profile with a bulk action bar.
 * Tick items (or select-all) → "Delete N selected" removes them in one go,
 * without opening each content page. Checked rows post `ids` to the action.
 */
export function ContentBulkList({
    clientId,
    items,
}: {
    clientId: string;
    items: ContentRow[];
}) {
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Count only currently-visible items — a stale id (e.g. from a prior delete)
    // never renders or submits, so we derive from `items` rather than prune state.
    const selectedCount = items.filter((i) => selected.has(i.id)).length;
    const allChecked = items.length > 0 && selectedCount === items.length;
    const someChecked = selectedCount > 0 && !allChecked;

    function toggle(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }
    function toggleAll() {
        setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)));
    }

    return (
        <form
            action={bulkDeleteContentAction}
            onSubmit={(e) => {
                if (
                    !window.confirm(
                        `Delete ${selectedCount} content item${selectedCount === 1 ? "" : "s"}? This cannot be undone.`,
                    )
                ) {
                    e.preventDefault();
                }
            }}
            className="rounded-lg border bg-card"
        >
            <input type="hidden" name="clientId" value={clientId} />

            {/* Header: select-all + action bar */}
            <div className="flex items-center justify-between gap-3 border-b p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => {
                            if (el) el.indeterminate = someChecked;
                        }}
                        onChange={toggleAll}
                        className="size-4 rounded border-input"
                        aria-label="Select all content"
                    />
                    Content ({items.length})
                </label>
                <div className="flex items-center gap-2">
                    {selectedCount > 0 ? (
                        <span className="text-xs text-muted-foreground">
                            {selectedCount} selected
                        </span>
                    ) : null}
                    <Button
                        type="submit"
                        size="sm"
                        variant="destructive"
                        disabled={selectedCount === 0}
                    >
                        Delete selected
                    </Button>
                </div>
            </div>

            <ul className="max-h-96 divide-y overflow-y-auto text-sm">
                {items.map((c) => (
                    <li
                        key={c.id}
                        className="flex items-center gap-3 p-3 has-[:checked]:bg-accent/40"
                    >
                        <input
                            type="checkbox"
                            name="ids"
                            value={c.id}
                            checked={selected.has(c.id)}
                            onChange={() => toggle(c.id)}
                            className="size-4 shrink-0 rounded border-input"
                            aria-label={`Select ${c.title}`}
                        />
                        <Link
                            href={`/content/${c.id}`}
                            className="min-w-0 flex-1 truncate hover:underline"
                        >
                            {c.title}{" "}
                            <span className="text-muted-foreground">
                                · {c.scheduledFor}
                            </span>
                        </Link>
                        <Badge variant="secondary" className="shrink-0">
                            {c.status}
                        </Badge>
                    </li>
                ))}
            </ul>
        </form>
    );
}
