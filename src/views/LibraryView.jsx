import React, { useEffect, useState } from 'react';
import { FolderOpen, FileText, Music, Video, Trash2, X, Download, MonitorPlay } from 'lucide-react';
import { useApp } from '../context/AppContext';

const LibraryView = () => {
    const { loadFiles, removeFileItem, playAudio } = useApp();
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFile, setActiveFile] = useState(null); // The file currently being viewed/played

    useEffect(() => {
        loadData();
        return () => {
            // Cleanup object URLs to prevent memory leaks
            if (activeFile && activeFile.url) {
                URL.revokeObjectURL(activeFile.url);
            }
        };
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await loadFiles();
            setFiles(data);
        } catch (e) {
            console.error("Failed to load library", e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (confirm("确定要永久删除此文件吗？")) {
            await removeFileItem(id);
            if (activeFile && activeFile.id === id) setActiveFile(null);
            await loadData();
        }
    };

    const handleView = (file) => {
        // Create an ephemeral object URL for preview
        const url = URL.createObjectURL(file.blob);
        setActiveFile({ ...file, url });

        if (file.type.includes('audio')) {
            playAudio({ ...file, url });
        }
    };

    const closeViewer = () => {
        if (activeFile && activeFile.url) {
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

    if (loading) return <div className="p-10 text-center text-phy-muted">正在加载媒体库...</div>;

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex gap-6 animate-fade-in pb-6">

            {/* File List Side */}
            <div className={`${activeFile ? 'w-1/3' : 'w-full'} bg-phy-glass rounded-[2rem] shadow-sm border border-phy-border flex flex-col overflow-hidden transition-all duration-300`}>
                <div className="p-6 border-b border-phy-border bg-slate-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <FolderOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-phy-text font-bold">本地媒体库</h2>
                            <p className="text-xs text-phy-muted">共 {files.length} 个本地文件</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {files.length === 0 && (
                        <div className="text-center py-20 text-phy-muted">
                            <p>尚无上传的文件。</p>
                            <p className="text-xs mt-2">请在“导入”页面上传。</p>
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
                                        {(file.blob.size / 1024 / 1024).toFixed(2)} MB • {new Date(file.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, file.id)}
                                className="p-2 text-phy-text hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Preview Pane */}
            {activeFile && (
                <div className="flex-1 bg-phy-glass rounded-[2rem] shadow-xl border border-phy-border flex flex-col overflow-hidden animate-slide-up">
                    <div className="p-4 border-b border-phy-border flex justify-between items-center bg-phy-glassHeavy text-white">
                        <div className="flex items-center gap-2">
                            <MonitorPlay size={18} className="text-blue-400" />
                            <span className="font-bold text-sm truncate max-w-[300px]">{activeFile.name}</span>
                        </div>
                        <button onClick={closeViewer} className="p-1 hover:bg-phy-glassHover rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 bg-phy-bg flex items-center justify-center p-1 overflow-hidden relative">
                        {activeFile.type.includes('pdf') ? (
                            <iframe
                                src={activeFile.url}
                                className="w-full h-full rounded-xl border-0 bg-phy-glass"
                                title="PDF Viewer"
                            />
                        ) : activeFile.type.includes('audio') ? (
                            <div className="text-center p-10 space-y-4">
                                <div className="p-6 bg-purple-50 rounded-full inline-block animate-pulse-slow">
                                    <Music size={48} className="text-purple-500" />
                                </div>
                                <h3 className="text-xl font-bold text-phy-text font-bold">正在全局播放</h3>
                                <p className="text-phy-muted max-w-md mx-auto">
                                    音频正在持久播放器中播放。您可以在导航到其他页面时继续收听。
                                </p>
                            </div>
                        ) : activeFile.type.includes('video') ? (
                            <div className="w-full max-w-2xl bg-black rounded-xl overflow-hidden shadow-2xl">
                                <video
                                    src={activeFile.url}
                                    controls
                                    autoPlay
                                    className="w-full max-h-[60vh]"
                                >
                                    您的浏览器不支持媒体播放。
                                </video>
                            </div>
                        ) : (
                            <div className="text-phy-muted">此文件类型不支持预览。</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LibraryView;
