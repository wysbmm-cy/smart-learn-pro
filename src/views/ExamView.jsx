import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { digitalizeExam } from '../services/ai';
import { extractTextFromPDF } from '../services/pdf';
import { Upload, FileText, Loader2, CheckCircle, Play, PenTool, Layout, ChevronRight, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const ExamView = ({ onNavigate }) => {
    const { settings } = useApp();
    const [fileWork, setFileWork] = useState(null); // { name, text, size }
    const [isParsing, setIsParsing] = useState(false);
    const [examData, setExamData] = useState(null);
    const [userAnswers, setUserAnswers] = useState({}); // { qId: 'A' }

    // Reusing logic (simplified)
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setFileWork({ name: file.name, text: 'Parsing PDF...', size: file.size });
        setIsParsing(true);

        try {
            let text = '';
            if (file.type === 'application/pdf') {
                text = await extractTextFromPDF(file);
            } else {
                text = await file.text();
            }
            setFileWork({ name: file.name, text, size: file.size });
            // Auto start digitalization
            startDigitalization(text);
        } catch (err) {
            toast.error("File Read Error: " + err.message);
            setFileWork(null);
            setIsParsing(false);
        }
    };

    const startDigitalization = async (text) => {
        try {
            toast.loading("正在生成试卷... (AI Digitizing)", { id: 'exam_gen' });
            const data = await digitalizeExam(text, settings);
            setExamData(data);
            toast.success("试卷生成完毕!", { id: 'exam_gen' });
        } catch (e) {
            toast.error("生成失败: " + e.message, { id: 'exam_gen' });
        } finally {
            setIsParsing(false);
        }
    };

    const handleAnswerSelect = (qId, optionKey) => {
        setUserAnswers(prev => ({ ...prev, [qId]: optionKey }));
    };

    const handleGoToWriter = (prompt) => {
        // "Cheat" / Bridge: Pre-fill writer content via localStorage, which WriterView reads ONCE on mount (or we update WriterView to listen)
        // Actually WriterView reads persistent draft.
        // Let's set a "template" or "prompt" in LS
        if (window.confirm("这将覆盖当前的写作草稿，确定去写作台编写吗？")) {
            localStorage.setItem('draft_writer_content', `Task: ${prompt}\n\n[Start writing here...]`);
            localStorage.setItem('draft_writer_title', `Exam Essay - ${new Date().toLocaleDateString()}`);
            onNavigate('writer');
        }
    };

    if (!examData) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
                <div className="text-center space-y-4 max-w-lg">
                    <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-blue-600 mb-6">
                        <FileText size={40} />
                    </div>
                    <h2 className="text-3xl font-bold text-slate-800">AI 模拟考场 (Exam Simulator)</h2>
                    <p className="text-slate-500 leading-relaxed">
                        上传您的 PDF 试卷 (如四六级真题)，AI 将自动将其转化为在线交互式试卷。<br />支持选择题自动批改、阅读分屏、作文一键润色。
                    </p>

                    <div className="mt-8 border-2 border-dashed border-slate-300 rounded-2xl p-8 hover:bg-slate-50 transition-colors cursor-pointer relative group">
                        <input
                            type="file"
                            accept=".pdf,.txt"
                            onChange={handleFileUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            disabled={isParsing}
                        />
                        {isParsing ? (
                            <div className="flex flex-col items-center gap-3 text-blue-600">
                                <Loader2 size={32} className="animate-spin" />
                                <span className="font-bold">正在 AI 数字化试卷...</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3 text-slate-400 group-hover:text-blue-500">
                                <Upload size={32} />
                                <span className="font-bold">点击上传试卷 (PDF/TXT)</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-50/50">
            {/* Header */}
            <div className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 text-white p-2 rounded-lg"><FileText size={18} /></div>
                    <h2 className="font-bold text-slate-800">{examData.title || "My Exam"}</h2>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-bold">AI Generated</span>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setExamData(null)}
                        className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        退出考试
                    </button>
                    <button
                        onClick={() => toast.success("暂未实现在线评分(除作文外)，请自我核对！")}
                        className="px-4 py-2 text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors shadow-lg shadow-slate-900/20"
                    >
                        交卷 (Submit)
                    </button>
                </div>
            </div>

            {/* Exam Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {examData.sections?.map((section, sIdx) => (
                    <div key={sIdx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        {/* Section Header */}
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <span className="uppercase text-xs font-bold text-blue-600 tracking-wider block mb-1">{section.type} SECTION</span>
                                <h3 className="font-bold text-slate-700">{section.instructions || "Answer the following questions"}</h3>
                            </div>
                        </div>

                        <div className={`p-0 ${section.type === 'reading' ? 'lg:flex h-[600px]' : ''}`}>
                            {/* Content (For Reading/Listening) */}
                            {section.content && (
                                <div className={`bg-slate-50/50 p-6 border-r border-slate-100 overflow-y-auto leading-loose text-slate-600 font-serif text-lg ${section.type === 'reading' ? 'flex-1 custom-scrollbar' : 'border-b'}`}>
                                    {section.content.split('\n').map((para, i) => (
                                        <p key={i} className="mb-4">{para}</p>
                                    ))}
                                </div>
                            )}

                            {/* Questions */}
                            <div className={`${section.type === 'reading' ? 'flex-1 overflow-y-auto h-full' : ''} p-6 space-y-8`}>
                                {/* Writing Special Case */}
                                {section.type === 'writing' && (
                                    <div className="space-y-4">
                                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-900 text-sm">
                                            💡 提示: 您可以直接点击下方按钮，将此题目带入 AI 写作工作台进行专业写作和润色。
                                        </div>
                                        <button
                                            onClick={() => handleGoToWriter(section.content || section.instructions)}
                                            className="w-full py-4 border-2 border-dashed border-blue-200 rounded-xl flex flex-col items-center justify-center gap-2 text-blue-600 hover:bg-blue-50 transition-colors font-bold group"
                                        >
                                            <PenTool className="group-hover:scale-110 transition-transform" />
                                            前往 AI 写作台作答 (Open Writer)
                                        </button>
                                    </div>
                                )}

                                {/* MCQ Questions */}
                                {section.questions?.map((q, qIdx) => (
                                    <div key={q.id || qIdx} className="space-y-3">
                                        <div className="flex gap-3">
                                            <span className="font-bold text-slate-400 select-none">{qIdx + 1}.</span>
                                            <p className="font-bold text-slate-800">{q.text}</p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2 pl-8">
                                            {q.options?.map((opt, optIdx) => {
                                                const optKey = String.fromCharCode(65 + optIdx); // A, B, C...
                                                const isSelected = userAnswers[`${sIdx}-${q.id}`] === optKey;
                                                return (
                                                    <label
                                                        key={optIdx}
                                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isSelected
                                                            ? 'border-blue-500 bg-blue-50'
                                                            : 'border-slate-100 hover:bg-slate-50 hover:border-slate-300'
                                                            }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={`q-${sIdx}-${q.id}`}
                                                            className="hidden"
                                                            onChange={() => handleAnswerSelect(`${sIdx}-${q.id}`, optKey)}
                                                        />
                                                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold transition-colors ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 text-slate-400'
                                                            }`}>
                                                            {optKey}
                                                        </div>
                                                        <span className="text-sm text-slate-600">{opt}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ExamView;
