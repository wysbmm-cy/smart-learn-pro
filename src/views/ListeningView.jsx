import { decodeAudioData, sliceAudioBuffer, audioBufferToWav } from '../utils/audioUtils';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
    AlertCircle,
    Brain,
    CheckCircle2,
    Headphones,
    Loader2,
    Music, Scissors,
    Play, Plus,
    RefreshCw,
    Search,
    Type,
    ChevronLeft,
    Folder,
    FolderOpen,
    Trash2,
    Wand2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { generateListeningQuizFromTranscript, sendChat, synthesizeSpeech, transcribeAudio } from '../services/ai';
import { getListeningData, saveFile, saveListeningData } from '../services/db';

const extractOption = (option, idx) => {
    const raw = String(option || '').trim();
    const match = raw.match(/^([A-D])[).:\-：\s]+(.+)$/i);
    const key = match ? match[1].toUpperCase() : String.fromCharCode(65 + idx);
    const text = match ? match[2].trim() : raw;
    return { key, text };
};

const normalizeAnswer = (value) => {
    const found = String(value || '').toUpperCase().match(/[A-D]/);
    return found ? found[0] : '';
};

const normalizeFolderName = (value) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 24);
const getListeningFolder = (file) => normalizeFolderName(file?.listeningFolder);
const sanitizeAudioName = (value) => String(value || 'AI Listening').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
const DEFAULT_TTS_SEGMENT_LIMIT = 12000;

const clampTtsSegmentLimit = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_TTS_SEGMENT_LIMIT;
    return Math.min(15000, Math.max(1000, parsed));
};

const getAudioExtension = (type = '') => {
    const normalized = String(type || '').toLowerCase();
    if (normalized.includes('wav')) return 'wav';
    if (normalized.includes('ogg')) return 'ogg';
    if (normalized.includes('webm')) return 'webm';
    if (normalized.includes('mp4')) return 'm4a';
    return 'mp3';
};

const parseSegmentResponse = (raw) => {
    const text = String(raw || '').trim();
    const candidates = [
        text,
        text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
        text.match(/\{[\s\S]*\}/)?.[0]
    ].filter(Boolean);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            const segments = Array.isArray(parsed?.segments) ? parsed.segments : [];
            return segments
                .map((segment, index) => ({
                    title: sanitizeAudioName(segment?.title || `Part ${index + 1}`),
                    text: String(segment?.text || '').trim()
                }))
                .filter(segment => segment.text);
        } catch {
            // Try the next candidate.
        }
    }

    return [];
};

const splitTextByLength = (text, limit) => {
    const sentences = String(text || '')
        .replace(/\r\n/g, '\n')
        .split(/(?<=[.!?。！？])\s+|\n{2,}/)
        .map(item => item.trim())
        .filter(Boolean);
    const units = sentences.length ? sentences : String(text || '').match(new RegExp(`[\\s\\S]{1,${limit}}`, 'g')) || [];
    const segments = [];
    let current = '';

    units.forEach((unit) => {
        if ((current + '\n\n' + unit).trim().length > limit && current.trim()) {
            segments.push({ title: `Part ${segments.length + 1}`, text: current.trim() });
            current = unit;
        } else {
            current = [current, unit].filter(Boolean).join('\n\n');
        }

        while (current.length > limit) {
            segments.push({ title: `Part ${segments.length + 1}`, text: current.slice(0, limit).trim() });
            current = current.slice(limit).trim();
        }
    });

    if (current.trim()) {
        segments.push({ title: `Part ${segments.length + 1}`, text: current.trim() });
    }

    return segments;
};

const ListeningView = () => {
    const fileInputRef = useRef(null);
    const { loadFiles, playAudio, closeAudio, settings, saveToFileLibrary, removeFileItem } = useApp();
    const [files, setFiles] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [folderFilter, setFolderFilter] = useState('all');
    const [loading, setLoading] = useState(true);
    const [activeFile, setActiveFile] = useState(null);
    const [showGenerator, setShowGenerator] = useState(false);
    const [generatedAudioTitle, setGeneratedAudioTitle] = useState('');
    const [generatedAudioText, setGeneratedAudioText] = useState('');
    const [ttsSegmentLimit, setTtsSegmentLimit] = useState(DEFAULT_TTS_SEGMENT_LIMIT);
    const [splitLongAudio, setSplitLongAudio] = useState(true);
    const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

    // Responsive State
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    const [showSidebarOnMobile, setShowSidebarOnMobile] = useState(true);

    // Listening Specific State
    const [transcriptText, setTranscriptText] = useState('');
    const [listeningQuiz, setListeningQuiz] = useState(null);
    const [listeningAnswers, setListeningAnswers] = useState({});
    const [listeningSubmitted, setListeningSubmitted] = useState(false);
    const [workbenchMode, setWorkbenchMode] = useState('both');
    
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
    const [isSplitting, setIsSplitting] = useState(false);
    const [splitRange, setSplitRange] = useState({ start: 0, end: 10 });

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

        const handleDirectUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 25 * 1024 * 1024) {
            toast.error('文件太大（需 <25MB）');
            return;
        }

        const tid = toast.loading('正在上传音频...');
        try {
            await saveToFileLibrary({
                name: file.name,
                type: file.type || 'audio/mpeg',
                blob: file
            });
            toast.success('上传成功', { id: tid });
            await loadData();
            e.target.value = null; // Reset
        } catch (err) {
            toast.error(`上传失败: ${err.message}`, { id: tid });
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const allFiles = await loadFiles();
            const audioFiles = allFiles.filter(f => f.type.includes('audio'));
            setFiles(audioFiles);
        } catch (e) {
            console.error('Failed to load audio files', e);
            toast.error('加载音频文件失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const listeningFolders = useMemo(() => {
        return Array.from(new Set(files.map(getListeningFolder).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }, [files]);

    useEffect(() => {
        if (!activeFile) return;

        const loadCache = async () => {
            try {
                const cached = await getListeningData(activeFile.id);
                if (cached) {
                    setTranscriptText(cached.transcript || '');
                    setListeningQuiz(cached.quizData || null);
                } else {
                    setTranscriptText('');
                    setListeningQuiz(null);
                }
                setListeningAnswers({});
                setListeningSubmitted(false);
            } catch (e) {
                console.error('Failed to load listening cache', e);
            }
        };

        loadCache();

        return () => {
            if (activeFile?.url) {
                URL.revokeObjectURL(activeFile.url);
            }
        };
    }, [activeFile?.id]);

    const filteredFiles = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return files.filter(f => {
            const folder = getListeningFolder(f);
            const matchesSearch = !keyword || f.name.toLowerCase().includes(keyword) || folder.toLowerCase().includes(keyword);
            const matchesFolder = folderFilter === 'all'
                || (folderFilter === 'unfiled' ? !folder : folder === folderFilter);
            return matchesSearch && matchesFolder;
        });
    }, [files, folderFilter, searchTerm]);

    const handleOrganizeFile = async (file) => {
        const currentFolder = getListeningFolder(file);
        const nextFolder = normalizeFolderName(window.prompt('移动到哪个文件夹？留空则移到未整理。', currentFolder));
        if (nextFolder === currentFolder) return;

        try {
            const updated = {
                ...file,
                listeningFolder: nextFolder || undefined,
                organizedAt: Date.now()
            };
            await saveFile(updated);
            setFiles(prev => prev.map(item => item.id === file.id ? updated : item));
            if (activeFile?.id === file.id) {
                setActiveFile(prev => prev ? { ...prev, listeningFolder: updated.listeningFolder, organizedAt: updated.organizedAt } : prev);
            }
            if (folderFilter !== 'all' && folderFilter !== 'unfiled' && folderFilter !== nextFolder) {
                setFolderFilter('all');
            }
            toast.success(nextFolder ? `已归类到「${nextFolder}」` : '已移到未整理');
        } catch (e) {
            console.error('Failed to organize audio file', e);
            toast.error(`整理失败: ${e.message}`);
        }
    };

    const handleDeleteListeningFile = async (file) => {
        if (!file) return;
        const ok = window.confirm(`确定删除这个听力吗？\n\n${file.name}`);
        if (!ok) return;

        try {
            await removeFileItem(file.id);
            setFiles(prev => prev.filter(item => item.id !== file.id));
            if (activeFile?.id === file.id) {
                if (activeFile?.url) URL.revokeObjectURL(activeFile.url);
                setActiveFile(null);
                setTranscriptText('');
                setListeningQuiz(null);
                closeAudio();
                if (isMobile) setShowSidebarOnMobile(true);
            }
            toast.success('听力已删除');
        } catch (e) {
            console.error('Failed to delete listening file', e);
            toast.error(`删除失败: ${e.message}`);
        }
    };

    const splitListeningTextWithAI = async (text, limit) => {
        const systemPrompt = [
            'You split long English listening scripts into natural audio-generation segments.',
            'Return strict JSON only: {"segments":[{"title":"Part 1","text":"..."}]}.',
            `Each segment must be no longer than ${limit} characters.`,
            'Preserve the original wording, punctuation, paragraph order, and speaker labels.',
            'Split at topic shifts, speaker turns, paragraphs, or sentence boundaries. Do not summarize or rewrite.'
        ].join('\n');

        const raw = await sendChat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
        ], settings, true);

        const segments = parseSegmentResponse(raw);
        if (!segments.length) {
            throw new Error('AI did not return a valid segment list');
        }

        return segments.flatMap((segment) => (
            segment.text.length > limit
                ? splitTextByLength(segment.text, limit)
                : [segment]
        ));
    };

    const handleGenerateListeningAudio = async () => {
        const text = generatedAudioText.trim();
        if (!text) {
            toast.error('请先输入英文听力文本');
            return;
        }
        const segmentLimit = clampTtsSegmentLimit(ttsSegmentLimit);
        if (text.length > segmentLimit && !splitLongAudio) {
            toast.error(`文本超过单段上限 ${segmentLimit} 字符，请开启分段生成`);
            return;
        }

        setIsGeneratingAudio(true);
        const toastId = toast.loading('正在生成英文听力音频...');
        try {
            const safeTitle = sanitizeAudioName(generatedAudioTitle || text.split(/\s+/).slice(0, 8).join(' '));
            let segments = [{ title: safeTitle, text }];

            if (text.length > segmentLimit) {
                toast.loading('正在让 AI 分析并切分长文本...', { id: toastId });
                try {
                    segments = await splitListeningTextWithAI(text, segmentLimit);
                } catch (segmentError) {
                    console.warn('AI segmenting failed, using sentence fallback', segmentError);
                    segments = splitTextByLength(text, segmentLimit);
                    toast.loading('AI 分段失败，已改用本地句子分段...', { id: toastId });
                }
            }

            const folderName = segments.length > 1
                ? (normalizeFolderName(`AI生成 ${safeTitle}`) || 'AI生成分段')
                : 'AI生成';
            const savedRecords = [];

            for (let index = 0; index < segments.length; index += 1) {
                const segment = segments[index];
                toast.loading(`正在生成第 ${index + 1}/${segments.length} 段音频...`, { id: toastId });
                const audioBlob = await synthesizeSpeech(segment.text, settings);
                const ext = getAudioExtension(audioBlob.type);
                const segmentSuffix = segments.length > 1 ? ` ${index + 1}-${segments.length}` : '';
                const segmentTitle = segments.length > 1 && segment.title ? ` - ${sanitizeAudioName(segment.title)}` : '';
                const record = await saveToFileLibrary({
                    name: `[AI听力${segmentSuffix}] ${safeTitle}${segmentTitle}.${ext}`,
                    type: audioBlob.type || 'audio/mpeg',
                    blob: audioBlob,
                    listeningFolder: folderName,
                    sourceTranscriptPart: index + 1,
                    sourceTranscriptParts: segments.length
                });

                await saveListeningData({
                    fileId: record.id,
                    transcript: segment.text,
                    quizData: null
                });

                savedRecords.push({ ...record, listeningFolder: folderName });
            }

            setFiles(prev => [
                ...savedRecords,
                ...prev.filter(item => !savedRecords.some(record => record.id === item.id))
            ]);
            setFolderFilter(folderName);
            setTranscriptText(segments.map((segment, index) => (
                segments.length > 1
                    ? `Part ${index + 1}: ${segment.title || ''}\n${segment.text}`
                    : segment.text
            )).join('\n\n'));
            setListeningQuiz(null);
            setWorkbenchMode('transcript');
            handleSelectFile(savedRecords[0]);
            setShowGenerator(false);
            setGeneratedAudioTitle('');
            setGeneratedAudioText('');
            toast.success(segments.length > 1 ? `已生成 ${segments.length} 段音频并放入「${folderName}」` : '听力音频已生成并保存', { id: toastId });
        } catch (e) {
            console.error('Generate listening audio failed', e);
            toast.error(`生成失败: ${e.message}`, { id: toastId });
        } finally {
            setIsGeneratingAudio(false);
        }
    };

    const handleSelectFile = (file) => {
        if (activeFile?.url) {
            URL.revokeObjectURL(activeFile.url);
        }
        const url = URL.createObjectURL(file.blob);
        const next = { ...file, url };
        setActiveFile(next);
        playAudio(next);
        
        if (isMobile) {
            setShowSidebarOnMobile(false);
        }
    };

    const handleTranscribe = async () => {
        if (!activeFile) return;
        setIsTranscribing(true);
        const toastId = toast.loading('正在通过 AI 转写音频...');
        try {
            const transcript = await transcribeAudio(activeFile.blob, settings);
            if (!transcript?.trim()) throw new Error('转写结果为空');
            
            setTranscriptText(transcript);
            await saveListeningData({
                fileId: activeFile.id,
                transcript,
                quizData: listeningQuiz
            });
            toast.success('转写完成', { id: toastId });
        } catch (e) {
            console.error('Transcription failed', e);
            toast.error(`转写失败: ${e.message}`, { id: toastId });
        } finally {
            setIsTranscribing(false);
        }
    };

    const handleGenerateQuiz = async () => {
        if (!transcriptText) {
            toast.error('请先进行转写');
            return;
        }
        setIsGeneratingQuiz(true);
        const toastId = toast.loading('正在生成听力理解题目...');
        try {
            const rawQuiz = await generateListeningQuizFromTranscript(transcriptText, settings, 6);
            const normalizedQuestions = (rawQuiz?.questions || []).map((q, idx) => ({
                id: q.id || idx + 1,
                question: q.question || `第 ${idx + 1} 题`,
                options: Array.isArray(q.options) ? q.options : [],
                answer: normalizeAnswer(q.answer),
                explanation: q.explanation || '',
                evidence_sentence: q.evidence_sentence || ''
            }));

            if (!normalizedQuestions.length) throw new Error('未能生成有效题目');

            const quizData = {
                title: rawQuiz?.title || '听力练习题',
                questions: normalizedQuestions
            };

            setListeningQuiz(quizData);
            setListeningAnswers({});
            setListeningSubmitted(false);
            setWorkbenchMode('quiz');

            await saveListeningData({
                fileId: activeFile.id,
                transcript: transcriptText,
                quizData
            });

            toast.success(`生成了 ${normalizedQuestions.length} 道题目`, { id: toastId });
        } catch (e) {
            console.error('Quiz generation failed', e);
            toast.error(`生成失败: ${e.message}`, { id: toastId });
        } finally {
            setIsGeneratingQuiz(false);
        }
    };

    const handleSubmitQuiz = () => {
        if (!listeningQuiz?.questions?.length) return;
        const answeredCount = listeningQuiz.questions.filter((q) => listeningAnswers[q.id]).length;
        if (!answeredCount) {
            toast.error('请先选择答案');
            return;
        }
        setListeningSubmitted(true);
    };

    const listeningResult = useMemo(() => {
        if (!listeningQuiz?.questions?.length) return { total: 0, correct: 0, accuracy: 0 };
        const total = listeningQuiz.questions.length;
        const correct = listeningQuiz.questions.reduce((sum, q) => {
            const picked = normalizeAnswer(listeningAnswers[q.id]);
            const answer = normalizeAnswer(q.answer);
            return sum + (picked && answer && picked === answer ? 1 : 0);
        }, 0);
        return {
            total,
            correct,
            accuracy: total ? Math.round((correct / total) * 100) : 0
        };
    }, [listeningQuiz, listeningAnswers]);

    const hasQuiz = Boolean(listeningQuiz?.questions?.length);
    const showTranscriptPane = workbenchMode !== 'quiz' || !hasQuiz;
    const showQuizPane = hasQuiz && workbenchMode !== 'transcript';
    const contentLayoutClass = isMobile
        ? 'flex flex-col overflow-y-auto no-scrollbar pb-28'
        : showTranscriptPane && showQuizPane
            ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] overflow-hidden min-h-0'
            : 'grid grid-cols-1 overflow-hidden min-h-0';

        const handleSplitAudio = async () => {
        if (!activeFile) return;
        const start = parseFloat(splitRange.start);
        const end = parseFloat(splitRange.end);
        
        if (isNaN(start) || isNaN(end) || start >= end || start < 0) {
            toast.error('请输入有效的起止时间');
            return;
        }

        setIsSplitting(true);
        const tid = toast.loading('正在导出切割片段...');
        try {
            const buffer = await decodeAudioData(activeFile.blob);
            // Cap end time to duration
            const safeEnd = Math.min(end, buffer.duration);
            if (start >= safeEnd) throw new Error('起止时间超出音频范围');

            const sliced = sliceAudioBuffer(buffer, start, safeEnd);
            const wavBlob = audioBufferToWav(sliced);
            
            const segmentName = `[片段] ${activeFile.name.replace(/\.[^/.]+$/, "")} (${Math.floor(start)}s-${Math.floor(safeEnd)}s).wav`;
            
            await saveToFileLibrary({
                name: segmentName,
                type: 'audio/wav',
                blob: wavBlob
            });
            
            toast.success('片段已保存至音频库', { id: tid });
            loadData(); // Refresh list
        } catch (e) {
            console.error('Split failed', e);
            toast.error(`切割失败: ${e.message}`, { id: tid });
        } finally {
            setIsSplitting(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center text-phy-muted animate-pulse">
                <Loader2 className="animate-spin mr-2" size={20} />
                正在加载听力实验室...
            </div>
        );
    }

    // Sidebar Content Component to avoid duplication
    const Sidebar = (
        <>
            <input type="file" ref={fileInputRef} onChange={handleDirectUpload} accept="audio/*" className="hidden" />
        <div className={`${isMobile ? 'w-full min-h-0' : 'w-80'} flex flex-col glass-sidebar rounded-[2rem] border border-phy-border overflow-hidden transition-all duration-500`}>
            <div className="p-5 border-b border-phy-border bg-phy-glassHeavy/30">
                <div className="flex items-center justify-between mb-4">
                    <div className="p-2.5 bg-phy-accentGlass text-phy-accent rounded-2xl shadow-sm">
                        <Headphones size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-phy-text">音频库</h2>
                        <p className="text-[10px] text-phy-muted uppercase tracking-wider font-bold">精听训练专用</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowGenerator(prev => !prev)}
                            className={`p-2 rounded-xl transition-all shadow-lg ${
                                showGenerator
                                    ? 'bg-indigo-500 text-white shadow-indigo-500/20'
                                    : 'bg-phy-glass border border-phy-border text-phy-accent hover:bg-phy-glassHover'
                            }`}
                            title="生成英文听力音频"
                        >
                            <Wand2 size={16} />
                        </button>
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 bg-phy-accent text-white rounded-xl hover:bg-phy-accent/80 transition-all shadow-lg shadow-phy-accent/20"
                            title="上传音频"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>
                {showGenerator && (
                    <div className="mb-3 rounded-2xl border border-phy-border bg-phy-bg/70 p-3 space-y-2 animate-fade-in">
                        <input
                            type="text"
                            value={generatedAudioTitle}
                            onChange={(e) => setGeneratedAudioTitle(e.target.value)}
                            placeholder="音频标题，例如 Campus Conversation"
                            className="w-full bg-phy-glass border border-phy-border rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-phy-accent/50"
                        />
                        <textarea
                            value={generatedAudioText}
                            onChange={(e) => setGeneratedAudioText(e.target.value)}
                            placeholder="粘贴或输入英文听力文本..."
                            rows={5}
                            className="w-full resize-none bg-phy-glass border border-phy-border rounded-xl px-3 py-2 text-xs leading-relaxed outline-none focus:ring-1 focus:ring-phy-accent/50 custom-scrollbar"
                        />
                        <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                            <label className="flex items-center gap-2 rounded-xl border border-phy-border bg-phy-glass px-3 py-2 text-[10px] text-phy-muted">
                                <input
                                    type="checkbox"
                                    checked={splitLongAudio}
                                    onChange={(e) => setSplitLongAudio(e.target.checked)}
                                    className="accent-indigo-500"
                                />
                                超长文本由 AI 分段生成
                            </label>
                            <input
                                type="number"
                                min={1000}
                                max={15000}
                                step={500}
                                value={ttsSegmentLimit}
                                onChange={(e) => setTtsSegmentLimit(e.target.value)}
                                onBlur={() => setTtsSegmentLimit(clampTtsSegmentLimit(ttsSegmentLimit))}
                                className="w-24 bg-phy-glass border border-phy-border rounded-xl px-2 py-2 text-[10px] font-mono outline-none focus:ring-1 focus:ring-phy-accent/50"
                                title="单段 TTS 字符上限"
                            />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-phy-muted">
                                {generatedAudioText.trim().length} / {clampTtsSegmentLimit(ttsSegmentLimit)}
                                {generatedAudioText.trim().length > clampTtsSegmentLimit(ttsSegmentLimit) && splitLongAudio ? ' · 将分段保存' : ''}
                            </span>
                            <button
                                onClick={handleGenerateListeningAudio}
                                disabled={isGeneratingAudio || !generatedAudioText.trim()}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 disabled:opacity-45 disabled:cursor-not-allowed transition-all"
                            >
                                {isGeneratingAudio ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                生成并保存
                            </button>
                        </div>
                    </div>
                )}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-phy-muted" size={14} />
                    <input
                        type="text"
                        placeholder="搜索音频..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-phy-bg border border-phy-border rounded-xl py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-phy-accent/50 outline-none transition-all"
                    />
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
                    {[
                        { id: 'all', label: '全部', icon: FolderOpen },
                        { id: 'unfiled', label: '未整理', icon: Folder }
                    ].map((item) => {
                        const Icon = item.icon;
                        const active = folderFilter === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setFolderFilter(item.id)}
                                className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                                    active
                                        ? 'bg-phy-accent/15 border-phy-accent/40 text-phy-accent'
                                        : 'bg-phy-bg border-phy-border text-phy-muted hover:text-phy-text'
                                }`}
                            >
                                <Icon size={12} />
                                {item.label}
                            </button>
                        );
                    })}
                    {listeningFolders.map((folder) => (
                        <button
                            key={folder}
                            onClick={() => setFolderFilter(folder)}
                            className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                                folderFilter === folder
                                    ? 'bg-phy-accent/15 border-phy-accent/40 text-phy-accent'
                                    : 'bg-phy-bg border-phy-border text-phy-muted hover:text-phy-text'
                            }`}
                        >
                            <Folder size={12} />
                            {folder}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-2">
                {filteredFiles.length === 0 ? (
                    <div className="text-center py-20 text-phy-muted">
                        <Music size={40} className="mx-auto mb-3 opacity-20" />
                        <p className="text-sm">暂无音频文件</p>
                        <p className="text-xs mt-1">请从“导入”页面上传 MP3/WAV</p>
                    </div>
                ) : (
                    filteredFiles.map(file => {
                        const folder = getListeningFolder(file);
                        return (
                        <div
                            key={file.id}
                            className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-300 group ${
                                activeFile?.id === file.id
                                    ? 'bg-phy-accent/10 border-phy-accent/40 shadow-lg translate-x-1'
                                    : 'bg-phy-glass border-phy-border hover:border-phy-accent/30 hover:bg-phy-glassHover'
                            }`}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <button
                                    onClick={() => handleSelectFile(file)}
                                    className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                                        activeFile?.id === file.id ? 'bg-phy-accent text-white rotate-6' : 'bg-phy-bg text-phy-muted group-hover:text-phy-accent'
                                    }`}
                                    title="播放"
                                >
                                    <Play size={16} fill={activeFile?.id === file.id ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                    onClick={() => handleSelectFile(file)}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <h4 className={`text-sm font-bold truncate ${activeFile?.id === file.id ? 'text-phy-accent' : 'text-phy-text'}`}>
                                        {file.name}
                                    </h4>
                                    <p className="text-[10px] text-phy-muted mt-0.5 truncate">
                                        {(file.blob.size / 1024 / 1024).toFixed(1)}MB · {new Date(file.timestamp).toLocaleDateString()} · {folder || '未整理'}
                                    </p>
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOrganizeFile(file);
                                    }}
                                    className="shrink-0 p-2 rounded-lg text-phy-muted hover:text-phy-accent hover:bg-phy-accent/10 transition-all"
                                    title="整理分类"
                                >
                                    <Folder size={14} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteListeningFile(file);
                                    }}
                                    className="shrink-0 p-2 rounded-lg text-phy-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                                    title="删除听力"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    );
                    })
                )}
            </div>
        </div>
        </>
    );

    return (
        <div className={`w-full max-w-none h-full flex animate-fade-in p-2 md:p-3 ${isMobile ? 'flex-col gap-3 overflow-y-auto pb-28' : 'flex-row gap-3 2xl:gap-4'}`}>
            
            {/* Sidebar Logic for Mobile/Desktop */}
            {(!isMobile || showSidebarOnMobile) && Sidebar}

            {/* Main Workbench */}
            {(!isMobile || !showSidebarOnMobile) && (
                <div className={`flex-1 flex flex-col gap-3 min-h-0 min-w-0 ${isMobile ? 'overflow-visible' : 'overflow-hidden'}`}>
                    {!activeFile ? (
                        <div className="flex-1 glass-panel rounded-[2rem] flex flex-col items-center justify-center text-phy-muted animate-slide-up p-6 text-center">
                            <div className="relative mb-6">
                                <Headphones size={isMobile ? 60 : 80} className="opacity-10" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Music size={isMobile ? 24 : 32} className="text-phy-accent animate-bounce" />
                                </div>
                            </div>
                            <h3 className="text-lg md:text-xl font-bold text-phy-text mb-2">欢迎来到听力实验室</h3>
                            <p className="max-w-md text-sm leading-6">
                                从音频库选择一个文件开始精听训练。AI 将为你提供精准转写和理解练习。
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile Top Actions (Back to List) */}
                            {isMobile && (
                                <button 
                                    onClick={() => setShowSidebarOnMobile(true)}
                                    className="flex items-center gap-2 text-phy-accent font-bold text-sm mb-1 px-2"
                                >
                                    <ChevronLeft size={18} />
                                    返回音频列表
                                </button>
                            )}

                            {/* Audio Info Card */}
                            <div className="glass-panel rounded-[1.25rem] md:rounded-2xl p-3 md:p-4 flex flex-col md:flex-row md:flex-wrap xl:flex-nowrap items-start md:items-center justify-between border border-phy-border shadow-xl animate-slide-up gap-3 min-w-0">
                                <div className="flex items-center gap-3 w-full md:flex-[1_1_280px] min-w-0">
                                    <div className="shrink-0 w-11 h-11 md:w-12 md:h-12 bg-phy-accent rounded-xl md:rounded-2xl flex items-center justify-center text-white shadow-lg shadow-phy-accent/20">
                                        <Music size={isMobile ? 24 : 28} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-base md:text-lg font-black text-phy-text truncate px-1">{activeFile.name}</h2>
                                        <p className="text-[10px] md:text-xs text-phy-muted flex items-center gap-1.5 mt-1 overflow-hidden">
                                            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-phy-accent/10 text-phy-accent font-bold">精听模式</span>
                                            <span className="truncate">准备就绪</span>
                                        </p>
                                    </div>
                                </div>
                                    <div className="flex flex-wrap items-center justify-start md:justify-end gap-2 w-full md:flex-[1_1_520px] min-w-0 max-w-full">
                                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 px-2.5 py-1.5 bg-phy-glass rounded-xl border border-phy-border w-full sm:w-auto min-w-0">
                                            <div className="flex items-center gap-1 min-w-0">
                                                <span className="text-[10px] text-phy-muted">Start</span>
                                                <input 
                                                    type="number" 
                                                    value={splitRange.start} 
                                                    onChange={(e) => setSplitRange(prev => ({ ...prev, start: e.target.value }))}
                                                    className="w-14 bg-phy-bg border border-phy-border rounded-md px-1 py-0.5 text-[10px] outline-none" 
                                                />
                                            </div>
                                            <div className="flex items-center gap-1 min-w-0">
                                                <span className="text-[10px] text-phy-muted">End</span>
                                                <input 
                                                    type="number" 
                                                    value={splitRange.end} 
                                                    onChange={(e) => setSplitRange(prev => ({ ...prev, end: e.target.value }))}
                                                    className="w-14 bg-phy-bg border border-phy-border rounded-md px-1 py-0.5 text-[10px] outline-none" 
                                                />
                                            </div>
                                            <button
                                                onClick={handleSplitAudio}
                                                disabled={isSplitting}
                                                className="shrink-0 p-1.5 rounded-lg bg-phy-accent/20 text-phy-accent hover:bg-phy-accent/30 transition-all disabled:opacity-50"
                                                title="切割为新文件"
                                            >
                                                {isSplitting ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleTranscribe}
                                            disabled={isTranscribing}
                                            className={`whitespace-nowrap flex-1 sm:flex-none min-w-[7.5rem] flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-50 ${
                                                !transcriptText 
                                                    ? 'bg-phy-accent text-white shadow-lg shadow-phy-accent/30 hover:brightness-110' 
                                                    : 'bg-phy-glass border border-phy-border text-phy-muted hover:text-phy-accent'
                                            }`}
                                            title={transcriptText ? "重新转写" : "AI 转写音频文本"}
                                        >
                                            {isTranscribing ? <Loader2 size={16} className="animate-spin" /> : (transcriptText ? <RefreshCw size={16} /> : <Type size={16} />)}
                                            {transcriptText ? (isMobile ? "重转" : "重新转写") : "一键 AI 转写"}
                                        </button>

                                        <button
                                            onClick={handleGenerateQuiz}
                                            disabled={isGeneratingQuiz || !transcriptText}
                                            className={`whitespace-nowrap flex-1 sm:flex-none min-w-[7.5rem] flex items-center justify-center gap-2 px-4 md:px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed ${
                                                transcriptText 
                                                    ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30 hover:bg-indigo-400' 
                                                    : 'bg-phy-glass border border-phy-border text-phy-muted'
                                            }`}
                                            title={!transcriptText ? "请先完成 AI 转写" : "基于文本生成练习题"}
                                        >
                                            {isGeneratingQuiz ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
                                            {listeningQuiz ? '重练题目' : '生成练习题'}
                                        </button>
                                    </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 rounded-2xl border border-phy-border bg-phy-glass p-1">
                                    {[
                                        { id: 'both', label: '原文 + 题目', disabled: !hasQuiz },
                                        { id: 'transcript', label: '只看原文', disabled: !transcriptText },
                                        { id: 'quiz', label: '只做题目', disabled: !hasQuiz }
                                    ].map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => setWorkbenchMode(item.id)}
                                            disabled={item.disabled}
                                            className={`px-3 md:px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
                                                workbenchMode === item.id
                                                    ? 'bg-phy-accent text-white shadow-lg shadow-phy-accent/20'
                                                    : 'text-phy-muted hover:text-phy-text hover:bg-phy-glassHover'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="text-[10px] md:text-xs text-phy-muted">
                                    {showQuizPane && !showTranscriptPane ? '题目独占工作区' : showTranscriptPane && showQuizPane ? '左右对照练习' : '专注阅读原文'}
                                </div>
                            </div>

                            {/* Content Area: Stacks on Mobile */}
                            <div className={`flex-1 ${contentLayoutClass} gap-3 2xl:gap-4`}>
                                
                                {/* Transcript Area */}
                                {showTranscriptPane && (
                                <div className={`bg-phy-glass rounded-[1.25rem] md:rounded-2xl border border-phy-border flex flex-col overflow-hidden min-w-0 transition-all duration-500 ${isMobile ? 'shrink-0 min-h-[300px]' : ''}`}>
                                    <div className="p-3 md:px-4 md:py-3 border-b border-phy-border bg-phy-glassHeavy/20 flex items-center justify-between shrink-0">
                                        <div className="flex items-center gap-2">
                                            <Type size={16} className="text-phy-accent" />
                                            <span className="text-xs md:text-sm font-bold text-phy-text">转写文本</span>
                                        </div>
                                        <span className="text-[10px] text-phy-muted bg-phy-bg px-2 py-1 rounded-md">AI 生成供参考</span>
                                    </div>
                                    <div className={`flex-1 p-4 md:p-5 overflow-y-auto custom-scrollbar leading-loose text-phy-text text-sm md:text-[15px] space-y-4 ${isMobile ? 'pb-28' : ''}`}>
                                        {!transcriptText ? (
                                            <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-sm text-center">
                                                尚未转写，请点击上方按钮开始
                                            </div>
                                        ) : (
                                            <div className="whitespace-pre-wrap animate-fade-in group selection:bg-phy-accent/30 text-left">
                                                {transcriptText}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                )}

                                {/* Quiz Area */}
                                {showQuizPane && (
                                    <div className={`min-w-0 bg-phy-glass rounded-[1.25rem] md:rounded-2xl border border-phy-border flex flex-col overflow-hidden animate-slide-left shadow-2xl ${isMobile ? 'shrink-0 min-h-[500px]' : ''}`}>
                                        <div className="p-3 md:px-4 md:py-3 border-b border-phy-border bg-phy-glassHeavy/20 flex items-center justify-between shrink-0">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Brain size={16} className="text-indigo-400 shrink-0" />
                                                <span className="text-xs md:text-sm font-bold text-phy-text truncate">{listeningQuiz.title}</span>
                                            </div>
                                            {listeningSubmitted && (
                                                <div className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] md:text-[10px] font-black tracking-widest uppercase ${
                                                    listeningResult.accuracy >= 60 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
                                                }`}>
                                                    {listeningResult.correct} / {listeningResult.total}
                                                </div>
                                            )}
                                        </div>

                                        <div className={`flex-1 p-4 md:p-5 overflow-y-auto custom-scrollbar ${isMobile ? 'pb-28' : ''} ${
                                            showQuizPane && !showTranscriptPane && !isMobile
                                                ? 'grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5 content-start'
                                                : 'space-y-5 md:space-y-6'
                                        }`}>
                                            {listeningQuiz.questions.map((q, idx) => {
                                                const selected = listeningAnswers[q.id] || '';
                                                const correct = normalizeAnswer(q.answer);
                                                const isCorrect = listeningSubmitted && normalizeAnswer(selected) === correct;

                                                return (
                                                    <div key={q.id} className="p-4 md:p-5 rounded-xl md:rounded-2xl bg-phy-bg border border-phy-border space-y-4 hover:border-phy-accent/20 transition-colors group">
                                                        <div className="text-sm md:text-base font-bold text-phy-text flex gap-3">
                                                            <span className="shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-lg bg-phy-glass border border-phy-border flex items-center justify-center text-[10px] md:text-xs text-phy-muted group-hover:text-phy-accent transition-colors">
                                                                {idx + 1}
                                                            </span>
                                                            <span className="mt-0.5 leading-relaxed">{q.question}</span>
                                                        </div>

                                                        <div className="grid grid-cols-1 gap-2 md:gap-2.5 md:ml-11">
                                                            {(q.options || []).map((opt, optIdx) => {
                                                                const { key, text } = extractOption(opt, optIdx);
                                                                const picked = selected === key;
                                                                const optionCorrect = listeningSubmitted && correct === key;
                                                                const optionWrongPicked = listeningSubmitted && picked && correct !== key;
                                                                
                                                                return (
                                                                    <button
                                                                        key={`${q.id}-${key}`}
                                                                        onClick={() => {
                                                                            if (!listeningSubmitted) {
                                                                                setListeningAnswers(prev => ({ ...prev, [q.id]: key }));
                                                                            }
                                                                        }}
                                                                        className={`flex items-start gap-3 text-left p-3 md:p-3.5 rounded-xl border transition-all text-xs md:text-sm leading-relaxed ${
                                                                            optionCorrect
                                                                                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-100'
                                                                                : optionWrongPicked
                                                                                    ? 'border-red-500 bg-red-500/10 text-red-100'
                                                                                    : picked
                                                                                        ? 'border-phy-accent bg-phy-accent/10 text-phy-accent font-bold'
                                                                                        : 'border-phy-border bg-phy-glass/40 hover:bg-phy-glassHover text-phy-text/80'
                                                                        }`}
                                                                    >
                                                                        <span className={`shrink-0 w-5 h-5 md:w-6 md:h-6 rounded-md flex items-center justify-center text-[9px] md:text-[10px] font-black ${
                                                                            picked ? 'bg-phy-accent text-white' : 'bg-phy-bg border border-phy-border text-phy-muted'
                                                                        }`}>
                                                                            {key}
                                                                        </span>
                                                                        <span className="flex-1">{text}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>

                                                        {listeningSubmitted && (
                                                            <div className="md:ml-11 mt-3 md:mt-4 p-3 md:p-4 rounded-xl bg-phy-glassHeavy/10 border-l-4 border-phy-accent/40 animate-fade-in">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    {isCorrect ? (
                                                                        <span className="text-emerald-400 font-bold flex items-center gap-1 text-[10px] md:text-xs">
                                                                            <CheckCircle2 size={12} /> 正确
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-orange-400 font-bold flex items-center gap-1 text-[10px] md:text-xs">
                                                                            <AlertCircle size={12} /> 提示
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-[11px] md:text-xs text-phy-text/80 leading-relaxed mb-3">
                                                                    {q.explanation}
                                                                </p>
                                                                {q.evidence_sentence && (
                                                                    <div className="p-2 md:p-2.5 rounded-lg bg-phy-accent/5 border border-phy-accent/10 text-[10px] md:text-[11px] text-phy-accent/80 italic">
                                                                        “{q.evidence_sentence}”
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="p-4 md:p-5 border-t border-phy-border bg-phy-glassHeavy/30 flex gap-3 shrink-0">
                                            <button
                                                onClick={() => {
                                                    setListeningAnswers({});
                                                    setListeningSubmitted(false);
                                                }}
                                                className="flex-1 py-3 rounded-xl border border-phy-border bg-phy-bg text-phy-text text-xs md:text-sm font-bold hover:bg-phy-glassHover transition-all"
                                            >
                                                重置
                                            </button>
                                            <button
                                                onClick={handleSubmitQuiz}
                                                disabled={listeningSubmitted}
                                                className="flex-[2] py-3 rounded-xl bg-emerald-500 text-white text-xs md:text-sm font-black shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-50 transition-all"
                                            >
                                                提交评分
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default ListeningView;
