import React, { useState } from 'react';
import { Settings, Server, Wifi, Box, CheckCircle, X, Check, Save } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { checkConnection } from '../services/ai';

const SettingsView = () => {
    const { settings, updateSetting } = useApp();
    const [connectionStatus, setConnectionStatus] = useState('idle');

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
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
