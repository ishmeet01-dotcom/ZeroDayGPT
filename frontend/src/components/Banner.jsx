import { useState, useEffect } from 'react'

const BOOT_LINES = [
    'Initializing ZeroDayGPT kernel...',
    'Loading exploit database... [OK]',
    'Connecting to Stack Overflow API... [OK]',
    'Fraud detection module... [ARMED]',
    'Bypassing content filters... [DONE]',
    'System ready. Welcome, operator.',
]

const ASCII_BANNER = `
███████╗███████╗██████╗  ██████╗ ██████╗  █████╗ ██╗   ██╗ ██████╗ ██████╗ ████████╗
╚══███╔╝██╔════╝██╔══██╗██╔═══██╗██╔══██╗██╔══██╗╚██╗ ██╔╝██╔════╝ ██╔══██╗╚══██╔══╝
  ███╔╝ █████╗  ██████╔╝██║   ██║██║  ██║███████║ ╚████╔╝ ██║  ███╗██████╔╝   ██║   
 ███╔╝  ██╔══╝  ██╔══██╗██║   ██║██║  ██║██╔══██║  ╚██╔╝  ██║   ██║██╔═══╝    ██║   
███████╗███████╗██║  ██║╚██████╔╝██████╔╝██║  ██║   ██║   ╚██████╔╝██║        ██║   
╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝        ╚═╝   
`.trim()

export default function Banner({ backendStatus }) {
    const [bootLines, setBootLines] = useState([])
    const [bootDone, setBootDone] = useState(false)

    useEffect(() => {
        let i = 0
        const interval = setInterval(() => {
            if (i < BOOT_LINES.length) {
                setBootLines(prev => [...prev, BOOT_LINES[i]])
                i++
            } else {
                setBootDone(true)
                clearInterval(interval)
            }
        }, 200)
        return () => clearInterval(interval)
    }, [])

    return (
        <div className="banner-container">
            <pre className="ascii-art">{ASCII_BANNER}</pre>
            <div className="banner-tagline">
                <span className="banner-tag">
                    v1.0.0 // <span>UNCENSORED</span> // <span>HACKER MODE</span>
                </span>
                <div className="banner-status">
                    <div className={`panel-dot ${backendStatus === 'online' ? '' : backendStatus === 'connecting' ? 'yellow' : 'red'}`} />
                    <span style={{ fontSize: '10px', letterSpacing: '0.08em' }}>
                        BACKEND: {backendStatus?.toUpperCase() || 'CONNECTING'}
                    </span>
                </div>
            </div>
            {!bootDone && (
                <div style={{ padding: '4px 0', borderTop: '1px solid rgba(0,255,65,0.1)', marginTop: '4px' }}>
                    {bootLines.map((line, i) => (
                        <div key={i} style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                            <span style={{ color: 'var(--neon-green)', marginRight: '8px' }}>[{String(i + 1).padStart(2, '0')}]</span>
                            {line}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
