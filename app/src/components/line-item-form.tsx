"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ServicePickOption = {
    id: string;
    name: string;
    details: string;
    defaultPrice: number;
};

/**
 * Add-a-line-item form shared by quotes and invoices.
 *
 * Picking a saved service pre-fills the description, sub-points, and unit price
 * (all still editable). Sub-points are free text, one bullet per line, and ride
 * along to the document + its PDF. Inputs are controlled so the service picker
 * can fill them and the form can clear itself after a successful add.
 */
export function LineItemForm({
    docId,
    services,
    action,
}: {
    docId: string;
    services: ServicePickOption[];
    action: (formData: FormData) => Promise<void>;
}) {
    const [description, setDescription] = useState("");
    const [details, setDetails] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [unitPrice, setUnitPrice] = useState("0");

    function pickService(serviceId: string) {
        const svc = services.find((s) => s.id === serviceId);
        if (!svc) return;
        setDescription(svc.name);
        setDetails(svc.details);
        if (svc.defaultPrice > 0) setUnitPrice(String(svc.defaultPrice));
    }

    return (
        <form
            action={async (fd) => {
                await action(fd);
                setDescription("");
                setDetails("");
                setQuantity("1");
                setUnitPrice("0");
            }}
            className="mt-3 space-y-3"
        >
            <input type="hidden" name="id" value={docId} />

            {services.length > 0 ? (
                <div className="space-y-1.5">
                    <Label className="text-sm">Pick a saved service (optional)</Label>
                    <select
                        defaultValue=""
                        onChange={(e) => {
                            pickService(e.target.value);
                            e.target.value = "";
                        }}
                        className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                        <option value="">— Choose to pre-fill from catalog —</option>
                        {services.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                                {s.defaultPrice > 0 ? ` · MYR ${s.defaultPrice}` : ""}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            <div className="grid gap-2 md:grid-cols-[1fr_90px_140px_auto] md:items-end">
                <div className="space-y-1.5">
                    <Label className="text-sm">Description</Label>
                    <Input
                        name="description"
                        required
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Website design — homepage"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Qty</Label>
                    <Input
                        name="quantity"
                        type="number"
                        min={1}
                        step={1}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Unit (MYR)</Label>
                    <Input
                        name="unitPriceMyr"
                        type="number"
                        min={0}
                        step={0.01}
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                    />
                </div>
                <Button type="submit">Add</Button>
            </div>

            <div className="space-y-1.5">
                <Label className="text-sm">
                    Sub-points (one per line, optional)
                </Label>
                <Textarea
                    name="details"
                    rows={3}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder={"Homepage + 5 sub-pages\nMobile responsive\nContact form + map"}
                />
            </div>
        </form>
    );
}
