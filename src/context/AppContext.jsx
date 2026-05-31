import React, { createContext, useContext, useState, useEffect } from 'react';
import { saveHistory, getHistory, deleteHistory, saveFile, getFiles, getFile, deleteFile, saveNote, getNotes, deleteNote, saveFlashcard, getFlashcards, deleteFlashcard, saveTask, getTasks, deleteTask, getAllData, getHighlightsByDate, saveDailyImage, getDailyImages, deleteDailyImage, getFolders, saveFolder, getWritingMaterials, saveWritingMaterial, deleteWritingMaterial, getWritings, getTranslationLogs, getChatSessions } from '../services/db';
import { generateDailySummaryImage, generateStoryComic } from '../services/ai';
import { normalizeNoteTags, resolveTodayNotesFolderName } from '../utils/noteFolders';
import { parseKnowledgeBlocks, normalizeKnowledgeLinkingSettings, getDefaultKnowledgeLinkingSettings, upsertTranslationLinkedExamplesForNote, removeTranslationLinkedExamplesByNoteId } from '../utils/knowledgeLinking';
import { FSRS, Rating, createEmptyCard, State, generatorParameters } from 'ts-fsrs';

// ===== FSRS Algorithm Setup =====
const fsrsParams = generatorParameters({ request_retention: 0.85 });
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

const SERVER_MANAGED_API_KEY = 'server-managed';
const DEFAULT_MAIN_API_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MAIN_MODEL_NAME = 'deepseek-chat';
const cleanProxyOrigin = (value = '') => String(value || '').trim().replace(/\/+$/, '');
const isRemovedPublicProxyEndpoint = (value, path) => {
    const cleaned = cleanProxyOrigin(value);
    return cleaned === path;
};
const shouldClearRemovedProxyDefault = (apiKey, url, path) =>
    String(apiKey || '').trim() === SERVER_MANAGED_API_KEY || isRemovedPublicProxyEndpoint(url, path);

export const BUILTIN_API_CONFIG = {
    mainApiBaseUrl: DEFAULT_MAIN_API_BASE_URL,
    mainModelName: DEFAULT_MAIN_MODEL_NAME,
    mainApiKey: '',
    audioApiBaseUrl: '',
    audioApiKey: '',
    audioModelName: 'whisper-1',
    ttsApiBaseUrl: '',
    ttsApiKey: '',
    ttsModelName: 'tts-1',
    ttsVoice: 'alloy',
    ttsRequestMode: 'speech',
    ttsCustomHeaders: '',
    ttsCustomBody: '',
    ttsCustomResponseType: 'raw',
    ttsCustomAudioPath: '',
    ttsCustomAudioMimeType: 'audio/wav',
    ttsCustomStylePrompt: '',
};

// Initial default settings
const DEFAULT_SETTINGS = {
    apiBaseUrl: BUILTIN_API_CONFIG.mainApiBaseUrl,
    modelName: BUILTIN_API_CONFIG.mainModelName,
    apiKey: BUILTIN_API_CONFIG.mainApiKey,
    apiProfiles: [],
    activeApiProfileId: '',
    proxyAccessToken: '',
    preloadAll: true,
    maxReviewCards: 200,
    writingLevel: "CET-6",
    writingPrompt: "Strict examiner mode. Find all errors.",
    vocabCount: "10-15",
    deepNotePrompt: `Role: Expert English Teacher.
Task: Create a "Deep Dive Vocabulary Note" for the word: "{{word}}".
Context: The word appears in this sentence: "{{context}}".

Output Format: Markdown (Strictly follow this structure):

## {{word}}
### 1. 词性与词源
*   **词性：** [e.g. Noun/Verb]
*   **词源：** [Brief etymology]

### 2. 核心释义
1.  **[Meaning 1]：** [Definition]
2.  **[Meaning 2]：** [Definition]

### 3. 常见搭配与用法
*   **[Collocation 1]**：[CN Meaning]
*   **[Collocation 2]**：[CN Meaning]
    > [Example sentence]

### 4. 同/近义词辨析
| 单词 | 侧重点 | 例句 |
| :--- | :--- | :--- |
| **{{word}}** | ... | ... |
| **[Synonym]** | ... | ... |

### 5. 例句展示
1.  [Sentence 1] ([CN Translation])
2.  [Sentence 2] ([CN Translation])

**记忆要点：** [Mnemonic or key takeaway]

### 6. 考试应用与备考策略
- **考察频率：** [High/Medium]
- **写作/翻译提分点：** [Tips]`,
    systemPrompt: "You are VerbaPath AI, an intelligent and helpful English tutor inside the 语脉 VerbaPath learning platform. You are powered by advanced AI technology. Answer questions in Markdown format, using bolding and lists to optimize the reading experience.",

    // Audio API Settings (Separate)
    audioApiBaseUrl: BUILTIN_API_CONFIG.audioApiBaseUrl, // TeleAI endpoint is usually standard OpenAI format
    audioApiKey: BUILTIN_API_CONFIG.audioApiKey,
    audioModelName: BUILTIN_API_CONFIG.audioModelName,

    // TTS Settings (OpenRouter / xAI Grok Voice)
    ttsApiBaseUrl: BUILTIN_API_CONFIG.ttsApiBaseUrl,
    ttsApiKey: BUILTIN_API_CONFIG.ttsApiKey, // Same as audioApiKey
    ttsModelName: BUILTIN_API_CONFIG.ttsModelName,
    ttsVoice: BUILTIN_API_CONFIG.ttsVoice,
    ttsRequestMode: BUILTIN_API_CONFIG.ttsRequestMode,
    ttsCustomHeaders: BUILTIN_API_CONFIG.ttsCustomHeaders,
    ttsCustomBody: BUILTIN_API_CONFIG.ttsCustomBody,
    ttsCustomResponseType: BUILTIN_API_CONFIG.ttsCustomResponseType,
    ttsCustomAudioPath: BUILTIN_API_CONFIG.ttsCustomAudioPath,
    ttsCustomAudioMimeType: BUILTIN_API_CONFIG.ttsCustomAudioMimeType,
    ttsCustomStylePrompt: BUILTIN_API_CONFIG.ttsCustomStylePrompt,
    imageGenApiUrl: '',
    imageGenApiKey: '',
    imageGenModel: 'dall-e-3',

    // Appearance (Zen Mode)
    backgroundImage: 'https://images.unsplash.com/photo-1497436072909-60f360e1d4b0?q=80&w=2560&auto=format&fit=crop', // Nature by default
    glassBlur: 'md', // sm, md, lg, xl
    glassOpacity: 0.3, // White overlay opacity

    // Pomodoro
    showPomodoro: true,
    pomodoroFocus: 25,
    pomodoroBreak: 5,
    customStyles: [],
    knowledgeLinking: getDefaultKnowledgeLinkingSettings()
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

const normalizePublicApiDefaults = (input = {}) => {
    const next = { ...input };
    const clearMainApiDefault = shouldClearRemovedProxyDefault(next.apiKey, next.apiBaseUrl, '/api/ai');
    const clearAudioApiDefault = shouldClearRemovedProxyDefault(next.audioApiKey, next.audioApiBaseUrl, '/api/audio');
    const clearTtsApiDefault = shouldClearRemovedProxyDefault(next.ttsApiKey, next.ttsApiBaseUrl, '/api/tts');
    const clearImageApiDefault = shouldClearRemovedProxyDefault(next.imageGenApiKey, next.imageGenApiUrl, '/api/image');

    if (!next.apiBaseUrl || clearMainApiDefault) {
        next.apiBaseUrl = BUILTIN_API_CONFIG.mainApiBaseUrl;
        next.modelName = BUILTIN_API_CONFIG.mainModelName;
        next.apiKey = BUILTIN_API_CONFIG.mainApiKey;
        next.activeApiProfileId = '';
    }
    if (!next.modelName || clearMainApiDefault) {
        next.modelName = BUILTIN_API_CONFIG.mainModelName;
    }
    if (clearMainApiDefault) {
        next.apiKey = '';
        next.proxyAccessToken = '';
    }

    if (!next.audioApiBaseUrl || clearAudioApiDefault) {
        next.audioApiBaseUrl = BUILTIN_API_CONFIG.audioApiBaseUrl;
        next.audioApiKey = BUILTIN_API_CONFIG.audioApiKey;
        next.audioModelName = BUILTIN_API_CONFIG.audioModelName;
    }
    if (!next.audioModelName || clearAudioApiDefault) {
        next.audioModelName = BUILTIN_API_CONFIG.audioModelName;
    }
    if (clearAudioApiDefault) {
        next.audioApiKey = '';
    }

    if (!next.ttsApiBaseUrl || next.ttsModelName === 'fnlp/MOSS-TTSD-v0.5' || clearTtsApiDefault) {
        next.ttsApiBaseUrl = BUILTIN_API_CONFIG.ttsApiBaseUrl;
        next.ttsApiKey = BUILTIN_API_CONFIG.ttsApiKey;
        next.ttsModelName = BUILTIN_API_CONFIG.ttsModelName;
        next.ttsVoice = BUILTIN_API_CONFIG.ttsVoice;
    }
    if (clearTtsApiDefault) {
        next.ttsApiKey = '';
    }

    if (!next.ttsRequestMode) {
        next.ttsRequestMode = BUILTIN_API_CONFIG.ttsRequestMode;
        next.ttsCustomHeaders = BUILTIN_API_CONFIG.ttsCustomHeaders;
        next.ttsCustomBody = BUILTIN_API_CONFIG.ttsCustomBody;
        next.ttsCustomResponseType = BUILTIN_API_CONFIG.ttsCustomResponseType;
        next.ttsCustomAudioPath = BUILTIN_API_CONFIG.ttsCustomAudioPath;
        next.ttsCustomAudioMimeType = BUILTIN_API_CONFIG.ttsCustomAudioMimeType;
        next.ttsCustomStylePrompt = BUILTIN_API_CONFIG.ttsCustomStylePrompt;
    }

    if (!next.imageGenApiUrl || clearImageApiDefault) {
        next.imageGenApiUrl = DEFAULT_SETTINGS.imageGenApiUrl;
        next.imageGenApiKey = DEFAULT_SETTINGS.imageGenApiKey;
        next.imageGenModel = DEFAULT_SETTINGS.imageGenModel;
    }
    if (clearImageApiDefault) {
        next.imageGenApiKey = '';
    }

    next.apiProfiles = Array.isArray(next.apiProfiles) ? next.apiProfiles : [];
    return next;
};

export const AppProvider = ({ children }) => {
    // --- Navigation Ref (for Agent Mode) ---
    const navigateRef = React.useRef(null);

    // --- Persistent Settings ---
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('smartlearn_settings');
        if (!saved) {
            return normalizePublicApiDefaults({
                ...DEFAULT_SETTINGS,
                knowledgeLinking: normalizeKnowledgeLinkingSettings(DEFAULT_SETTINGS.knowledgeLinking)
            });
        }
        try {
            const parsed = JSON.parse(saved);
            return normalizePublicApiDefaults({
                ...DEFAULT_SETTINGS,
                ...parsed,
                knowledgeLinking: normalizeKnowledgeLinkingSettings(parsed?.knowledgeLinking)
            });
        } catch {
            return normalizePublicApiDefaults({
                ...DEFAULT_SETTINGS,
                knowledgeLinking: normalizeKnowledgeLinkingSettings(DEFAULT_SETTINGS.knowledgeLinking)
            });
        }
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

    const toLocalDateKey = (value = Date.now()) => {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };

    const parseTimeValue = (value) => {
        if (value === null || value === undefined) return null;
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            if (/^\d+$/.test(trimmed)) {
                const asNumber = Number(trimmed);
                return Number.isFinite(asNumber) ? asNumber : null;
            }
            const parsed = new Date(trimmed);
            return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
        }
        return null;
    };

    const isOnLocalDay = (value, dayKey) => {
        const ts = parseTimeValue(value);
        if (ts === null) return false;
        return toLocalDateKey(ts) === dayKey;
    };

    const getWordCount = (text = '') => String(text || '').trim().split(/\s+/).filter(Boolean).length;

    const extractKeywordsFromTexts = (texts = [], limit = 12) => {
        const stopwords = new Set([
            'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are', 'was', 'were', 'have', 'has',
            'had', 'into', 'about', 'what', 'when', 'where', 'which', 'while', 'they', 'them', 'their', 'our', 'out',
            'can', 'could', 'should', 'would', 'will', 'than', 'then', 'there', 'also', 'very', 'more', 'most', 'some',
            'such', 'using', 'used', 'being', 'been', 'over', 'under', 'between', 'across', 'today', 'yesterday'
        ]);
        const counts = new Map();
        texts.forEach((item) => {
            const words = String(item || '').toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
            words.forEach((word) => {
                if (stopwords.has(word)) return;
                counts.set(word, (counts.get(word) || 0) + 1);
            });
        });
        return [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([word]) => word);
    };

    const inferTopicTheme = (keywords = [], sourceText = '') => {
        const combined = `${keywords.join(' ')} ${String(sourceText || '').toLowerCase()}`;
        const themeMap = {
            technology: ['ai', 'technology', 'digital', 'internet', 'platform', 'algorithm', 'software', 'data'],
            humanities: ['history', 'culture', 'society', 'ethics', 'philosophy', 'literature', 'art'],
            business: ['business', 'market', 'economy', 'finance', 'trade', 'management', 'startup'],
            science: ['science', 'research', 'experiment', 'biology', 'physics', 'chemistry', 'climate'],
            education: ['education', 'learning', 'classroom', 'student', 'teacher', 'exam', 'vocabulary', 'translation', 'writing']
        };

        let bestTheme = 'general';
        let bestScore = 0;
        Object.entries(themeMap).forEach(([theme, words]) => {
            const score = words.reduce((sum, w) => sum + (combined.includes(w) ? 1 : 0), 0);
            if (score > bestScore) {
                bestTheme = theme;
                bestScore = score;
            }
        });

        const hintMap = {
            technology: 'futuristic interfaces, digital networks, neon data streams',
            humanities: 'editorial collage, books, people, cultural motifs',
            business: 'clean dashboard, strategy board, city lights, confident structure',
            science: 'laboratory precision, molecules, charts, discovery energy',
            education: 'study desk, notebooks, language symbols, growth trajectory',
            general: 'balanced study atmosphere, progress, focus, calm energy'
        };

        return {
            topicTheme: bestTheme,
            topicHint: hintMap[bestTheme] || hintMap.general
        };
    };

    const buildYesterdayStudyProfile = async () => {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayKey = toLocalDateKey(yesterday);

        const [
            allCards,
            allNotes,
            allHistory,
            allChats,
            allWritings,
            allTranslationLogs,
            yesterdayHighlights
        ] = await Promise.all([
            getFlashcards(),
            getNotes(),
            getHistory(),
            getChatSessions(),
            getWritings(),
            getTranslationLogs(300),
            getHighlightsByDate(yesterdayKey)
        ]);

        const reviewedCards = (allCards || []).filter((card) =>
            isOnLocalDay(card?.lastReviewed ?? card?.lastReview ?? card?.fsrs_last_review, yesterdayKey)
        );
        const newCards = (allCards || []).filter((card) =>
            isOnLocalDay(card?.createdAt ?? card?.timestamp ?? card?.id, yesterdayKey)
        );
        const noteRows = (allNotes || []).filter((note) =>
            isOnLocalDay(note?.updatedAt ?? note?.date ?? note?.createdAt, yesterdayKey)
        );
        const readingRows = (allHistory || []).filter((row) =>
            isOnLocalDay(row?.timestamp ?? row?.date ?? row?.createdAt, yesterdayKey)
        );
        const writingRows = (allWritings || []).filter((row) =>
            isOnLocalDay(row?.updatedAt ?? row?.createdAt, yesterdayKey)
        );
        const translationRows = (allTranslationLogs || []).filter((row) =>
            isOnLocalDay(row?.createdAt ?? row?.updatedAt, yesterdayKey)
        );
        const chatRows = (allChats || []).filter((row) =>
            isOnLocalDay(row?.updatedAt, yesterdayKey)
        );

        const keywordTexts = [
            ...(readingRows || []).map((row) => `${row?.summary || ''} ${row?.article || ''}`),
            ...(writingRows || []).map((row) => `${row?.title || ''} ${row?.content || ''}`),
            ...(noteRows || []).map((row) => `${row?.title || ''} ${row?.content || ''}`),
            ...(translationRows || []).map((row) => `${row?.scenario || ''} ${(row?.targetWords || []).join(' ')}`),
            ...(yesterdayHighlights || []).map((row) => row?.content || '')
        ].filter(Boolean);

        const keywords = extractKeywordsFromTexts(keywordTexts, 12);
        const { topicTheme, topicHint } = inferTopicTheme(keywords, keywordTexts.join(' ').slice(0, 2400));

        return {
            date: yesterdayKey,
            wordsLearned: reviewedCards.length,
            flashcardsReviewed: reviewedCards.length,
            newFlashcards: newCards.length,
            articlesRead: readingRows.length,
            notesCreated: noteRows.length,
            writingSessions: writingRows.length,
            writingCount: writingRows.reduce((sum, row) => sum + getWordCount(row?.content || ''), 0),
            translationCount: translationRows.length,
            questionsAsked: chatRows.length,
            highlightsCount: (yesterdayHighlights || []).length,
            keywords,
            topicTheme,
            topicHint,
            highlights: yesterdayHighlights || []
        };
    };

    // --- Global Task Runners ---
    const runDailyImageGeneration = async (highlights, style = 'auto', todayStats) => {
        setBgTasks(prev => ({ ...prev, dailyImage: { status: 'loading', url: null } }));
        try {
            const profile = (todayStats && Object.keys(todayStats || {}).length)
                ? todayStats
                : await buildYesterdayStudyProfile();
            const effectiveHighlights = Array.isArray(highlights)
                ? highlights
                : (profile?.highlights || []);
            const url = await generateDailySummaryImage(effectiveHighlights, settings, style, profile);
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
                    date: profile?.date || toLocalDateKey(Date.now()),
                    type: 'summary',
                    url: savedUrl,
                    style: style,
                    metadata: {
                        stats: profile,
                        keywords: profile?.keywords || [],
                        topicTheme: profile?.topicTheme || 'general'
                    },
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
        if (key === 'knowledgeLinking') {
            setSettings(prev => ({ ...prev, [key]: normalizeKnowledgeLinkingSettings(value) }));
            return;
        }
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

    const getKnowledgeLinkingConfig = () => normalizeKnowledgeLinkingSettings(settings?.knowledgeLinking);

    const inferGuidanceCategory = (text = '', section = '') => {
        const hay = `${String(text || '')}\n${String(section || '')}`.toLowerCase();
        if (/conclusion|summary|结论|总结/.test(hay)) return 'conclusion';
        if (/transition|however|although|转折|让步/.test(hay)) return 'transition';
        if (/thesis|opening|stance|立场|观点|开头/.test(hay)) return 'thesis';
        if (/evidence|example|data|论据|举例|证据/.test(hay)) return 'evidence';
        return 'argument';
    };

    const clearKnowledgeLinkedDataForNote = async (noteId) => {
        const sourceNoteId = String(noteId || '').trim();
        if (!sourceNoteId) return;

        const allMaterials = await getWritingMaterials();
        const linkedMaterials = (allMaterials || []).filter(
            (item) => item?.source === 'deep_note' && String(item?.sourceNoteId || '').trim() === sourceNoteId
        );
        for (const item of linkedMaterials) {
            try {
                await deleteWritingMaterial(item.id);
            } catch (error) {
                console.warn('clear linked material failed', error);
            }
        }
        removeTranslationLinkedExamplesByNoteId(sourceNoteId);
    };

    const syncKnowledgeLinksFromNote = async (noteRecord) => {
        const sourceNoteId = String(noteRecord?.id || '').trim();
        if (!sourceNoteId) return;

        const normalizedConfig = getKnowledgeLinkingConfig();
        if (!normalizedConfig.enabled) return;
        await clearKnowledgeLinkedDataForNote(sourceNoteId);

        const parsedBlocks = parseKnowledgeBlocks(noteRecord?.content || '', sourceNoteId);
        if (!parsedBlocks.length) return;

        if (normalizedConfig.rules.writingGuidanceToMaterials) {
            const guidanceBlocks = parsedBlocks.filter((item) => item.type === 'writing_guidance');
            for (let i = 0; i < guidanceBlocks.length; i += 1) {
                const block = guidanceBlocks[i];
                const safeHash = String(block.sourceHash || '').trim();
                if (!safeHash) continue;
                const isDirectiveMaterial = block?.meta?.directive === 'material';
                const isDirectiveVocab = block?.meta?.directive === 'vocab';
                const parsedCategory = String(block?.meta?.category || '').trim().toLowerCase();
                const categoryMap = {
                    argument: 'argument',
                    thesis: 'thesis',
                    transition: 'transition',
                    evidence: 'evidence',
                    conclusion: 'conclusion',
                    vocabulary: 'vocabulary'
                };
                const materialCategory = isDirectiveVocab
                    ? 'vocabulary'
                    : (categoryMap[parsedCategory] || inferGuidanceCategory(block.text, block.section));
                await saveWritingMaterial({
                    id: `deep-note-${safeHash}`,
                    title: String(block?.meta?.title || '').trim() || `${String(noteRecord?.title || 'Deep Note')} · ${String(block.section || 'Guidance').trim()} ${i + 1}`,
                    content: String(block.text || '').trim(),
                    rewrite: '',
                    usage: String(block?.meta?.usage || '').trim() || `From note: ${String(noteRecord?.title || '')}`,
                    caution: String(block?.meta?.caution || '').trim(),
                    sourceTerm: String(block?.meta?.sourceTerm || '').trim(),
                    targetTerm: String(block?.meta?.targetTerm || '').trim(),
                    replaceReason: String(block?.meta?.replaceReason || '').trim(),
                    beforeExample: '',
                    afterExample: String(block?.meta?.afterExample || '').trim(),
                    category: materialCategory,
                    topic: String(block?.meta?.topic || '').trim() || String(noteRecord?.title || '').trim(),
                    examType: settings?.writingLevel || 'CET-6',
                    tags: ['deep-note', 'linked'],
                    source: 'deep_note',
                    sourceNoteId,
                    sourceNoteTitle: String(noteRecord?.title || '').trim(),
                    sourceHash: safeHash,
                    sourceSection: String(block.section || '').trim()
                });
            }
        }

        if (normalizedConfig.rules.examplesToTranslation) {
            const exampleBlocks = parsedBlocks.filter((item) => item.type === 'examples');
            upsertTranslationLinkedExamplesForNote({
                noteId: sourceNoteId,
                noteTitle: String(noteRecord?.title || '').trim(),
                blocks: exampleBlocks
            });
        }
    };

    useEffect(() => {
        const bootstrapKey = 'smartlearn_knowledge_linking_bootstrap_v1';
        const runBootstrap = async () => {
            const cfg = getKnowledgeLinkingConfig();
            if (!cfg.enabled || !cfg.autoSyncOnSave) return;
            if (localStorage.getItem(bootstrapKey) === '1') return;

            const notes = await getNotes();
            for (const note of notes || []) {
                await syncKnowledgeLinksFromNote(note);
            }
            localStorage.setItem(bootstrapKey, '1');
        };
        runBootstrap().catch((error) => {
            console.warn('knowledge link bootstrap failed', error);
        });
    }, [settings?.knowledgeLinking?.enabled, settings?.knowledgeLinking?.autoSyncOnSave]);

    const syncNoteKnowledgeLinks = async (noteInput) => {
        if (!noteInput) return null;
        const sourceNoteId = String(noteInput?.id || '').trim();
        if (!sourceNoteId) return null;

        const record = {
            id: sourceNoteId,
            title: String(noteInput?.title || '').trim(),
            content: String(noteInput?.content || ''),
            tags: Array.isArray(noteInput?.tags) ? noteInput.tags : [],
            folder: String(noteInput?.folder || '').trim() || "Uncategorized",
            updatedAt: Number(noteInput?.updatedAt || Date.now()) || Date.now()
        };
        await syncKnowledgeLinksFromNote(record);
        return record;
    };

    const saveToNotes = async (noteObj) => {
        // noteObj: { id, title, content, folder? }
        let folderName = noteObj.folder;
        if (!folderName) {
            const folders = await getFolders();
            folderName = resolveTodayNotesFolderName(folders);
            const exists = (folders || []).some(
                (f) => String(f?.name || '').trim().toLowerCase() === String(folderName).trim().toLowerCase()
            );
            if (!exists) {
                await saveFolder({
                    id: crypto.randomUUID(),
                    name: folderName,
                    type: 'notebook',
                    createdAt: Date.now()
                });
            }
        }

        const inputTags = normalizeNoteTags(noteObj.tags);
        const tags = noteObj.tags === undefined && folderName && folderName !== 'Uncategorized'
            ? normalizeNoteTags([...inputTags, folderName])
            : inputTags;

        const record = {
            id: noteObj.id || Date.now().toString(),
            title: noteObj.title || "New Note",
            content: noteObj.content || "",
            folder: folderName || "Uncategorized",
            tags,
            updatedAt: Date.now()
        };
        await saveNote(record);
        const cfg = getKnowledgeLinkingConfig();
        if (cfg.enabled && cfg.autoSyncOnSave) {
            try {
                await syncKnowledgeLinksFromNote(record);
            } catch (error) {
                console.warn('syncKnowledgeLinksFromNote failed', error);
            }
        }
        return record;
    };

    const loadUserNotes = async () => {
        return await getNotes();
    };

    const removeNoteItem = async (id) => {
        try {
            await clearKnowledgeLinkedDataForNote(id);
        } catch (error) {
            console.warn('clearKnowledgeLinkedDataForNote failed', error);
        }
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
        syncNoteKnowledgeLinks,
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
