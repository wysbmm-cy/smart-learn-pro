import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { deleteChatSession, getChatSessions, saveChatSession } from '../services/db';

const ChatContext = createContext(null);

const DEFAULT_MSG = {
    role: 'assistant',
    content: 'Hello! I am your AI English tutor. Ask me anything about grammar, vocabulary, or learning methods.'
};

const SAVE_THROTTLE_MS = 1200;

export const useChat = () => {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error('useChat must be used within ChatProvider');
    return ctx;
};

export const ChatProvider = ({ children }) => {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [chatSessions, setChatSessions] = useState([]);
    const [chatMessages, setChatMessages] = useState([DEFAULT_MSG]);

    const currentSessionIdRef = useRef(currentSessionId);
    const pendingSaveRef = useRef(null);
    const saveTimerRef = useRef(null);

    useEffect(() => {
        currentSessionIdRef.current = currentSessionId;
    }, [currentSessionId]);

    const persistSessionNow = useCallback(async (messages, id) => {
        if (!id) return;
        const firstUserMsg = (messages || []).find((m) => m.role === 'user');
        const title = firstUserMsg ? String(firstUserMsg.content || '').slice(0, 30) : 'New Chat';

        const session = {
            id,
            title,
            messages
        };

        await saveChatSession(session);
        setChatSessions((prev) => {
            const existing = prev.findIndex((s) => s.id === id);
            if (existing >= 0) {
                const next = [...prev];
                next[existing] = { ...session, updatedAt: Date.now() };
                return next.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            }
            return [{ ...session, updatedAt: Date.now() }, ...prev];
        });
    }, []);

    const flushPendingSave = useCallback(async () => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        const pending = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (!pending?.id) return;
        try {
            await persistSessionNow(pending.messages, pending.id);
        } catch (e) {
            console.error('Chat session save failed:', e);
        }
    }, [persistSessionNow]);

    const scheduleSave = useCallback((messages, id, options = {}) => {
        if (!id) return;
        const immediate = Boolean(options.immediate);
        pendingSaveRef.current = { messages, id };

        if (immediate) {
            flushPendingSave();
            return;
        }
        if (saveTimerRef.current) return;

        saveTimerRef.current = setTimeout(() => {
            flushPendingSave();
        }, SAVE_THROTTLE_MS);
    }, [flushPendingSave]);

    useEffect(() => {
        const loadSessions = async () => {
            try {
                const sessions = await getChatSessions();
                setChatSessions(sessions || []);
            } catch (e) {
                console.error('Failed to load chat sessions:', e);
            }
        };
        loadSessions();

        return () => {
            flushPendingSave();
        };
    }, [flushPendingSave]);

    const toggleChat = useCallback(() => {
        setIsChatOpen((prev) => !prev);
    }, []);

    const createNewChatSession = useCallback(() => {
        const newId = Date.now().toString();
        setCurrentSessionId(newId);
        currentSessionIdRef.current = newId;
        setChatMessages([DEFAULT_MSG]);
    }, []);

    const loadChatSession = useCallback((session) => {
        if (!session) return;
        setCurrentSessionId(session.id);
        currentSessionIdRef.current = session.id;
        setChatMessages(Array.isArray(session.messages) && session.messages.length > 0 ? session.messages : [DEFAULT_MSG]);
    }, []);

    const removeChatSession = useCallback(async (id) => {
        await deleteChatSession(id);
        setChatSessions((prev) => prev.filter((s) => s.id !== id));
        if (currentSessionIdRef.current === id) {
            setCurrentSessionId(null);
            currentSessionIdRef.current = null;
            setChatMessages([DEFAULT_MSG]);
        }
    }, []);

    const addChatMessage = useCallback((role, content, options = {}) => {
        setChatMessages((prev) => {
            const next = [...prev, { role, content }];
            let sessionId = currentSessionIdRef.current;
            if (!sessionId) {
                sessionId = Date.now().toString();
                currentSessionIdRef.current = sessionId;
                setCurrentSessionId(sessionId);
            }
            if (options.persist !== false) {
                scheduleSave(next, sessionId, { immediate: options.immediate === true });
            }
            return next;
        });
    }, [scheduleSave]);

    const updateLastChatMessage = useCallback((content, options = {}) => {
        setChatMessages((prev) => {
            if (!prev.length) return prev;
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content };

            const sessionId = currentSessionIdRef.current;
            if (sessionId && options.persist !== false) {
                scheduleSave(next, sessionId, { immediate: options.immediate === true });
            }
            return next;
        });
    }, [scheduleSave]);

    const loadChatSessions = useCallback(async () => {
        const sessions = await getChatSessions();
        setChatSessions(sessions || []);
        return sessions || [];
    }, []);

    const flushChatSession = useCallback(async () => {
        await flushPendingSave();
    }, [flushPendingSave]);

    const value = {
        isChatOpen,
        toggleChat,
        currentSessionId,
        chatSessions,
        chatMessages,
        loadChatSessions,
        createNewChatSession,
        loadChatSession,
        removeChatSession,
        addChatMessage,
        updateLastChatMessage,
        flushChatSession
    };

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
};
