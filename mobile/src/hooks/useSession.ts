import { useCallback, useRef, useState } from 'react'
import { parseFrame, parseBeacon, decode, type DecodedPayload } from '../qrvid-core'

export type ScanState = 'idle' | 'scanning' | 'collecting' | 'complete' | 'error'

export interface SessionProgress {
  received: number
  total: number
  loopCount: number        // how many times the beacon has been seen (= full loops)
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

const EMPTY_PROGRESS: SessionProgress = { received: 0, total: 0, loopCount: 0, sessionId: null }

export function useSession(): SessionResult {
  const [state, setState] = useState<ScanState>('idle')
  const [progress, setProgress] = useState<SessionProgress>(EMPTY_PROGRESS)
  const [result, setResult] = useState<DecodedPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  // frameIndex → raw frame string
  const framesRef = useRef<Map<number, string>>(new Map())
  const sessionIdRef = useRef<string | null>(null)
  const totalFramesRef = useRef<number>(0)
  const loopCountRef = useRef<number>(0)

  const reset = useCallback(() => {
    framesRef.current.clear()
    sessionIdRef.current = null
    totalFramesRef.current = 0
    loopCountRef.current = 0
    setState('idle')
    setProgress(EMPTY_PROGRESS)
    setResult(null)
    setError(null)
  }, [])

  const onFrameScanned = useCallback((rawQr: string) => {
    // Try beacon first
    const beacon = parseBeacon(rawQr)
    if (beacon) {
      const { sessionId, totalFrames } = beacon

      if (sessionIdRef.current && sessionIdRef.current !== sessionId) {
        // Different session beacon — start fresh
        framesRef.current.clear()
        loopCountRef.current = 0
      }

      if (!sessionIdRef.current) {
        sessionIdRef.current = sessionId
        totalFramesRef.current = totalFrames
        setState('collecting')
      } else {
        // Same session beacon = completed one more loop
        loopCountRef.current += 1
      }

      setProgress(p => ({
        ...p,
        total: totalFrames,
        sessionId,
        loopCount: loopCountRef.current,
      }))
      return
    }

    // Try data frame
    const parsed = parseFrame(rawQr)
    if (!parsed) return

    const { sessionId, frameIndex, totalFrames } = parsed

    // If we see a different session, start fresh
    if (sessionIdRef.current && sessionIdRef.current !== sessionId) {
      framesRef.current.clear()
      sessionIdRef.current = null
      totalFramesRef.current = 0
      loopCountRef.current = 0
    }

    if (!sessionIdRef.current) {
      sessionIdRef.current = sessionId
      totalFramesRef.current = totalFrames
      setState('collecting')
    }

    // Idempotent — skip if already have this frame
    if (framesRef.current.has(frameIndex)) return

    framesRef.current.set(frameIndex, rawQr)
    const received = framesRef.current.size

    setProgress({
      received,
      total: totalFrames,
      sessionId,
      loopCount: loopCountRef.current,
    })
    setState('collecting')

    if (received === totalFrames) {
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
