
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { analyzeImagesForChat, analyzePassageStructure, debateReadingEvidence, generateAdversarialReadingDrill, sendChat } from '../services/ai';
import { extractTextFromPDF } from '../services/pdf';
import { getFolders, saveFolder } from '../services/db';
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
import ReactMarkdown from 'react-markdown';

const STORAGE_KEY = 'exam_adversarial_session_v2';
const HISTORY_KEY = 'exam_adversarial_history_v1';
const MOBILE_HEADER_MODE_KEY = 'exam_mobile_header_mode';
const MOBILE_MARKS_COLLAPSED_KEY = 'exam_mobile_marks_collapsed';
const HISTORY_LIMIT = 30;
const HISTORY_PASSAGE_LIMIT = 30000;
const HISTORY_QUESTION_TEXT_LIMIT = 12000;
const MODE_OPTIONS = [
    { value: 'mixed', label: '混合模式（阅读 + 段落匹配）' },
    { value: 'reading', label: '仅阅读理解（选择题）' },
    { value: 'matching', label: '仅段落匹配（四六级常见）' },
    { value: 'cet_strict_matching', label: '四六级严格段落匹配（Section B）' }
];

const DEFAULT_SETUP = {
    sourceType: 'article',
    mode: 'mixed',
    questionCount: 6,
    passage: '',
    questionText: ''
};

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

const toSafePaperSnapshot = (paper = {}) => {
    const source = paper || {};
    const safeQuestions = Array.isArray(source.questions) ? source.questions.map((q, idx) => ({
        id: q?.id ?? idx,
        question: String(q?.question || q?.text || q?.stem || ''),
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
            text: String(s?.text || s?.statement || s?.question || s?.stem || ''),
            answer: String(s?.answer || ''),
            explanation: String(s?.explanation || ''),
            evidence_sentence: String(s?.evidence_sentence || '')
        })) : []
    } : null;

    return {
        title: String(source.title || ''),
        passage: String(source.passage || '').slice(0, HISTORY_PASSAGE_LIMIT),
        questions: safeQuestions,
        matching: safeMatching
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
            question: `Q${idx + 1}. ${q.question || q.text || q.stem || ''}`,
            userAnswer: userAnswer || '未答',
            correctAnswer: correctAnswer || '未知',
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
            question: `M${idx + 1}. ${s.text || s.question || s.statement || s.stem || ''}`,
            userAnswer: userAnswer || '未答',
            correctAnswer: correctAnswer || '未知',
            isCorrect: Boolean(userAnswer && correctAnswer && userAnswer === correctAnswer),
            explanation: s.explanation || '',
            evidence: s.evidence_sentence || ''
        });
    });

    return {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        title: paper?.title || '阅读对抗训练',
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

const ExamView = ({ params = {} }) => {
    const { settings, addFlashcard, loadUserFlashcards, saveToNotes } = useApp();
    const { addChatMessage, toggleChat, isChatOpen } = useChat();
    const [isReadOnly, setIsReadOnly] = useState(() => localStorage.getItem('exam_read_only') === 'true');
    const canvasMode = 'expanded';
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
    const [articleFontLevel, setArticleFontLevel] = useState(1); // 0 small, 1 default, 2 large
    const [mobilePane, setMobilePane] = useState('article'); // questions | article
    const [mobileHeaderMode, setMobileHeaderMode] = useState(() => (
        localStorage.getItem(MOBILE_HEADER_MODE_KEY) === 'classic' ? 'classic' : 'compact'
    ));
    const [mobileMarksCollapsed, setMobileMarksCollapsed] = useState(() => {
        const saved = localStorage.getItem(MOBILE_MARKS_COLLAPSED_KEY);
        if (saved === null) return true;
        return saved === 'true';
    });
    const [examHistory, setExamHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [historyId, setHistoryId] = useState(null);
    const [wordMarks, setWordMarks] = useState([]);
    const [sentenceMarks, setSentenceMarks] = useState([]);
    const [selectionDraft, setSelectionDraft] = useState(null);
    const [isMarkingBusy, setIsMarkingBusy] = useState(false);
    const [sentenceAnalysis, setSentenceAnalysis] = useState('');
    const [manualStructure, setManualStructure] = useState(null); // manual on-demand structure analysis
    const [isAnalyzingStructure, setIsAnalyzingStructure] = useState(false);
    const [vocabAnalysis, setVocabAnalysis] = useState('');
    const [isAnalyzingVocab, setIsAnalyzingVocab] = useState(false);
    const [grammarAnalysis, setGrammarAnalysis] = useState('');
    const [isAnalyzingGrammar, setIsAnalyzingGrammar] = useState(false);
    const articleMainRef = useRef(null);
    const questionPanelRef = useRef(null);
    const questionRefs = useRef({});
    const strictSetupMode = isStrictCETMode(setup.mode);
    const strictPaperMode = isStrictCETMode(paper?.mode);
    const strictCETActive = strictSetupMode || strictPaperMode;

    useEffect(() => {
        if (params.importText) {
            if (params.mode === 'reading') {
                setSetup(prev => ({ ...prev, passage: params.importText }));
                // Set a dummy paper to bypass the setup screen and show the article
                setPaper({
                    title: '导入阅读文章',
                    passage: params.importText,
                    questions: [],
                    matching: null,
                    mode: 'reading'
                });
                setIsReadOnly(true);
            } else if (params.mode === 'practice') {
                setSetup(prev => ({ ...prev, passage: params.importText }));
                setPaper(null);
                setIsReadOnly(false);
            }
        }
    }, [params]);

    useEffect(() => {
        localStorage.setItem('exam_read_only', isReadOnly ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent('exam-canvas-mode-change', { detail: { mode: 'expanded' } }));
    }, [isReadOnly]);

    useEffect(() => {
        const mode = mobileHeaderMode === 'classic' ? 'classic' : 'compact';
        localStorage.setItem(MOBILE_HEADER_MODE_KEY, mode);
    }, [mobileHeaderMode]);

    useEffect(() => {
        localStorage.setItem(MOBILE_MARKS_COLLAPSED_KEY, mobileMarksCollapsed ? 'true' : 'false');
    }, [mobileMarksCollapsed]);

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

    const answeredCount = useMemo(() => {
        const keys = Object.keys(answers || {});
        return keys.filter((k) => answers[k]).length;
    }, [answers]);

    const totalCount = useMemo(() => {
        if (!paper) return 0;
        return (paper.questions?.length || 0) + (paper.matching?.statements?.length || 0);
    }, [paper]);
    const unansweredCount = useMemo(() => Math.max(0, totalCount - answeredCount), [answeredCount, totalCount]);
    const mobileSubmitLabel = useMemo(() => (
        unansweredCount > 0
            ? `提交并评分（${answeredCount}/${totalCount}，未答${unansweredCount}）`
            : `提交并评分（${answeredCount}/${totalCount}）`
    ), [answeredCount, totalCount, unansweredCount]);
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
            .filter((m) => String(m?.source || 'article') !== 'question')
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

    useEffect(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed?.paper) return;
            const restoredSetup = { ...DEFAULT_SETUP, ...(parsed.setup || {}) };
            const restoredPaper = { ...(parsed.paper || {}) };
            if ((!restoredPaper.passage || String(restoredPaper.passage).trim().length < 200) && String(restoredSetup.passage || '').trim().length > 200) {
                restoredPaper.passage = restoredSetup.passage;
            }
            setSetup(restoredSetup);
            setPaper(restoredPaper);
            setAnswers(parsed.answers || {});
            setSubmitted(Boolean(parsed.submitted));
            setScore(parsed.score || { total: 0, correct: 0, accuracy: 0 });
            setMobilePane('article');
            setWordMarks(Array.isArray(parsed.wordMarks) ? parsed.wordMarks : []);
            setSentenceMarks(Array.isArray(parsed.sentenceMarks) ? parsed.sentenceMarks : []);
            setSentenceAnalysis(String(parsed.sentenceAnalysis || ''));
            toast.success('已恢复之前的考试进度', { id: 'exam_restore_v2' });
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
                ? 'Extract questions from images. Keep question numbers, options, and matching structure. Output plain text.'
                : 'Extract reading passage text from images. Keep paragraph breaks when possible. Output plain text.';
            const extracted = await analyzeImagesForChat(dataUrls, settings, instruction);
            if (!extracted?.trim()) throw new Error('No valid text recognized from image');
            setSetup((prev) => ({ ...prev, [targetField]: `${(prev[targetField] || '').trim()}\n\n${extracted.trim()}`.trim() }));
            toast.success(`Appended OCR text to ${targetField === 'questionText' ? 'question area' : 'passage area'}`);
        } catch (e) {
            toast.error(`Image recognition failed: ${e.message}`);
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
            toast.success(`已导入文本：${file.name}`);
        } catch (err) {
            toast.error(`读取失败: ${err.message}`);
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
            toast.success(`已导入题目：${file.name}`);
        } catch (err) {
            toast.error(`读取失败: ${err.message}`);
        } finally {
            setIsLoadingFile(false);
            e.target.value = '';
        }
    };

    const handleGenerate = async () => {
        if (!setup.passage.trim()) return toast.error('Please input or upload a passage first');
        if (setup.sourceType === 'import' && !setup.questionText.trim()) return toast.error('请先导入你的题目内容');
        setIsGenerating(true);
        try {
            toast.loading('正在生成对抗式阅读训练卷...', { id: 'exam_build_v2' });
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
                throw new Error('未解析出有效题目，请补充更完整的原文或题干后重试');
            }
            setPaper(result);
            setAnswers({});
            setSubmitted(false);
            setScore({ total: 0, correct: 0, accuracy: 0 });
            setDebateTarget(null);
            setDebateMessages([]);
            setDebateInput('');
            setMobilePane('article');
            setWordMarks([]);
            setSentenceMarks([]);
            setSelectionDraft(null);
            setSentenceAnalysis('');
            toast.success('训练卷已生成，开始作答吧', { id: 'exam_build_v2' });
        } catch (e) {
            toast.error(`生成失败: ${e.message}`, { id: 'exam_build_v2' });
        } finally {
            setIsGenerating(false);
        }
    };

    const clearSession = () => {
        if (!window.confirm('Clear current training and start over?')) return;
        localStorage.removeItem(STORAGE_KEY);
        setPaper(null);
        setAnswers({});
        setSubmitted(false);
        setScore({ total: 0, correct: 0, accuracy: 0 });
        setDebateTarget(null);
        setDebateMessages([]);
        setDebateInput('');
        setMobilePane('article');
        setWordMarks([]);
        setSentenceMarks([]);
        setSelectionDraft(null);
        setSentenceAnalysis('');
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
                toast('历史记录存储空间已满，已自动保存精简版本。');
            } catch (e2) {
                finalList = compact.slice(0, 8);
                localStorage.setItem(HISTORY_KEY, JSON.stringify(finalList));
                toast('存储空间不足，仅保留最近的记录。');
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
        if (!window.confirm('Clear all reading exam history?')) return;
        setExamHistory([]);
        setHistoryId(null);
        localStorage.removeItem(HISTORY_KEY);
    };

    const submitPaper = () => {
        if (!paper) return;
        const result = evaluatePaper(paper, answers);
        setSubmitted(true);
        setScore(result);
        const record = buildHistoryRecord({ paper, setup, answers, result });
        persistHistory([record, ...examHistory]);
        toast.success(`已提交：${result.correct}/${result.total}，准确率 ${result.accuracy}%`);
    };

    const restoreFromHistory = (record, retry = false) => {
        if (!record) return;
        if (!record.paperSnapshot) {
            toast.error('该历史记录来自旧版本，无法完整恢复试卷内容。');
            return;
        }
        const restoredPaper = {
            title: record.paperSnapshot.title || record.title || '阅读对抗训练',
            passage: record.paperSnapshot.passage || '',
            questions: Array.isArray(record.paperSnapshot.questions) ? record.paperSnapshot.questions : [],
            matching: record.paperSnapshot.matching || null
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
        setMobilePane('article');
        setWordMarks([]);
        setSentenceMarks([]);
        setSelectionDraft(null);
        setSentenceAnalysis('');
        setShowHistory(false);
        toast.success(retry ? '已加载历史试卷，现在可以重新练习了。' : '已恢复到历史练习查看视图。');
    };

    const openDebate = (target) => {
        setDebateTarget(target);
        setDebateMessages([{
            role: 'assistant',
            content: '我将担任严格考官。请针对你的答案给出论证理由，并引用原文证据。如果证据不足，我会继续追问你的推理。'
        }]);
        setDebateInput('');
    };

    const sendDebate = async () => {
        if (!debateTarget) return;
        const userContent = debateInput.trim();
        if (!userContent) return;

        const selected = answers[debateTarget.key] || '未作答';
        const userMessage = `我的作答为：${selected}\n我的论证理由：${userContent}`;
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
                res.required_evidence ? `证据要求为：${res.required_evidence}` : '',
                res.hint ? `提示：${res.hint}` : ''
            ].filter(Boolean).join('\n');

            setDebateMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        } catch (e) {
            toast.error(`反驳失败: ${e.message}`);
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
                questionKey: null,
                questionLabel: null
            });
        } catch (e) {
            console.error('Selection capture failed:', e);
        }
    };

    const captureQuestionSelection = () => {
        if (!questionPanelRef.current) return;
        const selection = window.getSelection?.();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
            return;
        }
        const range = selection.getRangeAt(0);
        if (!questionPanelRef.current.contains(range.commonAncestorContainer)) {
            return;
        }
        const text = normalizeText(selection.toString());
        if (!text) {
            return;
        }
        const host = getSelectionElement(range.commonAncestorContainer);
        const questionNode = host?.closest?.('[data-question-key]');
        const questionKey = questionNode?.getAttribute?.('data-question-key') || null;
        const questionLabel = questionNode?.getAttribute?.('data-question-label') || null;
        const panelText = normalizeText(questionNode?.textContent || '');
        setSelectionDraft({
            start: null,
            end: null,
            text,
            context: panelText && panelText !== text ? panelText.slice(0, 180) : '',
            source: 'question',
            questionKey,
            questionLabel
        });
    };

    const scrollToQuestion = (key) => {
        if (!key) return;
        const node = questionRefs.current[key];
        if (!node) return;
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setMobilePane('questions');
    };

    const jumpToMark = (mark) => {
        if (!mark) return;
        if ((mark.source || 'article') === 'question' && mark.questionKey) {
            scrollToQuestion(mark.questionKey);
            return;
        }
        setMobilePane('article');
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
        if (!selectionDraft?.text) return toast.error('请先在文中选中文字');
        const mark = {
            id: crypto.randomUUID(),
            text: selectionDraft.text,
            start: selectionDraft.start,
            end: selectionDraft.end,
            context: selectionDraft.context || '',
            source: selectionDraft.source || 'article',
            questionKey: selectionDraft.questionKey || null,
            questionLabel: selectionDraft.questionLabel || null,
            createdAt: Date.now()
        };
        if (type === 'word') {
            const exists = mark.source === 'question'
                ? wordMarks.some((m) => m.source === 'question' && m.questionKey === mark.questionKey && normalizeText(m.text).toLowerCase() === normalizeText(mark.text).toLowerCase())
                : wordMarks.some((m) => (m.source || 'article') === 'article' && m.start === mark.start && m.end === mark.end);
            if (exists) return toast('该生词标记已存在');
            setWordMarks((prev) => [mark, ...prev].slice(0, 120));
            toast.success('生词已标记并高亮');
        } else {
            const exists = mark.source === 'question'
                ? sentenceMarks.some((m) => m.source === 'question' && m.questionKey === mark.questionKey && normalizeText(m.text).toLowerCase() === normalizeText(mark.text).toLowerCase())
                : sentenceMarks.some((m) => (m.source || 'article') === 'article' && m.start === mark.start && m.end === mark.end);
            if (exists) return toast('该疑难句已在标记列表中');
            setSentenceMarks((prev) => [mark, ...prev].slice(0, 120));
            toast.success('疑难句已标记并添加下划线');
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
        const wordsMap = new Map();
        wordMarks.forEach(m => {
            const t = normalizeText(m.text);
            if (!t) return;
            if (!wordsMap.has(t)) {
                wordsMap.set(t, m.definition || '');
            } else if (m.definition && !wordsMap.get(t)) {
                wordsMap.set(t, m.definition);
            }
        });
        const words = Array.from(wordsMap.keys());
        if (!words.length) return toast.error('请先标记生词');
        setIsMarkingBusy(true);
        try {
            const allCards = await loadUserFlashcards();
            const existingFront = new Set(
                allCards.map((c) => normalizeText(String(c.front || '').split('\n')[0]).toLowerCase()).filter(Boolean)
            );
            const folders = await getFolders();
            let targetFolder = folders.find((f) => normalizeText(f.name) === '阅读生词');
            if (!targetFolder) {
                targetFolder = { id: crypto.randomUUID(), name: '阅读生词', type: 'user', createdAt: Date.now() };
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
                const def = wordsMap.get(word);
                const backContent = def 
                    ? `【AI深度词解】\n${def}\n\n来源：文章阅读智能识别标记` 
                    : '来源：文章阅读手动人工标记\n建议：回顾原文上下文后再强化记忆';
                
                await addFlashcard({
                    id: crypto.randomUUID(),
                    front: word,
                    back: backContent,
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
            toast.success(`已加入闪卡：${added}，跳过重复：${skipped}`);
        } catch (e) {
            toast.error(`加入闪卡失败: ${e.message}`);
        } finally {
            setIsMarkingBusy(false);
        }
    };

    const analyzeSentenceMarks = async () => {
        if (!sentenceMarks.length) return toast.error('请先在文中标记疑难句');
        setIsMarkingBusy(true);
        try {
            const payload = sentenceMarks.slice(0, 10).map((m, idx) => (
                `${idx + 1}. Sentence: ${m.text}\nContext: ${m.context || 'None'}`
            )).join('\n\n');
            const prompt = `你是阅读理解教练。请用中文分析以下疑难句：
1) 每句给出语法拆解（主句、从句、修饰语）
2) 解释为什么容易误解
3) 给出做题时如何快速定位证据
4) 提供简短改写或翻译
请按“句子1/句子2...”分段输出。\n\n${payload}`;
            const result = await sendChat([
                { role: 'system', content: 'You are a strict but clear English reading coach. Output concise structured Chinese.' },
                { role: 'user', content: prompt }
            ], settings, false);
            const content = String(result || '').trim();
            setSentenceAnalysis(content);
            if (content) {
                addChatMessage('assistant', `【疑难句深度分析】\n${content}`);
                if (!isChatOpen) toggleChat();
            }
            toast.success('疑难句分析完成');
        } catch (e) {
            toast.error(`分析失败: ${e.message}`);
        } finally {
            setIsMarkingBusy(false);
        }
    };

    const handleAnalyzeVocab = async () => {
        if (!paper?.passage) return toast.error('没有检测到文章原文');
        setIsAnalyzingVocab(true);
        try {
            const prompt = `请提取这篇英文文章中最具代表性的8-12个高频难词（如四六级或考研词汇）。\n必须严格返回无包装的JSON数组。\nJSON格式要求：\n[\n  { "word": "必须是原文中准确出现的完整单词形式", "definition": "音标、词性及在本文语境中的精准中文释义" }\n]\n\n文章内容：\n${paper.passage}`;
            const result = await sendChat([
                { role: 'system', content: 'You reply strictly with a raw JSON array of objects. No markdown wrap, no other text.' },
                { role: 'user', content: prompt }
            ], settings, false);
            
            let cleanJson = String(result || '').trim();
            if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7);
            if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3);
            if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3);
            cleanJson = cleanJson.trim();
            
            const wordsList = JSON.parse(cleanJson);
            const newMarks = [];
            let addedCount = 0;
            const currentWords = new Set(wordMarks.map(m => m.text.toLowerCase()));
            
            wordsList.forEach(item => {
                const w = item.word?.trim();
                const d = item.definition || '';
                if (!w || currentWords.has(w.toLowerCase())) return;
                
                const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp('\\b' + escapeRegExp(w) + '\\b', 'i');
                const match = paper.passage.match(regex);
                if (match) {
                    newMarks.push({
                        id: crypto.randomUUID(),
                        text: match[0],
                        definition: d,
                        source: 'article',
                        context: paper.passage.substring(Math.max(0, match.index - 50), Math.min(paper.passage.length, match.index + 50)),
                        start: match.index,
                        end: match.index + match[0].length
                    });
                    currentWords.add(w.toLowerCase());
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                setWordMarks(prev => [...prev, ...newMarks]);
                toast.success(`智能识别完成，已为您高亮标记 ${addedCount} 个词汇入库`);
            } else {
                toast.success('未能从原文准确匹配到新的未标记生词');
            }
        } catch (e) {
            toast.error(`智能查词格式解析异常`);
            console.error('JSON Parse Error:', e);
        } finally {
            setIsAnalyzingVocab(false);
            setVocabAnalysis(''); 
        }
    };

    const handleAnalyzeGrammar = async () => {
        if (!paper?.passage) return toast.error('没有检测到文章原文');
        setIsAnalyzingGrammar(true);
        try {
            const prompt = `请深度剖析以下英文文章中出现的复杂语法结构和长难句。\n1) 提取文中最具挑战性的几个长难句（必须是原文中一模一样的句子）。\n2) 进行结构拆解（如主谓宾、定语从句、状语从句等）。\n3) 点评其中的高级语法现象并提供翻译。\n必须严格返回无包装的JSON数组。\nJSON格式要求：\n[\n  { "sentence": "原文原句", "analysis": "结构拆解和详细点评..." }\n]\n\n文章内容：\n${paper.passage}`;
            const result = await sendChat([
                { role: 'system', content: 'You reply strictly with a raw JSON array of objects. No markdown wrap, no other text.' },
                { role: 'user', content: prompt }
            ], settings, false);
            
            let cleanJson = String(result || '').trim();
            if (cleanJson.startsWith('```json')) cleanJson = cleanJson.slice(7);
            if (cleanJson.startsWith('```')) cleanJson = cleanJson.slice(3);
            if (cleanJson.endsWith('```')) cleanJson = cleanJson.slice(0, -3);
            cleanJson = cleanJson.trim();
            
            const list = JSON.parse(cleanJson);
            const newMarks = [];
            let addedCount = 0;
            const currentSentences = new Set(sentenceMarks.map(m => m.text.trim()));
            
            list.forEach(item => {
                const s = item.sentence?.trim();
                const a = item.analysis || '';
                if (!s || currentSentences.has(s)) return;
                
                const idx = paper.passage.indexOf(s);
                if (idx !== -1) {
                    newMarks.push({
                        id: crypto.randomUUID(),
                        text: s,
                        analysis: a,
                        source: 'article',
                        context: s,
                        start: idx,
                        end: idx + s.length
                    });
                    currentSentences.add(s);
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                setSentenceMarks(prev => [...prev, ...newMarks]);
                toast.success(`智能识别完成，已为您添加 ${addedCount} 条长难句下划线`);
                const combinedAnalysis = newMarks.map(m => `### ${m.text}\n\n**AI深度解析**：\n${m.analysis}`).join('\n\n---\n\n');
                setGrammarAnalysis((prev) => prev ? prev + '\n\n' + combinedAnalysis : combinedAnalysis);
            } else {
                toast.success('未能从原文准确匹配到长难句');
            }
        } catch (e) {
            toast.error(`语法分析失败: 格式异常`);
            console.error('JSON Parse Error:', e);
        } finally {
            setIsAnalyzingGrammar(false);
        }
    };

    const articleTextClass = articleFontLevel === 2
        ? 'text-base md:text-lg leading-8'
        : articleFontLevel === 0
            ? 'text-xs md:text-sm leading-6'
            : 'text-sm md:text-base leading-7';

    const renderDebatePanel = (key) => {
        if (!debateTarget || debateTarget.key !== key) return null;
        return (
            <div className="mt-3 rounded-xl border border-orange-400/30 bg-orange-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-orange-600">证据反驳 · 当前题目 {debateTarget.key}</div>
                    <button
                        onClick={() => {
                            setDebateTarget(null);
                            setDebateMessages([]);
                            setDebateInput('');
                        }}
                        className="text-[11px] px-2 py-1 rounded border border-orange-500/30 text-orange-600 font-medium hover:bg-orange-500/10"
                    >
                        关闭对话
                    </button>
                </div>
                <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-2 border border-orange-400/20 rounded-lg p-2.5 bg-phy-bg">
                    {debateMessages.map((m, idx) => (
                        <div key={idx} className={`text-xs rounded-lg px-2.5 py-2 leading-6 whitespace-pre-wrap break-words ${m.role === 'assistant' ? 'bg-orange-500/10 text-orange-700 border border-orange-400/20' : 'bg-indigo-500/10 text-indigo-700 border border-indigo-400/20'}`}>
                            <span className="text-[10px] font-bold opacity-80 mr-2">{m.role === 'assistant' ? 'AI 考官' : '我'}</span>
                            {m.content}
                        </div>
                    ))}
                </div>
                <textarea
                    rows={3}
                    value={debateInput}
                    onChange={(e) => setDebateInput(e.target.value)}
                    placeholder="输入你的论证：说明为什么你的答案更合理，并引用原文证据句子。"
                    className="w-full bg-phy-bg border border-phy-border rounded-lg p-2.5 text-xs md:text-sm text-phy-text outline-none resize-none"
                />
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setDebateInput((prev) => prev || '我的答案是 __，证据句位于原文：“__”。')}
                        className="px-3 py-1.5 rounded-lg text-xs border border-phy-border text-phy-muted hover:text-phy-text"
                    >
                        插入论证模板
                    </button>
                    <button
                        onClick={sendDebate}
                        disabled={isDebating || !debateInput.trim()}
                        className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white disabled:opacity-60 flex items-center gap-1.5"
                    >
                        {isDebating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                        发送论证
                    </button>
                </div>
            </div>
        );
    };

    const saveResultToNotes = async () => {
        if (!paper) return;
        const lines = [];
        lines.push(`# Reading Adversarial Training: ${paper.title || 'Untitled'}`);
        lines.push(`- Time: ${new Date().toLocaleString()}`);
        lines.push(`- Mode: ${setup.mode}`);
        if (submitted) lines.push(`- Score: ${score.correct}/${score.total} (${score.accuracy}%)`);
        lines.push('\n## Passage');
        lines.push(paper.passage || '');

        if (paper.questions?.length) {
            lines.push('\n## Reading Multiple Choice');
            paper.questions.forEach((q, idx) => {
                const key = `mcq-${q.id}`;
                lines.push(`\n### Q${idx + 1}. ${q.question}`);
                q.options?.forEach((opt, optIdx) => lines.push(`- ${formatOption(optIdx, opt)}`));
                lines.push(`- 我的答案: ${answers[key] || '未作答'}`);
                lines.push(`- 正确答案: ${q.answer}`);
                if (q.explanation) lines.push(`- 解析: ${q.explanation}`);
                if (q.evidence_sentence) lines.push(`- 证据句: ${q.evidence_sentence}`);
            });
        }

        if (paper.matching?.statements?.length) {
            lines.push('\n## 段落匹配');
            paper.matching.statements.forEach((s, idx) => {
                const key = `match-${s.id}`;
                lines.push(`\n### M${idx + 1}. ${s.text}`);
                lines.push(`- 我的答案: ${answers[key] || '未作答'}`);
                lines.push(`- 正确答案: ${s.answer}`);
                if (s.explanation) lines.push(`- 解析: ${s.explanation}`);
                if (s.evidence_sentence) lines.push(`- 证据句: ${s.evidence_sentence}`);
            });
        }

        if (debateMessages.length) {
            lines.push('\n## 证据反驳记录');
            debateMessages.forEach((m) => {
                lines.push(`- ${m.role === 'assistant' ? 'AI 考官' : '我'}: ${m.content}`);
            });
        }
        if (wordMarks.length) {
            lines.push('\n## 生词标记');
            wordMarks.forEach((m, idx) => {
                lines.push(`- ${idx + 1}. ${m.text}${m.context ? ` (Context: ${m.context})` : ''}`);
            });
        }
        if (sentenceMarks.length) {
            lines.push('\n## 疑难句标记');
            sentenceMarks.forEach((m, idx) => {
                lines.push(`- ${idx + 1}. ${m.text}${m.context ? ` (Context: ${m.context})` : ''}`);
            });
        }
        if (sentenceAnalysis) {
            lines.push('\n## AI 疑难句解析');
            lines.push(sentenceAnalysis);
        }

        await saveToNotes({
            id: crypto.randomUUID(),
            title: `Reading Adversarial Training - ${new Date().toLocaleDateString()}`,
            content: lines.join('\n'),
            tags: [new Date().toLocaleDateString(), '阅读与考试'],
            updatedAt: Date.now()
        });
        toast.success('已保存到笔记');
    };

    const handleSaveAnalysisToNotes = async (type, title, content) => {
        if (!content) return toast.error('没有可保存的内容');
        try {
            await saveToNotes({
                id: crypto.randomUUID(),
                title: `${title} - ${new Date().toLocaleDateString()}`,
                content: content,
                tags: [new Date().toLocaleDateString(), type],
                updatedAt: Date.now()
            });
            toast.success(`已保存到笔记：${title}`);
        } catch (e) {
            toast.error('保存失败: ' + e.message);
        }
    };

    const HistoryModal = showHistory ? (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm p-3 md:p-6">
            <div className="h-full max-w-6xl mx-auto bg-phy-glassHeavy border border-phy-border rounded-2xl overflow-hidden flex flex-col">
                <div className="shrink-0 px-4 py-3 border-b border-phy-border flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-sm md:text-base font-black text-phy-text flex items-center gap-2">
                            <History size={16} className="text-indigo-600" />
                            阅读题历史回顾
                        </h3>
                        <p className="text-xs text-phy-muted mt-0.5">记录每次交卷成绩、错题与证据解析</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={clearAllHistory}
                            className="px-2.5 py-1.5 rounded-lg text-xs border border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                        >
                            清空历史
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
                            <div className="text-xs text-phy-muted p-3">暂无历史记录。提交第一份试卷后会显示在这里。</div>
                        ) : examHistory.map((r) => (
                            <button
                                key={r.id}
                                onClick={() => setHistoryId(r.id)}
                                className={`w-full text-left rounded-xl border p-3 mb-2 transition ${selectedHistory?.id === r.id ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-phy-border bg-phy-glass hover:bg-phy-bg'}`}
                            >
                                <div className="text-xs text-phy-muted">{new Date(r.createdAt).toLocaleString()}</div>
                                <div className="text-sm font-bold text-phy-text line-clamp-2 mt-0.5">{r.title}</div>
                                <div className="text-xs mt-1 text-phy-muted">
                                    {(r.result?.correct ?? 0)}/{(r.result?.total ?? 0)} | {(r.result?.accuracy ?? 0)}% | {r.mode === 'mixed' ? '混合' : r.mode === 'reading' ? '阅读' : r.mode === 'matching' ? '匹配' : '四六级'}模式
                                </div>
                            </button>
                        ))}
                    </aside>

                    <section className="overflow-y-auto custom-scrollbar p-4">
                        {!selectedHistory ? (
                            <div className="text-sm text-phy-muted">请从左侧选择一条历史记录查看详情。</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-phy-border bg-phy-glass p-4">
                                    <div className="text-xs text-phy-muted">{new Date(selectedHistory.createdAt).toLocaleString()}</div>
                                    <h4 className="text-base font-black text-phy-text mt-1">{selectedHistory.title}</h4>
                                    <div className="text-sm text-phy-muted mt-1">
                                        得分 {selectedHistory.result.correct}/{selectedHistory.result.total} ({selectedHistory.result.accuracy}%)
                                        | 模式 {selectedHistory.mode === 'mixed' ? '混合' : selectedHistory.mode === 'reading' ? '阅读' : selectedHistory.mode === 'matching' ? '匹配' : '四六级标准'}
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            onClick={() => restoreFromHistory(selectedHistory, false)}
                                            disabled={!canRestoreSelectedHistory}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-400/40 text-indigo-100 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-50"
                                        >
                                            回看原卷
                                        </button>
                                        <button
                                            onClick={() => restoreFromHistory(selectedHistory, true)}
                                            disabled={!canRestoreSelectedHistory}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-400/40 text-emerald-100 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50"
                                        >
                                            重新练习这套卷
                                        </button>
                                    </div>
                                    {!canRestoreSelectedHistory ? (
                                        <div className="mt-2 text-[11px] text-amber-300">早期历史记录仅支持查看错题回顾。</div>
                                    ) : null}
                                    {selectedHistory.passagePreview ? (
                                        <details className="mt-3">
                                            <summary className="cursor-pointer text-xs font-bold text-phy-muted">显示文章摘要</summary>
                                            <p className="mt-2 text-xs text-phy-text whitespace-pre-wrap break-words leading-6">{selectedHistory.passagePreview}</p>
                                        </details>
                                    ) : null}
                                </div>

                                <div className="rounded-xl border border-phy-border bg-phy-glass p-4">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-sm font-bold text-phy-text">错题回顾</h5>
                                        <span className="text-xs text-phy-muted">
                                            错误 {selectedHistoryRows.filter((x) => !x.isCorrect).length} / 总计 {selectedHistoryRows.length}
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {selectedHistoryRows.length === 0 ? (
                                            <div className="text-xs text-phy-muted">本记录中没有题目详情。</div>
                                        ) : selectedHistoryRows.filter((x) => !x.isCorrect).length === 0 ? (
                                            <div className="text-xs text-emerald-300">太棒了！本次练习全对。</div>
                                        ) : selectedHistoryRows.filter((x) => !x.isCorrect).map((row) => (
                                            <div key={row.id} className="rounded-lg border border-phy-border bg-phy-bg p-3">
                                                <div className="text-xs text-phy-muted uppercase">{row.type}</div>
                                                <div className="text-sm text-phy-text mt-1">{row.question}</div>
                                                <div className="text-xs mt-1 text-rose-300">你的答案：{row.userAnswer}</div>
                                                <div className="text-xs text-emerald-300">正确答案：{row.correctAnswer}</div>
                                                {row.explanation ? <div className="text-xs text-phy-muted mt-1">解析：{row.explanation}</div> : null}
                                                {row.evidence ? <div className="text-xs text-indigo-300 mt-1">证据句：{row.evidence}</div> : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        onClick={() => selectedHistory && removeHistoryItem(selectedHistory.id)}
                                        className="px-3 py-1.5 rounded-lg text-xs border border-rose-400/40 text-rose-200 hover:bg-rose-500/10"
                                    >
                                        删除此记录
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    ) : null;

    if (!paper) {
        return (
            <div className="h-full overflow-y-auto p-4 md:p-8">
                {HistoryModal}
                <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
                    <div className="rounded-2xl border border-phy-border bg-phy-glass p-5 md:p-6">
                        <h2 className="text-xl md:text-2xl font-black text-phy-text flex items-center gap-2">
                            <ShieldAlert className="text-orange-600" size={24} />
                            考试模拟 · 阅读理解对抗模式
                        </h2>
                        <p className="text-sm text-phy-muted mt-2 leading-relaxed">
                            AI 不只出题，还会反驳你的答案，逼你用原文证据来证明。支持导入文章自动出题，也支持导入现成题目（阅读选择/段落匹配）。
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => setIsReadOnly(v => !v)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 ${isReadOnly ? 'bg-indigo-600 text-white border-indigo-500' : 'border-phy-border text-phy-text hover:bg-phy-bg'}`}
                            >
                                {isReadOnly ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                {isReadOnly ? '阅读与做题 (显示题目)' : '仅阅读文章'}
                            </button>
                            <button
                                onClick={() => setShowHistory(true)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-phy-border text-phy-text hover:bg-phy-bg inline-flex items-center gap-1.5"
                            >
                                <History size={14} />
                                历史回顾 ({examHistory.length}条)
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-phy-border bg-phy-glass p-4 md:p-6">
                        <div className="flex flex-wrap gap-2 mb-4">
                            <button
                                onClick={() => setSetup((prev) => ({ ...prev, sourceType: 'article' }))}
                                className={`px-4 py-2 rounded-lg text-sm font-bold ${setup.sourceType === 'article' ? 'bg-indigo-600 text-white' : 'bg-phy-glass border border-phy-border text-phy-muted'}`}
                            >
                                文章自动出题
                            </button>
                            <button
                                onClick={() => setSetup((prev) => ({ ...prev, sourceType: 'import' }))}
                                className={`px-4 py-2 rounded-lg text-sm font-bold ${setup.sourceType === 'import' ? 'bg-indigo-600 text-white' : 'bg-phy-glass border border-phy-border text-phy-muted'}`}
                            >
                                导入自定义题目
                            </button>
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
                                placeholder="题目数量 (Question count)"
                            />
                        </div>
                        {strictSetupMode ? (
                            <div className="mt-2 text-xs text-amber-300">严格模式：标准四六级段落匹配，10 题（36-45），标签 A-L。</div>
                        ) : null}

                        <div className="mt-4">
                            <label className="text-sm font-bold text-phy-text">文章原文</label>
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
                                placeholder="在此粘贴文章原文（四六级/雅思/托福等）..."
                                className="w-full mt-2 bg-phy-bg border border-phy-border rounded-xl p-3 text-sm text-phy-text resize-y outline-none"
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-phy-muted">
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <Upload size={14} />
                                    本地上传 PDF/TXT 提取文本
                                    <input type="file" accept=".pdf,.txt" className="hidden" onChange={handleUploadPassage} />
                                </label>
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <Upload size={14} />
                                    上传图片识别到原文区
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                                        await parseImagesToField(e.target.files, 'passage');
                                        e.target.value = '';
                                    }} />
                                </label>
                                <span className="opacity-70">支持直接粘贴截图</span>
                            </div>
                        </div>

                        {setup.sourceType === 'import' && (
                            <div className="mt-4">
                                <label className="text-sm font-bold text-phy-text">自定义题目（粘贴卷面内容）</label>
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
                                    placeholder="在此粘贴题目内容（选择/匹配/混合）..."
                                    className="w-full mt-2 bg-phy-bg border border-phy-border rounded-xl p-3 text-sm text-phy-text resize-y outline-none"
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-phy-muted">
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                        <Upload size={14} />
                                        上传题目文件到题目区
                                        <input type="file" accept=".pdf,.txt,.md,.json" className="hidden" onChange={handleUploadQuestions} />
                                    </label>
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                        <Upload size={14} />
                                        上传图片识别到题目区
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                                            await parseImagesToField(e.target.files, 'questionText');
                                            e.target.value = '';
                                        }} />
                                    </label>
                                    <span className="opacity-70">支持直接粘贴截图识别</span>
                                </div>
                                <details className="mt-3 text-xs text-phy-muted bg-phy-glass rounded-lg border border-phy-border p-3">
                                    <summary className="cursor-pointer font-semibold">（可选）推荐导入格式</summary>
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
                            {(isGenerating || isLoadingFile || isParsingImages) ? '处理中...' : '开始生成对抗训练卷'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {HistoryModal}
            <div className="hidden md:flex shrink-0 border-b border-phy-border bg-phy-glass px-4 md:px-6 py-3 flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs text-phy-muted uppercase tracking-wide">阅读解析对抗训练</div>
                    <h2 className="font-black text-phy-text truncate">{paper.title || '阅读对抗训练'}</h2>
                    <div className="text-xs text-phy-muted mt-1">
                        已答 {answeredCount}/{totalCount} {submitted ? `| 准确率 ${score.accuracy}%` : ''}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="hidden md:flex items-center mr-1">
                        <button
                            onClick={() => setIsReadOnly(v => !v)}
                            className={`px-3 py-2 rounded-lg text-xs md:text-sm font-bold border flex items-center gap-1.5 ${isReadOnly ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-phy-glass border-phy-border text-phy-text hover:text-phy-text hover:bg-phy-bg'}`}
                            title={isReadOnly ? "显示右侧题目面板" : "隐藏题目，仅阅读文章"}
                        >
                            {isReadOnly ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            {isReadOnly ? '阅读与做题' : '仅阅读文章'}
                        </button>
                    </div>
                    <button
                        onClick={() => setShowHistory(true)}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold border border-phy-border text-phy-text hover:bg-phy-bg flex items-center gap-1.5"
                    >
                        <History size={14} />
                        历史回顾 ({examHistory.length}条)
                    </button>
                    <button
                        onClick={saveResultToNotes}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold border border-phy-border text-phy-text hover:bg-phy-bg flex items-center gap-1.5"
                    >
                        <Save size={14} />
                        保存到笔记
                    </button>
                    <button
                        onClick={clearSession}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold bg-phy-glass border border-phy-border text-phy-muted hover:text-phy-text flex items-center gap-1.5"
                    >
                        <RotateCcw size={14} />
                        重新训练
                    </button>
                    <button
                        onClick={submitPaper}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-black bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5"
                    >
                        <Target size={14} />
                        提交并评分
                    </button>
                </div>
            </div>

            <div className="md:hidden shrink-0 border-b border-phy-border bg-phy-glass px-3 py-2">
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-phy-muted uppercase tracking-wide">阅读对抗训练</div>
                        <h2 className="text-base font-black text-phy-text leading-6 truncate">{paper.title || '阅读对抗训练'}</h2>
                        <div className="text-xs text-phy-muted mt-1">
                            已答 {answeredCount}/{totalCount} {submitted ? `| 准确率 ${score.accuracy}%` : ''}
                        </div>
                    </div>
                    <button
                        onClick={submitPaper}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black inline-flex items-center gap-1.5"
                        title="提交并评分"
                    >
                        <Target size={13} />
                        提交
                    </button>
                </div>

                {mobileHeaderMode === 'compact' ? (
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            onClick={() => setMobileHeaderMode('classic')}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-bg"
                        >
                            原版头部
                        </button>
                        <details className="relative ml-auto">
                            <summary className="list-none px-3 py-1.5 rounded-lg text-xs font-bold border border-phy-border text-phy-text bg-phy-bg cursor-pointer">
                                更多
                            </summary>
                            <div className="absolute right-0 mt-2 min-w-[170px] rounded-xl border border-phy-border bg-phy-bg p-2 space-y-1 z-20 shadow-xl">
                                <button
                                    onClick={() => setShowHistory(true)}
                                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-bold text-phy-text hover:bg-phy-glass inline-flex items-center gap-1.5"
                                >
                                    <History size={13} />
                                    历史回顾 ({examHistory.length})
                                </button>
                                <button
                                    onClick={saveResultToNotes}
                                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-bold text-phy-text hover:bg-phy-glass inline-flex items-center gap-1.5"
                                >
                                    <Save size={13} />
                                    保存到笔记
                                </button>
                                <button
                                    onClick={clearSession}
                                    className="w-full text-left px-2 py-1.5 rounded-lg text-xs font-bold text-phy-muted hover:text-phy-text hover:bg-phy-glass inline-flex items-center gap-1.5"
                                >
                                    <RotateCcw size={13} />
                                    重新训练
                                </button>
                            </div>
                        </details>
                    </div>
                ) : (
                    <div className="mt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setShowHistory(true)}
                                className="px-2.5 py-2 rounded-lg text-xs font-bold border border-phy-border text-phy-text hover:bg-phy-bg inline-flex items-center justify-center gap-1.5"
                            >
                                <History size={13} />
                                历史回顾
                            </button>
                            <button
                                onClick={saveResultToNotes}
                                className="px-2.5 py-2 rounded-lg text-xs font-bold border border-phy-border text-phy-text hover:bg-phy-bg inline-flex items-center justify-center gap-1.5"
                            >
                                <Save size={13} />
                                保存到笔记
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={clearSession}
                                className="px-2.5 py-2 rounded-lg text-xs font-bold border border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-bg inline-flex items-center justify-center gap-1.5"
                            >
                                <RotateCcw size={13} />
                                重新训练
                            </button>
                            <button
                                onClick={() => setMobileHeaderMode('compact')}
                                className="px-2.5 py-2 rounded-lg text-xs font-bold border border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10 inline-flex items-center justify-center gap-1.5"
                            >
                                <Minimize2 size={13} />
                                切换紧凑
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="md:hidden shrink-0 px-3 py-2 border-b border-phy-border bg-phy-bg/95 backdrop-blur-sm">
                <div className="inline-flex w-full rounded-xl border border-phy-border bg-phy-glass p-1">
                    <button
                        onClick={() => setMobilePane('questions')}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition ${mobilePane === 'questions' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                    >
                        做题区
                    </button>
                    <button
                        onClick={() => setMobilePane('article')}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition ${mobilePane === 'article' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                    >
                        原文区
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 p-3 md:p-5">
                <div className={`grid grid-cols-1 ${isReadOnly ? '' : 'xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]'} gap-4 h-full min-h-0`}>
                    <section className={`rounded-2xl border border-phy-border bg-phy-glass overflow-hidden min-h-0 ${(isReadOnly || mobilePane === 'article') ? 'flex flex-col' : 'hidden'} xl:flex xl:flex-col`}>
                        <div className="px-4 py-3 border-b border-phy-border bg-phy-bg flex items-center gap-2">
                            <FileText size={16} className="text-indigo-400" />
                            <h3 className="font-bold text-phy-text text-sm flex-1">文章原文与分段 (Passage)</h3>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setArticleFontLevel((v) => Math.max(0, v - 1))}
                                    className="px-2 py-1 rounded border border-phy-border text-[11px] text-phy-muted hover:text-phy-text"
                                    title="缩小字体"
                                >
                                    A-
                                </button>
                                <button
                                    onClick={() => setArticleFontLevel((v) => Math.min(2, v + 1))}
                                    className="px-2 py-1 rounded border border-phy-border text-[11px] text-phy-muted hover:text-phy-text"
                                    title="放大字体"
                                >
                                    A+
                                </button>
                            </div>
                        </div>
                        <div className="p-4 space-y-3 flex-1 overflow-y-auto custom-scrollbar min-h-0">
                            <div className="rounded-xl border border-phy-border bg-phy-glass p-3 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-bold text-phy-text inline-flex items-center gap-1.5">
                                        <BookMarked size={14} className="text-amber-600" />
                                        阅读标记 (Reading Marks)
                                    </span>
                                    <span className="text-[11px] text-phy-muted hidden md:inline">
                                        在原文或题目区选中文字即可标记生词或疑难句。
                                    </span>
                                    <button
                                        onClick={() => setMobileMarksCollapsed((v) => !v)}
                                        className="md:hidden ml-auto px-2 py-1 rounded-lg border border-phy-border text-[11px] font-semibold text-phy-muted hover:text-phy-text"
                                    >
                                        {mobileMarksCollapsed ? `展开标记（${wordMarks.length}/${sentenceMarks.length}）` : '收起标记'}
                                    </button>
                                </div>

                                <div className="md:hidden text-[11px] text-phy-muted">
                                    生词 {wordMarks.length} 个 · 疑难句 {sentenceMarks.length} 句
                                </div>

                                <div className={mobileMarksCollapsed ? 'hidden md:block space-y-3' : 'space-y-3'}>
                                    {selectionDraft ? (
                                        <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/5 p-2 flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded shrink-0">
                                                    当前选中 ({((selectionDraft.source || 'article') === 'question' && `题目 ${selectionDraft.questionLabel || ''}`) || '原文'})
                                                </div>
                                                <div className="text-[11px] text-phy-text flex-1 break-words line-clamp-2" title={selectionDraft.text}>
                                                    {selectionDraft.text.length > 80 ? selectionDraft.text.slice(0, 80) + '...' : selectionDraft.text}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => addSelectionMark('word')}
                                                    className="px-2 py-1.5 rounded text-[11px] font-bold border border-amber-500/40 text-amber-700 bg-amber-500/15 hover:bg-amber-500/25 inline-flex items-center gap-1 shadow-sm transition-colors"
                                                >
                                                    <Highlighter size={12} />
                                                    标记为生词
                                                </button>
                                                <button
                                                    onClick={() => addSelectionMark('sentence')}
                                                    className="px-2 py-1.5 rounded text-[11px] font-bold border border-sky-500/40 text-sky-700 bg-sky-500/15 hover:bg-sky-500/25 inline-flex items-center gap-1 shadow-sm transition-colors"
                                                >
                                                    <Underline size={12} />
                                                    标记为疑难句
                                                </button>
                                                <button
                                                    onClick={clearSelectionDraft}
                                                    className="px-2 py-1.5 rounded text-[11px] border border-phy-border text-phy-muted hover:text-phy-text transition-colors"
                                                >
                                                    取消选择
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-phy-muted">
                                            提示：在左侧原文或右侧题目区选中文字，然后点击标记按钮。
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={pushWordMarksToFlashcards}
                                            disabled={isMarkingBusy || wordMarks.length === 0}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/30 text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                                        >
                                            {isMarkingBusy ? <Loader2 size={13} className="animate-spin" /> : <BookMarked size={13} />}
                                            同步生词到闪卡库 ({wordMarks.length}个)
                                        </button>
                                        <button
                                            onClick={analyzeSentenceMarks}
                                            disabled={isMarkingBusy || sentenceMarks.length === 0}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-500/30 text-orange-600 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                                        >
                                            {isMarkingBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                            智能分析疑难句 ({sentenceMarks.length}句)
                                        </button>
                                        <button
                                            disabled={isAnalyzingVocab || !paper?.passage}
                                            onClick={handleAnalyzeVocab}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-purple-500/30 text-purple-600 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                                        >
                                            {isAnalyzingVocab ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                            自动分析文章生词
                                        </button>
                                        <button
                                            disabled={isAnalyzingGrammar || !paper?.passage}
                                            onClick={handleAnalyzeGrammar}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-pink-500/30 text-pink-600 bg-pink-500/10 hover:bg-pink-500/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                                        >
                                            {isAnalyzingGrammar ? <Loader2 size={13} className="animate-spin" /> : <Target size={13} />}
                                            分析文章语法与句式
                                        </button>
                                        <button
                                            onClick={clearAllMarks}
                                            disabled={!wordMarks.length && !sentenceMarks.length && !sentenceAnalysis}
                                            className="px-3 py-1.5 rounded-lg text-xs border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 disabled:opacity-50 inline-flex items-center gap-1.5"
                                        >
                                            <Trash2 size={13} />
                                            清除所有标记
                                        </button>
                                    </div>

                                    {(wordMarks.length > 0 || sentenceMarks.length > 0) && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <div className="rounded-lg border border-phy-border bg-phy-bg p-2.5 shadow-sm">
                                                <div className="text-[11px] font-bold text-amber-600 mb-2">已标记生词（高亮）</div>
                                                <div className="space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                                                    {wordMarks.map((m) => (
                                                        <div key={m.id} className="flex items-start gap-2 text-xs">
                                                            <button
                                                                onClick={() => jumpToMark(m)}
                                                                className="flex-1 text-left"
                                                            >
                                                                <div className="text-[10px] text-phy-muted">
                                                                    {(m.source || 'article') === 'question'
                                                                        ? `题目 ${m.questionLabel || ''}`
                                                                        : '文章原文'}
                                                                </div>
                                                                <div className="text-phy-text break-words">{m.text}</div>
                                                            </button>
                                                            <button
                                                                onClick={() => removeWordMark(m.id)}
                                                                className="text-phy-muted hover:text-rose-300"
                                                                title="移除生词标记"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="rounded-lg border border-phy-border bg-phy-bg p-2.5 shadow-sm">
                                                <div className="text-[11px] font-bold text-sky-600 mb-2">已标记疑难句（下划线）</div>
                                                <div className="space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                                                    {sentenceMarks.map((m) => (
                                                        <div key={m.id} className="flex items-start gap-2 text-xs">
                                                            <button
                                                                onClick={() => jumpToMark(m)}
                                                                className="flex-1 text-left"
                                                            >
                                                                <div className="text-[10px] text-phy-muted">
                                                                    {(m.source || 'article') === 'question'
                                                                        ? `题目 ${m.questionLabel || ''}`
                                                                        : '文章原文'}
                                                                </div>
                                                                <div className="text-phy-text break-words">{m.text}</div>
                                                            </button>
                                                            <button
                                                                onClick={() => removeSentenceMark(m.id)}
                                                                className="text-phy-muted hover:text-rose-300"
                                                                title="移除疑难句标记"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                            {strictCETActive ? (
                                <div className="rounded-xl border border-indigo-500/35 bg-indigo-500/10 p-3 shadow-sm">
                                    <div className="text-xs font-bold text-indigo-600 mb-1">四六级 Section B 段落匹配（严格模式）</div>
                                    <div className="text-[11px] text-phy-text leading-6">
                                        段落标签范围 A-L，对应题号 36-45。同一标签可多次使用。
                                    </div>
                                </div>
                            ) : null}

                            {paper.passage?.trim() ? (() => {
                                // Structure gutter color map (left-side thin bars only, no text color change)
                                const GUTTER_COLOR = {
                                    background: 'bg-slate-400',
                                    claim: 'bg-indigo-400',
                                    argument: 'bg-amber-400',
                                    evidence: 'bg-emerald-400',
                                    example: 'bg-teal-400',
                                    counterargument: 'bg-rose-400',
                                    transition: 'bg-purple-400',
                                    conclusion: 'bg-sky-400',
                                    other: 'bg-phy-muted',
                                };
                                const GUTTER_LABEL = {
                                    background: '背景', claim: '观点', argument: '论证',
                                    evidence: '证据', example: '例子', counterargument: '反驳',
                                    transition: '过渡', conclusion: '结论', other: '其他',
                                };

                                // For each paragraph, find which segment it belongs to
                                const getSegForPara = (idx1) =>
                                    manualStructure?.segments?.find(s => idx1 >= s.startParagraph && idx1 <= s.endParagraph) || null;

                                const handleAnalyzeStructure = async () => {
                                    if (isAnalyzingStructure) return;
                                    setIsAnalyzingStructure(true);
                                    try {
                                        const result = await analyzePassageStructure(paper.passage, settings);
                                        setManualStructure(result);
                                    } catch (e) {
                                        toast.error(`结构分析失败: ${e.message}`);
                                    } finally {
                                        setIsAnalyzingStructure(false);
                                    }
                                };

                                return (
                                    <div className="rounded-xl border border-phy-border bg-phy-bg p-3 shadow-sm">
                                        {/* Header row with manual trigger */}
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="text-[11px] text-indigo-600 font-bold">文章原文内容 (Passage)</div>
                                            <div className="flex items-center gap-2">
                                                {manualStructure && (
                                                    <div className="text-[10px] text-phy-muted max-w-[180px] truncate hidden md:block" title={manualStructure.overview}>
                                                        {manualStructure.overview}
                                                    </div>
                                                )}
                                                {manualStructure ? (
                                                    <button
                                                        onClick={() => setManualStructure(null)}
                                                        className="text-[10px] text-phy-muted hover:text-rose-600 px-1.5 py-0.5 rounded border border-phy-border font-medium"
                                                    >
                                                        隐藏结构
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={handleAnalyzeStructure}
                                                        disabled={isAnalyzingStructure}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-indigo-500/40 text-[10px] text-indigo-600 font-bold hover:bg-indigo-500/10 disabled:opacity-50"
                                                    >
                                                        {isAnalyzingStructure ? <Loader2 size={10} className="animate-spin" /> : '✧'}
                                                        {isAnalyzingStructure ? '分析中...' : '分析文章结构'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Article body: left gutter + text */}
                                        <div className="flex gap-2">
                                            {/* LEFT GUTTER: thin colored bars per paragraph, only when structure is ready */}
                                            {manualStructure?.segments?.length > 0 ? (
                                                <div className="flex flex-col gap-1 shrink-0 w-4 pt-0.5">
                                                    {articleParagraphs.map((para, idx) => {
                                                        const seg = getSegForPara(idx + 1);
                                                        const color = seg ? (GUTTER_COLOR[seg.type] || 'bg-phy-muted') : 'bg-phy-border/40';
                                                        const label = seg ? (seg.label || GUTTER_LABEL[seg.type] || '') : '';
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`rounded-full w-1 mx-auto opacity-75 ${color}`}
                                                                style={{ flex: Math.max(1, para.length), minHeight: 12 }}
                                                                title={label ? `第${idx + 1}段 · ${label}` : `第${idx + 1}段`}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                /* Placeholder gutter to keep layout stable */
                                                <div className="w-4 shrink-0" />
                                            )}

                                            {/* Article text 閳?untouched */}
                                            <div
                                                ref={articleMainRef}
                                                tabIndex={0}
                                                onMouseUp={captureSelection}
                                                onKeyUp={captureSelection}
                                                className={`flex-1 min-w-0 ${articleTextClass} text-phy-text whitespace-pre-wrap break-words outline-none`}
                                            >
                                                {annotatedPassageSegments.length ? annotatedPassageSegments.map((seg, idx) => (
                                                    <span
                                                        key={`${seg.start}-${seg.end}-${idx}`}
                                                        className={[
                                                            seg.isWord ? 'bg-amber-400/25 rounded-[2px] px-[1px]' : '',
                                                            seg.isSentence ? 'underline decoration-sky-400/80 decoration-2 underline-offset-[3px]' : ''
                                                        ].join(' ').trim()}
                                                    >
                                                        {seg.text}
                                                    </span>
                                                )) : paper.passage}
                                            </div>
                                        </div>

                                        {/* Structure legend shown below the text when active */}
                                        {manualStructure?.segments?.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-phy-border pt-2">
                                                {manualStructure.segments.map((seg) => (
                                                    <span
                                                        key={seg.id}
                                                        className="inline-flex items-center gap-1 text-[10px] text-phy-muted"
                                                        title={seg.summary}
                                                    >
                                                        <span className={`w-2 h-2 rounded-full shrink-0 ${GUTTER_COLOR[seg.type] || 'bg-phy-muted'}`} />
                                                        <span className="font-semibold">{seg.label || GUTTER_LABEL[seg.type]}</span>
                                                        <span className="opacity-60">
                                                            第{seg.startParagraph}{seg.startParagraph !== seg.endParagraph ? `-${seg.endParagraph}` : ''}段
                                                        </span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })() : null}


                            {articleParagraphs.length > 1 ? (
                                <details className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                    <summary className="cursor-pointer text-xs font-bold text-phy-muted">展开分段详情视图 (Paragraph View)</summary>
                                    <div className="mt-3 space-y-2">
                                        {articleParagraphs.map((text, idx) => (
                                            <div key={`p-${idx}`} className="rounded-lg border border-phy-border bg-phy-bg p-2.5 shadow-sm">
                                                <div className="text-[11px] text-indigo-600 font-bold mb-1">第 {idx + 1} 段 (Paragraph)</div>
                                                <p className={`${articleTextClass} text-phy-text whitespace-pre-wrap break-words`}>{text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}

                            {paper.matching?.paragraphs?.length ? (
                                <details className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                    <summary className="cursor-pointer text-xs font-bold text-phy-muted">展开段落匹配标签 (Matching Labels A-L)</summary>
                                    <div className="mt-3 space-y-2">
                                        {paper.matching.paragraphs.map((p, idx) => (
                                            <div key={`match-${idx}`} className="rounded-lg border border-phy-border bg-phy-bg p-2.5 shadow-sm">
                                                <div className="text-[11px] text-indigo-600 font-bold mb-1">段落标签 {p.label} (Label)</div>
                                                <p className={`${articleTextClass} text-phy-text whitespace-pre-wrap break-words`}>{p.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}

                            {!paper.passage?.trim() && <div className="text-sm text-phy-muted">未检测到文章有效内容。</div>}

                            {vocabAnalysis && (
                                <div className="rounded-xl border border-purple-500/40 bg-[#160E22] p-5 shadow-sm mt-6 mb-2">
                                    <div className="text-sm font-bold text-purple-400 mb-4 flex items-center gap-2">
                                        <Sparkles size={16} /> AI 文章核心生词提炼
                                    </div>
                                    <div className="custom-markdown markdown-prose text-[13px] text-phy-text leading-relaxed">
                                        <ReactMarkdown>{vocabAnalysis}</ReactMarkdown>
                                    </div>
                                </div>
                            )}

                            {grammarAnalysis && (
                                <div className="rounded-xl border border-pink-500/40 bg-[#220E15] p-5 shadow-sm mt-6 mb-2">
                                    <div className="text-sm font-bold text-pink-400 mb-4 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Target size={16} /> AI 语法与长难句剖析
                                        </div>
                                        <button
                                            onClick={() => handleSaveAnalysisToNotes('疑难句分析', '语法与长难句剖析', grammarAnalysis)}
                                            className="px-2 py-1 rounded border border-pink-500/40 text-[11px] text-pink-400 hover:bg-pink-500/20 flex items-center gap-1 transition-colors"
                                        >
                                            <Save size={12} />
                                            保存至笔记本
                                        </button>
                                    </div>
                                    <div className="custom-markdown markdown-prose text-[13px] text-phy-text leading-relaxed">
                                        <ReactMarkdown>{grammarAnalysis}</ReactMarkdown>
                                    </div>
                                </div>
                            )}

                            {sentenceAnalysis && (
                                <div className="rounded-xl border border-orange-500/40 bg-[#1E110A] p-5 shadow-sm mt-6 mb-2">
                                    <div className="text-sm font-bold text-orange-500 mb-4 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Sparkles size={16} /> AI 疑难句深度分析
                                        </div>
                                        <button
                                            onClick={() => handleSaveAnalysisToNotes('疑难句分析', '疑难句深度分析', sentenceAnalysis)}
                                            className="px-2 py-1 rounded border border-orange-500/40 text-[11px] text-orange-500 hover:bg-orange-500/20 flex items-center gap-1 transition-colors"
                                        >
                                            <Save size={12} />
                                            保存至笔记本
                                        </button>
                                    </div>
                                    <div className="custom-markdown markdown-prose text-[13px] text-phy-text leading-relaxed">
                                        <ReactMarkdown>{sentenceAnalysis}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    <section
                        ref={questionPanelRef}
                        onMouseUp={captureQuestionSelection}
                        className={`space-y-4 min-h-0 overflow-y-auto custom-scrollbar pr-1 ${!isReadOnly && mobilePane === 'questions' ? 'block' : 'hidden'} ${isReadOnly ? '' : 'xl:block'}`}
                    >
                        {!strictCETActive && (paper.questions || []).map((q, qIdx) => {
                            const key = `mcq-${q.id}`;
                            const selected = answers[key] || '';
                            const isRight = submitted && toAnswer(selected) === toAnswer(q.answer);

                            return (
                                <article
                                    key={key}
                                    ref={(el) => {
                                        if (el) questionRefs.current[key] = el;
                                    }}
                                    data-question-key={key}
                                    data-question-label={`Q${qIdx + 1}`}
                                    className="rounded-2xl border border-phy-border bg-phy-glass p-4"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1 text-sm font-bold text-phy-text break-words">
                                            {qIdx + 1}. {q.question || q.text}
                                        </div>
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
                                                    <div className="text-sm text-phy-text leading-6">{formatOption(optIdx, opt)}</div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {submitted && (
                                        <div className="mt-3 rounded-lg border border-phy-border bg-phy-bg p-3 text-xs space-y-1 shadow-sm">
                                            <div className="text-phy-text">
                                                正确答案：<span className="font-bold">{q.answer}</span> | 你的答案：
                                                <span className="font-bold text-indigo-600">{selected || '未作答'}</span>
                                            </div>
                                            {q.explanation ? <div className="text-phy-muted">解析：{q.explanation}</div> : null}
                                            {q.evidence_sentence ? <div className="text-indigo-600 font-medium">证据句：{q.evidence_sentence}</div> : null}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => openDebate({ ...q, key, type: 'mcq' })}
                                        className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-500/30 text-orange-600 bg-orange-500/10 hover:bg-orange-500/20 flex items-center gap-1.5 shadow-sm"
                                    >
                                        <MessageSquare size={14} />
                                        进入证据反驳
                                    </button>
                                    {renderDebatePanel(key)}
                                </article>
                            );
                        })}

                        {(paper.matching?.statements || []).length > 0 && (
                            <article className="rounded-2xl border border-phy-border bg-phy-glass p-4">
                                <h4 className="font-bold text-phy-text text-sm mb-3">
                                    {strictCETActive ? '段落匹配（标准四/六级 Section B）' : '段落匹配（通用模式）'}
                                </h4>
                                <div className="space-y-3">
                                    {paper.matching.statements.map((s, idx) => {
                                        const key = `match-${s.id}`;
                                        const selected = answers[key] || '';
                                        const isRight = submitted && toAnswer(selected) === toAnswer(s.answer);
                                        const statementNo = strictCETActive ? (Number(s.id) || (36 + idx)) : (idx + 1);
                                        return (
                                            <div
                                                key={key}
                                                ref={(el) => {
                                                    if (el) questionRefs.current[key] = el;
                                                    else delete questionRefs.current[key];
                                                }}
                                                data-question-key={key}
                                                data-question-label={`M${statementNo}`}
                                                className={`rounded-xl border p-3 ${submitted && isRight ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-phy-border bg-phy-glass'}`}
                                            >
                                                <div className="text-sm text-phy-text leading-6">{statementNo}. {s.text || s.question || s.statement}</div>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <label className="text-xs text-phy-muted">选择段落</label>
                                                    <select
                                                        value={selected}
                                                        disabled={submitted}
                                                        onChange={(e) => setAnswers((prev) => ({ ...prev, [key]: e.target.value }))}
                                                        className="bg-phy-bg border border-phy-border rounded-lg px-2 py-1.5 text-sm text-phy-text"
                                                    >
                                                        <option value="">未选择</option>
                                                        {(strictCETActive ? matchingOptions : paragraphPool).map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
                                                    </select>
                                                    {submitted ? (
                                                        <span className={`text-xs font-bold ${isRight ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                            正确答案：{s.answer}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {submitted && (
                                                    <div className="mt-2 text-xs space-y-1">
                                                        {s.explanation ? <div className="text-phy-muted">解析：{s.explanation}</div> : null}
                                                        {s.evidence_sentence ? <div className="text-indigo-300">证据句：{s.evidence_sentence}</div> : null}
                                                    </div>
                                                )}
                                                <button
                                                    onClick={() => openDebate({ ...s, key, type: 'matching', question: s.text })}
                                                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-500/30 text-orange-600 bg-orange-500/10 hover:bg-orange-500/20 flex items-center gap-1.5 shadow-sm"
                                                >
                                                    <MessageSquare size={14} />
                                                    进入证据反驳
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
        </div>
    );
};

export default ExamView;
