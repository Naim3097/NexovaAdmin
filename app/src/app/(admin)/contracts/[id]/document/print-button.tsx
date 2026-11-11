"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Print / save-as-PDF the Agreement. */
export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
    return (
        <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1 size-3.5" />
            {label}
        </Button>
    );
}
