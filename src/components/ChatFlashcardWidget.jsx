import React, { useState } from 'react';
import { RotateCcw, Check, X, ChevronLeft, ChevronRight, Layers, Volume2 } from 'lucide-react';

/**
 * ChatFlashcardWidget — 内嵌式闪卡复习组件
 * 在聊天流中渲染可翻转、可评分的微型卡片轮播。
 * 
 * @param {Object} props
 * @param {Array} props.cards - [{ id, front, back, word }]
 * @param {Function} props.onReview - (cardId, quality) => void  // quality: 1=Again, 3=Good
 * @param {Function} props.onComplete - (results) => void
 */
const ChatFlashcardWidget = ({ cards = [], onReview, onComplete }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [results, setResults] = useState([]); // [{ id, word, quality }]
    const [isFinished, setIsFinished] = useState(false);

    const currentCard = cards[currentIndex];
    const progress = cards.length > 0 ? ((currentIndex) / cards.length) * 100 : 0;

    // Extract the core word from "front" text (first line, before phonetic)
    const extractWord = (front) => {
        if (!front) return '';
        return front.split('\n')[0].split('/')[0].trim();
    };

    const handleFlip = () => setIsFlipped(!isFlipped);

    const speak = (text) => {
        if ('speechSynthesis' in window) {
            const word = extractWord(text);
            const utterance = new SpeechSynthesisUtterance(word);
            utterance.lang = 'en-US';
            utterance.rate = 0.85;
            speechSynthesis.speak(utterance);
        }
    };

    const handleGrade = (quality) => {
        const word = extractWord(currentCard.front);
        const newResult = { id: currentCard.id, word, quality };
        const updatedResults = [...results, newResult];
        setResults(updatedResults);

        // Trigger FSRS update
        if (onReview) onReview(currentCard.id, quality);

        // Move to next card or finish
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setIsFlipped(false);
        } else {
            setIsFinished(true);
            if (onComplete) {
                const known = updatedResults.filter(r => r.quality >= 3).length;
                onComplete(
                    `[Flashcard Review] 复习完成！共 ${cards.length} 张卡片，认识 ${known} 张，不认识 ${updatedResults.length - known} 张。`
                );
            }
        }
    };

    if (!cards || cards.length === 0) return null;

    // 完成界面
    if (isFinished) {
        const known = results.filter(r => r.quality >= 3).length;
        const unknown = results.length - known;
        const accuracy = results.length > 0 ? Math.round((known / results.length) * 100) : 0;

        return (
            <div className="my-3 bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3 border-b border-emerald-100">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                        <Layers size={16} />
                        复习完成！
                    </div>
                </div>
                <div className="p-4 space-y-3">
                    {/* Stats */}
                    <div className="flex items-center justify-center gap-6 py-2">
                        <div className="text-center">
                            <div className="text-2xl font-black text-emerald-600">{known}</div>
                            <div className="text-[11px] text-slate-400">认识 ✅</div>
                        </div>
                        <div className="w-px h-8 bg-slate-200" />
                        <div className="text-center">
                            <div className="text-2xl font-black text-rose-500">{unknown}</div>
                            <div className="text-[11px] text-slate-400">不认识 ❌</div>
                        </div>
                        <div className="w-px h-8 bg-slate-200" />
                        <div className="text-center">
                            <div className="text-2xl font-black text-indigo-600">{accuracy}%</div>
                            <div className="text-[11px] text-slate-400">正确率</div>
                        </div>
                    </div>

                    {/* Detail list */}
                    {unknown > 0 && (
                        <div className="bg-rose-50 rounded-xl p-3">
                            <div className="text-xs font-bold text-rose-600 mb-1.5">需要巩固的词：</div>
                            <div className="flex flex-wrap gap-1.5">
                                {results.filter(r => r.quality < 3).map((r, i) => (
                                    <span key={i} className="text-xs bg-white text-rose-600 px-2 py-0.5 rounded-full border border-rose-200">
                                        {r.word}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 主复习界面
    const word = extractWord(currentCard.front);
    const phonetic = currentCard.front.match(/\/[^/]+\//)?.[0] || '';
    const example = currentCard.front.match(/Example:\s*(.+)/)?.[1] || '';

    return (
        <div className="my-3 bg-white border border-violet-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Header + Progress */}
            <div className="bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-2.5 border-b border-violet-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-violet-700">
                        <Layers size={14} />
                        闪卡复习
                        <span className="text-violet-400 font-normal">
                            {currentIndex + 1} / {cards.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {results.map((r, i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${r.quality >= 3 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                            />
                        ))}
                        {Array.from({ length: cards.length - results.length }).map((_, i) => (
                            <div key={`pending-${i}`} className="w-2 h-2 rounded-full bg-slate-200" />
                        ))}
                    </div>
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 h-1 bg-violet-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-violet-400 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Card Body */}
            <div className="p-4">
                <div
                    onClick={handleFlip}
                    className="relative cursor-pointer select-none min-h-[120px] flex items-center justify-center rounded-xl border-2 border-dashed transition-all duration-300 hover:shadow-md active:scale-[0.98]"
                    style={{
                        borderColor: isFlipped ? '#a78bfa' : '#e2e8f0',
                        background: isFlipped
                            ? 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)'
                            : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
                    }}
                >
                    {!isFlipped ? (
                        /* Front: Word */
                        <div className="text-center py-4 px-6">
                            <div className="text-2xl font-black text-slate-800 mb-1">{word}</div>
                            {phonetic && (
                                <div className="text-sm text-slate-400 font-mono mb-2">{phonetic}</div>
                            )}
                            {example && (
                                <div className="text-xs text-slate-500 italic leading-relaxed mt-2 max-w-[280px]">
                                    "{example}"
                                </div>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); speak(currentCard.front); }}
                                className="mt-2 p-1.5 rounded-lg bg-white/80 hover:bg-indigo-50 text-slate-400 hover:text-indigo-500 transition-colors mx-auto"
                                title="朗读"
                            >
                                <Volume2 size={14} />
                            </button>
                            <div className="text-[10px] text-slate-300 mt-3">
                                点击翻转查看释义 →
                            </div>
                        </div>
                    ) : (
                        /* Back: Definition */
                        <div className="text-center py-4 px-6">
                            <div className="text-xs text-violet-400 font-bold mb-1">释义</div>
                            <div className="text-base font-bold text-violet-800 leading-relaxed whitespace-pre-line">
                                {currentCard.back}
                            </div>
                            <div className="text-[10px] text-violet-300 mt-3 flex items-center justify-center gap-1">
                                <RotateCcw size={10} />
                                点击翻回正面
                            </div>
                        </div>
                    )}
                </div>

                {/* Grading Buttons — only show when flipped */}
                {isFlipped && (
                    <div className="flex gap-3 mt-4 animate-fade-in">
                        <button
                            onClick={() => handleGrade(1)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-sm font-bold transition-all active:scale-95"
                        >
                            <X size={16} />
                            不认识
                        </button>
                        <button
                            onClick={() => handleGrade(3)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 rounded-xl text-sm font-bold transition-all active:scale-95"
                        >
                            <Check size={16} />
                            认识
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatFlashcardWidget;
