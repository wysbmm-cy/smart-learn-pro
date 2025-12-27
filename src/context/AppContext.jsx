import React, { createContext, useContext, useState, useEffect } from 'react';

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
    systemPrompt: "You are a helpful English teacher. Please answer questions in Markdown format, using bolding and lists to optimize the reading experience."
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
        return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
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
            // New day logic could go here
            setStats(prev => ({
                ...prev,
                lastLoginDate: today,
                // concise streak logic can be expanded
            }));
        }
    }, []);

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const addLearnedWords = (count) => {
        setStats(prev => ({
            ...prev,
            todayLearned: prev.todayLearned + count
        }));
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
        // Chat
        isChatOpen,
        toggleChat,
        chatMessages,
        addChatMessage,
        updateLastChatMessage
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};
