import React, { useEffect, useState } from 'react';
import {
    FileText,
    FolderOpen,
    Headphones,
    Loader2,
    MonitorPlay,
    Music,
    Trash2,
    Video,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';

const LibraryView = () => {
    const { loadFiles, removeFileItem, playAudio } = useApp();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFile, setActiveFile] = useState(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await loadFiles();
            setFiles(data);
        } catch (e) {
            console.error('Failed to load library', e);
            toast.error(`加载文件库失败: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        return () => {
            if (activeFile?.url) {
                URL.revokeObjectURL(activeFile.url);
            }
        };
    }, [activeFile]);

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm('确定要永久删除这个文件吗？')) return;

        await removeFileItem(id);
        if (activeFile?.id === id) {
            if (activeFile?.url) URL.revokeObjectURL(activeFile.url);
            setActiveFile(null);
        }
        await loadData();
    };

    const handleView = (file) => {
        if (activeFile?.url) {
            URL.revokeObjectURL(activeFile.url);
        }
        const url = URL.createObjectURL(file.blob);
        const next = { ...file, url };
        setActiveFile(next);

        if (file.type.includes('audio')) {
            playAudio(next);
        }
    };

    const closeViewer = () => {
        if (activeFile?.url) {
            URL.revokeObjectURL(activeFile.url);
        }
        setActiveFile(null);
    };

    const getIcon = (type) => {
        if (type.includes('pdf')) return <FileText size={24} className="text-red-500" />;
        if (type.includes('audio')) return <Music size={24} className="text-purple-500" />;
        if (type.includes('video')) return <Video size={24} className="text-blue-500" />;
        return <FileText size={24} className="text-phy-muted" />;
    };

    if (loading) {
        return (
            <div className="p-10 text-center text-phy-muted flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                正在加载文件库...
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex gap-6 animate-fade-in pb-6">
            <div className={`${activeFile ? 'w-1/3' : 'w-full'} bg-phy-glass rounded-[2rem] shadow-sm border border-phy-border flex flex-col overflow-hidden transition-all duration-300`}>
                <div className="p-6 border-b border-phy-border bg-slate-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <FolderOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-phy-text">文件库</h2>
                            <p className="text-xs text-phy-muted">共 {files.length} 个本地文件</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {files.length === 0 && (
                        <div className="text-center py-20 text-phy-muted">
                            <p>还没有导入文件</p>
                            <p className="text-xs mt-2">请先到导入页面上传 PDF、音频或视频</p>
                        </div>
                    )}

                    {files.map((file) => (
                        <div
                            key={file.id}
                            onClick={() => handleView(file)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${activeFile?.id === file.id
                                ? 'bg-blue-50 border-blue-200 shadow-inner'
                                : 'bg-phy-glass border-phy-border hover:border-blue-200 hover:shadow-sm'
                                }`}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-phy-bg flex items-center justify-center border border-phy-border">
                                    {getIcon(file.type)}
                                </div>
                                <div className="min-w-0">
                                    <h4 className={`font-bold text-sm truncate ${activeFile?.id === file.id ? 'text-blue-700' : 'text-phy-text'}`}>
                                        {file.name}
                                    </h4>
                                    <p className="text-xs text-phy-muted">
                                        {(file.blob.size / 1024 / 1024).toFixed(2)} MB · {new Date(file.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, file.id)}
                                className="p-2 text-phy-text hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                title="删除"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {activeFile && (
                <div className="flex-1 bg-phy-glass rounded-[2rem] shadow-xl border border-phy-border flex flex-col overflow-hidden animate-slide-up">
                    <div className="p-4 border-b border-phy-border flex justify-between items-center bg-phy-glassHeavy text-white">
                        <div className="flex items-center gap-2 min-w-0">
                            <MonitorPlay size={18} className="text-blue-400" />
                            <span className="font-bold text-sm truncate">{activeFile.name}</span>
                        </div>
                        <button onClick={closeViewer} className="p-1 hover:bg-phy-glassHover rounded-full transition-colors" title="关闭">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="flex-1 bg-phy-bg p-3 overflow-auto">
                        {activeFile.type.includes('pdf') && (
                            <iframe src={activeFile.url} className="w-full h-full rounded-xl border-0 bg-phy-glass" title="PDF Viewer" />
                        )}

                        {activeFile.type.includes('video') && (
                            <div className="w-full max-w-3xl mx-auto bg-black rounded-xl overflow-hidden shadow-2xl">
                                <video src={activeFile.url} controls autoPlay className="w-full max-h-[70vh]">
                                    当前浏览器不支持视频播放。
                                </video>
                            </div>
                        )}

                        {activeFile.type.includes('audio') && (
                            <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center">
                                <div className="rounded-[2.5rem] border border-phy-border bg-phy-glass p-12 flex flex-col items-center text-center gap-6 shadow-2xl">
                                    <div className="relative">
                                        <div className="w-24 h-24 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center animate-pulse">
                                            <Music size={40} />
                                        </div>
                                        <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-phy-accent text-white flex items-center justify-center shadow-lg">
                                            <Headphones size={16} />
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <h3 className="text-xl font-black text-phy-text mb-2">音频预览模式</h3>
                                        <p className="text-sm text-phy-muted max-w-xs leading-relaxed">
                                            该音频已在全局播放器中打开。如果你想进行精听练习、AI 转写或测试听力理解，请前往专用实验室。
                                        </p>
                                    </div>

                                    <div className="p-4 rounded-2xl bg-phy-accentGlass border border-phy-accent/20 flex flex-col gap-3 w-full">
                                        <div className="text-xs font-bold text-phy-accent uppercase tracking-widest">推荐工作流</div>
                                        <div className="text-sm text-phy-text font-medium">使用“听力实验室”进行深度学习</div>
                                    </div>

                                    <div className="text-xs text-phy-muted italic">
                                        提示：从左侧导航栏点击“听力实验室”即可进入
                                    </div>
                                </div>
                            </div>
                        )}

                        {!activeFile.type.includes('pdf') && !activeFile.type.includes('audio') && !activeFile.type.includes('video') && (
                            <div className="w-full h-full flex items-center justify-center text-phy-muted">
                                当前文件类型暂不支持预览。
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LibraryView;
