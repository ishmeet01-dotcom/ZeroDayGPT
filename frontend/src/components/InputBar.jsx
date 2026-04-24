import { useRef, useEffect } from 'react'

export default function InputBar({ onSend, isStreaming, disabled }) {
    const textareaRef = useRef(null)

    useEffect(() => {
        if (!isStreaming) {
            textareaRef.current?.focus()
        }
    }, [isStreaming])

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleSend = () => {
        const value = textareaRef.current?.value?.trim()
        if (!value || isStreaming || disabled) return
        onSend(value)
        textareaRef.current.value = ''
        textareaRef.current.style.height = 'auto'
    }

    const handleInput = () => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }

    return (
        <div className="input-bar">
            <div className="input-wrapper">
                <span className="input-prompt">root@zerodaygpt:~$</span>
                <textarea
                    ref={textareaRef}
                    className="chat-input"
                    placeholder={isStreaming ? 'ZeroDayGPT is responding...' : 'Enter command...'}
                    onKeyDown={handleKeyDown}
                    onInput={handleInput}
                    disabled={isStreaming || disabled}
                    rows={1}
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                />
                <button
                    className="send-btn"
                    onClick={handleSend}
                    disabled={isStreaming || disabled}
                >
                    {isStreaming ? 'EXEC...' : '[SEND]'}
                </button>
            </div>
            <div className="input-meta">
                <span>Enter to send · Shift+Enter for newline</span>
                <span style={{ color: isStreaming ? 'var(--neon-yellow)' : 'var(--text-dim)' }}>
                    {isStreaming ? '● STREAMING' : '○ IDLE'}
                </span>
            </div>
        </div>
    )
}
