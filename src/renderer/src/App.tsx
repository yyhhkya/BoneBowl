import { useEffect } from 'react'
import { SettingsPage } from './settings/SettingsPage'
import { TitleBar } from './settings/TitleBar'
import { OverlayPage } from './overlay/OverlayPage'

export function App(): React.JSX.Element {
  const isOverlay = window.location.pathname.includes('overlay')

  useEffect(() => {
    document.documentElement.classList.add(isOverlay ? 'page-overlay' : 'page-settings')
    document.body.classList.add(isOverlay ? 'page-overlay' : 'page-settings')
    document.title = isOverlay ? 'BoneBowl Overlay' : 'BoneBowl'
    return () => {
      document.documentElement.classList.remove('page-overlay', 'page-settings')
      document.body.classList.remove('page-overlay', 'page-settings')
    }
  }, [isOverlay])

  return isOverlay ? (
    <OverlayPage />
  ) : (
    <div className="flex min-h-[100dvh] flex-col">
      <TitleBar />
      <div className="min-w-0 flex-1">
        <SettingsPage />
      </div>
    </div>
  )
}
