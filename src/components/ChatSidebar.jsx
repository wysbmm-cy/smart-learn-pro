import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Send, Bot, User, Loader2, FileText, NotebookPen, Brain } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { streamChatMessage } from '../services/ai';

const ChatSidebar = () => {
    const {
        isChatOpen, toggleChat, chatMessages, addChatMessage, updateLastChatMessage, settings,
        loadUserNotes, loadFiles, currentArticle, analysisResult
    } = useApp();
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);

    // Suggestion State
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionQuery, setSuggestionQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [cursorPosition, setCursorPosition] = useState(0);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Handle Input & Mentions
    const handleInputChange = (e) => {
        const val = e.target.value;
        const pos = e.target.selectionStart;
        setInput(val);
        setCursorPosition(pos);

        // Detect @
        const lastAt = val.lastIndexOf('@', pos);
        if (lastAt !== -1 && lastAt < pos) {
            // Check if there's a space before @ (or it's start of string)
            const charBefore = lastAt === 0 ? ' ' : val[lastAt - 1];
            if (charBefore === ' ' || charBefore === '\n') {
                const query = val.slice(lastAt + 1, pos);
                if (!query.includes(' ')) { // Only allow single word search or until space? Let's allow spaces for titles.
                    // Actually, usually suggestions close on space. But titles have spaces. 
                    // Let's assume search until Enter or Selection.
                    // Relaxed rule: just show if @ is detected recently.
                    setSuggestionQuery(query);
                    setShowSuggestions(true);
                    fetchSuggestions(query);
                    return;
                }
            }
        }
        setShowSuggestions(false);
    };

    const fetchSuggestions = async (query) => {
        const q = query.toLowerCase();
        const options = [];

        // 1. Current Context
        if (currentArticle) {
            options.push({
                type: 'context', id: 'current', title: 'Current Article/Analysis',
                content: currentArticle, icon: Brain
            });
        }

        // 2. Notes
        const notes = await loadUserNotes();
        notes.forEach(n => {
            options.push({ type: 'note', id: n.id, title: n.title, content: n.content, icon: NotebookPen });
        });

        // 3. Files
        // Files content loading is async and might be heavy. For now, maybe just offer to load?
        // Or if we have small files. For now, let's skip files content unless we have a way to peek.
        // Actually, files are in DB with blobs. We can't easily search content without loading.
        // Let's just list file names, and load content on select.
        const files = await loadFiles();
        files.forEach(f => {
            options.push({ type: 'file', id: f.id, title: f.name, data: f, icon: FileText }); // Pass full obj to load later
        });

        setSuggestions(options.filter(o => o.title.toLowerCase().includes(q)));
    };

    const handleSelectSuggestion = async (item) => {
        let contentToInsert = "";

        if (item.type === 'file') {
            // Need to load file content? 
            // Text files: read blob. 
            // PDF: Use pdf service? (Too complex for now without import)
            // Audio: Can't paste audio.
            if (item.data.type.includes('text') || item.data.name.endsWith('.md')) {
                const text = await item.data.blob.text();
                contentToInsert = text;
            } else {
                contentToInsert = "[Binary File: " + item.title + "]";
            }
        } else {
            contentToInsert = item.content;
        }

        // Truncate if too long? AI can handle ~100k tokens. Let's cap at 5000 chars for UI sanity.
        if (contentToInsert.length > 2000) contentToInsert = contentToInsert.slice(0, 2000) + "...(truncated)";

        const formatted = `\n> 📎 **${item.title}**\n> ${contentToInsert.replace(/\n/g, '\n> ')}\n\n`;

        // Replace @query with content
        const before = input.slice(0, input.lastIndexOf('@', cursorPosition));
        const after = input.slice(cursorPosition);

        setInput(before + formatted + after);
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages, isChatOpen]);

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto'; // Reset to calculate new height
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 192) + 'px'; // Cap at max-h-48 (12rem * 16 = 192px)
        }
    }, [input]);

    const handleSend = async () => {
        if (!input.trim() || isSending) return;

        const userMsg = input.trim();
        setInput('');
        addChatMessage('user', userMsg);
        setIsSending(true);

        try {
            // Check API Key
            if (!settings.apiKey) {
                setTimeout(() => {
                    addChatMessage('assistant', "Please configure your API Key in Settings to chat with me.");
                    setIsSending(false);
                }, 1000);
                return;
            }

            // Construct history for context
            const history = chatMessages.slice(-10).map(m => ({
                role: m.role,
                content: m.content
            }));
            history.push({ role: 'user', content: userMsg });

            // Add placeholder for AI response
            addChatMessage('assistant', '');

            let fullResponse = "";
            await streamChatMessage(history, settings, (delta) => {
                fullResponse += delta;
                updateLastChatMessage(fullResponse);
                scrollToBottom();
            });

        } catch (error) {
            updateLastChatMessage(`Error: ${error.message}`);
        } finally {
            setIsSending(false);
        }
    };

    // Resizable Logic
    const [width, setWidth] = useState(400); // Default width
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef(null);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 300 && newWidth < 800) {
                setWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    return (
        <div
            ref={sidebarRef}
            style={{ width: isChatOpen ? width : 0 }}
            className={`border-l border-slate-200 bg-white shadow-xl transition-all duration-300 flex flex-col h-full shrink-0 relative ${isChatOpen ? 'translate-x-0' : 'translate-x-full border-l-0 overflow-hidden opacity-0'
                }`}
        >
            {/* Resize Handle */}
            <div
                onMouseDown={(e) => {
                    setIsResizing(true);
                    e.stopPropagation();
                }}
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-500/20 z-50 transition-colors"
                title="Drag to resize"
            />

            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 bg-slate-50/50 backdrop-blur-sm">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                    <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                        <Bot size={18} />
                    </div>
                    <span>AI Tutor</span>
                </div>
                <button
                    onClick={toggleChat}
                    className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-slate-200 text-slate-500' : 'bg-indigo-100 text-indigo-600'
                            }`}>
                            {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                        </div>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                            ? 'bg-slate-900 text-white rounded-br-none'
                            : 'bg-white border border-slate-200 text-slate-700 shadow-sm rounded-bl-none'
                            }`}>
                            {/* Markdown Rendering */}
                            {msg.role === 'user' ? (
                                msg.content
                            ) : (
                                <div className="prose prose-sm max-w-none prose-slate">
                                    <ReactMarkdown
                                        components={{
                                            // Custom styling for elements if needed
                                            p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                            ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2" {...props} />,
                                            ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                                            li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                                            strong: ({ node, ...props }) => <strong className="font-bold text-slate-900" {...props} />,
                                            code: ({ node, inline, className, children, ...props }) => {
                                                return inline ?
                                                    <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono text-pink-600" {...props}>{children}</code> :
                                                    <code className="block bg-slate-900 text-slate-50 p-3 rounded-lg text-xs font-mono my-2 overflow-x-auto" {...props}>{children}</code>
                                            }
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isSending && chatMessages[chatMessages.length - 1].content === "" && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Bot size={14} />
                        </div>
                        <Loader2 size={16} className="animate-spin text-slate-400 mt-2" />
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-slate-100 relative">
                {/* Context Menu */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto animate-fade-in z-50">
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Reference Context
                        </div>
                        {suggestions.map((item, idx) => (
                            <button
                                key={idx}
                                onClick={() => handleSelectSuggestion(item)}
                                className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 transition-colors border-b border-slate-50 last:border-0"
                            >
                                <div className={`p-1.5 rounded-lg ${item.type === 'context' ? 'bg-purple-100 text-purple-600' :
                                    item.type === 'note' ? 'bg-blue-100 text-blue-600' :
                                        'bg-slate-100 text-slate-600'
                                    }`}>
                                    <item.icon size={16} />
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-slate-700 truncate">{item.title}</div>
                                    <div className="text-xs text-slate-400 truncate max-w-[200px]">
                                        {item.type.toUpperCase()}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                <div className="relative">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleInputChange}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                if (showSuggestions) {
                                    // Maybe select first? For now let's just close or send.
                                    // Better UX: Enter selects first suggestion if open.
                                    if (suggestions.length > 0) {
                                        e.preventDefault();
                                        handleSelectSuggestion(suggestions[0]);
                                        return;
                                    }
                                }
                                e.preventDefault();
                                handleSend();
                            }
                            if (e.key === 'Escape') setShowSuggestions(false);
                        }}
                        placeholder="Ask anything... (Type '@' to add context)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none min-h-[56px] max-h-48 overflow-y-auto"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isSending}
                        className="absolute right-2 top-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-indigo-200"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatSidebar;
