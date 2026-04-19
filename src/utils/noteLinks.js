const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

const normalize = (value) => String(value || "").trim().toLowerCase();

export function parseWikiLinkLabel(label) {
    const cleaned = String(label || "").trim();
    const hashIndex = cleaned.indexOf("#");
    if (hashIndex < 0) {
        return {
            title: cleaned,
            section: ""
        };
    }

    return {
        title: cleaned.slice(0, hashIndex).trim(),
        section: cleaned.slice(hashIndex + 1).trim()
    };
}

export function parseWikiLinks(content) {
    const text = String(content || "");
    const links = [];
    let match = WIKI_LINK_RE.exec(text);

    while (match) {
        const raw = match[0];
        const label = match[1];
        const { title, section } = parseWikiLinkLabel(label);

        links.push({
            raw,
            label,
            title,
            section,
            start: match.index,
            end: match.index + raw.length
        });

        match = WIKI_LINK_RE.exec(text);
    }

    return links;
}

export function resolveWikiTarget(notes, title) {
    const normalizedTitle = normalize(title);
    const safeNotes = Array.isArray(notes) ? notes : [];

    const matches = safeNotes.filter((note) => normalize(note?.title) === normalizedTitle);

    if (matches.length === 0) {
        return { status: "none", matches: [] };
    }

    if (matches.length === 1) {
        return { status: "single", matches };
    }

    return { status: "multiple", matches };
}

export function findHeadingOffset(markdown, sectionTitle) {
    const content = String(markdown || "");
    const target = normalize(sectionTitle);
    if (!target) return -1;

    const lines = content.split("\n");
    let offset = 0;
    for (const line of lines) {
        const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)\s*$/);
        if (heading && normalize(heading[1]) === target) {
            return offset;
        }
        offset += line.length + 1;
    }

    return -1;
}

