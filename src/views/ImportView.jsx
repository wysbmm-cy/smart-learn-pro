import React, { useState, useRef, useEffect } from 'react';
import { Upload, FastForward, Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { analyzeText } from '../services/ai';

const ImportView = ({ onAnalyzeSuccess }) => {
    const { settings, setCurrentArticle, setAnalysisResult, DEFAULT_ANALYSIS } = useApp();

    const [inputText, setInputText] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progressMsg, setProgressMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    const fileInputRef = useRef(null);

    useEffect(() => {
        let interval;
        if (isAnalyzing) {
            const messages = [
                "正在连接 AI 大脑...",
                "正在阅读上下文...",
                "正在提取核心词汇...",
                "正在构建知识图谱...",
                "从知识库中检索...",
            ];
            let i = 0;
            interval = setInterval(() => {
                i = (i + 1) % messages.length;
                setProgressMsg(messages[i]);
            }, 1500);
        }
        return () => clearInterval(interval);
    }, [isAnalyzing]);

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.type === "application/pdf") {
            alert("PDF 解析暂仅支持复制粘贴。\n建议：请直接复制 PDF 中的文本内容粘贴到输入框。");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => setInputText(e.target.result);
        reader.readAsText(file);
    };

    const handleAnalyze = async () => {
        setErrorMsg('');
        if (!inputText || inputText.length < 10) {
            setErrorMsg("请至少输入 10 个字符的内容。");
            return;
        }

        setIsAnalyzing(true);
        setCurrentArticle(inputText);

        try {
            if (!settings.apiKey) {
                setProgressMsg("正在使用演示模型模拟...");
                await new Promise(r => setTimeout(r, 2000));
                setAnalysisResult(DEFAULT_ANALYSIS);
                onAnalyzeSuccess();
                return;
            }

            setProgressMsg("正在连接 AI 服务 (并行处理中)...");
            const result = await analyzeText(inputText, settings);
            setAnalysisResult(result);
            onAnalyzeSuccess();

        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || "未知错误");
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
                    accept=".txt,.md,.csv,.json"
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
                    className="flex-1 w-full bg-slate-50 rounded-xl p-6 border-0 focus:ring-2 focus:ring-blue-500/20 resize-none font-mono text-slate-600 text-sm leading-relaxed mb-6 outline-none transition-all placeholder:text-slate-300"
                    placeholder="在此粘贴英语文章、字幕或论文摘要..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                />

                <div className="flex justify-between items-center">
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="text-slate-500 hover:text-blue-600 flex items-center gap-2 text-sm font-medium transition-colors px-2"
                    >
                        <Upload size={18} />
                        上传文件
                    </button>

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
