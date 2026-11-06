import type { ConfigContext, ExpoConfig } from 'expo/config'
import packageJson from './package.json'

/** The app's Expo config. The version comes from package.json, which release tooling bumps. */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'expo-boilerplate',
  slug: 'expo-boilerplate',
  version: packageJson.version,
  scheme: 'expo-boilerplate',
  platforms: ['ios', 'android'],
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    infoPlist: {
      // Plain HTTP reaches only local hosts, such as a simulator's localhost API.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: true },
    },
  },
  android: {
    predictiveBackGestureEnabled: true,
    // The template's optional permissions; nothing in the app uses them. INTERNET stays.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
})
