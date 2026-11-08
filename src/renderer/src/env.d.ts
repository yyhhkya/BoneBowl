/// <reference types="vite/client" />
import type { BoneBowlAPI } from '../../shared/types'

declare global {
  interface Window {
    bonebowl?: BoneBowlAPI
  }
}
