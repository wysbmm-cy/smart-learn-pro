import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    BookOpen,
    Check,
    Circle,
    FileQuestion,
    Languages,
    Layers,
    Move,
    NotebookPen,
    PenTool,
    Plus,
    RotateCcw,
    Route,
    Trash2
} from 'lucide-react';

const STORAGE_KEY = 'verbapath_learning_flow_canvas_v1';

const nodeTypes = [
    { type: 'flashcards', label: '闪卡复习', icon: Layers, color: 'from-rose-500 to-orange-400', description: '复习词卡或指定文件夹。' },
    { type: 'review', label: '记忆曲线', icon: Circle, color: 'from-cyan-500 to-blue-500', description: '按复习队列巩固旧内容。' },
    { type: 'exam', label: '阅读与考试', icon: FileQuestion, color: 'from-violet-500 to-indigo-500', description: '做阅读题、证据反驳和段落匹配。' },
    { type: 'translation', label: '翻译挑战', icon: Languages, color: 'from-emerald-500 to-teal-400', description: '两轮翻译训练与反馈。' },
    { type: 'writer', label: 'AI 写作', icon: PenTool, color: 'from-amber-500 to-yellow-400', description: '审题、提纲、写作和诊断。' },
    { type: 'notes', label: '笔记整理', icon: NotebookPen, color: 'from-slate-500 to-zinc-400', description: '整理深度笔记和学习回顾。' }
];

const initialNodes = [
    { id: 'node_flashcards', type: 'flashcards', x: 120, y: 130, status: 'pending' },
    { id: 'node_exam', type: 'exam', x: 420, y: 130, status: 'pending' },
    { id: 'node_translation', type: 'translation', x: 720, y: 130, status: 'pending' },
    { id: 'node_writer', type: 'writer', x: 1020, y: 130, status: 'pending' },
    { id: 'node_notes', type: 'notes', x: 1320, y: 130, status: 'pending' }
];

const getNodeMeta = (type) => nodeTypes.find((item) => item.type === type) || nodeTypes[0];

const loadNodes = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (Array.isArray(saved) && saved.length) return saved;
    } catch {
        // ignore invalid local drafts
    }
    return initialNodes;
};

const LearningFlowCanvasView = ({ onNavigate }) => {
    const [nodes, setNodes] = useState(loadNodes);
    const [selectedId, setSelectedId] = useState(null);
    const [dragState, setDragState] = useState(null);
    const [showGuidePanel, setShowGuidePanel] = useState(() => localStorage.getItem('verbapath_learning_flow_guide') === 'open');
    const canvasRef = useRef(null);
    const frameRef = useRef(null);
    const pendingDragPointRef = useRef(null);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nodes));
    }, [nodes]);

    useEffect(() => {
        localStorage.setItem('verbapath_learning_flow_guide', showGuidePanel ? 'open' : 'closed');
    }, [showGuidePanel]);

    useEffect(() => {
        if (!dragState) return;

        const handleMove = (event) => {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const nextX = Math.max(24, event.clientX - rect.left - dragState.offsetX + canvasRef.current.scrollLeft);
            const nextY = Math.max(24, event.clientY - rect.top - dragState.offsetY + canvasRef.current.scrollTop);
            pendingDragPointRef.current = { x: nextX, y: nextY };
            if (frameRef.current) return;
            frameRef.current = requestAnimationFrame(() => {
                const point = pendingDragPointRef.current;
                frameRef.current = null;
                if (!point) return;
                setNodes((current) => current.map((node) => (
                    node.id === dragState.id ? { ...node, x: point.x, y: point.y } : node
                )));
            });
        };

        const handleUp = () => {
            setDragState(null);
            pendingDragPointRef.current = null;
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [dragState]);

    const orderedNodes = useMemo(() => [...nodes].sort((a, b) => a.x - b.x), [nodes]);

    const addNode = (type) => {
        const index = nodes.length;
        const node = {
            id: `node_${type}_${Date.now()}`,
            type,
            x: 120 + (index % 4) * 300,
            y: 130 + Math.floor(index / 4) * 190,
            status: 'pending'
        };
        setNodes((current) => [...current, node]);
        setSelectedId(node.id);
    };

    const updateNodeStatus = (id) => {
        setNodes((current) => current.map((node) => (
            node.id === id ? { ...node, status: node.status === 'done' ? 'pending' : 'done' } : node
        )));
    };

    const deleteNode = (id) => {
        setNodes((current) => current.filter((node) => node.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    const resetCanvas = () => {
        if (!confirm('确定恢复默认学习流画布吗？')) return;
        setNodes(initialNodes);
        setSelectedId(null);
    };

    const openNode = (type) => {
        onNavigate?.(type);
    };

    const completed = nodes.filter((node) => node.status === 'done').length;

    return (
        <div className="h-full min-h-[calc(100vh-7rem)] flex flex-col gap-3 p-3 md:p-4 animate-fade-in">
            <div className="rounded-2xl border border-phy-border bg-phy-glass/80 px-4 py-3 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Route size={17} className="text-phy-accent" />
                            <h2 className="text-lg md:text-xl font-black text-phy-text">一线学习流画布</h2>
                            <span className="hidden md:inline-flex rounded-full border border-phy-border bg-phy-bg px-2 py-0.5 text-[11px] font-bold text-phy-muted">
                                n8n 风格节点草稿
                            </span>
                        </div>
                        <p className="text-xs text-phy-muted mt-1">
                            拖动节点排路线，双击节点进入对应模块。
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="px-3 py-2 rounded-xl border border-phy-border bg-phy-bg text-xs md:text-sm font-bold text-phy-text">
                            进度 {completed}/{nodes.length}
                        </div>
                        <button
                            onClick={() => setShowGuidePanel((value) => !value)}
                            className="px-3 py-2 rounded-xl border border-phy-border text-xs md:text-sm font-bold text-phy-muted hover:text-phy-text hover:bg-phy-glassHover transition-colors"
                        >
                            {showGuidePanel ? '收起说明' : '显示说明'}
                        </button>
                        <button
                            onClick={resetCanvas}
                            className="px-3 py-2 rounded-xl border border-phy-border text-xs md:text-sm font-bold text-phy-muted hover:text-phy-text hover:bg-phy-glassHover transition-colors flex items-center gap-2"
                        >
                            <RotateCcw size={15} />
                            重置
                        </button>
                    </div>
                </div>
                {showGuidePanel && (
                    <div className="mt-3 rounded-2xl border border-phy-border bg-phy-bg/60 p-3 text-xs text-phy-muted leading-relaxed">
                        当前是 V1 画布：支持添加节点、拖动节点、标记完成、双击进入模块。后续可以继续加连线条件、AI 自动生成流程、JSON 导入导出。
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">
                <aside className="rounded-2xl border border-phy-border bg-phy-glass p-4 shadow-sm overflow-y-auto">
                    <div className="text-sm font-black text-phy-text mb-3">节点库</div>
                    <div className="space-y-2">
                        {nodeTypes.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.type}
                                    onClick={() => addNode(item.type)}
                                    className="w-full rounded-2xl border border-phy-border bg-phy-bg/50 p-3 text-left hover:border-phy-accent/50 hover:bg-phy-glassHover transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center shadow-sm`}>
                                            <Icon size={18} />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-phy-text">{item.label}</div>
                                            <div className="text-[11px] text-phy-muted truncate">{item.description}</div>
                                        </div>
                                        <Plus size={15} className="ml-auto text-phy-muted group-hover:text-phy-accent" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-4 rounded-2xl border border-dashed border-phy-border p-3 text-xs text-phy-muted leading-relaxed">
                        节点库先保持轻量。把节点拖到画布后，可以调整顺序并逐个打开模块。
                    </div>
                </aside>

                <section
                    ref={canvasRef}
                    className="relative rounded-2xl border border-cyan-400/25 bg-[#08111f] overflow-auto shadow-xl min-h-[620px]"
                    style={{
                        backgroundImage:
                            'linear-gradient(rgba(125,211,252,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,0.18) 1px, transparent 1px), linear-gradient(rgba(125,211,252,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,0.07) 1px, transparent 1px), radial-gradient(circle at 20% 10%, rgba(59,130,246,0.18), transparent 28%), radial-gradient(circle at 80% 20%, rgba(16,185,129,0.14), transparent 24%)',
                        backgroundSize: '96px 96px, 96px 96px, 24px 24px, 24px 24px, 100% 100%, 100% 100%'
                    }}
                >
                    <div className="sticky top-3 left-3 z-20 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-slate-950/70 backdrop-blur px-3 py-2 text-xs font-bold text-cyan-100 shadow-lg">
                        <Route size={14} className="text-cyan-300" />
                        画布模式 · 拖动节点 · 双击打开
                    </div>
                    <div className="relative min-w-[1600px] min-h-[820px]">
                        <svg className="absolute inset-0 w-full h-full pointer-events-none">
                            {orderedNodes.slice(0, -1).map((node, index) => {
                                const next = orderedNodes[index + 1];
                                return (
                                    <line
                                        key={`${node.id}_${next.id}`}
                                        x1={node.x + 240}
                                        y1={node.y + 62}
                                        x2={next.x}
                                        y2={next.y + 62}
                                        stroke="rgba(125, 211, 252, 0.42)"
                                        strokeWidth="3"
                                        strokeDasharray="8 8"
                                    />
                                );
                            })}
                        </svg>

                        {nodes.map((node) => {
                            const meta = getNodeMeta(node.type);
                            const Icon = meta.icon;
                            const isSelected = selectedId === node.id;
                            const isDone = node.status === 'done';
                            const isDragging = dragState?.id === node.id;
                            return (
                                <div
                                    key={node.id}
                                    className={`absolute w-[240px] rounded-3xl border bg-slate-950/92 shadow-2xl select-none ${isDragging ? 'cursor-grabbing scale-[1.01] z-30' : 'cursor-grab transition-[border-color,box-shadow,transform] duration-150'} ${isSelected ? 'border-cyan-300 shadow-cyan-500/20' : 'border-cyan-100/15 hover:border-cyan-200/35'}`}
                                    style={{ left: node.x, top: node.y }}
                                    onMouseDown={(event) => {
                                        if (event.button !== 0) return;
                                        setSelectedId(node.id);
                                        const rect = event.currentTarget.getBoundingClientRect();
                                        setDragState({ id: node.id, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top });
                                    }}
                                    onDoubleClick={() => openNode(node.type)}
                                >
                                    <div className="absolute left-[-7px] top-[58px] w-3.5 h-3.5 rounded-full border-2 border-cyan-300/70 bg-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.55)]"></div>
                                    <div className="absolute right-[-7px] top-[58px] w-3.5 h-3.5 rounded-full border-2 border-cyan-300/70 bg-slate-950 shadow-[0_0_14px_rgba(34,211,238,0.55)]"></div>
                                    <div className={`h-2 rounded-t-3xl bg-gradient-to-r ${meta.color}`}></div>
                                    <div className="p-4">
                                        <div className="flex items-start gap-3">
                                            <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${meta.color} text-white flex items-center justify-center shadow-lg`}>
                                                <Icon size={20} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-base font-black text-white">{meta.label}</div>
                                                <div className="text-xs text-slate-400 mt-1 leading-relaxed">{meta.description}</div>
                                            </div>
                                            <Move size={15} className="text-slate-500 shrink-0" />
                                        </div>
                                        <div className="flex items-center gap-2 mt-4">
                                            <button
                                                onMouseDown={(event) => event.stopPropagation()}
                                                onClick={() => updateNodeStatus(node.id)}
                                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${isDone ? 'bg-emerald-400 text-emerald-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}
                                            >
                                                {isDone ? <Check size={14} /> : <Circle size={14} />}
                                                {isDone ? '已完成' : '待完成'}
                                            </button>
                                            <button
                                                onMouseDown={(event) => event.stopPropagation()}
                                                onClick={() => openNode(node.type)}
                                                className="px-3 py-2 rounded-xl bg-cyan-400/15 text-cyan-200 text-xs font-bold hover:bg-cyan-400/25"
                                            >
                                                打开
                                            </button>
                                            <button
                                                onMouseDown={(event) => event.stopPropagation()}
                                                onClick={() => deleteNode(node.id)}
                                                className="p-2 rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="absolute left-8 bottom-8 rounded-2xl border border-white/10 bg-black/30 backdrop-blur px-4 py-3 text-xs text-slate-300 flex items-center gap-2">
                            <BookOpen size={15} className="text-cyan-300" />
                            拖动节点调整路线，双击节点进入对应功能。
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default LearningFlowCanvasView;
