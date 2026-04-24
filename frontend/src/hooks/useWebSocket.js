import { useRef, useCallback } from 'react'

const API_KEY = import.meta.env.VITE_API_KEY || 'zerodaygpt-dev-key'
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/chat'

export function useWebSocket({ onToken, onDone, onError }) {
    const wsRef = useRef(null)
    const isConnectedRef = useRef(false)

    const connect = useCallback(() => {
        return new Promise((resolve, reject) => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                resolve()
                return
            }

            const ws = new WebSocket(WS_URL)
            wsRef.current = ws

            ws.onopen = () => {
                isConnectedRef.current = true
                resolve()
            }

            ws.onerror = (err) => {
                isConnectedRef.current = false
                reject(err)
                onError?.('WebSocket connection failed. Is the backend running?')
            }

            ws.onclose = () => {
                isConnectedRef.current = false
                wsRef.current = null
            }

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data)
                    if (data.token) {
                        onToken?.(data.token)
                    } else if (data.done) {
                        onDone?.()
                    } else if (data.error) {
                        onError?.(data.error)
                        onDone?.()
                    }
                } catch {
                    // ignore parse errors
                }
            }
        })
    }, [onToken, onDone, onError])

    const sendMessage = useCallback(async (message, history = []) => {
        try {
            await connect()
            const payload = JSON.stringify({
                message,
                history,
                api_key: API_KEY,
            })
            wsRef.current?.send(payload)
        } catch (err) {
            onError?.(`[ZERODAYGPT] Connection error: ${err.message || 'Backend offline'}`)
            onDone?.()
        }
    }, [connect, onError, onDone])

    const disconnect = useCallback(() => {
        wsRef.current?.close()
        wsRef.current = null
        isConnectedRef.current = false
    }, [])

    return { sendMessage, disconnect, isConnected: isConnectedRef }
}
