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
        <div className="my-3 bg-white border border-indigo-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="bg-indigo-50/50 px-4 py-3 border-b border-indigo-100 flex items-start gap-3">
                <div className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg shrink-0 mt-0.5">
                    <HelpCircle size={16} />
                </div>
                <div className="text-sm font-semibold text-slate-800 leading-snug">
                    {question}
                </div>
            </div>

            <div className="p-4 space-y-2">
                {options.map((opt, idx) => {
                    const isSelected = selected === opt;
                    const isCorrectOpt = opt === correctAnswer;

                    let bgStatus = 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700';

                    if (isSubmitted) {
                        if (isCorrectOpt) {
                            bgStatus = 'bg-emerald-50 border-emerald-500 text-emerald-700';
                        } else if (isSelected && !isCorrectOpt) {
                            bgStatus = 'bg-rose-50 border-rose-400 text-rose-700';
                        } else {
                            bgStatus = 'bg-slate-50 border-slate-200 text-slate-400 opacity-50'; // unselected wrong options
                        }
                    } else if (isSelected) {
                        bgStatus = 'bg-indigo-50 border-indigo-400 text-indigo-700';
                    }

                    return (
                        <button
                            key={idx}
                            onClick={() => handleSelect(opt)}
                            disabled={isSubmitted}
                            className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-all flex items-center justify-between ${bgStatus}`}
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
                        className="w-full mt-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-medium transition-colors"
                    >
                        提交答案
                    </button>
                ) : (
                    <div className={`mt-3 p-3 rounded-xl text-sm ${selected === correctAnswer ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                        <div className="font-bold mb-1">{selected === correctAnswer ? '🎉 回答正确！' : '❌ 回答错误'}</div>
                        <div className="opacity-90">{explanation}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ChatQuizWidget;
