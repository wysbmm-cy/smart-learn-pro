import React, { useState, useEffect, useRef } from 'react';
import { sendChat } from '../services/ai';
import { useApp } from '../context/AppContext';
import { X, Send, Sparkles, Copy, MessageSquare, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const PolishChatModal = ({ selectedText, onClose }) => {
    const { settings } = useApp();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (selectedText) {
            initChat();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedText]);

    const initChat = async () => {
        const initialPrompt = `
Role: Expert English Writing Coach.
Task: Analyze the selected sentence and provide targeted rewrites.
Output:
1) Brief diagnosis.
2) 3 rewrite styles (formal / natural / concise).
3) Follow-up suggestions based on user requests.
Respond in Markdown.
`;
        const userMsg = { role: 'user', content: `请分析并改写这句话："${selectedText}"` };
        setMessages([userMsg]);
        setIsLoading(true);

        try {
            const reply = await sendChat(
                [{ role: 'system', content: initialPrompt }, userMsg],
                settings,
                false
            );
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
            const systemPrompt = `Role: English Writing Coach. Context sentence: "${selectedText}".`;
            const payload = [{ role: 'system', content: systemPrompt }, ...messages, newMsg];
            const reply = await sendChat(payload, settings, false);
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

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md bg-black/40 animate-in fade-in duration-200 text-phy-text">
            <div className="glass-modal rounded-3xl shadow-2xl border border-phy-border w-full max-w-2xl flex flex-col h-[600px] overflow-hidden">
                <div className="p-5 border-b border-phy-border flex justify-between items-center bg-phy-glassHeavy backdrop-blur">
                    <h3 className="font-bold text-phy-text text-lg flex items-center gap-2">
                        <Sparkles className="text-phy-accent" /> 单句精修
                    </h3>
                    <button onClick={onClose} className="text-phy-muted hover:text-phy-accent hover:bg-phy-glassHover p-1.5 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-phy-bg/30">
                    <div className="glass-panel p-5 rounded-2xl mb-6">
                        <div className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                            <MessageSquare size={14} /> 原句
                        </div>
                        <p className="text-phy-text font-serif italic text-lg leading-relaxed">"{selectedText}"</p>
                    </div>

                    {messages.slice(1).map((msg, idx) => (
                        <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${msg.role === 'user' ? 'bg-phy-glass border-phy-border text-phy-text' : 'bg-phy-accent border-phy-accent/50 box-border'}`}>
                                {msg.role === 'user' ? <MessageSquare size={16} /> : <Sparkles size={16} className="text-white" />}
                            </div>
                            <div className={`max-w-[85%] rounded-3xl p-5 text-sm leading-relaxed shadow-sm ${msg.role === 'user'
                                ? 'bg-phy-glass border border-phy-border text-phy-text rounded-tr-none'
                                : 'bg-phy-accentGlass text-phy-text rounded-tl-none border border-phy-accent/20'
                                }`}>
                                <div className="markdown-body prose-phy whitespace-pre-wrap font-sans">
                                    {msg.content}
                                </div>
                                {msg.role === 'assistant' && (
                                    <div className="mt-4 flex gap-2 justify-end border-t border-phy-border pt-3">
                                        <button
                                            onClick={() => copyToClipboard(msg.content)}
                                            className="text-xs flex items-center gap-1.5 font-medium text-phy-muted hover:text-phy-accent hover:border-phy-accent transition-colors bg-phy-glass border border-phy-border px-3 py-1.5 rounded-full"
                                        >
                                            <Copy size={12} /> 复制
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-4">
                            <div className="w-9 h-9 rounded-full bg-phy-accent flex items-center justify-center shrink-0 border border-phy-accent/50 shadow-sm">
                                <Sparkles size={16} className="text-white animate-pulse" />
                            </div>
                            <div className="bg-phy-accentGlass rounded-3xl rounded-tl-none p-5 border border-phy-accent/20 flex items-center gap-3 text-phy-text text-sm font-medium shadow-sm">
                                <Loader2 size={16} className="animate-spin text-phy-accent" /> 思考中...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-5 bg-phy-glassHeavy backdrop-blur border-t border-phy-border">
                    <div className="relative group">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="告诉 AI 你想怎么改，比如：更正式、更简洁、换一种表达"
                            className="w-full bg-phy-bg border border-phy-border group-hover:border-phy-borderHover rounded-2xl pl-5 pr-14 py-4 text-sm text-phy-text focus:outline-none focus:border-phy-accent transition-all resize-none shadow-sm"
                            rows="2"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="absolute right-3 bottom-3 p-2.5 bg-phy-accent hover:opacity-90 disabled:bg-phy-glassHover disabled:text-phy-muted disabled:border-transparent disabled:opacity-50 text-white rounded-xl transition-all shadow-md active:scale-95"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                    <div className="text-center mt-3 text-[10px] font-bold text-phy-muted">
                        Enter 发送，Shift + Enter 换行
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PolishChatModal;
