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
  },
  android: {
    predictiveBackGestureEnabled: true,
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
})
