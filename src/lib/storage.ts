import { createMMKV } from 'react-native-mmkv'

/** The app's one MMKV instance: the theme choice and the `installed` marker live here. */
export const storage = createMMKV()
