"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_BYTES = 400 * 1024; // 400 KB source file (embedded in the document)

/**
 * Reads an image file in the browser, converts it to a base64 data URL, and
 * submits it to the server action which saves it to the agency logo library.
 * No Supabase Storage needed — the image rides inside the agency_profile row.
 */
export function LogoUploader({
    action,
}: {
    action: (formData: FormData) => Promise<void>;
}) {
    const [dataUrl, setDataUrl] = useState("");
    const [name, setName] = useState("");
    const [error, setError] = useState("");

    function onFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setError("");
        if (!file.type.startsWith("image/")) {
            setError("Please choose an image file (PNG, JPG, or SVG).");
            return;
        }
        if (file.size > MAX_BYTES) {
            setError("Image is too large — keep it under ~400 KB.");
            return;
        }
        setName(file.name.replace(/\.[^.]+$/, ""));
        const reader = new FileReader();
        reader.onload = () => setDataUrl(String(reader.result));
        reader.onerror = () => setError("Could not read that file.");
        reader.readAsDataURL(file);
    }

    return (
        <form
            action={async (fd) => {
                await action(fd);
                setDataUrl("");
                setName("");
            }}
            className="space-y-3"
        >
            <div className="space-y-1.5">
                <Label className="text-sm">
                    Upload a logo (PNG / JPG / SVG, under ~400 KB)
                </Label>
                <input
                    type="file"
                    accept="image/*"
                    onChange={onFile}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent"
                />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            {dataUrl ? (
                <div className="flex flex-wrap items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={dataUrl}
                        alt="Logo preview"
                        className="h-12 w-auto rounded border bg-white p-1"
                    />
                    <Input
                        name="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Logo name"
                        className="max-w-xs"
                    />
                    <input type="hidden" name="dataUrl" value={dataUrl} />
                    <Button type="submit">Save to library</Button>
                </div>
            ) : null}
        </form>
    );
}
