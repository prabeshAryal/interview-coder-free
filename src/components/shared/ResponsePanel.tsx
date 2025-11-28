import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { X, Copy, Check } from 'lucide-react';
import 'katex/dist/katex.min.css';

interface ResponsePanelProps {
    content: string;
    title?: string;
    onClose?: () => void;
    isVisible: boolean;
}

export const ResponsePanel: React.FC<ResponsePanelProps> = ({
    content,
    title = 'AI Response',
    onClose,
    isVisible,
}) => {
    const [copied, setCopied] = useState(false);

    if (!isVisible) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-3xl max-h-[80vh] glass-panel rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/20">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <h2 className="text-sm font-medium text-white/90">{title}</h2>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopy}
                            className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
                            title="Copy to clipboard"
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
                                title="Close"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-5 custom-scrollbar">
                    <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                                code({ node, inline, className, children, ...props }: any) {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const language = match ? match[1] : '';

                                    return !inline && language ? (
                                        <SyntaxHighlighter
                                            style={dracula}
                                            language={language}
                                            PreTag="div"
                                            customStyle={{
                                                margin: '0.5rem 0',
                                                borderRadius: '8px',
                                                fontSize: '12px',
                                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                            }}
                                            {...props}
                                        >
                                            {String(children).replace(/\n$/, '')}
                                        </SyntaxHighlighter>
                                    ) : (
                                        <code
                                            className="bg-white/10 px-1.5 py-0.5 rounded text-emerald-400 font-mono text-xs"
                                            {...props}
                                        >
                                            {children}
                                        </code>
                                    );
                                },
                                p: ({ children }) => (
                                    <p className="mb-3 text-white/85 leading-relaxed">{children}</p>
                                ),
                                h1: ({ children }) => (
                                    <h1 className="text-xl font-bold mb-3 text-white mt-4">{children}</h1>
                                ),
                                h2: ({ children }) => (
                                    <h2 className="text-lg font-semibold mb-2 text-white mt-3">{children}</h2>
                                ),
                                h3: ({ children }) => (
                                    <h3 className="text-base font-medium mb-2 text-white/90 mt-2">{children}</h3>
                                ),
                                ul: ({ children }) => (
                                    <ul className="list-disc list-inside mb-3 space-y-1 text-white/80">{children}</ul>
                                ),
                                ol: ({ children }) => (
                                    <ol className="list-decimal list-inside mb-3 space-y-1 text-white/80">{children}</ol>
                                ),
                                li: ({ children }) => (
                                    <li className="text-white/80">{children}</li>
                                ),
                                blockquote: ({ children }) => (
                                    <blockquote className="border-l-4 border-indigo-500 pl-4 italic text-white/70 my-3">
                                        {children}
                                    </blockquote>
                                ),
                                a: ({ href, children }) => (
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-400 hover:text-indigo-300 underline"
                                    >
                                        {children}
                                    </a>
                                ),
                            }}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>
        </div>
    );
};
