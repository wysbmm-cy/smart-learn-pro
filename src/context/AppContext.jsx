import React, { createContext, useContext, useState, useEffect } from 'react';
import { saveHistory, getHistory, deleteHistory, saveFile, getFiles, getFile, deleteFile, saveNote, getNotes, deleteNote, saveFlashcard, getFlashcards, deleteFlashcard, saveTask, getTasks, deleteTask, getAllData, getHighlightsByDate, saveDailyImage, getDailyImages, deleteDailyImage } from '../services/db';
import { generateDailySummaryImage, generateStoryComic } from '../services/ai';
import { FSRS, Rating, createEmptyCard, State, generatorParameters } from 'ts-fsrs';

// ===== FSRS Algorithm Setup =====
const fsrsParams = generatorParameters({ request_retention: 0.9 });
const fsrs = new FSRS(fsrsParams);

/**
 * Restore a FSRS Card object from database card fields.
 * If the card has no FSRS data (old cards), creates a new empty card.
 */
function restoreFSRSCard(card) {
    if (card && card.fsrs_stability !== undefined) {
        return {
            due: new Date(card.fsrs_due),
            stability: card.fsrs_stability,
            difficulty: card.fsrs_difficulty,
            elapsed_days: card.fsrs_elapsed_days || 0,
            scheduled_days: card.fsrs_scheduled_days || 0,
            reps: card.fsrs_reps || 0,
            lapses: card.fsrs_lapses || 0,
            state: card.fsrs_state ?? State.New,
            last_review: card.fsrs_last_review
                ? new Date(card.fsrs_last_review) : undefined,
            learning_steps: card.fsrs_learning_steps ?? 0,
        };
    }
    return createEmptyCard(new Date());
}

/**
 * Serialize FSRS Card object back to flat database fields.
 */
function serializeFSRSCard(fsrsCard) {
    return {
        fsrs_stability: fsrsCard.stability,
        fsrs_difficulty: fsrsCard.difficulty,
        fsrs_state: fsrsCard.state,
        fsrs_reps: fsrsCard.reps,
        fsrs_lapses: fsrsCard.lapses,
        fsrs_due: fsrsCard.due.getTime(),
        fsrs_last_review: fsrsCard.last_review?.getTime(),
        fsrs_elapsed_days: fsrsCard.elapsed_days,
        fsrs_scheduled_days: fsrsCard.scheduled_days,
        fsrs_learning_steps: fsrsCard.learning_steps,
    };
}

// Export for use in FlashcardView (preview intervals)
export { fsrs, restoreFSRSCard, Rating, State };

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

// Initial default settings
const DEFAULT_SETTINGS = {
    apiBaseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'kimi-k2-0905-preview',
    apiKey: 'sk-oZJYOSFELAIMihGSsTILis6FDgWTUB0xnujShpivalzUr9Ci',
    showWriting: true,
    showMnemonic: true,
    showCollocations: true,
    showEtymology: false,
    preloadAll: true,
    maxReviewCards: 0,  // 0 = unlimited, otherwise cap per session
    writingLevel: "CET-6",
    writingPrompt: "Strict examiner mode. Find all errors.",
    vocabCount: "10-15",
    systemPrompt: "You are SmartLearn AI, an intelligent and helpful English tutor. You are powered by advanced AI technology. Answer questions in Markdown format, using bolding and lists to optimize the reading experience.",
    vocabAnalysisPrompt: `
  Role: Expert English Teacher.
  Task: Analyze the provided text comprehensively in one go.
  Requirements:
  1. Summary: Chinese summary + Difficulty Level.
  2. Vocabulary: Extract {{vocabCount}} key words/phrases (prioritize academic). For each: Chinese meaning, mnemonic, usage tips.
  3. Grammar: Identify 2-3 **truly advanced or noteworthy** syntactic structures.
  
  Output MUST be valid JSON.
  `,

    // Audio API Settings (Separate)
    audioApiBaseUrl: 'https://api.siliconflow.cn/v1', // TeleAI endpoint is usually standard OpenAI format
    audioApiKey: 'sk-lhjqjomtwyimlzlaimfjpodymatrnumaqwmgvevvfukoqxvr',
    audioModelName: 'TeleAI/TeleSpeechASR',

    // TTS Settings (SiliconFlow / MOSS)
    ttsApiBaseUrl: 'https://api.siliconflow.cn/v1',
    ttsApiKey: 'sk-lhjqjomtwyimlzlaimfjpodymatrnumaqwmgvevvfukoqxvr', // Same as audioApiKey
    ttsModelName: 'fnlp/MOSS-TTSD-v0.5',
    ttsVoice: 'fnlp/MOSS-TTSD-v0.5:alex',

    // Appearance (Zen Mode)
    backgroundImage: 'https://images.unsplash.com/photo-1497436072909-60f360e1d4b0?q=80&w=2560&auto=format&fit=crop', // Nature by default
    glassBlur: 'md', // sm, md, lg, xl
    glassOpacity: 0.3, // White overlay opacity

    // Pomodoro
    showPomodoro: true,
    pomodoroFocus: 25,
    pomodoroBreak: 5,
    customStyles: []
};

// Initial Mock Analysis
const DEFAULT_ANALYSIS = {
    summary: "（演示模式）文章讨论了AI发展的伦理影响，权衡了其行业变革潜力与隐私就业风险。配置API Key后可分析任意文本。",
    level: "Demo Level",
    vocabulary: [
        {
            word: "implication",
            phonetic: "/ˌɪmplɪˈkeɪʃn/",
            pos: "n.",
            meaning: "含义；暗示；可能的影响",
            level: "CET-6",
            example: "The rapid advancement of AI has sparked a debate regarding its ethical implications.",
            usage: "have implications for...",
            synonyms: ["consequence", "inference"],
            writing: "写作中常用于描述深远影响。",
            mnemonic: "im(进)+plic(折叠) -> 折叠其中的含义",
            collocations: ["ethical implications"]
        }
    ],
    structures: []
};

export const AppProvider = ({ children }) => {
    // --- Navigation Ref (for Agent Mode) ---
    const navigateRef = React.useRef(null);

    // --- Persistent Settings ---
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('smartlearn_settings');
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    });

    // --- Persistent Theme ---
    const [theme, setThemeState] = useState(() => {
        return localStorage.getItem('smartlearn_theme') || 'vampire';
    });

    const setTheme = (newTheme) => {
        setThemeState(newTheme);
        localStorage.setItem('smartlearn_theme', newTheme);
    };

    useEffect(() => {
        const themes = ['theme-vampire', 'theme-abyss', 'theme-radiation', 'theme-sakura', 'theme-ocean', 'theme-mauve', 'theme-golden', 'theme-cheery', 'theme-prussian', 'theme-sky', 'theme-forest'];
        document.body.classList.remove(...themes);
        if (theme) {
            document.body.classList.add(`theme-${theme}`);
        }
    }, [theme]);

    // --- Persistent Stats ---
    const [stats, setStats] = useState(() => {
        const saved = localStorage.getItem('smartlearn_stats');
        const defaultStats = {
            todayLearned: 0,
            todayGoal: 20,
            streak: 1,
            lastLoginDate: new Date().toDateString(),
            dailyActivity: {} // { "2023-10-27": 5 }
        };
        return saved ? { ...defaultStats, ...JSON.parse(saved) } : defaultStats;
    });

    // --- Background Tasks State (Global) ---
    const [bgTasks, setBgTasks] = useState({
        dailyImage: null, // { status: 'idle'|'loading'|'done'|'error', url: null, error: null }
        storyComic: null  // { status: 'idle'|'loading'|'done'|'error', data: null, error: null }
    });

    // --- Stats Helpers ---
    const logActivity = (type, count = 1) => {
        const todayStr = new Date().toISOString().split('T')[0];
        setStats(prev => {
            const newActivity = { ...prev.dailyActivity };
            newActivity[todayStr] = (newActivity[todayStr] || 0) + count;

            const newStats = {
                ...prev,
                todayLearned: prev.todayLearned + count,
                dailyActivity: newActivity
            };
            localStorage.setItem('smartlearn_stats', JSON.stringify(newStats));
            return newStats;
        });
    };

    // --- Global Task Runners ---
    const runDailyImageGeneration = async (highlights, style, todayStats) => {
        setBgTasks(prev => ({ ...prev, dailyImage: { status: 'loading', url: null } }));
        try {
            const url = await generateDailySummaryImage(highlights, settings, style, todayStats);
            setBgTasks(prev => ({ ...prev, dailyImage: { status: 'done', url } }));

            if (url) {
                // Fix: Convert URL to Base64 to persist permanently
                let savedUrl = url;
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    savedUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch (err) {
                    console.error("Failed to convert image to Base64, saving original URL", err);
                }

                await saveDailyImage({
                    id: Date.now().toString(),
                    date: new Date().toISOString().split('T')[0],
                    type: 'summary',
                    url: savedUrl,
                    style: style,
                    metadata: { stats: todayStats },
                    createdAt: new Date().toISOString()
                });
            }
        } catch (e) {
            console.error(e);
            setBgTasks(prev => ({ ...prev, dailyImage: { status: 'error', error: e.message } }));
        }
    };

    const runStoryComicGeneration = async (highlights, options = {}) => {
        setBgTasks(prev => ({ ...prev, storyComic: { status: 'loading', data: null } }));
        try {
            const result = await generateStoryComic(highlights, settings, settings.customStyles || [], options);
            setBgTasks(prev => ({ ...prev, storyComic: { status: 'done', data: result } }));

            // Persist to Gallery
            if (result?.imageUrl) {
                // Fix: Convert URL to Base64 to persist permanently
                let savedUrl = result.imageUrl;
                try {
                    const response = await fetch(result.imageUrl);
                    const blob = await response.blob();
                    savedUrl = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch (err) {
                    console.error("Failed to convert image to Base64, saving original URL", err);
                }

                await saveDailyImage({
                    id: Date.now().toString(),
                    date: new Date().toISOString().split('T')[0],
                    type: 'comic',
                    url: savedUrl,
                    style: result.styleName,
                    metadata: { title: result.storyTitle },
                    createdAt: new Date().toISOString()
                });
            }
        } catch (e) {
            console.error(e);
            setBgTasks(prev => ({ ...prev, storyComic: { status: 'error', error: e.message } }));
        }
    };

    // --- Core Action Wrappers ---
    // SRS Algorithm: FSRS (Free Spaced Repetition Scheduler)
    // Quality: 1=Again, 2=Hard, 3=Good, 4=Easy
    const updateFlashcardProgress = async (id, quality) => {
        const cards = await getFlashcards();
        const card = cards.find(c => c.id === id);
        if (!card) return;

        // Rating mapping: 1→Again, 2→Hard, 3→Good, 4→Easy
        const ratingMap = {
            1: Rating.Again,
            2: Rating.Hard,
            3: Rating.Good,
            4: Rating.Easy
        };

        // Restore FSRS Card from database and compute next state
        const fsrsCard = restoreFSRSCard(card);
        const result = fsrs.next(fsrsCard, new Date(), ratingMap[quality]);
        const newCard = result.card;

        // Keep weaknessScore for backward-compatible UI sorting
        let weaknessScore = card.weaknessScore || 0;
        const WEAKNESS_DELTA = { 1: 5, 2: 3, 3: 1, 4: -2 };
        weaknessScore = Math.max(0, Math.min(100, weaknessScore + WEAKNESS_DELTA[quality]));

        const updatedCard = {
            ...card,
            ...serializeFSRSCard(newCard),
            nextReview: newCard.due.getTime(),   // Compatible with existing filter
            lastReviewed: Date.now(),
            weaknessScore,
        };

        await saveFlashcard(updatedCard);

        // Log Activity for Heatmap
        logActivity('flashcard', 1);
    };

    // --- Session State ---
    const [currentArticle, setCurrentArticle] = useState("");
    const [analysisResult, setAnalysisResult] = useState(null);

    // --- Import Persistence State ---
    const [importText, setImportText] = useState("");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progressMsg, setProgressMsg] = useState("");

    // --- Audio Player State (Global) ---
    const [audioState, setAudioState] = useState({
        file: null, // { name, url, type }
        isPlaying: false,
        isMinimized: false
    });

    const playAudio = (file) => {
        let url = file.url;
        if (!url && file.blob) {
            url = URL.createObjectURL(file.blob);
        }

        setAudioState({
            file: { ...file, url },
            isPlaying: true,
            isMinimized: false
        });
    };

    const closeAudio = () => {
        setAudioState(prev => {
            return { file: null, isPlaying: false, isMinimized: false };
        });
    };

    const toggleAudioPlay = (playing) => {
        setAudioState(prev => ({ ...prev, isPlaying: playing }));
    };

    // Flashcard Navigation State (Shared)
    const [flashcardStartupState, setFlashcardStartupState] = useState(null); // { mode: 'study', folder: 'today' }

    // Save Settings on Change
    useEffect(() => {
        localStorage.setItem('smartlearn_settings', JSON.stringify(settings));
    }, [settings]);

    // Save Stats on Change
    useEffect(() => {
        localStorage.setItem('smartlearn_stats', JSON.stringify(stats));
    }, [stats]);

    // Check Streak
    useEffect(() => {
        const today = new Date().toDateString();
        if (stats.lastLoginDate !== today) {
            setStats(prev => ({
                ...prev,
                lastLoginDate: today,
            }));
        }
    }, []);

    // Load Local Background (IDB) on Start
    useEffect(() => {
        const loadLocalBg = async () => {
            try {
                const file = await getFile('theme_background');
                if (file && file.blob) {
                    const url = URL.createObjectURL(file.blob);
                    setSettings(prev => ({ ...prev, backgroundImage: url }));
                }
            } catch (e) {
                console.log("No local background found");
            }
        };
        loadLocalBg();
    }, []);

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    // --- DB Wrappers ---
    const saveToHistory = async (article, result) => {
        const record = {
            id: Date.now().toString(),
            article,
            result,
            summary: result.summary,
            level: result.level,
            date: new Date().toLocaleDateString()
        };
        await saveHistory(record);
        return record;
    };

    const loadHistory = async () => {
        return await getHistory();
    };

    const removeHistoryItem = async (id) => {
        await deleteHistory(id);
    };

    const saveToFileLibrary = async (fileObj) => {
        // fileObj: { name, type, blob }
        const record = {
            id: Date.now().toString(),
            ...fileObj,
            timestamp: Date.now()
        };
        await saveFile(record);
        return record;
    };

    const loadFiles = async () => {
        return await getFiles();
    };

    const removeFileItem = async (id) => {
        await deleteFile(id);
    };

    const saveToNotes = async (noteObj) => {
        // noteObj: { id, title, content }
        const record = {
            id: noteObj.id || Date.now().toString(),
            title: noteObj.title || "New Note",
            content: noteObj.content || "",
            folder: noteObj.folder || "Uncategorized",
            updatedAt: Date.now()
        };
        await saveNote(record);
        return record;
    };

    const loadUserNotes = async () => {
        return await getNotes();
    };

    const removeNoteItem = async (id) => {
        await deleteNote(id);
    };

    const exportUserData = async () => {
        const dbData = await getAllData();
        return {
            timestamp: new Date().toISOString(),
            version: '1.0',
            settings,
            stats,
            ...dbData
        };
    };

    const addLearnedWords = (count) => {
        const dateKey = new Date().toISOString().split('T')[0];

        setStats(prev => {
            const currentActivity = prev.dailyActivity || {};
            const newCount = (currentActivity[dateKey] || 0) + count;

            return {
                ...prev,
                todayLearned: prev.todayLearned + count,
                dailyActivity: {
                    ...currentActivity,
                    [dateKey]: newCount
                }
            };
        });
    };

    // Flashcards
    const addFlashcard = async (card) => {
        // card: { id, front, back, tags }
        await saveFlashcard({ ...card, id: card.id || Date.now().toString() });
    };

    const updateFlashcard = async (card) => {
        await saveFlashcard(card);
    };

    const loadUserFlashcards = async () => {
        return await getFlashcards();
    };

    const removeFlashcard = async (id) => {
        await deleteFlashcard(id);
    };

    const value = {
        settings,
        updateSetting,
        stats,
        currentArticle,
        setCurrentArticle,
        analysisResult,
        setAnalysisResult,
        addLearnedWords,
        DEFAULT_ANALYSIS,
        // Persistence
        importText,
        setImportText,
        isAnalyzing,
        setIsAnalyzing,
        progressMsg,
        setProgressMsg,
        // Navigation Signals
        flashcardStartupState, setFlashcardStartupState,
        logActivity,
        // DB Methods
        saveToHistory,
        loadHistory,
        removeHistoryItem,
        saveToFileLibrary,
        loadFiles,
        removeFileItem,
        saveToNotes,
        loadUserNotes,
        removeNoteItem,
        exportUserData,
        addFlashcard,
        updateFlashcard,
        saveTask,

        // Style Management
        addCustomStyle: (style) => setSettings(prev => {
            const newState = { ...prev, customStyles: [...(prev.customStyles || []), style] };
            localStorage.setItem('slp_settings', JSON.stringify(newState));
            return newState;
        }),
        removeCustomStyle: (id) => setSettings(prev => {
            const newState = { ...prev, customStyles: (prev.customStyles || []).filter(s => s.id !== id) };
            localStorage.setItem('slp_settings', JSON.stringify(newState));
            return newState;
        }),
        getTasks,
        deleteTask,
        loadUserFlashcards,
        removeFlashcard,
        updateFlashcardProgress,
        // Audio
        audioState,
        playAudio,
        closeAudio,
        toggleAudioPlay,
        // Helpers
        saveFile,
        deleteFile,
        bgTasks,
        runDailyImageGeneration,

        runStoryComicGeneration,
        getDailyImages,
        deleteDailyImage,
        // Navigation (Agent Mode)
        navigateRef,
        theme,
        setTheme
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};
