import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { generateKnowledgeGraphReferences } from '../services/ai';
import { getFlashcards, getFolders } from '../services/db';
import { useApp } from '../context/AppContext';
import { X, RotateCcw, Filter, Search, Layers, BookOpen, Sparkles, Brain, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';

// --- Helpers ---

// 1. Levenshtein Distance for Spelling Similarity
const levenshteinDistance = (a, b) => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

// 2. Simple Keyword Extractor for Synonym/Definition matching
const extractKeywords = (text) => {
    if (!text) return new Set();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    return new Set(
        text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w))
    );
};

// --- Constants ---

const NODE_COLORS = {
    folder: '#60a5fa',         // Blue
    mastered: '#4ade80',       // Green
    learning: '#facc15',       // Yellow
    weak: '#f87171',           // Red
    selected: '#a78bfa'        // Purple
};

const LINK_COLORS = {
    folder: 'rgba(96, 165, 250, 0.15)',
    spelling: 'rgba(248, 113, 113, 0.3)',    // Red tint for spelling
    meaning: 'rgba(74, 222, 128, 0.3)',      // Green tint for meaning
    default: 'rgba(148, 163, 184, 0.1)'
};

// --- Components ---

const DetailPanel = ({ node, onClose, onStudy, relatedNodes, onSelectNode, onDeleteLink }) => {
    if (!node || node.type !== 'word') return null;
    const percentage = Math.round(node.mastery * 100);

    return (
        <div className="absolute top-4 right-4 w-80 max-h-[80vh] bg-slate-900/95 backdrop-blur-xl border border-phy-borderHover rounded-2xl shadow-2xl p-4 animate-in slide-in-from-right-10 z-50 overflow-y-auto">
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-xl font-bold text-white break-words pr-4">{node.label}</h3>
                <button onClick={onClose} className="text-phy-muted hover:text-white"><X size={16} /></button>
            </div>

            {node.definition && (
                <div className="bg-slate-800/50 p-3 rounded-lg text-sm text-phy-text mb-4">
                    {node.definition}
                </div>
            )}

            <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-xs">
                    <span className="text-phy-muted">掌握程度</span>
                    <span className={percentage > 80 ? 'text-emerald-400' : percentage > 40 ? 'text-yellow-400' : 'text-red-400'}>
                        {percentage}%
                    </span>
                </div>
                <div className="h-1.5 bg-phy-glassHeavy rounded-full overflow-hidden">
                    <div
                        className={`h-full ${percentage > 80 ? 'bg-emerald-500' : percentage > 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            {/* Related Words Section */}
            {relatedNodes && relatedNodes.length > 0 && (
                <div className="mb-4">
                    <div className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 flex items-center gap-2">
                        <Share2 size={12} /> 关联单词 ({relatedNodes.length})
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                        {relatedNodes.map((related, idx) => (
                            <div
                                key={idx}
                                className="flex items-center justify-between p-2 bg-slate-800/50 rounded-lg hover:bg-slate-700/50 group transition-colors"
                            >
                                <button
                                    onClick={() => onSelectNode(related.node)}
                                    className="flex-1 text-left text-sm text-phy-text hover:text-white flex items-center gap-2"
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${related.type === 'spelling' ? 'bg-red-400' :
                                        related.type === 'meaning' ? 'bg-emerald-400' :
                                            related.type === 'ai_semantic' ? 'bg-violet-400' : 'bg-slate-400'
                                        }`} />
                                    <span className="font-medium">{related.node.label}</span>
                                    <span className="text-[10px] text-phy-muted">
                                        {related.type === 'spelling' ? '形近' :
                                            related.type === 'meaning' ? '含义' :
                                                related.type === 'ai_semantic' ? 'AI' : ''}
                                    </span>
                                </button>
                                <button
                                    onClick={() => onDeleteLink(node.id, related.node.id, related.type)}
                                    className="p-1 text-phy-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="删除此关联"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-phy-muted mt-2">点击单词跳转查看，点击 × 删除关联</p>
                </div>
            )}

            <button
                onClick={() => onStudy(node)}
                className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
            >
                <Sparkles size={14} /> 立即复习
            </button>
        </div>
    );
};

const ControlPanel = ({ showFolders, setShowFolders, linkMode, setLinkMode, onReset, onRunAI }) => (
    <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md border border-phy-borderHover rounded-xl p-3 z-50 space-y-3 min-w-[160px]">
        <div className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 flex items-center gap-2">
            <Filter size={12} /> 视图控制
        </div>

        {/* Toggle Folders */}
        <label className="flex items-center gap-2 text-sm text-phy-text cursor-pointer hover:text-white">
            <input
                type="checkbox"
                checked={showFolders}
                onChange={e => setShowFolders(e.target.checked)}
                className="rounded border-phy-border bg-phy-glassHeavy text-violet-600 focus:ring-violet-500"
            />
            <span>显示文件夹中心</span>
        </label>

        <div className="h-px bg-phy-glassHover my-2" />

        {/* Link Modes */}
        <div className="space-y-1">
            <div className="text-xs text-phy-muted mb-1">关联模式</div>
            {[
                { id: 'all', label: '全部关联' },
                { id: 'spelling', label: '拼写相似 (形近词)' },
                { id: 'meaning', label: '含义相关 (同义词)' }
            ].map(mode => (
                <button
                    key={mode.id}
                    onClick={() => setLinkMode(mode.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${linkMode === mode.id
                        ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30'
                        : 'text-phy-muted hover:bg-phy-glass'
                        }`}
                >
                    {mode.label}
                </button>
            ))}
            <button
                onClick={onRunAI}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors mt-2 border border-dashed border-indigo-500/50 hover:bg-indigo-500/10 text-indigo-400`}
            >
                <Brain size={12} className="inline mr-1" />
                AI 深度关联分析
            </button>
        </div>

        <button
            onClick={onReset}
            className="w-full mt-2 py-1.5 bg-phy-glassHeavy hover:bg-slate-700 text-phy-text text-xs rounded border border-phy-border flex items-center justify-center gap-1.5"
        >
            <RotateCcw size={12} /> 重置视角
        </button>
    </div>
);

// --- Main View ---

export default function KnowledgeGraphView() {
    const fgRef = useRef();
    const { settings } = useApp(); // Fix: Get settings from context
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [showFolders, setShowFolders] = useState(true);
    const [linkMode, setLinkMode] = useState('all'); // all, spelling, meaning
    const [selectedNode, setSelectedNode] = useState(null);
    const [hoverNode, setHoverNode] = useState(null);

    // Initial Data Load
    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [cards, folders] = await Promise.all([getFlashcards(), getFolders()]);

            const nodes = [];
            const links = [];

            // 1. Create Folder Nodes
            const folderMap = new Map();
            folders.forEach(f => {
                nodes.push({
                    id: `folder_${f.id}`,
                    label: f.name,
                    type: 'folder',
                    val: 20, // Size
                    color: NODE_COLORS.folder
                });
                folderMap.set(f.id, `folder_${f.id}`);
            });

            // 2. Create Word Nodes
            // Calculate keywords for each card for synonym/meaning matching
            const processedCards = cards.map(card => {
                const ease = parseFloat(card.easeFactor) || 2.5;
                const mastery = (!card.easeFactor) ? 0 :
                    Math.min(1, Math.max(0, (ease - 1.3) / 1.7));

                // Safe extraction avoiding null/undefined
                const safeFront = card.front || '';
                const safeBack = card.back || '';

                return {
                    ...card,
                    mastery,
                    keywords: extractKeywords(safeBack + ' ' + safeFront) // Extract from front and back safely
                };
            });

            processedCards.forEach(card => {
                let color = NODE_COLORS.learning;
                if (card.mastery > 0.8) color = NODE_COLORS.mastered;
                if (card.mastery < 0.4) color = NODE_COLORS.weak;

                nodes.push({
                    id: `word_${card.id}`,
                    label: card.front,
                    definition: card.back,
                    type: 'word',
                    mastery: card.mastery,
                    val: 8 + (card.mastery * 5),
                    color,
                    folderId: card.folderId
                });

                // Link to Folder
                if (card.folderId && folderMap.has(card.folderId)) {
                    links.push({
                        source: `word_${card.id}`,
                        target: folderMap.get(card.folderId),
                        type: 'folder',
                        distance: 100
                    });
                }
            });

            // 3. Build Semantic Relationships
            // Complexity O(N^2) - optimize if N > 1000. Currently fine for typical vocab size.
            for (let i = 0; i < processedCards.length; i++) {
                for (let j = i + 1; j < processedCards.length; j++) {
                    const a = processedCards[i];
                    const b = processedCards[j];

                    // Safety check for missing front text
                    if (!a.front || !b.front) continue;

                    const idA = `word_${a.id}`;
                    const idB = `word_${b.id}`;

                    // A. Spelling Similarity (Levenshtein)
                    // Rule: Length > 3, Distance <= 2 (or <=1 for short words)
                    const minLen = Math.min(a.front.length, b.front.length);
                    const maxDist = minLen > 5 ? 2 : 1;

                    if (minLen > 3) {
                        const dist = levenshteinDistance(a.front.toLowerCase(), b.front.toLowerCase());
                        if (dist <= maxDist && dist > 0) { // dist>0 to avoid self-match (though loop prevents it)
                            links.push({
                                source: idA,
                                target: idB,
                                type: 'spelling',
                                distance: 50
                            });
                            // Increment stats for detail panel
                            const nodeA = nodes.find(n => n.id === idA);
                            const nodeB = nodes.find(n => n.id === idB);
                            if (nodeA) nodeA.spellingLinks = (nodeA.spellingLinks || 0) + 1;
                            if (nodeB) nodeB.spellingLinks = (nodeB.spellingLinks || 0) + 1;
                        }
                    }

                    // B. Meaning Similarity (Shared Keywords)
                    // Rule: Share at least 2 significant keywords? or 1 if very specific?
                    // Let's go with 1 significant keyword match for now to populate links
                    const intersection = new Set(
                        [...a.keywords].filter(x => b.keywords.has(x))
                    );

                    if (intersection.size >= 1) { // Threshold can be tuned
                        links.push({
                            source: idA,
                            target: idB,
                            type: 'meaning',
                            distance: 150 // Looser connection
                        });
                        const nodeA = nodes.find(n => n.id === idA);
                        const nodeB = nodes.find(n => n.id === idB);
                        if (nodeA) nodeA.meaningLinks = (nodeA.meaningLinks || 0) + 1;
                        if (nodeB) nodeB.meaningLinks = (nodeB.meaningLinks || 0) + 1;
                    }
                }
            }

            setGraphData({ nodes, links });
        } catch (e) {
            console.error(e);
            toast.error("加载图谱失败");
        } finally {
            setLoading(false);
        }
    };

    const handleRunAI = async () => {
        setLoading(true);
        toast.loading("AI 正在构建高维语义网络...", { id: 'ai_graph' });
        try {
            const vocabList = graphData.nodes.filter(n => n.type === 'word').map(n => ({ front: n.label, back: n.definition }));

            // Only analyze if < 100 words to avoid token limits, otherwise slice
            const aiLinks = await generateKnowledgeGraphReferences(vocabList, settings);

            // Convert AI links (front string match) to Node IDs
            const nodeMap = new Map();
            graphData.nodes.forEach(n => {
                if (n.type === 'word') nodeMap.set(n.label, n.id);
            });

            const newLinks = [];
            aiLinks.forEach(l => {
                const sourceId = nodeMap.get(l.source);
                const targetId = nodeMap.get(l.target);
                if (sourceId && targetId) {
                    newLinks.push({
                        source: sourceId,
                        target: targetId,
                        type: 'ai_semantic', // New type
                        reason: l.reason,
                        distance: 50
                    });
                }
            });

            if (newLinks.length === 0) {
                toast.success("AI 未发现更深层的语义关联", { id: 'ai_graph' });
            } else {
                setGraphData(prev => ({
                    ...prev,
                    links: [...prev.links, ...newLinks]
                }));
                setLinkMode('ai_semantic');
                toast.success(`AI 构建了 ${newLinks.length} 条语义连接!`, { id: 'ai_graph' });
            }

        } catch (e) {
            console.error(e);
            toast.error("AI 分析失败: " + e.message, { id: 'ai_graph' });
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic
    const filteredData = useMemo(() => {
        let { nodes, links } = graphData;

        // 1. Hide Folders?
        if (!showFolders) {
            nodes = nodes.filter(n => n.type !== 'folder');
            links = links.filter(l => l.type !== 'folder');
        }

        // 2. Filter Link Types
        if (linkMode !== 'all') {
            links = links.filter(l => l.type === linkMode || l.type === 'folder');
        }

        return { nodes, links };
    }, [graphData, showFolders, linkMode]);

    const handleNodeClick = (node) => {
        setSelectedNode(node);
        if (fgRef.current) {
            fgRef.current.centerAt(node.x, node.y, 1000);
            fgRef.current.zoom(4, 1000); // 2D zoom
        }
    };

    const handleReset = useCallback(() => {
        if (fgRef.current) {
            fgRef.current.centerAt(0, 0, 1000);
            fgRef.current.zoom(1, 1000);
        }
    }, []);

    // Get related nodes for selected node
    const getRelatedNodes = useCallback((node) => {
        if (!node || node.type !== 'word') return [];

        const related = [];
        const nodeMap = new Map(graphData.nodes.map(n => [n.id, n]));

        graphData.links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;

            if (link.type === 'folder') return; // Skip folder links

            let relatedNodeId = null;
            if (sourceId === node.id) relatedNodeId = targetId;
            else if (targetId === node.id) relatedNodeId = sourceId;

            if (relatedNodeId && nodeMap.has(relatedNodeId)) {
                const relatedNode = nodeMap.get(relatedNodeId);
                if (relatedNode.type === 'word') {
                    related.push({ node: relatedNode, type: link.type });
                }
            }
        });

        return related;
    }, [graphData]);

    // Delete a link between nodes
    const handleDeleteLink = useCallback((sourceId, targetId, linkType) => {
        setGraphData(prev => ({
            ...prev,
            links: prev.links.filter(link => {
                const sId = typeof link.source === 'object' ? link.source.id : link.source;
                const tId = typeof link.target === 'object' ? link.target.id : link.target;
                // Remove if matches either direction
                const isMatch = (sId === sourceId && tId === targetId) || (sId === targetId && tId === sourceId);
                return !(isMatch && link.type === linkType);
            })
        }));
        toast.success('关联已删除');
    }, []);

    // Custom Paint for 2D Nodes
    const paintNode = useCallback((node, ctx, globalScale) => {
        const isSelected = selectedNode === node;
        const isHovered = hoverNode === node;

        const label = node.label;
        const fontSize = 12 / globalScale + 2; // Dynamic font size

        // Draw Circle
        ctx.beginPath();
        const r = node.val ? Math.sqrt(node.val) * 2 : 5; // Base radius map
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.color || '#fff';
        if (isSelected || isHovered) {
            ctx.shadowColor = node.color;
            ctx.shadowBlur = 15;
        } else {
            ctx.shadowBlur = 0;
        }
        ctx.fill();

        // Draw Ring for Folder
        if (node.type === 'folder') {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw Label text
        if (globalScale > 1.2 || isSelected || isHovered || node.type === 'folder') {
            ctx.font = `${node.type === 'folder' ? 'bold' : ''} ${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillText(label, node.x, node.y + r + fontSize);
        }
    }, [selectedNode, hoverNode]);

    if (loading) return (
        <div className="h-full flex items-center justify-center text-phy-muted">
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <span>构建神经连接网络...</span>
            </div>
        </div>
    );

    return (
        <div className="h-full w-full relative bg-[#0B1120] rounded-2xl overflow-hidden border border-phy-border shadow-inner">
            <ForceGraph2D
                ref={fgRef}
                graphData={filteredData}
                nodeLabel="label"
                nodeRelSize={6}

                // Colors
                backgroundColor="#0B1120"
                linkColor={link => {
                    if (link.type === 'spelling') return LINK_COLORS.spelling;
                    if (link.type === 'meaning') return LINK_COLORS.meaning;
                    if (link.type === 'ai_semantic') return '#8b5cf6'; // Violet for AI
                    if (link.type === 'folder') return LINK_COLORS.folder;
                    return LINK_COLORS.default;
                }}
                linkWidth={link => link.type === 'folder' ? 1 : 1.5}
                linkDirectionalParticles={link => (link.type === 'meaning' || link.type === 'spelling') ? 2 : 0}
                linkDirectionalParticleSpeed={0.005}
                linkCurvature={0.2}

                // Interactions
                onNodeClick={handleNodeClick}
                onNodeHover={setHoverNode}

                // Custom Rendering
                nodeCanvasObject={paintNode}
                nodeCanvasObjectMode={() => 'replace'} // We take full control drawing nodes

                // Physics
                cooldownTicks={100}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
            />

            <ControlPanel
                showFolders={showFolders}
                setShowFolders={setShowFolders}
                linkMode={linkMode}
                setLinkMode={setLinkMode}
                onReset={handleReset}
                onRunAI={handleRunAI}
            />

            {selectedNode && (
                <DetailPanel
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                    onStudy={() => toast.success(`开始复习: ${selectedNode.label}`)}
                    relatedNodes={getRelatedNodes(selectedNode)}
                    onSelectNode={handleNodeClick}
                    onDeleteLink={handleDeleteLink}
                />
            )}

            {/* Legend */}
            <div className="absolute bottom-4 right-4 bg-slate-900/80 backdrop-blur-sm p-3 rounded-lg border border-phy-border text-xs text-phy-muted space-y-1.5 select-none pointer-events-none">
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"></span> 已掌握
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]"></span> 学习中
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"></span> 需加强
                </div>
                <div className="h-px bg-phy-glassHover my-1"></div>
                <div className="flex items-center gap-2">
                    <span className="w-6 h-0.5 bg-red-400/50"></span> 形近词
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-6 h-0.5 bg-emerald-400/50"></span> 含义相关
                </div>
            </div>
        </div>
    );
}
