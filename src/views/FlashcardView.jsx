import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, RefreshCw, ChevronLeft, ChevronRight, RotateCw, CheckCircle, XCircle, Dices, Folder, FolderPlus, MoreVertical, LayoutGrid, Tag, Play } from 'lucide-react';
import { useApp } from '../context/AppContext';
import SplitPane from '../components/SplitPane';
import { saveFolder, getFolders, deleteFolder } from '../services/db';

const FlashcardView = () => {
    const { loadUserFlashcards, addFlashcard, removeFlashcard, updateFlashcardProgress, flashcardStartupState, setFlashcardStartupState } = useApp();

    // Data State
    const [allCards, setAllCards] = useState([]);
    const [folders, setFolders] = useState([]);

    // UI State
    const [mode, setMode] = useState('manage'); // 'manage' | 'study'
    const [selectedFolderId, setSelectedFolderId] = useState('all'); // 'all', 'today', or folder UUID
    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [isMultiSelect, setIsMultiSelect] = useState(false); // New: Toggle multi-select mode

    // Manage State
    const [newFront, setNewFront] = useState("");
    const [newBack, setNewBack] = useState("");
    const [isAddingCard, setIsAddingCard] = useState(false);

    // Study Setup State
    const [studySelection, setStudySelection] = useState(['all']); // Array of folder IDs to study
    const [drawCount, setDrawCount] = useState(10);

    // Study Active State
    const [studyQueue, setStudyQueue] = useState([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });

    // Lottery State
    const [showStudentPicker, setShowStudentPicker] = useState(false);
    const [studentCount, setStudentCount] = useState(30);
    const [pickedStudent, setPickedStudent] = useState(null);
    const [isRolling, setIsRolling] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [cards, folderList] = await Promise.all([
            loadUserFlashcards(),
            getFolders()
        ]);
        setAllCards(cards);
        setFolders(folderList);
    };

    // Handle Startup Signal (e.g. from Dashboard)
    useEffect(() => {
        if (flashcardStartupState && allCards.length > 0) {
            const { mode, folder } = flashcardStartupState;
            if (folder) setSelectedFolderId(folder);

            if (mode === 'study') {
                // Determine candidates immediately
                // We must pass folder explicitly because state update is async
                startSession(folder);
            }
            setFlashcardStartupState(null); // Consume
        }
    }, [flashcardStartupState, allCards]);

    // --- Folder Logic ---
    const handleAddFolder = async () => {
        if (!newFolderName.trim()) return;
        const id = crypto.randomUUID();
        await saveFolder({ id, name: newFolderName, type: 'user' });
        setNewFolderName("");
        setIsAddingFolder(false);
        loadData();
    };

    const handleDeleteFolder = async (e, id) => {
        e.stopPropagation();
        if (confirm("确定删除此文件夹？里面的卡片将保留在“所有卡片”中。")) {
            await deleteFolder(id);
            if (selectedFolderId === id) setSelectedFolderId('all');
            loadData();
        }
    };

    // --- Card Logic ---
    const getFilteredCards = () => {
        if (isMultiSelect) {
            return allCards.filter(c => studySelection.includes(c.folderId));
        }
        if (selectedFolderId === 'all') return allCards;
        if (selectedFolderId === 'today') {
            const todayStr = new Date().toDateString();
            const now = Date.now();
            return allCards.filter(c => !c.nextReview || c.nextReview <= now);
        }
        return allCards.filter(c => c.folderId === selectedFolderId);
    };

    const displayCards = getFilteredCards();

    const handleAddCard = async () => {
        if (!newFront.trim() || !newBack.trim()) return;

        let folderId = (selectedFolderId !== 'all' && selectedFolderId !== 'today') ? selectedFolderId : undefined;

        // Auto-Generate Date Folder for Uncategorized manual adds
        if (!folderId) {
            const dateStr = new Date().toISOString().split('T')[0];
            const folderName = `Daily - ${dateStr}`;
            try {
                // Check if exists in current list or DB
                const existing = folders.find(f => f.name === folderName);
                if (existing) {
                    folderId = existing.id;
                } else {
                    folderId = crypto.randomUUID();
                    await saveFolder({ id: folderId, name: folderName, type: 'user' });
                    // We'll reload data below anyway
                }
            } catch (e) { console.error("Auto-folder error", e); }
        }

        await addFlashcard({
            front: newFront,
            back: newBack,
            folderId,
            tags: [],
            createdAt: Date.now(),
            nextReview: Date.now(),
            interval: 1,
            repetitions: 0
        });
        setNewFront("");
        setNewBack("");
        setIsAddingCard(false);
        loadData();
    };

    const handleDeleteCard = async (id) => {
        if (confirm("确定删除此卡片？")) {
            await removeFlashcard(id);
            loadData();
        }
    };

    // --- Study Logic ---
    const startSession = (overrideFolderId) => {
        const targetFolder = overrideFolderId || selectedFolderId;

        let candidates = [];
        if (isMultiSelect && !overrideFolderId) {
            // Multi-select mode: filter by included folder IDs
            candidates = allCards.filter(c => studySelection.includes(c.folderId));
        } else if (targetFolder === 'all') {
            candidates = allCards;
        } else if (targetFolder === 'today') {
            const now = Date.now();
            candidates = allCards.filter(c => !c.nextReview || c.nextReview <= now);
        } else {
            candidates = allCards.filter(c => c.folderId === targetFolder);
        }

        if (candidates.length === 0) {
            alert("没有找到符合条件的卡片！");
            return;
        }

        // Shuffle and limit to drawCount
        const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, drawCount);
        setStudyQueue(shuffled);
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setSessionStats({ reviewed: 0, correct: 0 });
        setMode('study');
    };

    const handleNextCard = async (quality) => {
        const currentCard = studyQueue[currentCardIndex];

        // SRS Update: quality 4 (Good) or 1 (Forgot)
        await updateFlashcardProgress(currentCard.id, quality);

        setSessionStats(prev => ({
            reviewed: prev.reviewed + 1,
            correct: quality >= 3 ? prev.correct + 1 : prev.correct
        }));

        if (currentCardIndex < studyQueue.length - 1) {
            setCurrentCardIndex(prev => prev + 1);
            setIsFlipped(false);
        } else {
            // End of Session
            // Reload data to reflect new review dates
            await loadData();
            alert(`学习完成！本次复习: ${studyQueue.length} 张`);
            setMode('manage');
        }
    };

    // --- Student Picker ---
    const handlePickStudent = () => {
        if (isRolling) return;
        setIsRolling(true);
        let duration = 0;
        const interval = setInterval(() => {
            setPickedStudent(Math.floor(Math.random() * studentCount) + 1);
            duration += 50;
            if (duration > 1500) {
                clearInterval(interval);
                setIsRolling(false);
            }
        }, 50);
    };

    // --- JSX Sub-components ---
    const toggleFolderSelection = (id) => {
        setStudySelection(prev =>
            prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
        );
    };

    const Sidebar = (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Layers className="text-amber-500" />
                    卡片库
                </h2>
                <button
                    onClick={() => {
                        setIsMultiSelect(!isMultiSelect);
                        if (!isMultiSelect) setStudySelection([]); // Reset on enter
                    }}
                    className={`text-xs px-2 py-1 rounded border ${isMultiSelect ? 'bg-indigo-100 text-indigo-600 border-indigo-200 font-bold' : 'text-slate-400 border-slate-200'}`}
                >
                    {isMultiSelect ? 'Finish Select' : 'Multi-Select'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* System Folders */}
                {!isMultiSelect && (
                    <>
                        <button
                            onClick={() => setSelectedFolderId('all')}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left font-medium transition-colors ${selectedFolderId === 'all' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <LayoutGrid size={18} />
                            所有卡片
                            <span className="ml-auto text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-400">{allCards.length}</span>
                        </button>

                        <button
                            onClick={() => setSelectedFolderId('today')}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left font-medium transition-colors ${selectedFolderId === 'today' ? 'bg-white shadow-sm text-amber-600' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <RefreshCw size={18} />
                            今日需复习
                        </button>
                    </>
                )}

                <div className="pt-4 pb-2 px-3 flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span>{isMultiSelect ? 'Select Folders to Review' : '我的文件夹'}</span>
                    {!isMultiSelect && <button onClick={() => setIsAddingFolder(true)} className="hover:text-blue-600"><Plus size={14} /></button>}
                </div>

                {isAddingFolder && (
                    <div className="px-2 mb-2 animate-fade-in">
                        <input
                            autoFocus
                            className="w-full bg-white border border-blue-200 rounded-lg px-2 py-1.5 text-sm outline-none"
                            placeholder="输入名称..."
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddFolder();
                                if (e.key === 'Escape') setIsAddingFolder(false);
                            }}
                            onBlur={() => newFolderName ? handleAddFolder() : setIsAddingFolder(false)}
                        />
                    </div>
                )}

                {folders.map(folder => {
                    const isSelected = isMultiSelect ? studySelection.includes(folder.id) : selectedFolderId === folder.id;
                    return (
                        <button
                            key={folder.id}
                            onClick={() => isMultiSelect ? toggleFolderSelection(folder.id) : setSelectedFolderId(folder.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left font-medium transition-colors group ${isSelected ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            {isMultiSelect ? (
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                                    {isSelected && <CheckCircle size={10} className="text-white" />}
                                </div>
                            ) : (
                                <Folder size={18} className={isSelected ? 'fill-indigo-100' : ''} />
                            )}
                            <span className="truncate flex-1">{folder.name}</span>
                            {!isMultiSelect && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => handleDeleteFolder(e, folder.id)}>
                                    <Trash2 size={14} className="text-slate-300 hover:text-red-500" />
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-100/50">
                <button
                    onClick={() => setShowStudentPicker(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 bg-white rounded-lg border border-slate-200 text-slate-600 text-sm font-bold shadow-sm hover:text-indigo-600 hover:border-indigo-100 transition-colors"
                >
                    <Dices size={16} />
                    班级抽号 (Lottery)
                </button>
            </div>
        </div>
    );

    return (
        <div className="h-[calc(100vh-100px)] animate-fade-in bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
            {mode === 'manage' ? (
                <SplitPane
                    left={Sidebar}
                    right={
                        <div className="h-full flex flex-col bg-white">
                            {/* Toolbar */}
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur sticky top-0 z-10">
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                    {isMultiSelect
                                        ? `多选模式 (${studySelection.length} 个文件夹)`
                                        : (selectedFolderId === 'all' ? '所有卡片' :
                                            selectedFolderId === 'today' ? '今日需复习' :
                                                folders.find(f => f.id === selectedFolderId)?.name || '文件夹')
                                    }
                                    <span className="bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full text-xs">{displayCards.length}</span>
                                </h3>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setMode('study')}
                                        disabled={studyQueue.length === 0 && displayCards.length === 0}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${studyQueue.length === 0 && displayCards.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95'}`}
                                        title={displayCards.length === 0 ? "没有卡片可复习" : "开始复习当前筛选卡片"}
                                        onClickCapture={() => {
                                            if (mode === 'manage') startSession();
                                        }}
                                    >
                                        <Play size={16} />
                                        开始复习
                                    </button>

                                    {/* Card Count Limit Input */}
                                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 ml-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Count</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="500"
                                            value={drawCount}
                                            onChange={(e) => setDrawCount(parseInt(e.target.value) || 10)}
                                            className="w-12 bg-transparent text-sm font-bold text-slate-700 outline-none text-center"
                                        />
                                    </div>

                                    <button onClick={() => setIsAddingCard(true)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Card Grid */}
                            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                                {/* Add Input */}
                                <div className="mb-6 bg-white border border-slate-200 shadow-sm rounded-xl p-4 transition-all focus-within:ring-2 ring-blue-500/10">
                                    {isAddingCard ? (
                                        <div className="flex flex-col gap-3">
                                            <div className="flex gap-3">
                                                <input value={newFront} onChange={e => setNewFront(e.target.value)} placeholder="正面内容 (Front)" className="flex-1 p-2 bg-slate-50 rounded border-none outline-none font-medium" autoFocus />
                                                <input value={newBack} onChange={e => setNewBack(e.target.value)} placeholder="背面内容 (Back)" className="flex-1 p-2 bg-slate-50 rounded border-none outline-none" />
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setIsAddingCard(false)} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-100 rounded">取消</button>
                                                <button onClick={handleAddCard} className="px-4 py-1.5 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700">保存</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button onClick={() => setIsAddingCard(true)} className="w-full py-2 text-slate-400 text-sm font-bold border-2 border-dashed border-slate-100 rounded-lg hover:border-blue-200 hover:text-blue-500 flex items-center justify-center gap-2">
                                            <Plus size={16} /> 添加卡片到 '{selectedFolderId === 'all' ? '未分类' : (folders.find(f => f.id === selectedFolderId)?.name || '当前')}'
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {displayCards.map(card => {
                                        const isDue = !card.nextReview || card.nextReview <= Date.now();
                                        return (
                                            <div key={card.id} className="group bg-white rounded-xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all relative">
                                                <div className="font-bold text-slate-800 mb-2 truncate" title={card.front}>{card.front}</div>
                                                <div className="text-sm text-slate-500 line-clamp-3 mb-4 h-12">{card.back}</div>
                                                <div className="flex justify-between items-center">
                                                    <div className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${isDue ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                        {isDue ? '到期' : '待复习'}
                                                    </div>
                                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => handleDeleteCard(card.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    }
                    leftClassName="bg-white border-r border-slate-100"
                    rightClassName="bg-white"
                />
            ) : (
                <div className="h-full flex flex-col bg-white">
                    {/* Toolbar */}
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <RotateCw size={20} className="text-indigo-500" />
                            复习模式 ({studyQueue.length - currentCardIndex} left)
                        </h3>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">SESSION SCORE:</span>
                            <span className="text-sm font-bold text-indigo-600">{sessionStats.correct}/{sessionStats.reviewed}</span>
                            <button
                                onClick={() => setMode('manage')}
                                className="ml-4 p-2 hover:bg-slate-200 rounded-full text-slate-400"
                            >
                                <XCircle size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Flashcard Study Area */}
                    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-100/50 relative">
                        {/* Progress Bar */}
                        <div className="absolute top-0 left-0 h-1 bg-indigo-500 transition-all duration-300" style={{ width: `${(currentCardIndex / studyQueue.length) * 100}%` }}></div>

                        <div className="w-full max-w-2xl perspective-1000">
                            <div
                                className={`relative w-full aspect-video bg-white rounded-3xl shadow-xl border-2 border-indigo-50 p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                                onClick={() => setIsFlipped(!isFlipped)}
                            >
                                <div className="backface-hidden w-full h-full flex flex-col items-center justify-center">
                                    <div className="text-xs font-bold text-indigo-200 uppercase mb-4 tracking-widest">Question</div>
                                    <div className="text-4xl font-black text-slate-800 break-words w-full">{studyQueue[currentCardIndex]?.front}</div>
                                    <div className="mt-8 text-xs text-slate-400 font-medium flex items-center gap-2">
                                        <RotateCw size={12} /> 点击翻转查看答案
                                    </div>
                                </div>

                                <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 rounded-3xl p-8 flex flex-col items-center justify-center text-white">
                                    <div className="text-xs font-bold text-indigo-300 uppercase mb-4 tracking-widest">Answer</div>
                                    <div className="text-3xl font-bold break-words w-full">{studyQueue[currentCardIndex]?.back}</div>
                                </div>
                            </div>
                        </div>

                        {/* Control Buttons */}
                        {isFlipped && (
                            <div className="mt-8 flex gap-4 w-full max-w-md animate-fade-in-up">
                                <button
                                    onClick={() => handleNextCard(1)} // 1 = Forgot
                                    className="flex-1 bg-white hover:bg-red-50 text-red-500 border border-slate-200 hover:border-red-200 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <XCircle size={20} />
                                    忘记 (Reset)
                                </button>
                                <button
                                    onClick={() => handleNextCard(4)} // 4 = Good
                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <CheckCircle size={20} />
                                    认识 (Known)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

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
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">选中学生</div>
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
                                {isRolling ? '抽号中...' : '开始抽号'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlashcardView;
