'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMarkdownProps {
  content: string;
  className?: string;
}

export function ChatMarkdown({ content, className = '' }: ChatMarkdownProps) {
  return (
    <div className={`chat-markdown ${className}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <div className="overflow-x-auto my-2 rounded-md border border-gray-200">
            <table className="min-w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-50 border-b border-gray-200">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-1.5 text-left font-semibold text-gray-700 whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-1.5 text-gray-900 whitespace-nowrap border-t border-gray-100">
            {children}
          </td>
        ),
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
        code: ({ children, className: codeClassName }) => {
          const isInline = !codeClassName;
          return isInline ? (
            <code className="bg-gray-200/60 px-1 py-0.5 rounded text-xs font-mono">{children}</code>
          ) : (
            <pre className="bg-gray-800 text-gray-100 rounded-md p-3 my-2 overflow-x-auto text-xs">
              <code>{children}</code>
            </pre>
          );
        },
        hr: () => <hr className="my-2 border-gray-200" />,
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
