import React, { useState } from 'react';
import { Settings, Server, Wifi, Box, CheckCircle, X, Check, Save, Mic, Download, Database, Palette, Image as ImageIcon, Upload, Trash2, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { checkConnection, checkAudioConnection } from '../services/ai';

const SettingsView = () => {
    const { settings, updateSetting, exportUserData, saveFile, deleteFile } = useApp();
    const [connectionStatus, setConnectionStatus] = useState('idle');
    const [audioConnectionStatus, setAudioConnectionStatus] = useState('idle');

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

    const Toggle = ({ title, checked, onChange }) => (
        <div
            className={`cursor-pointer p-5 rounded-2xl border transition-all duration-200 flex items-center justify-between ${checked
                ? 'bg-blue-50/50 border-blue-200 shadow-sm'
                : 'bg-white border-slate-100 hover:bg-slate-50'
                }`}
            onClick={() => onChange(!checked)}
        >
            <span className={`font-semibold text-sm ${checked ? 'text-blue-700' : 'text-slate-600'}`}>{title}</span>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${checked ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                {checked && <Check size={12} strokeWidth={3} />}
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">

            {/* API Card */}
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 text-slate-800 font-bold border-b border-slate-100 pb-4 mb-6">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <Server size={20} />
                    </div>
                    <h3 className="text-lg">配置 AI 连接</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Base URL */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            API Endpoint URL
                        </label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={settings.apiBaseUrl}
                                onChange={(e) => updateSetting('apiBaseUrl', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono font-medium text-slate-700"
                            />
                            <Wifi size={18} className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2 ml-1">Example: https://api.openai.com/v1</p>
                    </div>

                    {/* Model Name */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Model Name
                        </label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={settings.modelName}
                                onChange={(e) => updateSetting('modelName', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono font-medium text-slate-700"
                            />
                            <Box size={18} className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        </div>
                    </div>

                    {/* API Key */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Security Key (API Key)
                        </label>
                        <div className="flex gap-3">
                            <input
                                type="password"
                                value={settings.apiKey}
                                onChange={(e) => updateSetting('apiKey', e.target.value)}
                                placeholder="sk-..."
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-mono font-medium"
                            />
                            <button
                                onClick={handleTest}
                                disabled={connectionStatus === 'testing' || !settings.apiKey}
                                className={`px-6 py-3.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 min-w-[140px] justify-center ${connectionStatus === 'success' ? 'bg-green-500 text-white shadow-green-200 shadow-md' :
                                    connectionStatus === 'error' ? 'bg-red-500 text-white shadow-red-200 shadow-md' :
                                        'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200'
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
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 text-slate-800 font-bold border-b border-slate-100 pb-4 mb-6">
                    <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                        <Mic size={20} />
                    </div>
                    <h3 className="text-lg">配置语音识别 API (Audio)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Audio Base URL */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Audio Endpoint URL
                        </label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={settings.audioApiBaseUrl}
                                onChange={(e) => updateSetting('audioApiBaseUrl', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all font-mono font-medium text-slate-700"
                                placeholder="Same as Chat API usually..."
                            />
                            <Wifi size={18} className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-pink-500 transition-colors" />
                        </div>
                    </div>

                    {/* Audio Model Name */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Audio Model Name
                        </label>
                        <div className="relative group">
                            <input
                                type="text"
                                value={settings.audioModelName}
                                onChange={(e) => updateSetting('audioModelName', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all font-mono font-medium text-slate-700"
                                placeholder="e.g. whisper-1 or FunAudioLLM/SenseVoiceSmall"
                            />
                            <Box size={18} className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-pink-500 transition-colors" />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2 ml-1">
                            Use <b>whisper-1</b> for OpenAI, or <b>FunAudioLLM/SenseVoiceSmall</b> for SiliconFlow.
                        </p>
                    </div>

                    {/* Audio API Key */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Audio Security Key (Optional)
                        </label>
                        <div className="flex gap-3">
                            <input
                                type="password"
                                value={settings.audioApiKey}
                                onChange={(e) => updateSetting('audioApiKey', e.target.value)}
                                placeholder="Leave empty to use the main API Key above"
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm focus:bg-white focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10 outline-none transition-all font-mono font-medium"
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

            {/* System Prompt Card */}
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 text-slate-800 font-bold border-b border-slate-100 pb-4 mb-6">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Settings size={20} />
                    </div>
                    <h3 className="text-lg">配置 AI 核心人设 (System Prompt)</h3>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                        System Instruction
                    </label>
                    <textarea
                        value={settings.systemPrompt}
                        onChange={(e) => updateSetting('systemPrompt', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-mono text-slate-700 min-h-[120px]"
                        placeholder="Define how the AI should behave..."
                    />
                    <p className="text-[11px] text-slate-400 mt-2">
                        This prompt dictates the AI's personality and expertise.
                    </p>
                </div>
            </div>

            {/* Efficiency Tools Card */}
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 text-slate-800 font-bold border-b border-slate-100 pb-4 mb-6">
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
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    Focus Duration (min)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="120"
                                    value={settings.pomodoroFocus}
                                    onChange={(e) => updateSetting('pomodoroFocus', parseInt(e.target.value) || 25)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 outline-none transition-all font-mono font-bold text-slate-700"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                                    Break Duration (min)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="60"
                                    value={settings.pomodoroBreak}
                                    onChange={(e) => updateSetting('pomodoroBreak', parseInt(e.target.value) || 5)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-green-500 focus:ring-4 focus:ring-green-500/10 outline-none transition-all font-mono font-bold text-slate-700"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modules Card */}
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 text-slate-800 font-bold border-b border-slate-100 pb-4 mb-6">
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
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Vocabulary Quantity Target (词汇提取数量)
                        </label>
                        <input
                            type="text"
                            value={settings.vocabCount}
                            onChange={(e) => updateSetting('vocabCount', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all font-mono text-slate-700"
                            placeholder="e.g. 10-15 or 20"
                        />
                        <p className="text-[11px] text-slate-400 mt-2">
                            Set a target range (e.g. "15-20") or fixed number for key word extraction.
                        </p>
                    </div>
                </div>
            </div>

            {/* Appearance Card (Zen Mode) */}
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 text-slate-800 font-bold border-b border-slate-100 pb-4 mb-6">
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                        <Palette size={20} />
                    </div>
                    <h3 className="text-lg">外观设置 (Zen Mode)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Background Image URL or Upload */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Background Image
                        </label>

                        {/* URL Input */}
                        <div className="relative group mb-3">
                            <input
                                type="text"
                                value={settings.backgroundImage?.startsWith('data:') ? 'Local Image Uploaded' : (settings.backgroundImage || '')}
                                onChange={(e) => !settings.backgroundImage?.startsWith('data:') && updateSetting('backgroundImage', e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:bg-white focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 outline-none transition-all font-mono font-medium text-slate-700"
                                placeholder="https://..."
                                disabled={settings.backgroundImage?.startsWith('data:')}
                            />
                            <ImageIcon size={18} className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-rose-500 transition-colors" />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <label className="cursor-pointer bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2">
                                <Upload size={16} />
                                Upload Local Image
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
                                    className="bg-white border border-red-100 hover:bg-red-50 text-red-500 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Trash2 size={16} />
                                    Clear / Reset
                                </button>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-2 ml-1">
                            Paste a link OR upload a local image (Max 4MB).
                        </p>
                    </div>

                    {/* Glass Opacity */}
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Mist / Fog Opacity ({Math.round((settings.glassOpacity || 0.7) * 100)}%)
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={(settings.glassOpacity || 0.7) * 100}
                            onChange={(e) => updateSetting('glassOpacity', parseInt(e.target.value) / 100)}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-rose-500"
                        />
                        <p className="text-[11px] text-slate-400 mt-2 ml-1">Controls the "fog" density over the background image.</p>
                    </div>
                </div>
            </div>

            {/* Data Management Card */}
            <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 text-slate-800 font-bold border-b border-slate-100 pb-4 mb-6">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                        <Database size={20} />
                    </div>
                    <h3 className="text-lg">数据备份与导出</h3>
                </div>

                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="text-slate-600 text-sm leading-relaxed">
                        <p className="font-bold mb-1">Backup your learning data</p>
                        <p className="text-slate-500">
                            Export your history, notes, and records to a JSON file.
                            (Large media files are excluded to keep the backup lightweight).
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
                        Export Data (JSON)
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
