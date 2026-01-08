import React, { useState, useEffect } from 'react';
import { X, Trash2, Calendar, Maximize2, Loader2, Sparkles, BookMarked } from 'lucide-react';
import { useApp } from '../context/AppContext';

const ImageGalleryModal = ({ isOpen, onClose }) => {
    const { getDailyImages, deleteDailyImage } = useApp();
    const [images, setImages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null); // For lightbox

    useEffect(() => {
        if (isOpen) {
            loadImages();
        }
    }, [isOpen]);

    const loadImages = async () => {
        setIsLoading(true);
        try {
            const data = await getDailyImages();
            setImages(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (confirm('确认删除这张图片吗?')) {
            await deleteDailyImage(id);
            setImages(prev => prev.filter(img => img.id !== id));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" style={{ animationDuration: '0.2s' }}>
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[85vh] rounded-[2rem] shadow-2xl flex flex-col relative overflow-hidden border border-white/10"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 md:p-8 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            <span className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-500 shadow-sm border border-indigo-200/20">
                                <Calendar size={28} />
                            </span>
                            往期每日总结
                        </h2>
                        <p className="text-slate-500 text-sm md:text-base mt-2 ml-1">回顾你的学习旅程与冒险故事</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-2xl transition-all hover:rotate-90 text-slate-500"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-100/50 dark:bg-[#0B1120] scrollbar-thin">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center text-slate-400 gap-3 text-lg">
                            <Loader2 size={32} className="animate-spin text-indigo-500" /> 加载画廊中...
                        </div>
                    ) : images.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
                            <div className="w-24 h-24 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                                <Calendar size={48} className="text-slate-400" />
                            </div>
                            <p className="text-xl font-bold mb-2">暂无历史图片</p>
                            <p className="text-base text-center max-w-xs">只要在首页生成过每日总结图或故事漫画，就会自动保存在这里。</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {images.map(img => (
                                <div
                                    key={img.id}
                                    onClick={() => setSelectedImage(img)}
                                    className="group relative aspect-[3/4] md:aspect-square rounded-2xl overflow-hidden shadow-sm hover:shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-zoom-in hover:-translate-y-2 transition-all duration-300"
                                >
                                    <img
                                        src={img.url}
                                        alt={img.metadata?.title || "Daily Summary"}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                        loading="lazy"
                                    />

                                    {/* Overlay Gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/95 via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300" />

                                    {/* Content Overlay */}
                                    <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col justify-end text-white translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                                        <div className="flex justify-between items-end">
                                            <div className="flex-1 min-w-0 mr-2">
                                                <div className="text-xs font-bold tracking-widest mb-1.5 opacity-80 flex items-center gap-1.5 uppercase">
                                                    {img.type === 'comic' ? <><BookMarked size={12} className="text-pink-400" /> 故事漫画</> : <><Sparkles size={12} className="text-amber-400" /> 学习总结</>}
                                                </div>
                                                <div className="font-bold text-xl truncate tracking-tight text-shadow-sm">
                                                    {img.date}
                                                </div>
                                                <div className="text-xs opacity-70 mt-1 truncate font-medium">
                                                    {img.style} {img.metadata?.title && `• ${img.metadata.title}`}
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => handleDelete(e, img.id)}
                                                className="p-2.5 bg-white/10 hover:bg-red-500 rounded-xl text-white backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 hover:scale-110 shadow-lg"
                                                title="删除"
                                            >
                                                <Trash2 size={16} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Top Badge */}
                                    <div className={`absolute top-4 left-4 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider backdrop-blur-xl shadow-lg border border-white/10 ${img.type === 'comic' ? 'bg-pink-500/90 text-white' : 'bg-amber-500/90 text-white'}`}>
                                        {img.type === 'comic' ? 'Comic' : 'Summary'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4 md:p-10 animate-fade-in backdrop-blur-xl"
                    onClick={() => setSelectedImage(null)}
                >
                    <button
                        onClick={() => setSelectedImage(null)}
                        className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/20 rounded-full text-white/70 hover:text-white transition-all hover:rotate-90 backdrop-blur-md"
                    >
                        <X size={28} />
                    </button>

                    <div className="relative max-w-full max-h-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        <img
                            src={selectedImage.url}
                            alt="Zoomed"
                            className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
                        />

                        <div className="mt-6 text-center">
                            <h3 className="text-white text-2xl font-bold tracking-tight mb-1">{selectedImage.date}</h3>
                            <div className="flex items-center justify-center gap-3 text-white/50 text-sm font-medium uppercase tracking-widest">
                                <span className="flex items-center gap-1.5">
                                    {selectedImage.type === 'comic' ? <BookMarked size={14} className="text-pink-400" /> : <Sparkles size={14} className="text-amber-400" />}
                                    {selectedImage.type === 'comic' ? '故事漫画' : '学习总结图'}
                                </span>
                                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                                <span>{selectedImage.style}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageGalleryModal;
