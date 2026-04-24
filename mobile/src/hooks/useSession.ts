import { useCallback, useRef, useState } from 'react'
import { parseFrame, decode, type DecodedPayload } from '../qrvid-core'

export type ScanState = 'idle' | 'scanning' | 'collecting' | 'complete' | 'error'

export interface SessionProgress {
  received: number
  total: number
  sessionId: string | null
}

export interface SessionResult {
  state: ScanState
  progress: SessionProgress
  result: DecodedPayload | null
  error: string | null
  onFrameScanned: (rawQr: string) => void
  reset: () => void
}

const EMPTY_PROGRESS: SessionProgress = { received: 0, total: 0, sessionId: null }

export function useSession(): SessionResult {
  const [state, setState] = useState<ScanState>('idle')
  const [progress, setProgress] = useState<SessionProgress>(EMPTY_PROGRESS)
  const [result, setResult] = useState<DecodedPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Accumulates raw frame strings keyed by frameIndex
  const framesRef = useRef<Map<number, string>>(new Map())
  const sessionIdRef = useRef<string | null>(null)
  const totalFramesRef = useRef<number>(0)

  const reset = useCallback(() => {
    framesRef.current.clear()
    sessionIdRef.current = null
    totalFramesRef.current = 0
    setState('idle')
    setProgress(EMPTY_PROGRESS)
    setResult(null)
    setError(null)
  }, [])

  const onFrameScanned = useCallback((rawQr: string) => {
    const parsed = parseFrame(rawQr)
    if (!parsed) return  // not a qrvid frame, ignore

    const { sessionId, frameIndex, totalFrames } = parsed

    // If we see a different session, start fresh
    if (sessionIdRef.current && sessionIdRef.current !== sessionId) {
      framesRef.current.clear()
      sessionIdRef.current = null
      totalFramesRef.current = 0
    }

    // Initialise session on first frame
    if (!sessionIdRef.current) {
      sessionIdRef.current = sessionId
      totalFramesRef.current = totalFrames
      setState('collecting')
    }

    // Skip already-received frames (idempotent — camera fires many times)
    if (framesRef.current.has(frameIndex)) return

    framesRef.current.set(frameIndex, rawQr)
    const received = framesRef.current.size

    setProgress({ received, total: totalFrames, sessionId })
    setState('collecting')

    if (received === totalFrames) {
      // All frames collected — decode
      try {
        const allFrames = Array.from(framesRef.current.values())
        const payload = decode(allFrames)
        setResult(payload)
        setState('complete')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
        setState('error')
      }
    }
  }, [])

  return { state, progress, result, error, onFrameScanned, reset }
}
