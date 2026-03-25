
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { analyzeImagesForChat, debateReadingEvidence, generateAdversarialReadingDrill, sendChat } from '../services/ai';
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
const MODE_OPTIONS = [
    { value: 'mixed', label: '混合模式（阅读+段落匹配）' },
    { value: 'reading', label: '仅阅读理解（选择题）' },
    { value: 'matching', label: '仅段落匹配（四六级常见）' },
    { value: 'cet_strict_matching', label: '严格四六级段落匹配（Section B）' }
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
            question: `Q${idx + 1}. ${q.question || ''}`,
            userAnswer: userAnswer || '未作答',
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
            question: `M${idx + 1}. ${s.text || ''}`,
            userAnswer: userAnswer || '未作答',
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
    const [articleFontLevel, setArticleFontLevel] = useState(1); // 0 small, 1 default, 2 large
    const [mobilePane, setMobilePane] = useState('questions'); // questions | article
    const [examHistory, setExamHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [historyId, setHistoryId] = useState(null);
    const [wordMarks, setWordMarks] = useState([]);
    const [sentenceMarks, setSentenceMarks] = useState([]);
    const [selectionDraft, setSelectionDraft] = useState(null);
    const [isMarkingBusy, setIsMarkingBusy] = useState(false);
    const [sentenceAnalysis, setSentenceAnalysis] = useState('');
    const articleMainRef = useRef(null);
    const strictSetupMode = isStrictCETMode(setup.mode);
    const strictPaperMode = isStrictCETMode(paper?.mode);
    const strictCETActive = strictSetupMode || strictPaperMode;

    useEffect(() => {
        const mode = canvasMode === 'expanded' ? 'expanded' : 'classic';
        localStorage.setItem('exam_canvas_mode', mode);
        window.dispatchEvent(new CustomEvent('exam-canvas-mode-change', { detail: { mode } }));
    }, [canvasMode]);

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
            setWordMarks(Array.isArray(parsed.wordMarks) ? parsed.wordMarks : []);
            setSentenceMarks(Array.isArray(parsed.sentenceMarks) ? parsed.sentenceMarks : []);
            setSentenceAnalysis(String(parsed.sentenceAnalysis || ''));
            toast.success('已恢复上次阅读训练进度', { id: 'exam_restore_v2' });
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
                ? '请提取图片中的题目文本，保留题号、选项和段落匹配结构，输出纯文本。'
                : '请提取图片中的阅读原文内容，尽量保留段落分行，输出纯文本。';
            const extracted = await analyzeImagesForChat(dataUrls, settings, instruction);
            if (!extracted?.trim()) throw new Error('图片中未识别到有效文本');
            setSetup((prev) => ({ ...prev, [targetField]: `${(prev[targetField] || '').trim()}\n\n${extracted.trim()}`.trim() }));
            toast.success(`已从图片提取文本并追加到${targetField === 'questionText' ? '题目区' : '原文区'}`);
        } catch (e) {
            toast.error(`图片识别失败: ${e.message}`);
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
        if (!setup.passage.trim()) return toast.error('请先输入或上传文章');
        if (setup.sourceType === 'import' && !setup.questionText.trim()) return toast.error('请先导入你的题目内容');
        setIsGenerating(true);
        try {
            toast.loading('正在生成对抗式阅读训练...', { id: 'exam_build_v2' });
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
            setMobilePane('questions');
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
        if (!window.confirm('确定清空当前训练并重新开始吗？')) return;
        localStorage.removeItem(STORAGE_KEY);
        setPaper(null);
        setAnswers({});
        setSubmitted(false);
        setScore({ total: 0, correct: 0, accuracy: 0 });
        setDebateTarget(null);
        setDebateMessages([]);
        setDebateInput('');
        setMobilePane('questions');
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
                toast('历史记录存储空间不足，已自动保存简版');
            } catch (e2) {
                finalList = compact.slice(0, 8);
                localStorage.setItem(HISTORY_KEY, JSON.stringify(finalList));
                toast('历史记录空间紧张，仅保留最近8条');
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
        if (!window.confirm('确定清空阅读题历史记录吗？')) return;
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
        toast.success(`已交卷：${result.correct}/${result.total}，正确率 ${result.accuracy}%`);
    };

    const restoreFromHistory = (record, retry = false) => {
        if (!record) return;
        if (!record.paperSnapshot) {
            toast.error('该历史记录来自旧版本，暂不支持恢复原卷');
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
        setMobilePane('questions');
        setWordMarks([]);
        setSentenceMarks([]);
        setSelectionDraft(null);
        setSentenceAnalysis('');
        setShowHistory(false);
        toast.success(retry ? '已载入历史试卷，可重新作答' : '已回到历史作答界面');
    };

    const openDebate = (target) => {
        setDebateTarget(target);
        setDebateMessages([{
            role: 'assistant',
            content: '我会扮演严格考官。请先说你的答案，并给出你引用的证据句。若证据不足，我会继续反驳你。'
        }]);
        setDebateInput('');
    };

    const sendDebate = async () => {
        if (!debateTarget) return;
        const userContent = debateInput.trim();
        if (!userContent) return;

        const selected = answers[debateTarget.key] || '未作答';
        const userMessage = `我的作答是 ${selected}。\n我的论证：${userContent}`;
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
                res.required_evidence ? `证据要求：${res.required_evidence}` : '',
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
                context: getContextSlice(source, start, end)
            });
        } catch (e) {
            console.error('Selection capture failed:', e);
        }
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
        if (!selectionDraft?.text) return toast.error('请先在左侧文章中选中文本');
        const mark = {
            id: crypto.randomUUID(),
            text: selectionDraft.text,
            start: selectionDraft.start,
            end: selectionDraft.end,
            context: selectionDraft.context || '',
            createdAt: Date.now()
        };
        if (type === 'word') {
            const exists = wordMarks.some((m) => m.start === mark.start && m.end === mark.end);
            if (exists) return toast('该生词标记已存在');
            setWordMarks((prev) => [mark, ...prev].slice(0, 120));
            toast.success('已添加生词高亮');
        } else {
            const exists = sentenceMarks.some((m) => m.start === mark.start && m.end === mark.end);
            if (exists) return toast('该疑难句标记已存在');
            setSentenceMarks((prev) => [mark, ...prev].slice(0, 120));
            toast.success('已添加疑难句下划线');
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
                await addFlashcard({
                    id: crypto.randomUUID(),
                    front: word,
                    back: `来源：阅读理解标记\n建议：回顾原文上下文后再强化记忆`,
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
        if (!sentenceMarks.length) return toast.error('请先标记疑难句');
        setIsMarkingBusy(true);
        try {
            const payload = sentenceMarks.slice(0, 10).map((m, idx) => (
                `${idx + 1}. 句子：${m.text}\n上下文：${m.context || '无'}`
            )).join('\n\n');
            const prompt = `你是阅读理解教练。请用中文分析以下疑难句：
1) 每句给出语法拆解（主干/从句/修饰）
2) 解释为什么容易误解
3) 给出做题时如何快速定位证据
4) 提供简短改写或翻译
请按“句子1/句子2...”分段输出。\n\n${payload}`;
            const result = await sendChat([
                { role: 'system', content: '你是严格但清晰的英语阅读教练，输出简洁、结构化中文。' },
                { role: 'user', content: prompt }
            ], settings, false);
            const content = String(result || '').trim();
            setSentenceAnalysis(content);
            if (content) {
                addChatMessage('assistant', `【疑难句分析】\n${content}`);
                if (!isChatOpen) toggleChat();
            }
            toast.success('疑难句分析完成');
        } catch (e) {
            toast.error(`分析失败: ${e.message}`);
        } finally {
            setIsMarkingBusy(false);
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
                    <div className="text-xs font-bold text-orange-200">证据反驳 · 当前题目 {debateTarget.key}</div>
                    <button
                        onClick={() => {
                            setDebateTarget(null);
                            setDebateMessages([]);
                            setDebateInput('');
                        }}
                        className="text-[11px] px-2 py-1 rounded border border-orange-300/30 text-orange-200 hover:bg-orange-500/10"
                    >
                        关闭
                    </button>
                </div>
                <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-2 border border-orange-400/20 rounded-lg p-2.5 bg-phy-bg">
                    {debateMessages.map((m, idx) => (
                        <div key={idx} className={`text-xs rounded-lg px-2.5 py-2 leading-6 whitespace-pre-wrap break-words ${m.role === 'assistant' ? 'bg-orange-500/10 text-orange-100 border border-orange-400/20' : 'bg-indigo-500/10 text-indigo-100 border border-indigo-400/20'}`}>
                            <span className="text-[10px] opacity-80 mr-2">{m.role === 'assistant' ? 'AI考官' : '我'}</span>
                            {m.content}
                        </div>
                    ))}
                </div>
                <textarea
                    rows={3}
                    value={debateInput}
                    onChange={(e) => setDebateInput(e.target.value)}
                    placeholder="输入你的论证：为什么你的答案更合理，并给出证据句。"
                    className="w-full bg-phy-bg border border-phy-border rounded-lg p-2.5 text-xs md:text-sm text-phy-text outline-none resize-none"
                />
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setDebateInput((prev) => prev || '我的答案是 ，我引用的证据句是：“”。')}
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
                        让AI反驳我
                    </button>
                </div>
            </div>
        );
    };

    const saveResultToNotes = async () => {
        if (!paper) return;
        const lines = [];
        lines.push(`# 阅读理解对抗训练：${paper.title || '未命名'}`);
        lines.push(`- 时间：${new Date().toLocaleString()}`);
        lines.push(`- 模式：${setup.mode}`);
        if (submitted) lines.push(`- 成绩：${score.correct}/${score.total}（${score.accuracy}%）`);
        lines.push('\n## 原文');
        lines.push(paper.passage || '');

        if (paper.questions?.length) {
            lines.push('\n## 阅读选择题');
            paper.questions.forEach((q, idx) => {
                const key = `mcq-${q.id}`;
                lines.push(`\n### Q${idx + 1}. ${q.question}`);
                q.options?.forEach((opt, optIdx) => lines.push(`- ${formatOption(optIdx, opt)}`));
                lines.push(`- 我的答案：${answers[key] || '未作答'}`);
                lines.push(`- 正确答案：${q.answer}`);
                if (q.explanation) lines.push(`- 解析：${q.explanation}`);
                if (q.evidence_sentence) lines.push(`- 证据句：${q.evidence_sentence}`);
            });
        }

        if (paper.matching?.statements?.length) {
            lines.push('\n## 段落匹配');
            paper.matching.statements.forEach((s, idx) => {
                const key = `match-${s.id}`;
                lines.push(`\n### M${idx + 1}. ${s.text}`);
                lines.push(`- 我的答案：${answers[key] || '未作答'}`);
                lines.push(`- 正确答案：${s.answer}`);
                if (s.explanation) lines.push(`- 解析：${s.explanation}`);
                if (s.evidence_sentence) lines.push(`- 证据句：${s.evidence_sentence}`);
            });
        }

        if (debateMessages.length) {
            lines.push('\n## 证据反驳记录');
            debateMessages.forEach((m) => {
                lines.push(`- ${m.role === 'assistant' ? 'AI考官' : '我'}：${m.content}`);
            });
        }
        if (wordMarks.length) {
            lines.push('\n## 生词标记');
            wordMarks.forEach((m, idx) => {
                lines.push(`- ${idx + 1}. ${m.text}${m.context ? `（上下文：${m.context}）` : ''}`);
            });
        }
        if (sentenceMarks.length) {
            lines.push('\n## 疑难句标记');
            sentenceMarks.forEach((m, idx) => {
                lines.push(`- ${idx + 1}. ${m.text}${m.context ? `（上下文：${m.context}）` : ''}`);
            });
        }
        if (sentenceAnalysis) {
            lines.push('\n## 疑难句AI分析');
            lines.push(sentenceAnalysis);
        }

        await saveNote({
            id: crypto.randomUUID(),
            title: `阅读对抗训练 - ${new Date().toLocaleDateString()}`,
            content: lines.join('\n'),
            updatedAt: Date.now()
        });
        toast.success('已保存到笔记本');
    };

    const HistoryModal = showHistory ? (
        <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm p-3 md:p-6">
            <div className="h-full max-w-6xl mx-auto bg-phy-glassHeavy border border-phy-border rounded-2xl overflow-hidden flex flex-col">
                <div className="shrink-0 px-4 py-3 border-b border-phy-border flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-sm md:text-base font-black text-phy-text flex items-center gap-2">
                            <History size={16} className="text-indigo-300" />
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
                            <div className="text-xs text-phy-muted p-3">暂无历史记录。先完成一次交卷后会自动记录。</div>
                        ) : examHistory.map((r) => (
                            <button
                                key={r.id}
                                onClick={() => setHistoryId(r.id)}
                                className={`w-full text-left rounded-xl border p-3 mb-2 transition ${selectedHistory?.id === r.id ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-phy-border bg-phy-glass hover:bg-phy-bg'}`}
                            >
                                <div className="text-xs text-phy-muted">{new Date(r.createdAt).toLocaleString()}</div>
                                <div className="text-sm font-bold text-phy-text line-clamp-2 mt-0.5">{r.title}</div>
                                <div className="text-xs mt-1 text-phy-muted">
                                    {(r.result?.correct ?? 0)}/{(r.result?.total ?? 0)} · {(r.result?.accuracy ?? 0)}% · {r.mode}
                                </div>
                            </button>
                        ))}
                    </aside>

                    <section className="overflow-y-auto custom-scrollbar p-4">
                        {!selectedHistory ? (
                            <div className="text-sm text-phy-muted">请选择一条历史记录。</div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-xl border border-phy-border bg-phy-glass p-4">
                                    <div className="text-xs text-phy-muted">{new Date(selectedHistory.createdAt).toLocaleString()}</div>
                                    <h4 className="text-base font-black text-phy-text mt-1">{selectedHistory.title}</h4>
                                    <div className="text-sm text-phy-muted mt-1">
                                        得分 {selectedHistory.result.correct}/{selectedHistory.result.total}（{selectedHistory.result.accuracy}%）
                                        · 模式 {selectedHistory.mode}
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
                                            重新练习这套题
                                        </button>
                                    </div>
                                    {!canRestoreSelectedHistory ? (
                                        <div className="mt-2 text-[11px] text-amber-300">该条为旧版历史，仅支持错题回顾，无法恢复完整题卷。</div>
                                    ) : null}
                                    {selectedHistory.passagePreview ? (
                                        <details className="mt-3">
                                            <summary className="cursor-pointer text-xs font-bold text-phy-muted">查看原文片段</summary>
                                            <p className="mt-2 text-xs text-phy-text whitespace-pre-wrap break-words leading-6">{selectedHistory.passagePreview}</p>
                                        </details>
                                    ) : null}
                                </div>

                                <div className="rounded-xl border border-phy-border bg-phy-glass p-4">
                                    <div className="flex items-center justify-between">
                                        <h5 className="text-sm font-bold text-phy-text">错题回顾</h5>
                                        <span className="text-xs text-phy-muted">
                                            错题 {(selectedHistoryRows.filter((x) => !x.isCorrect).length)} / 总题 {selectedHistoryRows.length}
                                        </span>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {selectedHistoryRows.length === 0 ? (
                                            <div className="text-xs text-phy-muted">该记录无题目数据。</div>
                                        ) : selectedHistoryRows.filter((x) => !x.isCorrect).length === 0 ? (
                                            <div className="text-xs text-emerald-300">这次全对，表现很好。</div>
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
                                        删除本条记录
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
                            <ShieldAlert className="text-orange-400" size={24} />
                            考试模拟 · 阅读理解对抗模式
                        </h2>
                        <p className="text-sm text-phy-muted mt-2 leading-relaxed">
                            AI 不只出题，还会反驳你的答案，逼你用原文证据来证明。支持导入文章自动出题，也支持你导入现成题目（阅读选择/四六级段落匹配）。
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => setCanvasMode('classic')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 ${canvasMode === 'classic' ? 'bg-indigo-600 text-white border-indigo-500' : 'border-phy-border text-phy-text hover:bg-phy-bg'}`}
                            >
                                <Minimize2 size={13} />
                                原版布局
                            </button>
                            <button
                                onClick={() => setCanvasMode('expanded')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 ${canvasMode === 'expanded' ? 'bg-indigo-600 text-white border-indigo-500' : 'border-phy-border text-phy-text hover:bg-phy-bg'}`}
                            >
                                <Maximize2 size={13} />
                                填充拉大版
                            </button>
                            <button
                                onClick={() => setShowHistory(true)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-phy-border text-phy-text hover:bg-phy-bg inline-flex items-center gap-1.5"
                            >
                                <History size={14} />
                                历史回顾（{examHistory.length}）
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
                                placeholder="题目数"
                            />
                        </div>
                        {strictSetupMode ? (
                            <div className="mt-2 text-xs text-amber-300">严格模式固定为 CET Section B：10 题段落匹配，题号 36-45，段落标签 A-L。</div>
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
                                placeholder="粘贴阅读文章原文（可为四六级真题段落）"
                                className="w-full mt-2 bg-phy-bg border border-phy-border rounded-xl p-3 text-sm text-phy-text resize-y outline-none"
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-phy-muted">
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <Upload size={14} />
                                    上传 PDF/TXT 到原文
                                    <input type="file" accept=".pdf,.txt" className="hidden" onChange={handleUploadPassage} />
                                </label>
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <Upload size={14} />
                                    上传图片识别到原文
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
                                <label className="text-sm font-bold text-phy-text">自定义题目（支持粘贴原始试题文本）</label>
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
                                    placeholder="粘贴你的题目内容：可为阅读选择题、段落匹配题、或两者混合。"
                                    className="w-full mt-2 bg-phy-bg border border-phy-border rounded-xl p-3 text-sm text-phy-text resize-y outline-none"
                                />
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-phy-muted">
                                    <label className="inline-flex items-center gap-2 cursor-pointer">
                                        <Upload size={14} />
                                        上传题目文件到题库输入框
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
                                    <span className="opacity-70">支持直接粘贴截图</span>
                                </div>
                                <details className="mt-3 text-xs text-phy-muted bg-phy-glass rounded-lg border border-phy-border p-3">
                                    <summary className="cursor-pointer font-semibold">可选：推荐导入格式示例</summary>
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
            <div className="shrink-0 border-b border-phy-border bg-phy-glass px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs text-phy-muted uppercase tracking-wide">Exam Arena</div>
                    <h2 className="font-black text-phy-text truncate">{paper.title || '阅读对抗训练'}</h2>
                    <div className="text-xs text-phy-muted mt-1">
                        已作答 {answeredCount}/{totalCount} {submitted ? `· 正确率 ${score.accuracy}%` : ''}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="hidden md:flex items-center rounded-lg border border-phy-border bg-phy-bg overflow-hidden mr-1">
                        <button
                            onClick={() => setCanvasMode('classic')}
                            className={`px-2.5 py-2 text-[11px] font-bold border-r border-phy-border flex items-center gap-1.5 ${canvasMode === 'classic' ? 'bg-indigo-600 text-white' : 'text-phy-muted hover:text-phy-text hover:bg-phy-glass'}`}
                            title="原版布局"
                        >
                            <Minimize2 size={12} />
                            原版
                        </button>
                        <button
                            onClick={() => setCanvasMode('expanded')}
                            className={`px-2.5 py-2 text-[11px] font-bold flex items-center gap-1.5 ${canvasMode === 'expanded' ? 'bg-indigo-600 text-white' : 'text-phy-muted hover:text-phy-text hover:bg-phy-glass'}`}
                            title="填充拉大版"
                        >
                            <Maximize2 size={12} />
                            拉大
                        </button>
                    </div>
                    <button
                        onClick={() => setShowHistory(true)}
                        className="px-3 py-2 rounded-lg text-xs md:text-sm font-bold border border-phy-border text-phy-text hover:bg-phy-bg flex items-center gap-1.5"
                    >
                        <History size={14} />
                        历史回顾（{examHistory.length}）
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
                        重开训练
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

            <div className="xl:hidden shrink-0 px-3 pt-3">
                <div className="inline-flex w-full rounded-xl border border-phy-border bg-phy-glass p-1">
                    <button
                        onClick={() => setMobilePane('questions')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${mobilePane === 'questions' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                    >
                        做题区
                    </button>
                    <button
                        onClick={() => setMobilePane('article')}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${mobilePane === 'article' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}
                    >
                        原文区
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 p-3 md:p-5">
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)] gap-4 h-full min-h-0">
                    <section className={`rounded-2xl border border-phy-border bg-phy-glass overflow-hidden min-h-0 ${mobilePane === 'article' ? 'block' : 'hidden'} xl:flex xl:flex-col`}>
                        <div className="px-4 py-3 border-b border-phy-border bg-phy-bg flex items-center gap-2">
                            <FileText size={16} className="text-indigo-400" />
                            <h3 className="font-bold text-phy-text text-sm flex-1">原文与段落</h3>
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
                                        <BookMarked size={14} className="text-amber-300" />
                                        阅读标记
                                    </span>
                                    <span className="text-[11px] text-phy-muted">选中文章文本后可标记生词或疑难句</span>
                                </div>

                                {selectionDraft ? (
                                    <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 p-2.5">
                                        <div className="text-[11px] text-indigo-200 mb-1">当前选中</div>
                                        <div className="text-xs text-phy-text leading-6 break-words">{selectionDraft.text}</div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <button
                                                onClick={() => addSelectionMark('word')}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-amber-400/40 text-amber-100 bg-amber-500/15 hover:bg-amber-500/25 inline-flex items-center gap-1.5"
                                            >
                                                <Highlighter size={13} />
                                                标记为生词
                                            </button>
                                            <button
                                                onClick={() => addSelectionMark('sentence')}
                                                className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-sky-400/40 text-sky-100 bg-sky-500/15 hover:bg-sky-500/25 inline-flex items-center gap-1.5"
                                            >
                                                <Underline size={13} />
                                                标记为疑难句
                                            </button>
                                            <button
                                                onClick={clearSelectionDraft}
                                                className="px-2.5 py-1.5 rounded-lg text-xs border border-phy-border text-phy-muted hover:text-phy-text"
                                            >
                                                取消选中
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[11px] text-phy-muted">提示：拖动鼠标选中左侧原文中的文字后，会出现标记按钮。</div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={pushWordMarksToFlashcards}
                                        disabled={isMarkingBusy || wordMarks.length === 0}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-400/30 text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                                    >
                                        {isMarkingBusy ? <Loader2 size={13} className="animate-spin" /> : <BookMarked size={13} />}
                                        生词加入闪卡（{wordMarks.length}）
                                    </button>
                                    <button
                                        onClick={analyzeSentenceMarks}
                                        disabled={isMarkingBusy || sentenceMarks.length === 0}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-400/30 text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50 inline-flex items-center gap-1.5"
                                    >
                                        {isMarkingBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                        AI分析疑难句（{sentenceMarks.length}）
                                    </button>
                                    <button
                                        onClick={clearAllMarks}
                                        disabled={!wordMarks.length && !sentenceMarks.length && !sentenceAnalysis}
                                        className="px-3 py-1.5 rounded-lg text-xs border border-rose-400/30 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50 inline-flex items-center gap-1.5"
                                    >
                                        <Trash2 size={13} />
                                        清空标记
                                    </button>
                                </div>

                                {(wordMarks.length > 0 || sentenceMarks.length > 0) && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <div className="rounded-lg border border-phy-border bg-phy-bg p-2.5">
                                            <div className="text-[11px] font-bold text-amber-200 mb-2">生词（高亮）</div>
                                            <div className="space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                                                {wordMarks.map((m) => (
                                                    <div key={m.id} className="flex items-start gap-2 text-xs">
                                                        <span className="flex-1 text-phy-text break-words">{m.text}</span>
                                                        <button
                                                            onClick={() => removeWordMark(m.id)}
                                                            className="text-phy-muted hover:text-rose-300"
                                                            title="删除"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-phy-border bg-phy-bg p-2.5">
                                            <div className="text-[11px] font-bold text-sky-200 mb-2">疑难句（下划线）</div>
                                            <div className="space-y-1.5 max-h-28 overflow-y-auto custom-scrollbar pr-1">
                                                {sentenceMarks.map((m) => (
                                                    <div key={m.id} className="flex items-start gap-2 text-xs">
                                                        <span className="flex-1 text-phy-text break-words">{m.text}</span>
                                                        <button
                                                            onClick={() => removeSentenceMark(m.id)}
                                                            className="text-phy-muted hover:text-rose-300"
                                                            title="删除"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {sentenceAnalysis ? (
                                    <div className="rounded-lg border border-orange-400/30 bg-orange-500/10 p-3">
                                        <div className="text-xs font-bold text-orange-200 mb-1.5">AI 疑难句分析</div>
                                        <div className="text-xs text-phy-text whitespace-pre-wrap break-words leading-6">{sentenceAnalysis}</div>
                                    </div>
                                ) : null}
                            </div>
                            {strictCETActive ? (
                                <div className="rounded-xl border border-indigo-400/35 bg-indigo-500/10 p-3">
                                    <div className="text-xs font-bold text-indigo-200 mb-1">Section B · 严格模式说明</div>
                                    <div className="text-[11px] text-phy-text leading-6">
                                        阅读段落 A-L，完成 36-45 题；每题选择对应段落，段落可重复使用。
                                    </div>
                                </div>
                            ) : null}

                            {paper.passage?.trim() ? (
                                <div className="rounded-xl border border-phy-border bg-phy-bg p-3">
                                    <div className="text-[11px] text-indigo-300 font-bold mb-1">全文</div>
                                    <div
                                        ref={articleMainRef}
                                        tabIndex={0}
                                        onMouseUp={captureSelection}
                                        onKeyUp={captureSelection}
                                        className={`${articleTextClass} text-phy-text whitespace-pre-wrap break-words outline-none`}
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
                            ) : null}

                            {articleParagraphs.length > 1 ? (
                                <details className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                    <summary className="cursor-pointer text-xs font-bold text-phy-muted">展开分段阅读</summary>
                                    <div className="mt-3 space-y-2">
                                        {articleParagraphs.map((text, idx) => (
                                            <div key={`article-${idx}`} className="rounded-lg border border-phy-border bg-phy-bg p-2.5">
                                                <div className="text-[11px] text-indigo-300 font-bold mb-1">正文段 {idx + 1}</div>
                                                <p className={`${articleTextClass} text-phy-text whitespace-pre-wrap break-words`}>{text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}

                            {paper.matching?.paragraphs?.length ? (
                                <details className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                    <summary className="cursor-pointer text-xs font-bold text-phy-muted">展开段落匹配标签（A/B/C...）</summary>
                                    <div className="mt-3 space-y-2">
                                        {paper.matching.paragraphs.map((p, idx) => (
                                            <div key={`match-${idx}`} className="rounded-lg border border-phy-border bg-phy-bg p-2.5">
                                                <div className="text-[11px] text-indigo-300 font-bold mb-1">段落 {p.label}</div>
                                                <p className={`${articleTextClass} text-phy-text whitespace-pre-wrap break-words`}>{p.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}

                            {!paper.passage?.trim() && <div className="text-sm text-phy-muted">未检测到原文内容。</div>}
                        </div>
                    </section>

                    <section className={`space-y-4 min-h-0 overflow-y-auto custom-scrollbar pr-1 ${mobilePane === 'questions' ? 'block' : 'hidden'} xl:block`}>
                        {!strictCETActive && (paper.questions || []).map((q, qIdx) => {
                            const key = `mcq-${q.id}`;
                            const selected = answers[key] || '';
                            const isRight = submitted && toAnswer(selected) === toAnswer(q.answer);
                            return (
                                <article key={key} className="rounded-2xl border border-phy-border bg-phy-glass p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <h4 className="font-bold text-phy-text text-sm leading-6">Q{qIdx + 1}. {q.question}</h4>
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
                                        <div className="mt-3 rounded-lg border border-phy-border bg-phy-bg p-3 text-xs space-y-1">
                                            <div className="text-phy-text">正确答案：<span className="font-bold">{q.answer}</span> · 你的答案：<span className="font-bold">{selected || '未作答'}</span></div>
                                            {q.explanation ? <div className="text-phy-muted">解析：{q.explanation}</div> : null}
                                            {q.evidence_sentence ? <div className="text-indigo-300">证据句：{q.evidence_sentence}</div> : null}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => openDebate({ ...q, key, type: 'mcq' })}
                                        className="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-400/30 text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 flex items-center gap-1.5"
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
                                    {strictCETActive ? '段落匹配（严格 CET Section B）' : '段落匹配（CET 常见）'}
                                </h4>
                                <div className="space-y-3">
                                    {paper.matching.statements.map((s, idx) => {
                                        const key = `match-${s.id}`;
                                        const selected = answers[key] || '';
                                        const isRight = submitted && toAnswer(selected) === toAnswer(s.answer);
                                        const statementNo = strictCETActive ? (Number(s.id) || (36 + idx)) : (idx + 1);
                                        return (
                                            <div key={key} className={`rounded-xl border p-3 ${submitted && isRight ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-phy-border bg-phy-glass'}`}>
                                                <div className="text-sm text-phy-text leading-6">{statementNo}. {s.text}</div>
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
                                                        <span className={`text-xs font-bold ${isRight ? 'text-emerald-400' : 'text-rose-300'}`}>
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
                                                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-orange-400/30 text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 flex items-center gap-1.5"
                                                >
                                                    <MessageSquare size={14} />
                                                    就这题和AI对抗
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
