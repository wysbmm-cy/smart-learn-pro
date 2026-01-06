import React, { useState, useEffect } from 'react';
import {
    Target, TrendingUp, AlertTriangle, Zap, CheckCircle, XCircle,
    ArrowRight, RefreshCw, Trophy, Shield, Eye
} from 'lucide-react';
import { getRecentDrillLogs, getDiagnosis, saveDiagnosis } from '../services/db';
import { generateDiagnosis, generateRemediationDrills } from '../services/ai';
import DrillCard from './DrillCard';
import { useApp } from '../context/AppContext';

/**
 * RemediationHub Component - A.I.R. System UI
 * Implements: Daily Diagnosis + Mastery Lock + Dynamic Item Feed
 * Now supports prefetched data to skip loading phase
 */
const RemediationHub = ({ onClose, prefetchedData }) => {
    const { settings } = useApp();

    // Phase states
    const [phase, setPhase] = useState('loading'); // loading, diagnosis, training, complete
    const [diagnosis, setDiagnosis] = useState(null);
    const [drills, setDrills] = useState([]);
    const [currentDrillIndex, setCurrentDrillIndex] = useState(0);

    // Mastery Lock system
    const [confidenceScore, setConfidenceScore] = useState(0);
    const TARGET_SCORE = 100;
    const CORRECT_POINTS = 20;
    const WRONG_PENALTY = 40;

    // Stats
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongCount, setWrongCount] = useState(0);
    const [dynamicDrillsAdded, setDynamicDrillsAdded] = useState(0);

    // Load diagnosis on mount (or use prefetched)
    useEffect(() => {
        if (prefetchedData?.diagnosis) {
            // Use prefetched data - skip loading!
            setDiagnosis(prefetchedData.diagnosis);
            if (prefetchedData.drills?.length > 0) {
                setDrills(prefetchedData.drills);
                setPhase('training'); // Go directly to training!
            } else {
                setPhase('diagnosis');
            }
        } else {
            loadDiagnosis();
        }
    }, [prefetchedData]);

    const loadDiagnosis = async () => {
        setPhase('loading');

        // Get today's date
        const today = new Date().toISOString().split('T')[0];

        // Check if we already have today's diagnosis
        let existingDiagnosis = await getDiagnosis(today);

        if (existingDiagnosis) {
            setDiagnosis(existingDiagnosis);
            setPhase('diagnosis');
            return;
        }

        // Generate new diagnosis from yesterday's logs
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();
        const recentLogs = await getRecentDrillLogs(yesterday);

        if (recentLogs.length === 0) {
            // No data to diagnose
            setDiagnosis({
                primary_weakness: 'none',
                analysis_summary: '暂无诊断数据。请先完成一些练习题以生成诊断报告。',
                prescription: '去闪卡复习页面完成一些练习吧！'
            });
            setPhase('diagnosis');
            return;
        }

        // Generate AI diagnosis
        const newDiagnosis = await generateDiagnosis(recentLogs, settings);

        if (newDiagnosis) {
            await saveDiagnosis(today, newDiagnosis);
            setDiagnosis(newDiagnosis);
        } else {
            setDiagnosis({
                primary_weakness: 'error',
                analysis_summary: '诊断生成失败，请检查 API 设置。'
            });
        }

        setPhase('diagnosis');
    };

    const startTraining = async () => {
        if (!diagnosis || diagnosis.primary_weakness === 'none' || diagnosis.primary_weakness === 'error') {
            return;
        }

        setPhase('loading');

        // Generate remediation drills
        const newDrills = await generateRemediationDrills(diagnosis, settings, 5);

        if (newDrills.length > 0) {
            setDrills(newDrills);
            setCurrentDrillIndex(0);
            setConfidenceScore(0);
            setCorrectCount(0);
            setWrongCount(0);
            setPhase('training');
        } else {
            alert('题目生成失败，请检查 API 设置');
            setPhase('diagnosis');
        }
    };

    const handleDrillComplete = async (isCorrect) => {
        if (isCorrect) {
            setCorrectCount(prev => prev + 1);
            setConfidenceScore(prev => Math.min(prev + CORRECT_POINTS, TARGET_SCORE));
        } else {
            setWrongCount(prev => prev + 1);
            setConfidenceScore(prev => Math.max(prev - WRONG_PENALTY, 0));

            // Dynamic feed: Add 2 more drills when wrong
            const additionalDrills = await generateRemediationDrills(diagnosis, settings, 2);
            if (additionalDrills.length > 0) {
                setDrills(prev => [...prev, ...additionalDrills]);
                setDynamicDrillsAdded(prev => prev + additionalDrills.length);
            }
        }

        // Check if mastery achieved
        const newScore = isCorrect
            ? Math.min(confidenceScore + CORRECT_POINTS, TARGET_SCORE)
            : Math.max(confidenceScore - WRONG_PENALTY, 0);

        if (newScore >= TARGET_SCORE) {
            setPhase('complete');
            return;
        }

        // Move to next drill
        if (currentDrillIndex < drills.length - 1) {
            setCurrentDrillIndex(prev => prev + 1);
        } else {
            // All drills done but not mastered - generate more
            const moreDrills = await generateRemediationDrills(diagnosis, settings, 3);
            if (moreDrills.length > 0) {
                setDrills(prev => [...prev, ...moreDrills]);
                setCurrentDrillIndex(drills.length);
                setDynamicDrillsAdded(prev => prev + moreDrills.length);
            } else {
                // Cannot generate more, end anyway
                setPhase('complete');
            }
        }
    };

    // Render loading
    if (phase === 'loading') {
        return (
            <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center z-50">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-white text-lg">正在分析学习数据...</p>
                </div>
            </div>
        );
    }

    // Render diagnosis report
    if (phase === 'diagnosis') {
        const getWeaknessIcon = () => {
            switch (diagnosis?.primary_weakness) {
                case 'orthographic_confusion': return <Eye className="text-amber-400" size={32} />;
                case 'collocation_error': return <Target className="text-rose-400" size={32} />;
                case 'semantic_confusion': return <AlertTriangle className="text-orange-400" size={32} />;
                case 'register_mismatch': return <Shield className="text-purple-400" size={32} />;
                default: return <Zap className="text-emerald-400" size={32} />;
            }
        };

        const getWeaknessLabel = () => {
            const labels = {
                'orthographic_confusion': '👀 形近词混淆',
                'collocation_error': '🔗 搭配错误',
                'semantic_confusion': '📖 语义混淆',
                'register_mismatch': '🎭 语体不当',
                'morphological_error': '🔄 词形错误',
                'none': '✅ 状态良好',
                'error': '⚠️ 诊断失败'
            };
            return labels[diagnosis?.primary_weakness] || '未知';
        };

        return (
            <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex items-center justify-center z-50 p-4">
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-lg w-full border border-white/20 shadow-2xl">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex p-4 bg-white/10 rounded-full mb-4">
                            {getWeaknessIcon()}
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">🩺 A.I.R. 智能诊断报告</h1>
                        <p className="text-indigo-200 text-sm">Adaptive Intelligence & Remediation</p>
                    </div>

                    {/* Diagnosis Content */}
                    <div className="space-y-4 mb-8">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                            <div className="text-xs text-indigo-300 uppercase tracking-wider mb-1">病灶诊断</div>
                            <div className="text-xl font-bold text-white">{getWeaknessLabel()}</div>
                        </div>

                        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                            <div className="text-xs text-indigo-300 uppercase tracking-wider mb-1">深度分析</div>
                            <div className="text-white/90">{diagnosis?.analysis_summary}</div>
                        </div>

                        {diagnosis?.prescription && (
                            <div className="bg-emerald-500/20 rounded-xl p-4 border border-emerald-400/30">
                                <div className="text-xs text-emerald-300 uppercase tracking-wider mb-1">💊 今日处方</div>
                                <div className="text-emerald-100">{diagnosis.prescription}</div>
                            </div>
                        )}

                        {diagnosis?.confused_pairs?.length > 0 && (
                            <div className="bg-amber-500/20 rounded-xl p-4 border border-amber-400/30">
                                <div className="text-xs text-amber-300 uppercase tracking-wider mb-2">⚠️ 混淆词对</div>
                                <div className="flex flex-wrap gap-2">
                                    {diagnosis.confused_pairs.map((pair, i) => (
                                        <span key={i} className="px-3 py-1 bg-amber-900/50 text-amber-200 rounded-full text-sm">
                                            {pair.wrong} ↔ {pair.correct}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-all"
                        >
                            返回
                        </button>
                        {diagnosis?.primary_weakness !== 'none' && diagnosis?.primary_weakness !== 'error' && (
                            <button
                                onClick={startTraining}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                            >
                                🚀 开始特训 <ArrowRight size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Render training phase
    if (phase === 'training') {
        const currentDrill = drills[currentDrillIndex];
        const progressPercent = (confidenceScore / TARGET_SCORE) * 100;

        return (
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-indigo-900 to-purple-900 z-50 overflow-auto">
                {/* Header with Mastery Bar */}
                <div className="sticky top-0 bg-black/30 backdrop-blur-lg border-b border-white/10 p-4">
                    <div className="max-w-2xl mx-auto">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-white">
                                <Target size={20} className="text-indigo-400" />
                                <span className="font-bold">🦅 鹰眼特训</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                                <span className="text-emerald-400">✓ {correctCount}</span>
                                <span className="text-rose-400">✗ {wrongCount}</span>
                                <span className="text-amber-400">+{dynamicDrillsAdded} 追加</span>
                            </div>
                        </div>

                        {/* Confidence Score Bar */}
                        <div className="relative">
                            <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-emerald-400 transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                                信心值: {confidenceScore} / {TARGET_SCORE}
                            </div>
                        </div>

                        <div className="text-center text-xs text-indigo-300 mt-2">
                            第 {currentDrillIndex + 1} / {drills.length} 题 • 答对 +{CORRECT_POINTS} • 答错 -{WRONG_PENALTY}
                        </div>
                    </div>
                </div>

                {/* Drill Card */}
                <div className="p-4 max-w-2xl mx-auto mt-8">
                    {currentDrill && (
                        <DrillCard
                            drill={currentDrill}
                            onComplete={handleDrillComplete}
                        />
                    )}
                </div>
            </div>
        );
    }

    // Render complete phase
    if (phase === 'complete') {
        return (
            <div className="fixed inset-0 bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900 flex items-center justify-center z-50 p-4">
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-lg w-full border border-white/20 shadow-2xl text-center">
                    <div className="inline-flex p-6 bg-emerald-500/20 rounded-full mb-6">
                        <Trophy className="text-emerald-400" size={48} />
                    </div>

                    <h1 className="text-3xl font-bold text-white mb-2">🎉 通关成功！</h1>
                    <p className="text-emerald-200 mb-8">你已证明彻底掌握了今日弱点</p>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-white/5 rounded-xl p-4">
                            <div className="text-2xl font-bold text-emerald-400">{correctCount}</div>
                            <div className="text-xs text-white/60">正确</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4">
                            <div className="text-2xl font-bold text-rose-400">{wrongCount}</div>
                            <div className="text-xs text-white/60">错误</div>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4">
                            <div className="text-2xl font-bold text-amber-400">{dynamicDrillsAdded}</div>
                            <div className="text-xs text-white/60">追加题</div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl font-bold text-lg transition-all"
                    >
                        完成复习 ✓
                    </button>
                </div>
            </div>
        );
    }

    return null;
};

export default RemediationHub;
