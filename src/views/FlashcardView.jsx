import React, { useState, useEffect, useRef } from 'react';
import { Layers, Plus, Trash2, RefreshCw, ChevronLeft, ChevronRight, RotateCw, CheckCircle, XCircle, Dices, Folder, FolderPlus, MoreVertical, LayoutGrid, Tag, Play, Star, AlertTriangle, AlertCircle, BarChart3, Undo2, Volume2, Trophy, Flame, Zap, Brain, Loader2, PanelRightClose, PanelRightOpen, Lightbulb, MessageSquare, Edit3, BookOpen, Sparkles, Link as LinkIcon, FileText, Search, X, Maximize2, Minimize2, MoreHorizontal, Settings } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useApp } from '../context/AppContext';
import SplitPane from '../components/SplitPane';
import DifficultyPieChart from '../components/DifficultyPieChart';
import StudyTrendChart from '../components/StudyTrendChart';
import DrillCard from '../components/DrillCard';
import RemediationHub from '../components/RemediationHub';
import { saveFolder, getFolders, deleteFolder, getRecentDrillLogs, getDiagnosis, saveDiagnosis } from '../services/db';
import { generateDrillCards, generateDiagnosis, generateRemediationDrills, generateDeepNotes } from '../services/ai';
import toast from 'react-hot-toast';

const FlashcardView = () => {
    const { loadUserFlashcards, addFlashcard, removeFlashcard, updateFlashcardProgress, updateFlashcard, flashcardStartupState, setFlashcardStartupState, settings, saveToNotes, loadUserNotes } = useApp();
    const [editingNoteCard, setEditingNoteCard] = useState(null); // Card being edited in modal
    const [isLinkingNote, setIsLinkingNote] = useState(false); // Toggle Note Selector
    const [userNotes, setUserNotes] = useState([]); // Loaded notes for selection

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
    const [sortMode, setSortMode] = useState('mastery_asc'); // 'default' | 'mastery_asc' | 'mastery_desc'

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
    const [drillQueue, setDrillQueue] = useState([]); // Queue of all drills for current card
    const [drillIndex, setDrillIndex] = useState(0); // Current drill index in queue
    const [isGeneratingDrill, setIsGeneratingDrill] = useState(false);

    // A.I.R. System State
    const [showRemediation, setShowRemediation] = useState(false);
    const [airStatus, setAirStatus] = useState('idle'); // 'idle' | 'preparing' | 'ready'
    const [airData, setAirData] = useState(null); // { diagnosis, drills }

    // A.I.R. Background Prefetch Function
    const prefetchAIR = async () => {
        if (airStatus === 'preparing') return; // Already in progress

        setAirStatus('preparing');

        try {
            const today = new Date().toISOString().split('T')[0];

            // Check existing diagnosis
            let diagnosis = await getDiagnosis(today);

            if (!diagnosis) {
                // Generate new diagnosis
                const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();
                const recentLogs = await getRecentDrillLogs(yesterday);

                if (recentLogs.length === 0) {
                    diagnosis = {
                        primary_weakness: 'none',
                        analysis_summary: '暂无诊断数据。请先完成一些练习题。',
                        prescription: '去闪卡复习页面完成一些练习吧！'
                    };
                } else {
                    diagnosis = await generateDiagnosis(recentLogs, settings);
                    if (diagnosis) {
                        await saveDiagnosis(today, diagnosis);
                    }
                }
            }

            // Generate drills if diagnosis is valid
            let drills = [];
            if (diagnosis && diagnosis.primary_weakness !== 'none' && diagnosis.primary_weakness !== 'error') {
                drills = await generateRemediationDrills(diagnosis, settings, 5);
            }

            setAirData({ diagnosis, drills });
            setAirStatus('ready');
        } catch (err) {
            console.error('A.I.R. prefetch error:', err);
            setAirStatus('idle');
        }
    };

    // Handle A.I.R. button click
    const handleAIRClick = () => {
        if (airStatus === 'ready') {
            // Already prepared, open directly
            setShowRemediation(true);
        } else if (airStatus === 'idle') {
            // Start background preparation
            prefetchAIR();
        }
        // If 'preparing', do nothing (show loading state)
    };

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

    // Deep Learning Panel toggle
    const [showDetailPanel, setShowDetailPanel] = useState(false);

    // Mastery Color Helper
    const getMasteryColor = (interval) => {
        if (!interval || interval <= 1) return 'bg-white border-slate-200'; // New
        if (interval <= 3) return 'bg-blue-50 border-blue-200'; // Learning
        if (interval <= 7) return 'bg-indigo-50 border-indigo-200'; // Developing
        if (interval <= 21) return 'bg-purple-50 border-purple-200'; // Proficient
        return 'bg-amber-50 border-amber-200'; // Mastered
    };

    const getMasteryLabel = (interval) => {
        if (!interval || interval <= 1) return 'New';
        if (interval <= 3) return 'Learning';
        if (interval <= 7) return 'Developing';
        if (interval <= 21) return 'Proficient';
        return 'Mastered';
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
        if (settings?.drillsEnabled === false) return [];

        // Check if card has existing drills
        if (card.drillCards && card.drillCards.length > 0) {
            // Filter by enabled drill types and shuffle
            const enabledTypes = settings?.drillTypes || {};
            const availableDrills = card.drillCards.filter(d =>
                enabledTypes[d.type] !== false
            );
            if (availableDrills.length > 0) {
                // Shuffle and return all drills
                return [...availableDrills].sort(() => Math.random() - 0.5);
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

                    // Return all enabled drills shuffled
                    const enabledTypes = settings?.drillTypes || {};
                    const availableDrills = drills.filter(d => enabledTypes[d.type] !== false);
                    if (availableDrills.length > 0) {
                        return [...availableDrills].sort(() => Math.random() - 0.5);
                    }
                }
            } catch (e) {
                console.error('Failed to generate drills:', e);
            } finally {
                setIsGeneratingDrill(false);
            }
        }

        return [];
    };

    // Handle drill completion - advance through drill queue
    const handleDrillComplete = (isCorrect) => {
        // Update session stats for each drill
        setSessionStats(prev => ({
            reviewed: prev.reviewed,
            correct: isCorrect ? prev.correct + 1 : prev.correct
        }));

        // Check if there are more drills in the queue
        if (drillIndex < drillQueue.length - 1) {
            // Move to next drill in queue
            const nextIndex = drillIndex + 1;
            setDrillIndex(nextIndex);
            setCurrentDrill(drillQueue[nextIndex]);
        } else {
            // All drills completed, exit drill mode
            setIsDrillMode(false);
            setCurrentDrill(null);
            setDrillQueue([]);
            setDrillIndex(0);

            // Count as one reviewed card
            setSessionStats(prev => ({
                reviewed: prev.reviewed + 1,
                correct: prev.correct
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
        let result = [];
        if (isMultiSelect) {
            result = allCards.filter(c => studySelection.includes(c.folderId));
        } else if (selectedFolderId === 'all') {
            result = allCards;
        } else if (selectedFolderId === 'today') {
            const now = Date.now();
            result = allCards.filter(c => !c.nextReview || c.nextReview <= now);
        } else if (selectedFolderId === 'flagged') {
            result = allCards.filter(c => c.isFlagged);
        } else {
            result = allCards.filter(c => c.folderId === selectedFolderId);
        }

        // Apply Sorting
        if (sortMode === 'mastery_asc') {
            // Weakest First (Low Interval)
            return [...result].sort((a, b) => (a.interval || 0) - (b.interval || 0));
        } else if (sortMode === 'mastery_desc') {
            // Strongest First (High Interval)
            return [...result].sort((a, b) => (b.interval || 0) - (a.interval || 0));
        }

        return result;
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
        } else if (targetFolder === 'flagged') {
            candidates = allCards.filter(c => c.isFlagged);
        } else {
            candidates = allCards.filter(c => c.folderId === targetFolder);
        }

        if (candidates.length === 0) {
            toast.error("没有找到符合条件的卡片！");
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

    const [isGeneratingDeepNotes, setIsGeneratingDeepNotes] = useState(false);

    const handleGenerateDeepNotes = async () => {
        if (!currentCard || isGeneratingDeepNotes) return;

        // Check if API key is set
        if (!settings.apiKey) {
            alert("请先在设置中配置 API Key (OpenAI / SiliconFlow)");
            return;
        }

        setIsGeneratingDeepNotes(true);
        try {
            const markdown = await generateDeepNotes(currentCard.front, currentCard.context, settings);
            if (markdown) {
                const updatedCard = {
                    ...currentCard,
                    // Store the full markdown in 'notes' field (consolidated)
                    notes: markdown
                };

                // 1. Update Flashcard Data
                await updateFlashcard(updatedCard);
                // Update local state
                setAllCards(prev => prev.map(c => c.id === currentCard.id ? updatedCard : c));
                setStudyQueue(prev => prev.map(c => c.id === currentCard.id ? updatedCard : c));

                // 2. Sync to Notebook ("Deep Notes" Folder)
                const noteContent = `# ${currentCard.front}\n\n` +
                    `> ${currentCard.back}\n\n` +
                    markdown;

                await saveToNotes({
                    id: `dn_${currentCard.id}`,
                    title: currentCard.front,
                    content: noteContent,
                    folder: '深度笔记',
                    updatedAt: Date.now()
                });
            }
        } catch (e) {
            console.error(e);
            alert("生成失败，请检查网络或 API Key");
        } finally {
            setIsGeneratingDeepNotes(false);
        }
    };

    const handleToggleFlag = async (e, card) => {
        e.stopPropagation();
        const newIsFlagged = !card.isFlagged;
        const updated = { ...card, isFlagged: newIsFlagged };

        // Update specific card in allCards and studyQueue locally
        setAllCards(prev => prev.map(c => c.id === card.id ? updated : c));
        setStudyQueue(prev => prev.map(c => c.id === card.id ? updated : c));

        // Persist Flag Status
        await updateFlashcard(updated);

        // Background Drill Generation (if flagging ON and no drills exist)
        if (newIsFlagged && (!card.drillCards || card.drillCards.length === 0)) {
            // Fire and forget - don't block UI
            generateDrillCards(card.front, card.back, settings)
                .then(drills => {
                    if (drills && drills.length > 0) {
                        const cardWithDrills = { ...updated, drillCards: drills, drillGeneratedAt: Date.now() };
                        updateFlashcard(cardWithDrills);
                        // Update local state again if this card is still loaded
                        setAllCards(prev => prev.map(c => c.id === card.id ? cardWithDrills : c));
                        setStudyQueue(prev => prev.map(c => c.id === card.id ? cardWithDrills : c));
                    }
                })
                .catch(err => console.error("Background Drill Gen Error:", err));
        }
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

    // --- Link Note Logic ---
    const handleOpenLinkModal = async () => {
        setIsLinkingNote(true);
        const notes = await loadUserNotes();
        // Sort by updated newest
        setUserNotes(notes.sort((a, b) => b.updatedAt - a.updatedAt));
    };

    const handleLinkNote = async (note) => {
        // "Link" by copying content (simplest integration)
        // User asked for "directly show associated note"
        const targetCard = editingNoteCard || currentCard; // Works for both Modal and Study Mode
        if (!targetCard) return;

        // Confirm overwrite?
        if (targetCard.notes && !window.confirm("Overwrite existing Deep Notes?")) return;

        const updated = { ...targetCard, notes: note.content };
        await updateFlashcard(updated);

        // Update local state
        setAllCards(prev => prev.map(c => c.id === targetCard.id ? updated : c));

        if (studyQueue.length > 0) {
            setStudyQueue(prev => prev.map(c => c.id === targetCard.id ? updated : c));
        }

        if (editingNoteCard) setEditingNoteCard(updated);
        if (currentCard?.id === targetCard.id) setCurrentCard(updated);

        setIsLinkingNote(false);
    };

    // --- Helper Components ---
    const NoteSelectorModal = () => {
        const [search, setSearch] = useState("");
        const filtered = userNotes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) || n.content.toLowerCase().includes(search.toLowerCase()));

        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[70vh] animate-scale-in overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <LinkIcon size={18} className="text-indigo-500" /> 关联已有笔记
                        </h3>
                        <button onClick={() => setIsLinkingNote(false)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-3 bg-white border-b border-slate-100">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input
                                type="text"
                                placeholder="搜索笔记标题或内容..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 bg-slate-50/50">
                        {filtered.length === 0 ? (
                            <div className="text-center py-10 text-slate-400">
                                <FileText size={40} className="mx-auto mb-2 opacity-20" />
                                <p>未找到匹配笔记</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filtered.map(note => (
                                    <button
                                        key={note.id}
                                        onClick={() => handleLinkNote(note)}
                                        className="w-full text-left p-4 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all group group-hover:shadow-sm"
                                    >
                                        <div className="font-bold text-slate-700 group-hover:text-indigo-700 mb-1">{note.title}</div>
                                        <div className="text-xs text-slate-400 line-clamp-2">{note.content.substring(0, 80)}...</div>
                                        <div className="mt-2 flex gap-2 text-[10px] text-slate-400">
                                            <span className="bg-slate-100 px-1.5 py-0.5 rounded">{note.folder || '默认'}</span>
                                            <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
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

            <div className="p-4 border-t border-slate-200 bg-slate-100/50 space-y-2">
                {/* A.I.R. Smart Review Button */}
                <button
                    onClick={handleAIRClick}
                    disabled={airStatus === 'preparing'}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold shadow-md transition-all ${airStatus === 'ready'
                        ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white'
                        : airStatus === 'preparing'
                            ? 'bg-slate-200 text-slate-500 cursor-wait'
                            : 'bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white'
                        }`}
                >
                    {airStatus === 'preparing' ? (
                        <><Loader2 size={16} className="animate-spin" /> 准备中...</>
                    ) : airStatus === 'ready' ? (
                        <><Brain size={16} /> ✅ 点击开始复习</>
                    ) : (
                        <><Brain size={16} /> 🩺 智能复习 (A.I.R.)</>
                    )}
                </button>
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

                                    {/* Sort Toggle Button */}
                                    <button
                                        onClick={() => {
                                            if (sortMode === 'default') setSortMode('mastery_asc');
                                            else if (sortMode === 'mastery_asc') setSortMode('mastery_desc');
                                            else setSortMode('default');
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-2 transition-all ${sortMode !== 'default' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-200 hover:text-indigo-500'}`}
                                        title="Sort by Mastery"
                                    >
                                        <Trophy size={14} className={sortMode !== 'default' ? 'fill-indigo-500' : ''} />
                                        {sortMode === 'default' ? '默认排序' : sortMode === 'mastery_asc' ? '掌握度: 低→高' : '掌握度: 高→低'}
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
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingNoteCard(card);
                                                            }}
                                                            className="text-slate-300 hover:text-indigo-500"
                                                            title="深度笔记 (Deep Dive)"
                                                        >
                                                            <Sparkles size={14} />
                                                        </button>
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
                                onClick={async (e) => {
                                    const newFlagged = !currentCard.isFlagged;
                                    const updated = { ...currentCard, isFlagged: newFlagged };
                                    setAllCards(prev => prev.map(c => c.id === currentCard.id ? updated : c));
                                    setStudyQueue(prev => prev.map(c => c.id === currentCard.id ? updated : c));
                                    await updateFlashcard(updated);

                                    // Background drill generation when flagging (not unflagging)
                                    if (newFlagged && !currentCard.drillCards && settings?.drillsEnabled !== false && settings?.apiKey) {
                                        // Generate drills in background without blocking UI
                                        generateDrillCards(currentCard.front, currentCard.back, settings)
                                            .then(drills => {
                                                if (drills && drills.length > 0) {
                                                    const cardWithDrills = { ...updated, drillCards: drills, drillGeneratedAt: Date.now() };
                                                    updateFlashcard(cardWithDrills);
                                                    setAllCards(prev => prev.map(c => c.id === currentCard.id ? cardWithDrills : c));
                                                    setStudyQueue(prev => prev.map(c => c.id === currentCard.id ? cardWithDrills : c));
                                                    console.log('✅ Drills generated in background for:', currentCard.front);
                                                }
                                            })
                                            .catch(err => console.error('Background drill generation failed:', err));
                                    }
                                }}
                                className={`ml-2 p-1.5 rounded-lg border transition-all ${currentCard.isFlagged ? 'bg-amber-50 border-amber-200 text-amber-500 shadow-sm ring-1 ring-amber-100' : 'bg-white border-slate-200 text-slate-300 hover:text-amber-400'}`}
                                title="标记为重点 (S)"
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
                    <div className="flex-1 flex flex-row items-stretch overflow-hidden bg-slate-100/50 relative">
                        {/* Progress Bar */}
                        <div className="absolute top-0 left-0 h-1 bg-indigo-500 transition-all duration-300 z-10" style={{ width: `${(currentCardIndex / studyQueue.length) * 100}%` }}></div>

                        {/* Left: Main Card Area */}
                        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto relative perspective-1000">

                            {/* Toolbar inside Study Area */}
                            <div className="absolute top-4 right-4 z-20 flex gap-2">
                                <button
                                    onClick={() => setShowDetailPanel(!showDetailPanel)}
                                    className={`p-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${showDetailPanel ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 hover:text-indigo-600 shadow-sm'}`}
                                >
                                    {showDetailPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                                    {showDetailPanel ? '收起详情' : '深度笔记'}
                                </button>
                            </div>

                            {/* Drill Generating Indicator */}
                            {isGeneratingDrill && (
                                <div className="absolute top-4 left-4 flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse z-20">
                                    <Zap size={14} />
                                    生成智能练习中...
                                </div>
                            )}

                            {/* Card Container */}
                            {!isDrillMode && (
                                <div
                                    className={`relative w-full aspect-video rounded-3xl shadow-xl border-2 p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''} ${getMasteryColor(currentCard?.interval)}`}
                                    style={{ maxWidth: showDetailPanel ? '800px' : '900px' }}
                                    onClick={async () => {
                                        if (!isFlipped) {
                                            // Check if flagged card should trigger drill mode
                                            // NEW LOGIC: Only if reviewing in Flagged folder AND drills exist
                                            if (selectedFolderId === 'flagged' && currentCard?.drillCards?.length > 0) {
                                                setDrillQueue(currentCard.drillCards);
                                                setDrillIndex(0);
                                                setCurrentDrill(currentCard.drillCards[0]);
                                                setIsDrillMode(true);
                                                return;
                                            }
                                        }
                                        setIsFlipped(!isFlipped);
                                    }}
                                >
                                    {/* Front Face */}
                                    <div className="backface-hidden w-full h-full flex flex-col items-center justify-center relative">
                                        {/* Mastery Badge */}
                                        <div className="absolute top-0 right-0 py-1 px-3 bg-white/50 backdrop-blur rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest border border-slate-100">
                                            Level: {getMasteryLabel(currentCard?.interval)}
                                        </div>

                                        {currentCard?.isFlagged && (
                                            <div className="absolute top-0 left-0 text-amber-400 animate-pulse">
                                                <Star size={24} fill="currentColor" />
                                            </div>
                                        )}

                                        <div className="text-xs font-bold text-slate-400 uppercase mb-4 tracking-widest opacity-60">Question</div>
                                        <div className={`font-black text-slate-800 break-words w-full ${questionText.length > 50 ? 'text-xl' : 'text-4xl'}`}>
                                            {questionText}
                                        </div>
                                        <div className="mt-6 flex items-center gap-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); speakText(questionText); }}
                                                className="p-3 bg-white/60 hover:bg-white text-indigo-600 rounded-full shadow-sm hover:shadow transition-all"
                                                title="朗读发音"
                                            >
                                                <Volume2 size={24} />
                                            </button>
                                        </div>
                                        <div className="mt-8 text-xs text-slate-400 font-medium flex items-center gap-2">
                                            <RotateCw size={12} /> 点击翻转 / Space
                                        </div>
                                    </div>

                                    {/* Back Face */}
                                    <div className="absolute inset-0 backface-hidden rotate-y-180 flex flex-col items-center justify-center rounded-3xl p-8 bg-indigo-600 text-white leading-relaxed">
                                        <div className="text-xs font-bold text-indigo-200 uppercase mb-4 tracking-widest">Answer</div>
                                        <div className={`font-bold break-words w-full ${answerText.length > 100 ? 'text-lg' : 'text-3xl'}`}>
                                            {answerText}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); speakText(answerText); }}
                                            className="mt-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all backdrop-blur"
                                            title="朗读发音"
                                        >
                                            <Volume2 size={24} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* SRS Stats (Geeks) */}
                            {isFlipped && !isDrillMode && (
                                <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-[200px] opacity-60 hover:opacity-100 transition-opacity">
                                    <div className="text-center">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">Interval</div>
                                        <div className="text-sm font-bold text-slate-600">{currentCard?.interval || 0}d</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase">Factor</div>
                                        <div className="text-sm font-bold text-slate-600">{currentCard?.easeFactor?.toFixed(2) || '2.50'}</div>
                                    </div>
                                </div>
                            )}

                            {/* Drill Mode Replacement */}
                            {isDrillMode && currentDrill && (
                                <div className="w-full max-w-3xl">
                                    {/* Drill Progress Indicator */}
                                    <div className="mb-4 flex items-center justify-between px-4">
                                        <div className="text-sm font-bold text-emerald-600 flex items-center gap-2">
                                            <Zap size={16} />
                                            智能练习 {drillIndex + 1} / {drillQueue.length}
                                        </div>
                                        <div className="flex gap-1">
                                            {drillQueue.map((_, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`w-2 h-2 rounded-full transition-all ${idx < drillIndex ? 'bg-emerald-500' :
                                                        idx === drillIndex ? 'bg-indigo-500 scale-125' :
                                                            'bg-slate-300'
                                                        }`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    <DrillCard
                                        drill={currentDrill}
                                        onComplete={handleDrillComplete}
                                        speakText={speakText}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Right: Detail Panel */}
                        <div className={`border-l border-slate-200 bg-white transition-all duration-300 flex flex-col shadow-inner z-30 ${showDetailPanel ? 'w-[400px] translate-x-0' : 'w-0 translate-x-full opacity-0'}`}>
                            <div className="p-6 h-full overflow-y-auto">
                                <h3 className="font-bold text-slate-800 mb-6 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <BookOpen size={20} className="text-indigo-500" />
                                        深度学习笔记
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleOpenLinkModal}
                                            disabled={isGeneratingDeepNotes}
                                            className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                                        >
                                            <LinkIcon size={12} />
                                            关联笔记
                                        </button>
                                        <button
                                            onClick={handleGenerateDeepNotes}
                                            disabled={isGeneratingDeepNotes}
                                            className="text-xs px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-full font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                                        >
                                            {isGeneratingDeepNotes ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                            AI 生成
                                        </button>
                                    </div>
                                </h3>

                                <div className="space-y-6">
                                    {/* Consolidated Deep Note Area */}
                                    <div className="bg-slate-50 rounded-xl p-0 border border-slate-200 overflow-hidden min-h-[400px]">
                                        {currentCard?.notes ? (
                                            <div className="prose prose-sm prose-indigo max-w-none p-4">
                                                <ReactMarkdown>{currentCard.notes}</ReactMarkdown>
                                                <button
                                                    onClick={() => {
                                                        const newVal = prompt("Edit Notes (Markdown supported):", currentCard.notes);
                                                        if (newVal !== null) {
                                                            const updated = { ...currentCard, notes: newVal };
                                                            updateFlashcard(updated);
                                                            setAllCards(prev => prev.map(c => c.id === currentCard.id ? updated : c));
                                                            setStudyQueue(prev => prev.map(c => c.id === currentCard.id ? updated : c));
                                                        }
                                                    }}
                                                    className="mt-4 text-xs text-indigo-500 hover:underline"
                                                >
                                                    [Edit Manually]
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                                                <Brain size={48} className="mb-4 opacity-20" />
                                                <p className="text-sm">点击上方 "AI 生成" 获取深度学习笔记</p>
                                                <p className="text-xs mt-2 opacity-60">包含词源、搭配、辨析等高阶内容</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
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

                    {/* Keyboard Shortcut Hints */}
                    {mode === 'study' && !isDrillMode && (
                        <div className="py-3 px-6 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-6 text-xs text-slate-400">
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-500 shadow-sm">Space</kbd>
                                翻转
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-500 shadow-sm">1-4</kbd>
                                评分
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-500 shadow-sm">S</kbd>
                                标记
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-500 shadow-sm">Z</kbd>
                                撤销
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono text-slate-500 shadow-sm">Esc</kbd>
                                退出
                            </span>
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

            {/* A.I.R. Remediation Hub */}
            {showRemediation && (
                <RemediationHub
                    prefetchedData={airData}
                    onClose={() => {
                        setShowRemediation(false);
                        setAirStatus('idle'); // Reset for next time
                        setAirData(null);
                    }}
                />
            )}

            {/* Note Selector Modal */}
            {isLinkingNote && <NoteSelectorModal />}

            {/* Deep Notes Modal (Library Mode) */}
            {editingNoteCard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden animate-scale-in">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Sparkles size={20} className="text-indigo-500" />
                                深度笔记: {editingNoteCard.front}
                            </h3>
                            <button
                                onClick={() => setEditingNoteCard(null)}
                                className="p-2 hover:bg-slate-200 rounded-full text-slate-400"
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                            <div className="bg-white rounded-xl border border-slate-200 min-h-full flex flex-col">
                                {editingNoteCard.notes ? (
                                    <div className="prose prose-sm prose-indigo max-w-none p-6">
                                        <ReactMarkdown>{editingNoteCard.notes}</ReactMarkdown>
                                        <textarea
                                            className="w-full mt-8 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono h-32 focus:ring-indigo-500"
                                            value={editingNoteCard.notes}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const updated = { ...editingNoteCard, notes: val };
                                                setEditingNoteCard(updated); // Just update modal local
                                            }}
                                            onBlur={() => {
                                                // Save on blur
                                                updateFlashcard(editingNoteCard);
                                                setAllCards(prev => prev.map(c => c.id === editingNoteCard.id ? editingNoteCard : c));
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center gap-4">
                                        <Brain size={64} className="opacity-20" />
                                        <div>
                                            <p className="font-bold text-slate-600 mb-1">暂无深度笔记</p>
                                            <p className="text-sm opacity-60">AI 可以为您生成词源、搭配、辨析等高阶内容</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer / Actions */}
                        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-white">
                            <button
                                onClick={handleOpenLinkModal}
                                className="mr-auto px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg flex items-center gap-2"
                            >
                                <LinkIcon size={16} /> 关联笔记
                            </button>
                            <button
                                onClick={() => setEditingNoteCard(null)}
                                className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg"
                            >
                                关闭
                            </button>
                            <button
                                onClick={async () => {
                                    if (isGeneratingDeepNotes) return;
                                    if (!settings.apiKey) return alert("请先配置 API Key");

                                    setIsGeneratingDeepNotes(true);
                                    try {
                                        // Reuse exact same logic, but targeting editingNoteCard
                                        const markdown = await generateDeepNotes(editingNoteCard.front, editingNoteCard.context, settings);
                                        if (markdown) {
                                            const updated = { ...editingNoteCard, notes: markdown };
                                            await updateFlashcard(updated);
                                            setAllCards(prev => prev.map(c => c.id === editingNoteCard.id ? updated : c));
                                            setEditingNoteCard(updated); // Refresh modal

                                            // Sync to notebook
                                            const noteContent = `# ${editingNoteCard.front}\n\n> ${editingNoteCard.back}\n\n${markdown}`;
                                            await saveToNotes({
                                                id: `dn_${editingNoteCard.id}`,
                                                title: editingNoteCard.front,
                                                content: noteContent,
                                                folder: '深度笔记',
                                                updatedAt: Date.now()
                                            });
                                        }
                                    } catch (e) {
                                        console.error(e);
                                        alert("生成失败");
                                    } finally {
                                        setIsGeneratingDeepNotes(false);
                                    }
                                }}
                                disabled={isGeneratingDeepNotes}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-lg shadow-indigo-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isGeneratingDeepNotes ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                {editingNoteCard.notes ? '重新生成' : 'AI 深度生成'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
};

export default FlashcardView;
