import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAgencyProfile } from "@/lib/data/agency";
import { updateAgencyProfileAction } from "@/lib/agency/actions";

export const dynamic = "force-dynamic";

export default async function AgencyProfilePage() {
    const p = await getAgencyProfile();
    const lastSaved =
        p.updatedAt && p.updatedAt > new Date(0).toISOString()
            ? new Date(p.updatedAt).toLocaleString()
            : "never";

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/settings"
                    className="text-sm text-muted-foreground hover:underline"
                >
                    ← Back to settings
                </Link>
                <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
                    Agency profile
                </h1>
                <p className="text-sm text-muted-foreground">
                    Used on invoice headers, exported reports, and outbound
                    emails. Last saved: {lastSaved}.
                </p>
            </div>

            <form
                action={updateAgencyProfileAction}
                className="space-y-6 rounded-lg border bg-card p-4 md:p-6"
            >
                <section className="space-y-4">
                    <h2 className="text-sm font-medium">Identity</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="legalName">Legal name</Label>
                            <Input
                                id="legalName"
                                name="legalName"
                                defaultValue={p.legalName}
                                placeholder="Nexov Sdn. Bhd."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="displayName">Display name</Label>
                            <Input
                                id="displayName"
                                name="displayName"
                                defaultValue={p.displayName}
                                placeholder="Nexov"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="registrationNo">
                                Registration no.
                            </Label>
                            <Input
                                id="registrationNo"
                                name="registrationNo"
                                defaultValue={p.registrationNo}
                                placeholder="202501012345"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="sstNo">SST no.</Label>
                            <Input
                                id="sstNo"
                                name="sstNo"
                                defaultValue={p.sstNo}
                                placeholder="W10-1234-56789012"
                            />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm font-medium">Contact</h2>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                defaultValue={p.email}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="phone">Phone</Label>
                            <Input
                                id="phone"
                                name="phone"
                                defaultValue={p.phone}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="websiteUrl">Website</Label>
                            <Input
                                id="websiteUrl"
                                name="websiteUrl"
                                type="url"
                                defaultValue={p.websiteUrl}
                            />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm font-medium">Address</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-1.5 md:col-span-2">
                            <Label htmlFor="addressLine1">Line 1</Label>
                            <Input
                                id="addressLine1"
                                name="addressLine1"
                                defaultValue={p.addressLine1}
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <Label htmlFor="addressLine2">Line 2</Label>
                            <Input
                                id="addressLine2"
                                name="addressLine2"
                                defaultValue={p.addressLine2}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="city">City</Label>
                            <Input
                                id="city"
                                name="city"
                                defaultValue={p.city}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="state">State</Label>
                            <Input
                                id="state"
                                name="state"
                                defaultValue={p.state}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="postcode">Postcode</Label>
                            <Input
                                id="postcode"
                                name="postcode"
                                defaultValue={p.postcode}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="country">Country</Label>
                            <Input
                                id="country"
                                name="country"
                                defaultValue={p.country}
                            />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm font-medium">Bank (for invoices)</h2>
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="bankName">Bank name</Label>
                            <Input
                                id="bankName"
                                name="bankName"
                                defaultValue={p.bankName}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="bankAccountName">
                                Account name
                            </Label>
                            <Input
                                id="bankAccountName"
                                name="bankAccountName"
                                defaultValue={p.bankAccountName}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="bankAccountNo">Account no.</Label>
                            <Input
                                id="bankAccountNo"
                                name="bankAccountNo"
                                defaultValue={p.bankAccountNo}
                            />
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm font-medium">
                        Default invoice footer
                    </h2>
                    <Textarea
                        id="invoiceFooter"
                        name="invoiceFooter"
                        rows={3}
                        defaultValue={p.invoiceFooter}
                        placeholder="Thank you for your business. Payment due within 14 days of issue."
                    />
                    <p className="text-xs text-muted-foreground">
                        Shown at the bottom of every invoice detail view.
                    </p>
                </section>

                <div className="flex justify-end">
                    <Button type="submit">Save profile</Button>
                </div>
            </form>
        </div>
    );
}
