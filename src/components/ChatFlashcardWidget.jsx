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
            <div className="my-3 glass-panel border border-phy-border rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-phy-glassHeavy backdrop-blur px-4 py-3 border-b border-phy-border">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-500">
                        <Layers size={16} />
                        复习完成！
                    </div>
                </div>
                <div className="p-4 space-y-3 bg-phy-bg/30">
                    {/* Stats */}
                    <div className="flex items-center justify-center gap-6 py-2">
                        <div className="text-center">
                            <div className="text-2xl font-black text-emerald-500">{known}</div>
                            <div className="text-[11px] text-phy-muted">认识 ✅</div>
                        </div>
                        <div className="w-px h-8 bg-phy-border" />
                        <div className="text-center">
                            <div className="text-2xl font-black text-rose-500">{unknown}</div>
                            <div className="text-[11px] text-phy-muted">不认识 ❌</div>
                        </div>
                        <div className="w-px h-8 bg-phy-border" />
                        <div className="text-center">
                            <div className="text-2xl font-black text-phy-accent">{accuracy}%</div>
                            <div className="text-[11px] text-phy-muted">正确率</div>
                        </div>
                    </div>

                    {/* Detail list */}
                    {unknown > 0 && (
                        <div className="bg-rose-500/10 rounded-xl p-3 border border-rose-500/20">
                            <div className="text-xs font-bold text-rose-400 mb-1.5">需要巩固的词：</div>
                            <div className="flex flex-wrap gap-1.5">
                                {results.filter(r => r.quality < 3).map((r, i) => (
                                    <span key={i} className="text-xs bg-phy-glass text-rose-300 px-2 py-0.5 rounded-full border border-rose-500/20">
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
        <div className="my-3 glass-panel border border-phy-border rounded-2xl overflow-hidden shadow-sm">
            {/* Header + Progress */}
            <div className="bg-phy-glassHeavy backdrop-blur px-4 py-2.5 border-b border-phy-border">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-phy-accent">
                        <Layers size={14} />
                        闪卡复习
                        <span className="text-phy-muted font-normal ml-1">
                            {currentIndex + 1} / {cards.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 border border-phy-border/30 px-2 py-1 rounded-full bg-phy-bg/50">
                        {results.map((r, i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${r.quality >= 3 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            />
                        ))}
                        {Array.from({ length: cards.length - results.length }).map((_, i) => (
                            <div key={`pending-${i}`} className="w-2 h-2 rounded-full bg-phy-glassHover border border-phy-border/50" />
                        ))}
                    </div>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1 bg-phy-glassHover rounded-full overflow-hidden">
                    <div
                        className="h-full bg-phy-accent rounded-full transition-all duration-500"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Card Body */}
            <div className="p-4 bg-phy-bg/30">
                <div
                    onClick={handleFlip}
                    className="relative cursor-pointer select-none min-h-[120px] flex items-center justify-center rounded-xl border-2 transition-all duration-300 hover:shadow-md active:scale-[0.98]"
                    style={{
                        borderColor: isFlipped ? 'var(--color-phy-accent)' : 'var(--color-phy-border)',
                        background: isFlipped ? 'var(--color-phy-glassLight)' : 'var(--color-phy-glassHeavy)',
                        borderStyle: 'dashed'
                    }}
                >
                    {!isFlipped ? (
                        /* Front: Word */
                        <div className="text-center py-4 px-6">
                            <div className="text-2xl font-black text-phy-text mb-1">{word}</div>
                            {phonetic && (
                                <div className="text-sm text-phy-muted font-mono mb-2 opacity-80">{phonetic}</div>
                            )}
                            {example && (
                                <div className="text-xs text-phy-muted italic leading-relaxed mt-2 max-w-[280px]">
                                    "{example}"
                                </div>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); speak(currentCard.front); }}
                                className="mt-3 p-1.5 rounded-lg bg-phy-glass border border-phy-border hover:bg-phy-glassHover text-phy-muted hover:text-phy-accent transition-colors mx-auto flex"
                                title="朗读"
                            >
                                <Volume2 size={14} />
                            </button>
                            <div className="text-[10px] text-phy-muted/60 mt-4">
                                点击翻转查看释义 →
                            </div>
                        </div>
                    ) : (
                        /* Back: Definition */
                        <div className="text-center py-4 px-6">
                            <div className="text-xs text-phy-accent font-bold mb-1">释义</div>
                            <div className="text-base font-bold text-phy-text leading-relaxed whitespace-pre-line">
                                {currentCard.back}
                            </div>
                            <div className="text-[10px] text-phy-muted mt-4 flex items-center justify-center gap-1 opacity-80">
                                <RotateCcw size={10} />
                                点击翻回正面
                            </div>
                        </div>
                    )}
                </div>

                {/* Grading Buttons — only show when flipped */}
                {isFlipped && (
                    <div className="flex gap-3 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <button
                            onClick={() => handleGrade(1)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm"
                        >
                            <X size={16} />
                            不认识
                        </button>
                        <button
                            onClick={() => handleGrade(3)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-sm"
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
