const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

/** Metro with Expo's defaults, compiling `global.css` through NativeWind. */
module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' })
