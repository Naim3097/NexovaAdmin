/**
 * Kuala Lumpur public holidays (national days plus the Federal Territory
 * ones), including replacement days when a holiday falls on a Sunday. The
 * calendars grey these days out like Friday to Sunday, and capacity takes
 * the ones that fall Monday to Thursday off the month's working days. Work
 * can still be planned on them. Pure module.
 *
 * Source: officeholidays.com and the Cabinet holiday lists (HKA 2026 and
 * HKA 2027) as reported by humanresourcesonline.net, read 2026-11-12. Islamic
 * dates follow the moon sighting and can move by a day: check the gazette
 * each year and edit this list. 2027 Deepavali is listed as 28 Oct (one
 * source says 29 Oct).
 */
export type Holiday = { date: string; name: string };

export const KL_HOLIDAYS: readonly Holiday[] = [
    // 2026
    { date: "2026-01-01", name: "New Year's Day" },
    { date: "2026-02-01", name: "Thaipusam · Federal Territory Day" },
    { date: "2026-02-02", name: "Federal Territory Day (replacement)" },
    { date: "2026-02-03", name: "Thaipusam (replacement)" },
    { date: "2026-02-17", name: "Chinese New Year" },
    { date: "2026-02-18", name: "Chinese New Year (second day)" },
    { date: "2026-03-07", name: "Nuzul Al-Quran" },
    { date: "2026-03-21", name: "Hari Raya Aidilfitri" },
    { date: "2026-03-22", name: "Hari Raya Aidilfitri (second day)" },
    { date: "2026-03-23", name: "Hari Raya Aidilfitri (replacement)" },
    { date: "2026-05-01", name: "Labour Day" },
    { date: "2026-05-27", name: "Hari Raya Haji" },
    { date: "2026-05-31", name: "Wesak Day" },
    { date: "2026-06-01", name: "Agong's Birthday" },
    { date: "2026-06-17", name: "Awal Muharram" },
    { date: "2026-08-25", name: "Maulidur Rasul" },
    { date: "2026-08-31", name: "National Day" },
    { date: "2026-09-16", name: "Malaysia Day" },
    { date: "2026-11-08", name: "Deepavali" },
    { date: "2026-11-09", name: "Deepavali (replacement)" },
    { date: "2026-12-25", name: "Christmas Day" },
    // 2027
    { date: "2027-01-01", name: "New Year's Day" },
    { date: "2027-01-22", name: "Thaipusam" },
    { date: "2027-02-01", name: "Federal Territory Day" },
    { date: "2027-02-06", name: "Chinese New Year" },
    { date: "2027-02-07", name: "Chinese New Year (second day)" },
    { date: "2027-02-24", name: "Nuzul Al-Quran" },
    { date: "2027-03-10", name: "Hari Raya Aidilfitri" },
    { date: "2027-03-11", name: "Hari Raya Aidilfitri (second day)" },
    { date: "2027-05-01", name: "Labour Day" },
    { date: "2027-05-17", name: "Hari Raya Haji" },
    { date: "2027-05-20", name: "Wesak Day" },
    { date: "2027-06-06", name: "Awal Muharram" },
    { date: "2027-06-07", name: "Agong's Birthday" },
    { date: "2027-08-15", name: "Maulidur Rasul" },
    { date: "2027-08-31", name: "National Day" },
    { date: "2027-09-16", name: "Malaysia Day" },
    { date: "2027-10-28", name: "Deepavali" },
    { date: "2027-12-25", name: "Christmas Day" },
];

const BY_DATE = new Map(KL_HOLIDAYS.map((h) => [h.date, h.name]));

/** The holiday's name on a YYYY-MM-DD, or "" on an ordinary day. */
export function holidayName(ymd: string): string {
    return BY_DATE.get(ymd) ?? "";
}

export function isHoliday(ymd: string): boolean {
    return BY_DATE.has(ymd);
}

/** The holidays in a YYYY-MM, in date order. */
export function holidaysIn(month: string): Holiday[] {
    return KL_HOLIDAYS.filter((h) => h.date.startsWith(month));
}
