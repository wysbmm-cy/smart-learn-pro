import React, { useState, useEffect, useRef } from 'react';
import { sendChat } from '../services/ai';
import { useApp } from '../context/AppContext';
import { X, Send, Sparkles, AlertCircle, Copy, Check, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

const PolishChatModal = ({ selectedText, onClose, onApply }) => {
    const { settings } = useApp();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Initial Analysis Trigger
    useEffect(() => {
        if (selectedText) {
            initChat();
        }
    }, [selectedText]);

    const initChat = async () => {
        const initialPrompt = `
        Role: Expert English Writing Coach.
        Task: Analyze the user's selected sentence.
        Capabilities:
        1. Explain any grammar/style issues concisely.
        2. Provide 3 improved versions (Formal, Casual, Creative) if applicable.
        3. Be ready to rewrite based on user feedback.
        
        Selected Sentence: "${selectedText}"
        
        Respond in markdown. Start with the analysis immediately.
        `;

        const initialMsg = { role: 'system', content: initialPrompt };
        const userMsg = { role: 'user', content: `Analyze this: "${selectedText}"` };

        setMessages([userMsg]); // Show user what they selected basically
        setIsLoading(true);

        try {
            const reply = await sendChat([initialMsg, userMsg], settings, false);
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (e) {
            toast.error("AI 连接失败: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const newMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, newMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // Reconstruct full history for context
            // Note: System prompt is implicit in the first turn usually, but for stateless API we need to prepend it
            // or just rely on conversation flow. Let's prepend the system prompt again for safety.
            const initialPrompt = `Role: English Writing Coach. Context: Polishing sentence "${selectedText}".`;
            const payloadHash = [{ role: 'system', content: initialPrompt }, ...messages, newMsg];

            const reply = await sendChat(payloadHash, settings, false);
            setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
        } catch (e) {
            toast.error("发送失败: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success("已复制");
    };

    // Auto scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/50 animate-in fade-in duration-200">
            <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-2xl flex flex-col h-[600px] overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-950/50">
                    <h3 className="font-bold text-white text-lg flex items-center gap-2">
                        <Sparkles className="text-purple-500" /> 单句精修 (Sentence Polish)
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={20} /></button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-slate-900/50">
                    {/* Source Text Card */}
                    <div className="bg-slate-800/50 p-4 rounded-xl border border-white/5 mb-6">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Selected Text</div>
                        <p className="text-slate-200 font-serif italic text-lg leading-relaxed">"{selectedText}"</p>
                    </div>

                    {messages.slice(1).map((msg, idx) => (
                        <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-600' : 'bg-purple-600'}`}>
                                {msg.role === 'user' ? <MessageSquare size={14} className="text-white" /> : <Sparkles size={14} className="text-white" />}
                            </div>
                            <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                    : 'bg-slate-800 text-slate-200 rounded-tl-none border border-white/5'
                                }`}>
                                <div className="markdown-body whitespace-pre-wrap font-sans">
                                    {msg.content}
                                </div>
                                {msg.role === 'assistant' && (
                                    <div className="mt-3 flex gap-2 justify-end border-t border-white/5 pt-2">
                                        <button
                                            onClick={() => copyToClipboard(msg.content)}
                                            className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                                        >
                                            <Copy size={12} /> Copy
                                        </button>
                                        {/* Parse code blocks or just copy full text? For now full text */}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                                <Sparkles size={14} className="text-white animate-pulse" />
                            </div>
                            <div className="bg-slate-800 rounded-2xl rounded-tl-none p-4 border border-white/5 flex items-center gap-2 text-slate-400 text-sm">
                                <Loader2 size={14} className="animate-spin" /> Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-slate-950/50 border-t border-white/10">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="觉得不满意？告诉 AI 怎么改 (如: '更商务一点', '换个词')"
                            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none shadow-inner"
                            rows="2"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="absolute right-2 bottom-2 p-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white rounded-lg transition-all shadow-lg"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    <div className="text-center mt-2 text-[10px] text-slate-500">
                        Enter 发送 • Shift + Enter 换行
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PolishChatModal;
