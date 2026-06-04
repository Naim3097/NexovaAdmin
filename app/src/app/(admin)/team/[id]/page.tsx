import { notFound } from "next/navigation";
import Link from "next/link";
import { TEAM_ROLES, getTeamMemberById } from "@/lib/data/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    deleteTeamMemberAction,
    updateTeamMemberAction,
} from "@/lib/team/actions";

export const dynamic = "force-dynamic";

export default async function TeamMemberPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const m = await getTeamMemberById(id);
    if (!m) notFound();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <Link
                        href="/team"
                        className="text-xs text-muted-foreground hover:underline"
                    >
                        ← Team
                    </Link>
                    <h1 className="mt-1 text-2xl font-semibold md:text-3xl">
                        {m.name}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {m.role}
                        {m.active ? "" : " · inactive"}
                    </p>
                </div>
                <Link
                    href={`/my-work?member=${encodeURIComponent(m.name)}`}
                    className="text-sm font-medium underline"
                >
                    View their work →
                </Link>
            </div>

            <form
                action={updateTeamMemberAction}
                className="space-y-4 rounded-lg border bg-card p-4 md:p-6"
            >
                <input type="hidden" name="id" value={m.id} />
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label className="text-sm">Name</Label>
                        <Input name="name" defaultValue={m.name} required />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Role</Label>
                        <Select name="role" defaultValue={m.role}>
                            <SelectTrigger className="h-11">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TEAM_ROLES.map((r) => (
                                    <SelectItem key={r} value={r}>
                                        {r}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Email</Label>
                        <Input
                            name="email"
                            type="email"
                            defaultValue={m.email}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm">Phone</Label>
                        <Input name="phone" type="tel" defaultValue={m.phone} />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label className="text-sm">Skills (comma-separated)</Label>
                    <Input name="skills" defaultValue={m.skills} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        name="active"
                        defaultChecked={m.active}
                        className="size-4 rounded border-input"
                    />
                    Active
                </label>
                <div className="flex justify-end">
                    <Button type="submit">Save</Button>
                </div>
            </form>

            <form
                action={deleteTeamMemberAction}
                className="rounded-lg border border-destructive/40 bg-destructive/5 p-4"
            >
                <input type="hidden" name="id" value={m.id} />
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-destructive">
                            Delete member
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Removes the record. Existing assignments keep the
                            name string.
                        </p>
                    </div>
                    <Button type="submit" variant="destructive">
                        Delete
                    </Button>
                </div>
            </form>
        </div>
    );
}
