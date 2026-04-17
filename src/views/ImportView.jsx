import React, { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, Loader2, AlertCircle, Mic, CheckCircle, Save, BookMarked } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { analyzeText, transcribeAudio, extractVocabulary } from '../services/ai';
import { extractTextFromPDF } from '../services/pdf';
import { saveFlashcard, saveFolder as dbSaveFolder, getFolders } from '../services/db';
import toast from 'react-hot-toast';

const normalizeVocabItem = (raw = {}) => {
    const normalizeText = (value) => (value === null || value === undefined ? '' : String(value).trim());
    const stripSurroundingSlash = (value) => normalizeText(value).replace(/^\/+|\/+$/g, '');
    const front = normalizeText(raw.front);
    const frontLines = front.split('\n');
    const fallbackWord = normalizeText(frontLines[0]).replace(/\/[^/]+\/.*/, '').trim();
    const fallbackPhoneticMatch = front.match(/\/([^/]+)\//);
    const fallbackPhonetic = fallbackPhoneticMatch ? fallbackPhoneticMatch[1] : '';

    return {
        word: normalizeText(raw.word || raw.term || fallbackWord),
        phonetic: stripSurroundingSlash(raw.phonetic || raw.pronunciation || raw.ipa || fallbackPhonetic),
        meaning: normalizeText(raw.meaning || raw.definition || raw.chinese_meaning || raw.back)
    };
};

const buildFrontText = (item) => {
    const word = (item.word || '').trim();
    const phonetic = (item.phonetic || '').trim().replace(/^\/+|\/+$/g, '');
    if (!phonetic) return word;
    return `${word}\n/${phonetic}/`;
};

const ImportView = ({ onNavigate, params = {} }) => {
    const {
        settings,
        setCurrentArticle,
        setAnalysisResult,
        DEFAULT_ANALYSIS,
        importText: inputText,
        setImportText: setInputText,
        isAnalyzing,
        setIsAnalyzing,
        saveToHistory,
        saveToFileLibrary
    } = useApp();

    const [mode, setMode] = useState('article'); // 'article' | 'vocab'
    const [errorMsg, setErrorMsg] = useState('');
    const [progressMsg, setProgressMsg] = useState('');

    // Vocab Batch State: editable rows {word, phonetic, meaning}
    const [vocabList, setVocabList] = useState(null);
    const [folders, setFolders] = useState([]);
    const [selectedFolderId, setSelectedFolderId] = useState('daily');
    const [newFolderName, setNewFolderName] = useState('');

    const fileInputRef = useRef(null);
    const mediaInputRef = useRef(null);
    const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));

    useEffect(() => {
        loadFolderList();
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const loadFolderList = async () => {
        try {
            const list = await getFolders();
            setFolders(list);
        } catch (e) {
            console.error('Failed to load folders', e);
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            await saveToFileLibrary({
                name: file.name,
                type: file.type || 'text/plain',
                blob: file
            });
        } catch (e) {
            console.error(e);
        }

        if (file.type === 'application/pdf') {
            setIsAnalyzing(true);
            setProgressMsg('正在从 PDF 提取文本...');
            try {
                const text = await extractTextFromPDF(file);
                setInputText(text);
                setProgressMsg('PDF 文本提取完成。');
            } catch (err) {
                toast.error(`PDF extract failed: ${err.message}`);
            } finally {
                setIsAnalyzing(false);
            }
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => setInputText(e.target.result);
        reader.readAsText(file);
    };

    const handleMediaUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 25 * 1024 * 1024) {
            setErrorMsg('File too large (>25MB).');
            return;
        }

        try {
            await saveToFileLibrary({
                name: file.name,
                type: file.type || 'audio/webm',
                blob: file
            });
        } catch (e) {
            console.error('Auto-save to library failed:', e);
        }

        setIsAnalyzing(true);
        setErrorMsg('');
        setProgressMsg('正在转录音频...');

        try {
            const text = await transcribeAudio(file, settings);
            setInputText((prev) => prev + (prev ? '\n\n' : '') + text);
            setProgressMsg('转录完成。');
        } catch (err) {
            setErrorMsg(`转录失败: ${err.message}`);
        } finally {
            setIsAnalyzing(false);
            event.target.value = null;
        }
    };

    const handleSaveToNotes = async () => {
        if (!inputText || inputText.length < 10) {
            toast.error('请输入至少 10 个字符的内容。');
            return;
        }

        setIsAnalyzing(true);
        try {
            const dateStr = new Date().toLocaleDateString();
            await saveToNotes({
                title: inputText.slice(0, 20).replace(/\n/g, ' ') + '...',
                content: inputText,
                tags: [dateStr, '待学文章']
            });
            toast.success('已成功存入笔记本！');
            setInputText('');
        } catch (err) {
            toast.error(`保存失败: ${err.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleJustReading = () => {
        if (!inputText || inputText.length < 10) {
            toast.error('请输入至少 10 个字符的内容。');
            return;
        }
        onNavigate({ 
            view: 'exam', 
            params: { importText: inputText, mode: 'reading' } 
        });
    };

    const handleStartPractice = () => {
        if (!inputText || inputText.length < 10) {
            toast.error('请输入至少 10 个字符的内容。');
            return;
        }
        onNavigate({ 
            view: 'exam', 
            params: { importText: inputText, mode: 'practice' } 
        });
    };

    const handleAction = async () => {
        // Redundant with new buttons, but keeping as a fallback or for batch mode
        setErrorMsg('');
        if (!inputText || inputText.length < 10) {
            setErrorMsg('请输入至少 10 个字符的内容。');
            return;
        }

        setIsAnalyzing(true);
        try {
            if (mode === 'article') {
                setCurrentArticle(inputText);
                let result;
                if (!settings.apiKey) {
                    setProgressMsg('正在模拟分析 (演示中)...');
                    await new Promise((r) => setTimeout(r, 2000));
                    result = DEFAULT_ANALYSIS;
                } else {
                    setProgressMsg('正在分析文章...');
                    result = await analyzeText(inputText, settings);
                }
                setAnalysisResult(result);
                await saveToHistory(inputText, result);
                // Redirect legacy handleAction article path to ExamView
                onNavigate({ 
                    view: 'exam', 
                    params: { importText: inputText, mode: 'practice' } 
                });
            } else {
                setProgressMsg('正在提取词汇表...');
                const cards = await extractVocabulary(inputText, settings);
                const normalized = (Array.isArray(cards) ? cards : [])
                    .map(normalizeVocabItem)
                    .filter((item) => item.word || item.meaning);

                if (normalized.length === 0) {
                    throw new Error('未发现有效词汇。请更换文本重试。');
                }

                setVocabList(normalized);
                setProgressMsg('词汇提取完成。');
            }
        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || 'Unknown error.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const updateVocabRow = (index, key, value) => {
        setVocabList((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
    };

    const removeVocabRow = (index) => {
        setVocabList((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSaveCards = async () => {
        if (!vocabList) return;
        setIsAnalyzing(true);
        setProgressMsg('正在保存闪卡...');

        try {
            let targetFolderId = selectedFolderId;

            if (selectedFolderId === 'new' && newFolderName.trim()) {
                const id = crypto.randomUUID();
                await dbSaveFolder({ id, name: newFolderName.trim(), type: 'user' });
                targetFolderId = id;
            } else if (selectedFolderId === 'daily') {
                const dateStr = new Date().toLocaleDateString();
                const existing = folders.find((f) => f.name === dateStr);
                if (existing) {
                    targetFolderId = existing.id;
                } else {
                    const id = crypto.randomUUID();
                    await dbSaveFolder({ id, name: dateStr, type: 'system' });
                    targetFolderId = id;
                }
            }

            let count = 0;
            for (const item of vocabList) {
                const word = (item.word || '').trim();
                const meaning = (item.meaning || '').trim();
                if (!word || !meaning) continue;

                await saveFlashcard({
                    id: crypto.randomUUID(),
                    front: buildFrontText(item),
                    back: meaning,
                    folderId: targetFolderId,
                    tags: [],
                    createdAt: Date.now() + count,
                    nextReview: Date.now(),
                    interval: 1,
                    repetitions: 0
                });
                count += 1;
            }

            toast.success(`成功导入 ${count} 张闪卡。`);
            setVocabList(null);
            setInputText('');
            await loadFolderList();
        } catch (e) {
            toast.error(`保存失败: ${e.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className={`space-y-4 md:space-y-6 animate-fade-in ${isMobile ? 'h-[calc(100vh-80px)]' : 'h-[calc(100vh-100px)]'} flex flex-col`}>
            <div className={`bg-phy-glass rounded-[1.5rem] md:rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-phy-border flex-1 flex flex-col ${isMobile ? 'p-4 pb-20' : 'p-8 md:p-10'} relative overflow-hidden`}>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".txt,.md,.csv,.json,.pdf"
                    className="hidden"
                />
                <input
                    type="file"
                    ref={mediaInputRef}
                    onChange={handleMediaUpload}
                    accept=".mp3,.wav,.webm,.opus,.pcm"
                    className="hidden"
                />

                <div className="mb-6 flex justify-between items-center">
                    <div className="flex bg-phy-bg rounded-xl p-1">
                        <button
                            onClick={() => {
                                setMode('article');
                                setVocabList(null);
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'article' ? 'bg-phy-glass text-blue-600 shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                        >
                            文章分析
                        </button>
                        <button
                            onClick={() => setMode('vocab')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'vocab' ? 'bg-phy-glass text-amber-600 shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                        >
                            批量导入单词
                        </button>
                    </div>
                </div>

                {vocabList ? (
                    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
                        <h3 className="text-lg font-bold text-phy-text mb-4 flex items-center gap-2">
                            <CheckCircle className="text-emerald-500" />
                            已提取 {vocabList.length} 个条目。保存前可进行编辑。
                        </h3>

                        <div className="flex flex-wrap gap-4 mb-4 items-end bg-phy-bg p-4 rounded-xl border border-phy-border">
                            <div>
                                <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-1">目标文件夹</label>
                                <select
                                    value={selectedFolderId}
                                    onChange={(e) => setSelectedFolderId(e.target.value)}
                                    className="bg-phy-glass border border-phy-border rounded-lg px-3 py-2 text-sm outline-none w-48 font-medium text-phy-text"
                                >
                                    <option value="daily">今日默认文件夹</option>
                                    {folders.map((folder) => (
                                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                                    ))}
                                    <option value="new">创建新文件夹...</option>
                                </select>
                            </div>

                            {selectedFolderId === 'new' && (
                                <div className="animate-in fade-in slide-in-from-left-2">
                                    <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-1">新文件夹名称</label>
                                    <input
                                        type="text"
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        placeholder="例如：雅思核心词汇"
                                        className="bg-phy-glass border border-phy-border rounded-lg px-3 py-2 text-sm outline-none w-48 text-phy-text"
                                    />
                                </div>
                            )}

                            <div className="flex-1" />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setVocabList(null)}
                                    className="px-4 py-2 text-phy-muted hover:bg-phy-bg rounded-lg text-sm font-bold"
                                >
                                    返回
                                </button>
                                <button
                                    onClick={handleSaveCards}
                                    className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-200"
                                >
                                    确认导入
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar border rounded-xl bg-phy-bg">
                            {!isMobile && (
                                <div className="grid grid-cols-[56px_1.1fr_1fr_1.6fr_40px] px-4 py-2 text-[11px] font-bold text-phy-muted uppercase tracking-wide border-b border-phy-border">
                                    <div>#</div>
                                    <div>单词</div>
                                    <div>读音</div>
                                    <div>释义</div>
                                    <div />
                                </div>
                            )}
                            <div className={isMobile ? 'space-y-3 p-2' : ''}>
                                {vocabList.map((item, idx) => (
                                    <div 
                                        key={idx} 
                                        className={isMobile 
                                            ? "bg-phy-glass border border-phy-border rounded-xl p-3 flex flex-col gap-3 relative animate-in slide-in-from-bottom-2"
                                            : "grid grid-cols-[56px_1.1fr_1fr_1.6fr_40px] gap-2 px-4 py-3 border-b border-phy-border last:border-b-0"
                                        }
                                    >
                                        {!isMobile && (
                                            <div className="w-8 h-8 rounded-full bg-phy-glass flex items-center justify-center text-xs font-bold text-phy-muted mt-1">
                                                {idx + 1}
                                            </div>
                                        )}
                                        
                                        <div className={isMobile ? "flex items-center gap-2" : "contents"}>
                                            {isMobile && <span className="text-[10px] font-bold text-phy-accent bg-phy-accentGlass px-2 py-0.5 rounded-full">{idx + 1}</span>}
                                            <input
                                                value={item.word}
                                                onChange={(e) => updateVocabRow(idx, 'word', e.target.value)}
                                                className={`px-3 py-2 rounded-lg bg-phy-glass border border-phy-border text-sm font-bold text-phy-text outline-none focus:border-phy-accent ${isMobile ? 'flex-1' : ''}`}
                                                placeholder="单词"
                                            />
                                        </div>

                                        <input
                                            value={item.phonetic}
                                            onChange={(e) => updateVocabRow(idx, 'phonetic', e.target.value)}
                                            className="px-3 py-2 rounded-lg bg-phy-glass border border-phy-border text-xs text-phy-text outline-none focus:border-phy-accent"
                                            placeholder="音标/读音"
                                        />
                                        <textarea
                                            value={item.meaning}
                                            onChange={(e) => updateVocabRow(idx, 'meaning', e.target.value)}
                                            className="px-3 py-2 rounded-lg bg-phy-glass border border-phy-border text-sm text-phy-text outline-none focus:border-phy-accent resize-none min-h-[60px]"
                                            placeholder="中文释义"
                                        />
                                        <button
                                            onClick={() => removeVocabRow(idx)}
                                            className={isMobile 
                                                ? "absolute top-2 right-2 p-2 text-rose-500 bg-rose-500/10 rounded-full" 
                                                : "text-phy-muted hover:text-red-500 p-1 self-start mt-1"
                                            }
                                            title="remove"
                                        >
                                            <AlertCircle size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <textarea
                            className="flex-1 w-full bg-phy-bg rounded-xl p-6 border-0 focus:ring-2 focus:ring-blue-500/20 resize-none font-sans text-phy-text text-lg leading-relaxed mb-6 outline-none transition-all placeholder:text-phy-muted"
                            placeholder={mode === 'article' ? '在此粘贴文章内容进行分析...' : '在此粘贴单词列表或文章，AI 将提取出可编辑的 单词 + 发音 + 释义...'}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                        />

                        <div className={`flex ${isMobile ? 'flex-col gap-4' : 'justify-between items-center'} bg-phy-bg/50 p-4 rounded-2xl border border-phy-border`}>
                            <div className={`flex ${isMobile ? 'justify-around' : 'gap-4'}`}>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-phy-muted hover:text-blue-500 flex items-center gap-2 text-sm font-bold transition-all px-3 py-2 rounded-xl hover:bg-blue-500/10"
                                >
                                    <Upload size={18} />
                                    上传文件
                                </button>
                                <button
                                    onClick={() => mediaInputRef.current?.click()}
                                    className="text-phy-muted hover:text-purple-500 flex items-center gap-2 text-sm font-bold transition-all px-3 py-2 rounded-xl hover:bg-purple-500/10"
                                >
                                    <Mic size={18} />
                                    上传媒体
                                </button>
                            </div>

                            <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-3`}>
                                {isAnalyzing && (
                                    <div className="text-blue-500 text-sm flex items-center justify-center gap-2 px-3">
                                        <Loader2 size={16} className="animate-spin" />
                                        {progressMsg || '正在处理...'}
                                    </div>
                                )}
                                
                                {mode === 'article' ? (
                                    <div className={`flex ${isMobile ? 'flex-col' : 'gap-3'}`}>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleSaveToNotes}
                                                disabled={isAnalyzing}
                                                className="flex-1 px-4 py-3 rounded-xl border border-phy-border hover:bg-phy-glass transition-all flex items-center justify-center gap-2 text-phy-muted hover:text-phy-text font-bold text-xs"
                                            >
                                                <Save size={16} />
                                                存入笔记
                                            </button>
                                            <button
                                                onClick={handleJustReading}
                                                disabled={isAnalyzing}
                                                className="flex-1 px-4 py-3 rounded-xl border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-all flex items-center justify-center gap-2 font-bold text-xs"
                                            >
                                                <BookMarked size={16} />
                                                纯粹阅读
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleStartPractice}
                                            disabled={isAnalyzing}
                                            className="w-full px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Sparkles size={18} />
                                            🚀 开始刷题
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleAction}
                                        disabled={isAnalyzing}
                                        className="w-full px-10 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-lg shadow-amber-900/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
                                        提取词汇
                                    </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ImportView;
