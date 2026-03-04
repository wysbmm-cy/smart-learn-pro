import React, { useState, useEffect } from 'react';
import { X, Save, Edit3 } from 'lucide-react';

/**
 * NotesEditorModal - A React-based modal for editing flashcard notes
 * Replaces the DOM-based prompt approach for better UX
 */
const NotesEditorModal = ({
    isOpen,
    initialNotes = '',
    onSave,
    onCancel
}) => {
    const [notes, setNotes] = useState(initialNotes);

    // Reset notes when modal opens with new content
    useEffect(() => {
        if (isOpen) {
            setNotes(initialNotes);
        }
    }, [isOpen, initialNotes]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(notes);
    };

    const handleKeyDown = (e) => {
        // Ctrl+Enter to save
        if (e.ctrlKey && e.key === 'Enter') {
            handleSave();
        }
        // Escape to cancel
        if (e.key === 'Escape') {
            onCancel();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white">
                    <div className="flex items-center gap-3">
                        <Edit3 size={20} />
                        <h3 className="font-bold text-lg">编辑深度笔记</h3>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tips */}
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    💡 支持 Markdown 格式 | Ctrl+Enter 保存 | Esc 取消
                </div>

                {/* Editor */}
                <div className="flex-1 p-4 overflow-hidden">
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="在此输入笔记内容...&#10;&#10;支持 Markdown 格式：&#10;- **粗体** 和 *斜体*&#10;- 列表和表格&#10;- 代码块等"
                        className="w-full h-full min-h-[300px] p-4 bg-slate-50 rounded-xl border border-slate-200 resize-none font-mono text-sm text-slate-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
                        autoFocus
                    />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-all flex items-center gap-2"
                    >
                        <Save size={16} />
                        保存笔记
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotesEditorModal;
