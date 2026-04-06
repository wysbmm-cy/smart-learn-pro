import React, { useEffect, useMemo, useState } from 'react';
import { Brain, CalendarClock, CheckSquare, ListChecks, Play, RefreshCw, Square, Target } from 'lucide-react';
import { getFlashcards, getFolders } from '../services/db';
import { useApp } from '../context/AppContext';
import { getRetrievabilityLabel } from '../utils/flashcardUtils';
import { buildTodayReviewQueue, getCardDueAt, isReviewedToday } from '../utils/reviewQueue';
import toast from 'react-hot-toast';

const firstLine = (text) => (text || '').split('\n')[0].trim();

const ReviewCenterView = ({ onNavigate }) => {
    const { setFlashcardStartupState, settings } = useApp();
    const [cards, setCards] = useState([]);
    const [folders, setFolders] = useState([]);
    const [selectedFolderIds, setSelectedFolderIds] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [maxCards, setMaxCards] = useState(settings?.maxReviewCards || 0);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [allCards, allFolders] = await Promise.all([
                getFlashcards(),
                getFolders()
            ]);
            setCards(allCards || []);
            setFolders(allFolders || []);
        } catch (e) {
            console.error('Failed to load review center data:', e);
            toast.error('加载复习数据失败。');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const folderNameMap = useMemo(() => {
        const map = new Map();
        folders.forEach((folder) => map.set(folder.id, folder.name));
        return map;
    }, [folders]);

    const effectiveFolderIds = selectedFolderIds.length > 0 ? selectedFolderIds : 'all';

    const dueQueue = useMemo(() => buildTodayReviewQueue(cards, {
        folderIds: effectiveFolderIds,
        maxCards,
        preferUnseenToday: true
    }), [cards, effectiveFolderIds, maxCards]);

    const filteredQueue = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return dueQueue;
        return dueQueue.filter((card) => firstLine(card.front).toLowerCase().includes(q));
    }, [dueQueue, search]);

    const unseenTodayCount = useMemo(
        () => dueQueue.filter((card) => !isReviewedToday(card)).length,
        [dueQueue]
    );

    const toggleFolder = (id) => {
        setSelectedFolderIds((prev) => (
            prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
        ));
    };

    const clearFolderSelection = () => setSelectedFolderIds([]);
    const selectAllFolders = () => setSelectedFolderIds(folders.map((folder) => folder.id));

    const startTodayReview = () => {
        if (dueQueue.length === 0) {
            toast.error('当前没有到期的卡片。');
            return;
        }

        setFlashcardStartupState({
            mode: 'study',
            folder: 'today',
            queueIds: dueQueue.map((card) => card.id)
        });
        onNavigate('flashcards');
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6 animate-fade-in pb-8">
            <div className="bg-gradient-to-r from-indigo-700 to-blue-700 rounded-3xl p-6 text-white shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black flex items-center gap-2">
                            <CalendarClock size={28} />
                            复习中心
                        </h2>
                            选择文件夹，构建今日复习队列，一键开启复习。
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={loadData}
                            className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-bold flex items-center gap-2"
                        >
                            <RefreshCw size={14} />
                            刷新
                        </button>
                        <button
                            onClick={startTodayReview}
                            className="px-5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-900 text-sm font-black flex items-center gap-2"
                        >
                            <Play size={14} />
                            开始今日复习
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-phy-glass rounded-2xl border border-phy-border p-4">
                    <div className="text-xs text-phy-muted uppercase">今日到期</div>
                    <div className="text-2xl font-black text-phy-text mt-1">{dueQueue.length}</div>
                </div>
                <div className="bg-phy-glass rounded-2xl border border-phy-border p-4">
                    <div className="text-xs text-phy-muted uppercase">今日待复习</div>
                    <div className="text-2xl font-black text-phy-text mt-1">{unseenTodayCount}</div>
                </div>
                <div className="bg-phy-glass rounded-2xl border border-phy-border p-4">
                    <div className="text-xs text-phy-muted uppercase">已选文件夹</div>
                    <div className="text-2xl font-black text-phy-text mt-1">{selectedFolderIds.length || folders.length}</div>
                </div>
                <div className="bg-phy-glass rounded-2xl border border-phy-border p-4">
                    <div className="text-xs text-phy-muted uppercase">复习上限</div>
                    <div className="mt-2">
                        <input
                            type="number"
                            min={0}
                            value={maxCards}
                            onChange={(event) => setMaxCards(Math.max(0, Number(event.target.value) || 0))}
                            className="w-full px-3 py-2 rounded-lg bg-phy-bg border border-phy-border text-sm"
                        />
                        <div className="text-[10px] text-phy-muted mt-1">0 表示不限制数量</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-phy-glass rounded-2xl border border-phy-border p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-phy-text flex items-center gap-2">
                            <Target size={16} />
                            文件夹过滤
                        </h3>
                        <div className="flex gap-2 text-xs">
                            <button className="text-phy-muted hover:text-phy-text" onClick={clearFolderSelection}>清空</button>
                            <button className="text-phy-muted hover:text-phy-text" onClick={selectAllFolders}>全选</button>
                        </div>
                    </div>
                    <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
                        {folders.map((folder) => {
                            const checked = selectedFolderIds.includes(folder.id);
                            return (
                                <button
                                    key={folder.id}
                                    onClick={() => toggleFolder(folder.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${checked ? 'bg-indigo-500/10 border-indigo-400/40 text-indigo-300' : 'bg-phy-bg border-phy-border text-phy-muted hover:text-phy-text'}`}
                                >
                                    {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                                    <span className="truncate text-sm">{folder.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="lg:col-span-2 bg-phy-glass rounded-2xl border border-phy-border p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                        <h3 className="text-sm font-bold text-phy-text flex items-center gap-2">
                            <ListChecks size={16} />
                            今日队列
                        </h3>
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="搜索卡片..."
                            className="px-3 py-2 rounded-lg bg-phy-bg border border-phy-border text-sm"
                        />
                    </div>

                    {isLoading ? (
                        <div className="py-16 text-center text-phy-muted">正在加载复习队列...</div>
                    ) : filteredQueue.length === 0 ? (
                        <div className="py-16 text-center text-phy-muted">没有匹配过滤条件的卡片。</div>
                    ) : (
                        <div className="space-y-2 max-h-[520px] overflow-y-auto custom-scrollbar">
                            {filteredQueue.map((card, idx) => {
                                const dueAt = getCardDueAt(card);
                                const retrievability = getRetrievabilityLabel(card);
                                return (
                                    <div key={card.id} className="p-3 rounded-xl border border-phy-border bg-phy-bg/50">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs text-phy-muted mb-0.5">#{idx + 1}</div>
                                                <div className="text-sm font-bold text-phy-text truncate">{firstLine(card.front) || '(Untitled card)'}</div>
                                                <div className="text-[11px] text-phy-muted truncate">
                                                    {folderNameMap.get(card.folderId) || '未分类'}
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className={`text-xs font-bold ${retrievability.color}`}>
                                                    {retrievability.label} {retrievability.percent}
                                                </div>
                                                <div className="text-[11px] text-phy-muted">
                                                    {dueAt ? `Due: ${new Date(dueAt).toLocaleString()}` : '到期：立即'}
                                                </div>
                                                <div className="text-[11px] text-phy-muted flex items-center gap-1 justify-end">
                                                    <Brain size={10} />
                                                    {isReviewedToday(card) ? '今天已复习' : '今天未复习'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReviewCenterView;
