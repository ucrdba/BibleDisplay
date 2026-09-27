/// <reference types="vite/client" />
import type { BibleApi } from '../../shared/api'

declare global {
  /** The app version from package.json, filled in at build time (electron.vite.config.ts). */
  const __APP_VERSION__: string

  interface Window {
    bible: BibleApi
  }
}

export {}
