const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')
const { getPostHogExpoConfig } = require('posthog-react-native/metro')

/**
 * Metro with Expo's defaults, compiling `global.css` through NativeWind.
 * PostHog's config is Expo's default config built with its serializer plugin,
 * which writes a chunk ID into each bundle and its source map, so a release
 * frame resolves through the uploaded map. It comes first because it creates
 * the base config; `withNativeWind` then wraps that config and keeps its
 * serializer.
 */
module.exports = withNativeWind(getPostHogExpoConfig(__dirname, { getDefaultConfig }), {
  input: './global.css',
})
