import React, { useState, useEffect } from 'react';
import {
    Brain, Layers, Sparkles, X, Loader, FileText,
    Target, Trophy, Calendar, ChevronRight, Activity, Plus, Trash2, CheckSquare, Square, RefreshCcw, LayoutList, Flag, Clock
} from 'lucide-react';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer
} from 'recharts';
import { useApp } from '../context/AppContext';
import { generatePlanInsight } from '../services/ai';
import { getHistory, getUserGoal, saveUserGoal, getStudyLogs, getDailyPlan, saveDailyPlan, getTasks, saveTask, deleteTask } from '../services/db';
import toast from 'react-hot-toast';

const PlanView = ({ onNavigate }) => {
    const { settings } = useApp();

    // Smart Coach State
    const [smartPlan, setSmartPlan] = useState(null);
    const [loadingPlan, setLoadingPlan] = useState(true);
    const [goalModalOpen, setGoalModalOpen] = useState(false);
    const [userGoal, setUserGoal] = useState({ examName: '', examDate: '', currentLevel: '' });

    // Tasks State
    const [tasks, setTasks] = useState([]);
    const [newTask, setNewTask] = useState('');
    const [taskType, setTaskType] = useState('short'); // 'short' (今日) or 'long' (长期)
    const [activeTab, setActiveTab] = useState('short');

    // Load Data
    useEffect(() => {
        initDashboard();
        loadTasks();
    }, [settings.apiKey]);

    const initDashboard = async (forceRefresh = false) => {
        setLoadingPlan(true);
        try {
            // 1. Load Goal
            const goal = await getUserGoal();
            if (goal) setUserGoal(goal);

            const today = new Date().toISOString().split('T')[0];

            // 2. Check Cache (unless forced)
            if (!forceRefresh) {
                const cachedPlan = await getDailyPlan(today);
                if (cachedPlan) {
                    setSmartPlan(cachedPlan);
                    setLoadingPlan(false);
                    return;
                }
            }

            // 3. Generate New Insight
            if (settings.apiKey) {
                const history = await getHistory();
                const logs = await getStudyLogs();
                const plan = await generatePlanInsight(history || [], goal, logs || [], settings);

                if (plan) {
                    setSmartPlan(plan);
                    await saveDailyPlan(today, plan);
                }
            }
        } catch (e) {
            console.error("Dashboard Init Error", e);
            toast.error("智能计划加载失败");
        } finally {
            setLoadingPlan(false);
        }
    };

    const loadTasks = async () => {
        const t = await getTasks();
        setTasks(t || []);
    };

    const handleSaveGoal = async () => {
        await saveUserGoal(userGoal);
        setGoalModalOpen(false);
        toast.success("目标已更新! 正在重新生成计划...");
        initDashboard(true); // Force refresh
    };

    const handleAddTask = async (e) => {
        e.preventDefault();
        if (!newTask.trim()) return;

        const task = {
            id: crypto.randomUUID(),
            title: newTask,
            completed: false,
            createdAt: Date.now(),
            type: 'manual',
            term: taskType // 'short' or 'long'
        };

        await saveTask(task);
        setNewTask('');
        loadTasks();
        toast.success(taskType === 'short' ? "已添加今日任务" : "已添加长期目标");
    };

    const handleToggleTask = async (task) => {
        await saveTask({ ...task, completed: !task.completed });
        loadTasks();
    };

    const handleDeleteTask = async (id) => {
        await deleteTask(id);
        loadTasks();
    };

    const handleRefreshPlan = () => {
        initDashboard(true);
        toast.success("正在根据最新数据刷新计划...");
    };

    // Filter tasks based on active tab
    const displayedTasks = tasks.filter(t => {
        const isLong = t.term === 'long';
        return activeTab === 'long' ? isLong : !isLong;
    });

    return (
        <div className="h-[calc(100vh-140px)] animate-fade-in flex flex-col items-center p-6 overflow-y-auto custom-scrollbar">

            {/* Header / Intro */}
            <div className="w-full max-w-6xl flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-phy-text flex items-center gap-3">
                        <Brain className="text-indigo-500" size={32} />
                        智能计划 <span className="text-sm font-normal text-phy-muted bg-phy-glassHeavy px-2 py-1 rounded-full border border-phy-border">Smart Coach 2.0</span>
                    </h1>
                    <p className="text-phy-muted mt-2 text-sm">
                        {smartPlan?.schedule_status || "您的 AI 专属学习教练，助您科学备考。"}
                    </p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={handleRefreshPlan}
                        className="px-4 py-2 bg-phy-glassHeavy border border-phy-border text-phy-muted rounded-xl hover:bg-slate-700 flex items-center gap-2 font-medium transition-all text-sm"
                        title="强制刷新 AI 计划"
                    >
                        <RefreshCcw size={16} /> 刷新计划
                    </button>
                    <button
                        onClick={() => setGoalModalOpen(true)}
                        className="px-4 py-2 bg-indigo-600 border border-indigo-500 text-white rounded-xl hover:bg-indigo-500 flex items-center gap-2 font-bold transition-all shadow-lg shadow-indigo-500/20"
                    >
                        <Target size={18} />
                        {userGoal.examName ? `${userGoal.examName}` : "设置目标"}
                    </button>
                </div>
            </div>

            {loadingPlan ? (
                <div className="w-full flex-1 flex flex-col justify-center items-center text-phy-muted gap-4 min-h-[400px]">
                    <Loader size={40} className="animate-spin text-indigo-500" />
                    <p>正在分析您的学习数据并生成今日计划...</p>
                </div>
            ) : (
                <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left & Middle: Smart Coach Dashboard */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Insight Card */}
                        {smartPlan && (
                            <div className="bg-gradient-to-r from-indigo-900/50 to-violet-900/50 text-white p-6 rounded-2xl border border-indigo-500/30 shadow-lg relative overflow-hidden backdrop-blur-sm">
                                <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles size={100} /></div>
                                <h3 className="font-bold text-indigo-200 flex items-center gap-2 mb-2">
                                    <Sparkles size={18} /> 每日洞察 (Daily Insight)
                                </h3>
                                <p className="text-lg font-medium leading-relaxed max-w-2xl text-phy-text">
                                    "{smartPlan.insight}"
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Radar Chart */}
                            <div className="bg-slate-900/40 rounded-2xl border border-phy-border p-6 flex flex-col relative overflow-hidden backdrop-blur-sm">
                                <h3 className="font-bold text-phy-text mb-4 flex items-center gap-2">
                                    <Activity size={18} className="text-emerald-500" />
                                    能力雷达 (Skill Radar)
                                </h3>
                                <div className="flex-1 min-h-[250px] relative -ml-4">
                                    {smartPlan && (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={smartPlan.radar}>
                                                <PolarGrid stroke="#334155" />
                                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                <Radar name="My Skills" dataKey="A" stroke="#818cf8" fill="#6366f1" fillOpacity={0.4} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>

                            {/* Daily Quests */}
                            <div className="flex flex-col gap-4">
                                <h3 className="font-bold text-phy-text flex items-center gap-2">
                                    <Trophy size={18} className="text-amber-500" />
                                    今日挑战 (Daily Quests)
                                </h3>
                                {smartPlan?.daily_quests?.map((quest, idx) => (
                                    <div key={idx} className="bg-slate-800/50 p-4 rounded-xl border border-phy-borderHover hover:border-indigo-500/50 hover:bg-phy-glassHeavy transition-all group cursor-pointer" onClick={() => onNavigate && onNavigate(quest.link || 'home')}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div className={`p-2 rounded-lg ${quest.type === 'vocab' ? 'bg-amber-500/20 text-amber-400' :
                                                    quest.type === 'reading' ? 'bg-blue-500/20 text-blue-400' :
                                                        'bg-purple-500/20 text-purple-400'
                                                }`}>
                                                {quest.type === 'vocab' ? <Layers size={18} /> :
                                                    quest.type === 'reading' ? <Brain size={18} /> :
                                                        <FileText size={18} />}
                                            </div>
                                            <span className="text-xs font-bold text-phy-muted bg-slate-900/50 px-2 py-1 rounded-full border border-phy-border">
                                                {quest.xp || 50} XP
                                            </span>
                                        </div>
                                        <h4 className="font-bold text-phy-text mb-1 group-hover:text-indigo-400 transition-colors">{quest.title}</h4>
                                        <div className="flex items-center gap-1 text-xs text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                            立即开始 <ChevronRight size={12} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right: Custom Tasks (With Long/Short Term) */}
                    <div className="bg-slate-900/30 rounded-2xl border border-phy-border p-6 backdrop-blur-sm flex flex-col h-full">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-phy-text flex items-center gap-2">
                                <LayoutList size={20} className="text-pink-500" />
                                我的任务
                            </h3>
                            {/* Tabs */}
                            <div className="flex bg-slate-950/50 p-1 rounded-lg">
                                <button
                                    onClick={() => setActiveTab('short')}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${activeTab === 'short' ? 'bg-phy-glassHeavy text-white shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                                >
                                    今日
                                </button>
                                <button
                                    onClick={() => setActiveTab('long')}
                                    className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${activeTab === 'long' ? 'bg-phy-glassHeavy text-white shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                                >
                                    长期
                                </button>
                            </div>
                        </div>

                        {/* Task Input */}
                        <form onSubmit={handleAddTask} className="flex flex-col gap-2 mb-6">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newTask}
                                    onChange={(e) => setNewTask(e.target.value)}
                                    placeholder={taskType === 'short' ? "添加今日待办..." : "添加长期目标..."}
                                    className="flex-1 bg-slate-950/50 border border-phy-border rounded-xl px-4 py-2 text-sm text-phy-text focus:outline-none focus:border-indigo-500 transition-colors"
                                />
                                <button type="submit" className="bg-phy-glassHeavy hover:bg-slate-700 text-phy-text p-2 rounded-xl transition-colors">
                                    <Plus size={20} />
                                </button>
                            </div>
                            {/* Task Type Toggle for creation */}
                            <div className="flex gap-4 px-1">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="taskType"
                                        checked={taskType === 'short'}
                                        onChange={() => setTaskType('short')}
                                        className="accent-indigo-500"
                                    />
                                    <span className="text-xs text-phy-muted">⚡ 短期/今日</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="taskType"
                                        checked={taskType === 'long'}
                                        onChange={() => setTaskType('long')}
                                        className="accent-indigo-500"
                                    />
                                    <span className="text-xs text-phy-muted">🚩 长期/阶段</span>
                                </label>
                            </div>
                        </form>

                        {/* Task List */}
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                            {displayedTasks.length === 0 && (
                                <div className="text-center text-phy-muted py-10 text-sm italic">
                                    {activeTab === 'short' ? "今日暂无待办任务。" : "暂无长期目标。"}
                                </div>
                            )}
                            {displayedTasks.map(task => (
                                <div key={task.id} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${task.completed ? 'bg-slate-800/30 opacity-50' : 'bg-slate-800/60 hover:bg-phy-glassHeavy'}`}>
                                    <button onClick={() => handleToggleTask(task)} className="text-phy-muted hover:text-indigo-400 transition-colors">
                                        {task.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                                    </button>
                                    <span className={`flex-1 text-sm ${task.completed ? 'line-through text-phy-muted' : 'text-phy-text'}`}>
                                        {task.title}
                                    </span>
                                    {task.term === 'long' && <Flag size={12} className="text-pink-500/50" />}
                                    <button onClick={() => handleDeleteTask(task.id)} className="text-phy-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 hover:opacity-100 p-1">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            )}

            {/* Goal Setting Modal */}
            {goalModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/60">
                    <div className="bg-phy-glassHeavy border border-phy-borderHover rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-phy-text">设置学习目标</h3>
                            <button onClick={() => setGoalModalOpen(false)}><X size={24} className="text-phy-muted hover:text-white" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-phy-muted mb-1">目标考试 / 预期成果</label>
                                <input
                                    type="text"
                                    value={userGoal.examName}
                                    onChange={e => setUserGoal({ ...userGoal, examName: e.target.value })}
                                    placeholder="例如：CET-6, 雅思, 托福, 商务英语"
                                    className="w-full p-3 bg-slate-950/50 border border-phy-border rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-phy-muted mb-1">考试日期 (可选)</label>
                                <input
                                    type="date"
                                    value={userGoal.examDate}
                                    onChange={e => setUserGoal({ ...userGoal, examDate: e.target.value })}
                                    className="w-full p-3 bg-slate-950/50 border border-phy-border rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-white placeholder-slate-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-phy-muted mb-1">预估当前水平</label>
                                <select
                                    value={userGoal.currentLevel}
                                    onChange={e => setUserGoal({ ...userGoal, currentLevel: e.target.value })}
                                    className="w-full p-3 bg-slate-950/50 border border-phy-border rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none text-white"
                                >
                                    <option value="">请选择...</option>
                                    <option value="Beginner">入门 (A1-A2)</option>
                                    <option value="Intermediate">进阶 (B1-B2)</option>
                                    <option value="Advanced">高阶 (C1-C2)</option>
                                </select>
                            </div>
                            <button
                                onClick={handleSaveGoal}
                                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 mt-2 shadow-lg shadow-indigo-500/20"
                            >
                                保存并生成计划 (Save)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlanView;
