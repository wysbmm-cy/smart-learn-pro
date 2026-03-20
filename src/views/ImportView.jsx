import React, { useState, useRef, useEffect } from 'react';
import { Upload, Sparkles, Loader2, AlertCircle, Mic, CheckCircle } from 'lucide-react';
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

const ImportView = ({ onAnalyzeSuccess }) => {
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

    useEffect(() => {
        loadFolderList();
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
            setProgressMsg('Extracting text from PDF...');
            try {
                const text = await extractTextFromPDF(file);
                setInputText(text);
                setProgressMsg('PDF text extracted.');
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
        setProgressMsg('Transcribing audio...');

        try {
            const text = await transcribeAudio(file, settings);
            setInputText((prev) => prev + (prev ? '\n\n' : '') + text);
            setProgressMsg('Transcription completed.');
        } catch (err) {
            setErrorMsg(`Transcription failed: ${err.message}`);
        } finally {
            setIsAnalyzing(false);
            event.target.value = null;
        }
    };

    const handleAction = async () => {
        setErrorMsg('');
        if (!inputText || inputText.length < 10) {
            setErrorMsg('Please input at least 10 characters.');
            return;
        }

        setIsAnalyzing(true);

        try {
            if (mode === 'article') {
                setCurrentArticle(inputText);
                let result;
                if (!settings.apiKey) {
                    setProgressMsg('Simulating analysis (Demo)...');
                    await new Promise((r) => setTimeout(r, 2000));
                    result = DEFAULT_ANALYSIS;
                } else {
                    setProgressMsg('Analyzing article...');
                    result = await analyzeText(inputText, settings);
                }
                setAnalysisResult(result);
                await saveToHistory(inputText, result);
                onAnalyzeSuccess();
            } else {
                setProgressMsg('Extracting vocabulary...');
                const cards = await extractVocabulary(inputText, settings);
                const normalized = (Array.isArray(cards) ? cards : [])
                    .map(normalizeVocabItem)
                    .filter((item) => item.word || item.meaning);

                if (normalized.length === 0) {
                    throw new Error('No vocabulary found. Try different text.');
                }

                setVocabList(normalized);
                setProgressMsg('Vocabulary extraction completed.');
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
        setProgressMsg('Saving flashcards...');

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

            toast.success(`Imported ${count} flashcards.`);
            setVocabList(null);
            setInputText('');
            await loadFolderList();
        } catch (e) {
            toast.error(`Save failed: ${e.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in h-[calc(100vh-100px)] flex flex-col">
            <div className="bg-phy-glass rounded-[2rem] shadow-xl shadow-slate-200/50 border border-phy-border flex-1 flex flex-col p-8 md:p-10 relative overflow-hidden">
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
                            Article Analysis
                        </button>
                        <button
                            onClick={() => setMode('vocab')}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'vocab' ? 'bg-phy-glass text-amber-600 shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                        >
                            Batch Import Words
                        </button>
                    </div>
                </div>

                {vocabList ? (
                    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
                        <h3 className="text-lg font-bold text-phy-text mb-4 flex items-center gap-2">
                            <CheckCircle className="text-emerald-500" />
                            {vocabList.length} entries extracted. Edit before save.
                        </h3>

                        <div className="flex flex-wrap gap-4 mb-4 items-end bg-phy-bg p-4 rounded-xl border border-phy-border">
                            <div>
                                <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-1">Target Folder</label>
                                <select
                                    value={selectedFolderId}
                                    onChange={(e) => setSelectedFolderId(e.target.value)}
                                    className="bg-phy-glass border border-phy-border rounded-lg px-3 py-2 text-sm outline-none w-48 font-medium text-phy-text"
                                >
                                    <option value="daily">Today Default Folder</option>
                                    {folders.map((folder) => (
                                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                                    ))}
                                    <option value="new">Create New Folder...</option>
                                </select>
                            </div>

                            {selectedFolderId === 'new' && (
                                <div className="animate-in fade-in slide-in-from-left-2">
                                    <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-1">New Folder Name</label>
                                    <input
                                        type="text"
                                        value={newFolderName}
                                        onChange={(e) => setNewFolderName(e.target.value)}
                                        placeholder="e.g. IELTS Week 3"
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
                                    Back
                                </button>
                                <button
                                    onClick={handleSaveCards}
                                    className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-emerald-200"
                                >
                                    Save Import
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar border rounded-xl bg-phy-bg">
                            <div className="grid grid-cols-[56px_1.1fr_1fr_1.6fr_40px] px-4 py-2 text-[11px] font-bold text-phy-muted uppercase tracking-wide border-b border-phy-border">
                                <div>#</div>
                                <div>Word</div>
                                <div>Phonetic</div>
                                <div>Meaning</div>
                                <div />
                            </div>
                            {vocabList.map((item, idx) => (
                                <div key={idx} className="grid grid-cols-[56px_1.1fr_1fr_1.6fr_40px] gap-2 px-4 py-3 border-b border-phy-border last:border-b-0">
                                    <div className="w-8 h-8 rounded-full bg-phy-glass flex items-center justify-center text-xs font-bold text-phy-muted mt-1">
                                        {idx + 1}
                                    </div>
                                    <input
                                        value={item.word}
                                        onChange={(e) => updateVocabRow(idx, 'word', e.target.value)}
                                        className="px-3 py-2 rounded-lg bg-phy-glass border border-phy-border text-sm text-phy-text outline-none focus:border-phy-accent"
                                        placeholder="word"
                                    />
                                    <input
                                        value={item.phonetic}
                                        onChange={(e) => updateVocabRow(idx, 'phonetic', e.target.value)}
                                        className="px-3 py-2 rounded-lg bg-phy-glass border border-phy-border text-sm text-phy-text outline-none focus:border-phy-accent"
                                        placeholder="f??n?t?k"
                                    />
                                    <textarea
                                        value={item.meaning}
                                        onChange={(e) => updateVocabRow(idx, 'meaning', e.target.value)}
                                        className="px-3 py-2 rounded-lg bg-phy-glass border border-phy-border text-sm text-phy-text outline-none focus:border-phy-accent resize-y min-h-[40px] max-h-32"
                                        placeholder="中文释义"
                                    />
                                    <button
                                        onClick={() => removeVocabRow(idx)}
                                        className="text-phy-muted hover:text-red-500 p-1 self-start mt-1"
                                        title="remove"
                                    >
                                        <AlertCircle size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <textarea
                            className="flex-1 w-full bg-phy-bg rounded-xl p-6 border-0 focus:ring-2 focus:ring-blue-500/20 resize-none font-sans text-phy-text text-lg leading-relaxed mb-6 outline-none transition-all placeholder:text-phy-muted"
                            placeholder={mode === 'article' ? 'Paste article content for analysis...' : 'Paste word list/article text to extract editable Word + Phonetic + Meaning...'}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                        />

                        <div className="flex justify-between items-center">
                            <div className="flex gap-4">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-phy-muted hover:text-blue-600 flex items-center gap-2 text-sm font-medium transition-colors px-2"
                                >
                                    <Upload size={18} />
                                    Upload File
                                </button>
                                <button
                                    onClick={() => mediaInputRef.current?.click()}
                                    className="text-phy-muted hover:text-purple-600 flex items-center gap-2 text-sm font-medium transition-colors px-2"
                                >
                                    <Mic size={18} />
                                    Upload Media
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
                                    className={`px-8 py-3.5 rounded-full font-bold text-white flex items-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 min-w-[220px] justify-center ${isAnalyzing
                                        ? 'bg-slate-300 cursor-not-allowed text-phy-muted shadow-none'
                                        : mode === 'article'
                                            ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                                            : 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
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
                                            <span>{mode === 'article' ? 'Start Analysis' : 'Extract Vocabulary'}</span>
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
