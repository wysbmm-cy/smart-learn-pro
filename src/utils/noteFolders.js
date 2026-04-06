export const getTodayIsoDate = () => new Date().toISOString().split('T')[0];

export const getTodayNotesFolderName = (date = getTodayIsoDate()) =>
    `\u4eca\u65e5\u7b14\u8bb0 ${date}`;

const normalizeName = (value) => String(value || '').trim();

export const resolveTodayNotesFolderName = (folders = [], date = getTodayIsoDate()) => {
    const names = (folders || [])
        .map((f) => normalizeName(f?.name))
        .filter(Boolean);

    const canonical = getTodayNotesFolderName(date);
    if (names.some((name) => name === canonical)) return canonical;

    const dated = names.filter((name) => name.includes(date));
    if (dated.length) {
        const preferred = dated.find((name) =>
            /\u4eca\u65e5\u7b14\u8bb0|today\s*notes|notes\s*-\s*/i.test(name)
        );
        return preferred || dated[0];
    }

    return canonical;
};

