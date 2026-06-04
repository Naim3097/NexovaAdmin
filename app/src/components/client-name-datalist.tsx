import { listClients } from "@/lib/data/clients";

/**
 * Server component that renders an HTML5 <datalist> of all known client names.
 * Pair with `<input list="clients-datalist" />` on any name input.
 */
export async function ClientNameDatalist() {
    const clients = await listClients();
    return (
        <datalist id="clients-datalist">
            {clients.map((c) => (
                <option key={c.id} value={c.name} />
            ))}
        </datalist>
    );
}
