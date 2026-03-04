import React, { useState, useRef } from 'react';
import { PenTool, Send, Check, X, ChevronRight, Loader2, RotateCcw } from 'lucide-react';

/**
 * ChatWritingWidget — 内嵌造句练习组件
 * Agent 给出中文情境+目标词，用户在聊天中直接写英文翻译。
 * 提交后将全部答案发回 Agent 进行批改。
 *
 * @param {Object} props
 * @param {Array} props.sentences - [{ chinese, targetWord, hint? }]
 * @param {Function} props.onSubmit - (formattedText) => void  发送给 Agent 批改
 */
const ChatWritingWidget = ({ sentences = [], onSubmit }) => {
    const [answers, setAnswers] = useState(() => sentences.map(() => ''));
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRefs = useRef([]);

    const allFilled = answers.every(a => a.trim().length > 0);
    const currentSentence = sentences[currentIndex];

    const updateAnswer = (index, value) => {
        setAnswers(prev => {
            const next = [...prev];
            next[index] = value;
            return next;
        });
    };

    const handleNext = () => {
        if (currentIndex < sentences.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setTimeout(() => inputRefs.current[currentIndex + 1]?.focus(), 100);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const handleSubmitAll = () => {
        if (!allFilled || isSubmitting) return;
        setIsSubmitting(true);
        setIsSubmitted(true);

        // 构建发给 Agent 的批改请求
        const lines = sentences.map((s, i) =>
            `${i + 1}. 中文: "${s.chinese}" (目标词: ${s.targetWord})\n   我的翻译: "${answers[i]}"`
        ).join('\n\n');

        const feedbackMsg = `[Writing Practice] 请批改我的造句练习：\n\n${lines}\n\n请逐句点评语法、用词是否准确，并给出改进建议。`;

        if (onSubmit) onSubmit(feedbackMsg);
    };

    if (!sentences || sentences.length === 0) return null;

    // 提交后显示等待批改状态
    if (isSubmitted) {
        return (
            <div className="my-3 bg-white border border-blue-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-blue-100">
                    <div className="flex items-center gap-2 text-sm font-bold text-blue-700">
                        <PenTool size={16} />
                        造句练习 — 已提交
                    </div>
                </div>
                <div className="p-4 space-y-2">
                    {sentences.map((s, i) => (
                        <div key={i} className="flex gap-2 items-start text-sm">
                            <span className="text-blue-500 font-bold shrink-0">{i + 1}.</span>
                            <div>
                                <div className="text-slate-500 text-xs mb-0.5">{s.chinese}</div>
                                <div className="text-slate-800 font-medium">{answers[i]}</div>
                            </div>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 text-xs text-blue-500 mt-3 pt-2 border-t border-blue-100">
                        <Loader2 size={12} className="animate-spin" />
                        AI 正在批改中...
                    </div>
                </div>
            </div>
        );
    }

    // 主答题界面
    return (
        <div className="my-3 bg-white border border-blue-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2.5 border-b border-blue-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                        <PenTool size={14} />
                        造句练习
                        <span className="text-blue-400 font-normal">
                            {currentIndex + 1} / {sentences.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {answers.map((a, i) => (
                            <div
                                key={i}
                                className={`w-2.5 h-2.5 rounded-full cursor-pointer transition-all ${i === currentIndex
                                        ? 'bg-blue-500 scale-125'
                                        : a.trim()
                                            ? 'bg-emerald-400'
                                            : 'bg-slate-200'
                                    }`}
                                onClick={() => setCurrentIndex(i)}
                            />
                        ))}
                    </div>
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 h-1 bg-blue-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${(answers.filter(a => a.trim()).length / sentences.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Current Sentence */}
            <div className="p-4 space-y-3">
                {/* Chinese prompt */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="text-xs text-slate-400 font-bold mb-1">中文情境：</div>
                    <div className="text-sm text-slate-700 leading-relaxed">
                        {currentSentence.chinese}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 font-bold">
                            目标词: {currentSentence.targetWord}
                        </span>
                        {currentSentence.hint && (
                            <span className="text-[10px] text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                提示: {currentSentence.hint}
                            </span>
                        )}
                    </div>
                </div>

                {/* Input */}
                <div className="relative">
                    <textarea
                        ref={el => inputRefs.current[currentIndex] = el}
                        value={answers[currentIndex]}
                        onChange={e => updateAnswer(currentIndex, e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (answers[currentIndex].trim() && currentIndex < sentences.length - 1) {
                                    handleNext();
                                }
                            }
                        }}
                        placeholder="Type your English translation here..."
                        className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 
                            focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 outline-none 
                            transition-all resize-none min-h-[60px] placeholder:text-slate-300"
                        autoFocus={currentIndex === 0}
                    />
                </div>

                {/* Navigation */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                        className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 
                            rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        ← 上一句
                    </button>

                    {currentIndex < sentences.length - 1 ? (
                        <button
                            onClick={handleNext}
                            disabled={!answers[currentIndex].trim()}
                            className="flex-1 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 
                                border border-blue-200 rounded-lg transition-all disabled:opacity-30 
                                disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                            下一句 <ChevronRight size={14} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmitAll}
                            disabled={!allFilled}
                            className="flex-1 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-500 to-indigo-600 
                                hover:from-blue-600 hover:to-indigo-700 rounded-lg transition-all disabled:opacity-30 
                                disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm"
                        >
                            <Send size={14} />
                            全部提交，请 AI 批改
                        </button>
                    )}
                </div>

                {/* Quick sentence overview */}
                {sentences.length > 1 && (
                    <div className="border-t border-slate-100 pt-2 space-y-1">
                        {sentences.map((s, i) => (
                            <div
                                key={i}
                                onClick={() => setCurrentIndex(i)}
                                className={`flex items-center gap-2 px-2 py-1 rounded-lg text-xs cursor-pointer transition-all ${i === currentIndex
                                        ? 'bg-blue-50 text-blue-700'
                                        : 'text-slate-400 hover:bg-slate-50'
                                    }`}
                            >
                                <span className="font-bold shrink-0">{i + 1}.</span>
                                <span className="truncate flex-1">
                                    {s.chinese.length > 25 ? s.chinese.slice(0, 25) + '...' : s.chinese}
                                </span>
                                {answers[i].trim() ? (
                                    <Check size={12} className="text-emerald-500 shrink-0" />
                                ) : (
                                    <div className="w-3 h-3 rounded-full border border-slate-300 shrink-0" />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatWritingWidget;
