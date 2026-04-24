import React from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share } from 'react-native'
import * as Linking from 'expo-linking'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../App'
import type { DecodedPayload } from '../qrvid-core'

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>

// Build the hash-fragment URL — mirrors the web encoder's buildHandoffUrl
function buildHandoffUrl(payload: DecodedPayload): string {
  const envelope = { v: payload.v, data: payload.data, url: payload.url }
  return payload.url + '#qrvid=' + btoa(JSON.stringify(envelope))
}

export function ResultScreen({ navigation, route }: Props) {
  const payload = route.params.payload
  const hasUrl = Boolean(payload.url)
  const preview = payload.data.length > 600 ? payload.data.slice(0, 600) + '…' : payload.data

  async function openInBrowser() {
    if (!payload.url) return
    const url = buildHandoffUrl(payload)
    await Linking.openURL(url)
  }

  async function shareData() {
    await Share.share({ message: payload.data })
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Decoded data</Text>
        <Text style={styles.dataText}>{preview}</Text>
        {payload.data.length > 600 && (
          <Text style={styles.hint}>{payload.data.length.toLocaleString()} chars total</Text>
        )}
      </View>

      {hasUrl && (
        <View style={styles.card}>
          <Text style={styles.label}>Target URL</Text>
          <Text style={styles.urlText}>{payload.url}</Text>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={openInBrowser}>
            <Text style={styles.btnText}>Open in Browser →</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            Opens the URL with your data injected as a hash fragment.
            The site reads it client-side — no data hits the server.
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={shareData}>
          <Text style={styles.btnTextDark}>Share Data</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => navigation.navigate('Scan')}>
          <Text style={styles.btnTextDark}>Scan Again</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0d1117' },
  container: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#21262d',
    padding: 14,
    marginBottom: 12,
  },
  label: { color: '#8b949e', fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  dataText: { color: '#e6edf3', fontFamily: 'monospace', fontSize: 12, lineHeight: 18 },
  urlText: { color: '#58a6ff', fontSize: 13, marginBottom: 10 },
  hint: { color: '#6e7681', fontSize: 11, marginTop: 6, lineHeight: 15 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { borderRadius: 8, paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center', flex: 1 },
  btnPrimary: { backgroundColor: '#1f6feb', marginTop: 8 },
  btnSecondary: { backgroundColor: '#21262d' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  btnTextDark: { color: '#e6edf3', fontWeight: '600', fontSize: 14 },
})
