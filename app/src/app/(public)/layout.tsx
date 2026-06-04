import { Logo } from "@/components/logo";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-dvh bg-muted/40">
            <header className="border-b bg-background">
                <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
                    <Logo className="h-5" />
                </div>
            </header>
            {children}
        </div>
    );
}
