"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CopyLinkButton({ link }: { link: string }) {
    return (
        <Button
            type="button"
            size="sm"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(link);
                    toast.success("Link copied");
                } catch {
                    toast.error("Couldn't copy — select and copy manually");
                }
            }}
        >
            Copy link
        </Button>
    );
}
