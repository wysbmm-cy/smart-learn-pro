import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Layers, Plus, Trash2, RefreshCw, ChevronLeft, ChevronRight, RotateCw, CheckCircle, XCircle, Dices, Folder, FolderPlus, MoreVertical, LayoutGrid, Tag, Play, Star, AlertTriangle, AlertCircle, BarChart3, Undo2, Volume2, Trophy, Flame, Zap, Brain, Loader2, PanelRightClose, PanelRightOpen, Lightbulb, MessageSquare, Edit3, BookOpen, Sparkles, Link as LinkIcon, FileText, Search, X, Maximize2, Minimize2, MoreHorizontal, Settings, Download, Upload } from 'lucide-react';
import SharedMarkdown from '../components/SharedMarkdown';
import { useApp, fsrs, restoreFSRSCard, Rating } from '../context/AppContext';
import SplitPane from '../components/SplitPane';
import DifficultyPieChart from '../components/DifficultyPieChart';
import StudyTrendChart from '../components/StudyTrendChart';
import DrillCard from '../components/DrillCard';
import RemediationHub from '../components/RemediationHub';
import ConfirmDialog from '../components/ConfirmDialog';
import NotesEditorModal from '../components/flashcard/NotesEditorModal';
import { saveFolder, getFolders, deleteFolder, getRecentDrillLogs, getDiagnosis, saveDiagnosis } from '../services/db';
import { generateDrillCards, generateDiagnosis, generateRemediationDrills, generateDeepNotes } from '../services/ai';
import {
    UNDO_TIMEOUT_MS,
    getEffectiveWeaknessScore,
    getWeaknessColor,
    getWeaknessLabel,
    getMasteryColor,
    getMasteryLabel,
    getRetrievability,
    getRetrievabilityLabel,
    loadStudySession,
    saveStudySession,
    clearStudySession,
    sortByWeaknessDesc
} from '../utils/flashcardUtils';
import toast from 'react-hot-toast';

const FlashcardView = ({ params }) => {
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
    const [isMultiSelect, setIsMultiSelect] = useState(false); // Toggle multi-select mode
    const [selectedCardIds, setSelectedCardIds] = useState(new Set()); // Selected cards for batch operations
    const [showBatchMenu, setShowBatchMenu] = useState(false); // Batch folder move menu
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [showMoreActions, setShowMoreActions] = useState(false);
    const [isSwapped, setIsSwapped] = useState(false); // Toggle Q/A sides
    const [showStats, setShowStats] = useState(false); // Toggle statistics panel
    const [sortMode, setSortMode] = useState('mastery_asc'); // 'default' | 'mastery_asc' | 'mastery_desc'
    const [isExportingCards, setIsExportingCards] = useState(false);
    const [isImportingCards, setIsImportingCards] = useState(false);
    const importCardsInputRef = useRef(null);

    // ===== NEW: Dialog States =====
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    const [notesEditorOpen, setNotesEditorOpen] = useState(false);
    const [editingNotesCard, setEditingNotesCard] = useState(null);


    // Manage State
    const [newFront, setNewFront] = useState("");
    const [newBack, setNewBack] = useState("");
    const [isAddingCard, setIsAddingCard] = useState(false);
    const [showMobileAddComposer, setShowMobileAddComposer] = useState(false);

    // Study Setup State
    const [studySelection, setStudySelection] = useState(['all']); // Array of folder IDs to study
    const [drawCount, setDrawCount] = useState(10);

    // Study Active State
    const [studyQueue, setStudyQueue] = useState([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [showGradePanel, setShowGradePanel] = useState(false);
    const [isAdvancingCard, setIsAdvancingCard] = useState(false);
    const [disableFlipAnimation, setDisableFlipAnimation] = useState(false);
    const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });

    // Lottery State
    const [showStudentPicker, setShowStudentPicker] = useState(false);
    const [studentCount, setStudentCount] = useState(30);
    const [pickedStudent, setPickedStudent] = useState(null);
    const [isRolling, setIsRolling] = useState(false);

    // New: Advanced Optimization State
    const [showSessionSummary, setShowSessionSummary] = useState(false);
    const [isSessionCompleted, setIsSessionCompleted] = useState(false);
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

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
        loadStudySession(); // Restore study session if exists
    }, []);

    // Handle deep linking from Agent Action Card
    useEffect(() => {
        if (params?.folderId) {
            setSelectedFolderId(params.folderId);
        }
    }, [params]);

    const loadStreak = () => {
        const streakData = localStorage.getItem('smartlearn_streak');
        if (streakData) {
            setStudyStreak(JSON.parse(streakData));
        }
    };

    // Study Session Persistence
    const loadStudySession = () => {
        // Skip restore if there's already a startup command (e.g. from Dashboard "开始复习")
        if (flashcardStartupState?.mode) return;

        const savedSession = localStorage.getItem('flashcard_study_session');
        if (savedSession) {
            try {
                const { queueIds, index, stats, timestamp } = JSON.parse(savedSession);
                // Only restore if session is less than 2 hours old
                if (Date.now() - timestamp < 2 * 60 * 60 * 1000) {
                    // We'll restore after allCards is loaded
                    setFlashcardStartupState(prev => {
                        // Don't override an explicit startup command
                        if (prev?.mode) return prev;
                        return { pendingRestore: { queueIds, index, stats } };
                    });
                } else {
                    localStorage.removeItem('flashcard_study_session');
                }
            } catch (e) {
                console.error("Failed to restore study session:", e);
            }
        }
    };

    const saveStudySession = () => {
        if (mode === 'study' && studyQueue.length > 0 && !showSessionSummary && !isSessionCompleted) {
            const sessionData = {
                queueIds: studyQueue.map(c => c.id),
                index: currentCardIndex,
                stats: sessionStats,
                timestamp: Date.now()
            };
            localStorage.setItem('flashcard_study_session', JSON.stringify(sessionData));
        }
    };

    const clearStudySession = () => {
        localStorage.removeItem('flashcard_study_session');
    };

    // Save session when navigating away
    useEffect(() => {
        const handleBeforeUnload = () => saveStudySession();
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            saveStudySession(); // Save when component unmounts
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [mode, studyQueue, currentCardIndex, sessionStats, showSessionSummary, isSessionCompleted]);

    // Restore study queue after allCards is loaded
    useEffect(() => {
        if (allCards.length > 0 && flashcardStartupState?.pendingRestore) {
            const { queueIds, index, stats } = flashcardStartupState.pendingRestore;
            const restoredQueue = queueIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);
            if (restoredQueue.length > 0) {
                setStudyQueue(restoredQueue);
                setCurrentCardIndex(Math.min(index, restoredQueue.length - 1));
                setSessionStats(stats || { reviewed: 0, correct: 0 });
                setMode('study');
                toast.success(`已恢复上次复习 (${restoredQueue.length} 张卡片)`, { id: 'restore_session' });
            }
            setFlashcardStartupState({ pendingRestore: null });
        }
    }, [allCards, flashcardStartupState]);

    const saveStreak = (newStreak) => {
        localStorage.setItem('smartlearn_streak', JSON.stringify(newStreak));
        setStudyStreak(newStreak);
    };

    // Deep Learning Panel toggle
    const [showDetailPanel, setShowDetailPanel] = useState(false);

    // Note: getMasteryColor, getMasteryLabel, getWeaknessColor, getWeaknessLabel
    // are now imported from '../utils/flashcardUtils'

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
        if (!lastAction || Date.now() - lastAction.timestamp > UNDO_TIMEOUT_MS) return;

        // Clear timeout
        if (undoTimeout) {
            clearTimeout(undoTimeout);
            setUndoTimeout(null);
        }

        // Restore previous state
        setCurrentCardIndex(lastAction.prevIndex);
        setIsFlipped(false);
        setShowGradePanel(false);
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
                flushSync(() => {
                    setDisableFlipAnimation(true);
                    setIsFlipped(false);
                    setShowGradePanel(false);
                });
                requestAnimationFrame(() => {
                    setCurrentCardIndex(prev => prev + 1);
                    requestAnimationFrame(() => setDisableFlipAnimation(false));
                });
            } else {
                // Session complete
                loadData();
                updateStreak();
                setShowSessionSummary(true);
            }
        }
    };

    // Handle Startup Signal (e.g. from Dashboard "开始复习")
    useEffect(() => {
        if (flashcardStartupState && allCards.length > 0) {
            const { mode, folder, queueIds } = flashcardStartupState;
            if (mode === 'study' && folder) {
                // Explicit startup from Dashboard or ReviewCenter: clear any saved session and start fresh
                localStorage.removeItem('flashcard_study_session');
                setSelectedFolderId(folder);
                startSession(folder, true, queueIds); // useAllCards=true for FSRS review, pass explicit queueIds if any
                setFlashcardStartupState(null); // Consume
                return; // Don't process pendingRestore
            }
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
        setConfirmDialog({
            isOpen: true,
            title: '删除文件夹',
            message: '确定删除此文件夹？里面的卡片将保留在"所有卡片"中。',
            onConfirm: async () => {
                await deleteFolder(id);
                if (selectedFolderId === id) setSelectedFolderId('all');
                loadData();
                setConfirmDialog({ isOpen: false });
            }
        });
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
            // Weakest First: Use weakness score (higher = weaker, appears first)
            return [...result].sort((a, b) => {
                const scoreA = (a.weaknessScore || 0) + (a.notes ? 3 : 0) + (a.isFlagged ? 2 : 0);
                const scoreB = (b.weaknessScore || 0) + (b.notes ? 3 : 0) + (b.isFlagged ? 2 : 0);
                return scoreB - scoreA; // High weakness first (least proficient)
            });
        } else if (sortMode === 'mastery_desc') {
            // Strongest First: Low weakness score first
            return [...result].sort((a, b) => {
                const scoreA = (a.weaknessScore || 0) + (a.notes ? 3 : 0) + (a.isFlagged ? 2 : 0);
                const scoreB = (b.weaknessScore || 0) + (b.notes ? 3 : 0) + (b.isFlagged ? 2 : 0);
                return scoreA - scoreB; // Low weakness first (most proficient)
            });
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
        setShowMobileAddComposer(false);
        loadData();
    };

    const handleDeleteCard = async (id) => {
        setConfirmDialog({
            isOpen: true,
            title: '删除卡片',
            message: '确定删除此卡片？此操作不可撤销。',
            onConfirm: async () => {
                await removeFlashcard(id);
                loadData();
                setConfirmDialog({ isOpen: false });
            }
        });
    };

    const normalizeCardField = (value) => String(value || '').replace(/\s+/g, ' ').trim();

    const handleExportFlashcards = async () => {
        setIsExportingCards(true);
        try {
            const [cards, folderList] = await Promise.all([
                loadUserFlashcards(),
                getFolders()
            ]);
            const folderNameById = new Map(folderList.map((f) => [f.id, f.name]));
            const payload = {
                format: 'smartlearn_flashcards',
                version: 1,
                exportedAt: new Date().toISOString(),
                flashcards: cards.map((c) => ({
                    ...c,
                    folderName: c.folderId ? folderNameById.get(c.folderId) || '' : ''
                })),
                folders: folderList.map((f) => ({ id: f.id, name: f.name, type: f.type || 'user' }))
            };
            const content = JSON.stringify(payload, null, 2);
            const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            anchor.href = url;
            anchor.download = `smartlearn-flashcards-${stamp}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            toast.success(`已导出 ${cards.length} 张闪卡`);
        } catch (e) {
            toast.error(`导出失败: ${e.message}`);
        } finally {
            setIsExportingCards(false);
        }
    };

    const handleImportFlashcards = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setIsImportingCards(true);
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const importedCards = Array.isArray(parsed)
                ? parsed
                : (Array.isArray(parsed?.flashcards)
                    ? parsed.flashcards
                    : (Array.isArray(parsed?.cards) ? parsed.cards : []));
            const importedFolders = Array.isArray(parsed?.folders) ? parsed.folders : [];
            if (!importedCards.length) throw new Error('文件中没有可导入的闪卡数据');

            const [existingCards, folderList] = await Promise.all([
                loadUserFlashcards(),
                getFolders()
            ]);

            const localFolderNameById = new Map(folderList.map((f) => [f.id, normalizeCardField(f.name)]));
            const folderMap = new Map(
                folderList
                    .filter((f) => normalizeCardField(f.name))
                    .map((f) => [normalizeCardField(f.name).toLowerCase(), f.id])
            );
            const sourceFolderIdMap = new Map();

            const buildCardKey = (front, back, folderId) => {
                const folderName = normalizeCardField(localFolderNameById.get(folderId) || '').toLowerCase();
                return `${normalizeCardField(front).toLowerCase()}|||${normalizeCardField(back).toLowerCase()}|||${folderName}`;
            };

            const existingCardKeys = new Set(existingCards.map((c) => buildCardKey(c.front, c.back, c.folderId)));

            let createdFolders = 0;
            const ensureFolder = async (name, sourceId) => {
                const sourceKey = sourceId !== undefined && sourceId !== null ? String(sourceId) : '';
                if (sourceKey && sourceFolderIdMap.has(sourceKey)) return sourceFolderIdMap.get(sourceKey);
                const safe = normalizeCardField(name);
                if (!safe) {
                    if (sourceKey) sourceFolderIdMap.set(sourceKey, undefined);
                    return undefined;
                }
                const key = safe.toLowerCase();
                let folderId = folderMap.get(key);
                if (!folderId) {
                    folderId = crypto.randomUUID();
                    await saveFolder({ id: folderId, name: safe, type: 'user', createdAt: Date.now() });
                    folderMap.set(key, folderId);
                    localFolderNameById.set(folderId, safe);
                    createdFolders += 1;
                }
                if (sourceKey) sourceFolderIdMap.set(sourceKey, folderId);
                return folderId;
            };

            // Pre-create folder mapping from export metadata if available.
            for (const folder of importedFolders) {
                const sourceId = folder?.id !== undefined && folder?.id !== null ? String(folder.id) : '';
                const folderName = folder?.name || folder?.title || '';
                await ensureFolder(folderName, sourceId);
            }

            let added = 0;
            let skipped = 0;
            const batchKeys = new Set();
            for (const raw of importedCards) {
                const front = normalizeCardField(raw?.front ?? raw?.word ?? raw?.term ?? raw?.question);
                let back = normalizeCardField(raw?.back ?? raw?.meaning ?? raw?.definition ?? raw?.translation ?? raw?.answer);
                if (!front) {
                    skipped += 1;
                    continue;
                }
                if (!back) back = '（待补充释义）';

                const rawFolderId = raw?.folderId !== undefined && raw?.folderId !== null ? String(raw.folderId) : '';
                const folderNameFromId = rawFolderId
                    ? (importedFolders.find((f) => String(f?.id ?? '') === rawFolderId)?.name || '')
                    : '';
                const folderName = raw?.folderName || raw?.folder || folderNameFromId;
                const folderId = await ensureFolder(folderName, rawFolderId);

                const dedupeKey = buildCardKey(front, back, folderId);
                if (existingCardKeys.has(dedupeKey) || batchKeys.has(dedupeKey)) {
                    skipped += 1;
                    continue;
                }

                const now = Date.now();
                const createdAt = Number(raw?.createdAt) || now;
                const nextReview = Number(raw?.nextReview) || now;
                const interval = Number(raw?.interval) || 1;
                const repetitions = Number(raw?.repetitions) || 0;
                const easeFactor = Number(raw?.easeFactor) || 2.5;
                const tags = Array.isArray(raw?.tags) ? raw.tags.filter(Boolean) : [];

                const newCard = {
                    id: crypto.randomUUID(),
                    front,
                    back,
                    folderId,
                    tags,
                    createdAt,
                    nextReview,
                    interval,
                    repetitions,
                    easeFactor,
                    notes: typeof raw?.notes === 'string' ? raw.notes : undefined,
                    isFlagged: Boolean(raw?.isFlagged),
                    mastered: Boolean(raw?.mastered),
                    weaknessScore: Number(raw?.weaknessScore) || 0
                };
                if (raw?.lastReview !== undefined && raw?.lastReview !== null) {
                    if (typeof raw.lastReview === 'string') newCard.lastReview = raw.lastReview;
                    else if (!Number.isNaN(Number(raw.lastReview))) newCard.lastReview = new Date(Number(raw.lastReview)).toISOString();
                }
                if (!Number.isNaN(Number(raw?.stability))) newCard.stability = Number(raw.stability);
                if (!Number.isNaN(Number(raw?.difficulty))) newCard.difficulty = Number(raw.difficulty);
                if (!Number.isNaN(Number(raw?.retrievability))) newCard.retrievability = Number(raw.retrievability);
                if (!Number.isNaN(Number(raw?.reviews))) newCard.reviews = Number(raw.reviews);
                if (!Number.isNaN(Number(raw?.correctStreak))) newCard.correctStreak = Number(raw.correctStreak);
                if (Array.isArray(raw?.drillCards)) newCard.drillCards = raw.drillCards;
                if (!Number.isNaN(Number(raw?.drillGeneratedAt))) newCard.drillGeneratedAt = Number(raw.drillGeneratedAt);

                await addFlashcard(newCard);
                existingCardKeys.add(dedupeKey);
                batchKeys.add(dedupeKey);
                added += 1;
            }

            await loadData();
            toast.success(`导入完成：新增 ${added}，跳过 ${skipped}，新建文件夹 ${createdFolders}`);
        } catch (e) {
            toast.error(`导入失败: ${e.message}`);
        } finally {
            setIsImportingCards(false);
        }
    };

    // --- Study Logic ---
    // Note: getEffectiveWeaknessScore is now imported from '../utils/flashcardUtils'


    const startSession = (overrideFolderId, useAllCards = false, explicitQueueIds = null) => {
        const targetFolder = overrideFolderId || selectedFolderId;

        if (explicitQueueIds && explicitQueueIds.length > 0) {
            const exactCards = explicitQueueIds.map(id => allCards.find(c => c.id === id)).filter(Boolean);
            if (exactCards.length === 0) {
                toast.error("没有找到符合条件的卡片！");
                return;
            }
            // Light shuffle even for explicit queue to avoid feeling repetitive
            const lightShuffle = exactCards.sort((a, b) => {
                const scoreDiff = getEffectiveWeaknessScore(b) - getEffectiveWeaknessScore(a);
                if (Math.abs(scoreDiff) <= 5) return Math.random() - 0.5;
                return scoreDiff;
            });
            setStudyQueue(lightShuffle);
        } else {
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

            // ===== Weighted Shuffle by Weakness Score =====
            // Higher weakness score = higher priority (appears earlier/more often)
            const sortedByWeakness = [...candidates].sort((a, b) => {
                const scoreA = getEffectiveWeaknessScore(a);
                const scoreB = getEffectiveWeaknessScore(b);
                // Primary: weakness score (high to low)
                if (scoreB !== scoreA) return scoreB - scoreA;
                // Secondary: due date (earlier first)
                return (a.nextReview || 0) - (b.nextReview || 0);
            });

            // Take top cards: all due cards for FSRS review (with optional limit), or drawCount for manual
            let selected;
            if (useAllCards) {
                const maxCards = settings?.maxReviewCards || 0;
                selected = maxCards > 0
                    ? sortedByWeakness.slice(0, maxCards)
                    : sortedByWeakness;
            } else {
                selected = sortedByWeakness.slice(0, drawCount);
            }

            // Light shuffle within the selected pool (preserves general order but adds variety)
            const lightShuffle = selected.sort((a, b) => {
                const scoreDiff = getEffectiveWeaknessScore(b) - getEffectiveWeaknessScore(a);
                // Only shuffle if scores are close (within 5 points)
                if (Math.abs(scoreDiff) <= 5) return Math.random() - 0.5;
                return scoreDiff;
            });

            setStudyQueue(lightShuffle);
        }
        setCurrentCardIndex(0);
        setIsFlipped(false);
        setShowGradePanel(false);
        setDisableFlipAnimation(false);
        setIsAdvancingCard(false);
        setSessionStats({ reviewed: 0, correct: 0 });
        setSessionStartTime(Date.now());
        setLastAction(null);
        setShowSessionSummary(false);
        setIsSessionCompleted(false);
        setIsDrillMode(false);
        setCurrentDrill(null);
        setMode('study');
    };

    // Enhanced Keyboard Shortcuts
    useEffect(() => {
        if (mode !== 'study') return;
        const handleKeyDown = (e) => {
            const targetTag = (e.target?.tagName || '').toUpperCase();
            const activeEl = document.activeElement;
            const activeTag = (activeEl?.tagName || '').toUpperCase();
            const isEditing =
                targetTag === 'INPUT' ||
                targetTag === 'TEXTAREA' ||
                targetTag === 'SELECT' ||
                activeEl?.isContentEditable;
            if (isEditing) return;

            const isSpaceKey = e.code === 'Space' || e.key === ' ' || e.key === 'Space' || e.key === 'Spacebar';

            // Universal shortcuts
            if (e.key === 'Escape') {
                clearStudySession();
                setMode('manage');
                return;
            }

            // Make Space consistently flip card:
            // 1) block browser default button activation
            // 2) ignore long-press repeat
            if (isSpaceKey) {
                e.preventDefault();
                e.stopPropagation();
                if (e.repeat) return;

                if (activeTag === 'BUTTON' || activeTag === 'A') {
                    activeEl.blur?.();
                }
                if (isFlipped) {
                    setIsFlipped(false);
                    setShowGradePanel(false);
                } else {
                    setIsFlipped(true);
                    setShowGradePanel(false);
                }
                return;
            }

            if (e.key === 'Enter' && isFlipped) {
                e.preventDefault();
                setShowGradePanel(prev => !prev);
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
                if (e.key === '1') { setShowGradePanel(true); handleNextCard(1); }
                if (e.key === '2') { setShowGradePanel(true); handleNextCard(2); }
                if (e.key === '3') { setShowGradePanel(true); handleNextCard(3); }
                if (e.key === '4') { setShowGradePanel(true); handleNextCard(4); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mode, isFlipped, showGradePanel, currentCardIndex, studyQueue, lastAction]);

    // FSRS: Preview the scheduled interval for each rating
    const getPreviewInterval = (card, rating) => {
        if (!card) return '—';
        try {
            const fsrsCard = restoreFSRSCard(card);
            const result = fsrs.next(fsrsCard, new Date(), rating);
            const days = result.card.scheduled_days;
            if (days < 1) {
                // Learning step: show minutes
                const mins = Math.round((result.card.due.getTime() - Date.now()) / 60000);
                if (mins <= 0) return '重来';
                return `${mins}m`;
            }
            return `${days}d`;
        } catch {
            return '—';
        }
    };

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

    // ============ Batch Operations ============
    const toggleCardSelection = (cardId) => {
        if (!cardId) return; // safety check
        setSelectedCardIds(prev => {
            const next = new Set(prev);
            if (next.has(cardId)) next.delete(cardId);
            else next.add(cardId);
            return next;
        });
    };

    const handleBatchDelete = async () => {
        if (selectedCardIds.size === 0) return;

        if (!window.confirm(`确定要永久删除这 ${selectedCardIds.size} 张卡片吗？操作不可恢复。`)) {
            return;
        }

        toast.loading(`正在删除 ${selectedCardIds.size} 张卡片...`, { id: 'batch_delete' });
        try {
            let deletedCount = 0;
            for (const cardId of selectedCardIds) {
                await removeFlashcard(cardId);
                deletedCount++;
            }

            const updated = await loadUserFlashcards(); // Refresh from DB
            setAllCards(updated);
            setSelectedCardIds(new Set());
            setIsMultiSelect(false);
            toast.success(`成功删除 ${deletedCount} 张卡片`, { id: 'batch_delete' });
        } catch (e) {
            console.error('Batch delete failed:', e);
            toast.error('批量删除失败', { id: 'batch_delete' });
        }
    };

    const handleSelectAll = () => {
        if (selectedCardIds.size === displayCards.length) {
            setSelectedCardIds(new Set());
        } else {
            setSelectedCardIds(new Set(displayCards.map(c => c.id)));
        }
    };

    const handleBatchMoveFolder = async (targetFolderId) => {
        if (selectedCardIds.size === 0) return;
        toast.loading(`正在移动 ${selectedCardIds.size} 张卡片...`, { id: 'batch_move' });
        try {
            for (const cardId of selectedCardIds) {
                const card = allCards.find(c => c.id === cardId);
                if (card) {
                    await updateFlashcard({ ...card, folderId: targetFolderId });
                }
            }
            // Update local state
            setAllCards(prev => prev.map(c =>
                selectedCardIds.has(c.id) ? { ...c, folderId: targetFolderId } : c
            ));
            setSelectedCardIds(new Set());
            setShowBatchMenu(false);
            toast.success('移动完成！', { id: 'batch_move' });
        } catch (e) {
            console.error(e);
            toast.error('移动失败', { id: 'batch_move' });
        }
    };

    const [isBatchGenerating, setIsBatchGenerating] = useState(false);
    const handleBatchGenerateDeepNotes = async () => {
        if (selectedCardIds.size === 0) return;
        if (!settings.apiKey) {
            alert("请先在设置中配置 API Key");
            return;
        }
        setIsBatchGenerating(true);
        const cards = allCards.filter(c => selectedCardIds.has(c.id));
        let success = 0;

        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            toast.loading(`正在生成 (${i + 1}/${cards.length}): ${card.front}`, { id: 'batch_dn' });
            try {
                const markdown = await generateDeepNotes(card.front, card.context, settings);
                if (markdown) {
                    const updatedCard = { ...card, notes: markdown };
                    await updateFlashcard(updatedCard);
                    // Save to notes
                    const noteContent = `# ${card.front}\n\n> ${card.back}\n\n${markdown}`;
                    await saveToNotes({
                        id: `dn_${card.id}`,
                        title: card.front,
                        content: noteContent,
                        folder: '深度笔记',
                        updatedAt: Date.now()
                    });
                    success++;
                }
            } catch (e) {
                console.error(`Failed for ${card.front}:`, e);
            }
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 500));
        }

        setIsBatchGenerating(false);
        setSelectedCardIds(new Set());
        setIsMultiSelect(false);
        toast.success(`完成！成功生成 ${success}/${cards.length} 个深度笔记`, { id: 'batch_dn' });
        // Reload cards to get updated notes
        const updated = await loadUserFlashcards();
        setAllCards(updated);
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
        if (isAdvancingCard) return;
        const currentCard = studyQueue[currentCardIndex];
        if (!currentCard) return;
        setIsAdvancingCard(true);
        try {

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
            const timeout = setTimeout(() => setLastAction(null), UNDO_TIMEOUT_MS);
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
                flushSync(() => {
                    setDisableFlipAnimation(true);
                    setIsFlipped(false);
                    setShowGradePanel(false);
                });
                requestAnimationFrame(() => {
                    setCurrentCardIndex(prev => prev + 1);
                    requestAnimationFrame(() => {
                        setDisableFlipAnimation(false);
                        setIsAdvancingCard(false);
                    });
                });
                return;
            }

            // Session complete!
            await loadData();
            updateStreak(); // Update daily streak
            clearStudySession(); // Clear saved session
            setIsSessionCompleted(true);
            setShowSessionSummary(true); // Show summary modal instead of alert
            setIsAdvancingCard(false);
        } catch (e) {
            console.error('Next card transition failed:', e);
            setDisableFlipAnimation(false);
            setIsAdvancingCard(false);
            toast.error('评分失败，请重试');
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
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-md animate-fade-in p-4">
                <div className="glass-modal rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[70vh] animate-scale-in overflow-hidden border border-phy-border">
                    <div className={`border-b border-phy-border flex justify-between items-center gap-2 bg-phy-glassHeavy backdrop-blur ${isMobile ? 'px-3 py-2' : 'p-4'}`}>
                        <h3 className="font-bold text-phy-text flex items-center gap-2">
                            <LinkIcon size={18} className="text-phy-accent" /> 关联已有笔记
                        </h3>
                        <button onClick={() => setIsLinkingNote(false)} className="p-1 hover:bg-phy-glassHover rounded-full text-phy-muted transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-3 bg-phy-glass border-b border-phy-border">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-3 text-phy-muted" />
                            <input
                                type="text"
                                placeholder="搜索笔记标题或内容..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-phy-bg border border-phy-border rounded-lg text-sm text-phy-text focus:outline-none focus:border-phy-accent transition-colors"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 bg-phy-bg/50 backdrop-blur-sm">
                        {filtered.length === 0 ? (
                            <div className="text-center py-10 text-phy-muted">
                                <FileText size={40} className="mx-auto mb-2 opacity-20" />
                                <p>未找到匹配笔记</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filtered.map(note => (
                                    <button
                                        key={note.id}
                                        onClick={() => handleLinkNote(note)}
                                        className="w-full text-left p-4 glass-panel border border-phy-border hover:border-phy-accent/50 hover:bg-phy-glassHover rounded-xl transition-all group group-hover:shadow-md"
                                    >
                                        <div className="font-bold text-phy-text group-hover:text-phy-accent mb-1 transition-colors">{note.title}</div>
                                        <div className="text-xs text-phy-muted line-clamp-2">{note.content.substring(0, 80)}...</div>
                                        <div className="mt-2 flex gap-2 text-[10px] text-phy-muted opacity-80">
                                            <span className="bg-phy-glass px-1.5 py-0.5 rounded border border-phy-border">{note.folder || '默认'}</span>
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

    const sidebarFolderBtnClass = (active) =>
        active
            ? `w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-left font-medium transition-colors glass-panel text-phy-accent shadow-sm`
            : `w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-left font-medium transition-colors text-phy-muted hover:bg-phy-glassHover hover:text-phy-text`;

    const Sidebar = (
        <div className="h-full flex flex-col bg-phy-glass text-phy-text">
            <div className="p-2 md:p-4 border-b border-phy-border flex justify-between items-center">
                <h2 className="text-base md:text-xl font-bold text-phy-text flex items-center gap-2">
                    <Layers size={isMobile ? 18 : 24} className="text-phy-accent" />
                    卡片库
                </h2>
                <button
                    onClick={() => {
                        setIsMultiSelect(!isMultiSelect);
                        if (!isMultiSelect) setStudySelection([]);
                    }}
                    className={
                        isMultiSelect
                            ? 'text-xs px-2 py-1 rounded border bg-phy-accentGlass text-phy-accent border-phy-borderHover font-bold'
                            : 'text-xs px-2 py-1 rounded border text-phy-muted border-phy-border'
                    }
                >
                    {isMultiSelect ? '完成选择' : '多选'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {/* System Folders */}
                {!isMultiSelect && (
                    <>
                        <button
                            onClick={() => setSelectedFolderId('all')}
                            className={sidebarFolderBtnClass(selectedFolderId === 'all')}
                        >
                            <LayoutGrid size={18} />
                            所有卡片
                            <span className="ml-auto text-xs bg-phy-glassHeavy px-1.5 py-0.5 rounded text-phy-muted">{allCards.length}</span>
                        </button>

                        <button
                            onClick={() => setSelectedFolderId('today')}
                            className={sidebarFolderBtnClass(selectedFolderId === 'today')}
                        >
                            <RefreshCw size={18} />
                            今日需复习
                        </button>

                        <button
                            onClick={() => setSelectedFolderId('flagged')}
                            className={sidebarFolderBtnClass(selectedFolderId === 'flagged')}
                        >
                            <Star size={18} className={selectedFolderId === 'flagged' ? "fill-phy-accent" : ""} />
                            重点标记 (Flagged)
                        </button>
                    </>
                )}

                <div className="pt-4 pb-2 px-3 flex items-center justify-between text-xs font-bold text-phy-muted uppercase tracking-wider">
                    <span>{isMultiSelect ? 'Select Folders to Review' : '我的文件夹'}</span>
                    {!isMultiSelect && <button onClick={() => setIsAddingFolder(true)} className="hover:text-phy-accent"><Plus size={14} /></button>}
                </div>

                {isAddingFolder && (
                    <div className="px-2 mb-2 animate-fade-in">
                        <input
                            autoFocus
                            className="w-full bg-phy-bg border border-phy-border rounded-lg px-2 py-1.5 text-sm outline-none text-phy-text focus:border-phy-accent"
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
                    const folderItemClass = isSelected
                        ? `w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-left font-medium transition-colors group glass-panel text-phy-accent shadow-sm`
                        : `w-full flex items-center gap-2 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-left font-medium transition-colors group text-phy-muted hover:bg-phy-glassHover hover:text-phy-text`;
                    const checkClass = isSelected
                        ? 'w-4 h-4 rounded border flex items-center justify-center bg-phy-accent border-phy-accent'
                        : 'w-4 h-4 rounded border flex items-center justify-center border-phy-border';
                    return (
                        <button
                            key={folder.id}
                            onClick={() => isMultiSelect ? toggleFolderSelection(folder.id) : setSelectedFolderId(folder.id)}
                            className={folderItemClass}
                        >
                            {isMultiSelect ? (
                                <div className={checkClass}>
                                    {isSelected && <CheckCircle size={10} className="text-white" />}
                                </div>
                            ) : (
                                <Folder size={isMobile ? 16 : 18} className={isSelected ? 'fill-phy-accentGlass' : ''} />
                            )}
                            <span className="truncate flex-1">{folder.name}</span>
                            {!isMultiSelect && (
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => handleDeleteFolder(e, folder.id)}>
                                    <Trash2 size={14} className="text-phy-muted hover:text-red-500" />
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>

            <div className="p-2 md:p-4 border-t border-phy-border bg-phy-glassHeavy grid grid-cols-2 lg:flex lg:flex-col gap-2">
                {/* A.I.R. Smart Review Button */}
                <button
                    onClick={handleAIRClick}
                    disabled={airStatus === 'preparing'}
                    className={
                        airStatus === 'preparing'
                            ? 'w-full flex items-center justify-center gap-2 py-1.5 md:py-2.5 rounded-lg text-xs md:text-sm font-bold shadow-md transition-all bg-phy-glass text-phy-muted cursor-wait'
                            : 'w-full flex items-center justify-center gap-2 py-1.5 md:py-2.5 rounded-lg text-xs md:text-sm font-bold shadow-md transition-all bg-phy-accent text-white hover:opacity-90 border border-transparent'
                    }
                >
                    {airStatus === 'preparing' ? (
                        <><Loader2 size={14} className="animate-spin" /> {isMobile ? '' : '准备中...'}</>
                    ) : airStatus === 'ready' ? (
                        <><Brain size={14} /> {isMobile ? '开始' : '点击开始复习'}</>
                    ) : (
                        <><Brain size={14} /> {isMobile ? '智能' : '智能复习 (A.I.R.)'}</>
                    )}
                </button>
                <button
                    onClick={() => setShowStudentPicker(true)}
                    className="w-full flex items-center justify-center gap-2 py-1.5 bg-transparent rounded-lg border border-phy-border text-phy-muted text-xs md:text-sm font-bold shadow-sm hover:text-phy-accent hover:border-phy-accent transition-colors hover:bg-phy-glassHover"
                >
                    <Dices size={14} />
                    {isMobile ? '随机' : '随机点名'}
                </button>
            </div>
        </div>
    );

    return (
        <div className={`${isMobile ? 'h-[calc(100dvh-132px)] rounded-2xl' : 'h-full md:h-[calc(100vh-100px)] rounded-[2rem]'} animate-fade-in glass-panel shadow-sm overflow-hidden text-phy-text bg-phy-bg/50`}>
            {mode === 'manage' ? (
                <SplitPane
                    left={Sidebar}
                    mobileCollapsible={isMobile}
                    mobileCollapsedDefault={true}
                    mobileToggleLabel="卡片筛选"
                    mobileLeftMaxHeight="34vh"
                    right={
                        <div className={`h-full min-h-0 flex flex-col bg-transparent ${isMobile ? 'overflow-y-auto' : ''}`}>
                            <input
                                ref={importCardsInputRef}
                                type="file"
                                accept=".json,application/json"
                                onChange={handleImportFlashcards}
                                className="hidden"
                            />
                            {/* Toolbar */}
                            <div className="p-2 md:p-4 border-b border-phy-border flex items-center justify-between gap-2 bg-phy-glassHeavy backdrop-blur sticky top-0 z-10">
                                <h3 className="min-w-0 flex-1 text-sm md:text-lg font-bold flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                    <span className="truncate">
                                        {isMultiSelect
                                            ? (`多选模式 (${selectedCardIds.size})`)
                                            : (selectedFolderId === 'all' ? '所有卡片' :
                                                selectedFolderId === 'today' ? '今日待复习' :
                                                    selectedFolderId === 'flagged' ? (`重点标记 (${displayCards.length})`) :
                                                        selectedFolderId === 'mastered' ? (`已掌握单词 (${displayCards.length})`) :
                                                            folders.find(f => f.id === selectedFolderId)?.name || '文件夹')
                                        }
                                    </span>
                                    <span className="bg-phy-glass text-phy-muted px-1.5 py-0.5 rounded-full text-[10px] md:text-xs border border-phy-border shrink-0">{displayCards.length}</span>
                                </h3>

                                <div className="flex items-center gap-1.5 md:gap-3">
                                    <button
                                        onClick={() => mode === 'manage' && startSession()}
                                        disabled={studyQueue.length === 0 && displayCards.length === 0}
                                        className={
                                            studyQueue.length === 0 && displayCards.length === 0
                                                ? 'flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-xs md:text-sm bg-phy-glassHeavy text-phy-muted border border-phy-border cursor-not-allowed'
                                                : 'flex items-center justify-center gap-1.5 px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-xs md:text-sm bg-phy-accent text-white hover:opacity-90 active:scale-95 shadow-sm'
                                        }
                                    >
                                        <Play size={14} />
                                        <span>{isMobile ? '复习' : '开始复习'}</span>
                                    </button>

                                    {isMobile ? (
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowMoreActions(!showMoreActions)}
                                                className="p-2 rounded-lg border border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover"
                                            >
                                                <MoreVertical size={18} />
                                            </button>
                                            {showMoreActions && (
                                                <div className="absolute top-full mt-2 right-0 bg-phy-glassHeavy border border-phy-border rounded-xl shadow-xl z-[100] min-w-[160px] py-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
                                                    <div className="px-3 py-2 border-b border-phy-border">
                                                        <div className="text-[11px] text-phy-muted font-bold mb-1">复习数量</div>
                                                        <div className="flex items-center gap-1.5">
                                                            {[5, 10, 20].map((n) => (
                                                                <button
                                                                    key={n}
                                                                    onClick={() => setDrawCount(n)}
                                                                    className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${drawCount === n
                                                                        ? 'bg-phy-accentGlass text-phy-accent border-phy-borderHover'
                                                                        : 'bg-transparent text-phy-muted border-phy-border hover:text-phy-text hover:bg-phy-glassHover'
                                                                        }`}
                                                                >
                                                                    {n}
                                                                </button>
                                                            ))}
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="500"
                                                                value={drawCount}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    if (val === '') {
                                                                        setDrawCount('');
                                                                    } else {
                                                                        const num = parseInt(val, 10);
                                                                        setDrawCount(isNaN(num) ? '' : num);
                                                                    }
                                                                }}
                                                                onBlur={() => {
                                                                    if (drawCount === '' || (typeof drawCount === 'number' && drawCount < 1)) setDrawCount(10);
                                                                }}
                                                                className="w-14 bg-phy-bg border border-phy-border rounded px-1.5 py-1 text-[11px] font-bold text-phy-text outline-none text-center"
                                                            />
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            setIsAddingCard(true);
                                                            setShowMobileAddComposer(true);
                                                            setShowMoreActions(false);
                                                        }}
                                                        className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors"
                                                    >
                                                        <Plus size={16} /> 添加卡片
                                                    </button>
                                                    <button
                                                        onClick={() => { handleExportFlashcards(); setShowMoreActions(false); }}
                                                        disabled={isExportingCards}
                                                        className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors disabled:opacity-50"
                                                    >
                                                        {isExportingCards ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                                        导出闪卡
                                                    </button>
                                                    <button
                                                        onClick={() => { importCardsInputRef.current?.click(); setShowMoreActions(false); }}
                                                        disabled={isImportingCards}
                                                        className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors disabled:opacity-50"
                                                    >
                                                        {isImportingCards ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                                        导入闪卡
                                                    </button>
                                                    <button onClick={() => { setShowStats(!showStats); setShowMoreActions(false); }} className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors">
                                                        <BarChart3 size={16} /> {showStats ? '隐藏统计' : '查看统计'}
                                                    </button>
                                                    <button onClick={() => {
                                                        if (sortMode === 'default') setSortMode('mastery_asc');
                                                        else if (sortMode === 'mastery_asc') setSortMode('mastery_desc');
                                                        else setSortMode('default');
                                                        setShowMoreActions(false);
                                                    }} className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors">
                                                        <Trophy size={16} /> {sortMode === 'default' ? '默认排序' : sortMode === 'mastery_asc' ? '掌握度 低->高' : '掌握度 高->低'}
                                                    </button>
                                                    <button onClick={() => { setIsMultiSelect(!isMultiSelect); setShowMoreActions(false); }} className="w-full px-4 py-2.5 text-left text-sm font-medium flex items-center gap-3 hover:bg-phy-accentGlass hover:text-phy-accent transition-colors">
                                                        <LayoutGrid size={16} /> {isMultiSelect ? '取消操作' : '批量操作'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="flex items-center gap-1.5 bg-phy-glass border border-phy-border rounded-lg px-2 py-1">
                                                <span className="text-[10px] font-bold text-phy-muted uppercase">抽查数</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="500"
                                                    value={drawCount}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === '') {
                                                            setDrawCount('');
                                                        } else {
                                                            const num = parseInt(val, 10);
                                                            setDrawCount(isNaN(num) ? '' : num);
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (drawCount === '' || (typeof drawCount === 'number' && drawCount < 1)) setDrawCount(10);
                                                    }}
                                                    className="w-10 md:w-12 bg-transparent text-xs md:text-sm font-bold text-phy-text outline-none text-center"
                                                />
                                            </div>
                                            <button onClick={() => setShowStats(!showStats)} className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text" title="统计面板"><BarChart3 size={18} /></button>
                                            <button onClick={() => {
                                                if (sortMode === 'default') setSortMode('mastery_asc');
                                                else if (sortMode === 'mastery_asc') setSortMode('mastery_desc');
                                                else setSortMode('default');
                                            }} className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text" title="排序"><Trophy size={18} /></button>
                                            <button
                                                onClick={handleExportFlashcards}
                                                disabled={isExportingCards}
                                                className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text disabled:opacity-50"
                                                title="导出闪卡"
                                            >
                                                {isExportingCards ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                            </button>
                                            <button
                                                onClick={() => importCardsInputRef.current?.click()}
                                                disabled={isImportingCards}
                                                className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text disabled:opacity-50"
                                                title="导入闪卡"
                                            >
                                                {isImportingCards ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                                            </button>
                                            <button onClick={() => setIsMultiSelect(!isMultiSelect)} className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text" title="多选"><LayoutGrid size={18} /></button>
                                            <button onClick={() => setIsAddingCard(true)} className="p-2 hover:bg-phy-accentGlass rounded-lg text-phy-accent" title="添加"><Plus size={18} /></button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Batch Action Toolbar */}
                            {isMultiSelect && selectedCardIds.size > 0 && (
                                <div className="px-4 py-3 bg-phy-accentGlass border-b border-phy-border flex items-center justify-between animate-in slide-in-from-top-2">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleSelectAll}
                                            className="text-xs font-bold text-phy-accent hover:underline"
                                        >
                                            {selectedCardIds.size === displayCards.length ? '取消全选' : '全选'}
                                        </button>
                                        <span className="text-xs text-phy-accent">已选中 {selectedCardIds.size} 张卡片</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Move Folder */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowBatchMenu(!showBatchMenu)}
                                                className="px-3 py-1.5 bg-transparent border border-phy-border rounded-lg text-xs font-bold text-phy-accent hover:bg-phy-glassHover flex items-center gap-1"
                                            >
                                                <Folder size={12} /> 移动文件夹
                                            </button>
                                            {showBatchMenu && (
                                                <div className="absolute top-full mt-1 right-0 bg-phy-glassHeavy border border-phy-border rounded-lg shadow-lg z-50 min-w-[150px] py-1 text-phy-text backdrop-blur-md">
                                                    <button
                                                        onClick={() => handleBatchMoveFolder(null)}
                                                        className="w-full px-3 py-2 text-left text-sm hover:bg-phy-glassHover"
                                                    >
                                                        📂 未分类
                                                    </button>
                                                    {folders.map(f => (
                                                        <button
                                                            key={f.id}
                                                            onClick={() => handleBatchMoveFolder(f.id)}
                                                            className="w-full px-3 py-2 text-left text-sm hover:bg-phy-glassHover"
                                                        >
                                                            📁 {f.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        {/* Batch Deep Notes */}
                                        <button
                                            onClick={handleBatchGenerateDeepNotes}
                                            disabled={isBatchGenerating}
                                            className="px-3 py-1.5 bg-phy-accent text-white rounded-lg text-xs font-bold hover:opacity-90 flex items-center gap-1 disabled:opacity-50 transition-opacity shadow-sm"
                                        >
                                            {isBatchGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                            批量生成深度笔记
                                        </button>
                                        {/* Batch Delete */}
                                        <button
                                            onClick={handleBatchDelete}
                                            className="px-3 py-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg text-xs font-bold hover:bg-red-500/20 flex items-center gap-1 transition-colors"
                                        >
                                            <Trash2 size={12} />
                                            批量删除
                                        </button>
                                        {/* Cancel */}
                                        <button
                                            onClick={() => { setIsMultiSelect(false); setSelectedCardIds(new Set()); }}
                                            className="px-2 py-1.5 text-phy-muted hover:text-phy-text text-xs transition-colors"
                                        >
                                            取消
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Statistics Panel */}
                            {showStats && (
                                <div className="p-6 bg-phy-bg/30 border-b border-phy-border">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <DifficultyPieChart flashcards={allCards} />
                                        <StudyTrendChart days={30} />
                                    </div>
                                </div>
                            )}

                            {/* Card Grid */}
                            <div className={`flex-1 ${isMobile ? 'h-auto' : 'overflow-y-auto'} ${isMobile ? 'p-2' : 'p-6'} bg-phy-bg/30`}>
                                {/* Add Input */}
                                {(!isMobile || isAddingCard || showMobileAddComposer) && (
                                    <div className={`${isMobile ? 'mb-3 p-3' : 'mb-6 p-4'} bg-phy-glass border border-phy-border shadow-sm rounded-xl transition-all focus-within:ring-2 ring-phy-accent border-phy-accent`}>
                                        {isAddingCard ? (
                                            <div className="flex flex-col gap-3">
                                                <div className={`flex ${isMobile ? 'flex-col gap-2' : 'gap-3'}`}>
                                                    <input value={newFront} onChange={e => setNewFront(e.target.value)} placeholder="正面内容 (Front)" className="flex-1 p-2 bg-phy-bg rounded border-none outline-none font-medium text-phy-text placeholder:text-phy-muted" autoFocus />
                                                    <input value={newBack} onChange={e => setNewBack(e.target.value)} placeholder="背面内容 (Back)" className="flex-1 p-2 bg-phy-bg rounded border-none outline-none text-phy-text placeholder:text-phy-muted" />
                                                </div>
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setIsAddingCard(false);
                                                            setShowMobileAddComposer(false);
                                                        }}
                                                        className="px-3 py-1.5 text-xs font-bold text-phy-muted hover:bg-phy-glassHover hover:text-phy-text rounded transition-colors"
                                                    >
                                                        取消
                                                    </button>
                                                    <button onClick={handleAddCard} className="px-4 py-1.5 text-xs font-bold bg-phy-accent text-white rounded hover:opacity-90 shadow-sm transition-opacity">保存</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button onClick={() => setIsAddingCard(true)} className="w-full py-2 text-phy-muted text-sm font-bold border-2 border-dashed border-phy-border rounded-lg hover:border-phy-accent hover:text-phy-accent flex items-center justify-center gap-2 transition-colors">
                                                <Plus size={16} /> 添加卡片到 '{selectedFolderId === 'all' ? '未分类' : (folders.find(f => f.id === selectedFolderId)?.name || '当前')}'
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${isMobile ? 'gap-2' : 'gap-4'}`}>
                                    {displayCards.map(card => {
                                        const isDue = !card.nextReview || card.nextReview <= Date.now();
                                        const isSelected = selectedCardIds.has(card.id);
                                        const weaknessInfo = getWeaknessLabel(card);
                                        return (
                                            <div
                                                key={card.id}
                                                onClick={() => isMultiSelect && toggleCardSelection(card.id)}
                                                className={`group glass-panel rounded-xl ${isMobile ? 'p-2.5' : 'p-5'} shadow-sm border transition-all relative ${isSelected
                                                    ? 'border-phy-accent bg-phy-accentGlass ring-2 ring-phy-accent shadow-md'
                                                    : `border-phy-border hover:border-phy-borderHover hover:shadow-md`
                                                    } ${isMultiSelect ? 'cursor-pointer' : ''}`}
                                            >
                                                {/* Selection Checkbox */}
                                                {isMultiSelect && (
                                                    <div className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isSelected
                                                        ? 'bg-phy-accent border-phy-accent text-white'
                                                        : 'bg-transparent border-phy-border'
                                                        }`}>
                                                        {isSelected && <CheckCircle size={12} className="stroke-[3]" />}
                                                    </div>
                                                )}
                                                {/* Weakness Indicator */}
                                                {!isMultiSelect && (
                                                    <div className={`absolute top-3 right-3 text-xs font-bold opacity-60 hover:opacity-100 transition-opacity`} title={`弱点分: ${card.weaknessScore || 0}`}>
                                                        {weaknessInfo.icon}
                                                    </div>
                                                )}
                                                <div className={`${isMobile ? 'text-sm line-clamp-2' : ''} font-bold text-phy-text mb-2 pr-6 whitespace-pre-wrap break-words`} title={card.front}>{card.front}</div>
                                                <div className={`${isMobile ? 'text-xs line-clamp-2 mb-3' : 'text-sm line-clamp-3 mb-4 h-12'} text-phy-muted break-words`}>{card.back}</div>
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${isDue ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
                                                            {isDue ? '到期' : '待复习'}
                                                        </div>
                                                        <div className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${weaknessInfo.color} bg-phy-glass bg-opacity-50 border-phy-border`}>
                                                            {weaknessInfo.label}
                                                        </div>
                                                    </div>
                                                    {!isMultiSelect && (
                                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setEditingNoteCard(card);
                                                                }}
                                                                className="text-phy-muted hover:text-phy-accent p-1"
                                                                title="深度笔记 (Deep Dive)"
                                                            >
                                                                <Sparkles size={14} />
                                                            </button>
                                                            <button onClick={() => handleDeleteCard(card.id)} className="text-phy-muted hover:text-red-500 p-1"><Trash2 size={14} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    }
                    leftClassName="bg-transparent border-r border-phy-border"
                    rightClassName="bg-transparent"
                />
            ) : (
                <div className={`h-full flex flex-col bg-transparent ${isMobile ? 'relative' : ''}`}>
                    {/* Toolbar */}
                    <div className={`border-b border-phy-border flex justify-between items-center gap-2 bg-phy-glassHeavy backdrop-blur ${isMobile ? 'px-3 py-2' : 'p-4'}`}>
                        <h3 className={`${isMobile ? 'text-base' : 'text-lg'} font-bold text-phy-text flex items-center gap-2 min-w-0`}>
                            <RotateCw size={isMobile ? 18 : 20} className="text-phy-accent shrink-0" />
                            {isMobile ? `复习 (${studyQueue.length - currentCardIndex})` : `复习模式 (${studyQueue.length - currentCardIndex} left)`}
                        </h3>
                        <button
                            onClick={() => setIsSwapped(!isSwapped)}
                            className={`${isMobile ? 'px-2 py-1 text-[11px]' : 'ml-4 px-3 py-1 text-xs'} font-bold border rounded-lg transition-all flex items-center gap-2 whitespace-nowrap ${isSwapped ? 'bg-phy-accentGlass text-phy-accent border-phy-borderHover' : 'bg-transparent text-phy-muted border-phy-border hover:border-phy-borderHover hover:text-phy-text'}`}
                        >
                            <RotateCw size={12} />
                            {isMobile ? (isSwapped ? 'A→Q' : 'Q→A') : (isSwapped ? 'Answer → Question' : 'Question → Answer')}
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
                                className={`ml-2 p-1.5 rounded-lg border transition-all ${currentCard.isFlagged ? 'bg-amber-500/10 border-amber-500/20 text-amber-500 shadow-sm' : 'bg-transparent border-phy-border text-phy-muted hover:text-amber-500 hover:border-amber-500/30'}`}
                                title="标记为重点 (S)"
                            >
                                <Star size={16} fill={currentCard.isFlagged ? "currentColor" : "none"} />
                            </button>
                        )}
                        <div className="flex items-center gap-2">
                            {!isMobile && <span className="text-xs font-bold text-phy-muted">SESSION SCORE:</span>}
                            <span className="text-sm font-bold text-phy-accent">{sessionStats.correct}/{sessionStats.reviewed}</span>
                            <button
                                onClick={() => {
                                    clearStudySession();
                                    setMode('manage');
                                }}
                                className={`${isMobile ? 'p-1.5' : 'ml-4 p-2'} hover:bg-phy-glassHover rounded-full text-phy-muted hover:text-phy-text transition-colors`}
                            >
                                <XCircle size={isMobile ? 18 : 20} />
                            </button>
                        </div>
                    </div>

                    {/* Flashcard Study Area */}
                    <div className={`flex-1 flex ${isMobile ? 'flex-col' : 'flex-row'} items-stretch overflow-hidden bg-phy-bg/30 relative ${isMobile ? 'pb-[calc(env(safe-area-inset-bottom,0px)+88px)]' : ''}`}>
                        {/* Progress Bar */}
                        <div className="absolute top-0 left-0 h-1 bg-phy-accent transition-all duration-300 z-10" style={{ width: `${(currentCardIndex / studyQueue.length) * 100}%` }}></div>

                        {/* Left: Main Card Area */}
                        <div className={`flex-1 min-h-0 flex flex-col items-center justify-center relative perspective-1000 ${isMobile ? 'p-2 pt-1 overflow-hidden' : 'p-8 overflow-y-auto'} ${isMobile && isFlipped && showGradePanel ? 'pb-20' : ''}`}>

                            {/* Toolbar inside Study Area */}
                            <div className={`absolute top-4 right-4 z-20 flex gap-2 ${isMobile ? 'opacity-40 hover:opacity-100 transition-opacity' : ''}`}>
                                <button
                                    onClick={() => setShowDetailPanel(!showDetailPanel)}
                                    className={`p-2 rounded-lg font-bold text-xs flex items-center gap-2 transition-all ${showDetailPanel ? 'bg-phy-accent text-white shadow-md' : 'bg-phy-glass text-phy-muted border border-phy-border hover:text-phy-accent hover:border-phy-borderHover shadow-sm'}`}
                                >
                                    {showDetailPanel ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                                    {(!isMobile || showDetailPanel) && (showDetailPanel ? '收起详情' : '深度笔记')}
                                </button>
                            </div>

                            {/* Drill Generating Indicator */}
                            {isGeneratingDrill && (
                                <div className="absolute top-4 left-4 flex items-center gap-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1.5 rounded-full text-xs font-bold animate-pulse z-20">
                                    <Zap size={14} />
                                    生成智能练习中...
                                </div>
                            )}

                            {/* Card Container */}
                            {!isDrillMode && (
                                <div
                                    key={currentCard?.id || currentCardIndex}
                                    className={`relative w-full shadow-xl border border-phy-border flex flex-col items-center justify-center text-center cursor-pointer transform-style-3d ${disableFlipAnimation ? 'transition-none' : 'transition-transform duration-500'} ${isMobile ? 'h-[36vh] min-h-[210px] max-h-[300px] rounded-2xl p-3' : 'aspect-video rounded-3xl p-8'} ${isFlipped ? 'rotate-y-180' : ''} ${getMasteryColor(currentCard)}`}
                                    style={{ maxWidth: isMobile ? '100%' : (showDetailPanel ? '800px' : '900px') }}
                                    onClick={async () => {
                                        if (isAdvancingCard) return;
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
                                            setIsFlipped(true);
                                            setShowGradePanel(true);
                                            return;
                                        }
                                        if (!showGradePanel) {
                                            setShowGradePanel(true);
                                            return;
                                        }
                                        setIsFlipped(false);
                                        setShowGradePanel(false);
                                    }}
                                >
                                    {/* Front Face */}
                                    <div className="backface-hidden w-full h-full flex flex-col items-center justify-center relative text-slate-950">
                                        {/* Mastery Badge */}
                                        <div className="absolute top-0 right-0 py-1 px-3 bg-white/85 backdrop-blur rounded-full text-[10px] font-bold text-slate-600 uppercase tracking-widest border border-slate-300/70">
                                            Level: {getMasteryLabel(currentCard)}
                                        </div>

                                        {currentCard?.isFlagged && (
                                            <div className="absolute top-0 left-0 text-amber-500 animate-pulse">
                                                <Star size={24} fill="currentColor" />
                                            </div>
                                        )}

                                        <div className="text-xs font-bold text-slate-600 uppercase mb-4 tracking-widest">Question</div>
                                        <div className={`font-black text-slate-950 break-words w-full leading-tight ${isMobile ? (questionText.length > 48 ? 'text-xl' : 'text-2xl') : (questionText.length > 50 ? 'text-xl' : 'text-4xl')}`}>
                                            {questionText}
                                        </div>
                                        <div className={`${isMobile ? 'mt-4' : 'mt-6'} flex items-center gap-4`}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); speakText(questionText); }}
                                                className={`${isMobile ? 'p-2.5' : 'p-3'} bg-phy-glassHover hover:bg-phy-accentGlass text-phy-accent rounded-full shadow-sm hover:shadow transition-all border border-transparent hover:border-phy-accent/30`}
                                                title="朗读发音"
                                            >
                                                <Volume2 size={isMobile ? 20 : 24} />
                                            </button>
                                        </div>
                                        <div className={`${isMobile ? 'mt-4' : 'mt-8'} text-xs text-slate-600 font-medium flex items-center gap-2`}>
                                            <RotateCw size={12} /> 点击翻转 / Space
                                        </div>
                                    </div>

                                    {/* Back Face */}
                                    <div className={`absolute inset-0 backface-hidden rotate-y-180 flex flex-col items-center justify-center ${isMobile ? 'rounded-2xl p-4' : 'rounded-3xl p-8'} bg-phy-accent text-white leading-relaxed overflow-hidden border border-phy-accentHover`}>
                                        <div className={`absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none ${isMobile ? 'rounded-2xl' : 'rounded-3xl'}`} />
                                        <div className="text-xs font-bold text-white/70 uppercase mb-4 tracking-widest z-10">Answer</div>
                                        <div className={`font-bold break-words w-full z-10 ${isMobile ? (answerText.length > 100 ? 'text-base' : 'text-xl') : (answerText.length > 100 ? 'text-lg' : 'text-3xl')}`}>
                                            {answerText}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); speakText(answerText); }}
                                            className={`${isMobile ? 'mt-4 p-2.5' : 'mt-6 p-3'} bg-phy-glassHover hover:bg-white/20 rounded-full text-white transition-all backdrop-blur z-10 border border-white/20`}
                                            title="朗读发音"
                                        >
                                            <Volume2 size={isMobile ? 20 : 24} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* FSRS R/S/D Stats */}
                            {isFlipped && showGradePanel && !isDrillMode && !isMobile && (
                                <div className="mt-8 grid grid-cols-3 gap-4 w-full max-w-[360px] opacity-60 hover:opacity-100 transition-opacity">
                                    <div className="text-center font-mono">
                                        <div className="text-[10px] font-bold text-phy-muted uppercase tracking-wider">记忆保留 R</div>
                                        <div className={`text-sm font-bold ${getRetrievabilityLabel(currentCard).color}`}>
                                            {getRetrievabilityLabel(currentCard).percent}
                                        </div>
                                    </div>
                                    <div className="text-center font-mono">
                                        <div className="text-[10px] font-bold text-phy-muted uppercase tracking-wider">稳定性 S</div>
                                        <div className="text-sm font-bold text-phy-text">
                                            {currentCard?.fsrs_stability ? `${currentCard.fsrs_stability.toFixed(1)}d` : '—'}
                                        </div>
                                    </div>
                                    <div className="text-center font-mono">
                                        <div className="text-[10px] font-bold text-phy-muted uppercase tracking-wider">难度 D</div>
                                        <div className="text-sm font-bold text-phy-text">
                                            {currentCard?.fsrs_difficulty ? currentCard.fsrs_difficulty.toFixed(1) : '—'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Drill Mode Replacement */}
                            {isDrillMode && currentDrill && (
                                <div className="w-full max-w-3xl">
                                    {/* Drill Progress Indicator */}
                                    <div className="mb-4 flex items-center justify-between px-4">
                                        <div className="text-sm font-bold text-emerald-500 flex items-center gap-2">
                                            <Zap size={16} />
                                            智能练习 {drillIndex + 1} / {drillQueue.length}
                                        </div>
                                        <div className="flex gap-1">
                                            {drillQueue.map((_, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`w-2 h-2 rounded-full transition-all ${idx < drillIndex ? 'bg-emerald-500' :
                                                        idx === drillIndex ? 'bg-phy-accent scale-125' :
                                                            'bg-phy-borderHover'
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
                        <div className={`border-l border-phy-border bg-phy-glassHeavy backdrop-blur transition-all duration-300 flex flex-col shadow-inner z-[60] ${isMobile ? (showDetailPanel ? 'fixed inset-0 w-full animate-in slide-in-from-bottom' : 'hidden') : (showDetailPanel ? 'w-[400px] translate-x-0' : 'w-0 translate-x-full opacity-0')}`}>
                            {isMobile && (
                                <div className="p-4 border-b border-phy-border/30 flex items-center justify-between sticky top-0 bg-phy-glassHeavy backdrop-blur z-10">
                                    <div className="flex items-center gap-2 font-black text-phy-text">
                                        <BookOpen size={20} className="text-phy-accent" />
                                        深度学习笔记
                                    </div>
                                    <button onClick={() => setShowDetailPanel(false)} className="p-2 bg-phy-glass rounded-full text-phy-muted">
                                        <X size={20} />
                                    </button>
                                </div>
                            )}
                            <div className={`${isMobile ? 'flex-1 overflow-y-auto p-4 pb-32' : 'p-6 h-full overflow-y-auto'} mobile-safe-bottom`}>
                                <h3 className="font-bold text-phy-text mb-6 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <BookOpen size={20} className="text-phy-accent" />
                                        深度学习笔记
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleOpenLinkModal}
                                            disabled={isGeneratingDeepNotes}
                                            className="text-xs px-3 py-1.5 bg-phy-glass hover:bg-phy-glassHover text-phy-text border border-phy-border hover:border-phy-borderHover rounded-full font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                                        >
                                            <LinkIcon size={12} />
                                            关联笔记
                                        </button>
                                        <button
                                            onClick={handleGenerateDeepNotes}
                                            disabled={isGeneratingDeepNotes}
                                            className="text-xs px-3 py-1.5 bg-phy-accentGlass hover:bg-phy-accent/20 text-phy-accent border border-phy-accent/20 rounded-full font-bold flex items-center gap-1 transition-all disabled:opacity-50"
                                        >
                                            {isGeneratingDeepNotes ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                            AI 生成
                                        </button>
                                    </div>
                                </h3>

                                <div className="space-y-6">
                                    {/* Consolidated Deep Note Area */}
                                    <div className="glass-panel rounded-xl border border-phy-border overflow-hidden min-h-[400px] flex flex-col">
                                        {currentCard?.notes ? (
                                            <>
                                                <div className="flex-1 overflow-y-auto">
                                                    <SharedMarkdown content={currentCard.notes} className="p-4 flex-1 overflow-y-auto" />
                                                </div>
                                                {/* Edit Button - Outside prose to avoid style conflicts */}
                                                <div className="border-t border-phy-border p-3 bg-phy-glass">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            // Create modal container
                                                            const modal = document.createElement('div');
                                                            modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:70%;max-width:800px;background:var(--phy-bg);border:1px solid var(--phy-border);border-radius:16px;z-index:9999;box-shadow:0 25px 50px rgba(0,0,0,0.3);display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(16px);';

                                                            // Header
                                                            const header = document.createElement('div');
                                                            header.style.cssText = 'padding:16px 20px;background:var(--phy-glassHeavy);color:var(--phy-text);border-bottom:1px solid var(--phy-border);font-weight:bold;font-size:16px;';
                                                            header.textContent = '✏️ 编辑深度笔记 (支持 Markdown)';

                                                            // Textarea
                                                            const textarea = document.createElement('textarea');
                                                            textarea.value = currentCard.notes;
                                                            textarea.style.cssText = 'flex:1;min-height:400px;padding:20px;font-size:14px;line-height:1.8;border:none;outline:none;resize:none;font-family:ui-monospace,monospace;color:var(--phy-text);background:var(--phy-bg);';

                                                            // Button container
                                                            const btnContainer = document.createElement('div');
                                                            btnContainer.style.cssText = 'padding:16px 20px;background:var(--phy-glass);display:flex;justify-content:flex-end;gap:12px;border-top:1px solid var(--phy-border);';

                                                            const cancelBtn = document.createElement('button');
                                                            cancelBtn.textContent = '取消';
                                                            cancelBtn.style.cssText = 'padding:10px 24px;background:var(--phy-glass);color:var(--phy-text);border:1px solid var(--phy-border);border-radius:8px;font-weight:600;cursor:pointer;';

                                                            const saveBtn = document.createElement('button');
                                                            saveBtn.textContent = '💾 保存';
                                                            saveBtn.style.cssText = 'padding:10px 24px;background:var(--phy-accent);color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;';

                                                            const overlay = document.createElement('div');
                                                            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:9998;backdrop-filter:blur(4px);';

                                                            const cleanup = () => {
                                                                document.body.removeChild(overlay);
                                                                document.body.removeChild(modal);
                                                            };

                                                            saveBtn.onclick = async () => {
                                                                const newVal = textarea.value;
                                                                if (newVal !== currentCard.notes) {
                                                                    const updated = { ...currentCard, notes: newVal };
                                                                    await updateFlashcard(updated);
                                                                    setAllCards(prev => prev.map(c => c.id === currentCard.id ? updated : c));
                                                                    setStudyQueue(prev => prev.map(c => c.id === currentCard.id ? updated : c));
                                                                    toast.success("笔记已更新");
                                                                }
                                                                cleanup();
                                                            };

                                                            cancelBtn.onclick = cleanup;
                                                            overlay.onclick = cleanup;

                                                            btnContainer.appendChild(cancelBtn);
                                                            btnContainer.appendChild(saveBtn);
                                                            modal.appendChild(header);
                                                            modal.appendChild(textarea);
                                                            modal.appendChild(btnContainer);

                                                            document.body.appendChild(overlay);
                                                            document.body.appendChild(modal);
                                                            textarea.focus();
                                                        }}
                                                        className="text-xs text-phy-accent hover:text-phy-text hover:underline font-medium flex items-center gap-1"
                                                    >
                                                        <Edit3 size={12} />
                                                        手动编辑笔记
                                                    </button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="h-full flex flex-col items-center justify-center text-phy-muted p-8 text-center">
                                                <Brain size={48} className="mb-4 opacity-20" />
                                                <p className="text-sm text-phy-text">点击上方 "AI 生成" 获取深度学习笔记</p>
                                                <p className="text-xs mt-2 opacity-60">包含词源、搭配、辨析等高阶内容</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Control Buttons (4-Level FSRS) moved inside container */}
                    {isFlipped && showGradePanel && (
                        <div className={`${isMobile ? 'fixed left-2 right-2 bottom-[calc(env(safe-area-inset-bottom,0px)+72px)] z-40 grid grid-cols-4 gap-2 p-2 rounded-2xl border border-phy-border bg-phy-glassHeavy/95 backdrop-blur' : 'mt-8 flex gap-3 w-full max-w-2xl animate-fade-in-up px-4'}`}>
                            <button
                                onClick={() => handleNextCard(1)}
                                disabled={isAdvancingCard}
                                className={`flex-1 flex flex-col items-center gap-1 glass-panel hover:bg-rose-500/10 text-rose-500 border border-phy-border hover:border-rose-500/30 ${isMobile ? 'py-2 rounded-lg min-h-[52px]' : 'py-3 rounded-xl'} font-bold transition-all shadow-sm active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                                <span className={`font-black uppercase tracking-wider text-rose-400/70 group-hover:text-rose-400 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>Again</span>
                                <span className={isMobile ? 'text-sm' : 'text-lg'}>忘记 (1)</span>
                                {!isMobile && <span className="text-[10px] font-mono text-phy-muted">{getPreviewInterval(currentCard, Rating.Again)}</span>}
                            </button>

                            <button
                                onClick={() => handleNextCard(2)}
                                disabled={isAdvancingCard}
                                className={`flex-1 flex flex-col items-center gap-1 glass-panel hover:bg-amber-500/10 text-amber-500 border border-phy-border hover:border-amber-500/30 ${isMobile ? 'py-2 rounded-lg min-h-[52px]' : 'py-3 rounded-xl'} font-bold transition-all shadow-sm active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                                <span className={`font-black uppercase tracking-wider text-amber-400/70 group-hover:text-amber-400 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>Hard</span>
                                <span className={isMobile ? 'text-sm' : 'text-lg'}>困难 (2)</span>
                                {!isMobile && <span className="text-[10px] font-mono text-phy-muted">{getPreviewInterval(currentCard, Rating.Hard)}</span>}
                            </button>

                            <button
                                onClick={() => handleNextCard(3)}
                                disabled={isAdvancingCard}
                                className={`flex-1 flex flex-col items-center gap-1 glass-panel hover:bg-emerald-500/10 text-emerald-500 border border-phy-border hover:border-emerald-500/30 ${isMobile ? 'py-2 rounded-lg min-h-[52px]' : 'py-3 rounded-xl'} font-bold transition-all shadow-sm active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                                <span className={`font-black uppercase tracking-wider text-emerald-400/70 group-hover:text-emerald-400 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>Good</span>
                                <span className={isMobile ? 'text-sm' : 'text-lg'}>良好 (3)</span>
                                {!isMobile && <span className="text-[10px] font-mono text-phy-muted">{getPreviewInterval(currentCard, Rating.Good)}</span>}
                            </button>

                            <button
                                onClick={() => handleNextCard(4)}
                                disabled={isAdvancingCard}
                                className={`flex-1 flex flex-col items-center gap-1 glass-panel hover:bg-blue-500/10 text-blue-500 border border-phy-border hover:border-blue-500/30 ${isMobile ? 'py-2 rounded-lg min-h-[52px]' : 'py-3 rounded-xl'} font-bold transition-all shadow-sm active:scale-95 group disabled:opacity-60 disabled:cursor-not-allowed`}
                            >
                                <span className={`font-black uppercase tracking-wider text-blue-400/70 group-hover:text-blue-400 ${isMobile ? 'text-[10px]' : 'text-xs'}`}>Easy</span>
                                <span className={isMobile ? 'text-sm' : 'text-lg'}>简单 (4)</span>
                                {!isMobile && <span className="text-[10px] font-mono text-phy-muted">{getPreviewInterval(currentCard, Rating.Easy)}</span>}
                            </button>
                        </div>
                    )}

                    {/* Keyboard Shortcut Hints */}
                    {mode === 'study' && !isDrillMode && !isMobile && (
                        <div className="py-3 px-6 bg-phy-glassHeavy backdrop-blur border-t border-phy-border flex items-center justify-center gap-6 text-xs text-phy-muted">
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-2 py-0.5 bg-phy-glass border border-phy-border rounded text-[10px] font-mono text-phy-text shadow-sm">Space</kbd>
                                翻转
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-2 py-0.5 bg-phy-glass border border-phy-border rounded text-[10px] font-mono text-phy-text shadow-sm">Enter</kbd>
                                评分面板
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-phy-glass border border-phy-border rounded text-[10px] font-mono text-phy-text shadow-sm">1-4</kbd>
                                评分
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-phy-glass border border-phy-border rounded text-[10px] font-mono text-phy-text shadow-sm">S</kbd>
                                标记
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-phy-glass border border-phy-border rounded text-[10px] font-mono text-phy-text shadow-sm">Z</kbd>
                                撤销
                            </span>
                            <span className="flex items-center gap-1.5">
                                <kbd className="px-1.5 py-0.5 bg-phy-glass border border-phy-border rounded text-[10px] font-mono text-phy-text shadow-sm">Esc</kbd>
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
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-md animate-fade-in">
                        <div className="glass-modal rounded-3xl shadow-2xl p-8 w-96 text-center ring-4 ring-phy-accent/10 scale-100 animate-in fade-in zoom-in duration-300">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-phy-text flex items-center gap-2">
                                    <Dices className="text-phy-accent" />
                                    班级抽号
                                </h2>
                                <button onClick={() => setShowStudentPicker(false)} className="p-1 hover:bg-phy-glassHover rounded-full text-phy-muted transition-colors">
                                    <XCircle size={24} />
                                </button>
                            </div>
                            <div className="mb-8">
                                <div className="text-xs font-bold text-phy-muted uppercase tracking-widest mb-2">选中学生</div>
                                <div className={`text-8xl font-black text-phy-accent font-mono transition-transform ${isRolling ? 'scale-110' : 'scale-100'}`}>
                                    {pickedStudent !== null ? pickedStudent : '?'}
                                </div>
                            </div>
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-center gap-3 bg-phy-glass p-3 rounded-xl border border-phy-border">
                                    <span className="text-sm font-bold text-phy-muted">学生总数:</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        value={studentCount}
                                        onChange={(e) => setStudentCount(parseInt(e.target.value) || 1)}
                                        className="w-16 bg-phy-bg border border-phy-border rounded-lg text-center font-bold text-lg py-1 outline-none focus:border-phy-accent text-phy-text transition-colors"
                                    />
                                </div>
                                <button
                                    onClick={handlePickStudent}
                                    disabled={isRolling}
                                    className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-phy-accent/20 transition-all active:scale-95 ${isRolling ? 'bg-phy-accent/50 cursor-not-allowed' : 'bg-phy-accent hover:opacity-90'}`}
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
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md animate-fade-in">
                    <div className="glass-modal rounded-3xl shadow-2xl p-8 w-[420px] text-center border border-phy-border ring-4 ring-emerald-500/10 animate-in fade-in zoom-in duration-300">
                        <div className="mb-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20">
                                <Trophy size={40} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-black text-phy-text">复习完成！🎉</h2>
                            <p className="text-phy-muted text-sm mt-1">太棒了，继续保持！</p>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="bg-phy-glass border border-phy-border rounded-xl p-4">
                                <div className="text-3xl font-black text-phy-accent">{sessionStats.reviewed}</div>
                                <div className="text-xs text-phy-muted font-bold">复习卡片</div>
                            </div>
                            <div className="bg-phy-glass border border-phy-border rounded-xl p-4">
                                <div className="text-3xl font-black text-emerald-500">
                                    {sessionStats.reviewed > 0 ? Math.round((sessionStats.correct / sessionStats.reviewed) * 100) : 0}%
                                </div>
                                <div className="text-xs text-phy-muted font-bold">正确率</div>
                            </div>
                            <div className="bg-phy-glass border border-phy-border rounded-xl p-4">
                                <div className="text-3xl font-black text-amber-500">
                                    {sessionStartTime ? Math.round((Date.now() - sessionStartTime) / 60000) : 0}
                                </div>
                                <div className="text-xs text-phy-muted font-bold">分钟</div>
                            </div>
                        </div>

                        {/* Streak Display */}
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 mb-6 flex items-center justify-center gap-3">
                            <Flame size={28} className="text-orange-500 drop-shadow-sm" />
                            <div className="text-left">
                                <div className="text-lg font-black text-orange-500">连续学习 {studyStreak.current} 天</div>
                                <div className="text-xs text-orange-400/80">最长记录: {studyStreak.longest} 天</div>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                clearStudySession();
                                setShowSessionSummary(false);
                                setIsSessionCompleted(false);
                                setStudyQueue([]);
                                setCurrentCardIndex(0);
                                setMode('manage');
                            }}
                            className="w-full py-4 bg-phy-accent hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-phy-accent/20 transition-all active:scale-95"
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
                    className={`fixed z-[70] flex items-center gap-2 bg-phy-text text-phy-bg px-4 py-3 rounded-xl shadow-lg hover:opacity-90 transition-all animate-fade-in ${isMobile ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+88px)] left-4 pointer-events-auto' : 'bottom-8 left-8'}`}
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
                    <div className="glass-modal rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden animate-scale-in">
                        {/* Header */}
                        <div className="p-4 border-b border-phy-border flex justify-between items-center bg-phy-glassHeavy backdrop-blur">
                            <h3 className="font-bold text-phy-text flex items-center gap-2">
                                <Sparkles size={20} className="text-phy-accent" />
                                深度笔记: {editingNoteCard.front}
                            </h3>
                            <button
                                onClick={() => setEditingNoteCard(null)}
                                className="p-2 hover:bg-phy-glassHover rounded-full text-phy-muted transition-colors"
                            >
                                <XCircle size={24} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-phy-bg/50 backdrop-blur-md">
                            <div className="glass-panel rounded-xl border border-phy-border min-h-full flex flex-col">
                                {editingNoteCard.notes ? (
                                    <div className="flex-1 overflow-y-auto">
                                        <SharedMarkdown content={editingNoteCard.notes} className="p-6" />
                                        <textarea
                                            className="w-full mt-8 p-4 bg-phy-bg border border-phy-border rounded-lg text-sm font-mono h-32 outline-none focus:border-phy-accent text-phy-text transition-colors"
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
                                    <div className="flex-1 flex flex-col items-center justify-center text-phy-muted p-8 text-center gap-4">
                                        <Brain size={64} className="opacity-20" />
                                        <div>
                                            <p className="font-bold text-phy-text mb-1">暂无深度笔记</p>
                                            <p className="text-sm opacity-60">AI 可以为您生成词源、搭配、辨析等高阶内容</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Footer / Actions */}
                        <div className="p-4 border-t border-phy-border flex justify-end gap-3 bg-phy-glassHeavy backdrop-blur">
                            <button
                                onClick={handleOpenLinkModal}
                                className="mr-auto px-4 py-2 text-phy-text font-bold hover:bg-phy-glassHover rounded-lg flex items-center gap-2 border border-transparent hover:border-phy-border transition-all"
                            >
                                <LinkIcon size={16} /> 关联笔记
                            </button>
                            <button
                                onClick={() => setEditingNoteCard(null)}
                                className="px-4 py-2 text-phy-muted font-bold hover:bg-phy-glassHover hover:text-phy-text rounded-lg transition-colors border border-transparent hover:border-phy-border"
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
                                className="px-4 py-2 bg-phy-accent hover:opacity-90 text-white font-bold rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                            >
                                {isGeneratingDeepNotes ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                {editingNoteCard.notes ? '重新生成' : 'AI 深度生成'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Confirm Dialog ===== */}
            <ConfirmDialog
                isOpen={confirmDialog.isOpen}
                title={confirmDialog.title}
                message={confirmDialog.message}
                onConfirm={confirmDialog.onConfirm}
                onCancel={() => setConfirmDialog({ isOpen: false })}
            />

            {/* ===== Notes Editor Modal ===== */}
            <NotesEditorModal
                isOpen={notesEditorOpen}
                initialNotes={editingNotesCard?.notes || ''}
                onSave={async (newNotes) => {
                    if (editingNotesCard && newNotes !== editingNotesCard.notes) {
                        const updated = { ...editingNotesCard, notes: newNotes };
                        await updateFlashcard(updated);
                        setAllCards(prev => prev.map(c => c.id === editingNotesCard.id ? updated : c));
                        setStudyQueue(prev => prev.map(c => c.id === editingNotesCard.id ? updated : c));
                        toast.success("笔记已更新");
                    }
                    setNotesEditorOpen(false);
                    setEditingNotesCard(null);
                }}
                onCancel={() => {
                    setNotesEditorOpen(false);
                    setEditingNotesCard(null);
                }}
            />
        </div>
    );
};

export default FlashcardView;
