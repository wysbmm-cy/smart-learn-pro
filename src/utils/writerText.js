export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const normalizeSelectionText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

export const normalizeCompareText = (text) => String(text || '').replace(/\s+/g, ' ').trim();

export const escapeRegExp = (text) => String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const sentenceRanges = (text) => {
    const source = String(text || '');
    const ranges = [];
    const regex = /[^.!?。！？\n]+[.!?。！？]?[\s]*/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
        ranges.push({ start: match.index, end: match.index + match[0].length });
    }
    if (!ranges.length && source.length) ranges.push({ start: 0, end: source.length });
    return ranges;
};

export const splitParagraphs = (text) => {
    const raw = String(text || '');
    if (raw === '') return [];
    return raw.split(/\n\s*\n/).map((p) => p.replace(/^\n+|\n+$/g, ''));
};

export const stripOutlineParagraphLabel = (text) => String(text || '')
    .replace(/^\s*(?:(?:body\s+)?(?:paragraph|para\.?|p)|\u6bb5\u843d)\s*[\dIVXLC]+\s*[:\uFF1A.\-)]+\s*/i, '')
    .trim();

export const buildOutlineSeedContent = (outline) => (outline?.paragraphs || [])
    .map((paragraph) => stripOutlineParagraphLabel(paragraph?.topic_sentence || ''))
    .filter(Boolean)
    .join('\n\n');

export const splitSentences = (text) => {
    const cleaned = String(text || '').replace(/\n+/g, ' ').trim();
    if (!cleaned) return [];
    const rows = cleaned.match(/[^.!?。！？]+[.!?。！？]?/g) || [];
    return rows.map((x) => x.trim()).filter(Boolean);
};

export const buildSentenceChanges = (before, after) => {
    const beforeRows = splitSentences(before);
    const afterRows = splitSentences(after);
    const size = Math.max(beforeRows.length, afterRows.length);
    const changes = [];
    for (let i = 0; i < size; i += 1) {
        const oldSentence = beforeRows[i] || '';
        const newSentence = afterRows[i] || '';
        if (normalizeCompareText(oldSentence) === normalizeCompareText(newSentence)) continue;
        changes.push({
            index: i + 1,
            before: oldSentence || '（该句为新增）',
            after: newSentence || '（该句被删除）'
        });
    }
    return changes;
};

const OUTLINE_STOP_WORDS = new Set([
    'the', 'this', 'that', 'with', 'from', 'have', 'will', 'your', 'about', 'into', 'than',
    'they', 'them', 'their', 'while', 'should', 'would', 'could', 'what', 'which', 'where',
    'when', 'been', 'being', 'also', 'more', 'most', 'very', 'some', 'many', 'such', 'then'
]);

export const extractOutlineKeywords = (text) => {
    const raw = String(text || '').toLowerCase();
    const tokens = raw.match(/[a-zA-Z]{4,}|[\u4e00-\u9fa5]{2,}/g) || [];
    const filtered = tokens.filter((token) => !OUTLINE_STOP_WORDS.has(token));
    return Array.from(new Set(filtered)).slice(0, 8);
};

export const getCoverageStatus = (scopeText, outlineText) => {
    const scope = String(scopeText || '').toLowerCase();
    const keywords = extractOutlineKeywords(outlineText);
    if (!keywords.length) return { status: 'pending', hit: 0, total: 0 };
    const hit = keywords.filter((keyword) => scope.includes(keyword)).length;
    const ratio = hit / keywords.length;
    if (hit === 0) return { status: 'pending', hit, total: keywords.length };
    if (hit >= 2 || ratio >= 0.5) return { status: 'covered', hit, total: keywords.length };
    return { status: 'partial', hit, total: keywords.length };
};

export const parseVocabularyPairs = (item) => {
    const source = String(item?.sourceTerm || '').trim();
    const target = String(item?.targetTerm || '').trim();
    if (source && target) {
        return [{ source, target, reason: String(item?.replaceReason || '').trim() }];
    }

    const raw = String(item?.content || '');
    const rows = raw
        .split(/[\n;；]+/)
        .map((row) => row.trim())
        .filter(Boolean);

    const pairs = [];
    for (const row of rows) {
        const match = row.match(/^(.+?)\s*(?:->|=>|→)\s*(.+)$/);
        if (!match) continue;
        const rowSource = String(match[1] || '').trim();
        const rowTarget = String(match[2] || '').trim();
        if (!rowSource || !rowTarget) continue;
        pairs.push({ source: rowSource, target: rowTarget, reason: '' });
    }
    return pairs;
};

export const resolveAnchorForContent = (anchorCandidate, textContent, fallbackBlockIndex = 0) => {
    const sourceParts = splitParagraphs(textContent);
    const parts = sourceParts.length ? sourceParts : [''];
    const rawBlock = Number(anchorCandidate?.blockIndex);
    const blockIndex = clamp(Number.isFinite(rawBlock) ? rawBlock : fallbackBlockIndex, 0, Math.max(0, parts.length - 1));
    const blockText = String(parts[blockIndex] || '');
    const rawOffset = Number(anchorCandidate?.offset);
    const offset = clamp(Number.isFinite(rawOffset) ? rawOffset : blockText.length, 0, blockText.length);
    let selectedRange = null;

    if (anchorCandidate?.selectedRange) {
        const start = clamp(Number(anchorCandidate.selectedRange.start) || 0, 0, blockText.length);
        const end = clamp(Number(anchorCandidate.selectedRange.end) || 0, 0, blockText.length);
        if (end > start) {
            selectedRange = {
                start,
                end,
                text: blockText.slice(start, end)
            };
        }
    }

    return { parts, blockIndex, blockText, offset, selectedRange };
};

export const buildInsertPreview = (payload, textContent, fallbackBlockIndex = 0) => {
    const insertText = String(payload?.text || '').trim();
    if (!insertText) {
        return { ok: false, error: '插入内容为空' };
    }

    const mode = ['cursor', 'after_paragraph', 'replace_selected_sentence'].includes(payload?.mode)
        ? payload.mode
        : 'cursor';
    const anchorResolved = resolveAnchorForContent(payload?.anchor, textContent, fallbackBlockIndex);
    const { parts, blockIndex, blockText, offset, selectedRange } = anchorResolved;
    const nextParts = [...parts];
    let targetBlockIndex = blockIndex;
    let targetLabel = `P${blockIndex + 1} 光标处`;
    let nextAnchor = { blockIndex, offset, selectedRange: null };

    if (mode === 'after_paragraph') {
        targetBlockIndex = Math.min(blockIndex + 1, nextParts.length);
        nextParts.splice(targetBlockIndex, 0, insertText);
        targetLabel = `P${blockIndex + 1} 后新增段落`;
        nextAnchor = { blockIndex: targetBlockIndex, offset: insertText.length, selectedRange: null };
    } else if (mode === 'replace_selected_sentence') {
        if (!selectedRange) {
            return { ok: false, error: '请先在写作区选中要替换的句子' };
        }
        const nextBlock = `${blockText.slice(0, selectedRange.start)}${insertText}${blockText.slice(selectedRange.end)}`;
        nextParts[blockIndex] = nextBlock;
        targetLabel = `替换 P${blockIndex + 1} 选中句`;
        nextAnchor = {
            blockIndex,
            offset: selectedRange.start + insertText.length,
            selectedRange: null
        };
    } else {
        const left = blockText.slice(0, offset);
        const right = blockText.slice(offset);
        const needSpaceLeft = left.length > 0 && !/[\s([{"'`-]$/.test(left);
        const needSpaceRight = right.length > 0 && !/^[\s)\]}.,!?;:，。！？；：]/.test(right);
        const insertedBlock = `${left}${needSpaceLeft ? ' ' : ''}${insertText}${needSpaceRight ? ' ' : ''}${right}`;
        nextParts[blockIndex] = insertedBlock;
        targetLabel = `P${blockIndex + 1} 光标处插入`;
        nextAnchor = {
            blockIndex,
            offset: left.length + (needSpaceLeft ? 1 : 0) + insertText.length,
            selectedRange: null
        };
    }

    const nextContent = nextParts.filter((item) => String(item || '').trim().length > 0).join('\n\n') || insertText;
    const previewBefore = String(parts[Math.min(targetBlockIndex, Math.max(0, parts.length - 1))] || '');
    const previewAfterParts = splitParagraphs(nextContent);
    const previewAfter = String(previewAfterParts[Math.min(targetBlockIndex, Math.max(0, previewAfterParts.length - 1))] || '');

    return {
        ok: true,
        mode,
        targetLabel,
        previewBefore,
        previewAfter,
        nextContent,
        nextAnchor
    };
};
