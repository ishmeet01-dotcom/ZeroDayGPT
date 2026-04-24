import { useState, useCallback, useRef, useEffect } from 'react'
import Banner from './components/Banner'
import ChatWindow from './components/ChatWindow'
import InputBar from './components/InputBar'
import FraudDetector from './components/FraudDetector'
import { useWebSocket } from './hooks/useWebSocket'

const API_KEY = import.meta.env.VITE_API_KEY || 'zerodaygpt-dev-key'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const HISTORY_STORAGE_KEY = 'zerodaygpt-chat-history'

let msgIdCounter = 0
const newId = () => ++msgIdCounter
const newConversationId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const truncateTitle = (text) => {
    const cleaned = (text || '').trim().replace(/\s+/g, ' ')
    if (!cleaned) return 'Untitled Chat'
    return cleaned.length > 30 ? `${cleaned.slice(0, 30)}...` : cleaned
}

const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

function groupConversationsByTime(conversations) {
    const now = new Date()
    const todayStart = dayStart(now)
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    const sevenDaysStart = new Date(todayStart)
    sevenDaysStart.setDate(sevenDaysStart.getDate() - 7)

    const groups = {
        today: [],
        yesterday: [],
        previous7: [],
        older: [],
    }

    conversations.forEach((conversation) => {
        const ts = new Date(conversation.timestamp)
        if (ts >= todayStart) groups.today.push(conversation)
        else if (ts >= yesterdayStart) groups.yesterday.push(conversation)
        else if (ts >= sevenDaysStart) groups.previous7.push(conversation)
        else groups.older.push(conversation)
    })

    return groups
}

function useBackendStatus() {
    const [status, setStatus] = useState('connecting')
    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch(`${API_BASE}/health`, {
                    headers: { 'X-API-Key': API_KEY }
                })
                setStatus(res.ok ? 'online' : 'offline')
            } catch {
                setStatus('offline')
            }
        }
        check()
        const interval = setInterval(check, 15000)
        return () => clearInterval(interval)
    }, [])
    return status
}

export default function App() {
    const [messages, setMessages] = useState([])
    const [conversations, setConversations] = useState([])
    const [currentConversationId, setCurrentConversationId] = useState(null)
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
    const [isStreaming, setIsStreaming] = useState(false)
    const [streamingContent, setStreamingContent] = useState('')
    const [activePanel, setActivePanel] = useState('fraud')
    const streamBufferRef = useRef('')
    const backendStatus = useBackendStatus()

    useEffect(() => {
        try {
            const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
            if (!raw) return
            const parsed = JSON.parse(raw)
            if (!Array.isArray(parsed)) return
            const sanitized = parsed
                .filter(item => item && typeof item.id === 'string' && Array.isArray(item.messages))
                .map(item => ({
                    id: item.id,
                    title: item.title || 'Untitled Chat',
                    timestamp: Number(item.timestamp) || Date.now(),
                    messages: item.messages,
                }))
                .sort((a, b) => b.timestamp - a.timestamp)
            setConversations(sanitized)
        } catch {
            // ignore malformed local storage data
        }
    }, [])

    useEffect(() => {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(conversations))
    }, [conversations])

    const handleToken = useCallback((token) => {
        streamBufferRef.current += token
        setStreamingContent(streamBufferRef.current)
    }, [])

    const handleDone = useCallback(() => {
        const finalContent = streamBufferRef.current
        if (finalContent) {
            setMessages(prev => [...prev, {
                id: newId(),
                role: 'assistant',
                content: finalContent,
                timestamp: Date.now(),
            }])
        }
        streamBufferRef.current = ''
        setStreamingContent('')
        setIsStreaming(false)
    }, [])

    const handleError = useCallback((errMsg) => {
        setMessages(prev => [...prev, {
            id: newId(),
            role: 'system',
            content: errMsg,
            timestamp: Date.now(),
        }])
        streamBufferRef.current = ''
        setStreamingContent('')
        setIsStreaming(false)
    }, [])

    const { sendMessage } = useWebSocket({
        onToken: handleToken,
        onDone: handleDone,
        onError: handleError,
    })

    const handleSend = useCallback(async (text) => {
        if (!text.trim() || isStreaming) return

        const now = Date.now()
        let conversationId = currentConversationId
        const trimmed = text.trim()

        if (!conversationId) {
            conversationId = newConversationId()
            setCurrentConversationId(conversationId)
            setConversations(prev => [{
                id: conversationId,
                title: truncateTitle(trimmed),
                timestamp: now,
                messages: [],
            }, ...prev])
        }

        const userMsg = {
            id: newId(),
            role: 'user',
            content: text,
            timestamp: now,
        }

        setMessages(prev => [...prev, userMsg])
        setConversations(prev => prev.map(conv => {
            if (conv.id !== conversationId) return conv
            const nextTitle = conv.messages.length === 0 ? truncateTitle(trimmed) : conv.title
            return {
                ...conv,
                title: nextTitle,
                timestamp: now,
                messages: [...conv.messages, userMsg],
            }
        }).sort((a, b) => b.timestamp - a.timestamp))
        setIsStreaming(true)
        streamBufferRef.current = ''
        setStreamingContent('')

        // Build history for context
        const history = messages.slice(-20).map(m => ({
            role: m.role === 'system' ? 'user' : m.role,
            content: m.content,
        }))

        await sendMessage(text, history)
    }, [isStreaming, messages, sendMessage, currentConversationId])

    useEffect(() => {
        if (!currentConversationId) return
        setConversations(prev => prev.map(conv => {
            if (conv.id !== currentConversationId) return conv
            return {
                ...conv,
                timestamp: Date.now(),
                messages,
            }
        }).sort((a, b) => b.timestamp - a.timestamp))
    }, [messages, currentConversationId])

    const handleClear = () => {
        setMessages([])
        setStreamingContent('')
        streamBufferRef.current = ''
        setIsStreaming(false)
        if (currentConversationId) {
            setConversations(prev => prev.map(conv => (
                conv.id === currentConversationId
                    ? { ...conv, timestamp: Date.now(), messages: [] }
                    : conv
            )).sort((a, b) => b.timestamp - a.timestamp))
        }
    }

    const handleNewChat = () => {
        if (isStreaming) return
        setCurrentConversationId(null)
        setMessages([])
        setStreamingContent('')
        streamBufferRef.current = ''
        setIsStreaming(false)
    }

    const handleSelectConversation = (conversationId) => {
        if (isStreaming) return
        const selected = conversations.find(conv => conv.id === conversationId)
        if (!selected) return
        setCurrentConversationId(conversationId)
        setMessages(selected.messages || [])
        setStreamingContent('')
        streamBufferRef.current = ''
        setIsStreaming(false)
    }

    const handleDeleteConversation = (event, conversationId) => {
        event.stopPropagation()
        if (isStreaming) return
        const remaining = conversations.filter(conv => conv.id !== conversationId)
        setConversations(remaining)

        if (conversationId !== currentConversationId) return

        if (remaining.length > 0) {
            const nextConversation = remaining[0]
            setCurrentConversationId(nextConversation.id)
            setMessages(nextConversation.messages || [])
        } else {
            setCurrentConversationId(null)
            setMessages([])
        }

        setStreamingContent('')
        streamBufferRef.current = ''
        setIsStreaming(false)
    }

    const groupedHistory = groupConversationsByTime(conversations)

    return (
        <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            {/* ── Header / Banner ── */}
            <header className="app-header">
                <Banner backendStatus={backendStatus} />
            </header>

            {/* ── Left Panel: Chat History ── */}
            <aside className={`left-panel history-sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
                <div className="panel-header history-header">
                    {!isSidebarCollapsed && (
                        <>
                            <div className="panel-dot cyan" />
                            <span className="panel-header-title">[CHAT HISTORY]</span>
                        </>
                    )}
                    <button
                        className="history-toggle-btn"
                        onClick={() => setIsSidebarCollapsed(prev => !prev)}
                        title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {isSidebarCollapsed ? '›' : '‹'}
                    </button>
                </div>

                {!isSidebarCollapsed && (
                    <>
                        <div className="history-actions">
                            <button
                                className="history-new-btn"
                                onClick={handleNewChat}
                                disabled={isStreaming}
                            >
                                + New Chat
                            </button>
                        </div>

                        <div className="history-list">
                            {[
                                { key: 'today', label: 'Today' },
                                { key: 'yesterday', label: 'Yesterday' },
                                { key: 'previous7', label: 'Previous 7 Days' },
                                { key: 'older', label: 'Older' },
                            ].map(({ key, label }) => (
                                groupedHistory[key].length > 0 && (
                                    <div className="history-group" key={key}>
                                        <div className="history-group-label">{label}</div>
                                        {groupedHistory[key].map((conversation) => (
                                            <div
                                                key={conversation.id}
                                                className={`history-item ${currentConversationId === conversation.id ? 'active' : ''}`}
                                                onClick={() => handleSelectConversation(conversation.id)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter' || event.key === ' ') {
                                                        event.preventDefault()
                                                        handleSelectConversation(conversation.id)
                                                    }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                                title={conversation.title}
                                            >
                                                <span className="history-item-title">{conversation.title}</span>
                                                <span className="history-item-time">
                                                    {new Date(conversation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="history-delete-btn"
                                                    onClick={(event) => handleDeleteConversation(event, conversation.id)}
                                                    title="Delete conversation"
                                                >
                                                    🗑
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )
                            ))}

                            {conversations.length === 0 && (
                                <div className="history-empty">
                                    No chats yet.<br />
                                    <span>Start a new conversation.</span>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </aside>

            {/* ── Main Chat ── */}
            <main className="main-chat">
                <ChatWindow
                    messages={messages}
                    streamingContent={isStreaming ? streamingContent : undefined}
                    isStreaming={isStreaming}
                />
                <InputBar
                    onSend={handleSend}
                    isStreaming={isStreaming}
                    disabled={false}
                />
            </main>

            {/* ── Right Panel: Fraud Detector + Controls ── */}
            <aside className="right-panel">
                {/* Panel tabs */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--neon-green-border)' }}>
                    {[
                        { id: 'fraud', label: '[FRAUD SCAN]', dot: 'red' },
                        { id: 'settings', label: '[CONSOLE]', dot: 'yellow' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActivePanel(tab.id)}
                            style={{
                                flex: 1,
                                background: activePanel === tab.id ? 'rgba(0,255,65,0.05)' : 'transparent',
                                border: 'none',
                                borderBottom: activePanel === tab.id ? '2px solid var(--neon-green)' : '2px solid transparent',
                                color: activePanel === tab.id ? 'var(--neon-green)' : 'var(--text-dim)',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '9px',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                padding: '8px 4px',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activePanel === 'fraud' && (
                    <>
                        <div className="panel-header" style={{ borderTop: 'none' }}>
                            <div className="panel-dot red" />
                            <span className="panel-header-title">FRAUD DETECTOR</span>
                        </div>
                        <FraudDetector />
                    </>
                )}

                {activePanel === 'settings' && (
                    <>
                        <div className="panel-header">
                            <div className="panel-dot yellow" />
                            <span className="panel-header-title">SYSTEM CONSOLE</span>
                        </div>
                        <div className="panel-content" style={{ padding: 0 }}>
                            {/* Status */}
                            <div className="status-indicator">
                                <div className={`status-dot ${backendStatus}`} />
                                <span style={{ color: 'var(--text-secondary)' }}>Backend: {backendStatus.toUpperCase()}</span>
                            </div>
                            <div className="status-indicator">
                                <div className="status-dot online" />
                                <span style={{ color: 'var(--text-secondary)' }}>Fraud Module: ARMED</span>
                            </div>

                            {/* Stats */}
                            <div className="settings-section">
                                <div className="settings-label">Session Stats</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '2' }}>
                                    <div>Messages: <span style={{ color: 'var(--neon-green)' }}>{messages.length}</span></div>
                                    <div>Status: <span style={{ color: isStreaming ? 'var(--neon-yellow)' : 'var(--neon-green)' }}>
                                        {isStreaming ? 'STREAMING' : 'IDLE'}
                                    </span></div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="settings-section">
                                <div className="settings-label">Actions</div>
                                <button
                                    onClick={handleClear}
                                    style={{
                                        width: '100%',
                                        background: 'transparent',
                                        border: '1px solid rgba(255,0,64,0.4)',
                                        color: 'var(--neon-red)',
                                        fontFamily: 'var(--font-mono)',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        padding: '7px',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                        letterSpacing: '0.1em',
                                        transition: 'all 0.2s',
                                        marginBottom: '6px',
                                    }}
                                    onMouseEnter={e => e.target.style.background = 'rgba(255,0,64,0.08)'}
                                    onMouseLeave={e => e.target.style.background = 'transparent'}
                                >
                                    [ CLEAR SESSION ]
                                </button>
                            </div>

                            {/* API Config */}
                            <div className="settings-section">
                                <div className="settings-label">Config</div>
                                <div className="settings-info">
                                    Set <span style={{ color: 'var(--neon-green)' }}>VITE_API_KEY</span> and{' '}
                                    <span style={{ color: 'var(--neon-green)' }}>VITE_WS_URL</span> in{' '}
                                    <span style={{ color: 'var(--neon-cyan)' }}>frontend/.env</span>
                                </div>
                                <div className="settings-info" style={{ marginTop: '8px' }}>
                                    Set <span style={{ color: 'var(--neon-green)' }}>OPENAI_API_KEY</span> and{' '}
                                    <span style={{ color: 'var(--neon-green)' }}>MODEL_NAME</span> in{' '}
                                    <span style={{ color: 'var(--neon-cyan)' }}>backend/.env</span>
                                </div>
                            </div>

                            {/* Quick commands */}
                            <div className="settings-section">
                                <div className="settings-label">Quick Commands</div>
                                {[
                                    'Explain SQL injection with a simulated payload',
                                    'What is a buffer overflow attack?',
                                    'Show me a reverse shell template',
                                    'Explain XSS attack vectors',
                                    'How does privilege escalation work?',
                                ].map((cmd, i) => (
                                    <div
                                        key={i}
                                        onClick={() => handleSend(cmd)}
                                        style={{
                                            fontSize: '10px',
                                            color: 'var(--text-secondary)',
                                            padding: '5px 0',
                                            borderBottom: '1px solid rgba(0,255,65,0.05)',
                                            cursor: 'pointer',
                                            transition: 'color 0.15s',
                                        }}
                                        onMouseEnter={e => e.target.style.color = 'var(--neon-green)'}
                                        onMouseLeave={e => e.target.style.color = 'var(--text-secondary)'}
                                    >
                                        → {cmd}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </aside>
        </div>
    )
}
