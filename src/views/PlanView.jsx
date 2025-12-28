import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Target, TrendingUp, Calendar, Zap, Award, ArrowRight, Brain, AlertCircle, Sparkles, Edit2, X } from 'lucide-react';
import { generatePlanInsight } from '../services/ai';
import StudyHeatmap from '../components/StudyHeatmap';

const PlanView = () => {
    const { loadUserFlashcards, settings, stats, updateSetting, saveTask, getTasks, deleteTask } = useApp();
    const [flashcards, setFlashcards] = useState([]);
    const [dailyLoad, setDailyLoad] = useState([]);
    const [projectedDate, setProjectedDate] = useState(null);

    // Custom Goal State
    const [goal, setGoal] = useState(settings.userGoal || "CET-6 核心词汇");
    const [isEditingGoal, setIsEditingGoal] = useState(false);

    // AI Insight State
    const [insight, setInsight] = useState(null);
    const [isLoadingAI, setIsLoadingAI] = useState(false);

    // Task Management State
    const [tasks, setTasks] = useState([]);
    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [newTaskType, setNewTaskType] = useState("short"); // 'short' | 'long'
    const [isAddingTask, setIsAddingTask] = useState(false);

    useEffect(() => {
        const loadWrapper = async () => {
            const data = await loadUserFlashcards();
            setFlashcards(data);
            calculateMetrics(data);

            // Load Tasks
            const loadedTasks = await getTasks();
            setTasks(loadedTasks);
        };
        loadWrapper();
    }, []);

    const calculateMetrics = (cards) => {
        // 1. Future Load
        const load = Array(7).fill(0);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        cards.forEach(card => {
            if (card.nextReview) {
                const diff = card.nextReview - now;
                if (diff > 0) {
                    const dayIndex = Math.floor(diff / oneDay);
                    if (dayIndex < 7) load[dayIndex]++;
                } else {
                    load[0]++;
                }
            }
        });
        setDailyLoad(load);
        return load;
    };

    const fetchAIInsight = async (currentCards, loadData) => {
        if (!settings.apiKey) {
            alert("请先配置 API Key");
            return;
        }
        setIsLoadingAI(true);
        const aiStats = {
            totalWords: currentCards.length,
            dueDay0: loadData[0],
            dueNext7Days: loadData,
            streak: stats.streak
        };

        const result = await generatePlanInsight(settings, goal, aiStats);
        if (result) {
            setInsight(result);
        }
        setIsLoadingAI(false);
    };

    const handleGoalSave = () => {
        setIsEditingGoal(false);
        updateSetting('userGoal', goal);
    };

    const handleAddTask = async () => {
        if (!newTaskTitle.trim()) return;
        const newTask = {
            id: crypto.randomUUID(),
            title: newTaskTitle,
            type: newTaskType,
            completed: false,
            createdAt: Date.now()
        };
        await saveTask(newTask);
        setTasks([newTask, ...tasks]);
        setNewTaskTitle("");
        setIsAddingTask(false);
    };

    const handleToggleTask = async (task) => {
        const updatedTask = { ...task, completed: !task.completed };
        await saveTask(updatedTask);
        setTasks(tasks.map(t => t.id === task.id ? updatedTask : t));
    };

    const handleDeleteTask = async (id) => {
        await deleteTask(id);
        setTasks(tasks.filter(t => t.id !== id));
    };

    const maxLoad = Math.max(...dailyLoad, 10);
    const shortTasks = tasks.filter(t => t.type === 'short');
    const longTasks = tasks.filter(t => t.type === 'long');

    return (
        <div className="space-y-6 animate-fade-in pb-12">

            {/* 1. AI Insight Card */}
            <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-3xl p-6 text-white shadow-lg shadow-indigo-500/30 relative overflow-hidden min-h-[160px]">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Brain size={150} />
                </div>

                {isLoadingAI ? (
                    <div className="flex items-center justify-center h-full gap-3">
                        <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span className="font-bold animate-pulse">AI SmartCoach 正在分析您的学习数据...</span>
                    </div>
                ) : (
                    <div className="relative z-10 flex gap-4">
                        <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shrink-0 border border-white/20">
                            <Zap size={24} className="text-yellow-300 fill-current" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-lg font-bold">AI Daily Insight</h2>
                                <button
                                    onClick={() => fetchAIInsight(flashcards, dailyLoad)}
                                    className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full flex items-center gap-2 text-xs font-bold transition-all"
                                >
                                    <Sparkles size={14} />
                                    Generate Analysis
                                </button>
                            </div>
                            <p className="text-indigo-100 text-sm leading-relaxed max-w-xl">
                                {insight ? insight.insight : `点击右上角 "Generate Analysis" 按钮，获取今日专属 AI 建议。`}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-3">
                    <StudyHeatmap dailyActivity={stats.dailyActivity || {}} />
                </div>

                {/* 2. Left Col: Goal & Load */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Progress Card */}
                    <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center gap-8">
                        {/* Ring */}
                        <div className="relative w-40 h-40 shrink-0">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#f1f5f9" strokeWidth="4" />
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#8b5cf6" strokeWidth="4" strokeDasharray="30, 100" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700">
                                <Brain size={32} className="text-violet-400 mb-1" />
                            </div>
                        </div>

                        {/* Text Info */}
                        <div className="flex-1 text-center sm:text-left w-full">
                            <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                                <Target className="text-violet-500" />
                                {isEditingGoal ? (
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={goal}
                                            onChange={(e) => setGoal(e.target.value)}
                                            className="border-b-2 border-violet-500 outline-none font-bold text-lg text-slate-800 w-full min-w-[200px]"
                                            autoFocus
                                        />
                                        <button onClick={handleGoalSave} className="text-xs bg-violet-600 text-white px-2 py-1 rounded">Save</button>
                                    </div>
                                ) : (
                                    <h3
                                        className="text-xl font-bold text-slate-800 cursor-pointer hover:text-violet-600 flex items-center gap-2"
                                        onClick={() => setIsEditingGoal(true)}
                                        title="Click to edit goal"
                                    >
                                        目标: {goal}
                                        <Edit2 size={14} className="text-slate-300" />
                                    </h3>
                                )}
                            </div>

                            <p className="text-slate-500 text-sm mb-6">
                                {insight?.paceComment || "手动触发 AI 分析以获取进度预测..."}
                            </p>

                            <div className="bg-violet-50 rounded-xl p-4 flex items-center gap-4 border border-violet-100">
                                <div className="p-2 bg-white rounded-lg text-violet-600 shadow-sm">
                                    <Calendar size={20} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-violet-400 uppercase">AI 评估建议 (Coach Says)</div>
                                    <div className="text-sm font-bold text-violet-700 leading-tight mt-1">
                                        {insight ? "根据当前进度，请保持每日复习，可按期达成。" : "暂无评估数据"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Load Chart - UNCHANGED */}
                    <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <TrendingUp className="text-orange-500" />
                                未来 7 天记忆压力 (Memory Load)
                            </h3>
                            <span className="text-xs font-bold bg-orange-50 text-orange-600 px-2 py-1 rounded-lg">Adaptive</span>
                        </div>

                        <div className="flex items-end justify-between h-40 gap-3">
                            {dailyLoad.map((count, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                    <div className="relative w-full bg-slate-100 rounded-t-xl flex items-end justify-center overflow-hidden hover:bg-slate-200 transition-colors" style={{ height: '100%' }}>
                                        <div
                                            className={`w-full transition-all duration-700 ${i === 0 ? 'bg-orange-500' : count > 30 ? 'bg-red-400' : 'bg-blue-400'}`}
                                            style={{ height: `${(count / maxLoad) * 100}%`, minHeight: '4px' }}
                                        />
                                        <div className="absolute top-2 text-[10px] font-bold text-slate-400 group-hover:block hidden">
                                            {count}
                                        </div>
                                    </div>
                                    <span className="text-xs font-bold text-slate-400">
                                        {i === 0 ? 'Today' : `+${i}d`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Task Manager Section - NEW */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Short-term Tasks */}
                        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 min-h-[300px]">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Zap className="text-blue-500" size={18} />
                                短期任务 (Short-term)
                            </h3>
                            <div className="space-y-3">
                                {shortTasks.length === 0 && <div className="text-slate-400 text-center py-6 text-sm">暂无短期任务</div>}
                                {shortTasks.map(task => (
                                    <div key={task.id} className="flex items-start gap-3 group">
                                        <button
                                            onClick={() => handleToggleTask(task)}
                                            className={`mt-1 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${task.completed ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 hover:border-blue-400'}`}
                                        >
                                            {task.completed && <Award size={12} />}
                                        </button>
                                        <div className="flex-1">
                                            <div className={`text-sm font-medium ${task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                {task.title}
                                            </div>
                                        </div>
                                        <button onClick={() => handleDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Long-term Tasks */}
                        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 min-h-[300px]">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Target className="text-purple-500" size={18} />
                                长期规划 (Long-term)
                            </h3>
                            <div className="space-y-3">
                                {longTasks.length === 0 && <div className="text-slate-400 text-center py-6 text-sm">暂无长期规划</div>}
                                {longTasks.map(task => (
                                    <div key={task.id} className="flex items-start gap-3 group">
                                        <button
                                            onClick={() => handleToggleTask(task)}
                                            className={`mt-1 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${task.completed ? 'bg-purple-500 border-purple-500 text-white' : 'border-slate-300 hover:border-purple-400'}`}
                                        >
                                            {task.completed && <Award size={12} />}
                                        </button>
                                        <div className="flex-1">
                                            <div className={`text-sm font-medium ${task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                                {task.title}
                                            </div>
                                        </div>
                                        <button onClick={() => handleDeleteTask(task.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. Right Col: Action Feed + Add Task */}
                <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col h-fit">
                    <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <Award className="text-emerald-500" />
                        添加任务 / AI 推荐
                    </h3>

                    {/* Add Task Input */}
                    <div className="mb-8 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <input
                            value={newTaskTitle}
                            onChange={(e) => setNewTaskTitle(e.target.value)}
                            placeholder="输入任务名称..."
                            className="w-full bg-transparent border-b border-slate-300 focus:border-indigo-500 outline-none text-sm py-2 mb-3 text-slate-900 placeholder:text-slate-400 font-medium"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                        />
                        <div className="flex justify-between items-center">
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setNewTaskType('short')}
                                    className={`text-xs px-2 py-1 rounded-md border transition-all ${newTaskType === 'short' ? 'bg-blue-100 text-blue-600 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}
                                >
                                    短期
                                </button>
                                <button
                                    onClick={() => setNewTaskType('long')}
                                    className={`text-xs px-2 py-1 rounded-md border transition-all ${newTaskType === 'long' ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-white text-slate-500 border-slate-200'}`}
                                >
                                    长期
                                </button>
                            </div>
                            <button
                                onClick={handleAddTask}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg p-1.5 shadow-sm"
                            >
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="space-y-0 relative">
                        {/* Vertical Line */}
                        <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-slate-100"></div>

                        {/* Dynamic Action Items from AI */}
                        {insight?.actionItems ? (
                            <>
                                <div className="text-xs font-bold text-slate-400 mb-4 pl-10 uppercase tracking-wider">AI Suggestions</div>
                                {insight.actionItems.map((item, idx) => (
                                    <div key={idx} className="relative pl-10 pb-6 group">
                                        <div className="absolute left-0 top-0 w-8 h-8 rounded-full bg-indigo-50 border-4 border-white shadow-sm flex items-center justify-center text-indigo-400 z-10 font-bold text-xs ring-1 ring-indigo-500/10">
                                            AI
                                        </div>
                                        <div className="bg-white p-3 rounded-xl border border-slate-100 group-hover:border-indigo-200 shadow-sm">
                                            <h4 className="text-sm font-medium text-slate-600">{item}</h4>
                                        </div>
                                    </div>
                                ))}
                            </>
                        ) : (
                            <div className="text-center py-4 text-slate-400 italic text-xs">
                                暂无 AI 推荐，请先生成分析
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default PlanView;
