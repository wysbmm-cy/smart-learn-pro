import React, { useState, useEffect, useRef } from 'react';
import {
    CheckCircle, XCircle, Volume2, Shuffle, HelpCircle,
    ArrowRight, Lightbulb, RotateCcw, Keyboard
} from 'lucide-react';

/**
 * DrillCard Component - Renders different drill types for Smart Drill Cards
 * Supports 8 drill types: similar_words, context, cloze, collocation, word_forms, synonyms, sentence_order, dictation
 */
const DrillCard = ({ drill, onComplete, speakText }) => {
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [showHint, setShowHint] = useState(false);
    const [currentHintIndex, setCurrentHintIndex] = useState(0);
    const [orderedWords, setOrderedWords] = useState([]);
    const inputRef = useRef(null);

    // Reset state when drill changes
    useEffect(() => {
        setSelectedAnswer(null);
        setShowResult(false);
        setInputValue('');
        setShowHint(false);
        setCurrentHintIndex(0);
        if (drill?.type === 'sentence_order' && drill.scrambled) {
            setOrderedWords([]);
        }
    }, [drill]);

    if (!drill) return null;

    const handleSelectOption = (index) => {
        if (showResult) return;
        setSelectedAnswer(index);
        setShowResult(true);
    };

    const handleInputSubmit = () => {
        if (!inputValue.trim()) return;
        setShowResult(true);
    };

    const handleNextHint = () => {
        if (drill.hints && currentHintIndex < drill.hints.length - 1) {
            setCurrentHintIndex(prev => prev + 1);
        }
        setShowHint(true);
    };

    const handleWordClick = (word, index) => {
        if (showResult) return;
        if (orderedWords.includes(index)) {
            setOrderedWords(prev => prev.filter(i => i !== index));
        } else {
            setOrderedWords(prev => [...prev, index]);
        }
    };

    const checkSentenceOrder = () => {
        setShowResult(true);
    };

    const isCorrect = () => {
        switch (drill.type) {
            case 'similar_words':
            case 'context':
            case 'collocation':
            case 'word_forms':
            case 'synonyms':
                return selectedAnswer === drill.answer;
            case 'cloze':
            case 'dictation':
                return inputValue.toLowerCase().trim() === (drill.answer || drill.word).toLowerCase().trim();
            case 'sentence_order':
                return JSON.stringify(orderedWords) === JSON.stringify(drill.correctOrder);
            default:
                return false;
        }
    };

    const renderMultipleChoice = () => (
        <div className="grid grid-cols-1 gap-3 mt-6">
            {drill.options?.map((option, index) => {
                let buttonClass = "w-full p-4 text-left rounded-xl border-2 transition-all font-medium ";
                if (showResult) {
                    if (index === drill.answer) {
                        buttonClass += "bg-emerald-50 border-emerald-400 text-emerald-700";
                    } else if (index === selectedAnswer && index !== drill.answer) {
                        buttonClass += "bg-rose-50 border-rose-400 text-rose-700";
                    } else {
                        buttonClass += "bg-slate-50 border-slate-200 text-slate-400";
                    }
                } else {
                    buttonClass += selectedAnswer === index
                        ? "bg-indigo-50 border-indigo-400 text-indigo-700"
                        : "bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-700";
                }
                return (
                    <button
                        key={index}
                        onClick={() => handleSelectOption(index)}
                        disabled={showResult}
                        className={buttonClass}
                    >
                        <span className="inline-block w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold mr-3 text-center leading-6">
                            {String.fromCharCode(65 + index)}
                        </span>
                        {option}
                        {showResult && index === drill.answer && (
                            <CheckCircle className="inline-block ml-2 text-emerald-500" size={18} />
                        )}
                        {showResult && index === selectedAnswer && index !== drill.answer && (
                            <XCircle className="inline-block ml-2 text-rose-500" size={18} />
                        )}
                    </button>
                );
            })}
        </div>
    );

    const renderTextInput = () => (
        <div className="mt-6">
            <div className="flex gap-2 mb-4">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
                    placeholder="输入你的答案..."
                    disabled={showResult}
                    className="flex-1 px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-indigo-400 focus:outline-none font-medium text-lg"
                    autoFocus
                />
                <button
                    onClick={handleInputSubmit}
                    disabled={showResult || !inputValue.trim()}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-slate-300 transition-all"
                >
                    提交
                </button>
            </div>

            {/* Hints */}
            <div className="flex items-center gap-2">
                <button
                    onClick={handleNextHint}
                    disabled={showResult}
                    className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700"
                >
                    <Lightbulb size={14} />
                    {showHint ? '下一个提示' : '获取提示'}
                </button>
                {showHint && drill.hints && (
                    <span className="text-sm text-slate-500 bg-amber-50 px-2 py-1 rounded">
                        {drill.hints.slice(0, currentHintIndex + 1).join(' | ')}
                    </span>
                )}
            </div>

            {showResult && (
                <div className={`mt-4 p-4 rounded-xl ${isCorrect() ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
                    <div className="flex items-center gap-2 font-bold mb-2">
                        {isCorrect() ? (
                            <>
                                <CheckCircle className="text-emerald-500" size={20} />
                                <span className="text-emerald-700">正确！</span>
                            </>
                        ) : (
                            <>
                                <XCircle className="text-rose-500" size={20} />
                                <span className="text-rose-700">正确答案: {drill.answer || drill.word}</span>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    const renderSentenceOrder = () => (
        <div className="mt-6">
            {/* Available words */}
            <div className="flex flex-wrap gap-2 mb-4 p-4 bg-slate-50 rounded-xl min-h-[60px]">
                {drill.scrambled?.map((word, index) => (
                    <button
                        key={index}
                        onClick={() => handleWordClick(word, index)}
                        disabled={showResult}
                        className={`px-3 py-2 rounded-lg font-medium transition-all ${orderedWords.includes(index)
                                ? 'bg-indigo-500 text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300'
                            }`}
                    >
                        {word}
                    </button>
                ))}
            </div>

            {/* Selected order preview */}
            <div className="p-4 bg-white border-2 border-dashed border-slate-200 rounded-xl min-h-[60px] flex flex-wrap gap-2 items-center">
                {orderedWords.length === 0 ? (
                    <span className="text-slate-400 text-sm">点击上方单词按顺序排列...</span>
                ) : (
                    orderedWords.map((idx, pos) => (
                        <span key={pos} className="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-medium">
                            {drill.scrambled[idx]}
                        </span>
                    ))
                )}
            </div>

            <div className="flex gap-2 mt-4">
                <button
                    onClick={() => setOrderedWords([])}
                    disabled={showResult}
                    className="flex items-center gap-1 px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                >
                    <RotateCcw size={14} /> 重置
                </button>
                <button
                    onClick={checkSentenceOrder}
                    disabled={showResult || orderedWords.length !== drill.scrambled?.length}
                    className="flex-1 px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:bg-slate-300"
                >
                    检查答案
                </button>
            </div>

            {showResult && (
                <div className={`mt-4 p-4 rounded-xl ${isCorrect() ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                    <div className="font-bold mb-2 flex items-center gap-2">
                        {isCorrect() ? (
                            <>
                                <CheckCircle className="text-emerald-500" size={20} />
                                <span className="text-emerald-700">完美！</span>
                            </>
                        ) : (
                            <>
                                <XCircle className="text-rose-500" size={20} />
                                <span className="text-rose-700">正确顺序:</span>
                            </>
                        )}
                    </div>
                    <div className="text-slate-600">{drill.fullSentence}</div>
                </div>
            )}
        </div>
    );

    const renderDictation = () => (
        <div className="mt-6">
            <div className="flex items-center justify-center gap-4 mb-6">
                <button
                    onClick={() => speakText && speakText(drill.word)}
                    className="p-4 bg-indigo-100 hover:bg-indigo-200 rounded-full text-indigo-600 transition-all"
                >
                    <Volume2 size={32} />
                </button>
                <div className="text-slate-400 text-sm">
                    点击播放发音，然后拼写单词
                </div>
            </div>

            {drill.phonetic && (
                <div className="text-center text-slate-500 mb-4">{drill.phonetic}</div>
            )}

            {renderTextInput()}

            {drill.syllables && showHint && (
                <div className="mt-2 text-sm text-slate-500">
                    音节: {drill.syllables.join(' - ')}
                </div>
            )}
        </div>
    );

    const getTypeLabel = () => {
        const labels = {
            similar_words: '形近词选择',
            context: '语境释义',
            cloze: '填空题',
            collocation: '搭配选择',
            word_forms: '词性变换',
            synonyms: '同/反义词',
            sentence_order: '句子排序',
            dictation: '听写模式'
        };
        return labels[drill.type] || drill.type;
    };

    const getTypeIcon = () => {
        const icons = {
            similar_words: '👀',
            context: '📖',
            cloze: '✍️',
            collocation: '🔗',
            word_forms: '🔄',
            synonyms: '↔️',
            sentence_order: '🧩',
            dictation: '🎧'
        };
        return icons[drill.type] || '❓';
    };

    return (
        <div className="bg-white rounded-3xl shadow-xl border-2 border-indigo-100 p-8 w-full max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{getTypeIcon()}</span>
                    <span className="text-sm font-bold text-indigo-600 uppercase tracking-wider">
                        {getTypeLabel()}
                    </span>
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-1">
                    <Keyboard size={12} />
                    按 Enter 提交
                </div>
            </div>

            {/* Question */}
            <div className="text-xl font-bold text-slate-800 mb-2">
                {drill.question}
            </div>

            {/* Word Forms extra info */}
            {drill.type === 'word_forms' && drill.baseWord && (
                <div className="text-sm text-slate-500 mb-4">
                    基础词: <span className="font-bold text-indigo-600">{drill.baseWord}</span>
                    {drill.targetForm && <> → 目标词性: <span className="font-bold">{drill.targetForm}</span></>}
                </div>
            )}

            {/* Render appropriate UI based on drill type */}
            {['similar_words', 'context', 'collocation', 'word_forms', 'synonyms'].includes(drill.type) && renderMultipleChoice()}
            {['cloze'].includes(drill.type) && renderTextInput()}
            {drill.type === 'sentence_order' && renderSentenceOrder()}
            {drill.type === 'dictation' && renderDictation()}

            {/* Explanation */}
            {showResult && drill.explanation && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <div className="text-sm font-bold text-blue-700 mb-1 flex items-center gap-1">
                        <HelpCircle size={14} /> 解析
                    </div>
                    <div className="text-sm text-blue-600">{drill.explanation}</div>
                </div>
            )}

            {/* Continue Button */}
            {showResult && (
                <button
                    onClick={() => onComplete && onComplete(isCorrect())}
                    className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                >
                    继续 <ArrowRight size={18} />
                </button>
            )}
        </div>
    );
};

export default DrillCard;
