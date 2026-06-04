"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type FieldDef = {
    key: string;
    label: string;
    type?: "text" | "textarea";
    placeholder?: string;
};

type Props<T extends Record<string, string>> = {
    /** Hidden input name — value will be JSON.stringify(items) */
    name: string;
    label: string;
    addLabel?: string;
    fields: FieldDef[];
    initial?: T[];
    /** Empty row factory */
    blank: T;
};

export function Repeater<T extends Record<string, string>>({
    name,
    label,
    addLabel,
    fields,
    initial,
    blank,
}: Props<T>) {
    const [items, setItems] = useState<T[]>(initial && initial.length > 0 ? initial : []);

    function update(i: number, key: string, value: string) {
        setItems((curr) =>
            curr.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)),
        );
    }

    function add() {
        setItems((curr) => [...curr, { ...blank }]);
    }

    function remove(i: number) {
        setItems((curr) => curr.filter((_, idx) => idx !== i));
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-sm">{label}</Label>
                <Button type="button" variant="outline" size="sm" onClick={add}>
                    <Plus className="size-4" />
                    {addLabel ?? "Add"}
                </Button>
            </div>

            <input type="hidden" name={name} value={JSON.stringify(items)} />

            {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    None added yet. Tap “{addLabel ?? "Add"}” to add one.
                </p>
            ) : (
                <ul className="space-y-3">
                    {items.map((row, i) => (
                        <li key={i} className="rounded-md border bg-background p-3">
                            <div className="space-y-2">
                                {fields.map((f) => (
                                    <div key={f.key} className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">
                                            {f.label}
                                        </Label>
                                        {f.type === "textarea" ? (
                                            <Textarea
                                                value={row[f.key] ?? ""}
                                                onChange={(e) =>
                                                    update(i, f.key, e.target.value)
                                                }
                                                placeholder={f.placeholder}
                                                rows={2}
                                            />
                                        ) : (
                                            <Input
                                                value={row[f.key] ?? ""}
                                                onChange={(e) =>
                                                    update(i, f.key, e.target.value)
                                                }
                                                placeholder={f.placeholder}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-2 flex justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => remove(i)}
                                >
                                    <Trash2 className="size-4" /> Remove
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
