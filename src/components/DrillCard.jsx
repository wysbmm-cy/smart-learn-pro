import React, { useState, useEffect, useRef } from 'react';
import {
    CheckCircle, XCircle, Volume2, Shuffle, HelpCircle,
    ArrowRight, Lightbulb, RotateCcw, Keyboard
} from 'lucide-react';
import { saveDrillLog } from '../services/db';

// A.I.R. Dimension Mapping
const getDimension = (drillType) => {
    const dimensionMap = {
        // Form dimension (spelling, orthography)
        'similar_words': 'form',
        'context_cloze': 'meaning',
        // Meaning dimension (core semantics)
        'context': 'meaning',
        'synonyms': 'meaning',
        // Use dimension (collocations, pragmatics)
        'collocation': 'use',
        'collocation_match': 'use',
        'pragmatic_scenario': 'use',
        // Grammar (word forms)
        'word_forms': 'form',
        'word_family': 'form',
        // Others
        'cloze': 'meaning',
        'sentence_order': 'use',
        'dictation': 'form'
    };
    return dimensionMap[drillType] || 'meaning';
};

// Error type classification
const getErrorType = (drillType, userChoice, correctAnswer) => {
    if (drillType === 'context_cloze' || drillType === 'similar_words') {
        // Check if it's an orthographic confusion (similar spelling)
        if (userChoice && correctAnswer) {
            const similarity = calculateSimilarity(userChoice, correctAnswer);
            if (similarity > 0.7) return 'orthographic_confusion';
        }
        return 'semantic_confusion';
    }
    if (drillType === 'collocation_match' || drillType === 'collocation') {
        return 'collocation_error';
    }
    if (drillType === 'pragmatic_scenario') {
        return 'register_mismatch';
    }
    if (drillType === 'word_family' || drillType === 'word_forms') {
        return 'morphological_error';
    }
    return 'general_error';
};

// Simple string similarity (Levenshtein-ish)
const calculateSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    // Check prefix/suffix match
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
        if (shorter[i] === longer[i]) matches++;
    }
    return matches / longer.length;
};

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

    const handleSelectOption = async (index) => {
        if (showResult) return;
        setSelectedAnswer(index);
        setShowResult(true);

        // A.I.R. Data Logging
        try {
            const isNewFormat = drill.options && typeof drill.options[0] === 'object';
            const correctIdx = isNewFormat
                ? drill.options.findIndex(o => o.is_correct)
                : drill.answer;
            const userChoice = isNewFormat ? drill.options[index]?.text : drill.options?.[index];
            const correctAnswer = isNewFormat ? drill.options[correctIdx]?.text : drill.options?.[correctIdx];
            const wasCorrect = isNewFormat ? drill.options[index]?.is_correct : (index === drill.answer);

            await saveDrillLog({
                word: drill.target_word || drill.word || '',
                dimension: getDimension(drill.type),
                item_type: drill.type,
                user_choice: userChoice,
                correct_answer: correctAnswer,
                is_correct: wasCorrect,
                error_type: wasCorrect ? null : getErrorType(drill.type, userChoice, correctAnswer)
            });
        } catch (err) {
            console.warn('Failed to log drill result:', err);
        }
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
        // Handle new object-based options structure
        if (drill.options && typeof drill.options[0] === 'object') {
            return drill.options[selectedAnswer]?.is_correct;
        }

        // Legacy support
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

    const renderMultipleChoice = () => {
        // Helper to get correct index for both new and legacy formats
        const getCorrectIndex = () => {
            if (drill.options && typeof drill.options[0] === 'object') {
                return drill.options.findIndex(o => o.is_correct);
            }
            return drill.answer;
        };

        const correctIndex = getCorrectIndex();

        return (
            <div className="grid grid-cols-1 gap-3 mt-6">
                {/* Scenario Description for Pragmatic Scenario */}
                {drill.scenario_description && (
                    <div className="bg-slate-50 border-l-4 border-indigo-400 p-4 mb-4 rounded-r-lg text-slate-600 text-sm italic">
                        Scenario: {drill.scenario_description}
                    </div>
                )}

                {drill.options?.map((option, index) => {
                    // Support both object options (new) and string options (legacy)
                    const optionText = typeof option === 'object' ? option.text : option;
                    const optionFeedback = typeof option === 'object' ? option.feedback : null;

                    let buttonClass = "w-full p-4 text-left rounded-xl border-2 transition-all font-medium ";
                    if (showResult) {
                        if (index === correctIndex) {
                            buttonClass += "bg-emerald-50 border-emerald-400 text-emerald-700";
                        } else if (index === selectedAnswer && index !== correctIndex) {
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
                        <div key={index} className="flex flex-col gap-2">
                            <button
                                onClick={() => handleSelectOption(index)}
                                disabled={showResult}
                                className={buttonClass}
                            >
                                <span className="inline-block w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-bold mr-3 text-center leading-6">
                                    {String.fromCharCode(65 + index)}
                                </span>
                                {optionText}
                                {showResult && index === correctIndex && (
                                    <CheckCircle className="inline-block ml-2 text-emerald-500" size={18} />
                                )}
                                {showResult && index === selectedAnswer && index !== correctIndex && (
                                    <XCircle className="inline-block ml-2 text-rose-500" size={18} />
                                )}
                            </button>

                            {/* Show specific feedback for selected wrong answer */}
                            {showResult && index === selectedAnswer && index !== correctIndex && optionFeedback && (
                                <div className="ml-2 text-sm text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-100 flex items-start gap-1 animate-in fade-in slide-in-from-top-1">
                                    <XCircle size={14} className="mt-0.5 shrink-0" />
                                    <span>{optionFeedback}</span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    // ... text input and sentence order renderers remain same ...

    const getTypeLabel = () => {
        const labels = {
            // New Types
            context_cloze: '语境填空',
            collocation_match: '搭配判断',
            pragmatic_scenario: '语用场景',
            word_family: '词形辨析',
            // Legacy Types
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
            // New Types
            context_cloze: '📝',
            collocation_match: '🔗',
            pragmatic_scenario: '🎭',
            word_family: '🌲',
            // Legacy Types
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
            {['similar_words', 'context', 'collocation', 'word_forms', 'synonyms',
                'context_cloze', 'collocation_match', 'pragmatic_scenario', 'word_family'].includes(drill.type) && renderMultipleChoice()}
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
