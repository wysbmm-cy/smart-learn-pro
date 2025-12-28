import React, { useState, useRef, useEffect } from 'react';
import { Upload, FastForward, Sparkles, Loader2, AlertCircle, Mic, CheckCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { analyzeText, transcribeAudio } from '../services/ai';
import { extractTextFromPDF } from '../services/pdf';

const ImportView = ({ onAnalyzeSuccess }) => {
    const {
        settings, setCurrentArticle, setAnalysisResult, DEFAULT_ANALYSIS,
        // Persistence
        importText: inputText, setImportText: setInputText,
        isAnalyzing, setIsAnalyzing,
        // DB
        saveToHistory, saveToFileLibrary, saveToNotes
    } = useApp();

    const [errorMsg, setErrorMsg] = useState("");
    const [progressMsg, setProgressMsg] = useState("");

    const fileInputRef = useRef(null);
    const mediaInputRef = useRef(null);

    // ... (useEffect for timer skipped) ...

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Save to Library
        try {
            await saveToFileLibrary({
                name: file.name,
                type: file.type || 'text/plain',
                blob: file
            });
        } catch (e) {
            console.error("Library save failed", e);
        }

        if (file.type === "application/pdf") {
            setIsAnalyzing(true);
            setProgressMsg("Extracting text from PDF...");
            try {
                const text = await extractTextFromPDF(file);
                setInputText(text);
                setProgressMsg("PDF Text Extracted!");
            } catch (err) {
                console.error(err);
                alert("PDF Extraction Failed: " + err.message);
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

        // Save to Library
        try {
            await saveToFileLibrary({
                name: file.name,
                type: file.type || 'audio/mpeg', // Fallback
                blob: file
            });
        } catch (e) {
            console.error("Library save failed", e);
        }

        setIsAnalyzing(true);
        setErrorMsg("");
        setProgressMsg("Extracting audio content (Whisper AI)...");

        try {
            const text = await transcribeAudio(file, settings);
            setInputText(prev => prev + (prev ? "\n\n" : "") + text);
            setProgressMsg("Transcription successful!");

            // Auto-save this transcription event to history? Maybe wait for full analysis.

        } catch (err) {
            console.error(err);
            setErrorMsg("Transcription failed: " + err.message);
        } finally {
            setIsAnalyzing(false);
            event.target.value = null;
        }
    };

    const handleAnalyze = async () => {
        setErrorMsg('');
        if (!inputText || inputText.length < 10) {
            setErrorMsg("Please enter at least 10 characters.");
            return;
        }

        setIsAnalyzing(true);
        setCurrentArticle(inputText);

        try {
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

            // Save to History
            await saveToHistory(inputText, result);

            onAnalyzeSuccess();

        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || "Unknown Error");
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

                <div className="mb-4 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800">输入文本</h3>
                    <div className="flex gap-2">
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200">
                            <Sparkles size={14} className="inline mr-1" /> 并行加速引擎已激活
                        </span>
                    </div>
                </div>

                <textarea
                    className="flex-1 w-full bg-slate-50 rounded-xl p-6 border-0 focus:ring-2 focus:ring-blue-500/20 resize-none font-sans text-slate-700 text-lg leading-relaxed mb-6 outline-none transition-all placeholder:text-slate-400"
                    placeholder="在此粘贴英语文章、字幕或论文摘要..."
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
                            识别音视频
                        </button>
                    </div>

                    <input
                        type="file"
                        ref={mediaInputRef}
                        onChange={handleMediaUpload}
                        accept=".mp3,.wav,.webm,.opus,.pcm"
                        className="hidden"
                    />

                    <div className="flex items-center gap-4">
                        {errorMsg && (
                            <div className="text-red-500 text-sm flex items-center gap-1 animate-pulse font-medium bg-red-50 px-3 py-1 rounded-full">
                                <AlertCircle size={14} />
                                {errorMsg}
                            </div>
                        )}

                        <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className={`px-8 py-3.5 rounded-full font-bold text-white flex items-center gap-2 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 min-w-[200px] justify-center ${isAnalyzing ? 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none' :
                                'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
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
                                    <span>开始智能分析</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImportView;
