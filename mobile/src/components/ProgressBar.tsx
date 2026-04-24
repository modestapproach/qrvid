import React from 'react'
import { View, StyleSheet } from 'react-native'

interface Props {
  received: number
  total: number
}

export function ProgressBar({ received, total }: Props) {
  const pct = total > 0 ? Math.min(received / total, 1) : 0
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` as any }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: '#21262d',
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    backgroundColor: '#58a6ff',
    borderRadius: 3,
  },
})
