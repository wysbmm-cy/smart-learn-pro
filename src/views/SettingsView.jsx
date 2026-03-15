import React, { useState } from 'react';
import { Settings, Server, Wifi, Box, CheckCircle, X, Check, Save, Mic, Volume2, Download, Database, Palette, Image as ImageIcon, Upload, Trash2, Clock, Plus, BookMarked, Hash } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { checkConnection, checkAudioConnection, checkTTSConnection, checkImageGenConnection } from '../services/ai';

// Navigation sections for quick jump
const sections = [
    { id: 'api', label: 'AI 连接', icon: Server },
    { id: 'audio', label: '语音识别', icon: Mic },
    { id: 'tts', label: '语音合成', icon: Volume2 },
    { id: 'image', label: '图像生成', icon: ImageIcon },
    { id: 'system', label: 'AI 人设', icon: Settings },
    { id: 'tools', label: '效率工具', icon: Clock },
    { id: 'modules', label: '分析模块', icon: Box },
    { id: 'styles', label: '漫画风格', icon: BookMarked },
    { id: 'drills', label: '智能练习', icon: Hash },
    { id: 'review', label: '复习设置', icon: Clock },
    { id: 'general', label: '通用设置', icon: Box },
    { id: 'appearance', label: '外观设置', icon: Palette },
];

const SettingsView = () => {
    const { settings, updateSetting, exportUserData, saveFile, deleteFile, addCustomStyle, removeCustomStyle, theme, setTheme } = useApp();
    const [connectionStatus, setConnectionStatus] = useState('idle');
    const [audioConnectionStatus, setAudioConnectionStatus] = useState('idle');
    const [ttsConnectionStatus, setTtsConnectionStatus] = useState('idle');
    const [imageGenConnectionStatus, setImageGenConnectionStatus] = useState('idle');

    // Custom Style Form
    const [newStyleName, setNewStyleName] = useState('');
    const [newStylePrompt, setNewStylePrompt] = useState('');

    const handleAddStyle = () => {
        if (!newStyleName.trim() || !newStylePrompt.trim()) return;
        addCustomStyle({
            id: Date.now().toString(),
            name: newStyleName.trim(),
            prompt: newStylePrompt.trim()
        });
        setNewStyleName('');
        setNewStylePrompt('');
    };

    const handleTest = async () => {
        if (!settings.apiKey) return;
        setConnectionStatus('testing');
        try {
            await checkConnection(settings);
            setConnectionStatus('success');
            setTimeout(() => setConnectionStatus('idle'), 3000);
        } catch (e) {
            setConnectionStatus('error');
            setTimeout(() => setConnectionStatus('idle'), 3000);
        }
    };

    const handleAudioTest = async () => {
        setAudioConnectionStatus('testing');
        try {
            await checkAudioConnection(settings);
            setAudioConnectionStatus('success');
            setTimeout(() => setAudioConnectionStatus('idle'), 3000);
        } catch (e) {
            console.error(e);
            setAudioConnectionStatus('error');
            setTimeout(() => setAudioConnectionStatus('idle'), 3000);
        }
    };

    const handleTTSTest = async () => {
        setTtsConnectionStatus('testing');
        try {
            await checkTTSConnection(settings);
            setTtsConnectionStatus('success');
            // Visual success only
            setTimeout(() => setTtsConnectionStatus('idle'), 3000);
        } catch (e) {
            console.error(e);
            setTtsConnectionStatus('error');
            alert("TTS Test Failed: " + e.message);
            setTimeout(() => setTtsConnectionStatus('idle'), 3000);
        }
    };

    const handleImageGenTest = async () => {
        setImageGenConnectionStatus('testing');
        try {
            await checkImageGenConnection(settings);
            setImageGenConnectionStatus('success');
            setTimeout(() => setImageGenConnectionStatus('idle'), 3000);
        } catch (e) {
            console.error(e);
            setImageGenConnectionStatus('error');
            alert("生图 API 测试失败: " + e.message);
            setTimeout(() => setImageGenConnectionStatus('idle'), 3000);
        }
    };

    const Toggle = ({ title, checked, onChange }) => (
        <div
            className={`cursor-pointer p-5 rounded-2xl border transition-all duration-200 flex items-center justify-between ${checked
                ? 'bg-blue-50/50 border-blue-200 shadow-sm'
                : 'bg-phy-glass border-phy-border hover:bg-phy-bg'
                }`}
            onClick={() => onChange(!checked)}
        >
            <span className={`font-semibold text-sm ${checked ? 'text-blue-700' : 'text-phy-muted'}`}>{title}</span>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${checked ? 'bg-blue-600 text-white' : 'bg-phy-bg text-phy-muted'}`}>
                {checked && <Check size={12} strokeWidth={3} />}
            </div>
        </div>
    );

    const scrollToSection = (id) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <div className="flex gap-6 animate-fade-in pb-12">
            {/* Sidebar Navigation */}
            <div className="hidden lg:block w-48 shrink-0">
                <div className="sticky top-4 bg-phy-glass rounded-2xl border border-phy-border p-3 shadow-sm">
                    <div className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-3 px-2">快速跳转</div>
                    <nav className="space-y-1">
                        {sections.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => scrollToSection(id)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-phy-muted hover:bg-phy-bg hover:text-blue-600 rounded-lg transition-colors text-left"
                            >
                                <Icon size={14} className="text-phy-muted" />
                                {label}
                            </button>
                        ))}
                    </nav>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 max-w-4xl space-y-6">

                {/* API Card */}
                <div id="api" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Server size={20} />
                        </div>
                        <h3 className="text-lg">配置 AI 连接</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Base URL */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                API 接口地址 (URL)
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.apiBaseUrl}
                                    onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                />
                                <Wifi size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">Example: https://api.openai.com/v1</p>
                        </div>

                        {/* Model Name */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                模型名称 (Model)
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.modelName}
                                    onChange={(e) => updateSetting('modelName', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                />
                                <Box size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-blue-500 transition-colors" />
                            </div>
                        </div>

                        {/* API Key */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                API 密钥 (Key)
                            </label>
                            <div className="flex gap-3">
                                <input
                                    type="password"
                                    value={settings.apiKey}
                                    onChange={(e) => updateSetting('apiKey', e.target.value)}
                                    placeholder="sk-..."
                                    className="flex-1 bg-phy-bg border border-phy-border rounded-xl px-4 py-3.5 text-sm focus:bg-phy-glass focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono font-medium"
                                />
                                <button
                                    onClick={handleTest}
                                    disabled={connectionStatus === 'testing' || !settings.apiKey}
                                    className={`px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 min-w-[140px] justify-center ${connectionStatus === 'success' ? 'bg-green-500 text-white shadow-green-200 shadow-md' :
                                        connectionStatus === 'error' ? 'bg-red-500 text-white shadow-red-200 shadow-md' :
                                            'bg-phy-glassHeavy text-white hover:bg-phy-glassHeavy shadow-lg shadow-slate-200'
                                        }`}
                                >
                                    {connectionStatus === 'testing' ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : connectionStatus === 'success' ? (
                                        <><CheckCircle size={16} /> 已验证</>
                                    ) : connectionStatus === 'error' ? (
                                        <><X size={16} /> 连接失败</>
                                    ) : (
                                        '测试连通性'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Audio API Card */}
                <div id="audio" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                            <Mic size={20} />
                        </div>
                        <h3 className="text-lg">配置语音识别 API (Audio)</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Audio Base URL */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Audio Endpoint URL
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.audioApiBaseUrl}
                                    onChange={(e) => updateSetting('audioApiBaseUrl', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                    placeholder="Same as Chat API usually..."
                                />
                                <Wifi size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-pink-500 transition-colors" />
                            </div>
                        </div>

                        {/* Audio Model Name */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Audio Model Name
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.audioModelName}
                                    onChange={(e) => updateSetting('audioModelName', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                    placeholder="e.g. whisper-1 or FunAudioLLM/SenseVoiceSmall"
                                />
                                <Box size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-pink-500 transition-colors" />
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">
                                Use <b>whisper-1</b> for OpenAI, or <b>FunAudioLLM/SenseVoiceSmall</b> for SiliconFlow.
                            </p>
                        </div>

                        {/* Audio API Key */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Audio Security Key (Optional)
                            </label>
                            <div className="flex gap-3">
                                <input
                                    type="password"
                                    value={settings.audioApiKey}
                                    onChange={(e) => updateSetting('audioApiKey', e.target.value)}
                                    placeholder="Leave empty to use the main API Key above"
                                    className="flex-1 bg-phy-bg border border-phy-border rounded-xl px-4 py-3.5 text-sm focus:bg-phy-glass focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all font-mono font-medium"
                                />
                                <button
                                    onClick={handleAudioTest}
                                    disabled={audioConnectionStatus === 'testing'}
                                    className={`px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 min-w-[140px] justify-center ${audioConnectionStatus === 'success' ? 'bg-green-500 text-white shadow-green-200 shadow-md' :
                                        audioConnectionStatus === 'error' ? 'bg-red-500 text-white shadow-red-200 shadow-md' :
                                            'bg-pink-600 text-white hover:bg-pink-700 shadow-lg shadow-pink-200'
                                        }`}
                                >
                                    {audioConnectionStatus === 'testing' ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : audioConnectionStatus === 'success' ? (
                                        <><CheckCircle size={16} /> 已验证</>
                                    ) : audioConnectionStatus === 'error' ? (
                                        <><X size={16} /> 连接失败</>
                                    ) : (
                                        '测试音频连通'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>


                {/* TTS API Card (Output) */}
                <div id="tts" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                            <Volume2 size={20} />
                        </div>
                        <h3 className="text-lg">配置语音合成 API (TTS - Output)</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* TTS Base URL */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                TTS Endpoint URL
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.ttsApiBaseUrl || ''}
                                    onChange={(e) => updateSetting('ttsApiBaseUrl', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                    placeholder="Same as Chat API usually..."
                                />
                                <Wifi size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-purple-500 transition-colors" />
                            </div>
                        </div>

                        {/* TTS Model Name */}
                        <div>
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                TTS Model Name
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.ttsModelName || 'tts-1'}
                                    onChange={(e) => updateSetting('ttsModelName', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                />
                                <Box size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-purple-500 transition-colors" />
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">e.g. <b>tts-1</b> (OpenAI) or <b>cosyvoice-v1</b> (SiliconFlow)</p>
                        </div>

                        {/* TTS Voice */}
                        <div>
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Voice ID
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.ttsVoice || 'alloy'}
                                    onChange={(e) => updateSetting('ttsVoice', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                />
                                <Mic size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-purple-500 transition-colors" />
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">e.g. <b>alloy</b>, <b>echo</b>, or custom voice ID</p>
                        </div>

                        {/* TTS API Key */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                TTS Security Key (Optional)
                            </label>
                            <div className="flex gap-3">
                                <input
                                    type="password"
                                    value={settings.ttsApiKey || ''}
                                    onChange={(e) => updateSetting('ttsApiKey', e.target.value)}
                                    placeholder="Leave empty to use main API Key"
                                    className="flex-1 bg-phy-bg border border-phy-border rounded-xl px-4 py-3.5 text-sm focus:bg-phy-glass focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all font-mono font-medium"
                                />
                                <button
                                    onClick={handleTTSTest}
                                    disabled={ttsConnectionStatus === 'testing'}
                                    className={`px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 min-w-[140px] justify-center ${ttsConnectionStatus === 'success' ? 'bg-green-500 text-white shadow-green-200 shadow-md' :
                                        ttsConnectionStatus === 'error' ? 'bg-red-500 text-white shadow-red-200 shadow-md' :
                                            'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200'
                                        }`}
                                >
                                    {ttsConnectionStatus === 'testing' ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : ttsConnectionStatus === 'success' ? (
                                        <><CheckCircle size={16} /> 已验证</>
                                    ) : ttsConnectionStatus === 'error' ? (
                                        <><X size={16} /> 失败</>
                                    ) : (
                                        '测试 TTS'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Image Generation API Card */}
                <div id="image" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <ImageIcon size={20} />
                        </div>
                        <h3 className="text-lg">配置图像生成 API (每日总结生图)</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Image Gen Base URL */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Image API Endpoint URL
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.imageGenApiUrl || ''}
                                    onChange={(e) => updateSetting('imageGenApiUrl', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                    placeholder="e.g. https://api.openai.com/v1 or https://api.siliconflow.cn/v1"
                                />
                                <Wifi size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-amber-500 transition-colors" />
                            </div>
                        </div>

                        {/* Image Gen Model Name */}
                        <div>
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Image Model Name
                            </label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={settings.imageGenModel || 'dall-e-3'}
                                    onChange={(e) => updateSetting('imageGenModel', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                />
                                <Box size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-amber-500 transition-colors" />
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">e.g. <b>dall-e-3</b> (OpenAI) or <b>Kwai-Kolors/Kolors</b> (SiliconFlow)</p>
                        </div>

                        {/* Image Gen API Key */}
                        <div>
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Image API Key (Optional)
                            </label>
                            <div className="relative group">
                                <input
                                    type="password"
                                    value={settings.imageGenApiKey || ''}
                                    onChange={(e) => updateSetting('imageGenApiKey', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                    placeholder="留空则使用主 API Key"
                                />
                                <Server size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-amber-500 transition-colors" />
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">如果生图 API 与主 API 使用不同的 Key，请在此填写</p>
                        </div>

                        {/* Test Button */}
                        <div className="md:col-span-2">
                            <button
                                onClick={handleImageGenTest}
                                disabled={imageGenConnectionStatus === 'testing'}
                                className={`px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${imageGenConnectionStatus === 'success' ? 'bg-green-500 text-white shadow-green-200 shadow-md' :
                                    imageGenConnectionStatus === 'error' ? 'bg-red-500 text-white shadow-red-200 shadow-md' :
                                        'bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-200'
                                    }`}
                            >
                                {imageGenConnectionStatus === 'testing' ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : imageGenConnectionStatus === 'success' ? (
                                    <><CheckCircle size={16} /> 生图成功！</>
                                ) : imageGenConnectionStatus === 'error' ? (
                                    <><X size={16} /> 连接失败</>
                                ) : (
                                    <><ImageIcon size={16} /> 测试生图 API</>
                                )}
                            </button>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">测试会生成一张小图片，可能会消耗少量 API 额度</p>
                        </div>
                    </div>
                </div>

                {/* System Prompt Card */}
                <div id="system" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Settings size={20} />
                        </div>
                        <h3 className="text-lg">配置 AI 核心人设 (System Prompt)</h3>
                    </div>
                    <div>
                        <div>
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                系统预设指令 (System Instruction)
                            </label>
                            <textarea
                                value={settings.systemPrompt}
                                onChange={(e) => updateSetting('systemPrompt', e.target.value)}
                                className="w-full bg-phy-bg border border-phy-border rounded-xl p-4 text-sm focus:bg-phy-glass focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-phy-text min-h-[100px] mb-6"
                                placeholder="Define how the AI should behave..."
                            />

                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Vocabulary Analysis Prompt (词汇分析指令)
                            </label>
                            <textarea
                                value={settings.vocabAnalysisPrompt}
                                onChange={(e) => updateSetting('vocabAnalysisPrompt', e.target.value)}
                                className="w-full bg-phy-bg border border-phy-border rounded-xl p-4 text-xs focus:bg-phy-glass focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-phy-muted min-h-[300px]"
                                placeholder="Define the strict JSON output structure..."
                            />
                            <p className="text-[11px] text-phy-muted mt-2">
                                <b>Tip:</b> Use <code>{'{{vocabCount}}'}</code> as a placeholder for the number required (e.g. "10-15"). Must maintain VALID JSON output structure for the app to work.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Efficiency Tools Card */}
                <div id="tools" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <Clock size={20} />
                        </div>
                        <h3 className="text-lg">效率工具 (Efficiency Tools)</h3>
                    </div>

                    <div className="space-y-6">
                        <Toggle
                            title="Enable Global Pomodoro Timer (开启全局番茄钟)"
                            checked={settings.showPomodoro}
                            onChange={(v) => updateSetting('showPomodoro', v)}
                        />

                        {settings.showPomodoro && (
                            <div className="grid grid-cols-2 gap-4 animate-fade-in-up">
                                <div>
                                    <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                        Focus Duration (min)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="120"
                                        value={settings.pomodoroFocus}
                                        onChange={(e) => updateSetting('pomodoroFocus', parseInt(e.target.value) || 25)}
                                        className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:bg-phy-glass focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono font-bold text-phy-text"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                        Break Duration (min)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="60"
                                        value={settings.pomodoroBreak}
                                        onChange={(e) => updateSetting('pomodoroBreak', parseInt(e.target.value) || 5)}
                                        className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:bg-phy-glass focus:border-green-500 focus:ring-4 focus:ring-green-500/10 outline-none transition-all font-mono font-bold text-phy-text"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Vocabulary Import Limit */}
                        <div className="pt-4 border-t border-phy-border">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                词汇批量导入上限 (Vocabulary Import Limit)
                            </label>
                            <select
                                value={settings.vocabLimit || ''}
                                onChange={(e) => updateSetting('vocabLimit', e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:bg-phy-glass focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-phy-text"
                            >
                                <option value="">无限制 (No Limit)</option>
                                <option value="50">50 词</option>
                                <option value="100">100 词</option>
                                <option value="200">200 词</option>
                                <option value="500">500 词</option>
                            </select>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">限制每次批量导入提取的最大词汇数量，设置上限可加快处理速度</p>
                        </div>
                    </div>
                </div>

                {/* Modules Card */}
                <div id="modules" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                            <Box size={20} />
                        </div>
                        <h3 className="text-lg">个性化分析模块</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Toggle
                            title="Writing Guide (写作指导)"
                            checked={settings.showWriting}
                            onChange={(v) => updateSetting('showWriting', v)}
                        />
                        <Toggle
                            title="Mnemonics (AI 联想记忆)"
                            checked={settings.showMnemonic}
                            onChange={(v) => updateSetting('showMnemonic', v)}
                        />
                        <Toggle
                            title="Etymology (词源解析)"
                            checked={settings.showEtymology}
                            onChange={(v) => updateSetting('showEtymology', v)}
                        />
                        <Toggle
                            title="Collocations (地道搭配/例句)"
                            checked={settings.showCollocations}
                            onChange={(v) => updateSetting('showCollocations', v)}
                        />
                        <div className="md:col-span-2 mt-4 pt-4 border-t border-slate-50">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                Vocabulary Quantity Target (词汇提取数量)
                            </label>
                            <input
                                type="text"
                                value={settings.vocabCount}
                                onChange={(e) => updateSetting('vocabCount', e.target.value)}
                                className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:bg-phy-glass focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all font-mono text-phy-text"
                                placeholder="e.g. 10-15 or 20"
                            />
                            <p className="text-[11px] text-phy-muted mt-2">
                                Set a target range (e.g. "15-20") or fixed number for key word extraction.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Custom Comic Styles Settings */}
                <div id="styles" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                            <BookMarked size={20} />
                        </div>
                        <h3 className="text-lg">自定义漫画风格 (Design Your Comic Style)</h3>
                    </div>

                    {/* List Existing Custom Styles */}
                    <div className="mb-8">
                        <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-3">
                            Your Custom Styles
                        </label>
                        <div className="space-y-3">
                            {settings.customStyles?.length > 0 ? (
                                settings.customStyles.map(style => (
                                    <div key={style.id} className="flex items-center justify-between p-4 bg-phy-bg border border-phy-border rounded-xl group hover:border-pink-200 hover:bg-pink-50/30 transition-all">
                                        <div className="flex-1 min-w-0 mr-4">
                                            <div className="font-bold text-phy-text font-bold text-sm flex items-center gap-2">
                                                {style.name}
                                                <span className="text-[10px] bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded font-medium">Custom</span>
                                            </div>
                                            <div className="text-xs text-phy-muted truncate mt-1 font-mono">{style.prompt}</div>
                                        </div>
                                        <button
                                            onClick={() => removeCustomStyle(style.id)}
                                            className="p-2 text-phy-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="Delete Style"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-6 text-phy-muted bg-phy-bg/50 rounded-xl border border-dashed border-phy-border">
                                    <BookMarked className="mx-auto mb-2 opacity-20" size={32} />
                                    <p className="text-xs">还没有自定义风格。添加您喜欢的画风，AI将在生成漫画时随机使用。</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Add New Style Form */}
                    <div className="bg-phy-bg p-5 rounded-2xl border border-phy-border">
                        <h4 className="font-bold text-sm mb-4 text-phy-text font-bold flex items-center gap-2">
                            <Plus size={16} className="text-pink-500" /> 添加新风格
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold text-phy-muted uppercase tracking-wider mb-1.5">
                                    Style Name (风格名称)
                                </label>
                                <input
                                    type="text"
                                    value={newStyleName}
                                    onChange={(e) => setNewStyleName(e.target.value)}
                                    className="w-full bg-phy-glass border border-phy-border rounded-xl px-3 py-2.5 text-sm focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all"
                                    placeholder="e.g. 进击的巨人风"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-phy-muted uppercase tracking-wider mb-1.5">
                                    AI Prompt (画风描述/关键词)
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newStylePrompt}
                                        onChange={(e) => setNewStylePrompt(e.target.value)}
                                        className="flex-1 bg-phy-glass border border-phy-border rounded-xl px-3 py-2.5 text-sm focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all font-mono"
                                        placeholder="e.g. rough lines, dark atmosphere..."
                                    />
                                    <button
                                        onClick={handleAddStyle}
                                        disabled={!newStyleName.trim() || !newStylePrompt.trim()}
                                        className="px-4 py-2 bg-pink-500 text-white rounded-xl font-bold text-xs hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-pink-200 transition-all"
                                    >
                                        Add
                                    </button>
                                </div>
                                <p className="text-[10px] text-phy-muted mt-1.5">
                                    <b>Tip:</b> 使用英文描述效果最佳。可以参考 Midjourney/Stable Diffusion 的画风提示词。
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Smart Drill Cards Settings */}
                <div id="drills" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Box size={20} />
                        </div>
                        <h3 className="text-lg">智能强化练习 (Smart Drill Cards)</h3>
                        <span className="ml-auto text-xs font-normal text-phy-muted">为⭐标记的卡片生成高级练习</span>
                    </div>

                    <div className="mb-6">
                        <Toggle
                            title="🧠 启用智能强化练习 (Enable Smart Drills)"
                            checked={settings.drillsEnabled !== false}
                            onChange={(v) => updateSetting('drillsEnabled', v)}
                        />
                        <p className="text-xs text-phy-muted mt-2 ml-1">
                            启用后，被标记(⭐)的卡片将自动生成多种练习题型，提升记忆效果
                        </p>
                    </div>

                    {settings.drillsEnabled !== false && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                            <Toggle
                                title="👀 形近词选择 (Similar Words)"
                                checked={settings.drillTypes?.similar_words !== false}
                                onChange={(v) => updateSetting('drillTypes', { ...settings.drillTypes, similar_words: v })}
                            />
                            <Toggle
                                title="📖 语境释义 (Context)"
                                checked={settings.drillTypes?.context !== false}
                                onChange={(v) => updateSetting('drillTypes', { ...settings.drillTypes, context: v })}
                            />
                            <Toggle
                                title="✍️ 填空题 (Cloze)"
                                checked={settings.drillTypes?.cloze !== false}
                                onChange={(v) => updateSetting('drillTypes', { ...settings.drillTypes, cloze: v })}
                            />
                            <Toggle
                                title="🔗 搭配选择 (Collocation)"
                                checked={settings.drillTypes?.collocation !== false}
                                onChange={(v) => updateSetting('drillTypes', { ...settings.drillTypes, collocation: v })}
                            />
                            <Toggle
                                title="🔄 词性变换 (Word Forms)"
                                checked={settings.drillTypes?.word_forms !== false}
                                onChange={(v) => updateSetting('drillTypes', { ...settings.drillTypes, word_forms: v })}
                            />
                            <Toggle
                                title="↔️ 同/反义词 (Synonyms)"
                                checked={settings.drillTypes?.synonyms !== false}
                                onChange={(v) => updateSetting('drillTypes', { ...settings.drillTypes, synonyms: v })}
                            />
                            <Toggle
                                title="🧩 句子排序 (Sentence Order)"
                                checked={settings.drillTypes?.sentence_order !== false}
                                onChange={(v) => updateSetting('drillTypes', { ...settings.drillTypes, sentence_order: v })}
                            />
                            <Toggle
                                title="🎧 听写模式 (Dictation)"
                                checked={settings.drillTypes?.dictation !== false}
                                onChange={(v) => updateSetting('drillTypes', { ...settings.drillTypes, dictation: v })}
                            />
                        </div>
                    )}
                </div>

                {/* General Settings */}
                <div className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
                            <Box size={20} />
                        </div>
                        <h3 className="text-lg">通用与性能 (General)</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Toggle
                            title="⚡ Fast Mode (Preload All Views)"
                            checked={settings.preloadAll !== false}
                            onChange={(val) => updateSetting('preloadAll', val)}
                        />
                    </div>
                </div>

                {/* Appearance Card (Zen Mode) */}
                <div id="appearance" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                            <Palette size={20} />
                        </div>
                        <h3 className="text-lg">外观设置 (Appearance & Theme)</h3>
                    </div>

                    {/* === Theme Switcher === */}
                    <div className="mb-8">
                        <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-4">
                            配色方案 (Color Scheme) - Phycat 风格
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {/* Dark Themes */}
                            <button onClick={() => setTheme('vampire')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'vampire' ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#1e1e24] opacity-10 group-hover:opacity-20 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Vampire {theme === 'vampire' && <Check size={14} className="text-rose-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full bg-[#1e1e24]"></div><div className="w-4 h-4 rounded-full bg-[#f28b82]"></div></div>
                            </button>
                            <button onClick={() => setTheme('abyss')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'abyss' ? 'border-violet-500 ring-2 ring-violet-500/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#0b1120] opacity-10 group-hover:opacity-20 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Abyss {theme === 'abyss' && <Check size={14} className="text-violet-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full bg-[#0b1120]"></div><div className="w-4 h-4 rounded-full bg-[#8b5cf6]"></div></div>
                            </button>
                            <button onClick={() => setTheme('radiation')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'radiation' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#111810] opacity-10 group-hover:opacity-20 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Radiation {theme === 'radiation' && <Check size={14} className="text-emerald-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full bg-[#111810]"></div><div className="w-4 h-4 rounded-full bg-[#4ade80]"></div></div>
                            </button>

                            {/* Light Themes */}
                            <button onClick={() => setTheme('sakura')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'sakura' ? 'border-pink-400 ring-2 ring-pink-400/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#fff5f8] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Sakura {theme === 'sakura' && <Check size={14} className="text-pink-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#fff5f8]"></div><div className="w-4 h-4 rounded-full bg-[#f472b6]"></div></div>
                            </button>
                            <button onClick={() => setTheme('ocean')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'ocean' ? 'border-teal-400 ring-2 ring-teal-400/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#f0fdfa] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Ocean {theme === 'ocean' && <Check size={14} className="text-teal-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#f0fdfa]"></div><div className="w-4 h-4 rounded-full bg-[#2dd4bf]"></div></div>
                            </button>
                            <button onClick={() => setTheme('mauve')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'mauve' ? 'border-purple-400 ring-2 ring-purple-400/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#faf5ff] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Mauve {theme === 'mauve' && <Check size={14} className="text-purple-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#faf5ff]"></div><div className="w-4 h-4 rounded-full bg-[#a855f7]"></div></div>
                            </button>
                            <button onClick={() => setTheme('golden')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'golden' ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#fffbeb] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Golden {theme === 'golden' && <Check size={14} className="text-amber-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#fffbeb]"></div><div className="w-4 h-4 rounded-full bg-[#f59e0b]"></div></div>
                            </button>
                            <button onClick={() => setTheme('cheery')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'cheery' ? 'border-red-400 ring-2 ring-red-400/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#fef2f2] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Cheery {theme === 'cheery' && <Check size={14} className="text-red-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#fef2f2]"></div><div className="w-4 h-4 rounded-full bg-[#ef4444]"></div></div>
                            </button>
                            <button onClick={() => setTheme('prussian')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'prussian' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#f1f5f9] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Prussian {theme === 'prussian' && <Check size={14} className="text-blue-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#f1f5f9]"></div><div className="w-4 h-4 rounded-full bg-[#3b82f6]"></div></div>
                            </button>
                            <button onClick={() => setTheme('sky')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'sky' ? 'border-sky-400 ring-2 ring-sky-400/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#f0f9ff] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Sky {theme === 'sky' && <Check size={14} className="text-sky-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#f0f9ff]"></div><div className="w-4 h-4 rounded-full bg-[#0ea5e9]"></div></div>
                            </button>
                            <button onClick={() => setTheme('forest')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'forest' ? 'border-green-500 ring-2 ring-green-500/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#f0fdf4] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Forest {theme === 'forest' && <Check size={14} className="text-green-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#f0fdf4]"></div><div className="w-4 h-4 rounded-full bg-[#22c55e]"></div></div>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-phy-border">
                        {/* Background Image URL or Upload */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                背景图片 URL
                            </label>

                            {/* URL Input */}
                            <div className="relative group mb-3">
                                <input
                                    type="text"
                                    value={settings.backgroundImage?.startsWith('data:') ? 'Local Image Uploaded' : (settings.backgroundImage || '')}
                                    onChange={(e) => !settings.backgroundImage?.startsWith('data:') && updateSetting('backgroundImage', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-phy-glass focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 outline-none transition-all font-mono font-medium text-phy-text"
                                    placeholder="https://..."
                                    disabled={settings.backgroundImage?.startsWith('data:')}
                                />
                                <ImageIcon size={18} className="absolute left-4 top-3.5 text-phy-muted group-focus-within:text-rose-500 transition-colors" />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <label className="cursor-pointer bg-phy-glass border border-phy-border hover:bg-phy-bg hover:border-phy-borderHover text-phy-muted px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2">
                                    <Upload size={16} />
                                    上传本地图片
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;

                                            // Save to IndexedDB (No size limit!)
                                            try {
                                                await saveFile({
                                                    id: 'theme_background',
                                                    name: file.name,
                                                    type: file.type,
                                                    blob: file,
                                                    timestamp: Date.now()
                                                });

                                                const url = URL.createObjectURL(file);
                                                updateSetting('backgroundImage', url);
                                                alert("Background set successfully!");
                                            } catch (err) {
                                                alert("Failed to save background: " + err.message);
                                            }
                                        }}
                                    />
                                </label>

                                {settings.backgroundImage && (
                                    <button
                                        onClick={async () => {
                                            await deleteFile('theme_background');
                                            updateSetting('backgroundImage', '');
                                        }}
                                        className="bg-phy-glass border border-red-500/20 hover:border-red-500/50 hover:bg-red-500/10 text-red-500 px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                                    >
                                        <Trash2 size={16} />
                                        清除背景 / 重置
                                    </button>
                                )}
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">
                                Paste a link OR upload a local image (Max 4MB).
                            </p>
                        </div>

                        {/* Glass Opacity */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                磨砂层浓度 ({Math.round((settings.glassOpacity || 0.7) * 100)}%)
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={(settings.glassOpacity || 0.7) * 100}
                                onChange={(e) => updateSetting('glassOpacity', parseInt(e.target.value) / 100)}
                                className="w-full h-2 bg-phy-bg rounded-lg appearance-none cursor-pointer accent-rose-500"
                            />
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">Controls the "fog" density over the background image.</p>
                        </div>
                    </div>
                </div>

                {/* Review Settings Card */}
                <div id="review" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-violet-50 text-violet-600 rounded-lg">
                            <Clock size={20} />
                        </div>
                        <h3 className="text-lg">复习设置</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-phy-text mb-1 block">每次复习上限</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="0"
                                    max="200"
                                    value={settings.maxReviewCards || 0}
                                    onChange={e => updateSetting('maxReviewCards', parseInt(e.target.value) || 0)}
                                    className="w-24 px-3 py-2 border border-phy-border rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                                />
                                <span className="text-sm text-phy-muted">张 (0 = 不限制)</span>
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">
                                首页「开始复习」按钮每次最多复习的卡片数量。设为 0 则复习全部到期卡片。
                            </p>
                        </div>
                    </div>
                </div>

                {/* Data Management Card */}
                <div id="general" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Database size={20} />
                        </div>
                        <h3 className="text-lg">数据备份与导出</h3>
                    </div>

                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="text-phy-muted text-sm leading-relaxed">
                            <p className="font-bold mb-1">备份您的学习数据</p>
                            <p className="text-phy-muted">
                                将历史记录、笔记和设置导出为 JSON 文件。
                                (包含纯文本数据，不包含大型媒体文件)。
                            </p>
                        </div>
                        <button
                            onClick={async () => {
                                try {
                                    const data = await exportUserData();
                                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `smartlearn-backup-${new Date().toISOString().split('T')[0]}.json`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                } catch (e) {
                                    alert("Export failed: " + e.message);
                                }
                            }}
                            className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center gap-2 whitespace-nowrap"
                        >
                            <Download size={18} />
                            导出数据 (JSON)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
