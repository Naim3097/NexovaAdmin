import { Skeleton } from "@/components/ui/skeleton";

export default function ManagementLoading() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-8 w-40" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                ))}
            </div>
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-64 w-full" />
        </div>
    );
}
