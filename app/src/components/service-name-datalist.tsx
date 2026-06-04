import { listServices } from "@/lib/data/services";

/**
 * Server component that renders an HTML5 <datalist> of active service names.
 * Pair with `<input list="services-datalist" />` on description inputs.
 */
export async function ServiceNameDatalist() {
    const services = await listServices();
    const active = services.filter((s) => s.active);
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
