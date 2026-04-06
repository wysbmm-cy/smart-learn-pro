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
            <div className="my-3 glass-panel border border-phy-border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-phy-glassHeavy backdrop-blur px-4 py-3 border-b border-phy-border">
                    <div className="flex items-center gap-2 text-sm font-bold text-phy-accent">
                        <PenTool size={16} />
                        造句练习 — 已提交
                    </div>
                </div>
                <div className="p-4 space-y-2 bg-phy-bg/30">
                    {sentences.map((s, i) => (
                        <div key={i} className="flex gap-2 items-start text-sm">
                            <span className="text-phy-accent font-bold shrink-0">{i + 1}.</span>
                            <div>
                                <div className="text-phy-muted text-xs mb-0.5">{s.chinese}</div>
                                <div className="text-phy-text font-medium">{answers[i]}</div>
                            </div>
                        </div>
                    ))}
                    <div className="flex items-center gap-2 text-xs text-phy-accent mt-3 pt-2 border-t border-phy-border">
                        <Loader2 size={12} className="animate-spin" />
                        AI 正在批改中...
                    </div>
                </div>
            </div>
        );
    }

    // 主答题界面
    return (
        <div className="my-3 glass-panel border border-phy-border rounded-2xl overflow-hidden shadow-sm relative">
            {/* Header */}
            <div className="bg-phy-glassHeavy backdrop-blur px-4 py-2.5 border-b border-phy-border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-phy-accent">
                        <PenTool size={14} />
                        造句练习
                        <span className="text-phy-muted font-normal ml-1">
                            {currentIndex + 1} / {sentences.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {answers.map((a, i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full cursor-pointer transition-all border ${i === currentIndex
                                    ? 'bg-phy-accent border-phy-accent scale-125'
                                    : a.trim()
                                        ? 'bg-emerald-500 border-emerald-500'
                                        : 'bg-phy-glass border-phy-border'
                                    }`}
                                onClick={() => setCurrentIndex(i)}
                            />
                        ))}
                    </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1 bg-phy-glassHover rounded-full overflow-hidden">
                    <div
                        className="h-full bg-phy-accent rounded-full transition-all duration-500"
                        style={{ width: `${(answers.filter(a => a.trim()).length / sentences.length) * 100}%` }}
                    />
                </div>
            </div>

            {/* Current Sentence */}
            <div className="p-4 space-y-4 bg-phy-bg/30">
                {/* Chinese prompt */}
                <div className="bg-phy-glass border border-phy-border rounded-xl p-3.5 shadow-inner">
                    <div className="text-xs text-phy-muted font-bold mb-1 opacity-80">中文情境：</div>
                    <div className="text-sm text-phy-text leading-relaxed font-medium">
                        {currentSentence.chinese}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <span className="text-[10px] text-phy-text bg-phy-glassLight px-2.5 py-1 rounded-md border border-phy-border font-bold">
                            🎯 目标词: <span className="text-phy-accent">{currentSentence.targetWord}</span>
                        </span>
                        {currentSentence.hint && (
                            <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                                💡 提示: {currentSentence.hint}
                            </span>
                        )}
                    </div>
                </div>

                {/* Input */}
                <div className="relative group">
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
                        className="w-full bg-phy-bg border border-phy-border group-hover:border-phy-borderHover rounded-xl px-4 py-3 text-sm text-phy-text 
                            focus:border-phy-accent outline-none 
                            transition-all resize-none min-h-[70px] placeholder:text-phy-muted shadow-sm"
                        autoFocus={currentIndex === 0}
                    />
                </div>

                {/* Navigation */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
                        className="px-4 py-2.5 text-xs font-bold text-phy-muted bg-phy-glass border border-phy-border hover:bg-phy-glassHover hover:text-phy-text 
                            rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                    >
                        ← 上一句
                    </button>

                    {currentIndex < sentences.length - 1 ? (
                        <button
                            onClick={handleNext}
                            disabled={!answers[currentIndex].trim()}
                            className="flex-1 py-2.5 text-xs font-bold text-white bg-phy-accent hover:opacity-90 
                                rounded-xl transition-all disabled:opacity-30 
                                disabled:cursor-not-allowed flex items-center justify-center gap-1 shadow-md shadow-phy-accent/20 active:scale-95"
                        >
                            下一句 <ChevronRight size={14} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmitAll}
                            disabled={!allFilled}
                            className="flex-1 py-2.5 text-xs font-bold text-white bg-phy-accent 
                                hover:opacity-90 rounded-xl transition-all disabled:opacity-30 
                                disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-md shadow-phy-accent/20 active:scale-95"
                        >
                            <Send size={14} />
                            全部提交，请 AI 批改
                        </button>
                    )}
                </div>

                {/* Quick sentence overview */}
                {sentences.length > 1 && (
                    <div className="border-t border-phy-border pt-3 space-y-1 mt-2">
                        {sentences.map((s, i) => (
                            <div
                                key={i}
                                onClick={() => setCurrentIndex(i)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer transition-all border ${i === currentIndex
                                    ? 'bg-phy-accentGlass border-phy-accent/30 text-phy-accent font-medium'
                                    : 'text-phy-muted border-transparent hover:bg-phy-glassHover hover:text-phy-text'
                                    }`}
                            >
                                <span className="font-bold shrink-0 opacity-80">{i + 1}.</span>
                                <span className="truncate flex-1">
                                    {s.chinese.length > 25 ? s.chinese.slice(0, 25) + '...' : s.chinese}
                                </span>
                                {answers[i].trim() ? (
                                    <Check size={14} className="text-emerald-500 shrink-0" />
                                ) : (
                                    <div className="w-3.5 h-3.5 rounded-full border border-phy-border bg-phy-glass shrink-0" />
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
