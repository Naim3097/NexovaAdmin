"use client";

/**
 * Job fields: the job ROLE people read ("Chief Executive Officer", free text
 * with suggestions) and the job CATEGORY the app reads to match a person to
 * task seats (DM: campaigns and SEO, Creative: static and video posts, …). Two
 * grid cells, so the parent form lays them out. Posts `role` and `category`;
 * a read-only category posts nothing, so the server keeps the stored one.
 * Used on the invite form, a member's Team page and the Profile.
 */
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_LABEL, CATEGORY_MATCHES, JOB_ROLE_SUGGESTIONS, TEAM_CATEGORIES, type TeamCategory } from "@/lib/team/categories";

/** Value + label pairs, so the closed select shows "Digital marketer", not "dm". */
const CATEGORY_ITEMS = TEAM_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

export function JobFields({
    role,
    category,
    categoryEditable = true,
    self = false,
    required = false,
    onCategoryChange,
}: {
    role: string;
    /** The stored category; undefined on a new person (the picker starts empty). */
    category?: TeamCategory;
    /** False: the category shows as text with who sets it, and is not posted. */
    categoryEditable?: boolean;
    /** The person is editing their own job: the hint says "you", else "they". */
    self?: boolean;
    required?: boolean;
    /** Called when the category changes (the invite form resets the duties from it). */
    onCategoryChange?: (category: TeamCategory) => void;
}) {
    const id = useId();
    const [picked, setPicked] = useState<TeamCategory | undefined>(category);
    const hint = `What tasks ${self ? "you are" : "they are"} matched to${picked ? `: ${CATEGORY_MATCHES[picked]}` : ""}.`;

    return (
        <>
            <div className="space-y-1.5">
                <Label className="text-sm" htmlFor={`${id}-role`}>
                    Job role
                </Label>
                <Input
                    id={`${id}-role`}
                    name="role"
                    list={`${id}-roles`}
                    defaultValue={role}
                    required={required}
                    maxLength={80}
                    autoComplete="off"
                    placeholder="e.g. Digital Marketer"
                />
                <datalist id={`${id}-roles`}>
                    {JOB_ROLE_SUGGESTIONS.map((s) => (
                        <option key={s} value={s} />
                    ))}
                </datalist>
                <p className="text-xs text-muted-foreground">The title people read. Pick a suggestion or type your own.</p>
            </div>
            <div className="space-y-1.5">
                <Label className="text-sm" htmlFor={categoryEditable ? `${id}-category` : undefined}>
                    Job category
                </Label>
                {categoryEditable ? (
                    <Select
                        name="category"
                        defaultValue={category ?? null}
                        items={CATEGORY_ITEMS}
                        required={required}
                        onValueChange={(v) => {
                            const c = TEAM_CATEGORIES.find((t) => t === v);
                            if (!c) return;
                            setPicked(c);
                            onCategoryChange?.(c);
                        }}
                    >
                        <SelectTrigger id={`${id}-category`} className="h-10 w-full">
                            <SelectValue placeholder="Pick a category" />
                        </SelectTrigger>
                        <SelectContent>
                            {CATEGORY_ITEMS.map((c) => (
                                <SelectItem key={c.value} value={c.value}>
                                    {c.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <p className="flex h-10 items-center rounded-lg border border-dashed px-3 text-sm">
                        {picked ? CATEGORY_LABEL[picked] : "Not set"}
                    </p>
                )}
                <p className="text-xs text-muted-foreground">
                    {hint}
                    {categoryEditable ? "" : " Admin or management sets this on the Team page."}
                </p>
            </div>
        </>
    );
}
