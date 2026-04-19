const TRANSLATION_EXAMPLE_POOL_KEY = 'smartlearn_translation_note_examples_v1';

const DEFAULT_KNOWLEDGE_LINKING = {
    enabled: true,
    autoSyncOnSave: false,
    rules: {
        writingGuidanceToMaterials: true,
        examplesToTranslation: true
    }
};

const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*$/;
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/;

const normalizeText = (value) =>
    String(value || '')
        .replace(/\r\n?/g, '\n')
        .trim();

const normalizeHeading = (value) =>
    normalizeText(value)
        .toLowerCase()
        .replace(/^[\d一二三四五六七八九十]+[\s.)、．-]*/g, '')
        .replace(/[`*_~]/g, '')
        .replace(/[：:]/g, '')
        .replace(/\s+/g, ' ');

const stripMarkdown = (value) => {
    const text = normalizeText(value);
    return text
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
        .replace(/[*_~>#]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const parseAttrMap = (text = '') => {
    const map = {};
    String(text || '')
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((pair) => {
            const eq = pair.indexOf('=');
            if (eq <= 0) return;
            const key = pair.slice(0, eq).trim();
            const value = pair.slice(eq + 1).trim();
            if (!key) return;
            map[key] = value;
        });
    return map;
};

const normalizeContentForHash = (value) => stripMarkdown(value).toLowerCase();

const matchesAlias = (heading, aliases) => aliases.some((alias) => heading === alias || heading.startsWith(`${alias} `));

const resolveBlockType = (headingRaw) => {
    const heading = normalizeHeading(headingRaw);
    if (!heading) return null;

    const includesAny = (values) => values.some((value) => heading.includes(value));

    if (includesAny(['写作指导', '写作建议', 'writing guidance', 'writing guide', '提分点', '考试应用', '备考策略'])) {
        return 'writing_guidance';
    }
    if (includesAny(['例句', 'example sentence', 'example sentences', 'examples', '句子示例'])) {
        return 'examples';
    }

    if (matchesAlias(heading, ['写作指导', '写作建议', 'writing guidance', 'writing guide'])) {
        return 'writing_guidance';
    }
    if (matchesAlias(heading, ['例句', 'example', 'examples', 'example sentences', '句子示例'])) {
        return 'examples';
    }
    return null;
};

const simpleHash = (input) => {
    let h = 2166136261;
    const text = String(input || '');
    for (let i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
};

export const buildKnowledgeSourceHash = ({ sourceNoteId, blockType, text }) => {
    return simpleHash(`${String(sourceNoteId || '')}|${String(blockType || '')}|${normalizeContentForHash(text)}`);
};

const splitHeadingBlocks = (markdown) => {
    const text = normalizeText(markdown);
    const lines = text.split('\n');
    const blocks = [];

    let current = null;
    lines.forEach((line) => {
        const match = line.match(HEADING_RE);
        if (match) {
            if (current) blocks.push(current);
            current = { heading: match[1], body: [] };
            return;
        }
        if (!current) return;
        current.body.push(line);
    });

    if (current) blocks.push(current);
    return blocks;
};

const parseDirectiveBlocks = (markdown, sourceNoteId = '') => {
    const text = normalizeText(markdown);
    const lines = text.split('\n');
    const blocks = [];

    const isDirectiveLine = (line) => /^\s*@(?:素材|翻译例句|替换词)/.test(String(line || '').trim());
    const readDirectiveBody = (startIndex) => {
        const body = [];
        let i = startIndex + 1;
        for (; i < lines.length; i += 1) {
            const line = lines[i];
            if (isDirectiveLine(line)) break;
            body.push(line);
        }
        return { body, endIndex: i - 1 };
    };

    for (let i = 0; i < lines.length; i += 1) {
        const header = String(lines[i] || '').trim();
        if (!isDirectiveLine(header)) continue;
        const { body, endIndex } = readDirectiveBody(i);

        const materialMatch = header.match(/^@素材(?:\[(?<category>[^\]]+)\])?(?:\{(?<attrs>[^\}]*)\})?$/);
        if (materialMatch) {
            const attrs = parseAttrMap(materialMatch.groups?.attrs || '');
            const category = String(materialMatch.groups?.category || attrs.category || '').trim();
            const bodyLines = body.map((line) => String(line || '').trim()).filter(Boolean);
            const contentLine = bodyLines.find((line) => /^content\s*:/i.test(line));
            const usageLine = bodyLines.find((line) => /^#usage\s+/i.test(line) || /^usage\s*:/i.test(line));
            const cautionLine = bodyLines.find((line) => /^#caution\s+/i.test(line) || /^caution\s*:/i.test(line));
            const content = stripMarkdown(contentLine ? contentLine.replace(/^content\s*:/i, '') : bodyLines[0] || '');
            if (content) {
                const normalizedBlob = [header, ...bodyLines].join('\n');
                blocks.push({
                    type: 'writing_guidance',
                    text: content,
                    section: '@素材',
                    order: 0,
                    sourceNoteId,
                    sourceHash: buildKnowledgeSourceHash({
                        sourceNoteId,
                        blockType: 'writing_guidance',
                        text: normalizedBlob
                    }),
                    meta: {
                        directive: 'material',
                        category: category || attrs.type || '',
                        title: String(attrs.title || '').trim(),
                        usage: stripMarkdown(usageLine ? usageLine.replace(/^#usage\s+|^usage\s*:/i, '') : ''),
                        caution: stripMarkdown(cautionLine ? cautionLine.replace(/^#caution\s+|^caution\s*:/i, '') : ''),
                        topic: String(attrs.topic || '').trim()
                    }
                });
            }
            i = endIndex;
            continue;
        }

        const translationMatch = header.match(/^@翻译例句(?:\{(?<attrs>[^\}]*)\})?$/);
        if (translationMatch) {
            const attrs = parseAttrMap(translationMatch.groups?.attrs || '');
            const bodyLines = body.map((line) => String(line || '').trim()).filter(Boolean);
            const enLine = bodyLines.find((line) => /^EN\s*:/i.test(line));
            const cnLine = bodyLines.find((line) => /^CN\s*:/i.test(line));
            const keywordLine = bodyLines.find((line) => /^#keyword\s+/i.test(line) || /^keyword\s*:/i.test(line));
            const enText = stripMarkdown(enLine ? enLine.replace(/^EN\s*:/i, '') : bodyLines[0] || '');
            if (enText) {
                const normalizedBlob = [header, ...bodyLines].join('\n');
                blocks.push({
                    type: 'examples',
                    text: enText,
                    section: '@翻译例句',
                    order: 0,
                    sourceNoteId,
                    sourceHash: buildKnowledgeSourceHash({
                        sourceNoteId,
                        blockType: 'examples',
                        text: normalizedBlob
                    }),
                    meta: {
                        directive: 'translation',
                        cn: stripMarkdown(cnLine ? cnLine.replace(/^CN\s*:/i, '') : ''),
                        scene: String(attrs.scene || '').trim(),
                        keyword: stripMarkdown(keywordLine ? keywordLine.replace(/^#keyword\s+|^keyword\s*:/i, '') : '')
                    }
                });
            }
            i = endIndex;
            continue;
        }

        const vocabMatch = header.match(/^@替换词(?:\{(?<attrs>[^\}]*)\})?$/);
        if (vocabMatch) {
            const attrs = parseAttrMap(vocabMatch.groups?.attrs || '');
            const bodyLines = body.map((line) => String(line || '').trim()).filter(Boolean);
            const sourceLine = bodyLines.find((line) => /^source\s*:/i.test(line));
            const targetLine = bodyLines.find((line) => /^target\s*:/i.test(line));
            const reasonLine = bodyLines.find((line) => /^reason\s*:/i.test(line));
            const exampleLine = bodyLines.find((line) => /^example\s*:/i.test(line));
            const sourceTerm = stripMarkdown(sourceLine ? sourceLine.replace(/^source\s*:/i, '') : '');
            const targetTerm = stripMarkdown(targetLine ? targetLine.replace(/^target\s*:/i, '') : '');
            if (sourceTerm && targetTerm) {
                const normalizedBlob = [header, ...bodyLines].join('\n');
                blocks.push({
                    type: 'writing_guidance',
                    text: `${sourceTerm} => ${targetTerm}`,
                    section: '@替换词',
                    order: 0,
                    sourceNoteId,
                    sourceHash: buildKnowledgeSourceHash({
                        sourceNoteId,
                        blockType: 'writing_guidance',
                        text: normalizedBlob
                    }),
                    meta: {
                        directive: 'vocab',
                        title: String(attrs.title || `${sourceTerm} → ${targetTerm}`).trim(),
                        sourceTerm,
                        targetTerm,
                        replaceReason: stripMarkdown(reasonLine ? reasonLine.replace(/^reason\s*:/i, '') : ''),
                        afterExample: stripMarkdown(exampleLine ? exampleLine.replace(/^example\s*:/i, '') : '')
                    }
                });
            }
            i = endIndex;
        }
    }

    return blocks;
};

const extractBlockItems = (bodyLines) => {
    const lines = Array.isArray(bodyLines) ? bodyLines : [];
    const items = [];

    lines.forEach((line) => {
        const raw = normalizeText(line);
        if (!raw) return;
        const listHit = raw.match(LIST_ITEM_RE);
        const text = stripMarkdown(listHit ? listHit[1] : raw);
        if (text.length < 4) return;
        items.push(text);
    });

    if (items.length > 0) return items;

    return normalizeText(lines.join('\n'))
        .split(/\n\s*\n/)
        .map((chunk) => stripMarkdown(chunk))
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk.length >= 6);
};

export const parseKnowledgeBlocks = (markdown, sourceNoteId = '') => {
    const blocks = splitHeadingBlocks(markdown);
    const results = [];

    blocks.forEach((block) => {
        const type = resolveBlockType(block.heading);
        if (!type) return;
        const items = extractBlockItems(block.body);
        items.forEach((text, idx) => {
            results.push({
                type,
                text,
                section: block.heading,
                order: idx,
                sourceNoteId,
                sourceHash: buildKnowledgeSourceHash({
                    sourceNoteId,
                    blockType: type,
                    text
                })
            });
        });
    });

    const directiveBlocks = parseDirectiveBlocks(markdown, sourceNoteId);
    return [...results, ...directiveBlocks];
};

export const getDefaultKnowledgeLinkingSettings = () => ({
    enabled: DEFAULT_KNOWLEDGE_LINKING.enabled,
    autoSyncOnSave: DEFAULT_KNOWLEDGE_LINKING.autoSyncOnSave,
    rules: { ...DEFAULT_KNOWLEDGE_LINKING.rules }
});

export const normalizeKnowledgeLinkingSettings = (value) => {
    const incoming = value && typeof value === 'object' ? value : {};
    const rules = incoming.rules && typeof incoming.rules === 'object' ? incoming.rules : {};
    return {
        enabled: incoming.enabled !== false,
        autoSyncOnSave: incoming.autoSyncOnSave === true,
        rules: {
            writingGuidanceToMaterials: rules.writingGuidanceToMaterials !== false,
            examplesToTranslation: rules.examplesToTranslation !== false
        }
    };
};

const readExamplePoolRaw = () => {
    try {
        const raw = localStorage.getItem(TRANSLATION_EXAMPLE_POOL_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writeExamplePoolRaw = (items) => {
    const safe = Array.isArray(items) ? items : [];
    try {
        localStorage.setItem(TRANSLATION_EXAMPLE_POOL_KEY, JSON.stringify(safe));
    } catch {
        // ignore quota errors
    }
};

export const readTranslationLinkedExamples = () => {
    return readExamplePoolRaw()
        .map((item) => ({
            text: String(item?.text || '').trim(),
            sourceNoteId: String(item?.sourceNoteId || '').trim(),
            sourceNoteTitle: String(item?.sourceNoteTitle || '').trim(),
            sourceSection: String(item?.sourceSection || '').trim(),
            sourceHash: String(item?.sourceHash || '').trim(),
            updatedAt: Number(item?.updatedAt || 0) || 0
        }))
        .filter((item) => item.text && item.sourceHash);
};

export const removeTranslationLinkedExamplesByNoteId = (noteId) => {
    const target = String(noteId || '').trim();
    if (!target) return;
    const next = readTranslationLinkedExamples().filter((item) => item.sourceNoteId !== target);
    writeExamplePoolRaw(next);
};

export const upsertTranslationLinkedExamplesForNote = ({ noteId, noteTitle, blocks }) => {
    const sourceNoteId = String(noteId || '').trim();
    if (!sourceNoteId) return [];

    const sourceNoteTitle = String(noteTitle || '').trim();
    const now = Date.now();
    const existing = readTranslationLinkedExamples().filter((item) => item.sourceNoteId !== sourceNoteId);
    const incoming = (Array.isArray(blocks) ? blocks : [])
        .map((item) => ({
            text: stripMarkdown(item?.text || ''),
            sourceNoteId,
            sourceNoteTitle,
            sourceSection: String(item?.section || '').trim(),
            sourceHash: String(item?.sourceHash || '').trim() || buildKnowledgeSourceHash({
                sourceNoteId,
                blockType: 'examples',
                text: item?.text || ''
            }),
            updatedAt: now
        }))
        .filter((item) => item.text && item.sourceHash);

    const map = new Map();
    [...existing, ...incoming].forEach((item) => {
        if (!item?.sourceHash) return;
        map.set(item.sourceHash, item);
    });
    const merged = Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    writeExamplePoolRaw(merged);
    return merged;
};
