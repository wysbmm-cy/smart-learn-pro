import React, { useState, useRef, useEffect } from 'react';
import { Upload, FastForward, Sparkles, Loader2, AlertCircle, Mic, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { analyzeText, transcribeAudio, extractVocabulary } from '../services/ai';
import { extractTextFromPDF } from '../services/pdf';
import { saveFlashcard, saveFolder as dbSaveFolder, getFolders } from '../services/db';
import toast from 'react-hot-toast';

const ImportView = ({ onAnalyzeSuccess }) => {
    const {
        settings, setCurrentArticle, setAnalysisResult, DEFAULT_ANALYSIS,
        // Persistence
        importText: inputText, setImportText: setInputText,
        isAnalyzing, setIsAnalyzing,
        // DB
        saveToHistory, saveToFileLibrary, saveToNotes,
        // Flashcards
        loadFolders // Assuming these are exposed in context or we import directly
    } = useApp();

    // Direct imports needed for this view


    const [mode, setMode] = useState('article'); // 'article' | 'vocab'
    const [errorMsg, setErrorMsg] = useState("");
    const [progressMsg, setProgressMsg] = useState("");

    // Vocab Batch State
    const [vocabList, setVocabList] = useState(null); // Array of {front, back}
    const [folders, setFolders] = useState([]);
    const [selectedFolderId, setSelectedFolderId] = useState('daily');
    const [newFolderName, setNewFolderName] = useState('');

    const fileInputRef = useRef(null);
    const mediaInputRef = useRef(null);

    useEffect(() => {
        loadFolderList();
    }, []);

    const loadFolderList = async () => {
        try {
            const list = await getFolders();
            setFolders(list);
        } catch (e) {
            console.error("Failed to load folders", e);
        }
    };

    // ... (rest of file upload logic handles) ...

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Save to Library (Shared)
        try {
            await saveToFileLibrary({
                name: file.name,
                type: file.type || 'text/plain',
                blob: file
            });
        } catch (e) { console.error(e) }

        if (file.type === "application/pdf") {
            setIsAnalyzing(true);
            setProgressMsg("Extracting text from PDF...");
            try {
                const text = await extractTextFromPDF(file);
                setInputText(text);
                setProgressMsg("PDF Text Extracted!");
            } catch (err) {
                toast.error("PDF 提取失败: " + err.message);
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
            setErrorMsg("File too large (>25MB).");
            return;
        }

        // Save to Library Logic
        try {
            await saveToFileLibrary({
                name: file.name,
                type: file.type || 'audio/webm',
                blob: file
            });
        } catch (e) {
            console.error("Auto-save to library failed:", e);
            // Don't block transcription, just log it
        }

        setIsAnalyzing(true);
        setErrorMsg("");
        setProgressMsg("Transcribing audio (Whisper AI)...");

        try {
            const text = await transcribeAudio(file, settings);
            setInputText(prev => prev + (prev ? "\n\n" : "") + text);
            setProgressMsg("Transcription successful!");
        } catch (err) {
            setErrorMsg("Transcription failed: " + err.message);
        } finally {
            setIsAnalyzing(false);
            event.target.value = null;
        }
    };

    const handleAction = async () => {
        setErrorMsg('');
        if (!inputText || inputText.length < 10) {
            setErrorMsg("Please enter at least 10 characters.");
            return;
        }

        setIsAnalyzing(true);

        try {
            if (mode === 'article') {
                // ... Existing Analysis Logic ...
                setCurrentArticle(inputText);
                let result;
                if (!settings.apiKey) {
                    setProgressMsg("Simulating analysis (Demo)...");
                    await new Promise(r => setTimeout(r, 2000));
                    result = DEFAULT_ANALYSIS;
                } else {
                    setProgressMsg("Connecting to AI Brain...");
                    result = await analyzeText(inputText, settings);
                }
                setAnalysisResult(result);
                await saveToHistory(inputText, result);
                onAnalyzeSuccess();

            } else {
                // ... Vocab Batch Logic ...
                setProgressMsg("AI is identifying vocabulary...");
                const cards = await extractVocabulary(inputText, settings);
                if (!Array.isArray(cards) || cards.length === 0) {
                    throw new Error("No vocabulary found. Try different text.");
                }
                setVocabList(cards);
                setProgressMsg("Extraction Complete!");
            }

        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || "Unknown Error");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSaveCards = async () => {
        if (!vocabList) return;
        setIsAnalyzing(true);
        setProgressMsg("Saving flashcards...");

        try {
            let targetFolderId = selectedFolderId;

            // Create Folder if 'new' or 'daily' (if daily logic requires it, but for now 'daily' creates a tagged folder? 
            // Actually user wants 'Default by day', let's just use date string as ID or create a folder named by Date)

            if (selectedFolderId === 'new' && newFolderName.trim()) {
                const id = crypto.randomUUID();
                await dbSaveFolder({ id, name: newFolderName, type: 'user' });
                targetFolderId = id;
            } else if (selectedFolderId === 'daily') {
                // Check if today's folder exists
                const dateStr = new Date().toLocaleDateString();
                const existing = folders.find(f => f.name === dateStr);
                if (existing) {
                    targetFolderId = existing.id;
                } else {
                    const id = crypto.randomUUID();
                    await dbSaveFolder({ id, name: dateStr, type: 'system' });
                    targetFolderId = id;
                }
            }

            // Save Cards
            let count = 0;
            for (const card of vocabList) {
                await saveFlashcard({
                    id: crypto.randomUUID(),
                    front: card.front,
                    back: card.back,
                    folderId: targetFolderId,
                    tags: [],
                    createdAt: Date.now() + count, // Offset slightly to keep order
                    nextReview: Date.now(),
                    interval: 1,
                    repetitions: 0
                });
                count++;
            }

            toast.success(`成功导入 ${count} 张卡片！`);
            setVocabList(null); // Reset
            setInputText("");
            loadFolderList(); // Refresh folders

        } catch (e) {
            toast.error("保存失败: " + e.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in h-[calc(100vh-100px)] flex flex-col">
            {/* Card Container */}
            <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 flex-1 flex flex-col p-8 md:p-10 relative overflow-hidden">
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

                {/* Header & Tabs */}
                <div className="mb-6 flex justify-between items-center">
                    <div className="flex bg-slate-100 rounded-xl p-1">
                        <button
                            onClick={() => { setMode('article'); setVocabList(null); }}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'article' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            文章深度分析
                        </button>
                        <button
                            onClick={() => setMode('vocab')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'vocab' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            批量单词导入
                        </button>
                    </div>
                </div>

                {vocabList ? (
                    // PREVIEW MODE
                    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
                        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <CheckCircle className="text-emerald-500" />
                            已提取 {vocabList.length} 张卡片
                        </h3>

                        {/* Folder Selection */}
                        <div className="flex flex-wrap gap-4 mb-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">目标文件夹</label>
                                <select
                                    value={selectedFolderId}
                                    onChange={(e) => setSelectedFolderId(e.target.value)}
                                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none w-48 font-medium text-slate-700"
                                >
                                    <option value="daily">📅 每日默认 (今天)</option>
                                    {folders.map(f => (
                                        <option key={f.id} value={f.id}>📁 {f.name}</option>
                                    ))}
                                    <option value="new">✨ 新建文件夹...</option>
                                </select>
                            </div>
                            {selectedFolderId === 'new' && (
                                <div className="animate-in fade-in slide-in-from-left-2">
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">文件夹名称</label>
                                    <input
                                        type="text"
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        placeholder="例如：托福高频词汇"
                                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none w-48"
                                    />
                                </div>
                            )}
                            <div className="flex-1"></div>
                            <div className="flex gap-2">
                                <button onClick={() => setVocabList(null)} className="px-4 py-2 text-slate-400 hover:bg-slate-200 rounded-lg text-sm font-bold">返回</button>
                                <button onClick={handleSaveCards} className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-200">
                                    确认导入
                                </button>
                            </div>
                        </div>

                        {/* List Preview */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar border rounded-xl bg-slate-50">
                            {vocabList.map((card, idx) => (
                                <div key={idx} className="p-4 border-b border-slate-100 last:border-0 hover:bg-white transition-colors flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                                        {idx + 1}
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                                        <div>
                                            <div className="text-[10px] text-slate-400 uppercase font-bold">正面</div>
                                            <div className="font-bold text-slate-800">{card.front}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-400 uppercase font-bold">背面</div>
                                            <div className="text-sm text-slate-600 whitespace-pre-wrap">{card.back}</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setVocabList(prev => prev.filter((_, i) => i !== idx))}
                                        className="text-slate-300 hover:text-red-500 p-1"
                                    >
                                        <AlertCircle size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    // INPUT MODE
                    <>
                        <textarea
                            className="flex-1 w-full bg-slate-50 rounded-xl p-6 border-0 focus:ring-2 focus:ring-blue-500/20 resize-none font-sans text-slate-700 text-lg leading-relaxed mb-6 outline-none transition-all placeholder:text-slate-400"
                            placeholder={mode === 'article' ? "在此粘贴文章内容进行深度分析..." : "在此粘贴 单词表 / PDF 内容以批量提取闪卡..."}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                        />

                        <div className="flex justify-between items-center">
                            <div className="flex gap-4">
                                <button
                                    onClick={() => fileInputRef.current.click()}
                                    className="text-slate-500 hover:text-blue-600 flex items-center gap-2 text-sm font-medium transition-colors px-2"
                                >
                                    <Upload size={18} />
                                    上传文档
                                </button>
                                <button
                                    onClick={() => mediaInputRef.current.click()}
                                    className="text-slate-500 hover:text-purple-600 flex items-center gap-2 text-sm font-medium transition-colors px-2"
                                >
                                    <Mic size={18} />
                                    上传音视频
                                </button>
                            </div>

                            <div className="flex items-center gap-4">
                                {errorMsg && (
                                    <div className="text-red-500 text-sm flex items-center gap-1 animate-pulse font-medium bg-red-50 px-3 py-1 rounded-full">
                                        <AlertCircle size={14} />
                                        {errorMsg}
                                    </div>
                                )}

                                <button
                                    onClick={handleAction}
                                    disabled={isAnalyzing}
                                    className={`px-8 py-3.5 rounded-full font-bold text-white flex items-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 min-w-[200px] justify-center ${isAnalyzing ? 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none' :
                                        (mode === 'article' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-200')
                                        }`}
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            <span className="text-sm">{progressMsg}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles size={18} />
                                            <span>{mode === 'article' ? '开始深度分析' : '提取闪卡'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ImportView;
