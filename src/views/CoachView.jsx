import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Volume2, User, Bot, Loader2, Play, Settings } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { transcribeAudio, sendChatMessage, synthesizeSpeech } from '../services/ai';

const personas = [
    { id: 'ielts', name: '雅思考官 (IELTS)', prompt: "You are a strict but fair IELTS examiner. Correct my grammar and vocabulary usage. Maintain a formal yet encouraging tone. Ask follow-up questions." },
    { id: 'friend', name: '随和的朋友 (Casual)', prompt: "You are a casual, friendly English speaker. Chat about daily life, hobbies, and interests. Use slang and idioms occasionally. Don't be too strict on grammar." },
    { id: 'business', name: '商务导师 (Business)', prompt: "You are a professional business English thinking partner. Focus on professional terminology, negotiation skills, and workplace etiquette." }
];

const CoachView = () => {
    const { settings } = useApp();
    const [selectedPersona, setSelectedPersona] = useState(personas[0]);
    const [status, setStatus] = useState('idle'); // idle, recording, processing, speaking
    const [messages, setMessages] = useState([]); // { role: 'user'|'assistant', text: string }

    // State for analysis modal/result
    const [analysisResult, setAnalysisResult] = useState(null);

    // Audio Refs
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const audioPlayerRef = useRef(new Audio());

    const playAudio = (url) => {
        if (!url) return;
        audioPlayerRef.current.src = url;
        audioPlayerRef.current.play();
    };

    const handleAnalyze = async (text) => {
        setStatus('processing');
        try {
            const prompt = `Please analyze the following English sentence spoken by a student. Point out any grammar mistakes or unnatural phrasing, and suggest a better version.
            
            Sentence: "${text}"
            
            Keep the feedback concise and encouraging. usage Chinese for explanation.`;

            const feedback = await sendChatMessage([
                { role: 'system', content: "You are a helpful English teacher." },
                { role: 'user', content: prompt }
            ], settings);

            setAnalysisResult({ target: text, feedback });
        } catch (e) {
            alert("Analysis failed: " + e.message);
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
            alert("无法访问麦克风，请检查权限。");
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

            // Msg with Audio
            const newMessages = [...messages, {
                role: 'user',
                content: transcription,
                audioUrl: userAudioUrl
            }];
            setMessages(newMessages);

            // 2. Chat (LLM)
            const aiResponseText = await sendChatMessage([
                { role: 'system', content: selectedPersona.prompt },
                ...newMessages
            ], settings);

            // 3. Speak (TTS)
            const audioData = await synthesizeSpeech(aiResponseText, settings);
            const aiAudioUrl = URL.createObjectURL(audioData);

            const updatedMessages = [...newMessages, {
                role: 'assistant',
                content: aiResponseText,
                audioUrl: aiAudioUrl
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
                errMsg += "\n\n(提示: 请检查设置中的 TTS Model Name 是否正确。SiliconFlow/其他服务商通常不支持 'tts-1'，请尝试 'CosyVoice-300M-SFT' 等有效模型名)";
            }

            alert("对话处理出错: " + errMsg);
            setStatus('idle');
        }
    };

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto animate-fade-in relative">

            {/* Header: Persona Selector */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex flex-col">
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">
                        AI 口语教练
                    </h1>
                    <p className="text-slate-400 text-sm">Real-time Voice Interaction</p>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm hidden sm:inline">当前模式:</span>
                    <select
                        value={selectedPersona.id}
                        onChange={(e) => setSelectedPersona(personas.find(p => p.id === e.target.value))}
                        className="bg-slate-800/50 text-white border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-violet-500 transition-colors"
                    >
                        {personas.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Main Interaction Area */}
            <div className="flex-1 bg-slate-900/40 backdrop-blur-md rounded-3xl border border-white/5 overflow-hidden flex flex-col relative">

                {/* Analysis Result Overlay */}
                {analysisResult && (
                    <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                        <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-lg w-full shadow-2xl">
                            <h3 className="text-xl font-bold text-violet-400 mb-2">口语点评</h3>
                            <div className="bg-slate-800/50 p-3 rounded-lg text-slate-300 text-sm mb-4 italic">
                                "{analysisResult.target}"
                            </div>
                            <div className="prose prose-invert prose-sm max-h-60 overflow-y-auto mb-6 leading-relaxed">
                                <p className="whitespace-pre-wrap">{analysisResult.feedback}</p>
                            </div>
                            <button
                                onClick={() => setAnalysisResult(null)}
                                className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold transition-colors"
                            >
                                明白了
                            </button>
                        </div>
                    </div>
                )}

                {/* Visualizer / Status Indicator */}
                <div className="h-64 flex flex-col items-center justify-center border-b border-white/5 bg-gradient-to-b from-slate-900/0 to-slate-900/50">
                    <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${status === 'recording' ? 'bg-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.3)] scale-110' :
                        status === 'speaking' ? 'bg-violet-500/20 shadow-[0_0_50px_rgba(139,92,246,0.3)] scale-110 animate-pulse' :
                            status === 'processing' ? 'bg-blue-500/20 animate-spin-slow' :
                                'bg-slate-800/50'
                        }`}>
                        {status === 'recording' && <Mic size={48} className="text-red-400 animate-pulse" />}
                        {status === 'speaking' && <Volume2 size={48} className="text-violet-400 animate-bounce" />}
                        {status === 'processing' && <Loader2 size={48} className="text-blue-400 animate-spin" />}
                        {status === 'idle' && <Bot size={48} className="text-slate-500" />}
                    </div>
                    <p className="mt-6 text-lg font-medium text-slate-300 tracking-wide">
                        {status === 'recording' && "正在聆听..."}
                        {status === 'speaking' && "正在回应..."}
                        {status === 'processing' && "思考中..."}
                        {status === 'idle' && "准备就绪"}
                    </p>
                </div>

                {/* Conversation Scroll */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {messages.length === 0 && (
                        <div className="text-center text-slate-500 mt-10">
                            <p>点击下方麦克风开始对话</p>
                            <p className="text-xs mt-2 opacity-60">请确保已在设置中配置 Audio API Key</p>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-700 text-slate-300' : 'bg-violet-600 text-white'
                                }`}>
                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </div>
                            <div className={`flex flex-col gap-2 max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`px-4 py-3 rounded-2xl leading-relaxed ${msg.role === 'user'
                                    ? 'bg-slate-800 text-slate-200 rounded-tr-none'
                                    : 'bg-indigo-900/30 text-indigo-100 border border-indigo-500/20 rounded-tl-none'
                                    }`}>
                                    {msg.content}
                                </div>
                                <div className="flex gap-2">
                                    {msg.audioUrl && (
                                        <button
                                            onClick={() => playAudio(msg.audioUrl)}
                                            className="text-xs flex items-center gap-1 text-slate-400 hover:text-violet-400 transition-colors bg-slate-900/50 px-2 py-1 rounded-md"
                                        >
                                            <Play size={12} /> {msg.role === 'user' ? '回听我的' : '重播'}
                                        </button>
                                    )}
                                    {msg.role === 'user' && (
                                        <button
                                            onClick={() => handleAnalyze(msg.content)}
                                            className="text-xs flex items-center gap-1 text-slate-400 hover:text-pink-400 transition-colors bg-slate-900/50 px-2 py-1 rounded-md"
                                        >
                                            <Settings size={12} /> AI 点评
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Controls */}
                <div className="p-6 flex justify-center items-center gap-6 bg-slate-950/30">
                    {status === 'recording' ? (
                        <button
                            onClick={stopRecording}
                            className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 transition-all hover:scale-105 active:scale-95"
                        >
                            <Square size={24} className="text-white fill-current" />
                        </button>
                    ) : (
                        <button
                            onClick={startRecording}
                            disabled={status !== 'idle'}
                            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all ${status === 'idle'
                                ? 'bg-gradient-to-br from-violet-600 to-indigo-600 hover:shadow-violet-500/30 hover:scale-105 active:scale-95 text-white'
                                : 'bg-slate-800 cursor-not-allowed opacity-50 text-slate-500'
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
