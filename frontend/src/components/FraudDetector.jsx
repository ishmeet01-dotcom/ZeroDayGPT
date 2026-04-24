import { useState, useRef, useCallback } from 'react'

const API_KEY = import.meta.env.VITE_API_KEY || 'zerodaygpt-dev-key'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function FraudDetector() {
    const [file, setFile] = useState(null)
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef(null)

    const handleFile = (f) => {
        if (!f) return
        setFile(f)
        setResult(null)
        setError(null)
    }

    const handleDrop = useCallback((e) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) handleFile(f)
    }, [])

    const handleAnalyze = async () => {
        if (!file) return
        setLoading(true)
        setError(null)
        setResult(null)

        const formData = new FormData()
        formData.append('file', file)

        try {
            const res = await fetch(`${API_BASE}/fraudcheck`, {
                method: 'POST',
                headers: { 'X-API-Key': API_KEY },
                body: formData,
            })
            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || `HTTP ${res.status}`)
            }
            const data = await res.json()
            setResult(data)
        } catch (err) {
            setError(`[ERROR] ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const riskClass = result?.status?.includes('HIGH') ? 'high'
        : result?.status?.includes('MEDIUM') ? 'medium' : 'low'

    return (
        <div className="panel-content" style={{ padding: 0 }}>
            {/* Upload zone */}
            <div
                className={`fraud-upload-zone ${dragOver ? 'drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
            >
                <div className="fraud-upload-icon">📧</div>
                <div className="fraud-upload-text">
                    {file ? (
                        <>
                            <span style={{ color: 'var(--neon-green)' }}>✓ {file.name}</span><br />
                            <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                                {(file.size / 1024).toFixed(1)} KB · Click to change
                            </span>
                        </>
                    ) : (
                        <>
                            Drop email screenshot or .txt file<br />
                            <span style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                                Supports: .txt · .png · .jpg · .jpeg
                            </span>
                        </>
                    )}
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    className="fraud-upload-input"
                    accept=".txt,.png,.jpg,.jpeg,text/plain,image/*"
                    onChange={e => handleFile(e.target.files[0])}
                />
            </div>

            {/* Analyze button */}
            <button
                className="fraud-analyze-btn"
                onClick={handleAnalyze}
                disabled={!file || loading}
            >
                {loading ? '[ ANALYZING... ]' : '[ RUN FRAUD SCAN ]'}
            </button>

            {/* Error */}
            {error && (
                <div style={{ margin: '0 12px 12px', fontSize: '10px', color: 'var(--neon-red)' }}>
                    {error}
                </div>
            )}

            {/* Verdict */}
            {result && (
                <>
                    <div className={`fraud-verdict ${riskClass}`}>
                        <div className="fraud-verdict-header">
                            [FRAUD DETECTOR] :: {result.status}
                        </div>
                        <div className="fraud-confidence">
                            Confidence: {result.confidence}% | Source: {result.source}
                        </div>
                        {result.reasons?.map((r, i) => (
                            <div key={i} className="fraud-reason">{r}</div>
                        ))}
                    </div>

                    {/* Raw log */}
                    <div className="fraud-log">{result.verdict_log}</div>

                    {/* Text preview */}
                    {result.text_preview && (
                        <div style={{ margin: '0 12px 12px' }}>
                            <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '4px', letterSpacing: '0.1em' }}>
                                [EXTRACTED TEXT PREVIEW]
                            </div>
                            <div style={{
                                background: 'var(--bg-input)',
                                border: '1px solid rgba(0,255,65,0.1)',
                                borderRadius: '2px',
                                padding: '8px',
                                fontSize: '10px',
                                color: 'var(--text-secondary)',
                                maxHeight: '80px',
                                overflowY: 'auto',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                            }}>
                                {result.text_preview}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
