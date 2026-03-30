
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { analyzeImagesForChat, analyzePassageStructure, debateReadingEvidence, generateAdversarialReadingDrill, sendChat } from '../services/ai';
import { extractTextFromPDF } from '../services/pdf';
import { getFolders, saveFolder, saveNote } from '../services/db';
import {
    AlertCircle,
    BookMarked,
    CheckCircle2,
    FileText,
    Highlighter,
    History,
    Loader2,
    Maximize2,
    MessageSquare,
    Minimize2,
    Play,
    RotateCcw,
    Save,
    Sparkles,
    ShieldAlert,
    Target,
    Trash2,
    Underline,
    Upload,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';

const STORAGE_KEY = 'exam_adversarial_session_v2';
const HISTORY_KEY = 'exam_adversarial_history_v1';
const HISTORY_LIMIT = 30;
const HISTORY_PASSAGE_LIMIT = 30000;
const HISTORY_QUESTION_TEXT_LIMIT = 12000;
const TYPOGRAPHY_KEY = 'exam_typography_preset';
const DESKTOP_SPLIT_KEY = 'exam_split_ratio_desktop';
const MOBILE_SPLIT_KEY = 'exam_split_ratio_mobile';
const MODE_OPTIONS = [
    { value: 'mixed', label: '混合模式（阅�?+ 段落匹配?? },
    { value: 'reading', label: '娴犲懘妲勭拠鑽ゆ倞鐟欙綇绱欓柅澶嬪妫版﹫绱? },
    { value: 'matching', label: '仅段落匹配（四六级常见�?? },
    { value: 'cet_strict_matching', label: '严格四六级段落匹配（Section B?? }
];

const STRUCTURE_TYPE_META = {
    background: { label: '閼冲本娅?, chip: 'border-slate-400/40 text-slate-200 bg-slate-500/10' },
    claim: { label: '鐟欏倻鍋?, chip: 'border-indigo-400/40 text-indigo-200 bg-indigo-500/10' },
    argument: { label: '鐠侀缚鐦?, chip: 'border-cyan-400/40 text-cyan-200 bg-cyan-500/10' },
    evidence: { label: '鐠囦焦宓?, chip: 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10' },
    example: { label: '娓氬鐡?, chip: 'border-amber-400/40 text-amber-200 bg-amber-500/10' },
    counterargument: { label: '閸欏秹鈹?, chip: 'border-rose-400/40 text-rose-200 bg-rose-500/10' },
    transition: { label: '鏉╁洦娴?, chip: 'border-violet-400/40 text-violet-200 bg-violet-500/10' },
    conclusion: { label: '缂佹捁顔?, chip: 'border-blue-400/40 text-blue-200 bg-blue-500/10' },
    other: { label: '閸忔湹绮?, chip: 'border-phy-border text-phy-muted bg-phy-bg' }
};

const DEFAULT_SETUP = {
    sourceType: 'article',
    mode: 'mixed',
    questionCount: 6,
    passage: '',
    questionText: ''
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const splitParagraphs = (text = '') => {
    return String(text).split(/\n{1,}/).map((x) => x.trim()).filter(Boolean);
};

const toAnswer = (value = '') => String(value || '').trim().toUpperCase().charAt(0);
const isStrictCETMode = (mode = '') => String(mode || '').toLowerCase() === 'cet_strict_matching';
const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();
const getContextSlice = (text = '', start = 0, end = 0) => {
    const safeStart = Math.max(0, Number(start) || 0);
    const safeEnd = Math.max(safeStart, Number(end) || safeStart);
    const head = Math.max(0, safeStart - 35);
    const tail = Math.min(text.length, safeEnd + 35);
    return text.slice(head, tail).replace(/\n+/g, ' ').trim();
};
const getSelectionElement = (node) => {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
};

const evaluatePaper = (paper, answers) => {
    if (!paper) return { total: 0, correct: 0, accuracy: 0 };
    let total = 0;
    let correct = 0;

    (paper.questions || []).forEach((q) => {
        total += 1;
        if (toAnswer(answers[`mcq-${q.id}`]) === toAnswer(q.answer)) correct += 1;
    });

    (paper.matching?.statements || []).forEach((s) => {
        total += 1;
        if (toAnswer(answers[`match-${s.id}`]) === toAnswer(s.answer)) correct += 1;
    });

    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return { total, correct, accuracy };
};

const formatOption = (idx, text) => `${String.fromCharCode(65 + idx)}. ${text}`;

const normalizeHistoryRows = (record) => {
    const rows = Array.isArray(record?.rows) ? record.rows : [];
    return rows.map((row, idx) => ({
        id: row.id || `row-${idx}`,
        type: row.type || 'mcq',
        question: row.question || '',
        userAnswer: row.userAnswer || '',
        correctAnswer: row.correctAnswer || '',
        isCorrect: Boolean(row.isCorrect),
        explanation: row.explanation || '',
        evidence: row.evidence || ''
    }));
};

const toSafeStructureAnalysis = (value = {}) => {
    if (!value || !Array.isArray(value.segments)) return null;
    const segments = value.segments
        .map((seg, idx) => ({
            id: String(seg?.id || `seg-${idx + 1}`),
            type: String(seg?.type || 'other'),
            label: String(seg?.label || ''),
            startParagraph: Math.max(1, Number(seg?.startParagraph || seg?.start_paragraph || 1) || 1),
            endParagraph: Math.max(1, Number(seg?.endParagraph || seg?.end_paragraph || seg?.startParagraph || seg?.start_paragraph || 1) || 1),
            summary: String(seg?.summary || '')
        }))
        .filter((seg) => seg.endParagraph >= seg.startParagraph);
    return segments.length
        ? {
            overview: String(value?.overview || ''),
            segments
        }
        : null;
};

const toSafePaperSnapshot = (paper = {}) => {
    const source = paper || {};
    const safeQuestions = Array.isArray(source.questions) ? source.questions.map((q, idx) => ({
        id: q?.id ?? idx,
        question: String(q?.question || ''),
        options: Array.isArray(q?.options) ? q.options.map((x) => String(x || '')) : [],
        answer: String(q?.answer || ''),
        explanation: String(q?.explanation || ''),
        evidence_sentence: String(q?.evidence_sentence || '')
    })) : [];
    const safeMatching = source.matching ? {
        paragraphs: Array.isArray(source.matching?.paragraphs) ? source.matching.paragraphs.map((p, idx) => ({
            label: String(p?.label || String.fromCharCode(65 + idx)),
            text: String(p?.text || '')
        })) : [],
        statements: Array.isArray(source.matching?.statements) ? source.matching.statements.map((s, idx) => ({
            id: s?.id ?? idx,
            text: String(s?.text || ''),
            answer: String(s?.answer || ''),
            explanation: String(s?.explanation || ''),
            evidence_sentence: String(s?.evidence_sentence || '')
        })) : []
    } : null;

    return {
        title: String(source.title || ''),
        passage: String(source.passage || '').slice(0, HISTORY_PASSAGE_LIMIT),
        questions: safeQuestions,
        matching: safeMatching,
        structureAnalysis: toSafeStructureAnalysis(source.structureAnalysis)
    };
};

const buildHistoryRecord = ({ paper, setup, answers, result }) => {
    const rows = [];
    (paper?.questions || []).forEach((q, idx) => {
        const userAnswer = toAnswer(answers[`mcq-${q.id}`] || '');
        const correctAnswer = toAnswer(q.answer || '');
        rows.push({
            id: `mcq-${q.id || idx}`,
            type: 'mcq',
            question: `Q${idx + 1}. ${q.question || ''}`,
            userAnswer: userAnswer || '閺堫亙缍旂粵?,
            correctAnswer: correctAnswer || '閺堫亞鐓?,
            isCorrect: Boolean(userAnswer && correctAnswer && userAnswer === correctAnswer),
            explanation: q.explanation || '',
            evidence: q.evidence_sentence || ''
        });
    });
    (paper?.matching?.statements || []).forEach((s, idx) => {
        const userAnswer = toAnswer(answers[`match-${s.id}`] || '');
        const correctAnswer = toAnswer(s.answer || '');
        rows.push({
            id: `match-${s.id || idx}`,
            type: 'matching',
            question: `M${idx + 1}. ${s.text || ''}`,
            userAnswer: userAnswer || '閺堫亙缍旂粵?,
            correctAnswer: correctAnswer || '閺堫亞鐓?,
            isCorrect: Boolean(userAnswer && correctAnswer && userAnswer === correctAnswer),
            explanation: s.explanation || '',
            evidence: s.evidence_sentence || ''
        });
    });

    return {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        title: paper?.title || '闂冨懓顕扮€佃濮夌拋顓犵矊',
        mode: setup?.mode || 'mixed',
        sourceType: setup?.sourceType || 'article',
        result: {
            total: result?.total || 0,
            correct: result?.correct || 0,
            accuracy: result?.accuracy || 0
        },
        passagePreview: String(paper?.passage || '').slice(0, 1200),
        paperSnapshot: toSafePaperSnapshot(paper),
        answersSnapshot: { ...(answers || {}) },
        setupSnapshot: {
            ...DEFAULT_SETUP,
            ...(setup || {}),
            passage: String(setup?.passage || paper?.passage || '').slice(0, HISTORY_PASSAGE_LIMIT),
            questionText: String(setup?.questionText || '').slice(0, HISTORY_QUESTION_TEXT_LIMIT)
        },
        rows
    };
};

const ExamView = () => {
    const { settings, addFlashcard, loadUserFlashcards, addChatMessage, toggleChat, isChatOpen } = useApp();
    const [canvasMode, setCanvasMode] = useState(() => localStorage.getItem('exam_canvas_mode') || 'classic');
    const [setup, setSetup] = useState(DEFAULT_SETUP);
    const [paper, setPaper] = useState(null);
    const [answers, setAnswers] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [score, setScore] = useState({ total: 0, correct: 0, accuracy: 0 });
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoadingFile, setIsLoadingFile] = useState(false);
    const [isParsingImages, setIsParsingImages] = useState(false);

    const [debateTarget, setDebateTarget] = useState(null);
    const [debateMessages, setDebateMessages] = useState([]);
    const [debateInput, setDebateInput] = useState('');
    const [isDebating, setIsDebating] = useState(false);
    const [typographyPreset, setTypographyPreset] = useState(() => {
        const saved = localStorage.getItem(TYPOGRAPHY_KEY);
        return saved === 'paper' ? 'paper' : 'readable';
    });
    const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth < 768);
    const [desktopSplitRatio, setDesktopSplitRatio] = useState(() => {
        const parsed = Number(localStorage.getItem(DESKTOP_SPLIT_KEY));
        return Number.isFinite(parsed) ? clamp(parsed, 45, 70) : 58;
    });
    const [mobileSplitRatio, setMobileSplitRatio] = useState(() => {
        const parsed = Number(localStorage.getItem(MOBILE_SPLIT_KEY));
        return Number.isFinite(parsed) ? clamp(parsed, 35, 70) : 55;
    });
    const [splitDragMode, setSplitDragMode] = useState(null); // 'desktop' | 'mobile' | null
    const [showMarksDrawer, setShowMarksDrawer] = useState(false);
    const [questionViewMode, setQuestionViewMode] = useState('all'); // all | wrong
    const [retryWrongKeys, setRetryWrongKeys] = useState([]);
    const [focusedRange, setFocusedRange] = useState(null);
    const [examHistory, setExamHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [historyId, setHistoryId] = useState(null);
    const [wordMarks, setWordMarks] = useState([]);
    const [sentenceMarks, setSentenceMarks] = useState([]);
    const [selectionDraft, setSelectionDraft] = useState(null);
    const [isMarkingBusy, setIsMarkingBusy] = useState(false);
    const [sentenceAnalysis, setSentenceAnalysis] = useState('');
    const [markSortMode, setMarkSortMode] = useState('time'); // time | position
    const [isAnalyzingStructure, setIsAnalyzingStructure] = useState(false);
    const articleMainRef = useRef(null);
    const questionPanelRef = useRef(null);
    const examLayoutRef = useRef(null);
    const questionRefs = useRef({});
    const structureReqRef = useRef(0);
    const strictSetupMode = isStrictCETMode(setup.mode);
    const strictPaperMode = isStrictCETMode(paper?.mode);
    const strictCETActive = strictSetupMode || strictPaperMode;

    useEffect(() => {
        const mode = canvasMode === 'expanded' ? 'expanded' : 'classic';
        localStorage.setItem('exam_canvas_mode', mode);
        window.dispatchEvent(new CustomEvent('exam-canvas-mode-change', { detail: { mode } }));
    }, [canvasMode]);

    useEffect(() => {
        const onResize = () => setIsMobileViewport(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        localStorage.setItem(TYPOGRAPHY_KEY, typographyPreset);
    }, [typographyPreset]);

    useEffect(() => {
        localStorage.setItem(DESKTOP_SPLIT_KEY, String(desktopSplitRatio));
    }, [desktopSplitRatio]);

    useEffect(() => {
        localStorage.setItem(MOBILE_SPLIT_KEY, String(mobileSplitRatio));
    }, [mobileSplitRatio]);

    useEffect(() => {
        if (!splitDragMode) return;

        const onMove = (e) => {
            if (!examLayoutRef.current) return;
            const rect = examLayoutRef.current.getBoundingClientRect();
            if (splitDragMode === 'desktop') {
                const ratio = ((e.clientX - rect.left) / rect.width) * 100;
                setDesktopSplitRatio(clamp(ratio, 45, 70));
                return;
            }
            const ratio = ((e.clientY - rect.top) / rect.height) * 100;
            setMobileSplitRatio(clamp(ratio, 35, 70));
        };

        const onUp = () => setSplitDragMode(null);

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = splitDragMode === 'desktop' ? 'col-resize' : 'row-resize';

        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [splitDragMode]);

    const paragraphPool = useMemo(() => {
        if (!paper) return [];
        if (paper.matching?.paragraphs?.length) return paper.matching.paragraphs;
        return splitParagraphs(paper.passage).slice(0, strictCETActive ? 12 : 8).map((text, idx) => ({
            label: String.fromCharCode(65 + idx),
            text
        }));
    }, [paper, strictCETActive]);
    const matchingOptions = useMemo(() => {
        if (!strictCETActive) return paragraphPool;
        const map = new Map((paragraphPool || []).map((p) => [String(p.label || '').toUpperCase(), p]));
        return 'ABCDEFGHIJKL'.split('').map((label) => map.get(label) || ({ label, text: '' }));
    }, [paragraphPool, strictCETActive]);
    const articleParagraphs = useMemo(() => splitParagraphs(paper?.passage || ''), [paper?.passage]);
    const structureOverview = String(paper?.structureAnalysis?.overview || '').trim();
    const structureSegments = useMemo(() => (
        Array.isArray(paper?.structureAnalysis?.segments) ? paper.structureAnalysis.segments : []
    ), [paper?.structureAnalysis]);
    const articleParagraphRanges = useMemo(() => {
        const source = String(paper?.passage || '');
        if (!source || !articleParagraphs.length) return [];
        let cursor = 0;
        return articleParagraphs.map((text, idx) => {
            let start = source.indexOf(text, cursor);
            if (start < 0) start = source.indexOf(text);
            if (start < 0) start = cursor;
            const end = Math.min(source.length, start + text.length);
            cursor = end;
            return {
                paragraph: idx + 1,
                text,
                start,
                end
            };
        });
    }, [paper?.passage, articleParagraphs]);

    const answeredCount = useMemo(() => {
        const keys = Object.keys(answers || {});
        return keys.filter((k) => answers[k]).length;
    }, [answers]);

    const totalCount = useMemo(() => {
        if (!paper) return 0;
        return (paper.questions?.length || 0) + (paper.matching?.statements?.length || 0);
    }, [paper]);

    const questionMetaList = useMemo(() => {
        if (!paper) return [];
        const list = [];
        (paper.questions || []).forEach((q, idx) => {
            const key = `mcq-${q.id}`;
            const selected = answers[key] || '';
            const correct = toAnswer(q.answer);
            const wrong = submitted && Boolean(selected) && toAnswer(selected) !== correct;
            list.push({
                key,
                type: 'mcq',
                label: `Q${idx + 1}`,
                answered: Boolean(selected),
                wrong,
                question: q.question || '',
                evidence: q.evidence_sentence || ''
            });
        });
        (paper.matching?.statements || []).forEach((s, idx) => {
            const key = `match-${s.id}`;
            const selected = answers[key] || '';
            const correct = toAnswer(s.answer);
            const statementNo = strictCETActive ? (Number(s.id) || (36 + idx)) : (idx + 1);
            const wrong = submitted && Boolean(selected) && toAnswer(selected) !== correct;
            list.push({
                key,
                type: 'matching',
                label: `M${statementNo}`,
                answered: Boolean(selected),
                wrong,
                question: s.text || '',
                evidence: s.evidence_sentence || ''
            });
        });
        return list;
    }, [paper, answers, submitted, strictCETActive]);

    const wrongQuestionKeys = useMemo(
        () => questionMetaList.filter((item) => item.wrong).map((item) => item.key),
        [questionMetaList]
    );

    const effectiveWrongKeys = submitted ? wrongQuestionKeys : retryWrongKeys;
    const visibleMatchingItems = useMemo(
        () => (paper?.matching?.statements || []).filter((s) => questionViewMode !== 'wrong' || effectiveWrongKeys.includes(`match-${s.id}`)),
        [paper?.matching?.statements, questionViewMode, effectiveWrongKeys]
    );
    const shouldRenderQuestion = (key) => questionViewMode !== 'wrong' || effectiveWrongKeys.includes(key);
    const selectedHistory = useMemo(() => {
        if (!historyId) return examHistory[0] || null;
        return examHistory.find((x) => x.id === historyId) || examHistory[0] || null;
    }, [examHistory, historyId]);
    const selectedHistoryRows = useMemo(() => normalizeHistoryRows(selectedHistory), [selectedHistory]);
    const canRestoreSelectedHistory = useMemo(() => {
        const snap = selectedHistory?.paperSnapshot;
        if (!snap) return false;
        const hasPassage = Boolean(String(snap.passage || '').trim());
        const hasQuestions = Array.isArray(snap.questions) && snap.questions.length > 0;
        const hasMatching = Array.isArray(snap.matching?.statements) && snap.matching.statements.length > 0;
        return hasPassage || hasQuestions || hasMatching;
    }, [selectedHistory]);
    const annotatedPassageSegments = useMemo(() => {
        const source = String(paper?.passage || '');
        if (!source) return [];

        const normalizeMarks = (list) => (Array.isArray(list) ? list : [])
            .map((m) => ({
                ...m,
                start: Math.max(0, Math.min(source.length, Number(m?.start) || 0)),
                end: Math.max(0, Math.min(source.length, Number(m?.end) || 0))
            }))
            .filter((m) => m.end > m.start);

        const words = normalizeMarks(wordMarks);
        const sentences = normalizeMarks(sentenceMarks);
        const boundaries = new Set([0, source.length]);
        words.forEach((m) => {
            boundaries.add(m.start);
            boundaries.add(m.end);
        });
        sentences.forEach((m) => {
            boundaries.add(m.start);
            boundaries.add(m.end);
        });
        const points = Array.from(boundaries).sort((a, b) => a - b);
        const segments = [];
        for (let i = 0; i < points.length - 1; i += 1) {
            const start = points[i];
            const end = points[i + 1];
            if (end <= start) continue;
            const text = source.slice(start, end);
            const isWord = words.some((m) => m.start < end && m.end > start);
            const isSentence = sentences.some((m) => m.start < end && m.end > start);
            segments.push({ start, end, text, isWord, isSentence });
        }
        return segments;
    }, [paper?.passage, wordMarks, sentenceMarks]);

    const sortedWordMarks = useMemo(() => {
        const list = [...wordMarks];
        if (markSortMode === 'position') {
            return list.sort((a, b) => (a.start || 0) - (b.start || 0));
        }
        return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }, [wordMarks, markSortMode]);

    const sortedSentenceMarks = useMemo(() => {
        const list = [...sentenceMarks];
        if (markSortMode === 'position') {
            return list.sort((a, b) => (a.start || 0) - (b.start || 0));
        }
        return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }, [sentenceMarks, markSortMode]);
    const allMarks = useMemo(() => {
        const words = sortedWordMarks.map((mark) => ({ ...mark, markType: 'word' }));
        const sentences = sortedSentenceMarks.map((mark) => ({ ...mark, markType: 'sentence' }));
        const merged = [...words, ...sentences];
        if (markSortMode === 'position') {
            return merged.sort((a, b) => (a.start || 0) - (b.start || 0));
        }
        return merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }, [sortedWordMarks, sortedSentenceMarks, markSortMode]);

    useEffect(() => {
        if (!focusedRange) return;
        const timer = window.setTimeout(() => setFocusedRange(null), 1600);
        return () => window.clearTimeout(timer);
    }, [focusedRange]);

    useEffect(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed?.paper) return;
            const restoredSetup = { ...DEFAULT_SETUP, ...(parsed.setup || {}) };
            const restoredPaper = {
                ...(parsed.paper || {}),
                structureAnalysis: toSafeStructureAnalysis(parsed?.paper?.structureAnalysis)
            };
            if ((!restoredPaper.passage || String(restoredPaper.passage).trim().length < 200) && String(restoredSetup.passage || '').trim().length > 200) {
                restoredPaper.passage = restoredSetup.passage;
            }
            setSetup(restoredSetup);
            setPaper(restoredPaper);
            setAnswers(parsed.answers || {});
            setSubmitted(Boolean(parsed.submitted));
            setScore(parsed.score || { total: 0, correct: 0, accuracy: 0 });
            setWordMarks(Array.isArray(parsed.wordMarks) ? parsed.wordMarks : []);
            setSentenceMarks(Array.isArray(parsed.sentenceMarks) ? parsed.sentenceMarks : []);
            setSentenceAnalysis(String(parsed.sentenceAnalysis || ''));
            if (!restoredPaper?.structureAnalysis?.segments?.length && restoredPaper?.passage) {
                void runStructureAnalysis(restoredPaper, { toastSuccess: false, toastError: false });
            }
            toast.success('鐎圭寮舵禒顔藉緞瀹ュ嫮鐟愭繛鍡節濡插嫮鎷犻弰蹇ｅ敳缂備礁鍟崇换妯绘償?, { id: 'exam_restore_v2' });
        } catch (e) {
            console.error('Failed to restore exam session:', e);
        }
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const list = Array.isArray(parsed) ? parsed : [];
            setExamHistory(list.slice(0, HISTORY_LIMIT));
            if (list[0]?.id) setHistoryId(list[0].id);
        } catch (e) {
            console.error('Failed to load exam history:', e);
        }
    }, []);

    useEffect(() => {
        if (!paper) return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            setup,
            paper,
            answers,
            submitted,
            score,
            wordMarks,
            sentenceMarks,
            sentenceAnalysis,
            updatedAt: Date.now()
        }));
    }, [setup, paper, answers, submitted, score, wordMarks, sentenceMarks, sentenceAnalysis]);

    useEffect(() => {
        if (!submitted || !paper) return;
        setScore(evaluatePaper(paper, answers));
    }, [submitted, paper, answers]);

    const readUpload = async (file) => {
        if (!file) return '';
        if (file.type === 'application/pdf') return extractTextFromPDF(file);
        return file.text();
    };

    const fileToDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const parseImagesToField = async (imageFiles, targetField) => {
        const files = (Array.from(imageFiles || [])).filter((f) => f?.type?.startsWith('image/')).slice(0, 4);
        if (!files.length) return;
        setIsParsingImages(true);
        try {
            const dataUrls = await Promise.all(files.map(fileToDataUrl));
            const instruction = targetField === 'questionText'
                ? '璇锋彁鍙栧浘鐗囦腑鐨勯鐩枃鏈紝淇濈暀棰樺彿銆侀€夐」鍜屾钀藉尮閰嶇粨鏋勶紝杈撳嚭绾枃鏈??
                : '璇锋彁鍙栧浘鐗囦腑鐨勯槄璇诲師鏂囧唴瀹癸紝灏介噺淇濈暀娈佃惤鍒嗚锛岃緭鍑虹函鏂囨湰銆?;
            const extracted = await analyzeImagesForChat(dataUrls, settings, instruction);
            if (!extracted?.trim()) throw new Error('閸ュ墽澧栨稉顓熸弓鐠囧棗鍩嗛崚鐗堟箒閺佸牊鏋冮張?);
            setSetup((prev) => ({ ...prev, [targetField]: `${(prev[targetField] || '').trim()}\n\n${extracted.trim()}`.trim() }));
            toast.success(`宸蹭粠鍥剧墖鎻愬彇鏂囨湰骞惰拷鍔犲埌${targetField === 'questionText' ? '棰樼洰鍖? : '鍘熸枃鍖?}`);
        } catch (e) {
            toast.error(`鍥剧墖璇嗗埆澶辫?? ${e.message}`);
        } finally {
            setIsParsingImages(false);
        }
    };

    const handleUploadPassage = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsLoadingFile(true);
        try {
            const text = await readUpload(file);
            setSetup((prev) => ({ ...prev, passage: text }));
            toast.success(`鐎瑰憡褰冮閬嶅礂閵夛附鐎柡鍫墾缁?{file.name}`);
        } catch (err) {
            toast.error(`閻犲洩顕цぐ鍥ㄥ緞鏉堫偉袝: ${err.message}`);
        } finally {
            setIsLoadingFile(false);
            e.target.value = '';
        }
    };

    const handleUploadQuestions = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsLoadingFile(true);
        try {
            const text = await readUpload(file);
            setSetup((prev) => ({ ...prev, questionText: text }));
            toast.success(`宸插鍏ラ鐩??{file.name}`);
        } catch (err) {
            toast.error(`閻犲洩顕цぐ鍥ㄥ緞鏉堫偉袝: ${err.message}`);
        } finally {
            setIsLoadingFile(false);
            e.target.value = '';
        }
    };

    const handleGenerate = async () => {
        if (!setup.passage.trim()) return toast.error('閻犲洤鍢查崢娑欐綇閹惧啿寮抽柟瀛樼墧缁楀倹瀵奸悩铏€紒?);
        if (setup.sourceType === 'import' && !setup.questionText.trim()) return toast.error('閻犲洤鍢查崢娑氣偓鐢靛帶閸欏棙鎷呴悩鍨暠濡増顭囧ú浼村礃閸涱収鍟?);
        setIsGenerating(true);
        try {
            toast.loading('濮濓絽婀悽鐔稿灇鐎佃濮夊蹇涙鐠囨槒顔勯敓?..', { id: 'exam_build_v2' });
            const requestQuestionCount = strictSetupMode ? 10 : setup.questionCount;
            const result = await generateAdversarialReadingDrill({
                sourceType: setup.sourceType,
                mode: setup.mode,
                questionCount: requestQuestionCount,
                passage: setup.passage,
                questionText: setup.questionText
            }, settings);
            const parsedCount = (result?.questions?.length || 0) + (result?.matching?.statements?.length || 0);
            if (!parsedCount) {
                throw new Error('鏈В鏋愬嚭鏈夋晥棰樼洰锛岃琛ュ厖鏇村畬鏁寸殑鍘熸枃鎴栭骞插悗閲嶈??);
            }
            const nextPaper = {
                ...result,
                structureAnalysis: result?.structureAnalysis || null
            };
            structureReqRef.current += 1;
            setIsAnalyzingStructure(false);
            setPaper(nextPaper);
            setAnswers({});
            setSubmitted(false);
            setScore({ total: 0, correct: 0, accuracy: 0 });
            setDebateTarget(null);
            setDebateMessages([]);
            setDebateInput('');
            setQuestionViewMode('all');
            setRetryWrongKeys([]);
            setWordMarks([]);
            setSentenceMarks([]);
            setSelectionDraft(null);
            setSentenceAnalysis('');
            setShowMarksDrawer(false);
            if (!nextPaper?.structureAnalysis?.segments?.length) {
                void runStructureAnalysis(nextPaper, { toastSuccess: false, toastError: false });
            }
            toast.success('閻犱緡鍘剧划宀勫础瀹勬澘鍤掗柣銏㈠枑閸ㄦ岸鏁嶇仦鐣岀；濠殿喖顑勭紞鏃傜驳閺傛寧鍎?, { id: 'exam_build_v2' });
        } catch (e) {
            toast.error(`闂佹眹鍨婚崰鎰板垂濮橆厼绶為弶鍫亯琚? ${e.message}`, { id: 'exam_build_v2' });
        } finally {
            setIsGenerating(false);
        }
    };

    const clearSession = () => {
        if (!window.confirm('缁绢収鍠栭悾鎯с€掗崨顖楁晞鐟滅増鎸告晶鐘垫媼椤撶姷鐭婃鐐茬埣閸ｆ悂寮弶璺ㄧ；濠殿喖顑呴幃褔鏁?)) return;
        localStorage.removeItem(STORAGE_KEY);
        structureReqRef.current += 1;
        setIsAnalyzingStructure(false);
        setPaper(null);
        setAnswers({});
        setSubmitted(false);
        setScore({ total: 0, correct: 0, accuracy: 0 });
        setDebateTarget(null);
        setDebateMessages([]);
        setDebateInput('');
        setQuestionViewMode('all');
        setRetryWrongKeys([]);
        setWordMarks([]);
        setSentenceMarks([]);
        setSelectionDraft(null);
        setSentenceAnalysis('');
        setShowMarksDrawer(false);
    };

    const persistHistory = (records) => {
        const next = records.slice(0, HISTORY_LIMIT);
        let finalList = next;
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        } catch (e) {
            // Fallback: keep compact rows when localStorage quota is tight.
            const compact = next.map((r) => ({
                ...r,
                paperSnapshot: undefined,
                answersSnapshot: undefined,
                setupSnapshot: undefined
            }));
            try {
                localStorage.setItem(HISTORY_KEY, JSON.stringify(compact));
                finalList = compact;
                toast('鍘嗗彶璁板綍瀛樺偍绌洪棿涓嶈冻锛屽凡鑷姩淇濆瓨绮剧畝�??);
            } catch (e2) {
                finalList = compact.slice(0, 8);
                localStorage.setItem(HISTORY_KEY, JSON.stringify(finalList));
                toast('鍘嗗彶璁板綍绌洪棿绱у紶锛屼粎淇濈暀鏈€杩戣褰?);
            }
        }
        setExamHistory(finalList);
        if (finalList[0]?.id) setHistoryId(finalList[0].id);
    };

    const removeHistoryItem = (id) => {
        const next = examHistory.filter((x) => x.id !== id);
        setExamHistory(next);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        if (historyId === id) setHistoryId(next[0]?.id || null);
    };

    const clearAllHistory = () => {
        if (!window.confirm('缁绢収鍠栭悾鎯с€掗崨顖楁晞闂傚啫鎳撻鐗堬紣濡搫鍧婇柛娆掑蔼椤斿洩銇愰弴鐐村亱闁?)) return;
        setExamHistory([]);
        setHistoryId(null);
        localStorage.removeItem(HISTORY_KEY);
    };

    const submitPaper = () => {
        if (!paper) return;
        const result = evaluatePaper(paper, answers);
        setSubmitted(true);
        setQuestionViewMode('all');
        setRetryWrongKeys([]);
        setScore(result);
        const record = buildHistoryRecord({ paper, setup, answers, result });
        persistHistory([record, ...examHistory]);
        toast.success(`鐎规瓕寮撳锕傚础閸戙倗绐?{result.correct}/${result.total}闁挎稑鏈婊呮兜椤旀儳鑺?${result.accuracy}%`);
    };

    const restoreFromHistory = (record, retry = false) => {
        if (!record) return;
        if (!record.paperSnapshot) {
            toast.error('閻犲洢鍎卞濠氬矗閼奸鍞剁憸鐗堟礃濞肩敻鎳涢鍛紜闁绘鐗婂﹢浼存晬鐏炵偓鐣☉鎾崇У閺侇噣骞愭担閫涘垝濠㈣泛绉寸敮顐﹀础?);
            return;
        }
        const restoredPaper = {
            title: record.paperSnapshot.title || record.title || '闂冨懓顕扮€佃濮夌拋顓犵矊',
            passage: record.paperSnapshot.passage || '',
            questions: Array.isArray(record.paperSnapshot.questions) ? record.paperSnapshot.questions : [],
            matching: record.paperSnapshot.matching || null,
            structureAnalysis: toSafeStructureAnalysis(record.paperSnapshot.structureAnalysis)
        };
        const restoredSetup = {
            ...DEFAULT_SETUP,
            ...(record.setupSnapshot || {}),
            passage: record.setupSnapshot?.passage || restoredPaper.passage || ''
        };
        const restoredAnswers = retry ? {} : { ...(record.answersSnapshot || {}) };
        const hasSavedAnswers = Object.keys(restoredAnswers).length > 0;
        setSetup(restoredSetup);
        setPaper(restoredPaper);
        setAnswers(restoredAnswers);
        setSubmitted(!retry && hasSavedAnswers);
        if (!retry && hasSavedAnswers) {
            setScore(record.result || evaluatePaper(restoredPaper, restoredAnswers));
        } else {
            setScore({ total: 0, correct: 0, accuracy: 0 });
        }
        setDebateTarget(null);
        setDebateMessages([]);
        setDebateInput('');
        setQuestionViewMode('all');
        setRetryWrongKeys([]);
        setWordMarks([]);
        setSentenceMarks([]);
        setSelectionDraft(null);
        setSentenceAnalysis('');
        setShowMarksDrawer(false);
        setShowHistory(false);
        if (!restoredPaper?.structureAnalysis?.segments?.length && restoredPaper?.passage) {
            void runStructureAnalysis(restoredPaper, { toastSuccess: false, toastError: false });
        }
        toast.success(retry ? '鐎规瓕灏ù鍥礂閵夈儱鍧婇柛娆掑蔼閻︻垶宕￠崙銈囩闁告瑯鍨堕崳鎼佸棘妫颁胶绋婄紒? : '鐎瑰憡褰冨ú鏍礆閺夊灝鍧婇柛娆掑紦缂嶆梻绮甸弮鍌涙珪闂?);
    };

    const openDebate = (target) => {
        setDebateTarget(target);
        setDebateMessages([{
            role: 'assistant',
            content: '閹存垳绱伴幍顔界川娑撱儲鐗搁懓鍐ㄧ暭閵嗗倽顕崗鍫ｎ嚛娴ｇ姷娈戠粵鏃€顢嶉敍灞借嫙缂佹瑥鍤担鐘茬穿閻劎娈戠拠浣瑰祦閸欍儯鈧倽瀚㈢拠浣瑰祦娑撳秷鍐婚敍灞惧灉娴兼氨鎴风紒顓炲冀妞瑰厖缍橀�?
        }]);
        setDebateInput('');
    };

    const sendDebate = async () => {
        if (!debateTarget) return;
        const userContent = debateInput.trim();
        if (!userContent) return;

        const selected = answers[debateTarget.key] || '閺堫亙缍旂粵?;
        const userMessage = `閹存垹娈戞担婊呯摕閺勵垽�?{selected}閵嗕繐n閹存垹娈戠拋楦跨槈閿?{userContent}`;
        const historyForAI = [...debateMessages, { role: 'user', content: userMessage }];
        setDebateMessages(historyForAI);
        setDebateInput('');
        setIsDebating(true);
        try {
            const res = await debateReadingEvidence({
                passage: paper?.passage || '',
                question: debateTarget,
                userAnswer: selected,
                userMessage,
                history: historyForAI
            }, settings);
            const reply = [
                res.assistant_reply,
                res.required_evidence ? `鐠囦焦宓佺憰浣圭湴閿?{res.required_evidence}` : '',
                res.hint ? `闁圭粯鍔楅妵姘舵晸?{res.hint}` : ''
            ].filter(Boolean).join('\n');

            setDebateMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        } catch (e) {
            toast.error(`閸欏秹鈹忔径杈Е: ${e.message}`);
        } finally {
            setIsDebating(false);
        }
    };

    const captureSelection = () => {
        const source = String(paper?.passage || '');
        if (!source || !articleMainRef.current) {
            setSelectionDraft(null);
            return;
        }
        const selection = window.getSelection?.();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            setSelectionDraft(null);
            return;
        }
        const range = selection.getRangeAt(0);
        if (!articleMainRef.current.contains(range.commonAncestorContainer)) {
            return;
        }
        try {
            const preRange = document.createRange();
            preRange.selectNodeContents(articleMainRef.current);
            preRange.setEnd(range.startContainer, range.startOffset);
            const rect = range.getBoundingClientRect();
            const start = preRange.toString().length;
            const selectedRaw = selection.toString();
            const length = selectedRaw.length;
            const end = start + length;
            const text = normalizeText(source.slice(start, end) || selectedRaw);
            if (!text) {
                setSelectionDraft(null);
                return;
            }
            setSelectionDraft({
                start,
                end,
                text,
                context: getContextSlice(source, start, end),
                source: 'article',
                questionKey: '',
                questionLabel: '',
                anchorX: rect.left + (rect.width / 2),
                anchorY: rect.top - 8
            });
        } catch (e) {
            console.error('Selection capture failed:', e);
        }
    };

    const captureQuestionSelection = () => {
        if (!questionPanelRef.current) return;
        const selection = window.getSelection?.();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            setSelectionDraft(null);
            return;
        }
        const range = selection.getRangeAt(0);
        const anchorEl = getSelectionElement(range.commonAncestorContainer);
        if (!anchorEl || !questionPanelRef.current.contains(anchorEl)) return;

        const text = normalizeText(selection.toString());
        if (!text) {
            setSelectionDraft(null);
            return;
        }
        const questionEl = anchorEl.closest?.('[data-question-key]');
        const questionKey = questionEl?.getAttribute('data-question-key') || '';
        const meta = questionMetaList.find((item) => item.key === questionKey);
        const rect = range.getBoundingClientRect();
        setSelectionDraft({
            text,
            start: null,
            end: null,
            context: meta?.question ? `${meta.label}: ${meta.question}` : '',
            source: 'question',
            questionKey,
            questionLabel: meta?.label || '',
            anchorX: rect.left + (rect.width / 2),
            anchorY: rect.top - 8
        });
    };

    const clearSelectionDraft = () => {
        setSelectionDraft(null);
        try {
            window.getSelection?.().removeAllRanges();
        } catch (e) {
            // ignore
        }
    };

    const addSelectionMark = (type) => {
        if (!selectionDraft?.text) return toast.error('閻犲洤鍢查崢娑㈡焻婢跺鍘柡鍌氭处濠€?);
        const mark = {
            id: crypto.randomUUID(),
            text: selectionDraft.text,
            start: selectionDraft.source === 'article' ? selectionDraft.start : undefined,
            end: selectionDraft.source === 'article' ? selectionDraft.end : undefined,
            context: selectionDraft.context || '',
            source: selectionDraft.source || 'article',
            questionKey: selectionDraft.questionKey || '',
            questionLabel: selectionDraft.questionLabel || '',
            createdAt: Date.now()
        };
        if (type === 'word') {
            const exists = mark.source === 'article'
                ? wordMarks.some((m) => (m.source || 'article') === 'article' && m.start === mark.start && m.end === mark.end)
                : wordMarks.some((m) =>
                    (m.source || 'article') === 'question'
                    && normalizeText(m.text).toLowerCase() === normalizeText(mark.text).toLowerCase()
                    && String(m.questionKey || '') === String(mark.questionKey || '')
                );
            if (exists) return toast('鐠囥儳鏁撶拠宥嗙垼鐠佹澘鍑＄€涙ê婀?);
            setWordMarks((prev) => [mark, ...prev].slice(0, 120));
            toast.success('鐎圭寮堕崸濠囧礉閻樺灚鏅搁悹鍥хУ閻栵絿鎷?);
        } else {
            const exists = mark.source === 'article'
                ? sentenceMarks.some((m) => (m.source || 'article') === 'article' && m.start === mark.start && m.end === mark.end)
                : sentenceMarks.some((m) =>
                    (m.source || 'article') === 'question'
                    && normalizeText(m.text).toLowerCase() === normalizeText(mark.text).toLowerCase()
                    && String(m.questionKey || '') === String(mark.questionKey || '')
                );
            if (exists) return toast('鐠囥儳鏋掗梾鎯у綖閺嶅洩顔囧鎻掔摠閸?);
            setSentenceMarks((prev) => [mark, ...prev].slice(0, 120));
            toast.success('鐎圭寮堕崸濠囧礉閻樺灚鐎块梻鍛劤瑜扮偤寮介崶顏嶅敹');
        }
        clearSelectionDraft();
    };

    const removeWordMark = (id) => {
        setWordMarks((prev) => prev.filter((m) => m.id !== id));
    };

    const removeSentenceMark = (id) => {
        setSentenceMarks((prev) => prev.filter((m) => m.id !== id));
    };

    const clearAllMarks = () => {
        setWordMarks([]);
        setSentenceMarks([]);
        setSentenceAnalysis('');
        clearSelectionDraft();
    };

    const pushWordMarksToFlashcards = async () => {
        const words = Array.from(new Set(
            wordMarks.map((m) => normalizeText(m.text)).filter(Boolean)
        ));
        if (!words.length) return toast.error('閻犲洤鍢查崢娑㈠冀閸ヮ亶鍞堕柣銏㈠枙閻?);
        setIsMarkingBusy(true);
        try {
            const allCards = await loadUserFlashcards();
            const existingFront = new Set(
                allCards.map((c) => normalizeText(String(c.front || '').split('\n')[0]).toLowerCase()).filter(Boolean)
            );
            const folders = await getFolders();
            const now = new Date();
            const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const todayFolderName = `闂傚啫鎳撻浼存偨閻旇崵妲?${dateKey}`;
            let targetFolder = folders.find((f) => normalizeText(f.name) === normalizeText(todayFolderName));
            if (!targetFolder) {
                targetFolder = {
                    id: crypto.randomUUID(),
                    name: todayFolderName,
                    type: 'user',
                    createdAt: Date.now()
                };
                await saveFolder(targetFolder);
            }

            let added = 0;
            let skipped = 0;
            for (const word of words) {
                const key = word.toLowerCase();
                if (existingFront.has(key)) {
                    skipped += 1;
                    continue;
                }
                await addFlashcard({
                    id: crypto.randomUUID(),
                    front: word,
                    back: '閺夈儲绨敍姘舵鐠囪崵鎮婄憴锝嗙垼鐠佺櫒n瀵ら缚顔呴敍姘辩波閸氬牆甯弬鍥︾瑐娑撳鏋冩潻娑滎攽鐠佹澘绻傚鍝勫',
                    folderId: targetFolder.id,
                    tags: ['reading-mark'],
                    createdAt: Date.now(),
                    nextReview: Date.now(),
                    interval: 1,
                    repetitions: 0
                });
                existingFront.add(key);
                added += 1;
            }
            toast.success(`宸插姞鍏ラ棯鍗★??{added}锛岃烦杩囬噸澶嶏??{skipped}锛岀洰鏍囨枃浠跺す�??{todayFolderName}`);
        } catch (e) {
            toast.error(`闁告梻濮撮崣鍡涙⒒椤忓嫬骞㈠鎯扮簿鐟? ${e.message}`);
        } finally {
            setIsMarkingBusy(false);
        }
    };

    const analyzeSentenceMarks = async () => {
        if (!sentenceMarks.length) return toast.error('閻犲洤鍢查崢娑㈠冀閸ヮ亶鍞堕柣銈嗗灴濮ｏ箓鏁?);
        setIsMarkingBusy(true);
        try {
            const payload = sentenceMarks.slice(0, 10).map((m, idx) => (
                `${idx + 1}. 闁告瑣鍎遍悺娆撴晸?{m.text}\n濞戞挸锕ｇ粭鍛村棘閸ラ绐?{m.context || '闁?}`
            )).join('\n\n');
            const prompt = `娴ｇ姵妲搁梼鍛邦嚢閻炲棜袙閺佹瑧绮岄妴鍌濐嚞閻劋鑵戦弬鍥у瀻閺嬫劒浜掓稉瀣瀿闂呮儳褰為�?1) 濮ｅ繐褰炵紒娆忓毉鐠囶厽纭堕幏鍡毿掗敍鍫滃瘜�?娴犲骸褰?娣囶噣銈伴敓?2) 鐟欙綁鍣存稉杞扮秿鐎硅妲楃拠顖�?
3) 缂備焦鐟ラ崵顓㈠磻濮橀鏆柡鍐硾椤┭勬媴閺囩偞褰ラ梺顐ゅ枎閻ｇ偓鎷呭鍫㈡闁?4) 闁圭粯鍔掔欢鐢电不閳ь剟鎯岄鐔告毉闁告劖鐟﹂崹銊х礄閺勫繒妲?
璇锋寜鈥滃彞??/鍙ュ�?...鈥濆垎娈佃緭鍑猴??
${payload}`;
            const result = await sendChat([
                { role: 'system', content: '娴ｇ姵妲告稉銉︾壐娴ｅ棙绔婚弲鎵畱閼昏精顕㈤梼鍛邦嚢閺佹瑧绮岄敍宀冪翻閸戣櫣鐣濆ú浣碘偓浣虹波閺嬪嫬瀵叉稉顓熸瀮閿? },
                { role: 'user', content: prompt }
            ], settings, false);
            const content = String(result || '').trim();
            setSentenceAnalysis(content);
            if (content) {
                addChatMessage('assistant', `銆愮枒闅惧彞鍒嗘瀽銆慭n${content}`);
                if (!isChatOpen) toggleChat();
            }
            toast.success('闁汇倖鍨垮В锕傚矗閵夈儱鐎婚柡瀣姇閻ｎ剟鏁?);
        } catch (e) {
            toast.error(`闂佸憡甯掑Λ娆撴倵閼恒儱绶為弶鍫亯琚? ${e.message}`);
        } finally {
            setIsMarkingBusy(false);
        }
    };

    const jumpToMark = (mark) => {
        if (!mark) return;
        if ((mark.source || 'article') === 'question' && mark.questionKey) {
            scrollToQuestion(mark.questionKey);
            return;
        }
        if (typeof mark.start === 'number' && typeof mark.end === 'number') {
            scrollArticleToRange(mark.start, mark.end);
        }
    };

    const retryWrongQuestions = () => {
        if (!submitted) return;
        if (!wrongQuestionKeys.length) {
            toast('鐟滅増鎸告晶鐘测柦閳╁啯绠掗梺鎸庣懇椤ｄ粙宕ｉ鐐叉闁?);
            return;
        }
        setRetryWrongKeys(wrongQuestionKeys);
        setQuestionViewMode('wrong');
        setSubmitted(false);
        setScore({ total: 0, correct: 0, accuracy: 0 });
        setAnswers((prev) => {
            const next = { ...prev };
            wrongQuestionKeys.forEach((key) => {
                delete next[key];
            });
            return next;
        });
        toast.success(`鐎瑰憡褰冮崹蹇涘箲閵忕姴鐓傞梺鎸庣懇椤ｄ粙鏌屽鍥╃煀闁?{wrongQuestionKeys.length}濡増锕槐姝?;
    };

    const scrollToQuestion = (key) => {
        const node = questionRefs.current[key];
        if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const typographyClasses = typographyPreset === 'paper'
        ? {
            article: 'text-[15px] md:text-[18px] leading-8 md:leading-9 tracking-[0.01em] font-serif',
            question: 'text-[14px] md:text-[16px] leading-7 font-serif',
            option: 'text-[14px] md:text-[15px] leading-7 font-serif',
            explanation: 'text-[12px] md:text-[13px] leading-6',
            evidence: 'text-[12px] md:text-[13px] leading-6 text-indigo-200'
        }
        : {
            article: 'text-[15px] md:text-[18px] leading-8 md:leading-9',
            question: 'text-[14px] md:text-[16px] leading-7',
            option: 'text-[14px] md:text-[15px] leading-7',
            explanation: 'text-[12px] md:text-[13px] leading-6',
            evidence: 'text-[12px] md:text-[13px] leading-6 text-indigo-300'
        };
    const getStructureMeta = (type) => STRUCTURE_TYPE_META[String(type || '').toLowerCase()] || STRUCTURE_TYPE_META.other;

    const inferWrongReason = (type, questionText = '', selectedAnswer = '') => {
        if (!selectedAnswer) return '闁诲氦顫夐惌顔剧礊閸涘瓨鐓?;
        const text = String(questionText || '').toLowerCase();
        if (/閻犲洤绉崇粻鐒查悹鍥хУ閻畬meaning|vocabulary|synonym|antonym/.test(text)) return '閻犲洤绉崇粻鐔兼晸?;
        if (/闂佽浜介崝宥夊蓟閸ｇ喎鈽夐幘鍓佸笡婵☆偆鎲㈤梺鐑╂櫓閸犳艾鈻撻幉鎺楁煙椤戣法顦﹂悗鍦敐infer|imply|purpose|attitude|main idea|logic/.test(text)) return '闂備緡鍋呭Σ鎺旀椤愶附鐓?;
        if (type === 'matching') return '闁诲氦顫夐惌顔剧礊閸涘瓨鐓?;
        return '闁诲氦顫夐惌顔剧礊閸涘瓨鐓?;
    };

    const renderDebatePanel = (key) => {
        if (!debateTarget || debateTarget.key !== key) return null;
        return (
            <div className="mt-3 rounded-xl border border-orange-400/30 bg-orange-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-orange-200">閻犲洣鐒﹀畵渚€宕ｅ澶嗘敽 鐠?鐟滅増鎸告晶鐘筹紣濡吋绐?{debateTarget.key}</div>
                    <button
                        onClick={() => {
                            setDebateTarget(null);
                            setDebateMessages([]);
                            setDebateInput('');
                        }}
                        className="text-[11px] px-2 py-1 rounded border border-orange-300/30 text-orange-200 hover:bg-orange-500/10"
                    >
                        闂佺绻戞繛濠偽?
                    </button>
                </div>
                <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-2 border border-orange-400/20 rounded-lg p-2.5 bg-phy-bg">
                    {debateMessages.map((m, idx) => (
                        <div key={idx} className={`text-xs rounded-lg px-2.5 py-2 leading-6 whitespace-pre-wrap break-words ${m.role === 'assistant' ? 'bg-orange-500/10 text-orange-100 border border-orange-400/20' : 'bg-indigo-500/10 text-indigo-100 border border-indigo-400/20'}`}>
                            <span className="text-[10px] opacity-80 mr-2">{m.role === 'assistant' ? 'AI闁兼澘鍟悾? : '闁?}</span>
                            {m.content}
                        </div>
                    ))}
                </div>
                <textarea
                    rows={3}
                    value={debateInput}
                    onChange={(e) => setDebateInput(e.target.value)}
                    placeholder="鏉堟挸鍙嗘担鐘垫畱鐠侀缚鐦夐敍姘礋娴犫偓娑斿牅缍橀惃鍕摕濡楀牊娲块崥鍫㈡倞閿涘苯鑻熺紒娆忓毉鐠囦焦宓侀崣銉嫹?
                    className="w-full bg-phy-bg border border-phy-border rounded-lg p-2.5 text-xs md:text-sm text-phy-text outline-none resize-none"
                />
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setDebateInput((prev) => prev || '鎴戠殑绛旀鏄痏_锛屾垜寮曠敤鐨勮瘉鎹彞鏄細鈥淿_鈥濓??)}
                        className="px-3 py-1.5 rounded-lg text-xs border border-phy-border text-phy-muted hover:text-phy-text"
                    >
                        闂佸湱绮敮鎺楀矗閸℃瑦濯煎Δ锕佹硶濡插牊淇婇妤€澧叉繝?
                    </button>
                    <button
                        onClick={sendDebate}
                        disabled={isDebating || !debateInput.trim()}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-60 flex items-center gap-1.5"
                    >
                        {isDebating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                        闁?AI 闁告瑥绉归埞蹇涙晸?                    </button>
                </div>
            </div>
        );
    };

    const scrollArticleToRange = (start, end) => {
        const root = articleMainRef.current;
        if (!root) return;
        const nodes = Array.from(root.querySelectorAll('[data-seg-start][data-seg-end]'));
        if (!nodes.length) return;

        const hit = nodes.find((node) => {
            const s = Number(node.getAttribute('data-seg-start'));
            const e = Number(node.getAttribute('data-seg-end'));
            return s <= start && e > start;
        }) || nodes.find((node) => Number(node.getAttribute('data-seg-start')) >= start);

        if (hit) {
            hit.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setFocusedRange({ start, end, at: Date.now() });
        }
    };

    const jumpToEvidenceSentence = (sentence) => {
        const source = String(paper?.passage || '');
        const target = String(sentence || '').trim();
        if (!source || !target) return;

        let idx = source.toLowerCase().indexOf(target.toLowerCase());
        if (idx < 0) {
            const probe = target.slice(0, Math.min(24, target.length));
            idx = probe ? source.toLowerCase().indexOf(probe.toLowerCase()) : -1;
        }
        if (idx < 0) {
            toast('鏈壘鍒扮簿纭瘉鎹綅缃紝宸插畾浣嶅埌鏂囩珷椤堕??);
            articleMainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        scrollArticleToRange(idx, idx + Math.max(target.length, 16));
    };

    const getParagraphCharRange = (startParagraph = 1, endParagraph = startParagraph) => {
        if (!articleParagraphRanges.length) return null;
        const startNo = Math.max(1, Number(startParagraph) || 1);
        const endNo = Math.max(startNo, Number(endParagraph) || startNo);
        const from = articleParagraphRanges.find((item) => item.paragraph >= startNo);
        const to = [...articleParagraphRanges].reverse().find((item) => item.paragraph <= endNo);
        if (!from || !to) return null;
        return {
            start: from.start,
            end: to.end
        };
    };

    const jumpToStructureSegment = (segment) => {
        const range = getParagraphCharRange(segment?.startParagraph, segment?.endParagraph);
        if (!range) return;
        scrollArticleToRange(range.start, range.end);
    };

    const runStructureAnalysis = async (targetPaper = paper, options = {}) => {
        const targetPassage = String(targetPaper?.passage || '').trim();
        if (!targetPassage) return;
        const reqId = ++structureReqRef.current;
        setIsAnalyzingStructure(true);
        try {
            const structure = await analyzePassageStructure(targetPassage, settings);
            if (reqId !== structureReqRef.current) return;
            setPaper((prev) => {
                if (!prev) return prev;
                if (String(prev.passage || '').trim() !== targetPassage) return prev;
                return {
                    ...prev,
                    structureAnalysis: structure
                };
            });
            if (options.toastSuccess) {
                toast.success('瀹告彃鐣幋鎰瀮缁旂姷绮ㄩ弸鍕瀻閿?);
            }
        } catch (e) {
            if (options.toastError) {
                toast.error(`缂備焦鎸婚悗顖炲礆閸℃鈧姤寰勬潏顐バ? ${e.message}`);
            }
        } finally {
            if (reqId === structureReqRef.current) {
                setIsAnalyzingStructure(false);
            }
        }
    };

    const exportMarksToNote = async () => {
        if (!wordMarks.length && !sentenceMarks.length && !sentenceAnalysis) {
            toast.error('閺嗗倹妫ら崣顖氼嚤閸戣櫣娈戦弽鍥唶閸愬懎顔?);
            return;
        }
        const lines = [];
        lines.push(`# 闂傚啫鎳撻浼村冀閸ヮ亶鍞?- ${new Date().toLocaleDateString()}`);
        lines.push(`- 閺傚洨鐝烽敓?{paper?.title || '閺堫亜鎳￠敓?}`);
        lines.push(`- 閻㈢喕鐦濋弫甯??{wordMarks.length}`);
        lines.push(`- 閻ゆ垿姣﹂崣銉︽殶閿?{sentenceMarks.length}`);
        if (wordMarks.length) {
            lines.push('\n## 闁汇垻鍠曢惁婵嬪冀閸ヮ亶鍞?);
            wordMarks.forEach((m, idx) => lines.push(`${idx + 1}. ${m.text}${m.context ? `\n   - 娑撳﹣绗呴弬鍥风??{m.context}` : ''}`));
        }
        if (sentenceMarks.length) {
            lines.push('\n## 閻ゆ垿姣﹂崣銉︾垼閿?);
            sentenceMarks.forEach((m, idx) => lines.push(`${idx + 1}. ${m.text}${m.context ? `\n   - 娑撳﹣绗呴弬鍥风??{m.context}` : ''}`));
        }
        if (sentenceAnalysis) {
            lines.push('\n## AI 閻ゆ垿姣﹂崣銉ュ瀻閿?);
            lines.push(sentenceAnalysis);
        }
        await saveNote({
            id: crypto.randomUUID(),
            title: `闂傚啫鎳撻浼村冀閸ヮ亶鍞?- ${new Date().toLocaleDateString()}`,
            content: lines.join('\n'),
            updatedAt: Date.now()
        });
        toast.success('閺嶅洩顔囧鎻掝嚤閸戝搫鍩岀粭鏃囶唶');
    };

    const saveResultToNotes = async () => {
        if (!paper) return;
        const lines = [];
        lines.push(`# 闂冨懓顕伴悶鍡毿掔€佃濮夌拋顓犵矊�?{paper.title || '閺堫亜鎳￠敓?}`);
        lines.push(`- 閺冨爼妫块敓?{new Date().toLocaleString()}`);
        lines.push(`- 婵☆垪鈧磭纭€闁?{setup.mode}`);
        if (submitted) lines.push(`- 閹存劗鍝楅敓?{score.correct}/${score.total}�?{score.accuracy}%閿涘ˇ);
        lines.push('\n## 闂佸憡顭囬崰鎰板几?);
        lines.push(paper.passage || '');

        if (paper.questions?.length) {
            lines.push('\n## 闂傚啫鎳撻浼存焻婢跺顏ラ柨?);
            paper.questions.forEach((q, idx) => {
                const key = `mcq-${q.id}`;
                lines.push(`\n### Q${idx + 1}. ${q.question}`);
                q.options?.forEach((opt, optIdx) => lines.push(`- ${formatOption(optIdx, opt)}`));
                lines.push(`- 闁瑰瓨鍨瑰▓鎴犵驳閺冣偓椤㈠秹鏁?{answers[key] || '闁哄牜浜欑紞鏃堟晸?}`);
                lines.push(`- 婵繐绲块垾妯肩驳閺冣偓椤㈠秹鏁?{q.answer}`);
                if (q.explanation) lines.push(`- 閻熸瑱绲鹃悗浠嬫晸?{q.explanation}`);
                if (q.evidence_sentence) lines.push(`- 閻犲洣鐒﹀畵渚€宕ｉ妷顖滅獥${q.evidence_sentence}`);
            });
        }

        if (paper.matching?.statements?.length) {
            lines.push('\n## 濠电偛鐗呯徊濠氬箚閵堝绀岀憸鐗堝笒鐢?);
            paper.matching.statements.forEach((s, idx) => {
                const key = `match-${s.id}`;
                lines.push(`\n### M${idx + 1}. ${s.text}`);
                lines.push(`- 闁瑰瓨鍨瑰▓鎴犵驳閺冣偓椤㈠秹鏁?{answers[key] || '闁哄牜浜欑紞鏃堟晸?}`);
                lines.push(`- 婵繐绲块垾妯肩驳閺冣偓椤㈠秹鏁?{s.answer}`);
                if (s.explanation) lines.push(`- 閻熸瑱绲鹃悗浠嬫晸?{s.explanation}`);
                if (s.evidence_sentence) lines.push(`- 閻犲洣鐒﹀畵渚€宕ｉ妷顖滅獥${s.evidence_sentence}`);
            });
        }

        if (debateMessages.length) {
            lines.push('\n## 閻犲洣鐒﹀畵渚€宕ｅ澶嗘敽閻犱焦婢樼紞?);
            debateMessages.forEach((m) => {
                lines.push(`- ${m.role === 'assistant' ? 'AI鑰冨�? : '??}??{m.content}`);
            });
        }
        if (wordMarks.length) {
            lines.push('\n## 闁汇垻鍠曢惁婵嬪冀閸ヮ亶鍞?);
            wordMarks.forEach((m, idx) => {
                lines.push(`- ${idx + 1}. ${m.text}${m.context ? `閿涘牅绗傛稉瀣瀮閿?{m.context}閿涘ˇ : ''}`);
            });
        }
        if (sentenceMarks.length) {
            lines.push('\n## 閻ゆ垿姣﹂崣銉︾垼閿?);
            sentenceMarks.forEach((m, idx) => {
                lines.push(`- ${idx + 1}. ${m.text}${m.context ? `閿涘牅绗傛稉瀣瀮閿?{m.context}閿涘ˇ : ''}`);
            });
        }
        if (sentenceAnalysis) {
            lines.push('\n## 閻ゆ垿姣﹂崣顧嘔閸掑棙鐎?);
            lines.push(sentenceAnalysis);
        }

        await saveNote({
            id: crypto.randomUUID(),
            title: `闂冨懓顕扮€佃濮夌拋顓犵矊 - ${new Date().toLocaleDateString()}`,
            content: lines.join('\n'),
            updatedAt: Date.now()
        });
        toast.success('鐎规瓕寮撶换姘扁偓娑櫭崺宀€绮弮鍥跺敹闁?);
    };

    const HistoryModal = showHistory ? (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm p-3 md:p-6">
            <div className="h-full max-w-6xl mx-auto bg-phy-glassHeavy border border-phy-border rounded-2xl overflow-hidden flex flex-col">
                <div className="shrink-0 px-4 py-3 border-b border-phy-border flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-sm md:text-base font-black text-phy-text flex items-center gap-2">
                            <History size={16} className="text-indigo-300" />
                            闂傚啫鎳撻鐗堬紣濡搫鍧婇柛娆愬絻濞叉牠鏁?                        </h3>
                        <p className="text-xs text-phy-muted mt-0.5">閻犱焦婢樼紞宥呅掕箛鏃戝仹濞存嚎鍊曞畵搴ㄥ箣閹邦喖鎽嬮柕鍡曠窔閺佸﹥锛愬Ο鍦憿閻犲洣鐒﹀畵浣烘喆閿濆棛鈧?/p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={clearAllHistory}
                            className="px-2.5 py-1.5 rounded-lg text-xs border border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                        >
                            濠电偞鎸搁幊鎰板煘閺嶎厼鍌ㄩ柛鈩冾殔閽?
                        </button>
                        <button
                            onClick={() => setShowHistory(false)}
                            className="p-1.5 rounded-lg border border-phy-border text-phy-muted hover:text-phy-text"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="border-b md:border-b-0 md:border-r border-phy-border overflow-y-auto custom-scrollbar p-2">
                        {examHistory.length === 0 ? (
                            <div className="text-xs text-phy-muted p-3">閺嗗倹妫ら崢鍡楀蕉鐠佹澘缍嶉妴鍌氬帥鐎瑰本鍨氭稉鈧▎鈥叉唉閸楀嘲鎮楁导姘冲殰閸斻劏顔囪ぐ鏇嫹?/div>
                        ) : examHistory.map((r) => (
                            <button
                                key={r.id}
                                onClick={() => setHistoryId(r.id)}
                                className={`w-full text-left rounded-xl border p-3 mb-2 transition ${selectedHistory?.id === r.id ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-phy-border bg-phy-glass hover:bg-phy-bg'}`}
                            >
                                <div className="text-xs text-phy-muted">{new Date(r.createdAt).toLocaleString()}</div>
                                <div className="text-sm font-bold text-phy-text line-clamp-2 mt-0.5">{r.title}</div>
                                <div className="text-xs mt-1 text-phy-muted">
                                    {(r.result?.correct ?? 0)}/{(r.result?.total ?? 0)} 閻?{(r.result?.accuracy ?? 0)}% 閻?{r.mode}
                                </div>
                            </button>
                        ))}
                    </aside>

                    <section className="overflow-y-auto custom-scrollbar p-4">
                        {!selectedHistory ? (
                            <div className="text-sm text-phy-muted">閻犲洨鍏橀埀顒€顦扮€氥劍绋夐埀顒勫级閳ュ啿鍧婇柛娆掑蔼椤斿洩銇愰弴顏呭?/div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-phy-border bg-phy-glass p-4">
                                    <div className="text-xs text-phy-muted">{new Date(selectedHistory.createdAt).toLocaleString()}</div>
                                    <h4 className="text-base font-black text-phy-text mt-1">{selectedHistory.title}</h4>
                                    <div className="text-sm text-phy-muted mt-1">
                                        鐎电増顨呴崹?{selectedHistory.result.correct}/{selectedHistory.result.total}闁挎稑婢杝electedHistory.result.accuracy}%闁?鐠?婵☆垪鈧磭纭€ {selectedHistory.mode}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            onClick={() => restoreFromHistory(selectedHistory, false)}
                                            disabled={!canRestoreSelectedHistory}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-400/40 text-indigo-100 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-50"
                                        >
                                            閸ョ偟婀呴崢鐔峰??
                                        </button>
                                        <button
                                            onClick={() => restoreFromHistory(selectedHistory, true)}
                                            disabled={!canRestoreSelectedHistory}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-400/40 text-emerald-100 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50"
                                        >
                                            闂佹彃绉甸弻濠勭磼閸愌呯槑閺夆晜鐟ラ〃婊堟晸?                                        </button>
                                    </div>
                                    {!canRestoreSelectedHistory ? (
                                        <div className="mt-2 text-[11px] text-amber-300">閻犲洢鍎插顖涚▔閻戞ɑ锛嬮柣妤€鐗嗗濠氬矗鐠囇呯濞寸姴鎳忛弫顕€骞愭笟鈧弫濠冿紣濡儤绀€濡炪倖鎷濈槐婵嬪籍閻樺磭銆婇柟顓滃灩椤﹁尙鈧懓鏈弳锝嗭紣濡搫绁归柨?/div>
                                    ) : null}
                                    {selectedHistory.passagePreview ? (
                                        <details className="mt-3">
                                            <summary className="cursor-pointer text-xs font-bold text-phy-muted">閺屻儳婀呴崢鐔告瀮閻楀洦顔?/summary>
                                            <p className="mt-2 text-xs text-phy-text whitespace-pre-wrap break-words leading-6">{selectedHistory.passagePreview}</p>
                                        </details>
                                    ) : null}
                                </div>

                                <div className="rounded-xl border border-phy-border bg-phy-glass p-4">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-sm font-bold text-phy-text">闂佹寧鐟╅。浠嬪炊閻愭亽鈧?/h5>
                                        <span className="text-xs text-phy-muted">
                                            闂備焦瀵ч悷鈺呫€?{(selectedHistoryRows.filter((x) => !x.isCorrect).length)} / 闂佽鍓欓…鐑姐€?{selectedHistoryRows.length}
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {selectedHistoryRows.length === 0 ? (
                                            <div className="text-xs text-phy-muted">璇ヨ褰曟棤棰樼洰鏁版嵁??/div>
                                        ) : selectedHistoryRows.filter((x) => !x.isCorrect).length === 0 ? (
                                            <div className="text-xs text-emerald-300">閺夆晜鐟﹂濂稿礂閵娿儺鍤犻柨娑樼焷閵嗗啴鎮抽弶璺ㄥ彂濠靛倹鏋婚幏?/div>
                                        ) : selectedHistoryRows.filter((x) => !x.isCorrect).map((row) => (
                                            <div key={row.id} className="rounded-lg border border-phy-border bg-phy-bg p-3">
                                                <div className="text-xs text-phy-muted uppercase">{row.type}</div>
                                                <div className="text-sm text-phy-text mt-1">{row.question}</div>
                                                <div className="text-xs mt-1 text-rose-300">娴ｇ姷娈戠粵鏃€顢嶉敍姝縭ow.userAnswer}</div>
                                                <div className="text-xs text-emerald-300">濮濓絿鈥樼粵鏃€顢嶉敍姝縭ow.correctAnswer}</div>
                                                {row.explanation ? <div className="text-xs text-phy-muted mt-1">閻熸瑱绲鹃悗浠嬫晬濮濈腑ow.explanation}</div> : null}
                                                {row.evidence ? <div className="text-xs text-indigo-300 mt-1">閻犲洣鐒﹀畵渚€宕ｉ妷顖滅獥{row.evidence}</div> : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        onClick={() => selectedHistory && removeHistoryItem(selectedHistory.id)}
                                        className="px-3 py-1.5 rounded-lg text-xs border border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                                    >
                                        閸掔娀娅庨張顒佹蒋鐠佹澘缍?
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    ) : null;

    const MarksDrawer = showMarksDrawer ? (
        <div className="fixed inset-0 z-[95] bg-black/55 backdrop-blur-sm" onClick={() => setShowMarksDrawer(false)}>
            <aside
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-0 h-full w-full sm:max-w-[420px] bg-phy-glassHeavy border-l border-phy-border flex flex-col"
            >
                <div className="shrink-0 px-4 py-3 border-b border-phy-border flex items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-black text-phy-text">闂傚啫鎳撻浼村冀閸ヮ亶鍞堕柟鎯版閻?/h3>
                        <div className="text-[11px] text-phy-muted mt-0.5">
                            闁汇垻鍠曢惁?{wordMarks.length} 鐠?闁汇倖鍨垮В锕傛晸?{sentenceMarks.length}
                        </div>
                    </div>
                    <button
                        onClick={() => setShowMarksDrawer(false)}
                        className="p-1.5 rounded-lg border border-phy-border text-phy-muted hover:text-phy-text"
                    >
                        <X size={15} />
                    </button>
                </div>

                <div className="shrink-0 px-4 py-3 border-b border-phy-border space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={pushWordMarksToFlashcards}
                            disabled={isMarkingBusy || wordMarks.length === 0}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-400/35 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50"
                        >
                            闂佹眹鍨婚崰鏇㈡儊濠靛绠ョ憸鐗堝笒濞呫倝鏌涜箛瀣姦婵☆偒鍨跺畷?                        </button>
                        <button
                            onClick={analyzeSentenceMarks}
                            disabled={isMarkingBusy || sentenceMarks.length === 0}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-orange-400/35 text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50"
                        >
                            閻ゆ垿姣﹂崣銉﹀閿?AI 閸掑棙鐎?
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={exportMarksToNote}
                            disabled={!wordMarks.length && !sentenceMarks.length && !sentenceAnalysis}
                            className="px-2.5 py-1.5 rounded-lg text-xs border border-phy-border text-phy-text hover:bg-phy-bg disabled:opacity-50"
                        >
                            閻庣數鍘ч崵顓㈠冀閸ヮ亶鍞堕柛鎺撳閻燁亪鏁?                        </button>
                        <button
                            onClick={clearAllMarks}
                            disabled={!wordMarks.length && !sentenceMarks.length && !sentenceAnalysis}
                            className="px-2.5 py-1.5 rounded-lg text-xs border border-rose-400/35 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                            婵炴挸鎳愰埞鏍礂閵娾晛鍔ラ柡宥呮穿椤?
                        </button>
                        <div className="ml-auto flex items-center rounded-lg border border-phy-border overflow-hidden">
                            <button
                                onClick={() => setMarkSortMode('time')}
                                className={`px-2 py-1 text-[11px] ${markSortMode === 'time' ? 'bg-indigo-600 text-white' : 'text-phy-muted hover:text-phy-text hover:bg-phy-bg'}`}
                            >
                                闂佸湱顭堥ˇ鏉款渻閸岀偞鈷?                            </button>
                            <button
                                onClick={() => setMarkSortMode('position')}
                                className={`px-2 py-1 text-[11px] border-l border-phy-border ${markSortMode === 'position' ? 'bg-indigo-600 text-white' : 'text-phy-muted hover:text-phy-text hover:bg-phy-bg'}`}
                            >
                                闂佸湱顭堥ˇ顔剧礊閸涱垳纾?                            </button>
                            <button
                                onClick={() => runStructureAnalysis(paper, { toastSuccess: true, toastError: true })}
                                disabled={!paper?.passage?.trim() || isAnalyzingStructure}
                                className="px-2 py-1 rounded border border-phy-border text-[11px] text-phy-muted hover:text-phy-text inline-flex items-center gap-1 disabled:opacity-50"
                            >
                                {isAnalyzingStructure ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                闂佸憡甯掑Λ妤€顭?
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-2">
                    {allMarks.length === 0 ? (
                        <div className="rounded-xl border border-phy-border bg-phy-glass p-3 text-xs text-phy-muted">
                            閺嗗倹妫ら弽鍥唶閵嗗倸褰查崷銊ヤ箯娓氀冨斧閺傚洦鍨ㄩ崣鍏呮櫠妫版ê鍏?闁銆嶆稉顓⑩偓澶夎厬閺傚洦婀伴崥搴ょ箻鐞涘本鐖ｇ拋鑸偓?
                        </div>
                    ) : allMarks.map((mark, idx) => (
                        <div key={mark.id} className="rounded-xl border border-phy-border bg-phy-glass p-2.5">
                            <div className="flex items-start gap-2">
                                <button
                                    onClick={() => jumpToMark(mark)}
                                    className="flex-1 text-left"
                                >
                                    <div className="text-[11px] text-phy-muted">
                                        {mark.markType === 'word' ? '闁汇垻鍠曢惁婵囶殗濡懓鐦? : '闁汇倖鍨垮В锕傚矗閵夈倗鐟撻柛鎺撳笧閸?} 鐠?#{idx + 1}
                                        {` 鐠?${(mark.source || 'article') === 'question'
                                            ? (mark.questionLabel ? `濡増顭囧ú浼村礌?${mark.questionLabel}` : '濡増顭囧ú浼村礌?)
                                            : '鍘熸枃鍖?}`}
                                    </div>
                                    <div className="text-xs text-phy-text mt-0.5 break-words line-clamp-2">{mark.text}</div>
                                    {mark.context ? (
                                        <div className="text-[11px] text-phy-muted mt-1 line-clamp-2">{mark.context}</div>
                                    ) : null}
                                </button>
                                <button
                                    onClick={() => (mark.markType === 'word' ? removeWordMark(mark.id) : removeSentenceMark(mark.id))}
                                    className="p-1 rounded border border-phy-border text-phy-muted hover:text-rose-300"
                                    title="闂佸憡甯炴繛鈧繛?
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {sentenceAnalysis ? (
                        <div className="rounded-xl border border-orange-400/35 bg-orange-500/10 p-3">
                            <div className="text-xs font-bold text-orange-200 mb-1.5">AI 閻ゆ垿姣﹂崣銉ュ瀻閿?/div>
                            <div className="text-xs text-phy-text whitespace-pre-wrap break-words leading-6">{sentenceAnalysis}</div>
                        </div>
                    ) : null}
                </div>
            </aside>
        </div>
    ) : null;

    if (!paper) {
        return (
            <div className="h-full overflow-y-auto p-4 md:p-8">
                {HistoryModal}
                <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
                    <div className="rounded-2xl border border-phy-border bg-phy-glass p-5 md:p-6">
                        <h2 className="text-xl md:text-2xl font-black text-phy-text flex items-center gap-2">
                            <ShieldAlert className="text-orange-400" size={24} />
                            閼板啳鐦Ο鈩冨珯 �?闂冨懓顕伴悶鍡毿掔€佃濮夊Ο鈥崇础
                        </h2>
                        <p className="text-sm text-phy-muted mt-2 leading-relaxed">
                            AI 涓嶅彧鍑洪锛岃繕浼氬弽椹充綘鐨勭瓟妗堬紝閫间綘鐢ㄥ師鏂囪瘉鎹瘉鏄庛€傛敮鎸佸鍏ユ枃绔犺嚜鍔ㄥ嚭棰橈紝涔熸敮鎸佸鍏ョ幇鎴愰鐩紙闃呰閫夋�??鍥涘叚绾ф钀藉尮閰嶏級�??                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => setCanvasMode('classic')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 ${canvasMode === 'classic' ? 'bg-indigo-600 text-white border-indigo-500' : 'border-phy-border text-phy-text hover:bg-phy-bg'}`}
                            >
                                <Minimize2 size={13} />
                                闂佸憡顭囬崰鎾存櫠濡ゅ啯鏆滈柛鎰╁妿濠€?
                            </button>
                            <button
                                onClick={() => setCanvasMode('expanded')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 ${canvasMode === 'expanded' ? 'bg-indigo-600 text-white border-indigo-500' : 'border-phy-border text-phy-text hover:bg-phy-bg'}`}
                            >
                                <Maximize2 size={13} />
                                婵犻潧顦介崑鍕储閺嶎厼绠璺侯焾娴滐綁鏌?                            </button>
                            <button
                                onClick={() => setShowHistory(true)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-phy-border text-phy-text hover:bg-phy-bg inline-flex items-center gap-1.5"
                            >
                                <History size={14} />
                                鍘嗗彶鍥為【锛坽examHistory.length}??                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-phy-border bg-phy-glass p-4 md:p-6">
                        <div className="flex flex-wrap gap-2 mb-4">
                            <button
                                onClick={() => setSetup((prev) => ({ ...prev, sourceType: 'article' }))}
                                className={`px-4 py-2 rounded-lg text-sm font-bold ${setup.sourceType === 'article' ? 'bg-indigo-600 text-white' : 'bg-phy-glass border border-phy-border text-phy-muted'}`}
                            >
                                闂佸搫鍊稿ú銊╂偟閻戣姤鍤婃い蹇撳琚熼梺鍛婂灦濡炰粙銆?
                            </button>
                            <button
                                onClick={() => setSetup((prev) => ({ ...prev, sourceType: 'import' }))}
                                className={`px-4 py-2 rounded-lg text-sm font-bold ${setup.sourceType === 'import' ? 'bg-indigo-600 text-white' : 'bg-phy-glass border border-phy-border text-phy-muted'}`}
                            >
                                閻庣數鍘ч崣鍡涙嚊椤忓嫮鏆板☉鏂款樀椤ｄ粙鎯?                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <select
                                value={setup.mode}
                                onChange={(e) => {
                                    const nextMode = e.target.value;
                                    setSetup((prev) => ({
                                        ...prev,
                                        mode: nextMode,
                                        questionCount: isStrictCETMode(nextMode) ? 10 : prev.questionCount
                                    }));
                                }}
                                className="bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text outline-none"
                            >
                                {MODE_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                            </select>
                            <input
                                type="number"
                                min="3"
                                max="10"
                                value={strictSetupMode ? 10 : setup.questionCount}
                                onChange={(e) => setSetup((prev) => ({ ...prev, questionCount: Math.max(3, Math.min(10, Number(e.target.value) || 6)) }))}
                                disabled={strictSetupMode}
                                className="bg-phy-bg border border-phy-border rounded-xl px-3 py-2 text-sm text-phy-text outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                                placeholder="濡増顭囧ú浼村极?
                            />
                        </div>
                        {strictSetupMode ? (
                            <div className="mt-2 text-xs text-amber-300">濞戞挶鍎查悧绋课熼垾宕囩闁搞儱鎼悾楣冩晸?CET Section B闁?0 濡増蓱椤斿矂鎷冮挊澶婄埍闂佹澘绋勭槐婵囷紣濡搫濞?36-45闁挎稑鏈宀勬媰閼恒儳鍨奸柨?A-L闁?/div>
                        ) : null}

                        <div className="mt-4">
                            <label className="text-sm font-bold text-phy-text">闂佸搫鍊稿ú銊╂偟閻戣棄鍌ㄩ柣鏂挎啞閻?/label>
                            <textarea
                                value={setup.passage}
                                onChange={(e) => setSetup((prev) => ({ ...prev, passage: e.target.value }))}
                                onPaste={async (e) => {
                                    const items = Array.from(e.clipboardData?.items || []);
                                    const images = items.filter((it) => it.type?.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
                                    if (images.length) {
                                        e.preventDefault();
                                        await parseImagesToField(images, 'passage');
                                    }
                                }}
                                rows={10}
                                placeholder="绮樿创闃呰鏂囩珷鍘熸枃锛堝彲涓哄洓鍏骇鐪熼娈佃惤�??
                                className="w-full mt-2 bg-phy-bg border border-phy-border rounded-xl p-3 text-sm text-phy-text resize-y outline-none"
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-phy-muted">
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <Upload size={14} />
                                    婵炴垶鎸搁敃锝囨?PDF/TXT 闂佸憡甯楀妯兼暜椤愶箑妫?                                    <input type="file" accept=".pdf,.txt" className="hidden" onChange={handleUploadPassage} />
                                </label>
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <Upload size={14} />
                                    濞戞挸锕ｇ槐鍫曞炊閸撗冾暬閻犲洤妫楅崺鍡涘礆閺夊灝鏂ч柨?                                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                                        await parseImagesToField(e.target.files, 'passage');
                                        e.target.value = '';
                                    }} />
                                </label>
                                <span className="opacity-70">闁衡偓椤栨稑鐦柣鈺佺摠鐢鍒掑Ο鍨灡闁规惌浜滃ù?/span>
                            </div>
                        </div>

                        {setup.sourceType === 'import' && (
                            <div className="mt-4">
                                <label className="text-sm font-bold text-phy-text">鑷畾涔夐鐩紙鏀寔绮樿创鍘熷璇曢鏂囨湰??/label>
                                <textarea
                                    value={setup.questionText}
                                    onChange={(e) => setSetup((prev) => ({ ...prev, questionText: e.target.value }))}
                                    onPaste={async (e) => {
                                        const items = Array.from(e.clipboardData?.items || []);
                                        const images = items.filter((it) => it.type?.startsWith('image/')).map((it) => it.getAsFile()).filter(Boolean);
                                        if (images.length) {
                                            e.preventDefault();
                                            await parseImagesToField(images, 'questionText');
                                        }
                                    }}
                                    rows={10}
                                    placeholder="绮樿创浣犵殑棰樼洰鍐呭锛氬彲涓洪槄璇婚€夋嫨棰樸€佹钀藉尮閰嶉锛屾垨涓よ€呮贩鍚堬�??
                                    className="w-full mt-2 bg-phy-bg border border-phy-border rounded-xl p-3 text-sm text-phy-text resize-y outline-none"
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-phy-muted">
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                        <Upload size={14} />
                                        濞戞挸锕ｇ槐鑸碉紣濡吋绐楅柡鍌氭矗濞嗐垽宕氭导鎼毌閹煎瓨鎹佺欢顓㈠礂閵夛富鏀?
                                        <input type="file" accept=".pdf,.txt,.md,.json" className="hidden" onChange={handleUploadQuestions} />
                                    </label>
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                        <Upload size={14} />
                                        涓婁紶鍥剧墖璇嗗埆鍒伴鐩??
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                                            await parseImagesToField(e.target.files, 'questionText');
                                            e.target.value = '';
                                        }} />
                                    </label>
                                    <span className="opacity-70">闁衡偓椤栨稑鐦柣鈺佺摠鐢鍒掑Ο鍨灡闁规惌浜滃ù?/span>
                                </div>
                                <details className="mt-3 text-xs text-phy-muted bg-phy-glass rounded-lg border border-phy-border p-3">
                                    <summary className="cursor-pointer font-semibold">闁告瑯鍨堕埀顒€顧€缁变即骞掗妸銊ョ閻庣數鍘ч崣鍡涘冀閻撳海纭€缂佲偓鏉炴壆浼?/summary>
                                    <pre className="mt-2 whitespace-pre-wrap break-all text-[11px]">{`[Reading]\nQ1. ...\nA. ...\nB. ...\nC. ...\nD. ...\n\n[Matching]\nA. paragraph text...\nB. paragraph text...\n...\nStatement 1: ...\nStatement 2: ...`}</pre>
                                </details>
                            </div>
                        )}

                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || isLoadingFile || isParsingImages}
                            className="mt-5 w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            {(isGenerating || isLoadingFile || isParsingImages) ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            {(isGenerating || isLoadingFile || isParsingImages) ? '濠㈣泛瀚幃濠囨晸?..' : '鐎殿喒鍋撳┑顔碱儑閺佹捇骞嬮幇顒夊殸闁硅埖顨夐鍕磼閸愩劌绁?}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {HistoryModal}
            {MarksDrawer}
            <div className="shrink-0 border-b border-phy-border bg-phy-glass px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs text-phy-muted uppercase tracking-wide">Exam Arena</div>
                    <h2 className="font-black text-phy-text truncate">{paper.title || '闂冨懓顕扮€佃濮夌拋顓犵矊'}</h2>
                    <div className="text-xs text-phy-muted mt-1">
                        鐎规瓕寮撶紞鏃堟晸?{answeredCount}/{totalCount} {submitted ? `鐠?婵繐绲块垾姗€鏁?${score.accuracy}%` : ''}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="hidden md:flex items-center rounded-lg border border-phy-border bg-phy-bg overflow-hidden mr-1">
                        <button
                            onClick={() => setCanvasMode('classic')}
                            className={`px-2.5 py-2 text-[11px] font-bold border-r border-phy-border flex items-center gap-1.5 ${canvasMode === 'classic' ? 'bg-indigo-600 text-white' : 'text-phy-muted hover:text-phy-text hover:bg-phy-glass'}`}
                            title="闂佸憡顭囬崰鎾存櫠濡ゅ啯鏆滈柛鎰╁妿濠€?
                        >
                            <Minimize2 size={12} />
                            闂佸憡顭囬崰鎾存櫠?
                        </button>
                        <button
                            onClick={() => setCanvasMode('expanded')}
                            className={`px-2.5 py-2 text-[11px] font-bold flex items-center gap-1.5 ${canvasMode === 'expanded' ? 'bg-indigo-600 text-white' : 'text-phy-muted hover:text-phy-text hover:bg-phy-glass'}`}
                            title="婵犻潧顦介崑鍕储閺嶎厼绠璺侯焾娴滐綁鏌?
                        >
                            <Maximize2 size={12} />
                            闂佺懓鍢查ˇ顖炲Φ?
                        </button>
                    </div>
                    <button
                        onClick={() => setTypographyPreset((prev) => (prev === 'readable' ? 'paper' : 'readable'))}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold border border-phy-border text-phy-text hover:bg-phy-bg"
                    >
                        闁圭儤甯炴晶妤呮晬濮濈腐ypographyPreset === 'readable' ? '闁兼澘鍟抽惁顖炲矗椤栨繍鍤? : '缂佹儳鎲￠崝?}
                    </button>
                    <button
                        onClick={() => setShowMarksDrawer(true)}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold border border-phy-border text-phy-text hover:bg-phy-bg flex items-center gap-1.5"
                    >
                        <BookMarked size={14} />
                        闁哄秴娲╅鍥箮閽樺婧?
                    </button>
                    <button
                        onClick={() => setShowHistory(true)}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold border border-phy-border text-phy-text hover:bg-phy-bg flex items-center gap-1.5"
                    >
                        <History size={14} />
                        鍘嗗彶鍥為【锛坽examHistory.length}??                    </button>
                    <button
                        onClick={saveResultToNotes}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold border border-phy-border text-phy-text hover:bg-phy-bg flex items-center gap-1.5"
                    >
                        <Save size={14} />
                        婵烇絽娲︾换鍌炴偤閵娾晛绀嗛柟娈垮枤閹冲鎮?                    </button>
                    <button
                        onClick={clearSession}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold bg-phy-glass border border-phy-border text-phy-muted hover:text-phy-text flex items-center gap-1.5"
                    >
                        <RotateCcw size={14} />
                        闂備焦褰冪粔鐢稿蓟婵犲嫭濯兼い鎾跺Х閻?
                    </button>
                    <button
                        onClick={submitPaper}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-black bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5"
                    >
                        <Target size={14} />
                        闂佸湱绮崝鎺戭潩閿曞倻宓侀柟顖涘濡叉垿鏌?                    </button>
                </div>
            </div>

            {isMobileViewport ? (
                <div className="shrink-0 px-3 pt-2">
                    <div className="text-[11px] text-phy-muted text-center">
                        鎵嬫満涓婁笅鍒嗗睆妯″紡锛氭嫋鍔ㄤ腑闂村垎闅旀潯鍙皟鏁村師鏂囦笌棰樼洰鍖哄煙楂樺??
                    </div>
                </div>
            ) : null}

            <div ref={examLayoutRef} className="flex-1 min-h-0 p-3 md:p-5">
                <div
                    className="grid h-full min-h-0 gap-3"
                    style={isMobileViewport
                        ? { gridTemplateRows: `minmax(0, ${mobileSplitRatio}%) 8px minmax(0, ${100 - mobileSplitRatio}%)` }
                        : { gridTemplateColumns: `minmax(0, ${desktopSplitRatio}%) 8px minmax(0, ${100 - desktopSplitRatio}%)` }}
                >
                    <section className="rounded-2xl border border-phy-border bg-phy-glass overflow-hidden min-h-0 flex flex-col">
                        <div className="px-4 py-3 border-b border-phy-border bg-phy-bg flex items-center gap-2">
                            <FileText size={16} className="text-indigo-400" />
                            <h3 className="font-bold text-phy-text text-sm flex-1">闁告鍠愰弸鍐╃▔鎼淬埄鍞介柦鈧?/h3>
                            <button
                                onClick={() => setShowMarksDrawer(true)}
                                className="px-2 py-1 rounded border border-phy-border text-[11px] text-phy-muted hover:text-phy-text inline-flex items-center gap-1"
                            >
                                <BookMarked size={12} />
                                閺嶅洩顔?
                            </button>
                        </div>
                        <div className="p-4 space-y-3 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                            <div className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="text-xs text-phy-text inline-flex items-center gap-1.5">
                                        <BookMarked size={14} className="text-amber-300" />
                                        閫変腑鏂囨湰鍚庡彲蹇€熸爣璁帮紝璇︾粏绠＄悊鍦ㄥ彸渚ф娊??                                    </div>
                                    <button
                                        onClick={() => setShowMarksDrawer(true)}
                                        className="px-2 py-1 rounded border border-phy-border text-[11px] text-phy-muted hover:text-phy-text"
                                    >
                                        閹垫挸绱戦幎钘夌??
                                    </button>
                                </div>
                            </div>
                            {paper?.passage?.trim() ? (
                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-xs font-bold text-phy-text inline-flex items-center gap-1.5">
                                            <Sparkles size={13} className="text-indigo-300" />
                                            閺傚洨鐝风紒鎾寸€崚鍡楀�?
                                        </div>
                                        <button
                                            onClick={() => runStructureAnalysis(paper, { toastSuccess: true, toastError: true })}
                                            disabled={isAnalyzingStructure}
                                            className="px-2 py-1 rounded border border-phy-border text-[11px] text-phy-muted hover:text-phy-text disabled:opacity-50 inline-flex items-center gap-1"
                                        >
                                            {isAnalyzingStructure ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                            闂佹彃绉堕悾?
                                        </button>
                                    </div>
                                    {structureOverview ? (
                                        <div className="mt-2 text-[11px] text-phy-muted leading-5">
                                            {structureOverview}
                                        </div>
                                    ) : null}
                                    {structureSegments.length ? (
                                        <div className="mt-2 space-y-1.5">
                                            {structureSegments.map((segment, idx) => {
                                                const meta = getStructureMeta(segment?.type);
                                                const startP = Math.max(1, Number(segment?.startParagraph || 1) || 1);
                                                const endP = Math.max(startP, Number(segment?.endParagraph || startP) || startP);
                                                return (
                                                    <button
                                                        key={segment?.id || `structure-${idx}`}
                                                        onClick={() => jumpToStructureSegment({ startParagraph: startP, endParagraph: endP })}
                                                        className="w-full text-left rounded-lg border border-phy-border bg-phy-bg px-2.5 py-2 hover:border-phy-borderHover hover:bg-phy-glass transition-colors"
                                                    >
                                                        <div className="flex items-center gap-2 text-[11px]">
                                                            <span className={`px-1.5 py-0.5 rounded border ${meta.chip}`}>{meta.label}</span>
                                                            <span className="text-phy-muted">P{startP}{endP > startP ? `-P${endP}` : ''}</span>
                                                        </div>
                                                        <div className="mt-1 text-xs text-phy-text">
                                                            {segment?.label || `${meta.label}濠电偛鐗忛妵鎭?
                                                        </div>
                                                        {segment?.summary ? (
                                                            <div className="mt-0.5 text-[11px] text-phy-muted leading-5 line-clamp-2">
                                                                {segment.summary}
                                                            </div>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => runStructureAnalysis(paper, { toastSuccess: true, toastError: true })}
                                            disabled={isAnalyzingStructure}
                                            className="mt-2 w-full px-2.5 py-2 rounded-lg border border-dashed border-indigo-400/40 text-xs text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50"
                                        >
                                            {isAnalyzingStructure ? '閸掑棙鐎介敓?..' : '閼奉亜濮╅崚鍡楁健閺傚洨鐝风紒鎾寸€?}
                                        </button>
                                    )}
                                </div>
                            ) : null}
                            {strictCETActive ? (
                                <div className="rounded-xl border border-indigo-400/35 bg-indigo-500/10 p-3">
                                    <div className="text-xs font-bold text-indigo-200 mb-1">Section B 鐠?濞戞挶鍎查悧绋课熼垾宕囩閻犲洤鐡ㄥΣ?/div>
                                    <div className="text-[11px] text-phy-text leading-6">
                                        闂傚啫鎳撻鏉库枔娴ｅ啯鍎?A-L闁挎稑鑻悾顒勬晸?36-45 濡増锕槐鍗炐掕箛娑辨毌闂侇偄顦扮€氥劎鈧數鎳撶花鎻掆枔娴ｅ啯鍎伴柨娑樻湰椤斿矂鎷冮挊澶婅闂佹彃绉撮ˇ鍙夋媴鐠恒劍鏆忛柨?                                    </div>
                                </div>
                            ) : null}

                            {paper.passage?.trim() ? (
                                <div className="rounded-xl border border-phy-border bg-phy-bg p-3">
                                    <div className="text-[11px] text-indigo-300 font-bold mb-1">闂備胶顭堢换鍫ュ礉瀹ュ鍑?/div>
                                    <div
                                        ref={articleMainRef}
                                        tabIndex={0}
                                        onMouseUp={captureSelection}
                                        onKeyUp={captureSelection}
                                        className={`${typographyClasses.article} text-phy-text whitespace-pre-wrap break-words outline-none`}
                                    >
                                        {annotatedPassageSegments.length ? annotatedPassageSegments.map((seg, idx) => (
                                            <span
                                                key={`${seg.start}-${seg.end}-${idx}`}
                                                data-seg-start={seg.start}
                                                data-seg-end={seg.end}
                                                className={[
                                                    seg.isWord ? 'bg-amber-400/25 rounded-[2px] px-[1px]' : '',
                                                    seg.isSentence ? 'underline decoration-sky-400/80 decoration-2 underline-offset-[3px]' : '',
                                                    focusedRange && seg.start < focusedRange.end && seg.end > focusedRange.start ? 'bg-indigo-400/20 ring-1 ring-indigo-400/70 rounded-[2px]' : ''
                                                ].join(' ').trim()}
                                            >
                                                {seg.text}
                                            </span>
                                        )) : paper.passage}
                                    </div>
                                </div>
                            ) : null}

                            {articleParagraphs.length > 1 ? (
                                <details className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                    <summary className="cursor-pointer text-xs font-bold text-phy-muted">灞曞紑鍒嗘闃呰??/summary>
                                    <div className="mt-3 space-y-2">
                                        {articleParagraphs.map((text, idx) => (
                                            <div key={`article-${idx}`} className="rounded-lg border border-phy-border bg-phy-bg p-2.5">
                                                <div className="text-[11px] text-indigo-300 font-bold mb-1">濠殿喗绻愮徊楣冨几閸愩劉鏋?{idx + 1}</div>
                                                <p className={`${typographyClasses.article} text-phy-text whitespace-pre-wrap break-words`}>{text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}

                            {paper.matching?.paragraphs?.length ? (
                                <details className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                    <summary className="cursor-pointer text-xs font-bold text-phy-muted">灞曞紑娈佃惤鍖归厤鏍囩锛�??B/C...??/summary>
                                    <div className="mt-3 space-y-2">
                                        {paper.matching.paragraphs.map((p, idx) => (
                                            <div key={`match-${idx}`} className="rounded-lg border border-phy-border bg-phy-bg p-2.5">
                                                <div className="text-[11px] text-indigo-300 font-bold mb-1">濠电偛鐗呯徊濠氬箚?{p.label}</div>
                                                <p className={`${typographyClasses.article} text-phy-text whitespace-pre-wrap break-words`}>{p.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}

                            {!paper.passage?.trim() && <div className="text-sm text-phy-muted">鏈娴嬪埌鍘熸枃鍐呭??/div>}
                        </div>
                    </section>

                    <div
                        onPointerDown={(e) => {
                            e.preventDefault();
                            setSplitDragMode(isMobileViewport ? 'mobile' : 'desktop');
                        }}
                        className={`rounded-full ${isMobileViewport ? 'cursor-row-resize h-2' : 'cursor-col-resize'} bg-phy-border hover:bg-phy-borderHover`}
                        title={isMobileViewport ? '鎷栧姩璋冩暣涓婁笅鍖哄煙楂樺?? : '鎷栧姩璋冩暣宸﹀彸鍒嗘爮瀹藉??}
                    />

                    <section
                        ref={questionPanelRef}
                        onMouseUp={captureQuestionSelection}
                        onKeyUp={captureQuestionSelection}
                        className="space-y-4 min-h-0 overflow-y-auto custom-scrollbar pr-1"
                    >
                        <div className="sticky top-0 z-10 bg-phy-bg/95 backdrop-blur border border-phy-border rounded-xl p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs font-bold text-phy-text">婵☆偆澧楅…鍥洪幍顔瑰亾娴ｅ啫顥嶉柛?/div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setQuestionViewMode('all')}
                                        className={`px-2 py-1 rounded text-[11px] font-bold border ${questionViewMode === 'all' ? 'bg-indigo-600 text-white border-indigo-500' : 'border-phy-border text-phy-muted hover:text-phy-text'}`}
                                    >
                                        闂佺绻堥崝鎴﹀磿鐎涙﹫绱?                                    </button>
                                    <button
                                        onClick={() => setQuestionViewMode('wrong')}
                                        disabled={effectiveWrongKeys.length === 0}
                                        className={`px-2 py-1 rounded text-[11px] font-bold border ${questionViewMode === 'wrong' ? 'bg-rose-600 text-white border-rose-500' : 'border-phy-border text-phy-muted hover:text-phy-text'} disabled:opacity-50`}
                                    >
                                        婵炲濮撮幊姗€寮繝鍐跨矗?                                    </button>
                                    <button
                                        onClick={retryWrongQuestions}
                                        disabled={!submitted || wrongQuestionKeys.length === 0}
                                        className="px-2.5 py-1 rounded text-[11px] font-bold border border-amber-400/35 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50"
                                    >
                                        闂備焦瀵ч悷鈺呫€傛禒瀣厒鐎广儱娲ㄩ惌?
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 max-h-20 overflow-y-auto custom-scrollbar flex flex-wrap gap-1.5">
                                {questionMetaList.map((item) => (
                                    <button
                                        key={`nav-${item.key}`}
                                        onClick={() => scrollToQuestion(item.key)}
                                        className={`px-2 py-1 rounded text-[11px] font-bold border transition ${
                                            item.wrong ? 'border-rose-400/60 text-rose-200 bg-rose-500/15'
                                                : item.answered ? 'border-emerald-400/60 text-emerald-200 bg-emerald-500/15'
                                                    : 'border-phy-border text-phy-muted hover:text-phy-text'
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {!strictCETActive && (paper.questions || []).map((q, qIdx) => {
                            const key = `mcq-${q.id}`;
                            if (!shouldRenderQuestion(key)) return null;
                            const selected = answers[key] || '';
                            const isRight = submitted && toAnswer(selected) === toAnswer(q.answer);
                            const isWrong = submitted && !isRight;
                            return (
                                <article
                                    key={key}
                                    ref={(el) => { if (el) questionRefs.current[key] = el; }}
                                    data-question-key={key}
                                    className="rounded-2xl border border-phy-border bg-phy-glass p-4"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <h4 className={`font-bold text-phy-text ${typographyClasses.question}`}>Q{qIdx + 1}. {q.question}</h4>
                                        {submitted ? (isRight ? <CheckCircle2 size={18} className="text-emerald-400 shrink-0" /> : <AlertCircle size={18} className="text-rose-400 shrink-0" />) : null}
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {(q.options || []).map((opt, optIdx) => {
                                            const letter = String.fromCharCode(65 + optIdx);
                                            const picked = selected === letter;
                                            const correct = submitted && toAnswer(q.answer) === letter;
                                            return (
                                                <label
                                                    key={letter}
                                                    className={`flex gap-3 p-2.5 rounded-lg border cursor-pointer transition ${picked ? 'border-indigo-500 bg-indigo-500/10' : 'border-phy-border hover:bg-phy-bg'} ${submitted && correct ? 'border-emerald-500/50 bg-emerald-500/10' : ''}`}
                                                >
                                                    <input
                                                        type="radio"
                                                        className="mt-1"
                                                        name={key}
                                                        checked={picked}
                                                        disabled={submitted}
                                                        onChange={() => setAnswers((prev) => ({ ...prev, [key]: letter }))}
                                                    />
                                                    <div className={`${typographyClasses.option} text-phy-text`}>{formatOption(optIdx, opt)}</div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {submitted && (
                                        <div className="mt-3 rounded-lg border border-phy-border bg-phy-bg p-3 text-xs space-y-1">
                                            <div className="text-phy-text">婵繐绲块垾妯肩驳閺冣偓椤㈠秹鏁?span className="font-bold">{q.answer}</span> 鐠?濞达絿濮峰▓鎴犵驳閺冣偓椤㈠秹鏁?span className="font-bold">{selected || '闁哄牜浜欑紞鏃堟晸?}</span></div>
                                            {isWrong ? (
                                                <div className="inline-flex items-center px-2 py-0.5 rounded border border-rose-400/40 bg-rose-500/10 text-rose-200 text-[11px] font-bold">
                                                    闂佹寧鐟ュú婊堟晬濮濈袱nferWrongReason('mcq', q.question, selected)}
                                                </div>
                                            ) : null}
                                            {q.explanation ? <div className={`${typographyClasses.explanation} text-phy-muted`}>閻熸瑱绲鹃悗浠嬫晬濮濈脯.explanation}</div> : null}
                                            {q.evidence_sentence ? (
                                                <div className={typographyClasses.evidence}>
                                                    閻犲洣鐒﹀畵渚€宕ｉ妷顖滅獥{q.evidence_sentence}
                                                    <button
                                                        onClick={() => jumpToEvidenceSentence(q.evidence_sentence)}
                                                        className="ml-2 px-1.5 py-0.5 rounded border border-indigo-400/35 text-[11px] hover:bg-indigo-500/15"
                                                    >
                                                        閻庤鐭紞鍛嫚娴ｇ懓绁?
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => openDebate({ ...q, key, type: 'mcq' })}
                                        className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-400/30 text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 flex items-center gap-1.5"
                                    >
                                        <MessageSquare size={14} />
                                        閺夆晜绋戦崣鍡欐嫚娴ｇ懓绁﹂柛娆忕Ч閳?
                                    </button>
                                    {renderDebatePanel(key)}
                                </article>
                            );
                        })}

                        {visibleMatchingItems.length > 0 && (
                            <article className="rounded-2xl border border-phy-border bg-phy-glass p-4">
                                <h4 className="font-bold text-phy-text text-sm mb-3">
                                    {strictCETActive ? '婵炲牅绲婚幆銈夊礌瑜版帒甯抽柨娑樼墔瀵鏁?CET Section B闁? : '婵炲牅绲婚幆銈夊礌瑜版帒甯抽柨娑樻箲ET 閻㈩垱鐡曢～鍡涙晸?}
                                </h4>
                                <div className="space-y-3">
                                    {paper.matching.statements.map((s, idx) => {
                                        const key = `match-${s.id}`;
                                        if (!shouldRenderQuestion(key)) return null;
                                        const selected = answers[key] || '';
                                        const isRight = submitted && toAnswer(selected) === toAnswer(s.answer);
                                        const isWrong = submitted && !isRight;
                                        const statementNo = strictCETActive ? (Number(s.id) || (36 + idx)) : (idx + 1);
                                        return (
                                            <div
                                                key={key}
                                                ref={(el) => { if (el) questionRefs.current[key] = el; }}
                                                data-question-key={key}
                                                className={`rounded-xl border p-3 ${submitted && isRight ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-phy-border bg-phy-glass'}`}
                                            >
                                                <div className={`${typographyClasses.question} text-phy-text`}>{statementNo}. {s.text}</div>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <label className="text-xs text-phy-muted">闂備緡鍋勯ˇ鎵偓姘ュ妼閳绘挻鎷呴崘鈺佸姍</label>
                                                    <select
                                                        value={selected}
                                                        disabled={submitted}
                                                        onChange={(e) => setAnswers((prev) => ({ ...prev, [key]: e.target.value }))}
                                                        className="bg-phy-bg border border-phy-border rounded-lg px-2 py-1.5 text-sm text-phy-text"
                                                    >
                                                        <option value="">闁哄牜浜埀顒€顦扮€?/option>
                                                        {(strictCETActive ? matchingOptions : paragraphPool).map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
                                                    </select>
                                                    {submitted ? (
                                                        <span className={`text-xs font-bold ${isRight ? 'text-emerald-400' : 'text-rose-300'}`}>
                                                            婵繐绲块垾妯肩驳閺冣偓椤㈠秹鏁嶅绺?answer}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {submitted && (
                                                    <div className="mt-2 text-xs space-y-1">
                                                        {isWrong ? (
                                                            <div className="inline-flex items-center px-2 py-0.5 rounded border border-rose-400/40 bg-rose-500/10 text-rose-200 text-[11px] font-bold">
                                                                闂佹寧鐟ュú婊堟晬濮濈袱nferWrongReason('matching', s.text, selected)}
                                                            </div>
                                                        ) : null}
                                                        {s.explanation ? <div className={`${typographyClasses.explanation} text-phy-muted`}>閻熸瑱绲鹃悗浠嬫晬濮濈府.explanation}</div> : null}
                                                        {s.evidence_sentence ? (
                                                            <div className={typographyClasses.evidence}>
                                                                閻犲洣鐒﹀畵渚€宕ｉ妷顖滅獥{s.evidence_sentence}
                                                                <button
                                                                    onClick={() => jumpToEvidenceSentence(s.evidence_sentence)}
                                                                    className="ml-2 px-1.5 py-0.5 rounded border border-indigo-400/35 text-[11px] hover:bg-indigo-500/15"
                                                                >
                                                                    閻庤鐭紞鍛嫚娴ｇ懓绁?
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => openDebate({ ...s, key, type: 'matching', question: s.text })}
                                                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-400/30 text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 flex items-center gap-1.5"
                                                >
                                                    <MessageSquare size={14} />
                                                    鐏忚精绻栨０妯烘??AI 鐎佃濮?
                                                </button>
                                                {renderDebatePanel(key)}
                                            </div>
                                        );
                                    })}
                                </div>
                            </article>
                        )}
                    </section>
                </div>
            </div>
            {selectionDraft ? (
                <div
                    className="fixed z-[96] rounded-xl border border-indigo-400/40 bg-phy-glassHeavy backdrop-blur px-2 py-1.5 shadow-lg"
                    style={{
                        left: Math.max(12, Math.min(window.innerWidth - 280, Math.round(selectionDraft.anchorX || 24) - 120)),
                        top: Math.max(12, Math.min(window.innerHeight - 72, Math.round(selectionDraft.anchorY || 24) - 50))
                    }}
                >
                    <div className="px-1 pb-1 text-[10px] text-phy-muted">
                        {(selectionDraft.source || 'article') === 'question'
                            ? `濡増顭囧ú浼村礌?${selectionDraft.questionLabel || ''}`
                            : '鍘熸枃鍖?}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => addSelectionMark('word')}
                            className="px-2 py-1 rounded border border-amber-400/40 text-[11px] text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 inline-flex items-center gap-1"
                        >
                            <Highlighter size={12} />
                            闂佹眹鍨婚崰鏇㈡儊?
                        </button>
                        <button
                            onClick={() => addSelectionMark('sentence')}
                            className="px-2 py-1 rounded border border-sky-400/40 text-[11px] text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 inline-flex items-center gap-1"
                        >
                            <Underline size={12} />
                            閻ゆ垿姣﹂敓?                        </button>
                        <button
                            onClick={clearSelectionDraft}
                            className="px-2 py-1 rounded border border-phy-border text-[11px] text-phy-muted hover:text-phy-text"
                        >
                            闁告瑦鐗楃粔?
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ExamView;


