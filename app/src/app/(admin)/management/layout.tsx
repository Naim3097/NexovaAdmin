import Link from "next/link";
import { ManagementTabs } from "./tabs";

export default function ManagementLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="space-y-4">
            <div>
                <Link href="/dashboard?tab=team" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                    ← Dashboard
                </Link>
                <h1 className="text-2xl font-semibold sm:text-3xl">Management detail</h1>
                <p className="text-sm text-muted-foreground">The full tables behind the numbers: team, pipeline, work, contracts and clients.</p>
            </div>
            <ManagementTabs />
            {children}
        </div>
    );
}
