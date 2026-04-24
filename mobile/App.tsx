import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { StatusBar } from 'expo-status-bar'
import { ScanScreen } from './src/screens/ScanScreen'
import { ResultScreen } from './src/screens/ResultScreen'
import type { DecodedPayload } from './src/qrvid-core'

export type RootStackParamList = {
  Scan: undefined
  Result: { payload: DecodedPayload }
}

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Scan"
        screenOptions={{
          headerStyle: { backgroundColor: '#0d1117' },
          headerTintColor: '#58a6ff',
          headerTitleStyle: { fontWeight: '700', color: '#e6edf3' },
          contentStyle: { backgroundColor: '#0d1117' },
        }}
      >
        <Stack.Screen
          name="Scan"
          component={ScanScreen}
          options={{ title: 'qrvid Scanner', headerShown: false }}
        />
        <Stack.Screen
          name="Result"
          component={ResultScreen}
          options={{ title: 'Decoded' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  )
}
