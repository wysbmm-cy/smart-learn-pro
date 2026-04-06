import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    Brain,
    CheckCircle2,
    FileText,
    FolderOpen,
    Loader2,
    MonitorPlay,
    Music,
    Trash2,
    Video,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import { generateListeningQuizFromTranscript, transcribeAudio } from '../services/ai';

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

const LibraryView = () => {
    const { loadFiles, removeFileItem, playAudio, settings } = useApp();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFile, setActiveFile] = useState(null);

    const [listeningQuiz, setListeningQuiz] = useState(null);
    const [listeningAnswers, setListeningAnswers] = useState({});
    const [listeningSubmitted, setListeningSubmitted] = useState(false);
    const [transcriptText, setTranscriptText] = useState('');
    const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await loadFiles();
            setFiles(data);
        } catch (e) {
            console.error('Failed to load library', e);
            toast.error(`加载文件库失败: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        return () => {
            if (activeFile?.url) {
                URL.revokeObjectURL(activeFile.url);
            }
        };
    }, [activeFile]);

    const resetListeningState = () => {
        setListeningQuiz(null);
        setListeningAnswers({});
        setListeningSubmitted(false);
        setTranscriptText('');
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm('确定要永久删除这个文件吗？')) return;

        await removeFileItem(id);
        if (activeFile?.id === id) {
            if (activeFile?.url) URL.revokeObjectURL(activeFile.url);
            setActiveFile(null);
            resetListeningState();
        }
        await loadData();
    };

    const handleView = (file) => {
        if (activeFile?.url) {
            URL.revokeObjectURL(activeFile.url);
        }
        const url = URL.createObjectURL(file.blob);
        const next = { ...file, url };
        setActiveFile(next);
        resetListeningState();

        if (file.type.includes('audio')) {
            playAudio(next);
        }
    };

    const closeViewer = () => {
        if (activeFile?.url) {
            URL.revokeObjectURL(activeFile.url);
        }
        setActiveFile(null);
        resetListeningState();
    };

    const handleGenerateListeningQuiz = async () => {
        if (!activeFile || !activeFile.type.includes('audio')) return;
        setIsGeneratingQuiz(true);
        try {
            toast.loading('正在转写音频...', { id: 'listening_quiz' });
            const transcript = await transcribeAudio(activeFile.blob, settings);
            if (!transcript?.trim()) {
                throw new Error('转写结果为空，请更换音频或检查模型设置');
            }

            toast.loading('正在生成听力题目...', { id: 'listening_quiz' });
            const rawQuiz = await generateListeningQuizFromTranscript(transcript, settings, 6);
            const normalizedQuestions = (rawQuiz?.questions || []).map((q, idx) => ({
                id: q.id || idx + 1,
                question: q.question || `第 ${idx + 1} 题`,
                options: Array.isArray(q.options) ? q.options : [],
                answer: normalizeAnswer(q.answer),
                explanation: q.explanation || '',
                evidence_sentence: q.evidence_sentence || ''
            }));

            if (!normalizedQuestions.length) {
                throw new Error('没有生成有效题目，请重试');
            }

            setTranscriptText(transcript);
            setListeningQuiz({
                title: rawQuiz?.title || '听力练习题',
                questions: normalizedQuestions
            });
            setListeningAnswers({});
            setListeningSubmitted(false);
            toast.success(`已生成 ${normalizedQuestions.length} 道听力题`, { id: 'listening_quiz' });
        } catch (e) {
            console.error('Generate listening quiz failed:', e);
            toast.error(`生成听力题失败: ${e.message}`, { id: 'listening_quiz' });
        } finally {
            setIsGeneratingQuiz(false);
        }
    };

    const handleSubmitListening = () => {
        if (!listeningQuiz?.questions?.length) return;
        const answeredCount = listeningQuiz.questions.filter((q) => listeningAnswers[q.id]).length;
        if (!answeredCount) {
            toast.error('请先选择至少一个答案');
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

    const getIcon = (type) => {
        if (type.includes('pdf')) return <FileText size={24} className="text-red-500" />;
        if (type.includes('audio')) return <Music size={24} className="text-purple-500" />;
        if (type.includes('video')) return <Video size={24} className="text-blue-500" />;
        return <FileText size={24} className="text-phy-muted" />;
    };

    if (loading) {
        return (
            <div className="p-10 text-center text-phy-muted flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                正在加载文件库...
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex gap-6 animate-fade-in pb-6">
            <div className={`${activeFile ? 'w-1/3' : 'w-full'} bg-phy-glass rounded-[2rem] shadow-sm border border-phy-border flex flex-col overflow-hidden transition-all duration-300`}>
                <div className="p-6 border-b border-phy-border bg-slate-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <FolderOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-phy-text">文件库</h2>
                            <p className="text-xs text-phy-muted">共 {files.length} 个本地文件</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {files.length === 0 && (
                        <div className="text-center py-20 text-phy-muted">
                            <p>还没有导入文件</p>
                            <p className="text-xs mt-2">请先到导入页面上传 PDF、音频或视频</p>
                        </div>
                    )}

                    {files.map((file) => (
                        <div
                            key={file.id}
                            onClick={() => handleView(file)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${activeFile?.id === file.id
                                ? 'bg-blue-50 border-blue-200 shadow-inner'
                                : 'bg-phy-glass border-phy-border hover:border-blue-200 hover:shadow-sm'
                                }`}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-phy-bg flex items-center justify-center border border-phy-border">
                                    {getIcon(file.type)}
                                </div>
                                <div className="min-w-0">
                                    <h4 className={`font-bold text-sm truncate ${activeFile?.id === file.id ? 'text-blue-700' : 'text-phy-text'}`}>
                                        {file.name}
                                    </h4>
                                    <p className="text-xs text-phy-muted">
                                        {(file.blob.size / 1024 / 1024).toFixed(2)} MB · {new Date(file.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, file.id)}
                                className="p-2 text-phy-text hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                title="删除"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {activeFile && (
                <div className="flex-1 bg-phy-glass rounded-[2rem] shadow-xl border border-phy-border flex flex-col overflow-hidden animate-slide-up">
                    <div className="p-4 border-b border-phy-border flex justify-between items-center bg-phy-glassHeavy text-white">
                        <div className="flex items-center gap-2 min-w-0">
                            <MonitorPlay size={18} className="text-blue-400" />
                            <span className="font-bold text-sm truncate">{activeFile.name}</span>
                        </div>
                        <button onClick={closeViewer} className="p-1 hover:bg-phy-glassHover rounded-full transition-colors" title="关闭">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 bg-phy-bg p-3 overflow-auto">
                        {activeFile.type.includes('pdf') && (
                            <iframe src={activeFile.url} className="w-full h-full rounded-xl border-0 bg-phy-glass" title="PDF Viewer" />
                        )}

                        {activeFile.type.includes('video') && (
                            <div className="w-full max-w-3xl mx-auto bg-black rounded-xl overflow-hidden shadow-2xl">
                                <video src={activeFile.url} controls autoPlay className="w-full max-h-[70vh]">
                                    当前浏览器不支持视频播放。
                                </video>
                            </div>
                        )}

                        {activeFile.type.includes('audio') && (
                            <div className="max-w-4xl mx-auto space-y-4">
                                <div className="rounded-2xl border border-phy-border bg-phy-glass p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center">
                                            <Music size={24} />
                                        </div>
                                        <div>
                                            <div className="text-phy-text font-bold">音频已在全局播放器中播放</div>
                                            <div className="text-xs text-phy-muted">可一键转写并自动生成听力题，适合做精听训练</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={handleGenerateListeningQuiz}
                                            disabled={isGeneratingQuiz}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white"
                                        >
                                            {isGeneratingQuiz ? <Loader2 size={15} className="animate-spin" /> : <Brain size={15} />}
                                            {isGeneratingQuiz ? '生成中...' : '自动生成听力题'}
                                        </button>
                                    </div>
                                </div>

                                {transcriptText && (
                                    <details className="rounded-xl border border-phy-border bg-phy-glass p-4">
                                        <summary className="cursor-pointer text-sm font-bold text-phy-text">查看转写文本</summary>
                                        <div className="mt-3 text-sm leading-7 text-phy-text whitespace-pre-wrap break-words max-h-[240px] overflow-y-auto custom-scrollbar">
                                            {transcriptText}
                                        </div>
                                    </details>
                                )}

                                {listeningQuiz?.questions?.length > 0 && (
                                    <div className="rounded-2xl border border-phy-border bg-phy-glass p-4 md:p-5 space-y-4">
                                        <div className="flex items-center justify-between gap-3 flex-wrap">
                                            <div>
                                                <div className="text-base font-black text-phy-text">{listeningQuiz.title || '听力练习题'}</div>
                                                <div className="text-xs text-phy-muted">{listeningQuiz.questions.length} 道题 · 单选题</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        setListeningAnswers({});
                                                        setListeningSubmitted(false);
                                                    }}
                                                    className="px-3 py-2 rounded-lg text-xs font-bold border border-phy-border bg-phy-bg text-phy-text hover:bg-phy-glassHeavy"
                                                >
                                                    重置作答
                                                </button>
                                                <button
                                                    onClick={handleSubmitListening}
                                                    className="px-3 py-2 rounded-lg text-xs font-bold bg-green-500 hover:bg-green-400 text-white"
                                                >
                                                    提交评分
                                                </button>
                                            </div>
                                        </div>

                                        {listeningSubmitted && (
                                            <div className={`rounded-xl border p-3 flex items-center gap-2 text-sm ${listeningResult.accuracy >= 60
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                                : 'bg-orange-500/10 border-orange-500/30 text-orange-300'
                                                }`}>
                                                {listeningResult.accuracy >= 60 ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                                成绩：{listeningResult.correct}/{listeningResult.total}，正确率 {listeningResult.accuracy}%
                                            </div>
                                        )}

                                        <div className="space-y-3">
                                            {listeningQuiz.questions.map((q, idx) => {
                                                const selected = listeningAnswers[q.id] || '';
                                                const correct = normalizeAnswer(q.answer);
                                                const isCorrect = listeningSubmitted && normalizeAnswer(selected) === correct;

                                                return (
                                                    <div key={q.id} className="rounded-xl border border-phy-border bg-phy-bg p-3">
                                                        <div className="font-bold text-phy-text text-sm md:text-base mb-3">
                                                            Q{idx + 1}. {q.question}
                                                        </div>

                                                        <div className="space-y-2">
                                                            {(q.options || []).map((opt, optIdx) => {
                                                                const { key, text } = extractOption(opt, optIdx);
                                                                const picked = selected === key;
                                                                const optionCorrect = listeningSubmitted && correct === key;
                                                                const optionWrongPicked = listeningSubmitted && picked && correct !== key;
                                                                return (
                                                                    <label
                                                                        key={`${q.id}-${key}`}
                                                                        className={`flex items-start gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors ${optionCorrect
                                                                            ? 'border-emerald-500/50 bg-emerald-500/10'
                                                                            : optionWrongPicked
                                                                                ? 'border-red-500/50 bg-red-500/10'
                                                                                : picked
                                                                                    ? 'border-indigo-500/50 bg-indigo-500/10'
                                                                                    : 'border-phy-border bg-transparent hover:bg-phy-glass'
                                                                            }`}
                                                                    >
                                                                        <input
                                                                            type="radio"
                                                                            name={`listening-${q.id}`}
                                                                            value={key}
                                                                            checked={picked}
                                                                            onChange={() => {
                                                                                setListeningAnswers((prev) => ({ ...prev, [q.id]: key }));
                                                                                if (listeningSubmitted) setListeningSubmitted(false);
                                                                            }}
                                                                            className="mt-1"
                                                                        />
                                                                        <div className="text-sm text-phy-text leading-6 break-words">
                                                                            <span className="font-black mr-1">{key}.</span>{text}
                                                                        </div>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>

                                                        {listeningSubmitted && (
                                                            <div className="mt-3 space-y-1 text-xs leading-6">
                                                                <div className={`${isCorrect ? 'text-emerald-300' : 'text-orange-300'} font-bold`}>
                                                                    正确答案：{correct || '未知'} · 你的答案：{selected || '未作答'}
                                                                </div>
                                                                {q.explanation && <div className="text-phy-muted">解析：{q.explanation}</div>}
                                                                {q.evidence_sentence && (
                                                                    <div className="text-blue-300">
                                                                        证据句：{q.evidence_sentence}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!activeFile.type.includes('pdf') && !activeFile.type.includes('audio') && !activeFile.type.includes('video') && (
                            <div className="w-full h-full flex items-center justify-center text-phy-muted">
                                当前文件类型暂不支持预览。
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LibraryView;
