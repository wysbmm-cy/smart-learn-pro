import React, { useState } from 'react';
import { Sparkles, Zap, Copy, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

const WordCard = ({ wordData, isFastMode }) => {
    const { settings } = useApp();
    const [activeTab, setActiveTab] = useState('core');
    const [isCopied, setIsCopied] = useState(false);

    const handleCopy = () => {
        const textToCopy = `
${wordData.word} ${wordData.phonetic}
[${wordData.pos}] ${wordData.meaning}
Level: ${wordData.level || 'N/A'}

【Review】:
${wordData.example}

${wordData.mnemonic ? `【Mnemonic】: ${wordData.mnemonic}` : ''}
${wordData.usage ? `【Usage】: ${wordData.usage}` : ''}
`.trim();

        navigator.clipboard.writeText(textToCopy);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    // Logic to determine available tabs
    const availableTabs = ['core'];
    if (!isFastMode) {
        if (wordData.usage || wordData.collocations) availableTabs.push('usage');
        if (settings.showWriting && wordData.writing) availableTabs.push('writing');
        if (settings.showMnemonic && wordData.mnemonic) availableTabs.push('memory');
    }

    const labels = { core: '核心', usage: '用法&例句', writing: '写作运用', memory: '妙记' };

    return (
        <div className="bg-phy-glass rounded-2xl shadow-sm border border-phy-border overflow-hidden mb-6 transition-all hover:shadow-md animate-slide-up">
            {/* Header */}
            <div className="bg-phy-bg p-4 border-b border-phy-border flex justify-between items-start group">
                <div>
                    <div className="flex items-baseline gap-3 flex-wrap">
                        <h3 className="text-2xl font-bold text-phy-text font-bold">{wordData.word}</h3>
                        <span className="text-phy-muted font-mono text-sm">{wordData.phonetic}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                            {wordData.level || 'Unknown'}
                        </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                        <span className="italic font-serif text-phy-muted">{wordData.pos}</span>
                        <span className="text-phy-text">{wordData.meaning}</span>
                    </div>
                </div>

                <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg hover:bg-phy-bg text-phy-muted hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    title="Copy Word Card"
                >
                    {isCopied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
            </div>

            {/* Tabs */}
            <div className="p-0">
                <div className="flex border-b border-phy-border overflow-x-auto scrollbar-hide">
                    {availableTabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${activeTab === tab
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-phy-muted hover:text-phy-text'
                                }`}
                        >
                            {labels[tab]}
                        </button>
                    ))}
                </div>

                {/* Content Area */}
                <div className="p-5 min-h-[120px]">
                    {activeTab === 'core' && (
                        <div className="space-y-4 animate-fade-in">
                            <div>
                                <p className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-1">Source Context</p>
                                <p className="text-phy-text bg-phy-bg p-3 rounded-lg border border-phy-border italic">
                                    "{wordData.example}"
                                </p>
                            </div>
                            {wordData.synonyms && (
                                <div className="flex flex-wrap gap-2">
                                    {wordData.synonyms.map((syn, i) => (
                                        <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md border border-gray-200">
                                            ≈ {syn}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'usage' && (
                        <div className="space-y-3 animate-fade-in">
                            {wordData.collocations && (
                                <div>
                                    <span className="text-blue-600 font-bold text-sm">搭配: </span>
                                    <span className="text-phy-text text-sm">
                                        {Array.isArray(wordData.collocations) ? wordData.collocations.join(', ') : wordData.collocations}
                                    </span>
                                </div>
                            )}
                            {wordData.usage && (
                                <div>
                                    <span className="text-blue-600 font-bold text-sm">用法: </span>
                                    <span className="text-phy-text text-sm">{wordData.usage}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'writing' && (
                        <div className="bg-amber-50 p-4 rounded-lg border border-amber-100 text-amber-900 text-sm animate-fade-in">
                            <div className="flex gap-2 items-center mb-2 font-bold text-amber-700">
                                <Sparkles size={16} />
                                <span>AI 写作指导</span>
                            </div>
                            {wordData.writing}
                        </div>
                    )}

                    {activeTab === 'memory' && (
                        <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 text-indigo-900 text-sm animate-fade-in">
                            <div className="flex gap-2 items-center mb-2 font-bold text-indigo-700">
                                <Zap size={16} />
                                <span>AI 词源拆解</span>
                            </div>
                            {wordData.mnemonic}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default WordCard;
