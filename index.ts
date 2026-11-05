/**
 * @file The app's entry. The polyfills load first, before Expo Router or any
 * shared module that calls the APIs they install.
 */
import './src/polyfills'
import 'expo-router/entry'
