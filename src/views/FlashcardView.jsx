import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, RefreshCw, ChevronLeft, ChevronRight, RotateCw, CheckCircle, XCircle, Dices } from 'lucide-react';
import { useApp } from '../context/AppContext';

const FlashcardView = () => {
    const { loadUserFlashcards, addFlashcard, removeFlashcard } = useApp();
    const [cards, setCards] = useState([]);
    const [mode, setMode] = useState('manage'); // 'manage' | 'study'

    // Manage State
    const [newFront, setNewFront] = useState("");
    const [newBack, setNewBack] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [drawCount, setDrawCount] = useState(10); // Lottery Count

    // Student Picker State
    const [showStudentPicker, setShowStudentPicker] = useState(false);
    const [studentCount, setStudentCount] = useState(30); // Default class size
    const [pickedStudent, setPickedStudent] = useState(null);
    const [isRolling, setIsRolling] = useState(false);

    // Study State
    const [studyQueue, setStudyQueue] = useState([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });

    useEffect(() => {
        loadCards();
    }, []);

    const loadCards = async () => {
        const data = await loadUserFlashcards();
        setCards(data);
    };

    const handleAddCard = async () => {
        if (!newFront.trim() || !newBack.trim()) return;
        await addFlashcard({
            front: newFront,
            back: newBack,
            tags: [],
            createdAt: Date.now()
        });
        setNewFront("");
        setNewBack("");
        setIsAdding(false);
        loadCards();
    };

    const handleDelete = async (id) => {
        if (confirm("确定要删除这张卡片吗?")) {
            await removeFlashcard(id);
            loadCards();
        }
    };

    const startSession = () => {
        // Simple shuffle
        const shuffled = [...cards].sort(() => 0.5 - Math.random());
        // Apply Random Draw (Lottery)
        const selected = shuffled.slice(0, drawCount);
        setStudyQueue(selected);
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setSessionStats({ reviewed: 0, correct: 0 });
        setMode('study');
    };

    const handlePickStudent = () => {
        if (isRolling) return;
        setIsRolling(true);
        let duration = 0;
        const interval = setInterval(() => {
            setPickedStudent(Math.floor(Math.random() * studentCount) + 1);
            duration += 50;
            if (duration > 1500) { // 1.5s roll
                clearInterval(interval);
                setIsRolling(false);
            }
        }, 50);
    };

    const handleNextCard = (known) => {
        if (known) {
            setSessionStats(prev => ({ ...prev, correct: prev.correct + 1 }));
        }
        setSessionStats(prev => ({ ...prev, reviewed: prev.reviewed + 1 }));

        if (currentCardIndex < studyQueue.length - 1) {
            setCurrentCardIndex(prev => prev + 1);
            setIsFlipped(false);
        } else {
            alert(`学习完成！ 本次共复习 ${sessionStats.reviewed + 1} 张卡片。`);
            setMode('manage');
        }
    };

    return (
        <div className="h-full flex flex-col animate-fade-in space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                        <Layers size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">抽记卡 (Flashcards)</h1>
                        <p className="text-slate-500 text-sm">间隔重复记忆系统</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowStudentPicker(true)}
                        className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors tooltip"
                        title="班级抽号 (Class Lottery)"
                    >
                        <Dices size={20} />
                    </button>
                    <button
                        onClick={() => setMode('manage')}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'manage' ? 'bg-white shadow-md text-amber-600' : 'text-slate-500 hover:bg-slate-100'}`}
                    >
                        管理卡片 ({cards.length})
                    </button>
                    <div className="flex items-center bg-slate-100 rounded-xl px-2">
                        <span className="text-xs font-bold text-slate-400 pl-2 pr-1">抽取:</span>
                        <input
                            type="number"
                            min="1"
                            max={cards.length}
                            value={drawCount}
                            onChange={(e) => setDrawCount(Math.max(1, Math.min(cards.length, parseInt(e.target.value) || 1)))}
                            className="w-12 bg-transparent border-none text-center font-bold text-slate-600 outline-none text-sm py-2"
                        />
                    </div>
                    <button
                        onClick={startSession}
                        disabled={cards.length === 0}
                        className={`px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${mode === 'study' ? 'bg-amber-500 text-white shadow-lg shadow-amber-200' : 'bg-slate-800 text-white hover:bg-slate-700 shadow-lg'}`}
                    >
                        <RotateCw size={16} />
                        开始抽背
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative">

                {/* Mode: Manage */}
                {mode === 'manage' && (
                    <div className="h-full flex flex-col">
                        {/* Add Bar */}
                        <div className="p-6 border-b border-slate-100 bg-slate-50">
                            {isAdding ? (
                                <div className="flex flex-col gap-4 animate-fade-in">
                                    <div className="flex gap-4">
                                        <input
                                            value={newFront}
                                            onChange={e => setNewFront(e.target.value)}
                                            placeholder="正面 (单词/问题)"
                                            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-amber-500 outline-none"
                                        />
                                        <input
                                            value={newBack}
                                            onChange={e => setNewBack(e.target.value)}
                                            placeholder="背面 (释义/答案)"
                                            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-amber-500 outline-none"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-lg text-sm font-bold">取消</button>
                                        <button onClick={handleAddCard} className="px-6 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold shadow-md shadow-amber-200 hover:bg-amber-600 transition-colors">保存卡片</button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsAdding(true)}
                                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-amber-400 hover:text-amber-500 hover:bg-amber-50 transition-all flex items-center justify-center gap-2 font-bold"
                                >
                                    <Plus size={20} />
                                    添加新卡片
                                </button>
                            )}
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {cards.map(card => (
                                <div key={card.id} className="relative bg-white border border-slate-100 rounded-2xl p-6 hover:shadow-lg transition-all group">
                                    <h3 className="font-bold text-lg text-slate-800 mb-2 truncate" title={card.front}>{card.front}</h3>
                                    <div className="w-full h-px bg-slate-100 my-3" />
                                    <p className="text-slate-500 text-sm line-clamp-3">{card.back}</p>

                                    <button
                                        onClick={() => handleDelete(card.id)}
                                        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                            {cards.length === 0 && !isAdding && (
                                <div className="col-span-full text-center py-20 text-slate-400">
                                    暂无卡片，添加一张开始吧！
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Mode: Study */}
                {mode === 'study' && studyQueue.length > 0 && (
                    <div className="h-full flex flex-col items-center justify-center p-8 bg-slate-50">
                        <div className="w-full max-w-2xl text-center mb-6">
                            <span className="text-slate-400 text-sm font-mono">
                                进度: {currentCardIndex + 1} / {studyQueue.length}
                            </span>
                        </div>

                        {/* Card Flip Container */}
                        <div
                            className="relative w-full max-w-2xl aspect-[3/2] cursor-pointer perspective-1000 group"
                            onClick={() => setIsFlipped(!isFlipped)}
                        >
                            <div className={`relative w-full h-full text-center transition-transform duration-500 transform-style-3d shadow-xl rounded-3xl bg-white border border-slate-200 ${isFlipped ? 'rotate-y-180' : ''}`}
                                style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                            >
                                {/* Front */}
                                <div className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-10">
                                    <span className="text-slate-300 text-xs uppercase tracking-widest font-bold mb-4">问题 (Question)</span>
                                    <h2 className="text-4xl font-bold text-slate-800 break-words max-w-full">
                                        {studyQueue[currentCardIndex].front}
                                    </h2>
                                    <p className="text-slate-400 text-sm mt-8 animate-bounce">点击翻转 (Click to Flip)</p>
                                </div>

                                {/* Back */}
                                <div
                                    className="absolute inset-0 backface-hidden flex flex-col items-center justify-center p-10 bg-amber-50 rounded-3xl border border-amber-100"
                                    style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}
                                >
                                    <span className="text-amber-300 text-xs uppercase tracking-widest font-bold mb-4">答案 (Answer)</span>
                                    <p className="text-2xl text-slate-700 leading-relaxed break-words whitespace-pre-wrap">
                                        {studyQueue[currentCardIndex].back}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Controls */}
                        {isFlipped && (
                            <div className="flex gap-6 mt-10 animate-fade-in">
                                <button
                                    onClick={() => handleNextCard(false)}
                                    className="flex flex-col items-center gap-2 text-red-400 hover:text-red-500 transition-colors group"
                                >
                                    <div className="w-14 h-14 rounded-full bg-white border-2 border-red-100 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                        <XCircle size={28} />
                                    </div>
                                    <span className="text-xs font-bold">忘记了</span>
                                </button>

                                <button
                                    onClick={() => handleNextCard(true)}
                                    className="flex flex-col items-center gap-2 text-green-500 hover:text-green-600 transition-colors group"
                                >
                                    <div className="w-14 h-14 rounded-full bg-white border-2 border-green-100 flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                        <CheckCircle size={28} />
                                    </div>
                                    <span className="text-xs font-bold">记住了</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* Student Picker Modal */}
            {showStudentPicker && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 w-96 text-center border-4 border-white ring-4 ring-indigo-50 scale-100 animate-in fade-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <Dices className="text-indigo-500" />
                                班级抽号
                            </h2>
                            <button onClick={() => setShowStudentPicker(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400">
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="mb-8">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">中奖号码</div>
                            <div className={`text-8xl font-black text-indigo-600 font-mono transition-transform ${isRolling ? 'scale-110' : 'scale-100'}`}>
                                {pickedStudent !== null ? pickedStudent : '?'}
                            </div>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-center gap-3 bg-slate-50 p-3 rounded-xl">
                                <span className="text-sm font-bold text-slate-500">学生总数:</span>
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={studentCount}
                                    onChange={(e) => setStudentCount(parseInt(e.target.value) || 1)}
                                    className="w-16 bg-white border border-slate-200 rounded-lg text-center font-bold text-lg py-1 outline-indigo-500"
                                />
                            </div>

                            <button
                                onClick={handlePickStudent}
                                disabled={isRolling}
                                className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-indigo-200 transition-all active:scale-95 ${isRolling ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                            >
                                {isRolling ? '抽取中...' : '开始抽号! (Start Roll)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlashcardView;
