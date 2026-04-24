import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

function formatTime(ts) {
    return new Date(ts).toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    })
}

function CodeBlock({ children, className }) {
    const language = className?.replace('language-', '') || 'text'
    return (
        <SyntaxHighlighter
            style={vscDarkPlus}
            language={language}
            PreTag="div"
            customStyle={{
                background: '#050a07',
                border: '1px solid rgba(0,255,65,0.25)',
                borderRadius: '3px',
                fontSize: '12px',
                margin: '8px 0',
            }}
        >
            {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
    )
}

function Message({ msg, isStreaming }) {
    const isUser = msg.role === 'user'
    const isSystem = msg.role === 'system'

    return (
        <div className="message-group">
            <div className={`message-prefix ${isUser ? 'user' : isSystem ? 'system' : 'bot'}`}>
                {isUser ? (
                    <>[USER@terminal]</>
                ) : isSystem ? (
                    <>[SYSTEM]</>
                ) : (
                    <>[ZERODAYGPT]</>
                )}
                <span className="message-timestamp">{formatTime(msg.timestamp)}</span>
            </div>
            <div className={`message-body ${isUser ? 'user' : isSystem ? 'system' : 'bot'}`}>
                {isUser || isSystem ? (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                ) : (
                    <>
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                code({ inline, className, children, ...props }) {
                                    if (inline) return <code className={className} {...props}>{children}</code>
                                    return <CodeBlock className={className}>{children}</CodeBlock>
                                }
                            }}
                        >
                            {msg.content}
                        </ReactMarkdown>
                        {isStreaming && <span className="streaming-cursor" />}
                    </>
                )}
            </div>
        </div>
    )
}

export default function ChatWindow({ messages, streamingContent, isStreaming }) {
    const bottomRef = useRef(null)

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, streamingContent])

    const hasContent = messages.length > 0 || isStreaming

    return (
        <div className="chat-window">
            {!hasContent ? (
                <div className="chat-empty">
                    <div className="chat-empty-icon">⚡</div>
                    <div className="chat-empty-text">
                        <span style={{ color: 'var(--neon-green)', fontWeight: 700 }}>ZeroDayGPT</span> is online and ready.<br />
                        Ask about exploits, CVEs, pentesting,<br />
                        security research, or anything technical.
                    </div>
                    <div className="chat-empty-hint">
                        Press <span style={{ color: 'var(--neon-green)' }}>Enter</span> to send · <span style={{ color: 'var(--neon-green)' }}>Shift+Enter</span> for newline
                    </div>
                </div>
            ) : (
                <>
                    {messages.map((msg) => (
                        <Message
                            key={msg.id}
                            msg={msg}
                            isStreaming={isStreaming && msg === messages[messages.length - 1] && msg.role === 'assistant'}
                        />
                    ))}
                    {isStreaming && streamingContent !== undefined && (
                        <div className="message-group">
                            <div className="message-prefix bot">
                                [ZERODAYGPT]
                                <span className="message-timestamp">{formatTime(Date.now())}</span>
                            </div>
                            <div className="message-body bot">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        code({ inline, className, children, ...props }) {
                                            if (inline) return <code className={className} {...props}>{children}</code>
                                            return <CodeBlock className={className}>{children}</CodeBlock>
                                        }
                                    }}
                                >
                                    {streamingContent || ''}
                                </ReactMarkdown>
                                <span className="streaming-cursor" />
                            </div>
                        </div>
                    )}
                </>
            )}
            <div ref={bottomRef} />
        </div>
    )
}
