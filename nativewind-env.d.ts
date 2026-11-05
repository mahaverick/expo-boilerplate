/// <reference types="nativewind/types" />

/**
 * NativeWind's Tailwind preset. The package's own declaration for this path is
 * an empty file, which TypeScript rejects as not a module.
 */
declare module 'nativewind/preset' {
  const preset: import('tailwindcss').Config
  export default preset
}

/** A stylesheet import, which Metro compiles through NativeWind and which exports nothing. */
declare module '*.css'
