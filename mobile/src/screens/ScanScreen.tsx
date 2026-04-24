import React, { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useSession } from '../hooks/useSession'
import { FrameOverlay } from '../components/FrameOverlay'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../../App'

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>

export function ScanScreen({ navigation }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const { state, progress, result, error, onFrameScanned, reset } = useSession()

  // Navigate to result screen once all frames decoded
  useEffect(() => {
    if (state === 'complete' && result) {
      navigation.navigate('Result', { payload: result })
    }
  }, [state, result, navigation])

  if (!permission) {
    return <View style={styles.center}><Text style={styles.text}>Requesting camera…</Text></View>
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera access is needed to scan QR codes.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={({ data }) => onFrameScanned(data)}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />
      <FrameOverlay state={state} progress={progress} />
      {state === 'error' && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={reset}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0d1117' },
  text: { color: '#e6edf3', textAlign: 'center', marginBottom: 16, fontSize: 15 },
  btn: { backgroundColor: '#238636', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  errorBar: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(218,54,51,0.9)',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: { color: '#fff', fontSize: 13, flex: 1 },
  retryText: { color: '#fff', fontWeight: '700', marginLeft: 12 },
})
