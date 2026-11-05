/**
 * Babel for Metro and Jest: Expo's preset with NativeWind's JSX runtime, so a
 * `className` becomes a style, and no console calls in a production bundle.
 */
module.exports = function babelConfig(api) {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    env: {
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  }
}
