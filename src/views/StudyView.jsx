import React from 'react';
import { Brain } from 'lucide-react';
import { useApp } from '../context/AppContext';
import WordCard from '../components/WordCard';

const StudyView = ({ onNavigate }) => {
    const { currentArticle, analysisResult } = useApp();

    if (!analysisResult) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 gap-4">
                <Brain size={64} className="opacity-20" />
                <p>No active analysis found.</p>
                <button
                    onClick={() => onNavigate('import')}
                    className="text-blue-600 hover:underline font-medium"
                >
                    Go to Import
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-140px)] gap-6 animate-fade-in">
            {/* Article Column */}
            <div className="w-1/2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                        Original Text
                    </h3>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold border border-blue-200">
                        {analysisResult.level || 'Detected'}
                    </span>
                </div>
                <div className="p-8 overflow-y-auto flex-1 text-slate-600 leading-loose text-lg font-serif whitespace-pre-wrap selection:bg-blue-100 selection:text-blue-800">
                    {currentArticle || "No text content available."}
                </div>
            </div>

            {/* Analysis Column */}
            <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2 pb-10">

                {/* Summary Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 text-indigo-800 font-bold">
                        <Brain size={20} />
                        <span>AI Smart Summary</span>
                    </div>
                    <p className="text-indigo-900/80 text-sm leading-relaxed">
                        {analysisResult.summary}
                    </p>
                </div>

                {/* Vocabulary List */}
                <div>
                    <div className="flex items-center justify-between mb-4 mt-2">
                        <h3 className="font-bold text-slate-700 text-lg">Key Vocabulary</h3>
                    </div>

                    {analysisResult.vocabulary?.map((word, idx) => (
                        <WordCard
                            key={idx}
                            wordData={word}
                            isFastMode={!word.mnemonic && !word.writing} // Infer mode based on data presence
                        />
                    ))}

                    {(!analysisResult.vocabulary || analysisResult.vocabulary.length === 0) && (
                        <div className="text-slate-400 text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            No vocabulary extracted.
                        </div>
                    )}
                </div>

                {/* Structures */}
                {analysisResult.structures && analysisResult.structures.length > 0 && (
                    <div>
                        <h3 className="font-bold text-slate-700 mb-3 text-lg">Grammar & Structure</h3>
                        {analysisResult.structures.map((struct, idx) => (
                            <div key={idx} className="bg-white p-5 rounded-xl border-l-4 border-purple-500 shadow-sm mb-3">
                                <div className="text-xs text-purple-600 font-bold mb-1 uppercase tracking-wider">{struct.type}</div>
                                <div className="text-slate-800 font-medium mb-2 font-serif text-lg">"{struct.pattern}"</div>
                                <div className="text-sm text-slate-500">{struct.explanation}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudyView;
