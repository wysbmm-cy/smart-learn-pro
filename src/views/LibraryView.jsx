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
        if (confirm("Permanently delete this file?")) {
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
        return <FileText size={24} className="text-slate-400" />;
    };

    if (loading) return <div className="p-10 text-center text-slate-400">Loading library...</div>;

    return (
        <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex gap-6 animate-fade-in pb-6">

            {/* File List Side */}
            <div className={`${activeFile ? 'w-1/3' : 'w-full'} bg-white rounded-[2rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden transition-all duration-300`}>
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <FolderOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">File Library</h2>
                            <p className="text-xs text-slate-400">{files.length} files stored locally</p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {files.length === 0 && (
                        <div className="text-center py-20 text-slate-400">
                            <p>No files uploaded yet.</p>
                            <p className="text-xs mt-2">Upload from "Import" page.</p>
                        </div>
                    )}
                    {files.map((file) => (
                        <div
                            key={file.id}
                            onClick={() => handleView(file)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${activeFile?.id === file.id
                                ? 'bg-blue-50 border-blue-200 shadow-inner'
                                : 'bg-white border-slate-100 hover:border-blue-200 hover:shadow-sm'
                                }`}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100">
                                    {getIcon(file.type)}
                                </div>
                                <div className="min-w-0">
                                    <h4 className={`font-bold text-sm truncate ${activeFile?.id === file.id ? 'text-blue-700' : 'text-slate-700'}`}>
                                        {file.name}
                                    </h4>
                                    <p className="text-xs text-slate-400">
                                        {(file.blob.size / 1024 / 1024).toFixed(2)} MB • {new Date(file.timestamp).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, file.id)}
                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Preview Pane */}
            {activeFile && (
                <div className="flex-1 bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col overflow-hidden animate-slide-up">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
                        <div className="flex items-center gap-2">
                            <MonitorPlay size={18} className="text-blue-400" />
                            <span className="font-bold text-sm truncate max-w-[300px]">{activeFile.name}</span>
                        </div>
                        <button onClick={closeViewer} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex-1 bg-slate-100 flex items-center justify-center p-1 overflow-hidden relative">
                        {activeFile.type.includes('pdf') ? (
                            <iframe
                                src={activeFile.url}
                                className="w-full h-full rounded-xl border-0 bg-white"
                                title="PDF Viewer"
                            />
                        ) : activeFile.type.includes('audio') ? (
                            <div className="text-center p-10 space-y-4">
                                <div className="p-6 bg-purple-50 rounded-full inline-block animate-pulse-slow">
                                    <Music size={48} className="text-purple-500" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800">Now Playing Globally</h3>
                                <p className="text-slate-500 max-w-md mx-auto">
                                    Audio is playing in the persistent player. You can listen while navigating to other pages.
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
                                    Your browser does not support media playback.
                                </video>
                            </div>
                        ) : (
                            <div className="text-slate-500">Preview not supported for this file type.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LibraryView;
