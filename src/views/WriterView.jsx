import React, { useEffect, useMemo, useRef, useState } from 'react';
import SplitPane from '../components/SplitPane';
import { useApp } from '../context/AppContext';
import {
    PenTool, Save, Sparkles, CheckCircle, AlertCircle, FileText, Trash2, X, Loader2, Layout,
    ChevronRight, BookOpen, History, ListChecks, Target, GraduationCap, Wand2, Plus, Search, FolderOpen, RotateCcw, PanelLeftClose, PanelLeftOpen,
    LayoutList, Columns
} from 'lucide-react';
import { saveWriting, getWritings, deleteWriting, getFlashcards, saveFlashcard, getFolders, saveFolder, saveWritingMaterial, getWritingMaterials, deleteWritingMaterial } from '../services/db';
import { analyzeWriting, generateWritingOutline } from '../services/ai';
import { writingTemplates } from '../data/writingTemplates';
import { WRITING_MATERIAL_CATEGORIES, WRITING_MATERIAL_CATEGORY_LABELS, normalizeMaterialCategory } from '../data/writingMaterials';
import { computeDiff } from '../utils/simpleDiff';
import { getTodayNotesFolderName } from '../utils/noteFolders';
import {
    buildInsertPreview as buildWriterInsertPreview,
    buildSentenceChanges as buildWriterSentenceChanges,
    clamp,
    escapeRegExp as escapeWriterRegExp,
    getCoverageStatus as getWriterCoverageStatus,
    normalizeCompareText as normalizeWriterCompareText,
    normalizeSelectionText,
    parseVocabularyPairs as parseWriterVocabularyPairs,
    resolveAnchorForContent as resolveWriterAnchorForContent,
    sentenceRanges as writerSentenceRanges,
    splitParagraphs as splitWriterParagraphs
} from '../utils/writerText';
import PolishChatModal from '../components/PolishChatModal';
import toast from 'react-hot-toast';

const DEFAULT_EXAM_CONTEXT = { examType: 'CET-6', targetScore: 12, genre: 'Argumentative', wordTarget: 200, prompt: '' };
const STEPS = ['prompt', 'outline', 'write', 'diagnose'];
const MATERIAL_DRAWER_KEY = 'writer_material_drawer_open';
const WRITER_MATERIAL_LAYOUT_DESKTOP_KEY = 'writer_material_layout_desktop';
const WRITER_MATERIAL_LAYOUT_MOBILE_KEY = 'writer_material_layout_mobile';
const CURRENT_WRITING_ID_KEY = 'draft_writer_current_id';
const WRITER_EDITOR_LAYOUT_KEY = 'writer_editor_layout_mode';
const WRITER_MATERIAL_VOCAB_VIEW_KEY = 'writer_material_vocab_view';
const WRITER_MATERIAL_INSERT_MODE_KEY = 'writer_material_insert_last_mode';
const WRITER_LEFT_PANEL_HIDDEN_KEY = 'writer_left_panel_hidden';
const WRITER_LEFT_PANEL_WIDTH_KEY = 'writer_left_panel_width';
const WRITER_MATERIAL_TAB_KEY = 'writer_material_tab';
const WRITER_MATERIAL_HIDE_SOURCE_IDS_KEY = 'writer_material_hide_source_ids';
const WRITER_MATERIAL_PIN_SOURCE_IDS_KEY = 'writer_material_pin_source_ids';
const STEP_META = {
    prompt: { label: '审题', hint: '明确任务与评分目标' },
    outline: { label: '提纲', hint: '组织观点与证据链' },
    write: { label: '写作', hint: '完成草稿并迭代' },
    diagnose: { label: '诊断', hint: '聚焦提分改进项' }
};
const OUTLINE_PURPOSE_OPTIONS = ['Introduction', 'Point 1', 'Point 2', 'Concession', 'Conclusion'];
const INSERT_MODE_OPTIONS = [
    { value: 'cursor', label: '插入到光标' },
    { value: 'after_paragraph', label: '插入到段后' },
    { value: 'replace_selected_sentence', label: '替换选中句' }
];
const READABLE_STEP_META = {
    prompt: { label: '审题', hint: '明确任务与评分目标' },
    outline: { label: '提纲', hint: '组织观点与证据链' },
    write: { label: '写作', hint: '完成草稿并迭代' },
    diagnose: { label: '诊断', hint: '聚焦提分改进项' }
};
const READABLE_INSERT_MODE_OPTIONS = [
    { value: 'cursor', label: '插入到光标' },
    { value: 'after_paragraph', label: '插入到段后' },
    { value: 'replace_selected_sentence', label: '替换选中句' }
];

const normalizeWordFront = (raw) => String(raw || '').split('\n')[0].replace(/\/[^/]+\/$/, '').trim();
const getTodayFlashcardFolderName = () => `Daily - ${new Date().toISOString().split('T')[0]}`;
const isTranslationDraft = (item) => item?.isTranslation === true || item?.type === 'translation' || item?.genre === 'translation';

const sentenceRanges = (text) => {
    const ranges = [];
    const regex = /[^.!?。！？\n]+[.!?。！？]?[\s]*/g;
    let m;
    while ((m = regex.exec(text)) !== null) ranges.push({ start: m.index, end: m.index + m[0].length });
    if (!ranges.length && text.length) ranges.push({ start: 0, end: text.length });
    return ranges;
};

const outlineChecks = (outline) => {
    const rows = outline?.paragraphs || [];
    return {
        thesis: Boolean((outline?.thesis || '').trim()),
        evidence: rows.some(r => (r.evidence_hint || '').trim()),
        concession: rows.some(r => r.concession === true),
        conclusion: Boolean((outline?.conclusion || '').trim())
    };
};

const parseWord = (card) => {
    const raw = (card?.front || '').split('\n')[0].trim().replace(/\/[^/]+\/$/, '').trim();
    return /^[a-zA-Z-]{4,}$/.test(raw) ? raw.toLowerCase() : null;
};
const escapeRegExp = (text) => String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parseVocabularyPairs = (item) => {
    const source = String(item?.sourceTerm || '').trim();
    const target = String(item?.targetTerm || '').trim();
    if (source && target) {
        return [{ source, target, reason: String(item?.replaceReason || '').trim() }];
    }
    const raw = String(item?.content || '');
    const rows = raw
        .split(/[\n;；]+/)
        .map((x) => x.trim())
        .filter(Boolean);
    const pairs = [];
    for (const row of rows) {
        const m = row.match(/^(.+?)\s*(?:->|=>|→)\s*(.+)$/);
        if (!m) continue;
        const s = String(m[1] || '').trim();
        const t = String(m[2] || '').trim();
        if (!s || !t) continue;
        pairs.push({ source: s, target: t, reason: '' });
    }
    return pairs;
};

const splitParagraphs = (text) => {
    const raw = String(text || '');
    if (raw === '') return [];
    return raw.split(/\n\s*\n/).map(p => p.replace(/^\n+|\n+$/g, ''));
};

const normalizeCompareText = (text) => String(text || '').replace(/\s+/g, ' ').trim();

const splitSentences = (text) => {
    const cleaned = String(text || '').replace(/\n+/g, ' ').trim();
    if (!cleaned) return [];
    const rows = cleaned.match(/[^.!?。！？]+[.!?。！？]?/g) || [];
    return rows.map((x) => x.trim()).filter(Boolean);
};

const buildSentenceChanges = (before, after) => {
    const beforeRows = splitSentences(before);
    const afterRows = splitSentences(after);
    const size = Math.max(beforeRows.length, afterRows.length);
    const changes = [];
    for (let i = 0; i < size; i += 1) {
        const b = beforeRows[i] || '';
        const a = afterRows[i] || '';
        if (normalizeCompareText(b) === normalizeCompareText(a)) continue;
        changes.push({
            index: i + 1,
            before: b || '（该句为新增）',
            after: a || '（该句被删除）'
        });
    }
    return changes;
};

const OUTLINE_STOP_WORDS = new Set([
    'the', 'this', 'that', 'with', 'from', 'have', 'will', 'your', 'about', 'into', 'than',
    'they', 'them', 'their', 'while', 'should', 'would', 'could', 'what', 'which', 'where',
    'when', 'been', 'being', 'also', 'more', 'most', 'very', 'some', 'many', 'such', 'then'
]);

const extractOutlineKeywords = (text) => {
    const raw = String(text || '').toLowerCase();
    const tokens = raw.match(/[a-zA-Z]{4,}|[\u4e00-\u9fa5]{2,}/g) || [];
    const filtered = tokens.filter((t) => !OUTLINE_STOP_WORDS.has(t));
    return Array.from(new Set(filtered)).slice(0, 8);
};

const getCoverageStatus = (scopeText, outlineText) => {
    const scope = String(scopeText || '').toLowerCase();
    const keywords = extractOutlineKeywords(outlineText);
    if (!keywords.length) return { status: 'pending', hit: 0, total: 0 };
    const hit = keywords.filter((k) => scope.includes(k)).length;
    const ratio = hit / keywords.length;
    if (hit === 0) return { status: 'pending', hit, total: keywords.length };
    if (hit >= 2 || ratio >= 0.5) return { status: 'covered', hit, total: keywords.length };
    return { status: 'partial', hit, total: keywords.length };
};

const InlineParagraphDiff = ({ oldText, newText, side = 'old' }) => {
    const parts = useMemo(() => computeDiff(oldText || '', newText || ''), [oldText, newText]);
    return (
        <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {parts.map((part, idx) => {
                if (side === 'old' && part.type === 'insert') return null;
                if (side === 'new' && part.type === 'delete') return null;
                if (part.type === 'equal') return <span key={idx} className="text-phy-text/90">{part.value}</span>;
                if (part.type === 'delete') return <span key={idx} className="bg-rose-500/20 text-rose-100 rounded px-0.5">{part.value}</span>;
                if (part.type === 'insert') return <span key={idx} className="bg-emerald-500/20 text-emerald-100 rounded px-0.5">{part.value}</span>;
                return <span key={idx} className="text-phy-text/90">{part.value}</span>;
            })}
        </div>
    );
};

const DEMO_SEED_KEY = 'writer_demo_seed_v1';
const buildDemoMaterials = (examType) => ([
    {
        id: crypto.randomUUID(),
        title: 'Balanced Thesis Opening',
        content: 'While digital platforms have transformed access to information, their influence on mental health should be evaluated with both optimism and caution.',
        rewrite: 'Although online platforms expand access to resources, their long-term psychological effects require a balanced and evidence-based judgment.',
        usage: 'Use in the introduction after paraphrasing the topic.',
        caution: 'Avoid absolute wording like "always" or "never" in thesis statements.',
        category: 'thesis',
        topic: 'digital life & mental health',
        examType,
        tags: [examType, 'intro', 'balanced-stance'],
        source: 'system_demo'
    },
    {
        id: crypto.randomUUID(),
        title: 'Reasoning Core Sentence',
        content: 'The key issue is not technology itself, but the intensity and quality of daily engagement.',
        rewrite: 'What matters is less the existence of technology than the frequency, duration, and purpose of its use.',
        usage: 'Use as a topic sentence at the start of body paragraph 1.',
        caution: 'Follow this sentence with a concrete example, or it sounds abstract.',
        category: 'argument',
        topic: 'usage pattern',
        examType,
        tags: [examType, 'body', 'topic-sentence'],
        source: 'system_demo'
    },
    {
        id: crypto.randomUUID(),
        title: 'Concession and Turn',
        content: 'Admittedly, social media can provide emotional support for isolated users; however, excessive exposure may amplify anxiety and self-comparison.',
        rewrite: 'Granted, social media may reduce loneliness for some users, yet overexposure often intensifies anxiety through constant comparison.',
        usage: 'Use in body paragraph 2 to build concession + rebuttal.',
        caution: 'Do not concede too much; quickly return to your main claim.',
        category: 'transition',
        topic: 'concession',
        examType,
        tags: [examType, 'concession', 'contrast'],
        source: 'system_demo'
    },
    {
        id: crypto.randomUUID(),
        title: 'Conclusion Upgrade',
        content: 'Therefore, a healthier digital future depends on disciplined personal habits and platform-level responsibility, rather than blanket rejection of technology.',
        rewrite: 'In conclusion, improving digital well-being requires both user self-regulation and platform accountability, not a simplistic rejection of innovation.',
        usage: 'Use in final paragraph as the concluding claim.',
        caution: 'Avoid repeating the thesis verbatim; summarize with stronger synthesis.',
        category: 'conclusion',
        topic: 'policy + habit',
        examType,
        tags: [examType, 'conclusion', 'synthesis'],
        source: 'system_demo'
    },
    {
        id: crypto.randomUUID(),
        title: 'Vocabulary Upgrade Bundle',
        content: 'important -> crucial; bad -> detrimental; many people think -> it is widely acknowledged; solve -> address',
        rewrite: 'Replace basic words with precise academic alternatives when revising each paragraph.',
        usage: 'Use during polishing stage, replacing 2-4 low-level words in each paragraph.',
        caution: 'Do not overuse advanced words in one sentence; keep clarity first.',
        category: 'vocabulary',
        topic: 'lexical upgrade',
        examType,
        tags: [examType, 'vocabulary', 'polish'],
        source: 'system_demo'
    }
]);

const buildDemoVocabularyMaterial = (examType) => ({
    id: crypto.randomUUID(),
    title: 'Vocabulary Upgrade Bundle',
    content: 'important -> crucial; bad -> detrimental; many people think -> it is widely acknowledged; solve -> address',
    rewrite: 'Replace basic words with precise academic alternatives when revising each paragraph.',
    usage: 'Use during polishing stage, replacing 2-4 low-level words in each paragraph.',
    caution: 'Do not overuse advanced words in one sentence; keep clarity first.',
    category: 'vocabulary',
    topic: 'lexical upgrade',
    examType,
    tags: [examType, 'vocabulary', 'polish'],
    source: 'system_demo'
});

const getInitialMaterialPanelMode = () => {
    const saved = localStorage.getItem(WRITER_MATERIAL_LAYOUT_DESKTOP_KEY);
    if (saved === 'docked' || saved === 'hidden') return saved;
    const legacy = localStorage.getItem(MATERIAL_DRAWER_KEY);
    return legacy === '1' ? 'docked' : 'hidden';
};

const getInitialMobileMaterialSheet = () => {
    const saved = localStorage.getItem(WRITER_MATERIAL_LAYOUT_MOBILE_KEY);
    if (saved === 'sheet_open') return true;
    if (saved === 'sheet_collapsed') return false;
    const legacy = localStorage.getItem(MATERIAL_DRAWER_KEY);
    return legacy === '1';
};

const readStringList = (key) => {
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map((x) => String(x || '').trim()).filter(Boolean) : [];
    } catch {
        return [];
    }
};

const getMaterialSourceKey = (item) => String(item?.sourceHash || item?.id || '').trim();

const WriterView = ({ params }) => {
    const { settings, saveToNotes, navigateRef } = useApp();
    const [content, setContent] = useState(() => localStorage.getItem('draft_writer_content') || '');
    const [title, setTitle] = useState(() => localStorage.getItem('draft_writer_title') || '');
    const [examContext, setExamContext] = useState(() => {
        try {
            const raw = localStorage.getItem('draft_writer_exam_context');
            return raw ? { ...DEFAULT_EXAM_CONTEXT, ...JSON.parse(raw) } : DEFAULT_EXAM_CONTEXT;
        } catch { return DEFAULT_EXAM_CONTEXT; }
    });
    const [workflowStep, setWorkflowStep] = useState('prompt');
    const [outline, setOutline] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [analysisMode, setAnalysisMode] = useState('polish');
    const [writings, setWritings] = useState([]);
    const [currentId, setCurrentId] = useState(() => localStorage.getItem(CURRENT_WRITING_ID_KEY) || null);
    const [isSaving, setIsSaving] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [mobileTab, setMobileTab] = useState('editor');
    const [selection, setSelection] = useState(null);
    const [cursorPos, setCursorPos] = useState(0);
    const [showPolishModal, setShowPolishModal] = useState(false);
    const [actionChecks, setActionChecks] = useState({});
    const [focusMode, setFocusMode] = useState(false);
    const [isWriterLeftPanelHidden, setIsWriterLeftPanelHidden] = useState(() => localStorage.getItem(WRITER_LEFT_PANEL_HIDDEN_KEY) === '1');
    const [writerLeftPanelWidth, setWriterLeftPanelWidth] = useState(() => {
        const raw = Number(localStorage.getItem(WRITER_LEFT_PANEL_WIDTH_KEY));
        return Number.isFinite(raw) ? clamp(raw, 0, 500) : 320;
    });
    const [autoSaveState, setAutoSaveState] = useState('idle');
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [cards, setCards] = useState([]);
    const [materialPanelMode, setMaterialPanelMode] = useState(getInitialMaterialPanelMode);
    const [mobileMaterialSheetOpen, setMobileMaterialSheetOpen] = useState(getInitialMobileMaterialSheet);
    const [mobileMaterialSheetHeight, setMobileMaterialSheetHeight] = useState(64);
    const [materialManagerModalOpen, setMaterialManagerModalOpen] = useState(false);
    const [materials, setMaterials] = useState([]);
    const [materialQuery, setMaterialQuery] = useState('');
    const [materialCategory, setMaterialCategory] = useState('all');
    const [materialDrawerTab, setMaterialDrawerTab] = useState(() => {
        const saved = localStorage.getItem(WRITER_MATERIAL_TAB_KEY);
        return ['recommend', 'all', 'deep_note'].includes(saved) ? saved : 'recommend';
    });
    const [activeMaterialId, setActiveMaterialId] = useState(null);
    const [hiddenSourceIds, setHiddenSourceIds] = useState(() => readStringList(WRITER_MATERIAL_HIDE_SOURCE_IDS_KEY));
    const [pinnedSourceIds, setPinnedSourceIds] = useState(() => readStringList(WRITER_MATERIAL_PIN_SOURCE_IDS_KEY));
    const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
    const [pendingInsert, setPendingInsert] = useState(null);
    const [insertAnchor, setInsertAnchor] = useState({ blockIndex: 0, offset: 0, selectedRange: null });
    const [insertModePreference, setInsertModePreference] = useState(() => localStorage.getItem(WRITER_MATERIAL_INSERT_MODE_KEY) || 'cursor');
    const [vocabView, setVocabView] = useState(() => localStorage.getItem(WRITER_MATERIAL_VOCAB_VIEW_KEY) || 'cards');
    const [materialQuickActionsOpen, setMaterialQuickActionsOpen] = useState(false);
    const [materialFormAdvancedOpen, setMaterialFormAdvancedOpen] = useState(false);
    const [ammoPicker, setAmmoPicker] = useState({ open: false, items: [] });
    const [lastAiAction, setLastAiAction] = useState(null);
    const [materialForm, setMaterialForm] = useState({
        id: null,
        title: '',
        content: '',
        rewrite: '',
        usage: '',
        caution: '',
        sourceTerm: '',
        targetTerm: '',
        replaceReason: '',
        beforeExample: '',
        afterExample: '',
        category: 'argument',
        topic: '',
        tags: ''
    });
    const [isSavingMaterial, setIsSavingMaterial] = useState(false);
    const [contentOrigin, setContentOrigin] = useState('manual');
    const [isContentDirty, setIsContentDirty] = useState(false);
    const [expandedCompareMap, setExpandedCompareMap] = useState({});
    const [isWriterBootstrapped, setIsWriterBootstrapped] = useState(false);
    const [readSelection, setReadSelection] = useState(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    const [editorLayoutMode, setEditorLayoutMode] = useState(() => localStorage.getItem(WRITER_EDITOR_LAYOUT_KEY) || 'merged');

    const analyzeAbort = useRef(null);
    const outlineAbort = useRef(null);
    const analyzeReq = useRef(0);
    const lastAnalyzeAt = useRef(0);
    const activeDraftIdRef = useRef(currentId || null);
    const mobileSheetTouchRef = useRef({ startY: 0, startHeight: 64, active: false });
    const applyAiTextChange = (nextText, label, extra = null) => {
        if (nextText === content) return;
        setLastAiAction({
            prevContent: content,
            nextContent: nextText,
            label: label || 'AI操作',
            at: Date.now(),
            ...(extra || {})
        });
        setContent(nextText);
        setContentOrigin('manual');
        setIsContentDirty(true);
        setWorkflowStep('write');
        setMobileTab('editor');
    };

    const isMobileViewport = () => isMobile;
    const openMaterialsPanel = () => {
        if (isMobile) {
            setMobileMaterialSheetOpen(true);
            return;
        }
        setMaterialPanelMode('docked');
    };
    const toggleWriterLeftPanel = () => {
        if (isWriterLeftPanelHidden) {
            if (writerLeftPanelWidth < 220) setWriterLeftPanelWidth(320);
            setIsWriterLeftPanelHidden(false);
            return;
        }
        setIsWriterLeftPanelHidden(true);
    };
    const handleWriterSplitResize = (width) => {
        setWriterLeftPanelWidth(width);
        if (width <= 56 && !isWriterLeftPanelHidden) {
            setIsWriterLeftPanelHidden(true);
        }
    };
    const closeMaterialsPanel = () => {
        setMaterialPanelMode('hidden');
        setMobileMaterialSheetOpen(false);
    };

    const handleReadOnlyTextTap = (e, source) => {
        const selection = window.getSelection?.();
        let targetText = "";

        // Try to select just the word at the tap location
        try {
            const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
            if (range) {
                range.expand('word');
                selection.removeAllRanges();
                selection.addRange(range);
                targetText = selection.toString().trim();
            }
        } catch (err) {
            console.warn('Word selection fallback:', err);
        }

        if (!targetText) {
            setReadSelection(null);
            return;
        }

        setReadSelection({
            text: targetText,
            source: source || 'reference',
            at: Date.now()
        });
    };

    const captureReadOnlySelection = (source) => {
        const selection = window.getSelection?.();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            if (readSelection) setReadSelection(null);
            return;
        }
        const text = normalizeSelectionText(selection.toString());
        if (!text) {
            setReadSelection(null);
            return;
        }
        setReadSelection({
            text,
            source: source || 'reference',
            at: Date.now()
        });
    };

    const clearReadSelection = () => {
        setReadSelection(null);
        try {
            window.getSelection?.().removeAllRanges();
        } catch (e) {
            console.warn('Clear text selection failed:', e);
        }
    };

    const resolveAnchorForContent = (anchorCandidate, textContent = content) => {
        if (resolveWriterAnchorForContent) {
            return resolveWriterAnchorForContent(anchorCandidate, textContent, currentParagraphIndex);
        }
        const sourceParts = splitParagraphs(textContent);
        const parts = sourceParts.length ? sourceParts : [''];
        const rawBlock = Number(anchorCandidate?.blockIndex);
        const blockIndex = clamp(Number.isFinite(rawBlock) ? rawBlock : currentParagraphIndex, 0, Math.max(0, parts.length - 1));
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

    const buildInsertPreview = (payload, textContent = content) => {
        if (buildWriterInsertPreview) {
            return buildWriterInsertPreview(payload, textContent, currentParagraphIndex);
        }
        const insertText = String(payload?.text || '').trim();
        if (!insertText) {
            return { ok: false, error: '插入内容为空' };
        }
        const mode = INSERT_MODE_OPTIONS.some((x) => x.value === payload?.mode) ? payload.mode : 'cursor';
        const anchorResolved = resolveAnchorForContent(payload?.anchor, textContent);
        const { parts, blockIndex, blockText, offset, selectedRange } = anchorResolved;
        const nextParts = [...parts];
        let targetBlockIndex = blockIndex;
        let targetLabel = `P${blockIndex + 1} 光标`;
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
            const needSpaceLeft = left.length > 0 && !/[\s([{“‘"'`-]$/.test(left);
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

        const nextContent = nextParts.filter((x) => String(x || '').trim().length > 0).join('\n\n') || insertText;
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

    const requestInsertPreview = (text, options = {}) => {
        const payload = String(text || '').trim();
        if (!payload) return;
        const mode = INSERT_MODE_OPTIONS.some((x) => x.value === options.mode) ? options.mode : insertModePreference;
        setPendingInsert({
            text: payload,
            label: options.label || '素材插入',
            materialId: options.materialId || null,
            sourceTitle: options.sourceTitle || options.label || '素材内容',
            mode,
            anchor: options.anchor || insertAnchor
        });
    };

    const confirmPendingInsert = () => {
        if (!pendingInsert?.text) return;
        const preview = buildInsertPreview(pendingInsert, content);
        if (!preview.ok) {
            toast.error(preview.error || '无法完成插入');
            return;
        }
        setInsertModePreference(preview.mode);
        setPendingInsert(null);
        applyAiTextChange(preview.nextContent, pendingInsert.label || '素材插入', {
            type: 'material_insert',
            mode: preview.mode,
            target: preview.targetLabel,
            materialId: pendingInsert.materialId || null
        });
        setInsertAnchor(preview.nextAnchor);
        const nextParts = splitParagraphs(preview.nextContent);
        const safeBlock = clamp(preview.nextAnchor.blockIndex || 0, 0, Math.max(0, nextParts.length - 1));
        const globalOffset = nextParts
            .slice(0, safeBlock)
            .reduce((sum, item) => sum + String(item || '').length + 2, 0) + (preview.nextAnchor.offset || 0);
        setCursorPos(globalOffset);
        setSelection(null);
        toast.success(`${pendingInsert.label || '素材插入'}成功 · ${preview.targetLabel}`);
        if (isMobileViewport()) {
            setMobileMaterialSheetOpen(false);
        }
    };

    const applyVocabularyToSelectedSentence = (item, pair = null) => {
        const pairs = parseWriterVocabularyPairs(item);
        const selectedPair = pair || pairs[0] || null;
        const source = String(selectedPair?.source || '').trim();
        const target = String(selectedPair?.target || '').trim();
        if (!target) {
            toast.error('这条词汇素材没有可用的“原词 -> 替换词”映射');
            return;
        }
        const anchorResolved = resolveAnchorForContent(insertAnchor, content);
        if (!anchorResolved.selectedRange) {
            toast.error('请先在写作区选中句子，再应用词汇替换');
            return;
        }
        const selectedText = anchorResolved.blockText.slice(anchorResolved.selectedRange.start, anchorResolved.selectedRange.end);
        let replaced = selectedText;
        if (source) {
            if (!selectedText.toLowerCase().includes(source.toLowerCase())) {
                toast.error(`当前选中句未包含“${source}”`);
                return;
            }
            replaced = selectedText.replace(new RegExp(escapeWriterRegExp(source), 'gi'), target);
        } else {
            replaced = target;
        }
        requestInsertPreview(replaced, {
            label: `词汇替换：${source || '选中句'} -> ${target}`,
            materialId: item?.id || null,
            sourceTitle: item?.title || '词汇替换',
            mode: 'replace_selected_sentence',
            anchor: insertAnchor
        });
    };

    const undoLastAiAction = () => {
        if (!lastAiAction?.prevContent) return;
        setContent(lastAiAction.prevContent);
        setContentOrigin('manual');
        setIsContentDirty(true);
        if (lastAiAction.type === 'fix') {
            const key = lastAiAction.fixKey;
            if (key) {
                setAnalysis((prev) => {
                    if (!prev?.issues?.length) return prev;
                    return {
                        ...prev,
                        issues: prev.issues.map((issue) => {
                            const issueKey = `${issue.sentence_index || 0}|${issue.original || ''}|${issue.fixed || ''}`;
                            if (issueKey !== key) return issue;
                            return { ...issue, applied: false };
                        })
                    };
                });
            }
        }
        toast.success(`已撤销：${lastAiAction.label || 'AI操作'}`);
        setLastAiAction(null);
    };

    const wordCount = useMemo(() => content.trim().split(/\s+/).filter(Boolean).length, [content]);
    const checks = useMemo(() => outlineChecks(outline), [outline]);
    const checkScore = useMemo(() => Math.round((Object.values(checks).filter(Boolean).length / 4) * 100), [checks]);
    const paragraphRanges = useMemo(() => {
        const rows = [];
        let cursor = 0;
        const parts = String(content || '').split(/\n\s*\n/);
        for (const part of parts) {
            const text = String(part || '');
            const start = cursor;
            const end = cursor + text.length;
            if (text.trim()) rows.push({ start, end, text });
            cursor = end + 2;
        }
        return rows;
    }, [content]);
    const currentParagraphIndex = useMemo(() => {
        if (!paragraphRanges.length) return 0;
        const idx = paragraphRanges.findIndex((r) => cursorPos >= r.start && cursorPos <= r.end + 1);
        return idx >= 0 ? idx : paragraphRanges.length - 1;
    }, [paragraphRanges, cursorPos]);
    const currentParagraphText = paragraphRanges[currentParagraphIndex]?.text || '';
    const currentParagraphTokens = useMemo(() => {
        const tokens = String(currentParagraphText || '').toLowerCase().match(/[a-z]{4,}|[\u4e00-\u9fa5]{2,}/g) || [];
        return Array.from(new Set(tokens)).slice(0, 20);
    }, [currentParagraphText]);
    const insertAnchorHint = useMemo(() => {
        const resolved = resolveAnchorForContent(insertAnchor, content);
        if (resolved.selectedRange) {
            return `插入点：P${resolved.blockIndex + 1} · 已选中 ${resolved.selectedRange.end - resolved.selectedRange.start} 字`;
        }
        return `插入点：P${resolved.blockIndex + 1} · 光标 ${resolved.offset}`;
    }, [insertAnchor, content]);
    const preferredCategoryWeight = useMemo(() => {
        const lastIndex = Math.max(0, paragraphRanges.length - 1);
        if (currentParagraphIndex <= 0) return { thesis: 3, argument: 2, transition: 1 };
        if (currentParagraphIndex >= lastIndex) return { conclusion: 3, transition: 2, argument: 1 };
        return { argument: 3, evidence: 3, transition: 2, conclusion: 1 };
    }, [currentParagraphIndex, paragraphRanges.length]);
    const gapHints = useMemo(() => {
        const text = String(content || '');
        const lower = text.toLowerCase();
        const hints = [];
        if (!/for example|for instance|according to|survey|research|data|evidence|statistic/.test(lower)) {
            hints.push('缺少证据表达');
        }
        if (!/however|although|admittedly|while|nevertheless|yet|granted/.test(lower)) {
            hints.push('缺少让步或转折');
        }
        if (!/in conclusion|to sum up|overall|therefore|in summary/.test(lower)) {
            hints.push('结尾收束较弱');
        }
        if (paragraphRanges.length < 3) {
            hints.push('段落层次偏少');
        }
        return hints.slice(0, 3);
    }, [content, paragraphRanges.length]);

    const injectSuggestions = useMemo(() => {
        if (!analysis) return [];
        if (Array.isArray(analysis.vocabulary_injection) && analysis.vocabulary_injection.length) return analysis.vocabulary_injection.slice(0, 6);
        const used = new Set((content.toLowerCase().match(/[a-zA-Z-]+/g) || []).map(x => x.toLowerCase()));
        const pool = [];
        for (const c of cards) {
            const w = parseWord(c);
            if (!w || used.has(w)) continue;
            pool.push(w);
            if (pool.length >= 6) break;
        }
        return pool.map((word) => ({ word, why: '来自你的词库，可提升表达层次', where: '可放在论点句或例证句' }));
    }, [analysis, cards, content]);
    const rewrittenText = analysis?.rewritten_text || analysis?.corrected_text || '';
    const paragraphComparisons = useMemo(() => {
        if (!rewrittenText) return [];
        const beforeRows = splitWriterParagraphs(content);
        const afterRows = splitWriterParagraphs(rewrittenText);
        const size = Math.max(beforeRows.length, afterRows.length);
        const rows = [];
        for (let i = 0; i < size; i += 1) {
            const before = beforeRows[i] || '';
            const after = afterRows[i] || '';
            if (!before && !after) continue;
            const changed = normalizeWriterCompareText(before) !== normalizeWriterCompareText(after);
            const sentenceChanges = changed ? buildWriterSentenceChanges(before, after) : [];
            rows.push({
                index: i + 1,
                before,
                after,
                changed,
                sentenceChanges: sentenceChanges.slice(0, 4),
                changeCount: sentenceChanges.length
            });
        }
        return rows;
    }, [content, rewrittenText]);
    const changedParagraphComparisons = useMemo(
        () => paragraphComparisons.filter((row) => row.changed),
        [paragraphComparisons]
    );

    useEffect(() => {
        setExpandedCompareMap({});
    }, [rewrittenText]);

    useEffect(() => { localStorage.setItem('draft_writer_content', content); }, [content]);
    useEffect(() => { localStorage.setItem('draft_writer_title', title); }, [title]);
    useEffect(() => { localStorage.setItem('draft_writer_exam_context', JSON.stringify(examContext)); }, [examContext]);
    useEffect(() => { localStorage.setItem(WRITER_MATERIAL_LAYOUT_DESKTOP_KEY, materialPanelMode); }, [materialPanelMode]);
    useEffect(() => { localStorage.setItem(WRITER_MATERIAL_LAYOUT_MOBILE_KEY, mobileMaterialSheetOpen ? 'sheet_open' : 'sheet_collapsed'); }, [mobileMaterialSheetOpen]);
    useEffect(() => { localStorage.setItem(WRITER_EDITOR_LAYOUT_KEY, editorLayoutMode); }, [editorLayoutMode]);
    useEffect(() => { localStorage.setItem(WRITER_MATERIAL_VOCAB_VIEW_KEY, vocabView); }, [vocabView]);
    useEffect(() => { localStorage.setItem(WRITER_MATERIAL_INSERT_MODE_KEY, insertModePreference); }, [insertModePreference]);
    useEffect(() => { localStorage.setItem(WRITER_MATERIAL_TAB_KEY, materialDrawerTab); }, [materialDrawerTab]);
    useEffect(() => { localStorage.setItem(WRITER_MATERIAL_HIDE_SOURCE_IDS_KEY, JSON.stringify(hiddenSourceIds)); }, [hiddenSourceIds]);
    useEffect(() => { localStorage.setItem(WRITER_MATERIAL_PIN_SOURCE_IDS_KEY, JSON.stringify(pinnedSourceIds)); }, [pinnedSourceIds]);
    useEffect(() => { localStorage.setItem(WRITER_LEFT_PANEL_HIDDEN_KEY, isWriterLeftPanelHidden ? '1' : '0'); }, [isWriterLeftPanelHidden]);
    useEffect(() => { localStorage.setItem(WRITER_LEFT_PANEL_WIDTH_KEY, String(Math.round(writerLeftPanelWidth))); }, [writerLeftPanelWidth]);
    useEffect(() => {
        if (!['cards', 'table'].includes(vocabView)) setVocabView('cards');
    }, [vocabView]);
    useEffect(() => {
        if (!INSERT_MODE_OPTIONS.some((x) => x.value === insertModePreference)) {
            setInsertModePreference('cursor');
        }
    }, [insertModePreference]);
    useEffect(() => {
        const hasOpenPanel = materialPanelMode === 'docked' || mobileMaterialSheetOpen || materialManagerModalOpen;
        if (!hasOpenPanel || typeof window === 'undefined') return undefined;
        const onKeydown = (event) => {
            if (event.key !== 'Escape') return;
            if (materialManagerModalOpen) {
                setMaterialManagerModalOpen(false);
                return;
            }
            closeMaterialsPanel();
        };
        window.addEventListener('keydown', onKeydown);
        return () => window.removeEventListener('keydown', onKeydown);
    }, [materialPanelMode, mobileMaterialSheetOpen, materialManagerModalOpen]);
    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const desktopPanelOpen = materialPanelMode === 'docked' || materialManagerModalOpen;
        window.dispatchEvent(new CustomEvent('writer-material-panel-change', { detail: { open: desktopPanelOpen } }));
        return () => {
            window.dispatchEvent(new CustomEvent('writer-material-panel-change', { detail: { open: false } }));
        };
    }, [materialPanelMode, materialManagerModalOpen]);
    useEffect(() => {
        const resolved = resolveAnchorForContent(insertAnchor, content);
        setInsertAnchor((prev) => {
            const next = {
                blockIndex: resolved.blockIndex,
                offset: resolved.offset,
                selectedRange: resolved.selectedRange
            };
            const prevRange = prev?.selectedRange;
            const nextRange = next?.selectedRange;
            const unchanged =
                Number(prev?.blockIndex) === Number(next.blockIndex) &&
                Number(prev?.offset) === Number(next.offset) &&
                Number(prevRange?.start ?? -1) === Number(nextRange?.start ?? -1) &&
                Number(prevRange?.end ?? -1) === Number(nextRange?.end ?? -1);
            return unchanged ? prev : next;
        });
    }, [content]);
    useEffect(() => {
        activeDraftIdRef.current = currentId || null;
        if (currentId) localStorage.setItem(CURRENT_WRITING_ID_KEY, currentId);
        else localStorage.removeItem(CURRENT_WRITING_ID_KEY);
    }, [currentId]);
    useEffect(() => {
        (async () => {
            const loadedWritingsRaw = await getWritings();
            const loadedWritings = (loadedWritingsRaw || []).filter((item) => !isTranslationDraft(item));
            const loadedCards = await getFlashcards();
            let loadedMaterials = await getWritingMaterials();

            if (!loadedMaterials.length) {
                const demoItems = buildDemoMaterials(DEFAULT_EXAM_CONTEXT.examType);
                for (const item of demoItems) {
                    await saveWritingMaterial(item);
                }
                loadedMaterials = await getWritingMaterials();
            }
            const hasVocabulary = loadedMaterials.some((m) => normalizeMaterialCategory(m.category) === 'vocabulary');
            if (!hasVocabulary) {
                await saveWritingMaterial(buildDemoVocabularyMaterial(DEFAULT_EXAM_CONTEXT.examType));
                loadedMaterials = await getWritingMaterials();
            }

            const hasSeededDraft = localStorage.getItem(DEMO_SEED_KEY) === '1';
            const shouldSeedDraft =
                !hasSeededDraft &&
                !loadedWritings.length &&
                !content.trim() &&
                !title.trim() &&
                !examContext.prompt?.trim();
            if (shouldSeedDraft) {
                setTitle('Digital Life and Mental Health');
                setExamContext((prev) => ({
                    ...prev,
                    examType: 'CET-6',
                    genre: 'Argumentative',
                    targetScore: 12,
                    wordTarget: 220,
                    prompt: 'Should people limit social media use to protect mental health?'
                }));
                setContent(
                    'In recent years, social media has become an unavoidable part of daily life. Some people argue that frequent use damages mental health, while others believe it can strengthen social connection.\n\n' +
                    'In my view, the effect depends on how people use these platforms. Moderate and purposeful use can offer information and support, but compulsive scrolling often leads to anxiety and distraction.\n\n' +
                    'To solve this issue, both individuals and platforms should take responsibility. Users need clear boundaries, and platforms should design healthier interaction mechanisms.'
                );
                setContentOrigin('manual');
                setIsContentDirty(false);
                localStorage.setItem(DEMO_SEED_KEY, '1');
            }

            setWritings(loadedWritings);
            if (currentId && !loadedWritings.some((w) => w.id === currentId)) {
                setCurrentId(null);
            }
            setCards(loadedCards);
            setMaterials(loadedMaterials);
            setIsWriterBootstrapped(true);
        })();
    }, []);

    useEffect(() => {
        if (!params?.id) return;
        const item = writings.find(w => w.id === params.id);
        if (!item) return;
        loadDraft(item);
    }, [params, writings]);

    useEffect(() => {
        if (!params) return;
        if (params.openMaterials) openMaterialsPanel();
        if (params.materialId) setActiveMaterialId(params.materialId);
    }, [params]);

    const refreshWritings = async () => {
        const all = await getWritings();
        setWritings(all || []);
    };
    const refreshMaterials = async () => setMaterials(await getWritingMaterials());
    const loadDraft = (w) => {
        setCurrentId(w.id);
        activeDraftIdRef.current = w.id;
        setTitle(w.title || '');
        setContent(w.content || '');
        setContentOrigin('draft');
        setIsContentDirty(false);
        setExamContext({ ...DEFAULT_EXAM_CONTEXT, ...(w.examContext || {}) });
        setOutline(w.outline || null);
        setAnalysis(w.analysisResult || null);
        setWorkflowStep(w.analysisResult ? 'diagnose' : (w.workflowStep || (w.outline ? 'write' : 'prompt')));
        setMobileTab(w.analysisResult ? 'analysis' : 'editor');
        setActionChecks({});
    };

    const resetMaterialForm = () => {
        setMaterialFormAdvancedOpen(false);
        setMaterialForm({
            id: null,
            title: '',
            content: '',
            rewrite: '',
            usage: '',
            caution: '',
            sourceTerm: '',
            targetTerm: '',
            replaceReason: '',
            beforeExample: '',
            afterExample: '',
            category: 'argument',
            topic: '',
            tags: ''
        });
    };

    const applyMaterialFilter = (list) => {
        const q = materialQuery.trim().toLowerCase();
        return (list || []).filter((m) => {
            const cat = normalizeMaterialCategory(m.category);
            if (materialCategory !== 'all' && cat !== materialCategory) return false;
            if (!q) return true;
            const hay = `${m.title || ''}\n${m.content || ''}\n${m.rewrite || ''}\n${m.usage || ''}\n${m.caution || ''}\n${m.sourceTerm || ''}\n${m.targetTerm || ''}\n${m.replaceReason || ''}\n${m.beforeExample || ''}\n${m.afterExample || ''}\n${m.topic || ''}\n${(m.tags || []).join(' ')}`.toLowerCase();
            return hay.includes(q);
        });
    };

    const visibleMaterials = useMemo(() => {
        return (materials || []).filter((item) => {
            if (item?.source !== 'deep_note') return true;
            const key = getMaterialSourceKey(item);
            if (!key) return true;
            return !hiddenSourceIds.includes(key);
        });
    }, [materials, hiddenSourceIds]);

    const filteredMaterials = useMemo(() => {
        return applyMaterialFilter(visibleMaterials || []);
    }, [visibleMaterials, materialQuery, materialCategory]);
    const materialManagerList = useMemo(() => {
        return (materials || [])
            .slice()
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }, [materials]);

    const categoryCounts = useMemo(() => {
        const map = new Map(WRITING_MATERIAL_CATEGORIES.map((c) => [c.value, 0]));
        for (const item of visibleMaterials || []) {
            const key = normalizeMaterialCategory(item.category);
            map.set(key, (map.get(key) || 0) + 1);
        }
        return map;
    }, [visibleMaterials]);

    const outlineContextTokens = useMemo(() => {
        const outlineText = [
            examContext?.prompt || '',
            outline?.thesis || '',
            ...(outline?.paragraphs || []).flatMap((p) => [p?.topic_sentence || '', p?.evidence_hint || '']),
            outline?.conclusion || ''
        ].join(' ');
        const tokens = String(outlineText || '').toLowerCase().match(/[a-z]{4,}|[\u4e00-\u9fa5]{2,}/g) || [];
        return Array.from(new Set(tokens)).slice(0, 24);
    }, [examContext?.prompt, outline]);

    const recommendedMaterials = useMemo(() => {
        return (visibleMaterials || [])
            .map((item) => ({
                ...item,
                phaseWeight: preferredCategoryWeight[normalizeMaterialCategory(item.category)] || 0,
                sourceKey: getMaterialSourceKey(item),
                matchWeight: (() => {
                    const hay = `${item.title || ''}\n${item.content || ''}\n${item.rewrite || ''}\n${item.usage || ''}`.toLowerCase();
                    const paragraphHit = currentParagraphTokens.filter((token) => hay.includes(token)).length;
                    const outlineHit = outlineContextTokens.filter((token) => hay.includes(token)).length;
                    const hit = paragraphHit + Math.min(2, outlineHit);
                    if (hit >= 4) return 3;
                    if (hit >= 2) return 2;
                    if (hit >= 1) return 1;
                    return 0;
                })(),
                deepNoteBoost: (() => {
                    if (item?.source !== 'deep_note') return 0;
                    const hay = `${item.title || ''}\n${item.content || ''}\n${item.rewrite || ''}\n${item.usage || ''}`.toLowerCase();
                    const paragraphHit = currentParagraphTokens.filter((token) => hay.includes(token)).length;
                    const outlineHit = outlineContextTokens.filter((token) => hay.includes(token)).length;
                    const totalHit = paragraphHit + outlineHit;
                    if (totalHit >= 4) return 2;
                    if (totalHit >= 2) return 1.3;
                    if (totalHit >= 1) return 0.8;
                    return 0.3;
                })(),
                pinBoost: (() => {
                    const key = getMaterialSourceKey(item);
                    if (!key || item?.source !== 'deep_note') return 0;
                    return pinnedSourceIds.includes(key) ? 4 : 0;
                })(),
                examWeight: item?.examType && examContext?.examType && item.examType === examContext.examType ? 0.4 : 0
            }))
            .map((item) => ({
                ...item,
                totalScore: item.matchWeight + item.phaseWeight + item.deepNoteBoost + item.pinBoost + item.examWeight,
                recommendationReason: (() => {
                    if (item.pinBoost > 0) return '已固定保留';
                    if (item.source !== 'deep_note') return '';
                    const score = item.matchWeight + item.deepNoteBoost;
                    if (score >= 3.8) return '来自深度笔记 · 与当前题干高相关';
                    if (score >= 2.2) return '来自深度笔记 · 与当前内容相关';
                    return '来自深度笔记';
                })()
            }))
            .sort((a, b) => (b.totalScore - a.totalScore) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
    }, [visibleMaterials, preferredCategoryWeight, currentParagraphTokens, outlineContextTokens, pinnedSourceIds, examContext?.examType]);

    const deepNoteMaterials = useMemo(() => {
        return (visibleMaterials || [])
            .filter((item) => item?.source === 'deep_note')
            .map((item) => {
                const sourceKey = getMaterialSourceKey(item);
                const pinned = sourceKey ? pinnedSourceIds.includes(sourceKey) : false;
                return { ...item, pinned };
            })
            .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt || 0) - (a.updatedAt || 0));
    }, [visibleMaterials, pinnedSourceIds]);

    const drawerMaterials = useMemo(() => {
        const base =
            materialDrawerTab === 'recommend'
                ? recommendedMaterials
                : materialDrawerTab === 'deep_note'
                    ? deepNoteMaterials
                    : (visibleMaterials || []);
        return applyMaterialFilter(base);
    }, [materialDrawerTab, recommendedMaterials, deepNoteMaterials, visibleMaterials, materialQuery, materialCategory]);

    const activeMaterial = useMemo(() => {
        if (!activeMaterialId) return null;
        return (materials || []).find((m) => m.id === activeMaterialId) || null;
    }, [materials, activeMaterialId]);
    const vocabularyMaterials = useMemo(() => {
        const q = materialQuery.trim().toLowerCase();
        return (materials || [])
            .filter((item) => normalizeMaterialCategory(item.category) === 'vocabulary')
            .filter((item) => {
                if (!q) return true;
                const hay = `${item.title || ''}\n${item.sourceTerm || ''}\n${item.targetTerm || ''}\n${item.replaceReason || ''}\n${item.beforeExample || ''}\n${item.afterExample || ''}\n${(item.tags || []).join(' ')}`.toLowerCase();
                return hay.includes(q);
            })
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    }, [materials, materialQuery]);
    const vocabularyRows = useMemo(() => {
        return vocabularyMaterials.flatMap((item) => {
            const pairs = parseWriterVocabularyPairs(item);
            return pairs.map((pair, idx) => ({
                id: `${item.id}-${idx}-${pair.source}-${pair.target}`,
                item,
                pair
            }));
        });
    }, [vocabularyMaterials]);

    useEffect(() => {
        if (materialPanelMode !== 'docked' && !mobileMaterialSheetOpen) return;
        if (!drawerMaterials.length) {
            setActiveMaterialId(null);
            return;
        }
        if (!activeMaterialId || !drawerMaterials.some((item) => item.id === activeMaterialId)) {
            setActiveMaterialId(drawerMaterials[0].id);
        }
    }, [materialPanelMode, mobileMaterialSheetOpen, drawerMaterials, activeMaterialId]);

    const insertMaterialContent = (item, text, label = '素材插入') => {
        requestInsertPreview(text, {
            label,
            materialId: item?.id || null,
            sourceTitle: item?.title || label,
            mode: insertModePreference,
            anchor: insertAnchor
        });
    };

    const handleSaveMaterial = async () => {
        const categoryVal = normalizeMaterialCategory(materialForm.category);
        const sourceTerm = materialForm.sourceTerm.trim();
        const targetTerm = materialForm.targetTerm.trim();
        const replaceReason = materialForm.replaceReason.trim();
        const beforeExample = materialForm.beforeExample.trim();
        const afterExample = materialForm.afterExample.trim();

        let titleVal = materialForm.title.trim();
        let contentVal = materialForm.content.trim();
        let rewriteVal = materialForm.rewrite.trim();
        let usageVal = materialForm.usage.trim();
        let cautionVal = materialForm.caution.trim();

        if (categoryVal === 'vocabulary') {
            if (!sourceTerm || !targetTerm) {
                return toast.error('词汇替换至少要填写“替换前”和“替换后”');
            }
            if (!replaceReason) {
                return toast.error('词汇替换请填写“替换理由”');
            }
            if (!titleVal) titleVal = `${sourceTerm} -> ${targetTerm}`;
            contentVal = `${sourceTerm} -> ${targetTerm}`;
            if (!rewriteVal && afterExample) rewriteVal = afterExample;
            if (!usageVal) usageVal = replaceReason || '用于提升词汇准确度与学术表达层次。';
            if (!cautionVal) cautionVal = '注意语境和词性，避免机械替换。';
        }

        if (!titleVal || !contentVal) return toast.error('请填写素材标题和内容');
        setIsSavingMaterial(true);
        try {
            await saveWritingMaterial({
                id: materialForm.id || undefined,
                title: titleVal,
                content: contentVal,
                rewrite: rewriteVal,
                usage: usageVal,
                caution: cautionVal,
                sourceTerm,
                targetTerm,
                replaceReason,
                beforeExample,
                afterExample,
                category: categoryVal,
                topic: materialForm.topic.trim(),
                examType: examContext.examType,
                tags: materialForm.tags
                    .split(/[，,]/)
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .slice(0, 12),
                source: materialForm.id ? 'edit' : 'writer'
            });
            await refreshMaterials();
            resetMaterialForm();
            toast.success('素材已保存');
        } catch (e) {
            toast.error(`保存素材失败: ${e.message}`);
        } finally {
            setIsSavingMaterial(false);
        }
    };

    const handleEditMaterial = (item) => {
        const itemCategory = normalizeMaterialCategory(item.category);
        setMaterialFormAdvancedOpen(itemCategory === 'vocabulary');
        setMaterialForm({
            id: item.id,
            title: item.title || '',
            content: item.content || '',
            rewrite: item.rewrite || '',
            usage: item.usage || '',
            caution: item.caution || '',
            sourceTerm: item.sourceTerm || '',
            targetTerm: item.targetTerm || '',
            replaceReason: item.replaceReason || '',
            beforeExample: item.beforeExample || '',
            afterExample: item.afterExample || '',
            category: itemCategory,
            topic: item.topic || '',
            tags: Array.isArray(item.tags) ? item.tags.join(', ') : ''
        });
        setActiveMaterialId(item.id);
    };

    const handleDeleteMaterial = async (item) => {
        if (!window.confirm(`删除素材「${item.title}」？`)) return;
        await deleteWritingMaterial(item.id);
        if (activeMaterialId === item.id) setActiveMaterialId(null);
        if (materialForm.id === item.id) resetMaterialForm();
        await refreshMaterials();
    };

    const openSourceNote = (material) => {
        const noteId = String(material?.sourceNoteId || '').trim();
        if (!noteId) return;
        if (navigateRef?.current) {
            navigateRef.current({ view: 'notes', params: { id: noteId } });
        }
    };

    const togglePinSourceMaterial = (material) => {
        if (material?.source !== 'deep_note') return;
        const sourceKey = getMaterialSourceKey(material);
        if (!sourceKey) return;
        setPinnedSourceIds((prev) => (
            prev.includes(sourceKey)
                ? prev.filter((id) => id !== sourceKey)
                : [...prev, sourceKey]
        ));
    };

    const toggleHideSourceMaterial = (material) => {
        if (material?.source !== 'deep_note') return;
        const sourceKey = getMaterialSourceKey(material);
        if (!sourceKey) return;
        setHiddenSourceIds((prev) => (
            prev.includes(sourceKey)
                ? prev.filter((id) => id !== sourceKey)
                : [...prev, sourceKey]
        ));
        if (activeMaterialId === material.id) {
            setActiveMaterialId(null);
        }
    };

    const clearHiddenSourceMaterials = () => setHiddenSourceIds([]);

    const collectSelectionToMaterial = () => {
        if (!selection?.text) return toast.error('请先在写作区选中句子');
        const selected = selection.text.trim();
        openMaterialsPanel();
        setMaterialManagerModalOpen(true);
        setMaterialForm({
            id: null,
            title: selected.slice(0, 28) || '新素材',
            content: selected,
            rewrite: '',
            usage: '适合放在论证段，作为核心表达句。',
            caution: '不要整段照搬，建议替换主语或例子后再用。',
            sourceTerm: '',
            targetTerm: '',
            replaceReason: '',
            beforeExample: '',
            afterExample: '',
            category: 'argument',
            topic: examContext.prompt.slice(0, 24),
            tags: examContext.examType
        });
    };

    const collectFromDraft = async () => {
        const lines = content
            .split('\n')
            .map((x) => x.trim())
            .filter((x) => x.length >= 25)
            .slice(0, 12);
        if (!lines.length) return toast.error('草稿内容不足，无法提取素材');
        const existing = new Set((materials || []).map((m) => String(m.content || '').trim().toLowerCase()));
        let created = 0;
        for (const line of lines) {
            const key = line.toLowerCase();
            if (existing.has(key)) continue;
            const lc = line.toLowerCase();
            let category = 'argument';
            if (lc.includes('for example') || lc.includes('such as')) category = 'evidence';
            else if (lc.includes('in conclusion') || lc.includes('to sum up')) category = 'conclusion';
            else if (lc.includes('however') || lc.includes('therefore') || lc.includes('moreover')) category = 'transition';
            await saveWritingMaterial({
                title: line.slice(0, 32),
                content: line,
                rewrite: '',
                usage: '来自你的草稿，可作为同类题目的可复用表达。',
                caution: '复用时请按当前题目对象和立场改写关键词。',
                category,
                topic: examContext.prompt.slice(0, 24),
                examType: examContext.examType,
                tags: [examContext.examType, '草稿采集'],
                source: 'draft_collect'
            });
            existing.add(key);
            created += 1;
        }
        await refreshMaterials();
        toast.success(created ? `已采集 ${created} 条素材` : '没有新的可采集素材');
    };

    const assembleAmmoPack = () => {
        const pool = (recommendedMaterials.length ? recommendedMaterials : materials || []).filter(Boolean);
        if (!pool.length) {
            toast.error('没有可用素材，先收藏几条再试');
            return;
        }
        const used = new Set();
        const pick = (cats, matcher) => {
            for (const item of pool) {
                if (used.has(item.id)) continue;
                const cat = normalizeMaterialCategory(item.category);
                const text = String(item.content || '').toLowerCase();
                if (cats.length && !cats.includes(cat)) continue;
                if (matcher && !matcher(text, item)) continue;
                used.add(item.id);
                return item;
            }
            return null;
        };

        const opening = pick(['thesis', 'argument']);
        const reasoning = pick(['argument', 'evidence']);
        const concession = pick(['transition', 'argument'], (text) => /however|although|admittedly|while|even though/.test(text));
        const conclusion = pick(['conclusion', 'transition', 'argument']);
        const vocab = pick(['vocabulary']);

        const candidates = [];
        const line = (item, fallbackLabel) => {
            if (!item) return null;
            const main = String(item.rewrite || item.content || '').trim();
            if (!main) return null;
            const note = String(item.usage || '').trim();
            return {
                id: item.id,
                label: fallbackLabel,
                text: main,
                note
            };
        };
        const b1 = line(opening, '1) 开头立场句');
        const b2 = line(reasoning, '2) 论证推进句');
        const b3 = line(concession, '3) 让步/转折句');
        const b4 = line(conclusion, '4) 结论收束句');
        const b5 = line(vocab, '5) 词汇升级');
        if (b1) candidates.push({ ...b1, selected: true });
        if (b2) candidates.push({ ...b2, selected: true });
        if (b3) candidates.push({ ...b3, selected: true });
        if (b4) candidates.push({ ...b4, selected: true });
        if (b5) candidates.push({ ...b5, selected: true });

        if (!candidates.length) {
            toast.error('当前没有可组装的素材');
            return;
        }
        setAmmoPicker({ open: true, items: candidates });
    };

    const toggleAmmoItem = (id) => {
        setAmmoPicker((prev) => ({
            ...prev,
            items: (prev.items || []).map((item) => item.id === id ? { ...item, selected: !item.selected } : item)
        }));
    };

    const confirmAmmoInsert = () => {
        const selected = (ammoPicker.items || []).filter((item) => item.selected);
        if (!selected.length) {
            toast.error('请至少勾选一条素材');
            return;
        }
        const merged = selected.map((item) => `${item.label}\n${item.text}${item.note ? `\n[使用提示] ${item.note}` : ''}`).join('\n\n');
        setAmmoPicker({ open: false, items: [] });
        requestInsertPreview(merged, {
            label: '弹药包插入',
            sourceTitle: '弹药包',
            mode: insertModePreference,
            anchor: insertAnchor
        });
    };

    const upsertWritingLocal = (item) => {
        setWritings((prev) => {
            const next = Array.isArray(prev) ? [...prev] : [];
            const idx = next.findIndex((x) => x.id === item.id);
            if (idx >= 0) next[idx] = item;
            else next.unshift(item);
            return next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        });
    };

    const persistDraft = async ({ silent = false } = {}) => {
        if (!content.trim() && !examContext.prompt.trim() && !title.trim()) {
            if (!silent) toast.error('请先写一点内容');
            return false;
        }
        if (silent) setAutoSaveState('saving');
        else setIsSaving(true);
        try {
            const id = activeDraftIdRef.current || currentId || crypto.randomUUID();
            activeDraftIdRef.current = id;
            const item = {
                id,
                title: title || examContext.prompt || content.slice(0, 30) || '未命名写作',
                content,
                examContext,
                workflowStep,
                outline,
                analysisResult: analysis,
                lastScore: analysis?.score_total || analysis?.score || null,
                lastLevel: analysis?.level || null,
                updatedAt: Date.now()
            };
            await saveWriting(item);
            setCurrentId(id);
            if (!title) setTitle(item.title);
            upsertWritingLocal(item);
            setLastSavedAt(Date.now());
            if (silent) setAutoSaveState('saved');
            else toast.success('已保存');
            return true;
        } catch (e) {
            if (silent) setAutoSaveState('error');
            else toast.error(`保存失败: ${e.message}`);
            return false;
        } finally {
            if (!silent) setIsSaving(false);
        }
    };

    const saveDraft = async () => {
        await persistDraft({ silent: false });
    };

    useEffect(() => {
        if (!isWriterBootstrapped) return;
        if (!content.trim() && !title.trim() && !examContext.prompt?.trim()) return;
        const timer = setTimeout(() => {
            persistDraft({ silent: true });
        }, 1600);
        return () => clearTimeout(timer);
    }, [content, title, examContext, workflowStep, outline, analysis, isWriterBootstrapped]);

    const deleteDraft = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm('确定删除这篇写作吗？')) return;
        await deleteWriting(id);
        if (id === currentId) {
            activeDraftIdRef.current = null;
            setCurrentId(null); 
            setTitle(''); 
            setContent(''); 
            setContentOrigin('manual'); 
            setIsContentDirty(false); 
            setOutline(null); 
            setAnalysis(null); 
            setExamContext({ ...DEFAULT_EXAM_CONTEXT });
            setWorkflowStep('prompt');
        }
        await refreshWritings();
    };

    const generateOutline = async () => {
        if (!examContext.prompt.trim()) return toast.error('请先输入题目');
        if (outlineAbort.current) outlineAbort.current.abort();
        const controller = new AbortController();
        outlineAbort.current = controller;
        setIsGeneratingOutline(true);
        try {
            const res = await generateWritingOutline(examContext, settings, { signal: controller.signal });
            setOutline(res);
            setWorkflowStep('outline');
            toast.success('提纲已生成');
        } catch (e) {
            if (e?.name !== 'AbortError') toast.error(`提纲生成失败: ${e.message}`);
        } finally {
            setIsGeneratingOutline(false);
            if (outlineAbort.current === controller) outlineAbort.current = null;
        }
    };

    const createManualOutline = () => {
        setOutline({
            thesis: '',
            conclusion: '',
            paragraphs: [
                { purpose: 'Introduction', topic_sentence: '', evidence_hint: '', concession: false },
                { purpose: 'Point 1', topic_sentence: '', evidence_hint: '', concession: false },
                { purpose: 'Point 2', topic_sentence: '', evidence_hint: '', concession: false },
                { purpose: 'Conclusion', topic_sentence: '', evidence_hint: '', concession: false }
            ]
        });
        setWorkflowStep('outline');
        toast.success('已创建手动提纲');
    };

    const patchOutline = (updater) => {
        setOutline((prev) => {
            const base = prev || {
                thesis: '',
                conclusion: '',
                paragraphs: []
            };
            return updater(base);
        });
    };

    const updateOutlineField = (field, value) => {
        patchOutline((prev) => ({ ...prev, [field]: value }));
    };

    const updateOutlineParagraph = (index, field, value) => {
        patchOutline((prev) => ({
            ...prev,
            paragraphs: (prev.paragraphs || []).map((p, i) => (i === index ? { ...p, [field]: value } : p))
        }));
    };

    const addOutlineParagraph = () => {
        patchOutline((prev) => ({
            ...prev,
            paragraphs: [
                ...(prev.paragraphs || []),
                { purpose: `Point ${(prev.paragraphs || []).length + 1}`, topic_sentence: '', evidence_hint: '', concession: false }
            ]
        }));
    };

    const removeOutlineParagraph = (index) => {
        patchOutline((prev) => {
            const rows = prev.paragraphs || [];
            if (rows.length <= 1) return prev;
            return {
                ...prev,
                paragraphs: rows.filter((_, i) => i !== index)
            };
        });
    };

    const runAnalyze = async () => {
        const now = Date.now();
        if (now - lastAnalyzeAt.current < 450) return;
        lastAnalyzeAt.current = now;
        if (!content.trim()) return toast.error('请先写作');

        if (analyzeAbort.current) analyzeAbort.current.abort();
        const controller = new AbortController();
        analyzeAbort.current = controller;
        const req = ++analyzeReq.current;
        setIsAnalyzing(true);
        try {
            const result = await analyzeWriting(content, settings, analysisMode, { signal: controller.signal, examContext, outline });
            if (req !== analyzeReq.current) return;
            setAnalysis(result);
            setWorkflowStep('diagnose');
            setMobileTab('analysis');
            setActionChecks({});
            toast.success('诊断完成');
        } catch (e) {
            if (e?.name === 'AbortError') return;
            toast.error((e.message || '').includes('429') ? '触发限流，请稍后重试' : `诊断失败: ${e.message}`);
        } finally {
            if (req === analyzeReq.current) setIsAnalyzing(false);
        }
    };

    const applyFix = (issue) => {
        if (!issue?.fixed) return;
        const ranges = writerSentenceRanges(content);
        const idx = clamp(Number(issue.sentence_index || 0), 0, Math.max(0, ranges.length - 1));
        const r = ranges[idx];
        if (!r) return;
        const sentence = content.slice(r.start, r.end);
        let next = content;
        if (issue.original && sentence.includes(issue.original)) {
            next = content.slice(0, r.start) + sentence.replace(issue.original, issue.fixed) + content.slice(r.end);
        } else if (issue.original && content.includes(issue.original)) {
            next = content.replace(issue.original, issue.fixed);
        } else {
            next = content.slice(0, r.start) + issue.fixed + content.slice(r.end);
        }
        const fixKey = `${issue.sentence_index || 0}|${issue.original || ''}|${issue.fixed || ''}`;
        applyAiTextChange(next, '句级修正', { type: 'fix', fixKey });
        setAnalysis(prev => prev ? ({ ...prev, issues: (prev.issues || []).map(i => i === issue ? { ...i, applied: true } : i) }) : prev);
        toast.success('已应用修正，可一键撤销');
    };

    const Sidebar = (
        <div className="h-full flex flex-col p-4 bg-phy-glassHeavy backdrop-blur-3xl text-phy-text">
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 dark:bg-indigo-500/20 px-4 py-3 mb-3">
                <h2 className="text-lg font-black text-indigo-600 dark:text-white flex items-center gap-2">
                    <PenTool className="text-indigo-500 dark:text-indigo-300" size={18} />
                    AI 写作工坊
                </h2>
                <p className="text-xs text-indigo-600/80 dark:text-indigo-100/80 mt-1 font-medium">提纲驱动 · 素材积累 · 提分诊断</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-xl border border-phy-border bg-phy-glass p-2">
                    <div className="text-[10px] text-phy-muted">草稿</div>
                    <div className="text-base font-black text-phy-text">{writings.length}</div>
                </div>
                <div className="rounded-xl border border-phy-border bg-phy-glass p-2">
                    <div className="text-[10px] text-phy-muted">素材</div>
                    <div className="text-base font-black text-amber-600 dark:text-amber-200">{materials.length}</div>
                </div>
            </div>

            <div className="space-y-2 mb-4">
                <button
                    onClick={() => setShowTemplateModal(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                >
                    <FileText size={16} />
                    新建 / 模板
                </button>
                <button
                    onClick={openMaterialsPanel}
                    className="w-full bg-amber-500/10 dark:bg-amber-500/20 border border-amber-400/30 text-amber-700 dark:text-amber-200 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-colors"
                >
                    <FolderOpen size={16} />
                    打开素材包
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 custom-scrollbar">
                <h3 className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                    <History size={12} /> 我的写作 ({writings.length})
                </h3>
                {writings.map(w => (
                    <div
                        key={w.id}
                        onClick={() => loadDraft(w)}
                        className={`p-3 rounded-xl border cursor-pointer group relative transition-all ${currentId === w.id ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-600 dark:text-indigo-100 shadow-lg shadow-indigo-500/10' : 'bg-phy-glass border-phy-border text-phy-muted hover:text-phy-text hover:border-phy-borderHover hover:bg-phy-glassHeavy'}`}
                    >
                        <div className="text-sm font-medium line-clamp-1 pr-6">{w.title || '未命名'}</div>
                        <div className="text-[10px] opacity-70 mt-1">{new Date(w.updatedAt || Date.now()).toLocaleDateString()}</div>
                        <button onClick={(e) => deleteDraft(e, w.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-phy-muted hover:text-red-400">
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}

            </div>
        </div>
    );

    const ImprovedSidebar = (
        <div className="h-full flex flex-col p-4 bg-phy-glassHeavy backdrop-blur-3xl text-phy-text">
            <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 dark:bg-indigo-500/20 px-4 py-3 mb-3">
                <h2 className="text-lg font-black text-indigo-600 dark:text-white flex items-center gap-2">
                    <PenTool className="text-indigo-500 dark:text-indigo-300" size={18} />
                    AI 写作台
                </h2>
                <p className="text-xs text-indigo-600/80 dark:text-indigo-100/80 mt-1 font-medium">审题提纲 · 分段写作 · 诊断修改 · 素材复用</p>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-xl border border-phy-border bg-phy-glass p-2">
                    <div className="text-[10px] text-phy-muted">草稿</div>
                    <div className="text-base font-black text-phy-text">{writings.length}</div>
                </div>
                <div className="rounded-xl border border-phy-border bg-phy-glass p-2">
                    <div className="text-[10px] text-phy-muted">素材</div>
                    <div className="text-base font-black text-amber-600 dark:text-amber-200">{materials.length}</div>
                </div>
            </div>

            <div className="space-y-2 mb-4">
                <button
                    onClick={() => setShowTemplateModal(true)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                >
                    <FileText size={16} />
                    新建 / 模板
                </button>
                <button
                    onClick={openMaterialsPanel}
                    className="w-full bg-amber-500/10 dark:bg-amber-500/20 border border-amber-400/30 text-amber-700 dark:text-amber-200 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-amber-500/20 transition-colors"
                >
                    <FolderOpen size={16} />
                    打开素材包
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 custom-scrollbar">
                <h3 className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                    <History size={12} /> 我的写作 ({writings.length})
                </h3>
                {writings.map((w) => (
                    <div
                        key={w.id}
                        onClick={() => loadDraft(w)}
                        className={`p-3 rounded-xl border cursor-pointer group relative transition-all ${currentId === w.id ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-600 dark:text-indigo-100 shadow-lg shadow-indigo-500/10' : 'bg-phy-glass border-phy-border text-phy-muted hover:text-phy-text hover:border-phy-borderHover hover:bg-phy-glassHeavy'}`}
                    >
                        <div className="text-sm font-medium line-clamp-1 pr-6">{w.title || '未命名'}</div>
                        <div className="text-[10px] opacity-70 mt-1">{new Date(w.updatedAt || Date.now()).toLocaleDateString()}</div>
                        <button onClick={(e) => deleteDraft(e, w.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-phy-muted hover:text-red-400" title="删除草稿">
                            <Trash2 size={12} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );

    const StepNav = (
        <div className="px-4 md:px-6 py-3 border-b border-phy-border bg-phy-glass flex flex-wrap items-center gap-2">
            {STEPS.map((step, i) => {
                const meta = READABLE_STEP_META[step];
                const active = workflowStep === step;
                return (
                    <React.Fragment key={step}>
                        <button
                            onClick={() => {
                                if (step === 'outline' && !outline) return;
                                if (step === 'diagnose' && !analysis) return;
                                setWorkflowStep(step);
                            }}
                            className={`flex-1 min-w-[calc(50%-4px)] md:min-w-0 md:flex-none shrink-0 px-3 py-2 rounded-xl text-left transition-all border ${active ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-500/25' : 'bg-phy-glass text-phy-muted border-phy-border hover:text-phy-text hover:bg-phy-glassHeavy'}`}
                        >
                            <div className="text-xs font-black uppercase tracking-tight">{meta.label}</div>
                            <div className="text-[10px] opacity-70 truncate font-medium">{meta.hint}</div>
                        </button>
                        {i < STEPS.length - 1 ? <ChevronRight size={14} className="hidden md:inline text-phy-border shrink-0" /> : null}
                    </React.Fragment>
                );
            })}
            <button
                onClick={toggleWriterLeftPanel}
                className="ml-auto hidden md:inline-flex shrink-0 px-3 py-2 rounded-xl text-xs font-bold border border-indigo-400/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-200 hover:bg-indigo-500/20 items-center gap-1.5 transition-colors"
            >
                {isWriterLeftPanelHidden ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
                {isWriterLeftPanelHidden ? '显示工坊' : '隐藏工坊'}
            </button>
        </div>
    );

    const PromptPane = (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
            <div className="glass-panel rounded-2xl border border-phy-border p-5">
                <h3 className="font-bold text-phy-text text-base flex items-center gap-2 mb-4"><GraduationCap size={16} className="text-indigo-400" /> 审题与目标设置</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select value={examContext.examType} onChange={(e) => setExamContext(p => ({ ...p, examType: e.target.value }))} className="bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text">{['CET-4', 'CET-6', 'IELTS', 'TOEFL'].map(x => <option key={x} value={x}>{x}</option>)}</select>
                    <select value={examContext.genre} onChange={(e) => setExamContext(p => ({ ...p, genre: e.target.value }))} className="bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text">{['Argumentative', 'Expository', 'Narrative', 'Email'].map(x => <option key={x} value={x}>{x}</option>)}</select>
                    <input type="number" min="1" max="15" value={examContext.targetScore} onChange={(e) => setExamContext(p => ({ ...p, targetScore: clamp(Number(e.target.value) || 12, 1, 15) }))} className="bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text" />
                    <input type="number" min="80" max="1200" value={examContext.wordTarget} onChange={(e) => setExamContext(p => ({ ...p, wordTarget: clamp(Number(e.target.value) || 200, 80, 1200) }))} className="bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text" />
                </div>
                <textarea value={examContext.prompt} onChange={(e) => setExamContext(p => ({ ...p, prompt: e.target.value }))} rows={5} placeholder="输入题目或任务说明" className="w-full mt-4 bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm text-phy-text resize-none" />
                <div className="mt-4 flex gap-2">
                    <button onClick={generateOutline} disabled={isGeneratingOutline} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold flex items-center gap-2">{isGeneratingOutline ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 生成提纲</button>
                    <button onClick={createManualOutline} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">手动提纲</button>
                    <button onClick={() => setWorkflowStep('write')} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">直接写作</button>
                </div>
            </div>
        </div>
    );

    const ImprovedPromptPane = (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
            <div className="glass-panel rounded-2xl border border-phy-border p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="font-bold text-phy-text text-base flex items-center gap-2">
                        <GraduationCap size={16} className="text-indigo-400" />
                        审题与目标设置
                    </h3>
                    <div className="text-[11px] text-phy-muted">先定题目和目标，再生成提纲或直接写作。</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="space-y-1">
                        <span className="text-xs font-bold text-phy-muted">考试类型</span>
                        <select value={examContext.examType} onChange={(e) => setExamContext(p => ({ ...p, examType: e.target.value }))} className="w-full bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text">{['CET-4', 'CET-6', 'IELTS', 'TOEFL'].map(x => <option key={x} value={x}>{x}</option>)}</select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-bold text-phy-muted">写作类型</span>
                        <select value={examContext.genre} onChange={(e) => setExamContext(p => ({ ...p, genre: e.target.value }))} className="w-full bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text">{['Argumentative', 'Expository', 'Narrative', 'Email'].map(x => <option key={x} value={x}>{x}</option>)}</select>
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-bold text-phy-muted">目标分数 / 15</span>
                        <input type="number" min="1" max="15" value={examContext.targetScore} onChange={(e) => setExamContext(p => ({ ...p, targetScore: clamp(Number(e.target.value) || 12, 1, 15) }))} className="w-full bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text" />
                    </label>
                    <label className="space-y-1">
                        <span className="text-xs font-bold text-phy-muted">目标词数</span>
                        <input type="number" min="80" max="1200" value={examContext.wordTarget} onChange={(e) => setExamContext(p => ({ ...p, wordTarget: clamp(Number(e.target.value) || 200, 80, 1200) }))} className="w-full bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text" />
                    </label>
                </div>
                <textarea
                    value={examContext.prompt}
                    onChange={(e) => setExamContext(p => ({ ...p, prompt: e.target.value }))}
                    rows={5}
                    placeholder="输入作文题目、任务说明或评分要求..."
                    className="w-full mt-4 bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm text-phy-text resize-none"
                />
                <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={generateOutline} disabled={isGeneratingOutline} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60">{isGeneratingOutline ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 生成提纲</button>
                    <button onClick={createManualOutline} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">手动提纲</button>
                    <button onClick={() => setWorkflowStep('write')} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">直接写作</button>
                </div>
            </div>
        </div>
    );

    const OutlinePane = (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
            {!outline ? (
                <div className="glass-panel rounded-2xl border border-phy-border p-5">
                    <div className="text-sm text-phy-muted">暂无提纲。你可以用 AI 生成，也可以手动创建。</div>
                    <div className="mt-4 flex gap-2">
                        <button onClick={generateOutline} disabled={isGeneratingOutline} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60">{isGeneratingOutline ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} AI生成提纲</button>
                        <button onClick={createManualOutline} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">手动创建提纲</button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <div className="flex justify-between items-center"><div className="text-sm font-bold text-phy-text">提纲质量仪表</div><div className="text-lg font-black text-phy-text">{checkScore}%</div></div>
                        <div className="mt-2 h-2 rounded-full bg-phy-glass overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${checkScore}%` }} /></div>
                        <div className="mt-2 text-xs text-phy-muted">论点:{checks.thesis ? '✓' : '✗'} 论据:{checks.evidence ? '✓' : '✗'} 让步:{checks.concession ? '✓' : '✗'} 结论:{checks.conclusion ? '✓' : '✗'}</div>
                    </div>

                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <div className="font-semibold text-phy-text mb-2">核心立场（Thesis）</div>
                        <textarea
                            value={outline.thesis || ''}
                            onChange={(e) => updateOutlineField('thesis', e.target.value)}
                            rows={3}
                            placeholder="写你的立场句，例如：In my view, ... because ..."
                            className="w-full bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text resize-y"
                        />
                    </div>

                    {(outline.paragraphs || []).map((p, i) => (
                        <div key={i} className="glass-panel rounded-xl border border-phy-border p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-phy-muted">P{i + 1}</span>
                                <select
                                    value={p.purpose || ''}
                                    onChange={(e) => updateOutlineParagraph(i, 'purpose', e.target.value)}
                                    className="bg-phy-bg border border-phy-border rounded-lg px-2 py-1 text-xs text-phy-text"
                                >
                                    {OUTLINE_PURPOSE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                                </select>
                                <label className="ml-auto flex items-center gap-1 text-xs text-phy-muted">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(p.concession)}
                                        onChange={(e) => updateOutlineParagraph(i, 'concession', e.target.checked)}
                                    />
                                    让步段
                                </label>
                                <button
                                    onClick={() => removeOutlineParagraph(i)}
                                    className="p-1.5 rounded-md text-phy-muted hover:text-rose-300 hover:bg-rose-500/10"
                                    title="删除本段"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                            <textarea
                                value={p.topic_sentence || ''}
                                onChange={(e) => updateOutlineParagraph(i, 'topic_sentence', e.target.value)}
                                rows={2}
                                placeholder="本段主题句"
                                className="w-full bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text resize-y"
                            />
                            <textarea
                                value={p.evidence_hint || ''}
                                onChange={(e) => updateOutlineParagraph(i, 'evidence_hint', e.target.value)}
                                rows={2}
                                placeholder="论据提示（例子/数据/对比）"
                                className="w-full bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text resize-y"
                            />
                        </div>
                    ))}

                    <div className="glass-panel rounded-xl border border-phy-border p-3">
                        <div className="text-xs text-phy-muted mb-2">结论收束（Conclusion）</div>
                        <textarea
                            value={outline.conclusion || ''}
                            onChange={(e) => updateOutlineField('conclusion', e.target.value)}
                            rows={2}
                            placeholder="最后一句如何收束主张"
                            className="w-full bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text resize-y"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button onClick={addOutlineParagraph} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">新增段落</button>
                        <button onClick={generateOutline} disabled={isGeneratingOutline} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold flex items-center gap-2 disabled:opacity-60">{isGeneratingOutline ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} AI重生成</button>
                        <button onClick={() => {
                            const outlineSeed = (outline.paragraphs || []).map((p, i) => `Paragraph ${i + 1}: ${p.topic_sentence || ''}`).join('\n\n');
                            const shouldSeedFromOutline =
                                !content.trim() ||
                                !isContentDirty ||
                                contentOrigin === 'template' ||
                                contentOrigin === 'draft';
                            if (shouldSeedFromOutline && outlineSeed.trim()) {
                                setContent(outlineSeed);
                                setContentOrigin('outline');
                                setIsContentDirty(false);
                            }
                            setWorkflowStep('write');
                        }} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold">进入写作</button>
                    </div>
                </>
            )}
        </div>
    );

    const ImprovedOutlinePane = (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
            {!outline ? (
                <div className="glass-panel rounded-2xl border border-phy-border p-5">
                    <div className="text-sm text-phy-muted">暂无提纲。可以让 AI 生成，也可以手动搭一个四段式结构。</div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={generateOutline} disabled={isGeneratingOutline} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60">{isGeneratingOutline ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} AI 生成提纲</button>
                        <button onClick={createManualOutline} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">手动创建提纲</button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="text-sm font-bold text-phy-text">提纲质量仪表</div>
                                <div className="text-xs text-phy-muted mt-1">检查立场、论据、让步和结论是否完整。</div>
                            </div>
                            <div className="text-lg font-black text-phy-text">{checkScore}%</div>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-phy-glass overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${checkScore}%` }} /></div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            <span className={checks.thesis ? 'text-emerald-300' : 'text-amber-200'}>立场 {checks.thesis ? '已写' : '待补'}</span>
                            <span className={checks.evidence ? 'text-emerald-300' : 'text-amber-200'}>论据 {checks.evidence ? '已写' : '待补'}</span>
                            <span className={checks.concession ? 'text-emerald-300' : 'text-amber-200'}>让步 {checks.concession ? '已写' : '可选补强'}</span>
                            <span className={checks.conclusion ? 'text-emerald-300' : 'text-amber-200'}>结论 {checks.conclusion ? '已写' : '待补'}</span>
                        </div>
                    </div>

                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <div className="font-semibold text-phy-text mb-2">核心立场（Thesis）</div>
                        <textarea
                            value={outline.thesis || ''}
                            onChange={(e) => updateOutlineField('thesis', e.target.value)}
                            rows={3}
                            placeholder="写出你的立场句，例如：In my view, ... because ..."
                            className="w-full bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text resize-y"
                        />
                    </div>

                    {(outline.paragraphs || []).map((p, i) => (
                        <div key={i} className="glass-panel rounded-xl border border-phy-border p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-phy-muted">P{i + 1}</span>
                                <select
                                    value={p.purpose || ''}
                                    onChange={(e) => updateOutlineParagraph(i, 'purpose', e.target.value)}
                                    className="bg-phy-bg border border-phy-border rounded-lg px-2 py-1 text-xs text-phy-text"
                                >
                                    {OUTLINE_PURPOSE_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}
                                </select>
                                <label className="ml-auto flex items-center gap-1 text-xs text-phy-muted">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(p.concession)}
                                        onChange={(e) => updateOutlineParagraph(i, 'concession', e.target.checked)}
                                    />
                                    让步段
                                </label>
                                <button
                                    onClick={() => removeOutlineParagraph(i)}
                                    className="p-1.5 rounded-md text-phy-muted hover:text-rose-300 hover:bg-rose-500/10"
                                    title="删除本段"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                            <textarea
                                value={p.topic_sentence || ''}
                                onChange={(e) => updateOutlineParagraph(i, 'topic_sentence', e.target.value)}
                                rows={2}
                                placeholder="本段主题句"
                                className="w-full bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text resize-y"
                            />
                            <textarea
                                value={p.evidence_hint || ''}
                                onChange={(e) => updateOutlineParagraph(i, 'evidence_hint', e.target.value)}
                                rows={2}
                                placeholder="论据提示：例子 / 数据 / 对比 / 原因链"
                                className="w-full bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text resize-y"
                            />
                        </div>
                    ))}

                    <div className="glass-panel rounded-xl border border-phy-border p-3">
                        <div className="text-xs text-phy-muted mb-2">结论收束（Conclusion）</div>
                        <textarea
                            value={outline.conclusion || ''}
                            onChange={(e) => updateOutlineField('conclusion', e.target.value)}
                            rows={2}
                            placeholder="最后一句如何收束主张"
                            className="w-full bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text resize-y"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button onClick={addOutlineParagraph} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">新增段落</button>
                        <button onClick={generateOutline} disabled={isGeneratingOutline} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold flex items-center gap-2 disabled:opacity-60">{isGeneratingOutline ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} AI 重生成</button>
                        <button onClick={() => {
                            const outlineSeed = (outline.paragraphs || []).map((p, i) => `Paragraph ${i + 1}: ${p.topic_sentence || ''}`).join('\n\n');
                            const shouldSeedFromOutline =
                                !content.trim() ||
                                !isContentDirty ||
                                contentOrigin === 'template' ||
                                contentOrigin === 'draft';
                            if (shouldSeedFromOutline && outlineSeed.trim()) {
                                setContent(outlineSeed);
                                setContentOrigin('outline');
                                setIsContentDirty(false);
                            }
                            setWorkflowStep('write');
                        }} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold">进入写作</button>
                    </div>
                </>
            )}
        </div>
    );

    const wordTarget = clamp(Number(examContext.wordTarget) || 200, 80, 1200);
    const wordProgress = clamp(Math.round((wordCount / wordTarget) * 100), 0, 100);
    const editorParagraphs = useMemo(() => {
        const parts = splitParagraphs(content);
        return parts.map((text, idx) => ({
            index: idx,
            text
        }));
    }, [content]);
    const syncInsertAnchor = (blockIndex, startOffset, endOffset, blockTextValue = '') => {
        const safeStart = clamp(Number(startOffset) || 0, 0, String(blockTextValue || '').length);
        const safeEnd = clamp(Number(endOffset) || 0, 0, String(blockTextValue || '').length);
        setInsertAnchor({
            blockIndex,
            offset: safeStart,
            selectedRange: safeEnd > safeStart
                ? {
                    start: safeStart,
                    end: safeEnd,
                    text: String(blockTextValue || '').slice(safeStart, safeEnd)
                }
                : null
        });
    };
    const updateParagraphFromEditor = (blockIndex, rawText) => {
        const parts = splitParagraphs(content);
        if (blockIndex < 0 || blockIndex >= parts.length) return;
        const chunks = splitParagraphs(rawText);
        const nextParts = [
            ...parts.slice(0, blockIndex),
            ...chunks,
            ...parts.slice(blockIndex + 1)
        ];
        const nextText = nextParts.join('\n\n');
        setContent(nextText);
        setContentOrigin('manual');
        setIsContentDirty(true);
        setAutoSaveState('idle');
        setSelection(null);
        setInsertAnchor((prev) => (prev?.blockIndex === blockIndex ? { ...prev, selectedRange: null } : prev));
    };
    const appendUserParagraph = () => {
        const parts = splitParagraphs(content);
        const nextText = [...parts, ' '].join('\n\n');
        setContent(nextText);
        setContentOrigin('manual');
        setIsContentDirty(true);
        setAutoSaveState('idle');
        setInsertAnchor((prev) => ({ ...prev, selectedRange: null }));
    };
    const deleteParagraphFromEditor = (blockIndex) => {
        const parts = splitParagraphs(content);
        if (blockIndex < 0 || blockIndex >= parts.length) return;
        const nextParts = [...parts.slice(0, blockIndex), ...parts.slice(blockIndex + 1)];
        const nextText = nextParts.join('\n\n');
        setContent(nextText);
        setContentOrigin('manual');
        setIsContentDirty(true);
        setAutoSaveState('idle');
        setSelection(null);
        setInsertAnchor((prev) => ({ ...prev, selectedRange: null }));
    };
    const outlineMarkers = useMemo(() => {
        if (!outline) return [];
        const colorTokens = [
            'border-indigo-400/40 bg-indigo-500/10 text-indigo-200',
            'border-cyan-400/40 bg-cyan-500/10 text-cyan-200',
            'border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200',
            'border-amber-400/40 bg-amber-500/10 text-amber-200',
            'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
        ];
        const paragraphs = splitParagraphs(content);
        const rows = [];
        const thesis = String(outline.thesis || '').trim();
        if (thesis) {
            const intro = paragraphs[0] || '';
            const ending = paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : '';
            const thesisScope = `${intro}\n${ending}`;
            const coverage = getWriterCoverageStatus(thesisScope, thesis);
            rows.push({
                id: 'thesis',
                label: '论点',
                text: thesis,
                coverage,
                tone: colorTokens[0]
            });
        }
        (outline.paragraphs || []).forEach((p, idx) => {
            const sentence = String(p.topic_sentence || '').trim();
            if (!sentence) return;
            const evidence = String(p.evidence_hint || '').trim();
            const paragraphScope = paragraphs[idx] || '';
            const coverage = getWriterCoverageStatus(paragraphScope, `${sentence} ${evidence}`.trim());
            rows.push({
                id: `p${idx + 1}`,
                label: `P${idx + 1}`,
                text: sentence,
                coverage,
                tone: colorTokens[(idx + 1) % colorTokens.length]
            });
        });
        return rows;
    }, [outline, content]);
    const topRecommendedMaterial = recommendedMaterials[0] || null;
    const isVocabMaterialForm = normalizeMaterialCategory(materialForm.category) === 'vocabulary';
    const showVocabularyWorkbench = materialCategory === 'vocabulary';
    const autoSaveText = autoSaveState === 'saving'
        ? '自动保存中...'
        : autoSaveState === 'error'
            ? '自动保存失败'
            : autoSaveState === 'saved' && lastSavedAt
                ? `已自动保存 ${new Date(lastSavedAt).toLocaleTimeString()}`
                : '自动保存待命';
    const onMobileSheetTouchStart = (event) => {
        if (!event.touches?.length) return;
        mobileSheetTouchRef.current = {
            startY: event.touches[0].clientY,
            startHeight: mobileMaterialSheetHeight,
            active: true
        };
    };
    const onMobileSheetTouchMove = (event) => {
        if (!mobileSheetTouchRef.current.active || !event.touches?.length) return;
        const deltaY = mobileSheetTouchRef.current.startY - event.touches[0].clientY;
        const next = clamp(mobileSheetTouchRef.current.startHeight + (deltaY / 10), 48, 88);
        setMobileMaterialSheetHeight(next);
    };
    const onMobileSheetTouchEnd = () => {
        if (!mobileSheetTouchRef.current.active) return;
        mobileSheetTouchRef.current.active = false;
        if (mobileMaterialSheetHeight <= 52) {
            setMobileMaterialSheetOpen(false);
            setMobileMaterialSheetHeight(64);
            return;
        }
        if (mobileMaterialSheetHeight >= 80) {
            setMobileMaterialSheetHeight(86);
            return;
        }
        setMobileMaterialSheetHeight(64);
    };

    const WritePane = (
        <div className="flex flex-col h-full relative overflow-y-auto custom-scrollbar">
            {!focusMode ? StepNav : null}
            <div className="px-4 md:px-6 py-3 border-b border-phy-border bg-phy-glass">
                <div className="flex items-center gap-3">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入标题..." className="bg-transparent text-base md:text-lg font-bold text-phy-text placeholder:text-phy-muted outline-none w-full" />
                    <div className="text-xs text-phy-muted font-medium shrink-0 bg-phy-glass px-2 py-1 rounded-lg border border-phy-border">{wordCount} / {wordTarget} 词</div>
                    <button onClick={saveDraft} className="p-2 rounded-lg text-phy-muted hover:text-emerald-500 transition-colors">{isSaving ? <CheckCircle size={18} className="text-emerald-500" /> : <Save size={18} />}</button>
                    <button onClick={() => setFocusMode((v) => !v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${focusMode ? 'bg-indigo-600/20 border-indigo-400/40 text-indigo-600 dark:text-indigo-200' : 'border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHeavy'}`}>
                        {focusMode ? '退出专注' : '专注'}
                    </button>
                </div>
                <div className={`mt-1.5 text-[10px] font-medium tracking-wide ${autoSaveState === 'error' ? 'text-rose-500' : 'text-phy-muted'}`}>{autoSaveText}</div>

                <div className="mt-2 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-2">
                    <div className="rounded-xl border border-phy-border bg-phy-glass px-3 py-2">
                        <div className="flex items-center justify-between gap-3 text-xs">
                            <div className="font-bold text-phy-text flex items-center gap-1.5">
                                <Target size={13} className="text-indigo-300" />
                                写作主导模式
                            </div>
                            <div className="text-phy-muted">{wordProgress}% 进度</div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-phy-border overflow-hidden">
                            <div className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)] transition-all duration-300" style={{ width: `${wordProgress}%` }} />
                        </div>
                        <div className="mt-1.5 text-[10px] text-phy-muted font-medium">{insertAnchorHint}</div>
                        {!focusMode && (gapHints.length || outlineMarkers.length) ? (
                            <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                                {gapHints.map((hint) => (
                                    <span key={hint} className="px-2 py-0.5 rounded-md text-[10px] border border-amber-400/30 bg-amber-500/10 text-amber-200">
                                        {hint}
                                    </span>
                                ))}
                                {outlineMarkers.length ? (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] border border-indigo-400/30 bg-indigo-500/10 text-indigo-200">
                                        提纲锚点 {outlineMarkers.length} 条
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-wrap xl:flex-nowrap gap-2 items-center">
                        <select value={analysisMode} onChange={(e) => setAnalysisMode(e.target.value)} className="bg-phy-glass border border-phy-border text-xs rounded-lg px-2 py-1 text-phy-text h-[32px] outline-none hover:border-indigo-400 font-bold transition-all">
                            {['grammar', 'polish', 'academic'].map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                        <button onClick={openMaterialsPanel} className="px-3 py-1 rounded-lg text-xs font-bold bg-phy-glass border border-phy-border text-phy-text hover:bg-phy-glassHeavy flex items-center gap-1.5 h-[32px] transition-colors"><FolderOpen size={12} /> 素材包</button>
                        <button onClick={assembleAmmoPack} className="px-3 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-400/30 text-emerald-600 dark:text-emerald-200 hover:bg-emerald-500/20 flex items-center gap-1.5 h-[32px] transition-colors"><ListChecks size={12} /> 组装</button>
                        {!focusMode ? <button onClick={collectFromDraft} className="px-3 py-1 rounded-lg text-xs font-bold bg-phy-glass border border-phy-border text-phy-text hover:bg-phy-glassHeavy flex items-center gap-1.5 h-[32px] transition-colors"><Plus size={12} /> 采集</button> : null}
                        {lastAiAction ? (
                            <button onClick={undoLastAiAction} className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-500/5 dark:bg-rose-500/10 border border-rose-400/30 text-rose-600 dark:text-rose-200 hover:bg-rose-500/20 flex items-center gap-1.5 h-[32px] transition-colors">
                                <RotateCcw size={12} />
                                撤销
                            </button>
                        ) : null}
                        <button onClick={runAnalyze} disabled={isAnalyzing} className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 h-[32px] disabled:opacity-60 shadow-lg shadow-indigo-500/20 transition-all">{isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {isAnalyzing ? '诊断中' : '诊断'}</button>
                    </div>
                </div>
            </div>
            {!focusMode ? (
                <div className="px-4 md:px-6 py-2 border-b border-phy-border bg-phy-bg/5 backdrop-blur-sm flex flex-wrap items-center gap-2">
                    {selection ? <button onClick={() => setShowPolishModal(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all"><Sparkles size={12} /> 单句精修</button> : null}
                    {selection ? <button onClick={collectSelectionToMaterial} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/10 dark:bg-amber-500/20 border border-amber-400/30 text-amber-600 dark:text-amber-200 flex items-center gap-1.5 hover:bg-amber-500/20 transition-colors"><Plus size={12} /> 收藏选中</button> : null}
                    <button
                        onClick={() => setEditorLayoutMode((v) => (v === 'merged' ? 'split' : 'merged'))}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-phy-glass border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHeavy flex items-center gap-1.5 transition-colors"
                    >
                        {editorLayoutMode === 'merged' ? <LayoutList size={12} /> : <Columns size={12} />}
                        {editorLayoutMode === 'merged' ? '分段查看' : '合并查看'}
                    </button>
                    {topRecommendedMaterial ? (
                        <button
                            onClick={() => insertMaterialContent(topRecommendedMaterial, topRecommendedMaterial.content, '推荐素材插入')}
                            title={topRecommendedMaterial.title}
                            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-400/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200 hover:bg-emerald-500/20 shadow-sm transition-all"
                        >
                            插入推荐
                        </button>
                    ) : (
                        <div className="ml-auto text-[10px] text-phy-muted font-medium bg-phy-glass px-2 py-1 rounded-md border border-phy-border">暂无推荐素材</div>
                    )}
                </div>
            ) : (
                <div className="px-4 md:px-6 py-2 border-b border-phy-border bg-phy-bg/10 text-[10px] text-phy-muted font-medium italic">
                    专注模式已开启：已隐藏次要干扰操作。
                </div>
            )}
            <div className={`w-full min-h-[420px] p-4 md:p-6 ${focusMode ? 'pt-8 md:pt-10' : ''} pb-28 md:pb-8 space-y-3`}>
                {!editorParagraphs.length ? (
                    <button
                        onClick={appendUserParagraph}
                        className="w-full p-4 rounded-xl border border-dashed border-phy-border text-sm text-phy-muted hover:text-phy-text hover:border-phy-borderHover text-left"
                    >
                        + 新建第一段（我写）
                    </button>
                ) : null}
                {editorParagraphs.length ? (
                    <div className={`rounded-xl border border-phy-border ${editorLayoutMode === 'merged' ? 'bg-phy-glass/25 p-3 md:p-4' : 'bg-transparent border-0 p-0 space-y-3'}`}>
                        {editorParagraphs.map((p, idx) => {
                            const offset = editorParagraphs
                                .filter((x) => x.index < p.index)
                                .reduce((sum, x) => sum + x.text.length + 2, 0);
                            return (
                                <div
                                    key={`writer-block-${p.index}`}
                                    className={editorLayoutMode === 'merged'
                                        ? `${idx > 0 ? 'mt-4 pt-4 border-t border-phy-border/40' : ''}`
                                        : 'rounded-2xl border border-phy-border bg-phy-glass/30 hover:bg-phy-glass/50 p-4 shadow-sm hover:shadow-md transition-all duration-300'}
                                >
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-[10px] font-black text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                                                {p.index + 1}
                                            </div>
                                            <span className="text-[10px] uppercase font-bold text-phy-muted tracking-wider">段落区块</span>
                                        </div>
                                        <button
                                            onClick={() => deleteParagraphFromEditor(p.index)}
                                            className="p-1.5 rounded-lg text-phy-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                            title="删除段落"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                    <textarea
                                        value={p.text}
                                        onChange={(e) => updateParagraphFromEditor(p.index, e.target.value)}
                                        placeholder="在此输入内容..."
                                        onSelect={(e) => {
                                            const s = e.target.selectionStart || 0;
                                            const t = e.target.selectionEnd || 0;
                                            setCursorPos(offset + s);
                                            syncInsertAnchor(p.index, s, t, e.target.value || '');
                                            const text = String(e.target.value || '').substring(s, t).trim();
                                            setSelection(s !== t && text.length >= 2 ? { text, start: offset + s, end: offset + t, blockIndex: p.index } : null);
                                        }}
                                        onKeyUp={(e) => {
                                            const s = e.target.selectionStart || 0;
                                            const t = e.target.selectionEnd || 0;
                                            setCursorPos(offset + s);
                                            syncInsertAnchor(p.index, s, t, e.target.value || '');
                                        }}
                                        onClick={(e) => {
                                            const s = e.target.selectionStart || 0;
                                            const t = e.target.selectionEnd || 0;
                                            setCursorPos(offset + s);
                                            syncInsertAnchor(p.index, s, t, e.target.value || '');
                                        }}
                                        spellCheck="false"
                                        className="w-full bg-transparent text-base leading-loose outline-none resize-y min-h-[120px] font-serif text-phy-text placeholder:text-phy-muted"
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                <button
                    onClick={appendUserParagraph}
                    className="w-full p-3 rounded-xl border border-dashed border-phy-border text-sm text-phy-muted hover:text-phy-text hover:border-phy-borderHover"
                >
                    + 添加新段落（默认我写）
                </button>
            </div>
            <div
                className="md:hidden absolute bottom-0 left-0 right-0 border-t border-phy-border bg-phy-glassHeavy backdrop-blur-3xl px-3 py-2 flex items-center gap-2"
                style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}
            >
                <button onClick={openMaterialsPanel} className="flex-1 px-2 py-2 rounded-lg text-xs font-bold border border-phy-border bg-phy-glass text-phy-text active:scale-95 transition-all">素材</button>
                <button onClick={assembleAmmoPack} className="flex-1 px-2 py-2 rounded-lg text-xs font-bold border border-emerald-400/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200 active:scale-95 transition-all">组装</button>
                <button onClick={runAnalyze} disabled={isAnalyzing} className="flex-1 px-2 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white disabled:opacity-60 active:scale-95 transition-all">
                    {isAnalyzing ? '诊断中' : '诊断'}
                </button>
                <button onClick={saveDraft} className="px-3 py-2 rounded-lg text-xs font-bold border border-phy-border bg-phy-glass text-phy-text active:scale-95 transition-all">保存</button>
            </div>
        </div>
    );

    const DiagnosePane = (
        <div 
            className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4 bg-phy-bg/20"
            onMouseUp={() => captureReadOnlySelection('diagnose')}
            onClick={(e) => { if (window.innerWidth < 768) handleReadOnlyTextTap(e, 'diagnose'); }}
            onContextMenu={(e) => { if (window.innerWidth < 768) e.preventDefault(); }}
            style={{ WebkitTouchCallout: 'none' }}
        >
            {!analysis ? (
                <div className="glass-panel rounded-2xl border border-phy-border p-6 text-sm text-phy-muted text-center">暂无诊断结果，请先完成诊断。</div>
            ) : (
                <>
                    <div className="glass-panel rounded-2xl border border-phy-border p-5"><div className="text-xs text-phy-muted uppercase mb-1">总评分</div><div className="text-4xl font-black text-phy-text">{analysis.score_total || analysis.score}<span className="text-lg text-phy-muted"> / 15</span></div><div className="text-sm text-phy-text mt-2">“{analysis.overall_comment || analysis.comment || '暂无总评'}”</div></div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">Task</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.task_response ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">Coherence</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.coherence ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">Lexical</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.lexical_resource ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">Grammar</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.grammar_range_accuracy ?? 0}</div></div>
                    </div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <h4 className="font-bold text-phy-text text-sm mb-2">冲分建议清单</h4>
                        {(analysis.improvement_plan || []).slice(0, 5).map((item) => (
                            <label key={item.id} className="flex items-start gap-2 rounded-lg border border-phy-border p-2 bg-phy-glass mb-2">
                                <input type="checkbox" checked={Boolean(actionChecks[item.id])} onChange={() => setActionChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className="mt-0.5" />
                                <div className="text-sm text-phy-text">{item.title}: <span className="text-phy-muted">{item.action}</span></div>
                                <button onClick={(e) => { e.preventDefault(); requestInsertPreview(item.action, { label: '冲分建议插入', sourceTitle: item.title || '冲分建议', mode: insertModePreference, anchor: insertAnchor }); }} className="ml-auto px-2 py-1 text-[11px] rounded-md border border-indigo-500/30 text-indigo-300">插入</button>
                            </label>
                        ))}
                    </div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <h4 className="font-bold text-phy-text text-sm mb-2">句级问题 ({(analysis.issues || []).length})</h4>
                        {(analysis.issues || []).map((issue, idx) => (
                            <div key={idx} className={`rounded-lg border p-3 mb-2 ${issue.applied ? 'opacity-60 border-emerald-500/30 bg-emerald-500/5' : 'border-phy-border bg-phy-glass'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-xs text-phy-muted">{issue.type} · sentence #{issue.sentence_index}</div>
                                    {!issue.applied ? <button onClick={() => applyFix(issue)} className="px-2 py-1 text-[11px] rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">应用到原文</button> : <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1"><CheckCircle size={12} />已应用</span>}
                                </div>
                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2.5">
                                        <div className="text-[11px] uppercase tracking-wide text-rose-200/80">原句</div>
                                        <div className="text-sm text-rose-100 mt-1 whitespace-pre-wrap">{issue.original || '（空）'}</div>
                                    </div>
                                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2.5">
                                        <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">建议表达</div>
                                        <div className="text-sm text-emerald-100 mt-1 whitespace-pre-wrap">{issue.fixed || '（空）'}</div>
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-phy-muted">{issue.reason}</div>
                            </div>
                        ))}
                    </div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-bold text-phy-text text-sm">段落级改写对照</h4>
                            <span className="text-[11px] text-phy-muted">只展示发生变化的段落</span>
                            {rewrittenText ? (
                                <button
                                    onClick={() => applyAiTextChange(rewrittenText, '采用整篇改写', { type: 'rewrite' })}
                                    className="ml-auto px-2.5 py-1.5 rounded-md border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold"
                                >
                                    一键采用整篇改写
                                </button>
                            ) : null}
                        </div>
                        {!rewrittenText ? (
                            <div className="text-sm text-phy-muted">本次诊断未返回整篇改写。</div>
                        ) : !changedParagraphComparisons.length ? (
                            <div className="text-sm text-phy-muted">改写与原文差异很小，建议优先看上方“句级问题”。</div>
                        ) : (
                            <div className="space-y-3">
                                {changedParagraphComparisons.map((row) => (
                                    <div key={row.index} className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="text-[11px] text-phy-muted">段落 P{row.index}</div>
                                            <span className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-200">
                                                {row.changeCount || row.sentenceChanges.length} 处关键变化
                                            </span>
                                            <button
                                                onClick={() => setExpandedCompareMap((prev) => ({ ...prev, [row.index]: !prev[row.index] }))}
                                                className="ml-auto text-[11px] px-2 py-1 rounded-md border border-phy-border text-phy-muted hover:text-phy-text"
                                            >
                                                {expandedCompareMap[row.index] ? '收起整段' : '展开整段'}
                                            </button>
                                        </div>

                                        {row.sentenceChanges.length ? (
                                            <div className="space-y-2">
                                                {row.sentenceChanges.map((change) => (
                                                    <div key={change.index} className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                                                        <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2.5">
                                                            <div className="text-[11px] uppercase tracking-wide text-rose-200/80">原句</div>
                                                            <div className="text-sm text-rose-100 mt-1 whitespace-pre-wrap">{change.before}</div>
                                                        </div>
                                                        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2.5">
                                                            <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">改写句</div>
                                                            <div className="text-sm text-emerald-100 mt-1 whitespace-pre-wrap">{change.after}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {row.changeCount > row.sentenceChanges.length ? (
                                                    <div className="text-[11px] text-phy-muted">
                                                        还有 {row.changeCount - row.sentenceChanges.length} 处变化，展开整段可查看完整内容。
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-phy-muted">主要是措辞细调，未检测到明显句级结构变化。</div>
                                        )}

                                        {expandedCompareMap[row.index] ? (
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 mt-3">
                                                <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2.5">
                                                    <div className="text-[11px] uppercase tracking-wide text-rose-200/80">原段落全文</div>
                                                    {row.before ? (
                                                        <div className="mt-1">
                                                            <InlineParagraphDiff oldText={row.before} newText={row.after} side="old" />
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-rose-100 mt-1">（该段为新增）</div>
                                                    )}
                                                </div>
                                                <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2.5">
                                                    <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">改写段落全文</div>
                                                    {row.after ? (
                                                        <div className="mt-1">
                                                            <InlineParagraphDiff oldText={row.before} newText={row.after} side="new" />
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-emerald-100 mt-1">（该段被删除）</div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4"><h4 className="font-bold text-phy-text text-sm mb-2">词汇注入建议</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{injectSuggestions.map((item, idx) => <div key={idx} className="rounded-lg border border-phy-border bg-phy-glass p-3"><div className="text-sm font-bold text-phy-text">{item.word}</div><div className="text-xs text-phy-muted mt-1">{item.why}</div><div className="text-xs text-indigo-300 mt-1">{item.where}</div></div>)}</div></div>
                </>
            )}
        </div>
    );

    const ImprovedDiagnosePane = (
        <div
            className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4 bg-phy-bg/20"
            onMouseUp={() => captureReadOnlySelection('diagnose')}
            onClick={(e) => { if (window.innerWidth < 768) handleReadOnlyTextTap(e, 'diagnose'); }}
            onContextMenu={(e) => { if (window.innerWidth < 768) e.preventDefault(); }}
            style={{ WebkitTouchCallout: 'none' }}
        >
            {!analysis ? (
                <div className="glass-panel rounded-2xl border border-phy-border p-6 text-sm text-phy-muted text-center">暂无诊断结果，请先完成一次 AI 诊断。</div>
            ) : (
                <>
                    <div className="glass-panel rounded-2xl border border-phy-border p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="text-xs text-phy-muted uppercase mb-1">总评分</div>
                                <div className="text-4xl font-black text-phy-text">{analysis.score_total || analysis.score}<span className="text-lg text-phy-muted"> / 15</span></div>
                            </div>
                            <button
                                onClick={runAnalyze}
                                disabled={isAnalyzing}
                                className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                            >
                                {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                重新诊断
                            </button>
                        </div>
                        <div className="text-sm text-phy-text mt-3 leading-6">{analysis.overall_comment || analysis.comment || '暂无总评'}</div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">任务回应</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.task_response ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">连贯衔接</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.coherence ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">词汇表达</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.lexical_resource ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">语法准确</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.grammar_range_accuracy ?? 0}</div></div>
                    </div>

                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <h4 className="font-bold text-phy-text text-sm mb-2">提分行动清单</h4>
                        {(analysis.improvement_plan || []).slice(0, 5).map((item) => (
                            <label key={item.id} className="flex items-start gap-2 rounded-lg border border-phy-border p-2 bg-phy-glass mb-2">
                                <input type="checkbox" checked={Boolean(actionChecks[item.id])} onChange={() => setActionChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className="mt-0.5" />
                                <div className="text-sm text-phy-text flex-1">{item.title}: <span className="text-phy-muted">{item.action}</span></div>
                                <button onClick={(e) => { e.preventDefault(); requestInsertPreview(item.action, { label: '提分建议插入', sourceTitle: item.title || '提分建议', mode: insertModePreference, anchor: insertAnchor }); }} className="px-2 py-1 text-[11px] rounded-md border border-indigo-500/30 text-indigo-300">插入</button>
                            </label>
                        ))}
                    </div>

                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <h4 className="font-bold text-phy-text text-sm mb-2">句级问题 ({(analysis.issues || []).length})</h4>
                        {(analysis.issues || []).map((issue, idx) => (
                            <div key={idx} className={`rounded-lg border p-3 mb-2 ${issue.applied ? 'opacity-60 border-emerald-500/30 bg-emerald-500/5' : 'border-phy-border bg-phy-glass'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-xs text-phy-muted">{issue.type} · sentence #{issue.sentence_index}</div>
                                    {!issue.applied ? <button onClick={() => applyFix(issue)} className="px-2 py-1 text-[11px] rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">应用到原文</button> : <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1"><CheckCircle size={12} />已应用</span>}
                                </div>
                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2.5">
                                        <div className="text-[11px] uppercase tracking-wide text-rose-200/80">原句</div>
                                        <div className="text-sm text-rose-100 mt-1 whitespace-pre-wrap">{issue.original || '（空）'}</div>
                                    </div>
                                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2.5">
                                        <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">建议表达</div>
                                        <div className="text-sm text-emerald-100 mt-1 whitespace-pre-wrap">{issue.fixed || '（空）'}</div>
                                    </div>
                                </div>
                                <div className="mt-2 text-xs text-phy-muted">{issue.reason}</div>
                            </div>
                        ))}
                    </div>

                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-bold text-phy-text text-sm">段落级改写对照</h4>
                            <span className="text-[11px] text-phy-muted">只展示发生变化的段落</span>
                            {rewrittenText ? (
                                <button
                                    onClick={() => {
                                        if (window.confirm('采用整篇改写会替换当前草稿，可用撤销按钮恢复。确定采用吗？')) {
                                            applyAiTextChange(rewrittenText, '采用整篇改写', { type: 'rewrite' });
                                        }
                                    }}
                                    className="ml-auto px-2.5 py-1.5 rounded-md border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold"
                                >
                                    一键采用整篇改写
                                </button>
                            ) : null}
                        </div>
                        {!rewrittenText ? (
                            <div className="text-sm text-phy-muted">本次诊断未返回整篇改写。</div>
                        ) : !changedParagraphComparisons.length ? (
                            <div className="text-sm text-phy-muted">改写与原文差异很小，建议优先查看句级问题。</div>
                        ) : (
                            <div className="space-y-3">
                                {changedParagraphComparisons.map((row) => (
                                    <div key={row.index} className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="text-[11px] text-phy-muted">段落 P{row.index}</div>
                                            <span className="text-[11px] px-2 py-0.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 text-indigo-200">
                                                {row.changeCount || row.sentenceChanges.length} 处关键变化
                                            </span>
                                            <button
                                                onClick={() => setExpandedCompareMap((prev) => ({ ...prev, [row.index]: !prev[row.index] }))}
                                                className="ml-auto text-[11px] px-2 py-1 rounded-md border border-phy-border text-phy-muted hover:text-phy-text"
                                            >
                                                {expandedCompareMap[row.index] ? '收起整段' : '展开整段'}
                                            </button>
                                        </div>
                                        {row.sentenceChanges.length ? (
                                            <div className="space-y-2">
                                                {row.sentenceChanges.map((change) => (
                                                    <div key={change.index} className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                                                        <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2.5">
                                                            <div className="text-[11px] uppercase tracking-wide text-rose-200/80">原句</div>
                                                            <div className="text-sm text-rose-100 mt-1 whitespace-pre-wrap">{change.before}</div>
                                                        </div>
                                                        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2.5">
                                                            <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">改写句</div>
                                                            <div className="text-sm text-emerald-100 mt-1 whitespace-pre-wrap">{change.after}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-phy-muted">主要是措辞细调，未检测到明显句级结构变化。</div>
                                        )}
                                        {expandedCompareMap[row.index] ? (
                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 mt-3">
                                                <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2.5">
                                                    <div className="text-[11px] uppercase tracking-wide text-rose-200/80">原段落全文</div>
                                                    <InlineParagraphDiff oldText={row.before} newText={row.after} side="old" />
                                                </div>
                                                <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2.5">
                                                    <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">改写段落全文</div>
                                                    <InlineParagraphDiff oldText={row.before} newText={row.after} side="new" />
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <h4 className="font-bold text-phy-text text-sm mb-2">词汇注入建议</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {injectSuggestions.map((item, idx) => (
                                <div key={idx} className="rounded-lg border border-phy-border bg-phy-glass p-3">
                                    <div className="text-sm font-bold text-phy-text">{item.word}</div>
                                    <div className="text-xs text-phy-muted mt-1">{item.why}</div>
                                    <div className="text-xs text-indigo-300 mt-1">{item.where}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    const MaterialQuickPanel = ({ showClose = false, onClose = null, compact = false } = {}) => (
        <div className={`h-full min-h-0 flex flex-col bg-phy-glassHeavy backdrop-blur-2xl ${isMobile ? 'overflow-y-auto' : ''}`}>
            <div className="px-4 py-4 border-b border-phy-border bg-gradient-to-br from-indigo-500/5 to-amber-500/5">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                        <FolderOpen size={16} className="text-amber-500 dark:text-amber-300" />
                    </div>
                    <div>
                        <div className="font-black text-phy-text text-sm">写作素材包</div>
                        <div className="text-[10px] text-phy-muted font-medium">{materials.length} 条已存储</div>
                    </div>
                    <button onClick={() => setMaterialManagerModalOpen(true)} className="ml-auto px-2.5 py-1.5 rounded-lg border border-phy-border text-[11px] font-bold text-phy-muted hover:text-phy-text hover:bg-phy-glass transition-colors">管理</button>
                    {showClose && onClose ? (
                        <button onClick={onClose} className="p-1.5 rounded-lg text-phy-muted hover:text-rose-500 hover:bg-rose-500/10 transition-colors">
                            <X size={16} />
                        </button>
                    ) : null}
                </div>
                <p className="text-[11px] text-phy-muted mt-1">快插入优先：搜索、预览、应用到当前写作位置。</p>
                <div className="text-[11px] text-phy-muted mt-1">{insertAnchorHint}</div>
            </div>

            <div className="px-4 py-3 border-b border-phy-border space-y-3 bg-phy-bg/5">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-phy-border bg-phy-glass p-1">
                        <button
                            onClick={() => setMaterialDrawerTab('recommend')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${materialDrawerTab === 'recommend' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                        >
                            智能推荐 ({recommendedMaterials.length})
                        </button>
                        <button
                            onClick={() => setMaterialDrawerTab('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${materialDrawerTab === 'all' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                        >
                            全部素材
                        </button>
                        <button
                            onClick={() => setMaterialDrawerTab('deep_note')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${materialDrawerTab === 'deep_note' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                        >
                            深度笔记 ({deepNoteMaterials.length})
                        </button>
                    </div>
                    {vocabularyMaterials.length && showVocabularyWorkbench ? (
                        <div className="inline-flex rounded-xl border border-phy-border bg-phy-glass p-1 ml-auto">
                            <button
                                onClick={() => setVocabView('cards')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold ${vocabView === 'cards' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                            >
                                词汇卡片
                            </button>
                            <button
                                onClick={() => setVocabView('table')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold ${vocabView === 'table' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                            >
                                词汇表格
                            </button>
                        </div>
                    ) : null}
                </div>

                <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-phy-muted" />
                    <input
                        value={materialQuery}
                        onChange={(e) => setMaterialQuery(e.target.value)}
                        placeholder="搜索标题 / 内容 / 标签"
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-phy-bg border border-phy-border text-sm text-phy-text"
                    />
                </div>

                {hiddenSourceIds.length ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5">
                        <div className="text-[11px] text-amber-200">
                            已隐藏 {hiddenSourceIds.length} 条深度笔记素材
                        </div>
                        <button
                            onClick={clearHiddenSourceMaterials}
                            className="px-2 py-0.5 rounded-md border border-amber-300/30 text-[11px] font-bold text-amber-100 hover:bg-amber-400/10"
                        >
                            恢复全部
                        </button>
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={() => setMaterialCategory('all')}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${materialCategory === 'all' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-phy-glass text-phy-muted border-phy-border'}`}
                    >
                        全部 ({visibleMaterials.length})
                    </button>
                    {WRITING_MATERIAL_CATEGORIES.map((c) => (
                        <button
                            key={c.value}
                            onClick={() => setMaterialCategory(c.value)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${materialCategory === c.value ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-phy-glass text-phy-muted border-phy-border'}`}
                        >
                            {c.label} ({categoryCounts.get(c.value) || 0})
                        </button>
                    ))}
                </div>

                <div className="rounded-xl border border-phy-border bg-phy-glass/60 p-2">
                    <button
                        onClick={() => setMaterialQuickActionsOpen((v) => !v)}
                        className="w-full flex items-center justify-between text-xs font-bold text-phy-muted hover:text-phy-text"
                    >
                        <span>快捷动作（次级）</span>
                        <span>{materialQuickActionsOpen ? '收起' : '展开'}</span>
                    </button>
                    {materialQuickActionsOpen ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button onClick={collectSelectionToMaterial} className="px-3 py-2 rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-200 text-xs font-bold">
                                收藏选中
                            </button>
                            <button onClick={collectFromDraft} className="px-3 py-2 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold">
                                草稿采集
                            </button>
                            <button onClick={assembleAmmoPack} className="px-3 py-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 text-xs font-bold">
                                一键组装
                            </button>
                            <button onClick={() => setMaterialManagerModalOpen(true)} className="px-3 py-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold">
                                打开管理
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className={`flex-1 min-h-0 grid grid-cols-1 ${isMobile ? 'h-auto' : ''}`}>
                <div className={`${isMobile ? 'pb-24' : 'overflow-y-auto custom-scrollbar'} p-3 space-y-2`}>
                    {drawerMaterials.map((item) => {
                        const itemCategory = normalizeMaterialCategory(item.category);
                        const vocabPairsPreview = itemCategory === 'vocabulary' ? parseWriterVocabularyPairs(item) : [];
                        const sourceKey = getMaterialSourceKey(item);
                        const isDeepNoteSource = item?.source === 'deep_note';
                        const isPinnedSource = isDeepNoteSource && sourceKey ? pinnedSourceIds.includes(sourceKey) : false;
                        const listPreview = itemCategory === 'vocabulary'
                            ? (vocabPairsPreview.length ? `${vocabPairsPreview[0].source} -> ${vocabPairsPreview[0].target}` : item.content)
                            : item.content;
                        return (
                            <div
                                key={item.id}
                                className={`w-full rounded-xl border p-2.5 transition ${activeMaterialId === item.id ? 'border-indigo-400/40 bg-indigo-500/10' : 'border-phy-border bg-phy-glass hover:border-phy-borderHover'}`}
                            >
                                <button onClick={() => setActiveMaterialId(item.id)} className="w-full text-left">
                                    <div className="text-sm font-bold text-phy-text truncate">{item.title}</div>
                                    <div className="text-[10px] text-phy-muted mt-1 flex items-center gap-1.5">
                                        <span>{WRITING_MATERIAL_CATEGORY_LABELS[item.category] || item.category}</span>
                                        {item.topic ? <span>· {item.topic}</span> : null}
                                        {isDeepNoteSource ? (
                                            <span className="px-1.5 py-0.5 rounded border border-emerald-400/25 bg-emerald-500/10 text-emerald-200">深度笔记</span>
                                        ) : null}
                                        {isPinnedSource ? (
                                            <span className="px-1.5 py-0.5 rounded border border-amber-400/25 bg-amber-500/10 text-amber-200">已固定</span>
                                        ) : null}
                                    </div>
                                    <div className="text-[11px] text-phy-muted mt-1 line-clamp-2">{listPreview}</div>
                                    {item.recommendationReason ? (
                                        <div className="text-[10px] text-emerald-200 mt-1 line-clamp-1">{item.recommendationReason}</div>
                                    ) : null}
                                    {isDeepNoteSource && item?.sourceNoteTitle ? (
                                        <div className="text-[10px] text-phy-muted mt-1 truncate" title={item.sourceNoteTitle}>
                                            来源：{item.sourceNoteTitle}{item.sourceSection ? ` / ${item.sourceSection}` : ''}
                                        </div>
                                    ) : null}
                                </button>
                                <div className="mt-2">
                                    <button
                                        onClick={() => requestInsertPreview(item.rewrite || item.content, {
                                            label: `素材预览：${item.title}`,
                                            materialId: item.id,
                                            sourceTitle: item.title || '素材预览',
                                            mode: insertModePreference,
                                            anchor: insertAnchor
                                        })}
                                        className="w-full px-2 py-1 rounded-md text-[11px] border border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glass"
                                    >
                                        预览插入位置
                                    </button>
                                </div>
                                {isDeepNoteSource ? (
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        <button
                                            onClick={() => togglePinSourceMaterial(item)}
                                            className={`px-2 py-1 rounded-md text-[10px] border ${isPinnedSource ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-phy-border text-phy-muted hover:text-phy-text'}`}
                                        >
                                            {isPinnedSource ? '取消固定' : '固定保留'}
                                        </button>
                                        <button
                                            onClick={() => toggleHideSourceMaterial(item)}
                                            className="px-2 py-1 rounded-md text-[10px] border border-rose-400/30 bg-rose-500/10 text-rose-200"
                                        >
                                            临时隐藏
                                        </button>
                                        {item?.sourceNoteId ? (
                                            <button
                                                onClick={() => openSourceNote(item)}
                                                className="px-2 py-1 rounded-md text-[10px] border border-phy-border text-phy-muted hover:text-phy-text"
                                            >
                                                回到笔记
                                            </button>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                    {!drawerMaterials.length ? (
                        <div className="rounded-xl border border-dashed border-phy-border p-3 text-xs text-phy-muted text-center">
                            {materialDrawerTab === 'recommend'
                                ? '暂无推荐素材，可切到“全部素材”查看。'
                                : materialDrawerTab === 'deep_note'
                                    ? '暂无深度笔记来源素材'
                                    : '没有素材'}
                        </div>
                    ) : null}
                </div>

                <div className="min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {showVocabularyWorkbench && vocabularyMaterials.length ? (
                        <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <div className="text-sm font-black text-phy-text">词汇替换工作台</div>
                                <div className="text-[11px] text-phy-muted">默认仅作用于当前选中句</div>
                            </div>
                            {vocabView === 'cards' ? (
                                <div className="grid grid-cols-1 gap-2 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                                    {vocabularyMaterials.map((item) => {
                                        const pairs = parseWriterVocabularyPairs(item);
                                        const visiblePairs = pairs.slice(0, 6);
                                        const hiddenCount = Math.max(0, pairs.length - visiblePairs.length);
                                        return (
                                            <div key={`vocab-card-${item.id}`} className="rounded-xl border border-phy-border bg-phy-glass p-2.5">
                                                <div className="text-[11px] text-phy-muted">{item.title || '词汇替换'}</div>
                                                {item.replaceReason ? (
                                                    <div className="mt-1 text-xs text-phy-muted line-clamp-2">{item.replaceReason}</div>
                                                ) : null}
                                                {visiblePairs.length ? (
                                                    <div className="mt-2 space-y-1.5">
                                                        {visiblePairs.map((pair, pairIdx) => (
                                                            <div key={`${item.id}-pair-card-${pairIdx}`} className="rounded-lg border border-phy-border bg-phy-glass p-2">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="text-xs font-bold text-rose-200 break-all">{pair.source}</div>
                                                                    <div className="text-[10px] text-phy-muted">{'->'}</div>
                                                                    <div className="text-xs font-bold text-emerald-200 break-all text-right">{pair.target}</div>
                                                                </div>
                                                                <button
                                                                    onClick={() => applyVocabularyToSelectedSentence(item, pair)}
                                                                    className="mt-2 w-full px-2 py-1 rounded-md text-[11px] border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                                                >
                                                                    用到当前句
                                                                </button>
                                                            </div>
                                                        ))}
                                                        {hiddenCount > 0 ? (
                                                            <div className="text-[11px] text-phy-muted">还有 {hiddenCount} 组映射，点击素材详情可查看全部。</div>
                                                        ) : null}
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 text-xs text-amber-200/90 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5">
                                                        未解析到“原词 → 替换词”映射，请编辑该素材补全映射。
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="max-h-[340px] overflow-auto custom-scrollbar rounded-xl border border-phy-border bg-phy-glass">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-phy-glassHeavy border-b border-phy-border text-phy-muted">
                                            <tr>
                                                <th className="px-2 py-2">材料</th>
                                                <th className="px-2 py-2">原词</th>
                                                <th className="px-2 py-2">替换词</th>
                                                <th className="px-2 py-2">理由</th>
                                                <th className="px-2 py-2">操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {vocabularyRows.map((row) => (
                                                <tr key={`vocab-row-${row.id}`} className="border-t border-phy-border">
                                                    <td className="px-2 py-2 text-phy-muted max-w-[180px] truncate" title={row.item.title || '词汇替换'}>{row.item.title || '词汇替换'}</td>
                                                    <td className="px-2 py-2 text-phy-text">{row.pair.source || '-'}</td>
                                                    <td className="px-2 py-2 text-emerald-200">{row.pair.target || '-'}</td>
                                                    <td className="px-2 py-2 text-phy-muted max-w-[240px] truncate">{row.pair.reason || row.item.replaceReason || '-'}</td>
                                                    <td className="px-2 py-2">
                                                        <button
                                                            onClick={() => applyVocabularyToSelectedSentence(row.item, row.pair)}
                                                            className="px-2 py-1 rounded-md text-[11px] border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                                        >
                                                            应用
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    ) : null}

                    {activeMaterial ? (
                        <div 
                            className="rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-3"
                            onMouseUp={() => captureReadOnlySelection('material')}
                            onClick={(e) => { if (window.innerWidth < 768) handleReadOnlyTextTap(e, 'material'); }}
                            onContextMenu={(e) => { if (window.innerWidth < 768) e.preventDefault(); }}
                            style={{ WebkitTouchCallout: 'none' }}
                        >
                            {(() => {
                                const isVocab = normalizeMaterialCategory(activeMaterial.category) === 'vocabulary';
                                const activeSourceKey = getMaterialSourceKey(activeMaterial);
                                const activePinned = activeMaterial?.source === 'deep_note' && activeSourceKey
                                    ? pinnedSourceIds.includes(activeSourceKey)
                                    : false;
                                return (
                                    <>
                                        <div className="flex items-start gap-2">
                                            <div className="flex-1">
                                                <div className="text-sm font-black text-phy-text">{activeMaterial.title}</div>
                                                <div className="text-xs text-phy-muted mt-1">
                                                    {WRITING_MATERIAL_CATEGORY_LABELS[activeMaterial.category] || activeMaterial.category}
                                                    {activeMaterial.topic ? ` · ${activeMaterial.topic}` : ''}
                                                </div>
                                            </div>
                                            {activeMaterial?.source === 'deep_note' ? (
                                                <div className="mt-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-2.5 py-2 space-y-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="px-2 py-0.5 rounded-md text-[10px] border border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                                                            来自深度笔记
                                                        </span>
                                                        {activePinned ? (
                                                            <span className="px-2 py-0.5 rounded-md text-[10px] border border-amber-400/30 bg-amber-500/10 text-amber-200">
                                                                已固定
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    {activeMaterial?.sourceNoteTitle ? (
                                                        <div className="text-[11px] text-phy-muted truncate max-w-[300px]" title={activeMaterial.sourceNoteTitle}>
                                                            笔记：{activeMaterial.sourceNoteTitle}
                                                            {activeMaterial.sourceSection ? ` / ${activeMaterial.sourceSection}` : ''}
                                                        </div>
                                                    ) : null}
                                                    {activeMaterial?.updatedAt ? (
                                                        <div className="text-[11px] text-phy-muted">
                                                            最近同步：{new Date(activeMaterial.updatedAt).toLocaleString()}
                                                        </div>
                                                    ) : null}
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        {activeMaterial?.sourceNoteId ? (
                                                            <button
                                                                onClick={() => openSourceNote(activeMaterial)}
                                                                className="px-2 py-0.5 rounded-md border border-phy-border text-[10px] text-phy-muted hover:text-phy-text"
                                                            >
                                                                回到笔记
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            onClick={() => togglePinSourceMaterial(activeMaterial)}
                                                            className={`px-2 py-0.5 rounded-md border text-[10px] ${activePinned ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-phy-border text-phy-muted hover:text-phy-text'}`}
                                                        >
                                                            {activePinned ? '取消固定' : '固定保留'}
                                                        </button>
                                                        <button
                                                            onClick={() => toggleHideSourceMaterial(activeMaterial)}
                                                            className="px-2 py-0.5 rounded-md border border-rose-400/30 bg-rose-500/10 text-[10px] text-rose-200"
                                                        >
                                                            临时隐藏
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : null}
                                            <button
                                                onClick={() => {
                                                    handleEditMaterial(activeMaterial);
                                                    setMaterialManagerModalOpen(true);
                                                }}
                                                className="px-2 py-1 rounded-md border border-phy-border text-[11px] text-phy-muted hover:text-phy-text"
                                            >
                                                管理编辑
                                            </button>
                                        </div>
                                        {isVocab ? (
                                            <div className="mt-2 rounded-lg border border-phy-border bg-phy-glass p-2.5 space-y-2">
                                                <div className="text-[11px] text-phy-muted">词汇替换映射</div>
                                                {(() => {
                                                    const pairs = parseWriterVocabularyPairs(activeMaterial);
                                                    if (!pairs.length) {
                                                        return (
                                                            <div className="text-xs text-amber-200/90 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5">
                                                                该素材未解析到“原词 → 替换词”映射，请编辑后补全。
                                                            </div>
                                                        );
                                                    }
                                                    return (
                                                        <div className="max-h-[220px] overflow-auto custom-scrollbar space-y-1.5 pr-1">
                                                            {pairs.map((pair, idx) => (
                                                                <div key={`${activeMaterial.id}-pair-${idx}`} className="rounded-lg border border-phy-border bg-phy-glassHeavy p-2">
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div className="text-xs font-bold text-rose-200 break-all">{pair.source}</div>
                                                                        <div className="text-[10px] text-phy-muted">{'->'}</div>
                                                                        <div className="text-xs font-bold text-emerald-200 break-all text-right">{pair.target}</div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => applyVocabularyToSelectedSentence(activeMaterial, pair)}
                                                                        className="mt-2 px-2 py-1 rounded-md text-[11px] border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                                                                    >
                                                                        应用到当前选中句
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                                {activeMaterial.replaceReason ? (
                                                    <div className="text-xs text-phy-muted">替换理由：{activeMaterial.replaceReason}</div>
                                                ) : null}
                                                {activeMaterial.beforeExample ? (
                                                    <div className="text-xs text-rose-200/90">替换前：{activeMaterial.beforeExample}</div>
                                                ) : null}
                                                {activeMaterial.afterExample ? (
                                                    <div className="text-xs text-emerald-200">替换后：{activeMaterial.afterExample}</div>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-phy-text mt-2 whitespace-pre-wrap break-words leading-6">{activeMaterial.content}</div>
                                        )}
                                        {activeMaterial.rewrite ? (
                                            <div className="mt-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 p-2.5">
                                                <div className="text-[11px] text-indigo-200 font-bold mb-1">推荐改写版</div>
                                                <div className="text-sm text-phy-text whitespace-pre-wrap break-words leading-6">{activeMaterial.rewrite}</div>
                                            </div>
                                        ) : null}
                                        {activeMaterial.usage ? (
                                            <div className="mt-2 rounded-lg border border-phy-border bg-phy-glass p-2.5">
                                                <div className="text-[11px] text-emerald-300 font-bold mb-1">适用场景</div>
                                                <div className="text-xs text-phy-muted whitespace-pre-wrap break-words leading-5">{activeMaterial.usage}</div>
                                            </div>
                                        ) : null}
                                        {activeMaterial.caution ? (
                                            <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-2.5">
                                                <div className="text-[11px] text-amber-200 font-bold mb-1">误用提醒</div>
                                                <div className="text-xs text-amber-100/90 whitespace-pre-wrap break-words leading-5">{activeMaterial.caution}</div>
                                            </div>
                                        ) : null}
                                        {Array.isArray(activeMaterial.tags) && activeMaterial.tags.length > 0 ? (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {activeMaterial.tags.slice(0, 8).map((tag) => (
                                                    <span key={`${activeMaterial.id}-${tag}`} className="px-1.5 py-0.5 rounded-md text-[10px] bg-phy-bg border border-phy-border text-phy-muted">{tag}</span>
                                                ))}
                                            </div>
                                        ) : null}
                                        <div className="mt-3 grid grid-cols-3 gap-2">
                                            <button onClick={() => insertMaterialContent(activeMaterial, activeMaterial.content, '素材正文插入')} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">{isVocab ? '插入替换映射' : '插入正文'}</button>
                                            <button onClick={() => insertMaterialContent(activeMaterial, activeMaterial.rewrite || activeMaterial.content, '素材改写插入')} className="px-3 py-2 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold">插入改写</button>
                                            <button onClick={() => setMaterialManagerModalOpen(true)} className="px-3 py-2 rounded-lg border border-phy-border text-phy-text text-xs font-bold hover:bg-phy-glass">更多管理</button>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-phy-border p-5 text-sm text-phy-muted text-center">
                            左侧选择一条素材查看详情
                        </div>
                    )}

                </div>
            </div>
        </div>
    );

    const MaterialManagerForm = (
        <div className="rounded-2xl border border-phy-border bg-phy-glass p-3 space-y-2">
            <div className="text-xs font-bold text-phy-muted uppercase tracking-wide">{materialForm.id ? '编辑素材' : '新增素材'}</div>
            <input
                value={materialForm.title}
                onChange={(e) => setMaterialForm((p) => ({ ...p, title: e.target.value }))}
                placeholder={isVocabMaterialForm ? '标题（可选，不填将自动生成）' : '素材标题'}
                className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text"
            />
            {isVocabMaterialForm ? (
                <>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            value={materialForm.sourceTerm}
                            onChange={(e) => setMaterialForm((p) => ({ ...p, sourceTerm: e.target.value }))}
                            placeholder="替换前词汇（必填）"
                            className="rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text"
                        />
                        <input
                            value={materialForm.targetTerm}
                            onChange={(e) => setMaterialForm((p) => ({ ...p, targetTerm: e.target.value }))}
                            placeholder="替换后词汇（必填）"
                            className="rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text"
                        />
                    </div>
                    <textarea
                        value={materialForm.replaceReason}
                        onChange={(e) => setMaterialForm((p) => ({ ...p, replaceReason: e.target.value }))}
                        rows={2}
                        placeholder="替换理由（必填：语义更准确 / 更学术 / 更正式）"
                        className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text resize-y"
                    />
                    <button
                        onClick={() => setMaterialFormAdvancedOpen((v) => !v)}
                        className="w-full px-3 py-2 rounded-lg border border-phy-border bg-phy-glass text-xs font-bold text-phy-muted text-left"
                    >
                        高级字段（例句/提醒/标签）{materialFormAdvancedOpen ? ' · 收起' : ' · 展开'}
                    </button>
                    {materialFormAdvancedOpen ? (
                        <>
                            <textarea
                                value={materialForm.beforeExample}
                                onChange={(e) => setMaterialForm((p) => ({ ...p, beforeExample: e.target.value }))}
                                rows={2}
                                placeholder="替换前例句（可选）"
                                className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text resize-y"
                            />
                            <textarea
                                value={materialForm.afterExample}
                                onChange={(e) => setMaterialForm((p) => ({ ...p, afterExample: e.target.value }))}
                                rows={2}
                                placeholder="替换后例句（建议填写）"
                                className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text resize-y"
                            />
                            <textarea
                                value={materialForm.caution}
                                onChange={(e) => setMaterialForm((p) => ({ ...p, caution: e.target.value }))}
                                rows={2}
                                placeholder="误用提醒（词性/语境限制）"
                                className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text resize-y"
                            />
                        </>
                    ) : null}
                </>
            ) : (
                <>
                    <textarea
                        value={materialForm.content}
                        onChange={(e) => setMaterialForm((p) => ({ ...p, content: e.target.value }))}
                        rows={4}
                        placeholder="素材内容（句级表达优先）"
                        className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text resize-y"
                    />
                    <textarea
                        value={materialForm.rewrite}
                        onChange={(e) => setMaterialForm((p) => ({ ...p, rewrite: e.target.value }))}
                        rows={3}
                        placeholder="推荐改写版（可选）"
                        className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text resize-y"
                    />
                    <textarea
                        value={materialForm.usage}
                        onChange={(e) => setMaterialForm((p) => ({ ...p, usage: e.target.value }))}
                        rows={2}
                        placeholder="适用场景（例如：适合放在P2论证句）"
                        className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text resize-y"
                    />
                    <textarea
                        value={materialForm.caution}
                        onChange={(e) => setMaterialForm((p) => ({ ...p, caution: e.target.value }))}
                        rows={2}
                        placeholder="误用提醒（例如：不要照搬主语和结论）"
                        className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text resize-y"
                    />
                </>
            )}
            <div className="grid grid-cols-2 gap-2">
                <select
                    value={materialForm.category}
                    onChange={(e) => {
                        const nextCategory = e.target.value;
                        setMaterialFormAdvancedOpen(normalizeMaterialCategory(nextCategory) === 'vocabulary');
                        setMaterialForm((p) => {
                            if (normalizeMaterialCategory(nextCategory) !== 'vocabulary') {
                                return { ...p, category: nextCategory };
                            }
                            return {
                                ...p,
                                category: nextCategory,
                                sourceTerm: p.sourceTerm || '',
                                targetTerm: p.targetTerm || '',
                                replaceReason: p.replaceReason || '',
                                beforeExample: p.beforeExample || '',
                                afterExample: p.afterExample || ''
                            };
                        });
                    }}
                    className="rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text"
                >
                    {WRITING_MATERIAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input
                    value={materialForm.topic}
                    onChange={(e) => setMaterialForm((p) => ({ ...p, topic: e.target.value }))}
                    placeholder="话题标签"
                    className="rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text"
                />
            </div>
            <input
                value={materialForm.tags}
                onChange={(e) => setMaterialForm((p) => ({ ...p, tags: e.target.value }))}
                placeholder="标签（逗号分隔）"
                className="w-full rounded-lg bg-phy-bg border border-phy-border px-3 py-2 text-sm text-phy-text"
            />
            <div className="flex gap-2">
                <button
                    onClick={handleSaveMaterial}
                    disabled={isSavingMaterial}
                    className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-70"
                >
                    {isSavingMaterial ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {materialForm.id ? '更新' : '保存'}
                </button>
                <button onClick={resetMaterialForm} className="px-3 py-2 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold">清空</button>
                {materialForm.id ? (
                    <button
                        onClick={() => handleDeleteMaterial({ id: materialForm.id, title: materialForm.title })}
                        className="px-3 py-2 rounded-lg border border-rose-400/30 text-rose-300 text-xs font-bold hover:bg-rose-500/10"
                    >
                        删除
                    </button>
                ) : null}
            </div>
        </div>
    );

    const MaterialManagerModal = materialManagerModalOpen ? (
        <div className="fixed inset-0 z-[121] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-6xl max-h-[88vh] rounded-2xl border border-phy-border bg-phy-glassHeavy backdrop-blur-3xl shadow-2xl overflow-hidden flex flex-col animate-fade-in">
                <div className="px-4 py-3 border-b border-phy-border bg-phy-glass flex items-center gap-2">
                    <FolderOpen size={16} className="text-amber-300" />
                    <div className="font-black text-phy-text">素材管理中心</div>
                    <div className="text-xs text-phy-muted ml-auto">新增 / 编辑 / 删除素材</div>
                    <button onClick={() => setMaterialManagerModalOpen(false)} className="p-1.5 rounded-lg text-phy-muted hover:text-phy-text hover:bg-phy-glass">
                        <X size={14} />
                    </button>
                </div>
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="border-b lg:border-b-0 lg:border-r border-phy-border overflow-y-auto custom-scrollbar p-3 space-y-2">
                        <button onClick={resetMaterialForm} className="w-full px-3 py-2 rounded-lg border border-dashed border-phy-border text-phy-muted hover:text-phy-text hover:border-phy-borderHover text-sm font-bold">
                            + 新增素材
                        </button>
                        {materialManagerList.map((item) => (
                            <div key={`manager-${item.id}`} className="rounded-xl border border-phy-border bg-phy-glass p-2.5">
                                <div className="text-sm font-bold text-phy-text line-clamp-1">{item.title}</div>
                                <div className="text-[10px] text-phy-muted mt-1">{WRITING_MATERIAL_CATEGORY_LABELS[item.category] || item.category}</div>
                                <div className="mt-2 flex gap-1.5">
                                    <button onClick={() => handleEditMaterial(item)} className="flex-1 px-2 py-1 rounded-md text-[11px] border border-phy-border text-phy-muted hover:text-phy-text">编辑</button>
                                    <button onClick={() => handleDeleteMaterial(item)} className="flex-1 px-2 py-1 rounded-md text-[11px] border border-rose-400/30 text-rose-300 hover:bg-rose-500/10">删除</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="min-h-0 overflow-y-auto custom-scrollbar p-4">
                        {MaterialManagerForm}
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    const DesktopDockedMaterialPanel = materialPanelMode === 'docked' ? (
        <aside className="hidden md:flex shrink-0 w-[560px] min-w-[520px] max-w-[640px] border-l border-phy-border bg-phy-glassHeavy backdrop-blur-2xl">
            {MaterialQuickPanel({ compact: false, showClose: true, onClose: () => setMaterialPanelMode('hidden') })}
        </aside>
    ) : null;

    const MobileMaterialSheet = mobileMaterialSheetOpen ? (
        <>
            <div className="md:hidden fixed inset-0 z-[112] bg-black/45" onClick={() => setMobileMaterialSheetOpen(false)} />
            <div className="md:hidden fixed inset-x-0 bottom-0 z-[113] transition-transform duration-200" style={{ height: `${mobileMaterialSheetHeight}vh`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                <div className="h-full rounded-t-2xl border-t border-x border-phy-border bg-phy-glassHeavy shadow-2xl overflow-hidden flex flex-col">
                    <div className="px-3 pt-2 pb-2 border-b border-phy-border bg-phy-glass" onTouchStart={onMobileSheetTouchStart} onTouchMove={onMobileSheetTouchMove} onTouchEnd={onMobileSheetTouchEnd}>
                        <div className="mx-auto w-10 h-1.5 rounded-full bg-phy-border mb-2" />
                        <div className="flex items-center gap-2">
                            <div className="text-sm font-black text-phy-text">素材快插入</div>
                            <div className="text-[11px] text-phy-muted ml-auto">上滑展开 / 下滑收起</div>
                            <button onClick={() => setMaterialManagerModalOpen(true)} className="px-2 py-1 rounded-md border border-phy-border text-[11px] text-phy-text">管理</button>
                            <button onClick={() => setMobileMaterialSheetOpen(false)} className="p-1.5 rounded-lg text-phy-muted hover:text-phy-text hover:bg-phy-glass"><X size={14} /></button>
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        {MaterialQuickPanel({ compact: true, showClose: false })}
                    </div>
                </div>
            </div>
        </>
    ) : null;

    const Main = (
        <div className="h-full min-h-0 flex flex-col bg-transparent">
            {workflowStep !== 'write' ? StepNav : null}
            <div className="flex-1 min-h-0 overflow-hidden">
                {workflowStep === 'prompt' ? ImprovedPromptPane : workflowStep === 'outline' ? ImprovedOutlinePane : workflowStep === 'write' ? WritePane : ImprovedDiagnosePane}
            </div>
        </div>
    );

    const TemplatePicker = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/60">
            <div className="bg-phy-glassHeavy rounded-2xl shadow-2xl border border-phy-borderHover w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-phy-borderHover flex justify-between items-center bg-phy-glass">
                    <h3 className="font-bold text-white text-lg flex items-center gap-2"><Layout className="text-emerald-500" /> 选择写作模板</h3>
                    <button onClick={() => setShowTemplateModal(false)} className="text-phy-muted hover:text-white"><X /></button>
                </div>
                <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => { setShowTemplateModal(false); setCurrentId(null); activeDraftIdRef.current = null; setContent(''); setContentOrigin('manual'); setIsContentDirty(false); setTitle(''); setOutline(null); setAnalysis(null); setWorkflowStep('write'); setMobileTab('editor'); }} className="p-4 rounded-xl border border-dashed border-phy-border hover:border-emerald-500 text-left"><div className="font-bold text-phy-text">空白文档</div><div className="text-xs text-phy-muted mt-1">从零开始，自由创作。</div></button>
                    {writingTemplates.map(t => (
                        <button key={t.id} onClick={() => { setShowTemplateModal(false); setCurrentId(null); activeDraftIdRef.current = null; setContent(t.content); setContentOrigin('template'); setIsContentDirty(false); setTitle(`${t.name} - ${new Date().toLocaleDateString()}`); setOutline(null); setAnalysis(null); setWorkflowStep('write'); setMobileTab('editor'); }} className="p-4 rounded-xl border border-phy-border bg-phy-glass hover:bg-phy-glassHover text-left">
                            <div className="font-bold text-phy-text">{t.name}</div><div className="text-xs text-phy-muted mt-1">{t.description}</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const pendingInsertPreview = pendingInsert ? buildInsertPreview(pendingInsert, content) : null;
    const InsertPreviewModal = pendingInsert ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
            <div className="w-full max-w-4xl rounded-2xl border border-phy-border bg-phy-glassHeavy backdrop-blur-3xl shadow-2xl overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-phy-border flex items-center">
                    <div className="text-sm font-black text-phy-text">插入预览：{pendingInsert.label}</div>
                    <div className="ml-3 text-xs text-phy-muted">来源：{pendingInsert.sourceTitle || '素材内容'}</div>
                    <button onClick={() => setPendingInsert(null)} className="ml-auto p-1.5 rounded-lg text-phy-muted hover:text-phy-text hover:bg-phy-glass">
                        <X size={14} />
                    </button>
                </div>
                <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {READABLE_INSERT_MODE_OPTIONS.map((modeOption) => (
                            <button
                                key={modeOption.value}
                                onClick={() => setPendingInsert((prev) => prev ? { ...prev, mode: modeOption.value } : prev)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${pendingInsert.mode === modeOption.value ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-phy-glass text-phy-muted border-phy-border'}`}
                            >
                                {modeOption.label}
                            </button>
                        ))}
                    </div>
                    <div className="rounded-xl border border-phy-border bg-phy-glass p-2.5 text-xs text-phy-muted">
                        {pendingInsertPreview?.ok ? `目标位置：${pendingInsertPreview.targetLabel}` : `当前模式不可用：${pendingInsertPreview?.error || '请调整插入模式'}`}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-rose-200/80">插入前</div>
                            <div className="mt-1 max-h-[30vh] overflow-y-auto text-sm text-rose-100 whitespace-pre-wrap break-words leading-6">
                                {pendingInsertPreview?.previewBefore || '（空）'}
                            </div>
                        </div>
                        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
                            <div className="text-[11px] uppercase tracking-wide text-emerald-200/80">插入后</div>
                            <div className="mt-1 max-h-[30vh] overflow-y-auto text-sm text-emerald-100 whitespace-pre-wrap break-words leading-6">
                                {pendingInsertPreview?.previewAfter || '（空）'}
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-phy-border bg-phy-glass p-3 shadow-inner">
                        <div className="text-[11px] text-phy-muted mb-1 font-bold">即将插入内容</div>
                        <div className="max-h-[24vh] overflow-y-auto text-sm text-phy-text whitespace-pre-wrap break-words leading-6">
                            {pendingInsert.text}
                        </div>
                    </div>
                    <div className="text-[10px] text-phy-muted font-medium italic">共 {pendingInsert.text.length} 字符</div>
                </div>
                <div className="px-4 py-3 border-t border-phy-border flex justify-end gap-2 bg-phy-glass/40">
                    <button onClick={() => setPendingInsert(null)} className="px-3 py-2 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold">取消</button>
                    <button
                        onClick={confirmPendingInsert}
                        disabled={!pendingInsertPreview?.ok}
                        className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        确认插入
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    const AmmoPickerModal = ammoPicker.open ? (
        <div className="fixed inset-0 z-[129] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
            <div className="w-full max-w-3xl rounded-2xl border border-phy-border bg-phy-glassHeavy backdrop-blur-3xl shadow-2xl overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-phy-border flex items-center">
                    <div className="text-sm font-black text-phy-text">弹药包勾选</div>
                    <div className="ml-2 text-xs text-phy-muted">勾选你要插入的句块</div>
                    <button onClick={() => setAmmoPicker({ open: false, items: [] })} className="ml-auto p-1.5 rounded-lg text-phy-muted hover:text-phy-text hover:bg-phy-glass">
                        <X size={14} />
                    </button>
                </div>
                <div className="p-4 max-h-[52vh] overflow-y-auto space-y-2">
                    {(ammoPicker.items || []).map((item) => (
                        <label key={item.id} className="block rounded-xl border border-phy-border bg-phy-glass p-3 cursor-pointer">
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={Boolean(item.selected)}
                                    onChange={() => toggleAmmoItem(item.id)}
                                />
                                <div className="text-xs font-bold text-phy-text">{item.label}</div>
                            </div>
                            <div className="mt-2 text-sm text-phy-text whitespace-pre-wrap break-words leading-6">{item.text}</div>
                            {item.note ? <div className="mt-1 text-[11px] text-phy-muted">使用提示：{item.note}</div> : null}
                        </label>
                    ))}
                </div>
                <div className="px-4 py-3 border-t border-phy-border flex justify-between items-center bg-phy-glass">
                    <div className="text-xs text-phy-muted">已选 {(ammoPicker.items || []).filter((x) => x.selected).length} 条</div>
                    <div className="flex gap-2">
                        <button onClick={() => setAmmoPicker({ open: false, items: [] })} className="px-3 py-2 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold">取消</button>
                        <button onClick={confirmAmmoInsert} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">生成插入预览</button>
                    </div>
                </div>
            </div>
        </div>
    ) : null;

    return (
        <div className="w-full h-full min-h-0 flex flex-col overflow-hidden">
            {showTemplateModal ? TemplatePicker : null}
            {AmmoPickerModal}
            {InsertPreviewModal}
            {showPolishModal && selection ? <PolishChatModal selectedText={selection.text} onClose={() => setShowPolishModal(false)} /> : null}
            {MaterialManagerModal}
            {MobileMaterialSheet}
            <div className="hidden md:flex h-full min-h-0 overflow-hidden rounded-2xl border border-phy-border bg-phy-glassHeavy shadow-xl">
                <div className="min-w-0 flex-1 overflow-hidden">
                    {(workflowStep === 'write' && focusMode) || isWriterLeftPanelHidden ? (
                        <div className="h-full min-h-0 overflow-hidden">{Main}</div>
                    ) : (
                        <div className="h-full min-h-0 overflow-hidden">
                            <SplitPane
                                initialLeftWidth={writerLeftPanelWidth}
                                minLeftWidth={0}
                                maxLeftWidth={500}
                                onLeftWidthChange={handleWriterSplitResize}
                                left={ImprovedSidebar}
                                right={Main}
                            />
                        </div>
                    )}
                </div>
                {DesktopDockedMaterialPanel}
            </div>
            <div className="md:hidden h-full min-h-0 flex flex-col rounded-2xl border border-phy-border bg-phy-glassHeavy overflow-hidden">
                {readSelection ? (
                    <div className="flex items-center justify-between p-2 px-4 bg-phy-glassHeavy border-b border-phy-border shrink-0 h-10">
                        <div className="flex items-center gap-1.5 overflow-hidden flex-1">
                            <span className="text-[10px] font-bold text-indigo-400 uppercase truncate max-w-[60px]">{readSelection.text}</span>
                            <button
                                onClick={() => {
                                    const selection = window.getSelection?.();
                                    if (selection) {
                                        try {
                                            selection.modify("extend", "backward", "sentence");
                                            selection.modify("extend", "forward", "sentence");
                                            const text = selection.toString().trim();
                                            if (text) setReadSelection({ ...readSelection, text });
                                        } catch (e) {
                                            console.warn('Sentence selection failed:', e);
                                        }
                                    }
                                }}
                                className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] active:scale-95 transition-transform"
                            >
                                选整句
                            </button>
                            <button
                                onClick={() => {
                                    insertMaterialContent(null, readSelection.text, '选中文字插入');
                                    clearReadSelection();
                                }}
                                className="px-2 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[10px] active:scale-95 transition-transform"
                            >
                                插入
                            </button>
                            <button
                                onClick={() => {
                                    handleEditMaterial({ title: '新单词/短语', content: readSelection.text, category: 'vocabulary' });
                                    setMaterialManagerModalOpen(true);
                                    clearReadSelection();
                                }}
                                className="px-2 py-1 rounded-lg bg-amber-500 text-amber-950 font-bold text-[10px] active:scale-95 transition-transform"
                            >
                                收藏
                            </button>
                        </div>
                        <button onClick={clearReadSelection} className="ml-2 p-1.5 rounded-lg bg-white/5 text-phy-muted border border-phy-border">
                            <X size={14} />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-2 px-4 bg-phy-glassHeavy border-b border-phy-border shrink-0">
                        <div className="font-bold text-phy-text text-sm">写作助手</div>
                        <div className="flex bg-phy-glass rounded-lg p-1">
                            <button onClick={() => setMobileTab('tools')} className={`px-3 py-1 text-xs rounded-md ${mobileTab === 'tools' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}>工具</button>
                            <button onClick={() => setMobileTab('editor')} className={`px-3 py-1 text-xs rounded-md ${mobileTab === 'editor' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}>编辑</button>
                            <button onClick={() => setMobileTab('analysis')} className={`px-3 py-1 text-xs rounded-md ${mobileTab === 'analysis' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}>诊断</button>
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-hidden">{mobileTab === 'tools' ? ImprovedSidebar : mobileTab === 'editor' ? Main : ImprovedDiagnosePane}</div>
            </div>
        </div>
    );
};

export default WriterView;
