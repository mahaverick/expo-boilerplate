/** Babel for Metro and Jest: Expo's preset, and no console calls in a production bundle. */
module.exports = function babelConfig(api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    env: {
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  }
}
