import React, { createContext, useContext, useState, useEffect } from 'react';
import { saveHistory, getHistory, deleteHistory, saveFile, getFiles, getFile, deleteFile, saveNote, getNotes, deleteNote, saveFlashcard, getFlashcards, deleteFlashcard, getAllData } from '../services/db';

const AppContext = createContext();

export const useApp = () => useContext(AppContext);

// Initial default settings
const DEFAULT_SETTINGS = {
    apiBaseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-3.5-turbo',
    apiKey: '',
    showWriting: true,
    showMnemonic: true,
    showCollocations: true,
    showEtymology: false,
    vocabCount: "10-15", // Default vocabulary range
    systemPrompt: "You are a helpful English teacher. Please answer questions in Markdown format, using bolding and lists to optimize the reading experience.",

    // Audio API Settings (Separate)
    audioApiBaseUrl: 'https://api.siliconflow.cn/v1',
    audioApiKey: '',
    audioModelName: 'FunAudioLLM/SenseVoiceSmall',

    // Appearance (Zen Mode)
    backgroundImage: 'https://images.unsplash.com/photo-1497436072909-60f360e1d4b0?q=80&w=2560&auto=format&fit=crop', // Nature by default
    glassBlur: 'md', // sm, md, lg, xl
    glassOpacity: 0.3, // White overlay opacity
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
        return saved ? JSON.parse(saved) : {
            todayLearned: 0,
            todayGoal: 20,
            streak: 1,
            lastLoginDate: new Date().toDateString()
        };
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
        // If it's a new file, revoke old URL if ephemeral
        // But here we rely on the logic passing a valid object.
        // Usually file from DB has a blob. We need to createURL.
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
            if (prev.file && prev.file.url) {
                // If we created it, revoke it? 
                // Careful not to revoke if it's used elsewhere, but for now safe.
                // URL.revokeObjectURL(prev.file.url); 
            }
            return { file: null, isPlaying: false, isMinimized: false };
        });
    };

    const toggleAudioPlay = (playing) => {
        setAudioState(prev => ({ ...prev, isPlaying: playing }));
    };

    // --- Chat State (New) ---
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState([
        { role: 'assistant', content: 'Hello! I am your AI English tutor. Ask me anything about grammar, vocabulary, or learning methods.' }
    ]);

    const toggleChat = () => setIsChatOpen(prev => !prev);

    const addChatMessage = (role, content) => {
        setChatMessages(prev => [...prev, { role, content }]);
    };

    const updateLastChatMessage = (content) => {
        setChatMessages(prev => {
            const newMsgs = [...prev];
            if (newMsgs.length > 0) {
                newMsgs[newMsgs.length - 1].content = content;
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
        setStats(prev => ({
            ...prev,
            todayLearned: prev.todayLearned + count
        }));
    };

    // Flashcards
    const addFlashcard = async (card) => {
        // card: { id, front, back, tags }
        await saveFlashcard({ ...card, id: card.id || Date.now().toString() });
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
        // Chat
        isChatOpen,
        toggleChat,
        chatMessages,
        addChatMessage,
        updateLastChatMessage,
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
        loadUserFlashcards,
        removeFlashcard,
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
