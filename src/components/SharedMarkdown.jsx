import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Info, AlertTriangle, Lightbulb, Flame } from 'lucide-react';

const SharedMarkdown = ({
    content,
    className = '',
    rehypePlugins = [],
    remarkPlugins = [],
    onInternalLinkClick,
    onInternalLinkPreview
}) => {
    const handleInternalLinkCapture = (event) => {
        if (!onInternalLinkClick) return;
        const targetEl = event.target instanceof Element ? event.target : event.target?.parentElement;
        const anchor = targetEl?.closest?.('a[href]');
        if (!anchor) return;

        const href = String(anchor.getAttribute('href') || '');
        if (!href.startsWith('note://')) return;

        event.preventDefault();
        event.stopPropagation();

        const rawTarget = href.slice('note://'.length);
        const decodedTarget = decodeURIComponent(rawTarget);
        onInternalLinkClick(decodedTarget);
    };

    return (
        <div
            onClickCapture={handleInternalLinkCapture}
            className={`prose prose-sm max-w-none break-words text-phy-text prose-headings:text-phy-text prose-p:text-phy-text prose-li:text-phy-text prose-ol:text-phy-text prose-ul:text-phy-text prose-strong:text-phy-text prose-code:text-phy-accent prose-a:text-phy-accent ${className}`}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm, ...remarkPlugins]}
                rehypePlugins={rehypePlugins}
                urlTransform={(url) => {
                    const value = String(url || '').trim();
                    if (!value) return '';
                    if (/^note:\/\//i.test(value)) return value;
                    if (/^(https?:|mailto:|tel:|sms:|\/|#|\.)/i.test(value)) return value;
                    return '';
                }}
                components={{
                    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                    li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-phy-text" {...props} />,
                    h1: ({ node, ...props }) => <h1 className="text-lg font-black text-phy-text mt-4 mb-2" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-base font-bold text-phy-text mt-3 mb-1.5" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-phy-text mt-3 mb-1" {...props} />,
                    h4: ({ node, ...props }) => <h4 className="text-sm font-semibold text-phy-text mt-2 mb-1" {...props} />,
                    hr: () => <hr className="my-3 border-phy-border" />,
                    a: ({ node, ...props }) => {
                        const href = String(props.href || '');
                        const isNoteLink = href.startsWith('note://');

                        const clickHandler = (event) => {
                            if (!isNoteLink) return;
                            event.preventDefault();
                            event.stopPropagation();
                            const rawTarget = href.slice('note://'.length);
                            const decodedTarget = decodeURIComponent(rawTarget);
                            onInternalLinkClick?.(decodedTarget);
                        };

                        const previewHandler = (event) => {
                            if (!isNoteLink) return;
                            event.preventDefault();
                            event.stopPropagation();
                            const rawTarget = href.slice('note://'.length);
                            const decodedTarget = decodeURIComponent(rawTarget);
                            const triggerRect = event.currentTarget?.getBoundingClientRect?.();
                            const anchorRect = triggerRect
                                ? {
                                    left: triggerRect.left,
                                    top: triggerRect.top,
                                    right: triggerRect.right,
                                    bottom: triggerRect.bottom,
                                    width: triggerRect.width,
                                    height: triggerRect.height
                                }
                                : null;
                            onInternalLinkPreview?.(decodedTarget, { anchorRect });
                        };

                        if (isNoteLink) {
                            return (
                                <span className="inline-flex items-center gap-1">
                                    <button
                                        type="button"
                                        className="text-phy-accent hover:underline break-all cursor-pointer bg-transparent border-none p-0 m-0 text-left"
                                        onClick={clickHandler}
                                    >
                                        {props.children}
                                    </button>
                                    {onInternalLinkPreview && (
                                        <button
                                            type="button"
                                            aria-label="Preview linked note"
                                            data-note-preview-trigger="1"
                                            onClick={previewHandler}
                                            className="text-[10px] leading-none px-1 py-0.5 rounded border border-phy-border text-phy-muted hover:text-phy-text"
                                        >
                                            PRE
                                        </button>
                                    )}
                                </span>
                            );
                        }

                        return (
                            <a
                                className="text-phy-accent hover:underline break-all"
                                target="_blank"
                                rel="noopener noreferrer"
                                {...props}
                            />
                        );
                    },
                    table: ({ node, ...props }) => (
                        <div className="overflow-x-auto my-3 rounded-lg border border-phy-border shadow-sm">
                            <table className="w-full text-xs text-left" {...props} />
                        </div>
                    ),
                    thead: ({ node, ...props }) => <thead className="bg-phy-glassHeavy text-phy-text" {...props} />,
                    tbody: ({ node, ...props }) => <tbody className="divide-y divide-phy-border bg-phy-glassLight" {...props} />,
                    tr: ({ node, ...props }) => <tr className="hover:bg-phy-glass transition-colors" {...props} />,
                    th: ({ node, ...props }) => <th className="px-3 py-2 font-bold whitespace-nowrap" {...props} />,
                    td: ({ node, ...props }) => <td className="px-3 py-2 text-phy-muted" {...props} />,
                    blockquote: ({ node, children, ...props }) => {
                        const textContent = node.children && node.children[0]?.children?.[0]?.value || '';
                        const match = textContent.match(/^\[!(note|info|warning|caution|tip|hint|danger|error)\]/i);

                        if (match) {
                            const type = match[1].toLowerCase();
                            let icon;
                            let bgClass;
                            let textClass;

                            switch (type) {
                                case 'note':
                                case 'info':
                                    icon = <Info size={16} />;
                                    bgClass = 'bg-blue-500/10 border-blue-500/30';
                                    textClass = 'text-blue-500';
                                    break;
                                case 'warning':
                                case 'caution':
                                    icon = <AlertTriangle size={16} />;
                                    bgClass = 'bg-amber-500/10 border-amber-500/30';
                                    textClass = 'text-amber-500';
                                    break;
                                case 'tip':
                                case 'hint':
                                    icon = <Lightbulb size={16} />;
                                    bgClass = 'bg-emerald-500/10 border-emerald-500/30';
                                    textClass = 'text-emerald-500';
                                    break;
                                case 'danger':
                                case 'error':
                                    icon = <Flame size={16} />;
                                    bgClass = 'bg-rose-500/10 border-rose-500/30';
                                    textClass = 'text-rose-500';
                                    break;
                                default:
                                    icon = <Info size={16} />;
                                    bgClass = 'bg-phy-accentGlass border-phy-accent/30';
                                    textClass = 'text-phy-accent';
                                    break;
                            }

                            return (
                                <div className={`my-3 p-3 rounded-2xl border ${bgClass} shadow-sm backdrop-blur-sm relative overflow-hidden group transition-all duration-300 hover:shadow-md`}>
                                    <div className={`flex items-start gap-2 ${textClass}`}>
                                        <div className="mt-0.5 shrink-0 bg-phy-glass0 dark:bg-black/20 p-1 rounded-lg">
                                            {icon}
                                        </div>
                                        <div className="flex-1 text-sm text-phy-text leading-relaxed prose-p:my-1 first:prose-p:mt-0 last:prose-p:mb-0">
                                            {children}
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <blockquote className="my-3 border border-phy-border bg-phy-glassLight px-4 py-3 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-300 text-sm italic text-phy-muted relative overflow-hidden" {...props}>
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-phy-accent to-phy-accentHover rounded-l-2xl"></div>
                                {children}
                            </blockquote>
                        );
                    },
                    code: ({ node, inline, className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || '');
                        return inline ? (
                            <code className="bg-phy-bg border border-phy-border/50 px-1.5 py-0.5 rounded-md text-[0.85em] font-mono text-phy-accent" {...props}>
                                {children}
                            </code>
                        ) : (
                            <div className="my-4 rounded-xl overflow-hidden shadow-lg border border-black/20 dark:border-phy-borderHover relative group">
                                <div className="bg-[#2d2d2d] flex items-center justify-between px-3 py-2 border-b border-[#1e1e1e]">
                                    <div className="flex gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>
                                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>
                                        <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>
                                    </div>
                                    {match && match[1] && (
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{match[1]}</div>
                                    )}
                                </div>
                                <div className="relative">
                                    <code className="block bg-[#1e1e1e] text-phy-text p-4 text-xs font-mono overflow-x-auto leading-relaxed" {...props}>
                                        {children}
                                    </code>
                                </div>
                            </div>
                        );
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
};

export default SharedMarkdown;
