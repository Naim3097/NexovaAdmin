import { unstable_cache } from "next/cache";
import { listClients } from "@/lib/data/clients";

/**
 * Client names change rarely but this list renders on EVERY admin page, so we
 * cache it across requests (tag-invalidated when clients are mutated) instead
 * of hitting the DB on every navigation.
 */
const getClientNames = unstable_cache(
    async () => (await listClients()).map((c) => ({ id: c.id, name: c.name })),
    ["clients-datalist"],
    { tags: ["clients"], revalidate: 300 },
);

/**
 * Server component that renders an HTML5 <datalist> of all known client names.
 * Pair with `<input list="clients-datalist" />` on any name input.
 */
export async function ClientNameDatalist() {
    const clients = await getClientNames();
    return (
        <datalist id="clients-datalist">
            {clients.map((c) => (
                <option key={c.id} value={c.name} />
            ))}
        </datalist>
    );
}
