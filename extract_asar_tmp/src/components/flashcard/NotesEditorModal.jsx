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
                className="absolute inset-0 bg-black/40 backdrop-blur-md"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative glass-modal rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-phy-glassHeavy border-b border-phy-border text-phy-text">
                    <div className="flex items-center gap-3">
                        <Edit3 size={20} className="text-phy-accent" />
                        <h3 className="font-bold text-lg">编辑深度笔记</h3>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-1 hover:bg-phy-glassHover rounded-lg transition-colors text-phy-muted"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Tips */}
                <div className="px-6 py-3 bg-phy-glass border-b border-phy-border text-xs text-phy-muted">
                    💡 支持 Markdown 格式 | Ctrl+Enter 保存 | Esc 取消
                </div>

                {/* Editor */}
                <div className="flex-1 p-4 overflow-hidden bg-phy-bg/50 backdrop-blur-sm">
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="在此输入笔记内容...&#10;&#10;支持 Markdown 格式：&#10;- **粗体** 和 *斜体*&#10;- 列表和表格&#10;- 代码块等"
                        className="w-full h-full min-h-[300px] p-4 bg-phy-bg rounded-xl border border-phy-border resize-none font-mono text-sm text-phy-text leading-relaxed focus:outline-none focus:border-phy-accent transition-colors"
                        autoFocus
                    />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 px-6 py-4 bg-phy-glassHeavy border-t border-phy-border backdrop-blur">
                    <button
                        onClick={onCancel}
                        className="px-5 py-2.5 text-phy-muted font-medium hover:bg-phy-glassHover hover:text-phy-text rounded-lg transition-colors border border-transparent hover:border-phy-border"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-phy-accent text-white font-medium rounded-lg hover:opacity-90 transition-all flex items-center gap-2 shadow-sm"
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
