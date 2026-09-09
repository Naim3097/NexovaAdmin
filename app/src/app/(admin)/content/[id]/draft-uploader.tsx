"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
    createDraftUploadTargetsAction,
    submitDraftFromStorageAction,
} from "@/lib/content/upload-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const BUCKET = "content-assets";

/**
 * Capture a poster frame from a video file in THIS browser. The uploader's
 * machine can always decode its own export (they just previewed it), so this
 * is the one reliable place to make a cover. Clients whose devices can't play
 * the codec (.mov on Firefox, HEVC without hardware support) then still see
 * the cover + a download prompt instead of a blank box. Resolves null when
 * capture isn't possible — the draft simply uploads without a cover.
 */
function captureVideoCover(file: File): Promise<File | null> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const v = document.createElement("video");
        let done = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const finish = (out: File | null) => {
            if (done) return;
            done = true;
            if (timer) clearTimeout(timer);
            URL.revokeObjectURL(url);
            v.removeAttribute("src");
            v.load();
            resolve(out);
        };
        timer = setTimeout(() => finish(null), 8000);
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.addEventListener("loadedmetadata", () => {
            // Nudge past t=0 — some encoders put a black frame there.
            try {
                v.currentTime = Math.min(0.1, v.duration || 0.1);
            } catch {
                finish(null);
            }
        });
        v.addEventListener("seeked", () => {
            try {
                if (!v.videoWidth || !v.videoHeight) return finish(null);
                const canvas = document.createElement("canvas");
                canvas.width = v.videoWidth;
                canvas.height = v.videoHeight;
                const ctx = canvas.getContext("2d");
                if (!ctx) return finish(null);
                ctx.drawImage(v, 0, 0);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) return finish(null);
                        const base = (file.name || "video").replace(
                            /\.[^.]+$/,
                            "",
                        );
                        finish(
                            new File([blob], `${base}-cover.jpg`, {
                                type: "image/jpeg",
                            }),
                        );
                    },
                    "image/jpeg",
                    0.85,
                );
            } catch {
                finish(null);
            }
        });
        v.addEventListener("error", () => finish(null));
        v.src = url;
    });
}

/**
 * Draft submission with DIRECT-TO-STORAGE uploads: files go browser → Supabase
 * Storage via signed URLs (with per-file progress), then only a tiny JSON of
 * paths hits the server. No proxy/server-action/Vercel body limits — videos
 * and multi-image carousels upload reliably. Asset type is derived from the
 * files (any video → video, several files → carousel, else image).
 */
export function DraftUploader({
    postId,
    stages,
}: {
    postId: string;
    stages: readonly string[];
}) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [stage, setStage] = useState(stages[0] ?? "Draft 1");
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");
    const [error, setError] = useState("");

    async function send() {
        let files = Array.from(fileRef.current?.files ?? []);
        if (files.length === 0) {
            setError("Pick at least one file.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            // Video draft with no image alongside → auto-capture a cover here
            // so every viewer gets a poster (and the report thumb an image),
            // codec support or not. Video stays first: fileUrl/back-compat
            // keeps pointing at the video itself.
            const hasImage = files.some((f) => f.type.startsWith("image"));
            const firstVideo = files.find((f) => f.type.startsWith("video"));
            if (firstVideo && !hasImage) {
                setProgress("Capturing video cover…");
                const cover = await captureVideoCover(firstVideo);
                if (cover) files = [...files, cover];
            }

            setProgress("Preparing upload…");
            const prep = await createDraftUploadTargetsAction(
                postId,
                files.map((f) => ({ name: f.name, type: f.type })),
            );
            if (!prep.ok) throw new Error(prep.message);

            const sb = createClient();
            for (let i = 0; i < files.length; i++) {
                const t = prep.targets[i];
                setProgress(
                    `Uploading ${i + 1}/${files.length} — ${files[i].name}`,
                );
                const { error: upErr } = await sb.storage
                    .from(BUCKET)
                    .uploadToSignedUrl(t.path, t.token, files[i], {
                        contentType: files[i].type || undefined,
                    });
                if (upErr) {
                    throw new Error(
                        `Upload failed for ${files[i].name}: ${upErr.message}`,
                    );
                }
            }

            setProgress("Recording draft…");
            const done = await submitDraftFromStorageAction({
                id: postId,
                draftNumber: stage,
                media: prep.targets.map((t) => ({
                    path: t.path,
                    name: t.name,
                    type: t.type,
                })),
            });
            if (!done.ok) throw new Error(done.message || "Could not record draft.");

            setProgress("");
            if (fileRef.current) fileRef.current.value = "";
            router.refresh();
        } catch (e) {
            setError((e as Error).message);
            setProgress("");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-3 border-t pt-4">
            <h3 className="text-xs font-medium text-muted-foreground">
                Send a draft for client review
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                    <Label className="text-sm">Draft stage</Label>
                    <select
                        value={stage}
                        onChange={(e) => setStage(e.target.value)}
                        disabled={busy}
                        className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                        {stages.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">
                        Asset file(s) — multiple = carousel, video OK
                    </Label>
                    <Input
                        ref={fileRef}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        disabled={busy}
                    />
                </div>
            </div>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs">
                    {progress ? (
                        <span className="text-muted-foreground">{progress}</span>
                    ) : null}
                    {error ? (
                        <span className="text-destructive">{error}</span>
                    ) : null}
                </div>
                <Button type="button" onClick={send} disabled={busy}>
                    {busy ? "Uploading…" : "Send draft to client"}
                </Button>
            </div>
        </div>
    );
}
