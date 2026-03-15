import React, { useState } from 'react';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

const ChatQuizWidget = ({ data, onAnswer }) => {
    const { question, options, correctAnswer, explanation } = data;
    const [selected, setSelected] = useState(null);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSelect = (opt) => {
        if (isSubmitted) return;
        setSelected(opt);
    };

    const handleSubmit = () => {
        if (!selected) return;
        setIsSubmitted(true);
        const isCorrect = selected === correctAnswer;

        // Auto-send feedback to Agent
        if (onAnswer) {
            onAnswer(
                selected,
                isCorrect,
                `[Interactive Quiz System] User selected: "${selected}". Result: ${isCorrect ? 'Correct!' : 'Incorrect.'}`
            );
        }
    };

    return (
        <div className="my-3 glass-panel border border-phy-border rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-phy-glassHeavy backdrop-blur px-4 py-3 border-b border-phy-border flex items-start gap-3">
                <div className="bg-phy-glass border border-phy-border/50 text-phy-accent p-1.5 rounded-lg shrink-0 mt-0.5 shadow-sm">
                    <HelpCircle size={16} />
                </div>
                <div className="text-sm font-semibold text-phy-text leading-snug">
                    {question}
                </div>
            </div>

            <div className="p-4 space-y-3 bg-phy-bg/30">
                {options.map((opt, idx) => {
                    const isSelected = selected === opt;
                    const isCorrectOpt = opt === correctAnswer;

                    let bgStatus = 'bg-phy-glass hover:bg-phy-glassHover border-phy-border text-phy-text';

                    if (isSubmitted) {
                        if (isCorrectOpt) {
                            bgStatus = 'bg-emerald-500/10 border-emerald-500/50 text-emerald-500 font-medium';
                        } else if (isSelected && !isCorrectOpt) {
                            bgStatus = 'bg-rose-500/10 border-rose-500/50 text-rose-400';
                        } else {
                            bgStatus = 'bg-phy-glass border-phy-border text-phy-muted opacity-50'; // unselected wrong options
                        }
                    } else if (isSelected) {
                        bgStatus = 'bg-phy-accentGlass border-phy-accent/50 text-phy-accent font-medium shadow-sm';
                    }

                    return (
                        <button
                            key={idx}
                            onClick={() => handleSelect(opt)}
                            disabled={isSubmitted}
                            className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all flex items-center justify-between ${bgStatus}`}
                        >
                            <span>{opt}</span>
                            {isSubmitted && isCorrectOpt && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
                            {isSubmitted && isSelected && !isCorrectOpt && <XCircle size={16} className="text-rose-500 shrink-0" />}
                        </button>
                    );
                })}

                {!isSubmitted ? (
                    <button
                        onClick={handleSubmit}
                        disabled={!selected}
                        className="w-full mt-4 py-2.5 bg-phy-accent hover:opacity-90 disabled:bg-phy-glassHover disabled:text-phy-muted disabled:border-transparent disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95"
                    >
                        提交答案
                    </button>
                ) : (
                    <div className={`mt-4 p-4 rounded-xl text-sm border ${selected === correctAnswer ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                        <div className="font-bold mb-1.5 flex items-center gap-1.5">
                            {selected === correctAnswer ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                            {selected === correctAnswer ? '回答正确！' : '回答错误'}
                        </div>
                        <div className="opacity-90 leading-relaxed text-phy-text">{explanation}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatQuizWidget;
