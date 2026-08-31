/**
 * Builds a wa.me link from a stored lead phone number, or null when the
 * number can't be dialled. Handles the formats closers actually type:
 * "012-345 6789", "+60 12 345 6789", "60123456789", "0123456789".
 * Malaysian local numbers (leading 0) get the 60 country code; anything
 * already international is passed through. wa.me opens the WhatsApp app
 * directly on phones and WhatsApp Web on desktop.
 */
export function waHref(
    phone: string | null | undefined,
    name?: string | null,
): string | null {
    if (!phone) return null;
    let d = phone.replace(/[^\d+]/g, "");
    if (d.startsWith("+")) d = d.slice(1);
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("0")) d = "60" + d.slice(1);
    if (!/^\d{9,15}$/.test(d)) return null;
    const first = (name ?? "").trim().split(/\s+/)[0];
    const text = first ? `?text=${encodeURIComponent(`Hi ${first}, `)}` : "";
    return `https://wa.me/${d}${text}`;
}
