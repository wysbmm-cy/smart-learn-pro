import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Send, Bot, User, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { streamChatMessage } from '../services/ai';

const ChatSidebar = () => {
    const { isChatOpen, toggleChat, chatMessages, addChatMessage, updateLastChatMessage, settings } = useApp();
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages, isChatOpen]);

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

    // if (!isChatOpen) return null; // Remove this to allow animation out

    return (
        <div
            className={`border-l border-slate-200 bg-white shadow-xl transition-all duration-300 flex flex-col h-full shrink-0 ${isChatOpen ? 'w-96 translate-x-0' : 'w-0 translate-x-full border-l-0 overflow-hidden opacity-0'
                }`}
        >
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
            <div className="p-4 bg-white border-t border-slate-100">
                <div className="relative">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Ask anything..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none h-14"
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
