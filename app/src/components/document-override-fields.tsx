import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BrandLogo } from "@/lib/data/agency";

/**
 * Per-document editable overrides shared by invoices and quotations:
 *   - bill-to / prepared-for address
 *   - which logo shows (agency default / a specific saved logo / none)
 *   - free-text payment details that override the agency bank block
 *
 * Plain server component — the logo picker is a native <select>, so no client
 * JS. Drop it inside the document's edit <form> so the fields submit together.
 */
export function DocumentOverrideFields({
    billToAddress,
    paymentDetails,
    logoChoice,
    logos,
    addressLabel = "Bill to — address",
}: {
    billToAddress: string;
    paymentDetails: string;
    logoChoice: string;
    logos: BrandLogo[];
    addressLabel?: string;
}) {
    return (
        <>
            <div className="space-y-1.5">
                <Label className="text-sm">{addressLabel}</Label>
                <Textarea
                    name="billToAddress"
                    rows={3}
                    defaultValue={billToAddress}
                    placeholder={"Client company\nStreet, City\nPostcode State"}
                />
            </div>

            <div className="space-y-1.5">
                <Label className="text-sm">Logo on this document</Label>
                <select
                    name="logoChoice"
                    defaultValue={logoChoice}
                    className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:max-w-xs"
                >
                    <option value="">Agency default</option>
                    {logos.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                    <option value="none">No logo</option>
                </select>
                {logos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                        No logos saved yet — add some in Settings → Agency.
                    </p>
                ) : null}
            </div>

            <div className="space-y-1.5">
                <Label className="text-sm">
                    Payment details (overrides agency bank info when filled)
                </Label>
                <Textarea
                    name="paymentDetails"
                    rows={3}
                    defaultValue={paymentDetails}
                    placeholder={"Bank: Maybank\nAccount name: Nexova Sdn Bhd\nAccount no: 1234 5678 9012\n(or DuitNow QR / payment terms)"}
                />
            </div>
        </>
    );
}
