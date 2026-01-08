import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { getFlashcards, getFolders, getHistory } from '../services/db';
import { useApp } from '../context/AppContext';
import { X, RotateCcw, Filter, Eye, Layers, Maximize2, BookOpen, Brain, Sparkles, Volume2 } from 'lucide-react';
import toast from 'react-hot-toast';

// Node type colors
const NODE_COLORS = {
    folder: '#60a5fa',    // Blue for folders
    tag: '#a78bfa',       // Purple for tags
    masteredWord: '#4ade80',    // Green (mastery > 0.8)
    learningWord: '#facc15',    // Yellow (0.4-0.8)
    weakWord: '#f87171',        // Red (< 0.4)
    article: '#f472b6',         // Pink for articles
};

// Calculate mastery from flashcard data (SM-2 derived)
const calculateMastery = (card) => {
    if (!card) return 0.5;
    const ef = card.easeFactor || 2.5;
    const reps = card.repetitions || 0;
    // Normalize: EF 1.3-2.5+ to 0-1, boosted by repetitions
    const baseMastery = Math.min(1, Math.max(0, (ef - 1.3) / 1.7));
    const repBonus = Math.min(0.3, reps * 0.05);
    return Math.min(1, baseMastery + repBonus);
};

const getWordColor = (mastery) => {
    if (mastery > 0.7) return NODE_COLORS.masteredWord;
    if (mastery > 0.35) return NODE_COLORS.learningWord;
    return NODE_COLORS.weakWord;
};

// Detail Panel Component
const DetailPanel = ({ node, onClose, onStudy }) => {
    if (!node) return null;

    const isMastered = node.mastery > 0.7;
    const masteryPercent = Math.round(node.mastery * 100);

    return (
        <div className="absolute top-4 right-4 w-80 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-violet-600/20 to-indigo-600/20">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {node.type === 'folder' && <Layers className="text-blue-400" size={18} />}
                        {node.type === 'word' && <BookOpen className="text-emerald-400" size={18} />}
                        {node.type === 'article' && <Brain className="text-pink-400" size={18} />}
                        <span className="text-xs text-slate-400 uppercase tracking-wider">
                            {node.type === 'folder' ? '文件夹' : node.type === 'word' ? '词汇' : '文章'}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={16} className="text-slate-400" />
                    </button>
                </div>
                <h3 className="text-xl font-bold text-white mt-2 truncate">{node.label}</h3>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
                {node.type === 'word' && (
                    <>
                        {/* Mastery Bar */}
                        <div>
                            <div className="flex items-center justify-between text-sm mb-1.5">
                                <span className="text-slate-400">掌握程度</span>
                                <span className={`font-bold ${isMastered ? 'text-emerald-400' : 'text-yellow-400'}`}>
                                    {masteryPercent}%
                                </span>
                            </div>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${isMastered ? 'bg-gradient-to-r from-emerald-500 to-teal-400' :
                                            node.mastery > 0.35 ? 'bg-gradient-to-r from-yellow-500 to-orange-400' :
                                                'bg-gradient-to-r from-red-500 to-rose-400'
                                        }`}
                                    style={{ width: `${masteryPercent}%` }}
                                />
                            </div>
                        </div>

                        {/* Definition if available */}
                        {node.definition && (
                            <div className="p-3 bg-slate-800/50 rounded-xl">
                                <p className="text-sm text-slate-300">{node.definition}</p>
                            </div>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-slate-800/30 rounded-xl text-center">
                                <div className="text-lg font-bold text-indigo-400">{node.repetitions || 0}</div>
                                <div className="text-xs text-slate-500">复习次数</div>
                            </div>
                            <div className="p-3 bg-slate-800/30 rounded-xl text-center">
                                <div className="text-lg font-bold text-violet-400">{node.connections || 0}</div>
                                <div className="text-xs text-slate-500">关联词汇</div>
                            </div>
                        </div>

                        {/* Actions */}
                        <button
                            onClick={() => onStudy?.(node)}
                            className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2"
                        >
                            <Sparkles size={16} />
                            立即复习
                        </button>
                    </>
                )}

                {node.type === 'folder' && (
                    <div className="text-center py-4">
                        <div className="text-3xl font-bold text-blue-400">{node.wordCount || 0}</div>
                        <div className="text-sm text-slate-400 mt-1">包含词汇</div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Control Panel Component
const ControlPanel = ({ filter, setFilter, viewMode, setViewMode, onReset, stats }) => (
    <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 z-40 space-y-4 min-w-[200px]">
        <div className="flex items-center gap-2 text-indigo-400 font-bold">
            <Filter size={16} />
            <span>控制面板</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 bg-emerald-500/10 rounded-lg">
                <div className="font-bold text-emerald-400">{stats.mastered}</div>
                <div className="text-slate-500">已掌握</div>
            </div>
            <div className="p-2 bg-yellow-500/10 rounded-lg">
                <div className="font-bold text-yellow-400">{stats.learning}</div>
                <div className="text-slate-500">学习中</div>
            </div>
            <div className="p-2 bg-red-500/10 rounded-lg">
                <div className="font-bold text-red-400">{stats.weak}</div>
                <div className="text-slate-500">需加强</div>
            </div>
        </div>

        {/* Filter */}
        <div>
            <label className="text-xs text-slate-400 block mb-1.5">筛选显示</label>
            <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-violet-500"
            >
                <option value="all">全部词汇</option>
                <option value="weak">仅显示薄弱词</option>
                <option value="learning">学习中</option>
                <option value="mastered">已掌握</option>
            </select>
        </div>

        {/* View Mode */}
        <div>
            <label className="text-xs text-slate-400 block mb-1.5">视图模式</label>
            <div className="flex gap-2">
                <button
                    onClick={() => setViewMode('3d')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === '3d'
                            ? 'bg-violet-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                >
                    3D 球体
                </button>
                <button
                    onClick={() => setViewMode('flat')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'flat'
                            ? 'bg-violet-600 text-white'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                >
                    平面
                </button>
            </div>
        </div>

        {/* Reset View */}
        <button
            onClick={onReset}
            className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg text-sm text-slate-300 flex items-center justify-center gap-2 transition-colors"
        >
            <RotateCcw size={14} />
            重置视角
        </button>
    </div>
);

// Empty State
const EmptyState = () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
        <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-violet-600/20 to-indigo-600/20 flex items-center justify-center">
            <Brain size={48} className="text-violet-400" />
        </div>
        <h3 className="text-xl font-bold text-slate-200 mb-2">知识图谱为空</h3>
        <p className="text-slate-400 max-w-md">
            开始添加闪卡或学习文章，您的词汇知识网络将在这里可视化展示。
        </p>
    </div>
);

export default function KnowledgeGraphView() {
    const fgRef = useRef();
    const { settings } = useApp();

    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState(null);
    const [filter, setFilter] = useState('all');
    const [viewMode, setViewMode] = useState('3d');
    const [stats, setStats] = useState({ mastered: 0, learning: 0, weak: 0 });
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set());

    // Load graph data from IndexedDB
    const loadGraphData = useCallback(async () => {
        setLoading(true);
        try {
            const [cards, folders, history] = await Promise.all([
                getFlashcards(),
                getFolders(),
                getHistory()
            ]);

            const nodes = [];
            const links = [];
            const nodeMap = new Map();

            let masteredCount = 0, learningCount = 0, weakCount = 0;

            // Add folder nodes
            folders.forEach(folder => {
                const folderId = `folder_${folder.id}`;
                const wordCount = cards.filter(c => c.folderId === folder.id).length;
                nodes.push({
                    id: folderId,
                    type: 'folder',
                    label: folder.name,
                    color: NODE_COLORS.folder,
                    wordCount,
                    val: 15 + wordCount * 2 // Size based on word count
                });
                nodeMap.set(folderId, true);
            });

            // Add word nodes from flashcards
            cards.forEach(card => {
                const wordId = `word_${card.id}`;
                const mastery = calculateMastery(card);
                const color = getWordColor(mastery);

                // Track stats
                if (mastery > 0.7) masteredCount++;
                else if (mastery > 0.35) learningCount++;
                else weakCount++;

                nodes.push({
                    id: wordId,
                    type: 'word',
                    label: card.front,
                    definition: card.back,
                    mastery,
                    color,
                    repetitions: card.repetitions || 0,
                    connections: 0,
                    val: 5 + mastery * 8, // Size based on mastery
                    cardData: card
                });
                nodeMap.set(wordId, true);

                // Link to folder
                if (card.folderId) {
                    const folderId = `folder_${card.folderId}`;
                    if (nodeMap.has(folderId)) {
                        links.push({
                            source: wordId,
                            target: folderId,
                            type: 'belongs_to',
                            color: 'rgba(255,255,255,0.1)'
                        });
                    }
                }

                // Link words with same tags
                if (card.tags && card.tags.length > 0) {
                    cards.forEach(otherCard => {
                        if (otherCard.id !== card.id && otherCard.tags) {
                            const sharedTags = card.tags.filter(t => otherCard.tags.includes(t));
                            if (sharedTags.length > 0) {
                                const otherId = `word_${otherCard.id}`;
                                // Avoid duplicate links
                                const linkExists = links.some(l =>
                                    (l.source === wordId && l.target === otherId) ||
                                    (l.source === otherId && l.target === wordId)
                                );
                                if (!linkExists) {
                                    links.push({
                                        source: wordId,
                                        target: otherId,
                                        type: 'shared_tag',
                                        color: 'rgba(167, 139, 250, 0.3)'
                                    });
                                }
                            }
                        }
                    });
                }
            });

            // Update connection counts
            nodes.forEach(node => {
                if (node.type === 'word') {
                    node.connections = links.filter(l =>
                        l.source === node.id || l.target === node.id
                    ).length;
                }
            });

            setStats({ mastered: masteredCount, learning: learningCount, weak: weakCount });
            setGraphData({ nodes, links });
        } catch (err) {
            console.error('Failed to load graph data:', err);
            toast.error('加载知识图谱失败');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadGraphData();
    }, [loadGraphData]);

    // Filter nodes based on current filter
    const filteredData = React.useMemo(() => {
        if (filter === 'all') return graphData;

        const filteredNodes = graphData.nodes.filter(node => {
            if (node.type !== 'word') return true; // Keep folders/tags
            switch (filter) {
                case 'weak': return node.mastery <= 0.35;
                case 'learning': return node.mastery > 0.35 && node.mastery <= 0.7;
                case 'mastered': return node.mastery > 0.7;
                default: return true;
            }
        });

        const nodeIds = new Set(filteredNodes.map(n => n.id));
        const filteredLinks = graphData.links.filter(link =>
            nodeIds.has(link.source.id || link.source) &&
            nodeIds.has(link.target.id || link.target)
        );

        return { nodes: filteredNodes, links: filteredLinks };
    }, [graphData, filter]);

    // Handle node click
    const handleNodeClick = useCallback((node) => {
        setSelectedNode(node);

        // Zoom to node
        if (fgRef.current) {
            const distance = 120;
            const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
            fgRef.current.cameraPosition(
                { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                node,
                1000
            );
        }
    }, []);

    // Handle hover
    const handleNodeHover = useCallback((node) => {
        const newHighlightNodes = new Set();
        const newHighlightLinks = new Set();

        if (node) {
            newHighlightNodes.add(node);
            graphData.links.forEach(link => {
                const sourceId = link.source.id || link.source;
                const targetId = link.target.id || link.target;
                if (sourceId === node.id || targetId === node.id) {
                    newHighlightLinks.add(link);
                    // Find connected nodes
                    const connectedNode = graphData.nodes.find(n =>
                        n.id === (sourceId === node.id ? targetId : sourceId)
                    );
                    if (connectedNode) newHighlightNodes.add(connectedNode);
                }
            });
        }

        setHighlightNodes(newHighlightNodes);
        setHighlightLinks(newHighlightLinks);
    }, [graphData]);

    // Reset camera
    const handleReset = () => {
        if (fgRef.current) {
            fgRef.current.cameraPosition({ x: 0, y: 0, z: 300 }, { x: 0, y: 0, z: 0 }, 1000);
        }
        setSelectedNode(null);
    };

    // Handle study action
    const handleStudy = (node) => {
        toast.success(`跳转复习: ${node.label}`);
        // In a full implementation, navigate to flashcard view with this card
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-400">正在构建知识图谱...</p>
                </div>
            </div>
        );
    }

    if (filteredData.nodes.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className="h-full w-full relative bg-slate-950 rounded-2xl overflow-hidden">
            {/* 3D Force Graph */}
            <ForceGraph3D
                ref={fgRef}
                graphData={filteredData}
                backgroundColor="rgba(15, 23, 42, 0)"
                nodeLabel={node => `${node.label}${node.type === 'word' ? ` (${Math.round(node.mastery * 100)}%)` : ''}`}
                nodeColor={node => highlightNodes.size > 0
                    ? (highlightNodes.has(node) ? node.color : 'rgba(100,100,100,0.3)')
                    : node.color
                }
                nodeVal={node => node.val}
                nodeOpacity={0.95}
                linkColor={link => highlightLinks.size > 0
                    ? (highlightLinks.has(link) ? 'rgba(139, 92, 246, 0.8)' : 'rgba(100,100,100,0.1)')
                    : link.color || 'rgba(255,255,255,0.1)'
                }
                linkWidth={link => highlightLinks.has(link) ? 2 : 0.5}
                linkOpacity={0.6}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                enableNodeDrag={true}
                enableNavigationControls={true}
                showNavInfo={false}
                warmupTicks={50}
                cooldownTicks={100}
            />

            {/* Control Panel */}
            <ControlPanel
                filter={filter}
                setFilter={setFilter}
                viewMode={viewMode}
                setViewMode={setViewMode}
                onReset={handleReset}
                stats={stats}
            />

            {/* Detail Panel */}
            <DetailPanel
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
                onStudy={handleStudy}
            />

            {/* Instructions */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-xs text-slate-400 flex items-center gap-4">
                <span>🖱️ 拖拽旋转</span>
                <span>⚙️ 滚轮缩放</span>
                <span>👆 点击查看详情</span>
            </div>
        </div>
    );
}
