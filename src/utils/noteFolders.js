export const getTodayIsoDate = () => new Date().toISOString().split('T')[0];

export const getTodayNotesFolderName = (date = getTodayIsoDate()) =>
    `\u4eca\u65e5\u7b14\u8bb0 ${date}`;

export const isDateNoteTag = (value) => {
    const tag = String(value || '').trim();
    return (
        /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(tag) ||
        /^\u4eca\u65e5\u7b14\u8bb0\s+\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(tag) ||
        /^today\s*notes?\s+\d{4}[-/]\d{1,2}[-/]\d{1,2}$/i.test(tag)
    );
};

export const normalizeNoteTags = (tags = []) => {
    const seen = new Set();
    return (Array.isArray(tags) ? tags : [])
        .map((tag) => String(tag || '').trim())
        .filter(Boolean)
        .filter((tag) => {
            const key = tag.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
};

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
