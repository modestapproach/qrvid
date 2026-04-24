import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { ProgressBar } from './ProgressBar'
import type { ScanState, SessionProgress } from '../hooks/useSession'

interface Props {
  state: ScanState
  progress: SessionProgress
}

export function FrameOverlay({ state, progress }: Props) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      {state === 'idle' || state === 'scanning' ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>Point camera at animated QR</Text>
        </View>
      ) : state === 'collecting' ? (
        <View style={styles.collectingBox}>
          <Text style={styles.collectingText}>
            {progress.received} / {progress.total} frames
          </Text>
          <ProgressBar received={progress.received} total={progress.total} />
          {progress.sessionId ? (
            <Text style={styles.sessionText}>Session {progress.sessionId.slice(0, 4)}…</Text>
          ) : null}
        </View>
      ) : state === 'complete' ? (
        <View style={[styles.pill, styles.pillSuccess]}>
          <Text style={styles.pillText}>✓ Decoded!</Text>
        </View>
      ) : state === 'error' ? (
        <View style={[styles.pill, styles.pillError]}>
          <Text style={styles.pillText}>Decode error</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  pillSuccess: { backgroundColor: 'rgba(35,134,54,0.85)' },
  pillError: { backgroundColor: 'rgba(218,54,51,0.85)' },
  pillText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  collectingBox: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    gap: 8,
  },
  collectingText: {
    color: '#e6edf3',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  sessionText: {
    color: '#8b949e',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
})
