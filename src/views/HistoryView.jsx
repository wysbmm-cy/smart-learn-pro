import React, { useEffect, useState } from 'react';
import { Clock, ArrowRight, Trash2, Calendar, FileText, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';

const HistoryView = ({ onNavigate }) => {
    const { loadHistory, removeHistoryItem, setCurrentArticle, setAnalysisResult, setImportText } = useApp();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await loadHistory();
            setHistory(data);
        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = (item) => {
        setCurrentArticle(item.article);
        setAnalysisResult(item.result);
        setImportText(item.article); // Also restore to import view for continuity
        onNavigate('study');
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (confirm("确定要删除这条记录吗？")) {
            await removeHistoryItem(id);
            await loadData();
        }
    };

    if (loading) return <div className="p-10 text-center text-phy-muted">正在加载历史记录...</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
            <div className="flex items-center gap-3 mb-8">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-xl">
                    <Clock size={24} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-phy-text font-bold">历史回顾</h2>
                    <p className="text-phy-muted text-sm">查看收您过去的学习记录。</p>
                </div>
            </div>

            {history.length === 0 ? (
                <div className="bg-phy-glass rounded-[2rem] p-12 text-center text-phy-muted border border-phy-border border-dashed">
                    <Clock size={48} className="mx-auto mb-4 opacity-20" />
                    <p>未找到历史记录。</p>
                    <button
                        onClick={() => onNavigate('import')}
                        className="mt-4 text-blue-600 font-bold hover:underline"
                    >
                        开始新的分析
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {history.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleRestore(item)}
                            className="bg-phy-glass p-6 rounded-2xl shadow-sm border border-phy-border hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-transparent rounded-bl-full -mr-16 -mt-16 opacity-50 group-hover:opacity-100 transition-opacity" />

                            <div className="flex justify-between items-start relative z-10">
                                <div className="space-y-2 flex-1 pr-10">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                            {item.level || '记录'}
                                        </span>
                                        <span className="text-xs text-phy-muted flex items-center gap-1">
                                            <Calendar size={12} /> {item.date}
                                        </span>
                                    </div>
                                    <h3 className="font-bold text-phy-text font-bold text-lg line-clamp-1 group-hover:text-blue-700 transition-colors">
                                        {item.summary ? item.summary.substring(0, 50) + "..." : "记录"}
                                    </h3>
                                    <p className="text-phy-muted text-sm line-clamp-2 leading-relaxed">
                                        {item.article ? item.article.substring(0, 150) : "无预览。"}
                                    </p>
                                </div>

                                <button
                                    onClick={(e) => handleDelete(e, item.id)}
                                    className="p-2 text-phy-text hover:text-red-500 hover:bg-red-50 rounded-full transition-colors z-20"
                                    title="Delete Record"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>

                            <div className="mt-4 flex items-center text-sm font-bold text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-4 group-hover:translate-x-0 duration-300">
                                立即查看 <ArrowRight size={16} className="ml-1" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default HistoryView;
