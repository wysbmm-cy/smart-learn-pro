import React, { createContext, useContext, useState, useEffect } from 'react';
import { saveHistory, getHistory, deleteHistory, saveFile, getFiles, getFile, deleteFile, saveNote, getNotes, deleteNote, saveFlashcard, getFlashcards, deleteFlashcard, saveTask, getTasks, deleteTask, getAllData, saveChatSession, getChatSessions, deleteChatSession } from '../services/db';

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
    vocabCount: "10-15", // Default vocabulary range
    systemPrompt: "You are a helpful English teacher. Please answer questions in Markdown format, using bolding and lists to optimize the reading experience.",
    vocabAnalysisPrompt: `
  Role: Expert English Teacher.
  Task: Analyze the provided text comprehensively in one go.
  Requirements:
  1. Summary: Chinese summary + Difficulty Level.
  2. Vocabulary: Extract {{vocabCount}} key words/phrases (prioritize academic). For each: Chinese meaning, mnemonic, usage tips.
  3. Grammar: Identify 2-3 **truly advanced or noteworthy** syntactic structures (e.g., Inversion, Subjunctive, Participle Phrases, Complex Clauses). 
     *   **Ignore** simple Subject-Verb-Object sentences.
     *   Focus on sentence variety and rhetorical function.
     *   Pattern: The abstract structure (e.g., "Not only... but also...").
     *   Explanation: Why is this used? (e.g., "Emphasizes contrast...").
  
  Output MUST be valid JSON with this structure:
  {
    "summary": "...",
    "level": "CET-4/CET-6/IELTS/Advanced",
    "vocabulary": [
      { "word": "...", "phonetic": "...", "pos": "...", "meaning": "...", "entry": "...", "mnemonic": "...", "writing": "..." }
    ],
    "structures": [
      { "pattern": "...", "type": "...", "explanation": "..." }
    ]
  }
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
    // --- Persistent Settings ---
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('smartlearn_settings');
        return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    });

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

    // --- Chat State (New in v5: Multi-Session Persistence) ---
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [chatSessions, setChatSessions] = useState([]);

    // Default welcome message
    const DEFAULT_MSG = { role: 'assistant', content: 'Hello! I am your AI English tutor. Ask me anything about grammar, vocabulary, or learning methods.' };

    const [chatMessages, setChatMessages] = useState([DEFAULT_MSG]);

    // Load sessions on mount
    useEffect(() => {
        const loadSessions = async () => {
            const sessions = await getChatSessions();
            setChatSessions(sessions);

            // Auto-load latest session if exists? Or start new?
            // Let's start clean, but having list available is good.
        };
        loadSessions();
    }, []);

    // Helper: Save current session to DB
    const saveCurrentSessionToDB = async (messages, id) => {
        if (!id) return; // Don't save if no ID (ephemeral start)
        // Title logic: First user message or "New Chat"
        const firstUserMsg = messages.find(m => m.role === 'user');
        const title = firstUserMsg ? firstUserMsg.content.slice(0, 30) : "New Chat";

        const session = {
            id,
            title,
            messages
        };
        await saveChatSession(session);
        // Update local list
        setChatSessions(prev => {
            const existing = prev.findIndex(s => s.id === id);
            if (existing !== -1) {
                const newSessions = [...prev];
                newSessions[existing] = { ...session, updatedAt: Date.now() }; // Update timestamp implicitly by sort in DB, but here manual
                return newSessions.sort((a, b) => b.updatedAt - a.updatedAt);
            } else {
                return [session, ...prev];
            }
        });
    };

    const createNewChatSession = () => {
        const newId = Date.now().toString();
        setCurrentSessionId(newId);
        setChatMessages([DEFAULT_MSG]);
        // We don't save to DB until first message? Or save immediately.
        // Let's save on first message to avoid empty spam. 
        // But for UI "Active" state, let's just set ID.
    };

    const loadChatSession = (session) => {
        setCurrentSessionId(session.id);
        setChatMessages(session.messages || []);
    };

    const removeChatSession = async (id) => {
        await deleteChatSession(id);
        setChatSessions(prev => prev.filter(s => s.id !== id));
        if (currentSessionId === id) {
            // Reset to empty
            setCurrentSessionId(null);
            setChatMessages([DEFAULT_MSG]);
        }
    };

    const toggleChat = () => setIsChatOpen(prev => !prev);


    const addChatMessage = (role, content) => {
        setChatMessages(prev => {
            const newMsgs = [...prev, { role, content }];

            // Auto-init session ID if null
            let sessionId = currentSessionId;
            if (!sessionId) {
                sessionId = Date.now().toString();
                setCurrentSessionId(sessionId);
            }

            // Debounce save? Or save immediately for safety.
            saveCurrentSessionToDB(newMsgs, sessionId);
            return newMsgs;
        });
    };

    const updateLastChatMessage = (content) => {
        setChatMessages(prev => {
            const newMsgs = [...prev];
            if (newMsgs.length > 0) {
                newMsgs[newMsgs.length - 1].content = content;
            }
            // Also save to DB
            if (currentSessionId) {
                saveCurrentSessionToDB(newMsgs, currentSessionId);
            }
            return newMsgs;
        });
    };

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

    const updateFlashcardProgress = async (id, quality) => {
        // quality: 1 (Remembered), 0 (Forgot)
        const cards = await getFlashcards();
        const card = cards.find(c => c.id === id);
        if (!card) return;

        let interval = card.interval || 1;
        let repetitions = card.repetitions || 0;
        let nextReview = Date.now();

        if (quality === 1) {
            // Remembered
            if (repetitions === 0) interval = 1;
            else if (repetitions === 1) interval = 3;
            else interval = Math.round(interval * 2.5); // Exponential growth

            repetitions += 1;
        } else {
            // Forgot
            interval = 1;
            repetitions = 0;
        }

        nextReview = Date.now() + (interval * 24 * 60 * 60 * 1000);

        const updatedCard = {
            ...card,
            interval,
            repetitions,
            nextReview,
            lastReview: Date.now()
        };

        await saveFlashcard(updatedCard);
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
        // Chat
        isChatOpen,
        toggleChat,
        chatMessages,
        addChatMessage,
        updateLastChatMessage,
        // Chat Sessions
        currentSessionId,
        chatSessions,
        createNewChatSession,
        loadChatSession,
        removeChatSession,
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
        deleteFile
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};
