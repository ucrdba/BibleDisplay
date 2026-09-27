/// <reference types="vite/client" />
import type { BibleApi } from '../../shared/api'

declare global {
  interface Window {
    bible: BibleApi
  }
}

export {}
