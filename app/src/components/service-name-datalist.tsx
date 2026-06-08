import { unstable_cache } from "next/cache";
import { listServices } from "@/lib/data/services";

/**
 * Services change rarely but this list renders on EVERY admin page, so we cache
 * it across requests (tag-invalidated when services are mutated).
 */
const getActiveServices = unstable_cache(
    async () =>
        (await listServices())
            .filter((s) => s.active)
            .map((s) => ({
                id: s.id,
                name: s.name,
                defaultPrice: s.defaultPrice,
                unit: s.unit,
            })),
    ["services-datalist"],
    { tags: ["services"], revalidate: 300 },
);

/**
 * Server component that renders an HTML5 <datalist> of active service names.
 * Pair with `<input list="services-datalist" />` on description inputs.
 */
export async function ServiceNameDatalist() {
    const active = await getActiveServices();
    return (
        <datalist id="services-datalist">
            {active.map((s) => (
                <option
                    key={s.id}
                    value={s.name}
                    label={`MYR ${s.defaultPrice.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })} / ${s.unit}`}
                />
            ))}
        </datalist>
    );
}
