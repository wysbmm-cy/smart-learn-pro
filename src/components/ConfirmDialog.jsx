import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * ConfirmDialog - A reusable confirmation dialog component
 * Replaces browser's native confirm() for better UX
 */
const ConfirmDialog = ({
    isOpen,
    title = '确认操作',
    message = '确定要执行此操作吗？',
    confirmText = '确认',
    cancelText = '取消',
    confirmColor = 'red', // 'red' | 'blue' | 'green'
    icon = 'warning', // 'warning' | 'info' | 'success'
    onConfirm,
    onCancel
}) => {
    if (!isOpen) return null;

    const colorClasses = {
        red: 'bg-red-500 hover:bg-red-600',
        blue: 'bg-blue-500 hover:bg-blue-600',
        green: 'bg-emerald-500 hover:bg-emerald-600'
    };

    const iconColors = {
        warning: 'text-amber-500 bg-amber-100',
        info: 'text-blue-500 bg-blue-100',
        success: 'text-emerald-500 bg-emerald-100'
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Dialog */}
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Close button */}
                <button
                    onClick={onCancel}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X size={20} />
                </button>

                {/* Content */}
                <div className="p-6">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-full ${iconColors[icon]} flex items-center justify-center mx-auto mb-4`}>
                        <AlertTriangle size={24} />
                    </div>

                    {/* Title */}
                    <h3 className="text-lg font-bold text-slate-800 text-center mb-2">
                        {title}
                    </h3>

                    {/* Message */}
                    <p className="text-slate-500 text-center text-sm">
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex border-t border-slate-100">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-4 text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                    >
                        {cancelText}
                    </button>
                    <div className="w-px bg-slate-100" />
                    <button
                        onClick={onConfirm}
                        className={`flex-1 py-4 text-white font-medium ${colorClasses[confirmColor]} transition-colors`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
