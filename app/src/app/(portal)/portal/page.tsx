import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PortalHomePage() {
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-2xl font-semibold">Welcome</h1>
                <p className="text-sm text-muted-foreground">
                    Your projects, forms, and invoices live here.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Onboarding</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    Once your project starts, your onboarding form will appear here.
                </CardContent>
            </Card>
        </div>
    );
}
