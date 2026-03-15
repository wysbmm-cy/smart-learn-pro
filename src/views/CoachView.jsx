import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Volume2, User, Bot, Loader2, Play, Settings, Trash2, History, X, Calendar } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { transcribeAudio, sendChatMessage, synthesizeSpeech } from '../services/ai';
import { saveChatSession, getChatSessions, deleteChatSession } from '../services/db';
import toast from 'react-hot-toast';

const personas = [
    { id: 'ielts', name: '雅思考官 (IELTS)', prompt: "You are a strict but fair IELTS examiner. Correct my grammar and vocabulary usage. Maintain a formal yet encouraging tone. Ask follow-up questions." },
    { id: 'friend', name: '随和的朋友 (Casual)', prompt: "You are a casual, friendly English speaker. Chat about daily life, hobbies, and interests. Use slang and idioms occasionally. Don't be too strict on grammar." },
    { id: 'business', name: '商务导师 (Business)', prompt: "You are a professional business English thinking partner. Focus on professional terminology, negotiation skills, and workplace etiquette." }
];

const CoachView = () => {
    const { settings } = useApp();
    const [selectedPersona, setSelectedPersona] = useState(personas[0]);
    const [status, setStatus] = useState('idle'); // idle, recording, processing, speaking
    const [messages, setMessages] = useState([]); // { role, content, audioUrl, audioBlob }

    // History State
    const [historyOpen, setHistoryOpen] = useState(false);
    const [sessions, setSessions] = useState([]);
    const [currentSessionId, setCurrentSessionId] = useState(null);

    // Agent Topic State
    const [agentTopic, setAgentTopic] = useState(null);

    // State for analysis modal/result
    const [analysisResult, setAnalysisResult] = useState(null);

    // Audio Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioPlayerRef = useRef(new Audio());

    // Load history list on mount & check agent topic
    useEffect(() => {
        loadHistoryList();
        // Check for agent-set topic
        try {
            const stored = localStorage.getItem('agent_coach_topic');
            if (stored) {
                const topicData = JSON.parse(stored);
                setAgentTopic(topicData);
                // Create a custom persona from agent topic
                const agentPersona = {
                    id: 'agent_custom',
                    name: `🎯 ${topicData.topic}`,
                    prompt: topicData.systemPrompt || `You are a friendly English tutor. The topic is: ${topicData.topic}. ${topicData.scenario ? 'Scenario: ' + topicData.scenario + '. ' : ''}Help the student practice speaking about this topic. ${topicData.vocabulary?.length ? 'Encourage using these words: ' + topicData.vocabulary.join(', ') + '.' : ''}`
                };
                setSelectedPersona(agentPersona);
                // Clear after reading so it doesn't persist across sessions
                localStorage.removeItem('agent_coach_topic');
            }
        } catch (e) { console.error("Agent topic parse error:", e); }
    }, []);

    // Auto-save when messages change (debounce could be better, but simple for now)
    useEffect(() => {
        if (messages.length > 0) {
            saveCurrentSession();
        }
    }, [messages]);

    const loadHistoryList = async () => {
        try {
            const list = await getChatSessions();
            setSessions(list);
        } catch (e) {
            console.error("Failed to load history", e);
        }
    };

    const saveCurrentSession = async () => {
        const session = {
            id: currentSessionId || crypto.randomUUID(),
            title: messages.length > 0 ? messages[0].content.slice(0, 30) + "..." : "Empty Session",
            personaId: selectedPersona.id,
            messages: messages, // blobs are stored directly
            updatedAt: Date.now()
        };

        if (!currentSessionId) setCurrentSessionId(session.id);

        await saveChatSession(session);
        loadHistoryList();
    };

    const loadSession = (session) => {
        // Hydrate blobs to URLs
        const hydratedMessages = session.messages.map(msg => ({
            ...msg,
            audioUrl: msg.audioBlob ? URL.createObjectURL(msg.audioBlob) : null
        }));

        setMessages(hydratedMessages);
        setCurrentSessionId(session.id);
        setSelectedPersona(personas.find(p => p.id === session.personaId) || personas[0]);
        setHistoryOpen(false);
    };

    const handleDeleteSession = async (e, id) => {
        e.stopPropagation();
        if (window.confirm("Delete this session?")) {
            await deleteChatSession(id);
            if (currentSessionId === id) {
                setMessages([]);
                setCurrentSessionId(null);
            }
            loadHistoryList();
        }
    };

    const playAudio = (url) => {
        if (!url) return;
        audioPlayerRef.current.src = url;
        audioPlayerRef.current.play();
    };

    const handleClear = () => {
        if (window.confirm("确定要清空当前对话吗？(已保存的历史记录不会被删除)")) {
            setMessages([]);
            setCurrentSessionId(null);
            setStatus('idle');
        }
    };

    const handleAnalyze = async (text) => {
        setStatus('processing');
        try {
            const prompt = `Please analyze the following English sentence spoken by a student. 
            
            Sentence: "${text}"
            
            Please provide feedback in the following format (Markdown):
            1. **Grammar & Phrasing**: Correct any mistakes and suggest a more natural version.
            2. **Pronunciation Tips**: List difficult words in this sentence with their IPA phonetic symbols and tips on how to pronounce them correctly (e.g. linking sounds, silent letters).
            
            Keep the explanation in Chinese.`;

            const feedback = await sendChatMessage([
                { role: 'system', content: "You are a helpful English teacher." },
                { role: 'user', content: prompt }
            ], settings);

            setAnalysisResult({ target: text, feedback });
        } catch (e) {
            toast.error("分析失败: " + e.message);
        } finally {
            setStatus('idle');
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = handleRecordingStop;

            mediaRecorder.start();
            setStatus('recording');
        } catch (err) {
            console.error("Mic Error:", err);
            toast.error("无法访问麦克风，请检查权限。");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && status === 'recording') {
            mediaRecorderRef.current.stop();
            // Stop tracks to release mic
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    const handleRecordingStop = async () => {
        setStatus('processing');
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const userAudioUrl = URL.createObjectURL(audioBlob); // Create URL for playback

        try {
            // 1. Transcribe (STT)
            const transcription = await transcribeAudio(new File([audioBlob], "input.webm", { type: 'audio/webm' }), settings);
            if (!transcription || !transcription.trim()) {
                setStatus('idle');
                return;
            }

            // Msg with Audio Blob for persistence
            const newMessages = [...messages, {
                role: 'user',
                content: transcription,
                audioUrl: userAudioUrl,
                audioBlob: audioBlob
            }];
            setMessages(newMessages);

            // 2. Chat (LLM)
            const aiResponseText = await sendChatMessage([
                { role: 'system', content: selectedPersona.prompt },
                ...newMessages.map(m => ({ role: m.role, content: m.content })) // Strip blobs for API
            ], settings);

            // 3. Speak (TTS)
            const audioData = await synthesizeSpeech(aiResponseText, settings);
            const aiAudioUrl = URL.createObjectURL(audioData);

            const updatedMessages = [...newMessages, {
                role: 'assistant',
                content: aiResponseText,
                audioUrl: aiAudioUrl,
                audioBlob: audioData
            }];
            setMessages(updatedMessages);

            // Auto-play AI response
            audioPlayerRef.current.src = aiAudioUrl;
            audioPlayerRef.current.onended = () => setStatus('idle');
            setStatus('speaking');
            audioPlayerRef.current.play();

        } catch (error) {
            console.error("Coach Loop Error:", error);

            let errMsg = error.message;
            if (errMsg.includes("400")) {
                errMsg += "\n\n(提示: 请检查设置中的 TTS Model Name 是否正确。)";
            }

            toast.error("对话处理出错: " + errMsg);
            setStatus('idle');
        }
    };

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto animate-fade-in relative text-phy-text">

            {/* History Sidebar */}
            {historyOpen && (
                <>
                    <div className="absolute inset-0 z-30 bg-black/40 backdrop-blur-md" onClick={() => setHistoryOpen(false)} />
                    <div className="absolute top-0 right-0 bottom-0 w-80 glass-sidebar border-l border-phy-border z-40 p-4 shadow-2xl animate-slide-in-right flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold text-phy-text flex items-center gap-2">
                                <History size={20} className="text-phy-accent" /> 历史记录
                            </h2>
                            <button onClick={() => setHistoryOpen(false)} className="p-1 hover:bg-phy-glassHover rounded-full transition-colors text-phy-muted">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                            {sessions.length === 0 && (
                                <p className="text-phy-muted text-center mt-10">暂无历史记录</p>
                            )}
                            {sessions.map(s => (
                                <div
                                    key={s.id}
                                    className={`p-3 rounded-2xl border cursor-pointer transition-colors group ${currentSessionId === s.id ? 'bg-phy-accentGlass border-phy-accent/30' : 'bg-phy-glass border-phy-border hover:border-phy-borderHover hover:bg-phy-glassHover'}`}
                                    onClick={() => loadSession(s)}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-xs text-phy-accent font-medium px-2 py-0.5 bg-phy-accentGlass rounded-full">
                                            {personas.find(p => p.id === s.personaId)?.name || 'Unknown'}
                                        </span>
                                        <button
                                            onClick={(e) => handleDeleteSession(e, s.id)}
                                            className="text-phy-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <h4 className="text-phy-text text-sm font-medium line-clamp-2 leading-snug mb-2">
                                        {s.title}
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs text-phy-muted">
                                        <Calendar size={12} />
                                        {new Date(s.updatedAt).toLocaleString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Header: Persona Selector */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4 md:mb-6">
                <div className="flex flex-col">
                    <h1 className="text-2xl md:text-3xl font-black text-phy-text tracking-tight">
                        AI 口语教练
                    </h1>
                    <p className="text-phy-muted text-xs md:text-sm font-medium">Real-time Voice Interaction</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => setHistoryOpen(true)}
                        className="p-2 text-phy-muted hover:text-phy-accent hover:bg-phy-glassHover rounded-full transition-colors border border-transparent hover:border-phy-border"
                        title="历史记录"
                    >
                        <History size={20} />
                    </button>
                    <button
                        onClick={handleClear}
                        className="p-2 text-phy-muted hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors border border-transparent hover:border-red-500/20"
                        title="清空当前对话"
                    >
                        <Trash2 size={20} />
                    </button>
                    <select
                        value={selectedPersona.id}
                        onChange={(e) => {
                            const allPersonas = agentTopic ? [...personas, { id: 'agent_custom', name: `🎯 ${agentTopic.topic}`, prompt: selectedPersona.id === 'agent_custom' ? selectedPersona.prompt : '' }] : personas;
                            const found = allPersonas.find(p => p.id === e.target.value);
                            if (found) setSelectedPersona(found);
                        }}
                        className="flex-1 sm:flex-none bg-phy-glass text-phy-text border border-phy-border rounded-full px-4 py-2 outline-none focus:border-phy-accent transition-colors shadow-sm font-bold text-sm"
                    >
                        {agentTopic && (
                            <option value="agent_custom">🎯 {agentTopic.topic}</option>
                        )}
                        {personas.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Main Interaction Area */}
            <div className="flex-1 glass-panel rounded-3xl border border-phy-border overflow-hidden flex flex-col relative shadow-sm">

                {/* Analysis Result Overlay */}
                {analysisResult && (
                    <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                        <div className="glass-modal border border-phy-border p-6 rounded-3xl max-w-lg w-full shadow-2xl">
                            <h3 className="text-xl font-bold text-phy-accent mb-3 flex items-center gap-2">
                                <Sparkles size={20} />
                                口语点评
                            </h3>
                            <div className="bg-phy-glassHeavy border border-phy-border p-4 rounded-2xl text-phy-text text-sm mb-5 italic shadow-inner">
                                "{analysisResult.target}"
                            </div>
                            <div className="prose prose-sm prose-phy max-h-60 overflow-y-auto mb-6 leading-relaxed text-phy-text pr-2 custom-scrollbar">
                                <p className="whitespace-pre-wrap">{analysisResult.feedback}</p>
                            </div>
                            <button
                                onClick={() => setAnalysisResult(null)}
                                className="w-full py-3.5 bg-phy-accent hover:opacity-90 text-white rounded-2xl font-bold transition-all active:scale-95 shadow-lg shadow-phy-accent/20"
                            >
                                明白了
                            </button>
                        </div>
                    </div>
                )}

                {/* Visualizer / Status Indicator */}
                <div className="h-44 md:h-64 flex flex-col items-center justify-center border-b border-phy-border bg-phy-glass">
                    <div className={`w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center transition-all duration-500 shadow-sm ${status === 'recording' ? 'bg-red-500/20 ring-4 ring-red-500/30 scale-110' :
                        status === 'speaking' ? 'bg-phy-accentGlass ring-4 ring-phy-accent/30 scale-110 animate-pulse' :
                            status === 'processing' ? 'bg-blue-500/10 ring-4 ring-blue-500/20 animate-spin-slow' :
                                'bg-phy-glass border border-phy-border'
                        }`}>
                        {status === 'recording' && <Mic size={40} className="text-red-500 animate-pulse" />}
                        {status === 'speaking' && <Volume2 size={40} className="text-phy-accent animate-bounce" />}
                        {status === 'processing' && <Loader2 size={40} className="text-blue-500 animate-spin" />}
                        {status === 'idle' && <Bot size={40} className="text-phy-muted" />}
                    </div>
                    <p className="mt-4 text-base font-bold text-phy-text tracking-wide">
                        {status === 'recording' && "正在聆听..."}
                        {status === 'speaking' && "正在回应..."}
                        {status === 'processing' && "思考中..."}
                        {status === 'idle' && "准备就绪"}
                    </p>
                </div>

                {/* Conversation Scroll */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-phy-bg/30">
                    {messages.length === 0 && (
                        <div className="text-center text-phy-muted mt-10">
                            {agentTopic && selectedPersona.id === 'agent_custom' ? (
                                <div className="max-w-sm mx-auto">
                                    <div className="bg-phy-accentGlass border border-phy-accent/20 rounded-2xl p-5 mb-5 text-left shadow-sm">
                                        <p className="text-phy-accent font-bold text-sm mb-2 flex items-center gap-1"><Sparkles size={16} /> Agent 推荐话题</p>
                                        <p className="text-phy-text text-base font-bold leading-tight">{agentTopic.topic}</p>
                                        {agentTopic.scenario && (
                                            <p className="text-phy-muted text-sm mt-2 font-medium">场景: {agentTopic.scenario}</p>
                                        )}
                                        {agentTopic.vocabulary?.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-3">
                                                {agentTopic.vocabulary.map((v, i) => (
                                                    <span key={i} className="px-2 py-0.5 bg-phy-glass border border-phy-border text-phy-text font-mono rounded text-xs">{v}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-sm font-bold">点击下方麦克风，开始练习口语！</p>
                                </div>
                            ) : (
                                <>
                                    <p className="font-bold">点击下方麦克风开始对话</p>
                                    <p className="text-xs mt-2 opacity-60">请确保已在设置中配置 Audio API Key</p>
                                </>
                            )}
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm border ${msg.role === 'user' ? 'bg-phy-glass text-phy-text border-phy-border' : 'bg-phy-accent text-white border-phy-accent/50'
                                }`}>
                                {msg.role === 'user' ? <User size={18} /> : <Bot size={18} />}
                            </div>
                            <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`px-5 py-3.5 rounded-3xl leading-relaxed shadow-sm ${msg.role === 'user'
                                    ? 'bg-phy-glass border border-phy-border text-phy-text rounded-tr-none'
                                    : 'bg-phy-accentGlass text-phy-text border border-phy-accent/20 rounded-tl-none'
                                    }`}>
                                    {msg.content}
                                </div>
                                <div className="flex gap-2">
                                    {msg.audioUrl && (
                                        <button
                                            onClick={() => playAudio(msg.audioUrl)}
                                            className="text-xs flex items-center gap-1 text-phy-muted hover:text-phy-accent hover:border-phy-accent font-medium transition-colors bg-phy-glass border border-phy-border px-3 py-1.5 rounded-full"
                                        >
                                            <Play size={12} /> {msg.role === 'user' ? '回听我的' : '重播'}
                                        </button>
                                    )}
                                    {msg.role === 'user' && (
                                        <button
                                            onClick={() => handleAnalyze(msg.content)}
                                            className="text-xs flex items-center gap-1 text-phy-muted hover:text-phy-accent hover:border-phy-accent font-medium transition-colors bg-phy-glass border border-phy-border px-3 py-1.5 rounded-full"
                                        >
                                            <Sparkles size={12} /> AI 点评
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Controls */}
                <div className="p-4 md:p-6 flex justify-center items-center gap-6 bg-phy-glassHeavy backdrop-blur border-t border-phy-border">
                    {status === 'recording' ? (
                        <button
                            onClick={stopRecording}
                            className="w-16 h-16 md:w-20 md:h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
                        >
                            <Square size={24} className="text-white fill-current" />
                        </button>
                    ) : (
                        <button
                            onClick={startRecording}
                            disabled={status !== 'idle'}
                            className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center shadow-lg transition-all ${status === 'idle'
                                ? 'bg-phy-accent hover:opacity-90 shadow-phy-accent/30 hover:scale-105 active:scale-95 text-white'
                                : 'bg-phy-glass border border-phy-border cursor-not-allowed text-phy-muted'
                                }`}
                        >
                            <Mic size={28} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CoachView;
