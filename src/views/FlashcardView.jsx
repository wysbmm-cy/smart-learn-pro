import React, { useState, useEffect, useRef } from 'react';
import { Layers, Plus, Trash2, RefreshCw, ChevronLeft, ChevronRight, RotateCw, CheckCircle, XCircle, Dices, Folder, FolderPlus, MoreVertical, LayoutGrid, Tag, Play, Star, AlertTriangle, AlertCircle, BarChart3, Undo2, Volume2, Trophy, Flame, Zap } from 'lucide-react';
import { useApp } from '../context/AppContext';
import SplitPane from '../components/SplitPane';
import DifficultyPieChart from '../components/DifficultyPieChart';
import StudyTrendChart from '../components/StudyTrendChart';
import DrillCard from '../components/DrillCard';
import { saveFolder, getFolders, deleteFolder } from '../services/db';
import { generateDrillCards } from '../services/ai';

const FlashcardView = () => {
    const { loadUserFlashcards, addFlashcard, removeFlashcard, updateFlashcardProgress, updateFlashcard, flashcardStartupState, setFlashcardStartupState, settings } = useApp();

    // Data State
    const [allCards, setAllCards] = useState([]);
    const [folders, setFolders] = useState([]);

    // UI State
    const [mode, setMode] = useState('manage'); // 'manage' | 'study'
    const [selectedFolderId, setSelectedFolderId] = useState('all'); // 'all', 'today', or folder UUID
    const [isAddingFolder, setIsAddingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [isMultiSelect, setIsMultiSelect] = useState(false); // New: Toggle multi-select mode
    const [isSwapped, setIsSwapped] = useState(false); // New: Toggle Q/A sides
    const [showStats, setShowStats] = useState(false); // New: Toggle statistics panel

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

    // New: Advanced Optimization State
    const [showSessionSummary, setShowSessionSummary] = useState(false);
    const [lastAction, setLastAction] = useState(null); // { cardId, prevIndex, quality, timestamp }
    const [undoTimeout, setUndoTimeout] = useState(null);
    const [studyStreak, setStudyStreak] = useState({ current: 0, longest: 0 });
    const [sessionStartTime, setSessionStartTime] = useState(null);

    // Smart Drill State
    const [isDrillMode, setIsDrillMode] = useState(false);
    const [currentDrill, setCurrentDrill] = useState(null);
    const [isGeneratingDrill, setIsGeneratingDrill] = useState(false);

    useEffect(() => {
        loadData();
        loadStreak();
    }, []);

    const loadStreak = () => {
        const streakData = localStorage.getItem('smartlearn_streak');
        if (streakData) {
            setStudyStreak(JSON.parse(streakData));
        }
    };

    const saveStreak = (newStreak) => {
        localStorage.setItem('smartlearn_streak', JSON.stringify(newStreak));
        setStudyStreak(newStreak);
    };

    const updateStreak = () => {
        const today = new Date().toISOString().split('T')[0];
        const streakData = localStorage.getItem('smartlearn_streak');
        let streak = streakData ? JSON.parse(streakData) : { current: 0, longest: 0, lastDate: null };

        if (streak.lastDate === today) {
            // Already studied today
            return streak;
        }

        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (streak.lastDate === yesterday) {
            streak.current += 1;
        } else {
            streak.current = 1; // Reset streak
        }

        streak.longest = Math.max(streak.longest, streak.current);
        streak.lastDate = today;
        saveStreak(streak);
        return streak;
    };

    const speakText = (text) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            speechSynthesis.speak(utterance);
        }
    };

    const handleUndo = async () => {
        if (!lastAction || Date.now() - lastAction.timestamp > 5000) return;

        // Clear timeout
        if (undoTimeout) {
            clearTimeout(undoTimeout);
            setUndoTimeout(null);
        }

        // Restore previous state
        setCurrentCardIndex(lastAction.prevIndex);
        setIsFlipped(false);
        setSessionStats(lastAction.prevStats);

        // Remove retry card if it was added
        if (lastAction.quality === 1) {
            setStudyQueue(prev => prev.slice(0, -1));
        }

        setLastAction(null);
    };

    const loadData = async () => {
        const [cards, folderList] = await Promise.all([
            loadUserFlashcards(),
            getFolders()
        ]);
        setAllCards(cards);
        setFolders(folderList);
    };

    // Smart Drill: Load or generate drill for flagged card
    const loadOrGenerateDrill = async (card) => {
        // Check if drills are enabled
        if (settings?.drillsEnabled === false) return null;

        // Check if card has existing drills
        if (card.drillCards && card.drillCards.length > 0) {
            // Filter by enabled drill types
            const enabledTypes = settings?.drillTypes || {};
            const availableDrills = card.drillCards.filter(d =>
                enabledTypes[d.type] !== false
            );
            if (availableDrills.length > 0) {
                // Random selection
                return availableDrills[Math.floor(Math.random() * availableDrills.length)];
            }
        }

        // Generate new drills if none exist
        if (!card.drillCards && settings?.apiKey) {
            setIsGeneratingDrill(true);
            try {
                const drills = await generateDrillCards(card.front, card.back, settings);
                if (drills && drills.length > 0) {
                    // Save drills to card
                    const updatedCard = { ...card, drillCards: drills, drillGeneratedAt: Date.now() };
                    await updateFlashcard(updatedCard);
                    setAllCards(prev => prev.map(c => c.id === card.id ? updatedCard : c));
                    setStudyQueue(prev => prev.map(c => c.id === card.id ? updatedCard : c));

                    // Return a random drill
                    const enabledTypes = settings?.drillTypes || {};
                    const availableDrills = drills.filter(d => enabledTypes[d.type] !== false);
                    if (availableDrills.length > 0) {
                        return availableDrills[Math.floor(Math.random() * availableDrills.length)];
                    }
                }
            } catch (e) {
                console.error('Failed to generate drills:', e);
            } finally {
                setIsGeneratingDrill(false);
            }
        }

        return null;
    };

    // Handle drill completion
    const handleDrillComplete = (isCorrect) => {
        setIsDrillMode(false);
        setCurrentDrill(null);

        // Update session stats
        setSessionStats(prev => ({
            reviewed: prev.reviewed + 1,
            correct: isCorrect ? prev.correct + 1 : prev.correct
        }));

        // Move to next card
        if (currentCardIndex < studyQueue.length - 1) {
            setCurrentCardIndex(prev => prev + 1);
            setIsFlipped(false);
        } else {
            // Session complete
            loadData();
            updateStreak();
            setShowSessionSummary(true);
        }
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
        if (selectedFolderId === 'flagged') {
            return allCards.filter(c => c.isFlagged);
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
            candidates = allCards.filter(c => !c.nextReview || c.nextReview <= now);
        } else if (targetFolder === 'flagged') {
            candidates = allCards.filter(c => c.isFlagged);
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
        setSessionStartTime(Date.now());
        setLastAction(null);
        setShowSessionSummary(false);
        setIsDrillMode(false);
        setCurrentDrill(null);
        setMode('study');
    };

    // Enhanced Keyboard Shortcuts
    useEffect(() => {
        if (mode !== 'study') return;
        const handleKeyDown = (e) => {
            // Prevent shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Universal shortcuts
            if (e.key === 'Escape') {
                setMode('manage');
                return;
            }
            if (e.key === ' ' || e.key === 'Space') {
                e.preventDefault();
                setIsFlipped(prev => !prev);
                return;
            }
            if ((e.key === 's' || e.key === 'S') && currentCard) {
                handleToggleFlag(e, currentCard);
                return;
            }
            if ((e.key === 'z' || e.key === 'Z') && lastAction) {
                handleUndo();
                return;
            }

            // Grading shortcuts (only when flipped)
            if (isFlipped) {
                if (e.key === '1') handleNextCard(1);
                if (e.key === '2') handleNextCard(2);
                if (e.key === '3') handleNextCard(3);
                if (e.key === '4') handleNextCard(4);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, isFlipped, currentCardIndex, studyQueue, lastAction]);

    const handleToggleFlag = async (e, card) => {
        e.stopPropagation();
        const updated = { ...card, isFlagged: !card.isFlagged };
        // Update specific card in allCards and studyQueue locally
        setAllCards(prev => prev.map(c => c.id === card.id ? updated : c));
        setStudyQueue(prev => prev.map(c => c.id === card.id ? updated : c));
        // Persist
        await updateFlashcard(updated); // Context function
    };

    const handleNextCard = async (quality) => {
        const currentCard = studyQueue[currentCardIndex];

        // Store undo state BEFORE making changes
        setLastAction({
            cardId: currentCard.id,
            prevIndex: currentCardIndex,
            prevStats: { ...sessionStats },
            quality,
            timestamp: Date.now()
        });

        // Clear any existing undo timeout
        if (undoTimeout) clearTimeout(undoTimeout);
        const timeout = setTimeout(() => setLastAction(null), 5000);
        setUndoTimeout(timeout);

        // SRS Update
        // Quality: 1=Again, 2=Hard, 3=Good, 4=Easy
        await updateFlashcardProgress(currentCard.id, quality);

        // Queue Logic
        if (quality === 1) {
            // Again: Re-queue this card to end of session
            setStudyQueue(prev => {
                const newB = [...prev];
                newB.push({ ...currentCard, _isRetry: true });
                return newB;
            });
        }

        const newStats = {
            reviewed: sessionStats.reviewed + 1,
            correct: quality >= 3 ? sessionStats.correct + 1 : sessionStats.correct
        };
        setSessionStats(newStats);

        if (currentCardIndex < studyQueue.length - 1) {
            setCurrentCardIndex(prev => prev + 1);
            setIsFlipped(false);
        } else {
            // Session complete!
            await loadData();
            updateStreak(); // Update daily streak
            setShowSessionSummary(true); // Show summary modal instead of alert
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
    const currentCard = studyQueue[currentCardIndex];
    const questionText = currentCard ? (isSwapped ? currentCard.back : currentCard.front) : '';
    const answerText = currentCard ? (isSwapped ? currentCard.front : currentCard.back) : '';

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

                        <button
                            onClick={() => setSelectedFolderId('flagged')}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left font-medium transition-colors ${selectedFolderId === 'flagged' ? 'bg-white shadow-sm text-rose-500' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <Star size={18} className={selectedFolderId === 'flagged' ? "fill-rose-500" : ""} />
                            重点标记 (Flagged)
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
                                                selectedFolderId === 'flagged' ? `重点标记 (${displayCards.length})` :
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

                                    <button
                                        onClick={() => setShowStats(!showStats)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-2 transition-all ${showStats ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-500'}`}
                                    >
                                        <BarChart3 size={14} />
                                        {showStats ? '隐藏统计' : '查看统计'}
                                    </button>

                                    <button onClick={() => setIsAddingCard(true)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Statistics Panel */}
                            {showStats && (
                                <div className="p-6 bg-slate-50/50 border-b border-slate-100">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <DifficultyPieChart flashcards={allCards} />
                                        <StudyTrendChart days={30} />
                                    </div>
                                </div>
                            )}

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
                        <button
                            onClick={() => setIsSwapped(!isSwapped)}
                            className={`ml-4 px-3 py-1 text-xs font-bold border rounded-lg transition-all flex items-center gap-2 ${isSwapped ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-500'}`}
                        >
                            <RotateCw size={12} />
                            {isSwapped ? 'Answer → Question' : 'Question → Answer'}
                        </button>

                        {/* Flag Toggle (Top Bar) */}
                        {currentCard && (
                            <button
                                onClick={(e) => {
                                    const updated = { ...currentCard, isFlagged: !currentCard.isFlagged };
                                    setAllCards(prev => prev.map(c => c.id === currentCard.id ? updated : c));
                                    setStudyQueue(prev => prev.map(c => c.id === currentCard.id ? updated : c));
                                    updateFlashcard(updated); // Context function
                                }}
                                className={`ml-2 p-1.5 rounded-lg border transition-all ${currentCard.isFlagged ? 'bg-amber-50 border-amber-200 text-amber-500 shadow-sm ring-1 ring-amber-100' : 'bg-white border-slate-200 text-slate-300 hover:text-amber-400'}`}
                                title="Mark as Difficult (Flag)"
                            >
                                <Star size={16} fill={currentCard.isFlagged ? "currentColor" : "none"} />
                            </button>
                        )}
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

                        {/* Drill Generating Indicator */}
                        {isGeneratingDrill && (
                            <div className="absolute top-4 right-4 flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse">
                                <Zap size={14} />
                                生成智能练习中...
                            </div>
                        )}

                        {/* Flagged Card Indicator */}
                        {currentCard?.isFlagged && !isDrillMode && (
                            <div className="absolute top-4 left-4 flex items-center gap-2 bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold">
                                <Star size={14} fill="currentColor" />
                                重点卡片
                                {currentCard?.drillCards?.length > 0 && <span className="text-amber-500">• 有智能练习</span>}
                            </div>
                        )}

                        {/* Drill Mode UI */}
                        {isDrillMode && currentDrill ? (
                            <DrillCard
                                drill={currentDrill}
                                onComplete={handleDrillComplete}
                                speakText={speakText}
                            />
                        ) : (
                            /* Normal Flashcard UI */
                            <>
                                <div className="w-full max-w-2xl perspective-1000">
                                    <div
                                        className={`relative w-full aspect-video bg-white rounded-3xl shadow-xl border-2 border-indigo-50 p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                                        onClick={async () => {
                                            if (!isFlipped) {
                                                // Check if flagged card should trigger drill mode
                                                if (currentCard?.isFlagged && settings?.drillsEnabled !== false) {
                                                    const drill = await loadOrGenerateDrill(currentCard);
                                                    if (drill) {
                                                        setCurrentDrill(drill);
                                                        setIsDrillMode(true);
                                                        return;
                                                    }
                                                }
                                            }
                                            setIsFlipped(!isFlipped);
                                        }}
                                    >
                                        <div className="backface-hidden w-full h-full flex flex-col items-center justify-center">
                                            <div className="text-xs font-bold text-indigo-200 uppercase mb-4 tracking-widest">Question</div>
                                            <div className={`font-black text-slate-800 break-words w-full ${questionText.length > 50 ? 'text-xl' : 'text-4xl'}`}>
                                                {questionText}
                                            </div>
                                            <div className="mt-6 flex items-center gap-4">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); speakText(questionText); }}
                                                    className="p-2 bg-indigo-100 hover:bg-indigo-200 rounded-full text-indigo-600 transition-all"
                                                    title="朗读发音"
                                                >
                                                    <Volume2 size={20} />
                                                </button>
                                            </div>
                                            <div className="mt-4 text-xs text-slate-400 font-medium flex items-center gap-2">
                                                <RotateCw size={12} /> 点击翻转查看答案 (Space)
                                                {currentCard?.isFlagged && settings?.drillsEnabled !== false && (
                                                    <span className="ml-2 text-emerald-500">⚡ 可能进入智能练习</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="absolute inset-0 backface-hidden rotate-y-180 bg-indigo-600 rounded-3xl p-8 flex flex-col items-center justify-center text-white">
                                            <div className="text-xs font-bold text-indigo-300 uppercase mb-4 tracking-widest">Answer</div>
                                            <div className={`font-bold break-words w-full ${answerText.length > 100 ? 'text-lg' : 'text-3xl'}`}>
                                                {answerText}
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); speakText(answerText); }}
                                                className="mt-4 p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-all"
                                                title="朗读发音"
                                            >
                                                <Volume2 size={20} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Stats for Geeks */}
                                <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-xs">
                                    <div className="bg-slate-100 rounded-lg p-2 flex flex-col items-center">
                                        <span className="text-[10px] uppercase font-bold text-slate-400">Interval</span>
                                        <span className="text-xl font-mono font-bold text-slate-700">{currentCard?.interval || 0}d</span>
                                    </div>
                                    <div className="bg-slate-100 rounded-lg p-2 flex flex-col items-center">
                                        <span className="text-[10px] uppercase font-bold text-slate-400">Ease Factor</span>
                                        <span className="text-xl font-mono font-bold text-slate-700">{currentCard?.easeFactor?.toFixed(2) || '2.50'}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Control Buttons (4-Level SRS) moved inside container */}
                    {isFlipped && (
                        <div className="mt-8 flex gap-3 w-full max-w-2xl animate-fade-in-up px-4">
                            <button
                                onClick={() => handleNextCard(1)}
                                className="flex-1 flex flex-col items-center gap-1 bg-white hover:bg-rose-50 text-rose-500 border border-slate-200 hover:border-rose-200 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95 group"
                            >
                                <span className="text-xs font-black uppercase tracking-wider text-rose-300 group-hover:text-rose-400">Can't Recall</span>
                                <span className="text-lg">忘记 (1)</span>
                                <span className="text-[10px] font-mono text-slate-400">Repeat</span>
                            </button>

                            <button
                                onClick={() => handleNextCard(2)}
                                className="flex-1 flex flex-col items-center gap-1 bg-white hover:bg-orange-50 text-orange-600 border border-slate-200 hover:border-orange-200 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95 group"
                            >
                                <span className="text-xs font-black uppercase tracking-wider text-orange-300 group-hover:text-orange-400">Hard</span>
                                <span className="text-lg">困难 (2)</span>
                                <span className="text-[10px] font-mono text-slate-400">1.2x</span>
                            </button>

                            <button
                                onClick={() => handleNextCard(3)}
                                className="flex-1 flex flex-col items-center gap-1 bg-white hover:bg-emerald-50 text-emerald-600 border border-slate-200 hover:border-emerald-200 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95 group"
                            >
                                <span className="text-xs font-black uppercase tracking-wider text-emerald-300 group-hover:text-emerald-400">Good</span>
                                <span className="text-lg">一般 (3)</span>
                                <span className="text-[10px] font-mono text-slate-400">2.5x</span>
                            </button>

                            <button
                                onClick={() => handleNextCard(4)}
                                className="flex-1 flex flex-col items-center gap-1 bg-white hover:bg-blue-50 text-blue-600 border border-slate-200 hover:border-blue-200 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95 group"
                            >
                                <span className="text-xs font-black uppercase tracking-wider text-blue-300 group-hover:text-blue-400">Easy</span>
                                <span className="text-lg">简单 (4)</span>
                                <span className="text-[10px] font-mono text-slate-400">3.5x</span>
                            </button>
                        </div>
                    )}

                </div>
            )}

            {/* Control Buttons (4-Level SRS) */}




            {/* Student Picker Modal */}
            {
                showStudentPicker && (
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
                )
            }

            {/* Session Summary Modal */}
            {showSessionSummary && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl p-8 w-[420px] text-center border-4 border-white ring-4 ring-emerald-50 animate-in fade-in zoom-in duration-300">
                        <div className="mb-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
                                <Trophy size={40} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-800">复习完成！🎉</h2>
                            <p className="text-slate-500 text-sm mt-1">太棒了，继续保持！</p>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-slate-50 rounded-xl p-4">
                                <div className="text-3xl font-black text-indigo-600">{sessionStats.reviewed}</div>
                                <div className="text-xs text-slate-400 font-bold">复习卡片</div>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4">
                                <div className="text-3xl font-black text-emerald-600">
                                    {sessionStats.reviewed > 0 ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100) : 0}%
                                </div>
                                <div className="text-xs text-slate-400 font-bold">正确率</div>
                            </div>
                            <div className="bg-slate-50 rounded-xl p-4">
                                <div className="text-3xl font-black text-amber-500">
                                    {sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 60000) : 0}
                                </div>
                                <div className="text-xs text-slate-400 font-bold">分钟</div>
                            </div>
                        </div>

                        {/* Streak Display */}
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-4 mb-6 flex items-center justify-center gap-3">
                            <Flame size={28} className="text-orange-500" />
                            <div className="text-left">
                                <div className="text-lg font-black text-orange-600">连续学习 {studyStreak.current} 天</div>
                                <div className="text-xs text-orange-400">最长记录: {studyStreak.longest} 天</div>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                setShowSessionSummary(false);
                                setMode('manage');
                            }}
                            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95"
                        >
                            继续学习
                        </button>
                    </div>
                </div>
            )}

            {/* Undo Floating Button */}
            {mode === 'study' && lastAction && Date.now() - lastAction.timestamp < 5000 && (
                <button
                    onClick={handleUndo}
                    className="fixed bottom-8 left-8 z-40 flex items-center gap-2 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg hover:bg-slate-700 transition-all animate-fade-in"
                >
                    <Undo2 size={18} />
                    <span className="font-bold text-sm">撤销 (Z)</span>
                </button>
            )}
        </div >
    );
};

export default FlashcardView;
