import React, { useEffect, useState } from 'react';
import { Settings, Server, Wifi, Box, CheckCircle, X, Check, Save, Mic, Volume2, Download, Database, Palette, Image as ImageIcon, Upload, Trash2, Clock, Plus, BookMarked, Hash, Loader2, Sparkles, Wand2, Smartphone, RotateCcw, Home, BookOpen, NotebookPen, Layers, Target, PenTool, FileQuestion, Share2, FolderOpen, PlayCircle, Languages, Headphones, Route } from 'lucide-react';
import { BUILTIN_API_CONFIG, useApp } from '../context/AppContext';
import { checkConnection, checkAudioConnection, checkTTSConnection, checkImageGenConnection, optimizePromptTemplate } from '../services/ai';
import KnowledgeLinkingSettingsCard from '../components/KnowledgeLinkingSettingsCard';
import { DEFAULT_MOBILE_BOTTOM_TAB_IDS, MOBILE_BOTTOM_TAB_LIMIT, MOBILE_NAV_ITEMS, normalizeMobileBottomTabs } from '../utils/mobileNavigation';

// Navigation sections for quick jump
const sections = [
    { id: 'api', label: 'AI 服务', icon: Server },
    { id: 'audio', label: '语音识别', icon: Mic },
    { id: 'tts', label: '朗读发音', icon: Volume2 },
    { id: 'image', label: '总结生图', icon: ImageIcon },
    { id: 'system', label: 'AI 指令', icon: Settings },
    { id: 'tools', label: '效率工具', icon: Clock },
    { id: 'mobile_nav', label: '手机底栏', icon: Smartphone },
    { id: 'styles', label: '漫画风格', icon: BookMarked },
    { id: 'drills', label: '智能练习', icon: Hash },
    { id: 'review', label: '复习设置', icon: Clock },
    { id: 'general', label: '通用设置', icon: Box },
    { id: 'appearance', label: '外观设置', icon: Palette },
];

const DEFAULT_TTS_CUSTOM_HEADERS = `{
  "Authorization": "Bearer {{apiKey}}",
  "Content-Type": "application/json"
}`;

const DEFAULT_TTS_CUSTOM_BODY = `{
  "model": "{{model}}",
  "input": "{{text}}",
  "voice": "{{voice}}"
}`;

const MIMO_TTS_HEADERS = `{
  "api-key": "{{apiKey}}",
  "Content-Type": "application/json"
}`;

const MIMO_TTS_BODY = `{
  "model": "{{model}}",
  "messages": [
    {
      "role": "user",
      "content": "{{style}}"
    },
    {
      "role": "assistant",
      "content": "{{text}}"
    }
  ],
  "audio": {
    "format": "wav",
    "voice": "{{voice}}"
  }
}`;

const MOBILE_NAV_ICON_MAP = {
    home: Home,
    bookOpen: BookOpen,
    layers: Layers,
    target: Target,
    penTool: PenTool,
    mic: Mic,
    notebookPen: NotebookPen,
    languages: Languages,
    headphones: Headphones,
    route: Route,
    upload: Upload,
    playCircle: PlayCircle,
    share2: Share2,
    folderOpen: FolderOpen
};

const SettingsView = () => {
    const { settings, updateSetting, exportUserData, saveFile, deleteFile, addCustomStyle, removeCustomStyle, theme, setTheme } = useApp();
    const [connectionStatus, setConnectionStatus] = useState('idle');
    const [audioConnectionStatus, setAudioConnectionStatus] = useState('idle');
    const [ttsConnectionStatus, setTtsConnectionStatus] = useState('idle');
    const [imageGenConnectionStatus, setImageGenConnectionStatus] = useState('idle');
    const [showCustomMainKeyInput, setShowCustomMainKeyInput] = useState(false);
    const [customMainKeyDraft, setCustomMainKeyDraft] = useState('');
    const [apiProfileNameDraft, setApiProfileNameDraft] = useState('');
    const [selectedApiProfileId, setSelectedApiProfileId] = useState(() => settings.activeApiProfileId || '');
    const apiProfiles = Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];

    useEffect(() => {
        setSelectedApiProfileId(settings.activeApiProfileId || '');
    }, [settings.activeApiProfileId]);

    const safeHost = (url) => {
        try {
            const u = new URL(String(url || '').trim());
            return u.host || 'custom-endpoint';
        } catch {
            return 'custom-endpoint';
        }
    };

    const buildProfilePayload = (nameOverride = '') => {
        const apiBaseUrl = String(settings.apiBaseUrl || '').trim();
        const modelName = String(settings.modelName || '').trim();
        const apiKey = String(settings.apiKey || '').trim();
        const host = safeHost(apiBaseUrl);
        const autoName = `${modelName || 'model'} @ ${host}`;
        return {
            id: `api_profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: String(nameOverride || '').trim() || autoName,
            apiBaseUrl,
            modelName,
            apiKey,
            updatedAt: Date.now()
        };
    };

    const commitApiProfiles = (nextProfiles, nextActiveId = '') => {
        updateSetting('apiProfiles', nextProfiles);
        updateSetting('activeApiProfileId', nextActiveId);
        setSelectedApiProfileId(nextActiveId || '');
    };

    const upsertCurrentApiProfile = (nameOverride = '') => {
        const payload = buildProfilePayload(nameOverride);
        if (!payload.apiBaseUrl || !payload.modelName || !payload.apiKey) return null;

        const sameConfigIndex = apiProfiles.findIndex((p) =>
            String(p.apiBaseUrl || '').trim() === payload.apiBaseUrl &&
            String(p.modelName || '').trim() === payload.modelName &&
            String(p.apiKey || '').trim() === payload.apiKey
        );
        if (sameConfigIndex >= 0) {
            const existing = apiProfiles[sameConfigIndex];
            const updatedSame = [...apiProfiles];
            updatedSame[sameConfigIndex] = { ...existing, updatedAt: Date.now() };
            commitApiProfiles(updatedSame, existing.id);
            return existing.id;
        }

        const sameNameIndex = apiProfiles.findIndex((p) =>
            String(p.name || '').trim().toLowerCase() === payload.name.toLowerCase()
        );
        if (sameNameIndex >= 0) {
            const existing = apiProfiles[sameNameIndex];
            const updatedName = [...apiProfiles];
            updatedName[sameNameIndex] = { ...existing, ...payload, id: existing.id };
            commitApiProfiles(updatedName, existing.id);
            return existing.id;
        }

        const next = [payload, ...apiProfiles].slice(0, 20);
        commitApiProfiles(next, payload.id);
        return payload.id;
    };

    // Prompt Optimizer State
    const [isOptimizingPrompt, setIsOptimizingPrompt] = useState(false);
    const [promptInstruction, setPromptInstruction] = useState('');

    const handleOptimizePrompt = async () => {
        if (!promptInstruction.trim() || isOptimizingPrompt) return;
        setIsOptimizingPrompt(true);
        const newPrompt = await optimizePromptTemplate(settings.deepNotePrompt, promptInstruction, settings);
        if (newPrompt) {
            updateSetting('deepNotePrompt', newPrompt);
            setPromptInstruction(''); // clear instruction on success
        }
        setIsOptimizingPrompt(false);
    };

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
            alert("朗读测试失败：" + e.message);
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
            alert("生图服务测试失败：" + e.message);
            setTimeout(() => setImageGenConnectionStatus('idle'), 3000);
        }
    };

    const maskApiKey = (value) => {
        if (!value) return '未配置';
        if (value.length <= 8) return '••••••••';
        return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
    };

    const isUsingBuiltinMainKey = Boolean(BUILTIN_API_CONFIG.mainApiKey) && settings.apiKey === BUILTIN_API_CONFIG.mainApiKey;
    const isUsingBuiltinAudioKey = Boolean(BUILTIN_API_CONFIG.audioApiKey) && settings.audioApiKey === BUILTIN_API_CONFIG.audioApiKey;
    const isUsingBuiltinTtsKey = Boolean(BUILTIN_API_CONFIG.ttsApiKey) && settings.ttsApiKey === BUILTIN_API_CONFIG.ttsApiKey;
    const isUsingBuiltinImageKey = Boolean(BUILTIN_API_CONFIG.imageGenApiKey) && settings.imageGenApiKey === BUILTIN_API_CONFIG.imageGenApiKey;

    const handleUseBuiltinMainKey = () => {
        updateSetting('apiKey', BUILTIN_API_CONFIG.mainApiKey);
        setShowCustomMainKeyInput(false);
        setCustomMainKeyDraft('');
        updateSetting('apiBaseUrl', BUILTIN_API_CONFIG.mainApiBaseUrl);
        updateSetting('modelName', BUILTIN_API_CONFIG.mainModelName);
        updateSetting('proxyAccessToken', '');
        updateSetting('activeApiProfileId', '');
    };

    const handleEnableCustomMainKey = () => {
        setShowCustomMainKeyInput(true);
        setCustomMainKeyDraft('');
    };

    const handleSaveCustomMainKey = () => {
        const trimmed = customMainKeyDraft.trim();
        if (!trimmed) return;
        updateSetting('apiKey', trimmed);
        setShowCustomMainKeyInput(false);
        setCustomMainKeyDraft('');
        setTimeout(() => upsertCurrentApiProfile(), 0);
    };

    const handleSaveCurrentApiProfile = () => {
        const id = upsertCurrentApiProfile(apiProfileNameDraft);
        if (id) setApiProfileNameDraft('');
    };

    const handleApplySelectedApiProfile = () => {
        const target = apiProfiles.find((p) => p.id === selectedApiProfileId);
        if (!target) return;
        updateSetting('apiBaseUrl', target.apiBaseUrl || '');
        updateSetting('modelName', target.modelName || '');
        updateSetting('apiKey', target.apiKey || '');
        updateSetting('activeApiProfileId', target.id);
    };

    const handleDeleteSelectedApiProfile = () => {
        if (!selectedApiProfileId) return;
        const nextProfiles = apiProfiles.filter((p) => p.id !== selectedApiProfileId);
        const nextActive = settings.activeApiProfileId === selectedApiProfileId ? '' : settings.activeApiProfileId || '';
        commitApiProfiles(nextProfiles, nextActive);
    };

    const formatApiProfileOptionLabel = (profile) => {
        if (!profile) return '';
        const base = String(profile.name || 'Untitled profile');
        const model = String(profile.modelName || '').trim();
        const host = safeHost(profile.apiBaseUrl);
        return model ? `${base} - ${model} @ ${host}` : `${base} @ ${host}`;
    };

    const resetTtsSettings = () => {
        updateSetting('ttsApiBaseUrl', BUILTIN_API_CONFIG.ttsApiBaseUrl);
        updateSetting('ttsModelName', BUILTIN_API_CONFIG.ttsModelName);
        updateSetting('ttsVoice', BUILTIN_API_CONFIG.ttsVoice);
        updateSetting('ttsApiKey', BUILTIN_API_CONFIG.ttsApiKey);
        updateSetting('ttsRequestMode', BUILTIN_API_CONFIG.ttsRequestMode);
        updateSetting('ttsCustomHeaders', BUILTIN_API_CONFIG.ttsCustomHeaders);
        updateSetting('ttsCustomBody', BUILTIN_API_CONFIG.ttsCustomBody);
        updateSetting('ttsCustomResponseType', BUILTIN_API_CONFIG.ttsCustomResponseType);
        updateSetting('ttsCustomAudioPath', BUILTIN_API_CONFIG.ttsCustomAudioPath);
        updateSetting('ttsCustomAudioMimeType', BUILTIN_API_CONFIG.ttsCustomAudioMimeType);
        updateSetting('ttsCustomStylePrompt', BUILTIN_API_CONFIG.ttsCustomStylePrompt);
    };

    const applyMimoTtsTemplate = () => {
        updateSetting('ttsRequestMode', 'custom');
        updateSetting('ttsApiBaseUrl', 'https://api.xiaomimimo.com/v1/chat/completions');
        updateSetting('ttsModelName', 'mimo-v2.5-tts');
        updateSetting('ttsVoice', 'Chloe');
        updateSetting('ttsCustomHeaders', MIMO_TTS_HEADERS);
        updateSetting('ttsCustomBody', MIMO_TTS_BODY);
        updateSetting('ttsCustomResponseType', 'json_base64');
        updateSetting('ttsCustomAudioPath', 'choices.0.message.audio.data');
        updateSetting('ttsCustomAudioMimeType', 'audio/wav');
        updateSetting('ttsCustomStylePrompt', 'Natural English listening material, clear pronunciation, steady pace.');
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

    const mobileBottomTabIds = normalizeMobileBottomTabs(settings.mobileBottomTabs);
    const mobileBottomTabIdSet = new Set(mobileBottomTabIds);
    const isMobileTabLimitReached = mobileBottomTabIds.length >= MOBILE_BOTTOM_TAB_LIMIT;

    const updateMobileBottomTabs = (nextIds) => {
        updateSetting('mobileBottomTabs', normalizeMobileBottomTabs(nextIds));
    };

    const toggleMobileBottomTab = (id) => {
        if (mobileBottomTabIdSet.has(id)) {
            if (mobileBottomTabIds.length <= 1) return;
            updateMobileBottomTabs(mobileBottomTabIds.filter((itemId) => itemId !== id));
            return;
        }
        if (isMobileTabLimitReached) return;
        updateMobileBottomTabs([...mobileBottomTabIds, id]);
    };

    const moveMobileBottomTab = (id, direction) => {
        const index = mobileBottomTabIds.indexOf(id);
        const targetIndex = index + direction;
        if (index < 0 || targetIndex < 0 || targetIndex >= mobileBottomTabIds.length) return;
        const next = [...mobileBottomTabIds];
        [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
        updateMobileBottomTabs(next);
    };

    const resetMobileBottomTabs = () => {
        updateSetting('mobileBottomTabs', DEFAULT_MOBILE_BOTTOM_TAB_IDS);
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
                    <div className="flex items-center gap-3 text-phy-text font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Server size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg">AI 服务</h3>
                            <p className="text-xs text-phy-muted mt-1">请填写你自己的 OpenAI 兼容 API 地址、模型和密钥。</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                            <div className="text-xs text-phy-muted mb-1">服务状态</div>
                            <div className="text-sm font-bold text-blue-300">用户自备</div>
                        </div>
                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <div className="text-xs text-phy-muted mb-1">适用功能</div>
                            <div className="text-sm font-bold text-emerald-300">阅读 / 写作 / 翻译 / Agent</div>
                        </div>
                        <div className="rounded-2xl border border-slate-500/20 bg-phy-bg/60 p-4">
                            <div className="text-xs text-phy-muted mb-1">接口密钥</div>
                            <div className="text-sm font-bold text-phy-text">仅本地保存</div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-phy-border bg-phy-bg/50 p-4">
                        <div className="text-sm text-phy-muted leading-relaxed">
                            当前版本不再提供默认免费后端。AI 功能需要用户填写自己的 API 配置，密钥只保存在当前设备本地。
                        </div>
                        <button
                            onClick={handleTest}
                            disabled={connectionStatus === 'testing' || !settings.apiKey}
                            className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 justify-center ${connectionStatus === 'success' ? 'bg-green-500 text-white' :
                                connectionStatus === 'error' ? 'bg-red-500 text-white' :
                                    'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                        >
                            {connectionStatus === 'testing' ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : connectionStatus === 'success' ? (
                                <><CheckCircle size={16} /> AI 可用</>
                            ) : connectionStatus === 'error' ? (
                                <><X size={16} /> 连接失败</>
                            ) : (
                                '测试 AI 服务'
                            )}
                        </button>
                    </div>

                    <div className="mt-5 rounded-2xl border border-phy-border bg-phy-bg/40 p-5 space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-bold text-phy-text">API 配置</h4>
                                <p className="text-xs text-phy-muted mt-1">请使用自己的 API Key。网页端不会再默认连接平台后端。</p>
                            </div>
                            <button
                                onClick={handleUseBuiltinMainKey}
                                className="px-4 py-2 rounded-xl border border-phy-border text-xs font-bold text-phy-text hover:bg-phy-glassHover transition-colors"
                            >
                                恢复推荐配置
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-phy-muted mb-2">API 地址</label>
                                <input
                                    type="text"
                                    value={settings.apiBaseUrl || ''}
                                    onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono text-phy-text"
                                    placeholder="https://api.deepseek.com 或 https://api.openai.com/v1"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-phy-muted mb-2">模型名称</label>
                                <input
                                    type="text"
                                    value={settings.modelName || ''}
                                    onChange={(e) => updateSetting('modelName', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono text-phy-text"
                                    placeholder="gpt-4.1-mini / kimi-k2-0905-preview"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-phy-muted mb-2">API 密钥</label>
                                <input
                                    type="password"
                                    value={isUsingBuiltinMainKey ? '' : (settings.apiKey || '')}
                                    onChange={(e) => updateSetting('apiKey', e.target.value)}
                                    className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono text-phy-text"
                                    placeholder="输入你自己的 API Key"
                                />
                            </div>
                        </div>
                        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 leading-relaxed">
                            提醒：不要把你的 API Key 写进公开代码或截图里。用户填写的密钥只保存在当前设备本地。
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
                            <input
                                type="text"
                                value={apiProfileNameDraft}
                                onChange={(e) => setApiProfileNameDraft(e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 text-phy-text"
                                placeholder="保存当前配置名称（例如：我的 OpenAI）"
                            />
                            <button
                                onClick={handleSaveCurrentApiProfile}
                                disabled={!settings.apiKey}
                                className="px-4 py-3 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                保存配置
                            </button>
                            <button
                                onClick={handleTest}
                                disabled={connectionStatus === 'testing' || !settings.apiKey}
                                className="px-4 py-3 rounded-xl border border-phy-border text-xs font-bold text-phy-text hover:bg-phy-glassHover disabled:opacity-40"
                            >
                                测试当前配置
                            </button>
                        </div>
                        {apiProfiles.length > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
                                <select
                                    value={selectedApiProfileId}
                                    onChange={(e) => setSelectedApiProfileId(e.target.value)}
                                    className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm text-phy-text outline-none"
                                >
                                    <option value="">选择已保存配置</option>
                                    {apiProfiles.map((profile) => (
                                        <option key={profile.id} value={profile.id}>{formatApiProfileOptionLabel(profile)}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleApplySelectedApiProfile}
                                    disabled={!selectedApiProfileId}
                                    className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40"
                                >
                                    应用
                                </button>
                                <button
                                    onClick={handleDeleteSelectedApiProfile}
                                    disabled={!selectedApiProfileId}
                                    className="px-4 py-3 rounded-xl border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-500/10 disabled:opacity-40"
                                >
                                    删除
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Audio API Card */}
                <div id="audio" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                            <Mic size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg">语音识别服务</h3>
                            <p className="text-xs text-phy-muted mt-1">用于录音转文字、听力材料处理和语音输入。</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-phy-border bg-phy-bg/50 p-4">
                        <div>
                            <div className="text-sm font-bold text-phy-text">语音识别需自行配置</div>
                            <div className="text-xs text-phy-muted mt-1">接口地址、模型和密钥不向普通用户展示。</div>
                        </div>
                        <button
                            onClick={handleAudioTest}
                            disabled={audioConnectionStatus === 'testing'}
                            className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 justify-center ${audioConnectionStatus === 'success' ? 'bg-green-500 text-white' :
                                audioConnectionStatus === 'error' ? 'bg-red-500 text-white' :
                                    'bg-pink-600 text-white hover:bg-pink-700'
                                }`}
                        >
                            {audioConnectionStatus === 'testing' ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : audioConnectionStatus === 'success' ? (
                                <><CheckCircle size={16} /> 语音可用</>
                            ) : audioConnectionStatus === 'error' ? (
                                <><X size={16} /> 连接失败</>
                            ) : (
                                '测试语音识别'
                            )}
                        </button>
                    </div>
                    <div className="mt-4 rounded-2xl border border-phy-border bg-phy-bg/40 p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-bold text-phy-text">自定义语音识别（可选）</h4>
                                <p className="text-xs text-phy-muted mt-1">需要使用自己的语音识别服务时再填写。</p>
                            </div>
                            <button
                                onClick={() => {
                                    updateSetting('audioApiBaseUrl', BUILTIN_API_CONFIG.audioApiBaseUrl);
                                    updateSetting('audioModelName', BUILTIN_API_CONFIG.audioModelName);
                                    updateSetting('audioApiKey', BUILTIN_API_CONFIG.audioApiKey);
                                }}
                                className="px-3 py-2 rounded-xl border border-phy-border text-xs font-bold text-phy-text hover:bg-phy-glassHover"
                            >
                                清空配置
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input
                                type="text"
                                value={settings.audioApiBaseUrl || ''}
                                onChange={(e) => updateSetting('audioApiBaseUrl', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="/api/audio"
                            />
                            <input
                                type="text"
                                value={settings.audioModelName || ''}
                                onChange={(e) => updateSetting('audioModelName', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="语音识别模型"
                            />
                            <input
                                type="password"
                                value={isUsingBuiltinAudioKey ? '' : (settings.audioApiKey || '')}
                                onChange={(e) => updateSetting('audioApiKey', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="输入你的语音 API Key"
                            />
                        </div>
                    </div>
                </div>

                {/* TTS API Card (Output) */}
                <div id="tts" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                            <Volume2 size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg">朗读发音服务</h3>
                            <p className="text-xs text-phy-muted mt-1">用于单词朗读、句子朗读和听力辅助。</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-phy-border bg-phy-bg/50 p-4">
                        <div>
                            <div className="text-sm font-bold text-phy-text">朗读服务需自行配置</div>
                            <div className="text-xs text-phy-muted mt-1">普通用户不需要理解模型或语音参数。</div>
                        </div>
                        <button
                            onClick={handleTTSTest}
                            disabled={ttsConnectionStatus === 'testing'}
                            className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 justify-center ${ttsConnectionStatus === 'success' ? 'bg-green-500 text-white' :
                                ttsConnectionStatus === 'error' ? 'bg-red-500 text-white' :
                                    'bg-purple-600 text-white hover:bg-purple-700'
                                }`}
                        >
                            {ttsConnectionStatus === 'testing' ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : ttsConnectionStatus === 'success' ? (
                                <><CheckCircle size={16} /> 朗读可用</>
                            ) : ttsConnectionStatus === 'error' ? (
                                <><X size={16} /> 连接失败</>
                            ) : (
                                '测试朗读'
                            )}
                        </button>
                    </div>
                    <div className="mt-4 rounded-2xl border border-phy-border bg-phy-bg/40 p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-bold text-phy-text">自定义朗读服务（可选）</h4>
                                <p className="text-xs text-phy-muted mt-1">可填写自己的 TTS 地址、模型、音色和密钥。</p>
                            </div>
                            <button
                                onClick={resetTtsSettings}
                                className="px-3 py-2 rounded-xl border border-phy-border text-xs font-bold text-phy-text hover:bg-phy-glassHover"
                            >
                                清空配置
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                                type="text"
                                value={settings.ttsApiBaseUrl || ''}
                                onChange={(e) => updateSetting('ttsApiBaseUrl', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="例如 https://api.302.ai/bigmodel/api/paas/v4/audio/speech"
                            />
                            <input
                                type="text"
                                value={settings.ttsModelName || ''}
                                onChange={(e) => updateSetting('ttsModelName', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="朗读模型"
                            />
                            <input
                                type="text"
                                value={settings.ttsVoice || ''}
                                onChange={(e) => updateSetting('ttsVoice', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="音色 Voice"
                            />
                            <input
                                type="password"
                                value={isUsingBuiltinTtsKey ? '' : (settings.ttsApiKey || '')}
                                onChange={(e) => updateSetting('ttsApiKey', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="输入你的朗读 API Key"
                            />
                        </div>
                        <div className="rounded-2xl border border-phy-border bg-phy-bg/50 p-4 space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <div>
                                    <div className="text-sm font-bold text-phy-text">高级 TTS 接口适配</div>
                                    <div className="text-xs text-phy-muted mt-1">不同厂商的 TTS 请求体和返回结构不一样，可以在这里自己写模板。</div>
                                </div>
                                <button
                                    onClick={applyMimoTtsTemplate}
                                    className="px-3 py-2 rounded-xl border border-purple-500/40 text-xs font-bold text-purple-500 hover:bg-purple-500/10"
                                >
                                    套用 MiMo 模板
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <select
                                    value={settings.ttsRequestMode || 'speech'}
                                    onChange={(e) => updateSetting('ttsRequestMode', e.target.value)}
                                    className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm text-phy-text outline-none"
                                >
                                    <option value="speech">默认：/audio/speech 音频流</option>
                                    <option value="custom">自定义：完整 URL + JSON 模板</option>
                                </select>
                                <select
                                    value={settings.ttsCustomResponseType || 'raw'}
                                    onChange={(e) => updateSetting('ttsCustomResponseType', e.target.value)}
                                    disabled={(settings.ttsRequestMode || 'speech') !== 'custom'}
                                    className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm text-phy-text outline-none disabled:opacity-50"
                                >
                                    <option value="raw">响应就是音频文件</option>
                                    <option value="json_base64">JSON 里包含 base64 音频</option>
                                </select>
                                <input
                                    type="text"
                                    value={settings.ttsCustomAudioPath || ''}
                                    onChange={(e) => updateSetting('ttsCustomAudioPath', e.target.value)}
                                    disabled={(settings.ttsRequestMode || 'speech') !== 'custom' || settings.ttsCustomResponseType !== 'json_base64'}
                                    className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none disabled:opacity-50"
                                    placeholder="base64 路径，如 choices.0.message.audio.data"
                                />
                                <input
                                    type="text"
                                    value={settings.ttsCustomAudioMimeType || ''}
                                    onChange={(e) => updateSetting('ttsCustomAudioMimeType', e.target.value)}
                                    disabled={(settings.ttsRequestMode || 'speech') !== 'custom' || settings.ttsCustomResponseType !== 'json_base64'}
                                    className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none disabled:opacity-50"
                                    placeholder="音频 MIME，如 audio/wav"
                                />
                            </div>

                            {(settings.ttsRequestMode || 'speech') === 'custom' && (
                                <div className="space-y-3">
                                    <textarea
                                        value={settings.ttsCustomStylePrompt || ''}
                                        onChange={(e) => updateSetting('ttsCustomStylePrompt', e.target.value)}
                                        className="w-full min-h-[72px] bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none resize-y"
                                        placeholder="可选：{{style}} 风格指令，例如 Clear English listening narration, steady pace."
                                    />
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        <textarea
                                            value={settings.ttsCustomHeaders || DEFAULT_TTS_CUSTOM_HEADERS}
                                            onChange={(e) => updateSetting('ttsCustomHeaders', e.target.value)}
                                            className="w-full min-h-[180px] bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none resize-y"
                                            spellCheck={false}
                                            placeholder={DEFAULT_TTS_CUSTOM_HEADERS}
                                        />
                                        <textarea
                                            value={settings.ttsCustomBody || DEFAULT_TTS_CUSTOM_BODY}
                                            onChange={(e) => updateSetting('ttsCustomBody', e.target.value)}
                                            className="w-full min-h-[180px] bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none resize-y"
                                            spellCheck={false}
                                            placeholder={DEFAULT_TTS_CUSTOM_BODY}
                                        />
                                    </div>
                                    <div className="text-xs text-phy-muted">
                                        可用变量：{'{{apiKey}}'}、{'{{model}}'}、{'{{voice}}'}、{'{{text}}'}、{'{{style}}'}。
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Image Generation API Card */}
                <div id="image" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                            <ImageIcon size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg">学习总结图服务</h3>
                            <p className="text-xs text-phy-muted mt-1">用于生成每日学习成果图和学习故事图。</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-phy-border bg-phy-bg/50 p-4">
                        <div>
                            <div className="text-sm font-bold text-phy-text">图像生成需自行配置</div>
                            <div className="text-xs text-phy-muted mt-1">测试会消耗少量额度，请只在需要排查时使用。</div>
                        </div>
                        <button
                            onClick={handleImageGenTest}
                            disabled={imageGenConnectionStatus === 'testing'}
                            className={`px-5 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2 justify-center ${imageGenConnectionStatus === 'success' ? 'bg-green-500 text-white' :
                                imageGenConnectionStatus === 'error' ? 'bg-red-500 text-white' :
                                    'bg-amber-500 text-white hover:bg-amber-600'
                                }`}
                        >
                            {imageGenConnectionStatus === 'testing' ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : imageGenConnectionStatus === 'success' ? (
                                <><CheckCircle size={16} /> 生图可用</>
                            ) : imageGenConnectionStatus === 'error' ? (
                                <><X size={16} /> 连接失败</>
                            ) : (
                                <><ImageIcon size={16} /> 测试生图</>
                            )}
                        </button>
                    </div>
                    <div className="mt-4 rounded-2xl border border-phy-border bg-phy-bg/40 p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h4 className="text-sm font-bold text-phy-text">自定义生图服务（可选）</h4>
                                <p className="text-xs text-phy-muted mt-1">可填写自己的图像生成接口和密钥。</p>
                            </div>
                            <button
                                onClick={() => {
                                    updateSetting('imageGenApiUrl', BUILTIN_API_CONFIG.imageGenApiUrl);
                                    updateSetting('imageGenModel', BUILTIN_API_CONFIG.imageGenModel);
                                    updateSetting('imageGenApiKey', BUILTIN_API_CONFIG.imageGenApiKey);
                                }}
                                className="px-3 py-2 rounded-xl border border-phy-border text-xs font-bold text-phy-text hover:bg-phy-glassHover"
                            >
                                清空配置
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <input
                                type="text"
                                value={settings.imageGenApiUrl || ''}
                                onChange={(e) => updateSetting('imageGenApiUrl', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="/api/image"
                            />
                            <input
                                type="text"
                                value={settings.imageGenModel || ''}
                                onChange={(e) => updateSetting('imageGenModel', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="生图模型"
                            />
                            <input
                                type="password"
                                value={isUsingBuiltinImageKey ? '' : (settings.imageGenApiKey || '')}
                                onChange={(e) => updateSetting('imageGenApiKey', e.target.value)}
                                className="bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm font-mono text-phy-text outline-none"
                                placeholder="输入你的生图 API Key"
                            />
                        </div>
                    </div>
                </div>
                {/* System Prompt Card */}
                <div id="system" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex items-center gap-3 text-phy-text font-bold font-bold border-b border-phy-border pb-4 mb-6">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Settings size={20} />
                        </div>
                        <h3 className="text-lg">AI 指令与学习偏好</h3>
                    </div>
                    <div>
                        <div>
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                AI 回答风格
                            </label>
                            <textarea
                                value={settings.systemPrompt}
                                onChange={(e) => updateSetting('systemPrompt', e.target.value)}
                                className="w-full bg-phy-bg border border-phy-border rounded-xl p-4 text-sm focus:bg-phy-glass focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-phy-text min-h-[100px] mb-6"
                                placeholder="设置 AI 应该如何回答和辅导..."
                            />
                        </div>
                        <div className="pt-4 border-t border-phy-border/30">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                深度笔记生成格式
                            </label>
                            <textarea
                                value={settings.deepNotePrompt || ''}
                                onChange={(e) => updateSetting('deepNotePrompt', e.target.value)}
                                className="w-full bg-phy-bg border border-phy-border rounded-xl p-4 text-sm focus:bg-phy-glass focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-phy-text min-h-[200px] mb-2"
                                placeholder="编辑深度笔记的生成格式..."
                            />
                            <p className="text-[11px] text-phy-muted mb-4">
                                可用占位符: <code className="bg-phy-border px-1 rounded font-mono">{"{{word}}"}</code> (当前单词), <code className="bg-phy-border px-1 rounded font-mono">{"{{context}}"}</code> (上下文例文)。保留核心 markdown 骨架以确保最佳排版效果。
                            </p>
                            
                            {/* AI Prompt Optimizer Magic Wand */}
                            <div className="flex items-center gap-2 mb-6">
                                <div className="relative flex-1">
                                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-phy-muted">
                                        <Wand2 size={14} />
                                    </div>
                                    <input
                                        type="text"
                                        value={promptInstruction}
                                        onChange={(e) => setPromptInstruction(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleOptimizePrompt(); }}
                                        disabled={isOptimizingPrompt}
                                        placeholder="告诉 AI 修改想法... (如: 增加托福考点剖析)"
                                        className="w-full pl-9 pr-4 py-2.5 bg-phy-glass border border-indigo-500/30 rounded-xl text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all placeholder:text-indigo-400/50 text-indigo-100"
                                    />
                                </div>
                                <button
                                    onClick={handleOptimizePrompt}
                                    disabled={!promptInstruction.trim() || isOptimizingPrompt}
                                    className="px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-500/50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
                                >
                                    {isOptimizingPrompt ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                    <span className="hidden sm:inline">{isOptimizingPrompt ? "优化中..." : "AI 帮我改"}</span>
                                </button>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-phy-border/30">
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                词汇提取数量
                            </label>
                            <input
                                type="text"
                                value={settings.vocabCount}
                                onChange={(e) => updateSetting('vocabCount', e.target.value)}
                                className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:bg-phy-glass focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-phy-text"
                                placeholder="e.g. 10-15 or 20"
                            />
                            <p className="text-[11px] text-phy-muted mt-2">
                                设置 AI 在分析文章时抓取的生词目标数量。
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
                        <h3 className="text-lg">效率工具</h3>
                    </div>

                    <div className="space-y-6">
                        <Toggle
                            title="开启全局番茄钟"
                            checked={settings.showPomodoro}
                            onChange={(v) => updateSetting('showPomodoro', v)}
                        />

                        {settings.showPomodoro && (
                            <div className="grid grid-cols-2 gap-4 animate-fade-in-up">
                                <div>
                                    <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-2">
                                        专注时长（分钟）
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
                                        休息时长（分钟）
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
                                词汇批量导入上限
                            </label>
                            <select
                                value={settings.vocabLimit || ''}
                                onChange={(e) => updateSetting('vocabLimit', e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm focus:bg-phy-glass focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-medium text-phy-text"
                            >
                                <option value="">无限制</option>
                                <option value="50">50 词</option>
                                <option value="100">100 词</option>
                                <option value="200">200 词</option>
                                <option value="500">500 词</option>
                            </select>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">限制每次批量导入提取的最大词汇数量，设置上限可加快处理速度</p>
                        </div>
                    </div>
                </div>

                {/* Mobile Bottom Navigation Settings */}
                <div id="mobile_nav" className="bg-phy-glass rounded-[2rem] p-8 shadow-sm border border-phy-border scroll-mt-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-phy-border pb-4 mb-6">
                        <div className="flex items-center gap-3 text-phy-text font-bold">
                            <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
                                <Smartphone size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg">手机底部菜单栏</h3>
                                <p className="text-xs text-phy-muted mt-1">选择常用功能并调整顺序，底部会一直保留“菜单”入口。</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={resetMobileBottomTabs}
                            className="self-start sm:self-auto px-4 py-2 rounded-xl border border-phy-border text-sm font-bold text-phy-muted hover:text-phy-text hover:bg-phy-bg transition-all flex items-center gap-2"
                        >
                            <RotateCcw size={16} />
                            恢复默认
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider">
                                    当前底栏顺序
                                </label>
                                <span className="text-xs text-phy-muted">{mobileBottomTabIds.length}/{MOBILE_BOTTOM_TAB_LIMIT}</span>
                            </div>
                            <div className="space-y-2">
                                {mobileBottomTabIds.map((id, index) => {
                                    const item = MOBILE_NAV_ITEMS.find((option) => option.id === id);
                                    if (!item) return null;
                                    const Icon = MOBILE_NAV_ICON_MAP[item.icon] || Smartphone;
                                    return (
                                        <div key={id} className="flex items-center gap-3 rounded-2xl border border-phy-border bg-phy-bg/50 px-3 py-3">
                                            <div className="w-8 h-8 rounded-xl bg-phy-accentGlass text-phy-accent flex items-center justify-center shrink-0">
                                                <Icon size={17} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-bold text-phy-text truncate">{item.label}</div>
                                                <div className="text-[11px] text-phy-muted">显示为：{item.shortLabel || item.label}</div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => moveMobileBottomTab(id, -1)}
                                                    disabled={index === 0}
                                                    className="px-2 py-1 rounded-lg text-xs font-bold border border-phy-border text-phy-muted disabled:opacity-30 hover:bg-phy-glass"
                                                >
                                                    上移
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveMobileBottomTab(id, 1)}
                                                    disabled={index === mobileBottomTabIds.length - 1}
                                                    className="px-2 py-1 rounded-lg text-xs font-bold border border-phy-border text-phy-muted disabled:opacity-30 hover:bg-phy-glass"
                                                >
                                                    下移
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-3">
                                可选功能
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {MOBILE_NAV_ITEMS.map((item) => {
                                    const selected = mobileBottomTabIdSet.has(item.id);
                                    const disabled = !selected && isMobileTabLimitReached;
                                    const Icon = MOBILE_NAV_ICON_MAP[item.icon] || Smartphone;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => toggleMobileBottomTab(item.id)}
                                            className={`min-h-[74px] rounded-2xl border p-3 text-left transition-all flex flex-col justify-between ${selected
                                                ? 'border-sky-500/50 bg-sky-500/10 text-sky-500'
                                                : 'border-phy-border bg-phy-bg/40 text-phy-muted hover:bg-phy-glass hover:text-phy-text'
                                                } ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <Icon size={18} />
                                                <span className={`w-5 h-5 rounded-full border flex items-center justify-center ${selected ? 'bg-sky-500 border-sky-500 text-white' : 'border-phy-border'}`}>
                                                    {selected && <Check size={12} strokeWidth={3} />}
                                                </span>
                                            </div>
                                            <span className="text-sm font-bold">{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-phy-muted mt-3">
                                最多选择 {MOBILE_BOTTOM_TAB_LIMIT} 个常用入口；完整功能仍可通过底部“菜单”打开。
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
                        <h3 className="text-lg">自定义漫画风格</h3>
                    </div>

                    {/* List Existing Custom Styles */}
                    <div className="mb-8">
                        <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-3">
                            已添加的自定义风格
                        </label>
                        <div className="space-y-3">
                            {settings.customStyles?.length > 0 ? (
                                settings.customStyles.map(style => (
                                    <div key={style.id} className="flex items-center justify-between p-4 bg-phy-bg border border-phy-border rounded-xl group hover:border-pink-200 hover:bg-pink-50/30 transition-all">
                                        <div className="flex-1 min-w-0 mr-4">
                                            <div className="font-bold text-phy-text font-bold text-sm flex items-center gap-2">
                                                {style.name}
                                                <span className="text-[10px] bg-pink-100 text-pink-600 px-1.5 py-0.5 rounded font-medium">自定义</span>
                                            </div>
                                            <div className="text-xs text-phy-muted truncate mt-1 font-mono">{style.prompt}</div>
                                        </div>
                                        <button
                                            onClick={() => removeCustomStyle(style.id)}
                                            className="p-2 text-phy-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                            title="删除风格"
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
                                    风格名称
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
                                    画风描述 / 关键词
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
                                        添加
                                    </button>
                                </div>
                                <p className="text-[10px] text-phy-muted mt-1.5">
                                    建议使用清晰的画风关键词，例如“赛博朋克、胶片感、低饱和、手绘线条”。
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
                        <h3 className="text-lg">通用与性能</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Toggle
                            title="⚡ 快速模式（预加载页面）"
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
                        <h3 className="text-lg">外观与主题</h3>
                    </div>

                    {/* === Theme Switcher === */}
                    <div className="mb-8">
                        <label className="block text-xs font-bold text-phy-muted uppercase tracking-wider mb-4">
                            配色方案
                        </label>
                        <p className="text-xs text-phy-muted mb-2">推荐主题</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 gap-3 mb-4">
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
                            <button onClick={() => setTheme('prussian')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'prussian' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#f1f5f9] opacity-50 group-hover:opacity-80 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Prussian {theme === 'prussian' && <Check size={14} className="text-blue-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full border border-phy-border bg-[#f1f5f9]"></div><div className="w-4 h-4 rounded-full bg-[#3b82f6]"></div></div>
                            </button>
                        </div>

                        <p className="text-xs text-phy-muted mb-2">更多主题</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            <button onClick={() => setTheme('radiation')} className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group ${theme === 'radiation' ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-phy-border hover:border-phy-borderHover'}`}>
                                <div className="absolute inset-0 bg-[#111810] opacity-10 group-hover:opacity-20 transition-opacity"></div>
                                <div className="text-xs font-bold text-phy-text font-bold mb-1 relative z-10 flex items-center justify-between">Radiation {theme === 'radiation' && <Check size={14} className="text-emerald-500" />}</div>
                                <div className="flex gap-1 relative z-10"><div className="w-4 h-4 rounded-full bg-[#111810]"></div><div className="w-4 h-4 rounded-full bg-[#4ade80]"></div></div>
                            </button>
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
                                    value={settings.backgroundImage?.startsWith('data:') ? '已上传本地图片' : (settings.backgroundImage || '')}
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
                                                alert("背景设置成功。");
                                            } catch (err) {
                                                alert("背景保存失败：" + err.message);
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
                                可以粘贴图片链接，也可以上传本地图片。
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
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">控制背景图片上方的磨砂遮罩强度。</p>
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
                            <label className="text-sm font-medium text-phy-text mb-1 block">每日复习上限</label>
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="1"
                                    max="1000"
                                    value={settings.maxReviewCards || 200}
                                    onChange={e => updateSetting('maxReviewCards', Math.max(1, parseInt(e.target.value) || 200))}
                                    className="w-24 px-3 py-2 border border-phy-border rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                                />
                                <span className="text-sm text-phy-muted">张 / 天</span>
                            </div>
                            <p className="text-[11px] text-phy-muted mt-2 ml-1">
                                控制今日复习队列最多纳入多少张到期卡片，避免一次聚集过多。默认 200 张。
                            </p>
                        </div>
                    </div>
                </div>

                <KnowledgeLinkingSettingsCard />

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
