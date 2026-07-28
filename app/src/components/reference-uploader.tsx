"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createPortalReferenceTargetsAction } from "@/lib/content/reference-actions";
import { Button } from "@/components/ui/button";

const BUCKET = "content-assets";

type Uploaded = { path: string; name: string; previewUrl: string };

/**
 * Attach visual references (images) inside a form: uploads go straight to
 * storage on selection (signed URLs — no body-size limits), and the stored
 * paths ride along in a hidden `refPaths` input when the form submits.
 */
export function ReferenceUploader({
    name = "refPaths",
    max = 6,
    label = "Attach visual references (optional)",
}: {
    name?: string;
    max?: number;
    label?: string;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [items, setItems] = useState<Uploaded[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function onPick(list: FileList | null) {
        const files = Array.from(list ?? []).slice(0, max - items.length);
        if (files.length === 0) return;
        setBusy(true);
        setError("");
        try {
            const prep = await createPortalReferenceTargetsAction(
                files.map((f) => ({ name: f.name, type: f.type })),
            );
            if (!prep.ok) throw new Error(prep.message);
            const sb = createClient();
            const done: Uploaded[] = [];
            for (let i = 0; i < files.length; i++) {
                const t = prep.targets[i];
                const { error: upErr } = await sb.storage
                    .from(BUCKET)
                    .uploadToSignedUrl(t.path, t.token, files[i], {
                        contentType: files[i].type || undefined,
                    });
                if (upErr) throw new Error(upErr.message);
                done.push({
                    path: t.path,
                    name: t.name,
                    previewUrl: URL.createObjectURL(files[i]),
                });
            }
            setItems((prev) => [...prev, ...done]);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = "";
        }
    }

    return (
        <div className="space-y-2">
            <input
                type="hidden"
                name={name}
                value={JSON.stringify(items.map((i) => i.path))}
            />
            <div className="flex items-center gap-2">
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple={max > 1}
                    className="hidden"
                    onChange={(e) => onPick(e.target.files)}
                />
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || items.length >= max}
                    onClick={() => fileRef.current?.click()}
                >
                    {busy ? "Uploading…" : `📎 ${label}`}
                </Button>
                {items.length > 0 ? (
                    <span className="text-xs text-muted-foreground">
                        {items.length}/{max}
                    </span>
                ) : null}
            </div>
            {items.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {items.map((it) => (
                        <span key={it.path} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={it.previewUrl}
                                alt={it.name}
                                className="h-14 w-14 rounded-md border object-cover"
                            />
                            <button
                                type="button"
                                aria-label={`Remove ${it.name}`}
                                onClick={() =>
                                    setItems((prev) =>
                                        prev.filter((p) => p.path !== it.path),
                                    )
                                }
                                className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-[10px] leading-none text-background"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
    );
}
