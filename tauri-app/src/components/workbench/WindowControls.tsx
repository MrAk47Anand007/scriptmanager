import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Copy, Minus, Square, X } from 'lucide-react'
import { toast } from '@/components/ui/toast'

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const appWindow = getCurrentWindow()
    let active = true
    let unlisten: (() => void) | undefined

    const updateMaximized = async () => {
      const value = await appWindow.isMaximized()
      if (active) setMaximized(value)
    }

    void appWindow.onResized(() => {
      void updateMaximized().catch(console.error)
    }).then((cleanup) => {
      if (active) {
        unlisten = cleanup
        void updateMaximized().catch(console.error)
      } else {
        cleanup()
      }
    }).catch(console.error)

    return () => {
      active = false
      unlisten?.()
    }
  }, [])

  const runAction = async (action: 'minimize' | 'toggleMaximize' | 'close') => {
    try {
      const appWindow = getCurrentWindow()
      await appWindow[action]()
      if (action === 'toggleMaximize') setMaximized(await appWindow.isMaximized())
    } catch (error) {
      console.error(`Window ${action} failed`, error)
      toast.error('Unable to update the window. Please try again.')
    }
  }

  return (
    <div className="desktop-no-drag ml-1 flex h-full shrink-0 items-stretch border-l border-wb-border" role="group" aria-label="Window controls">
      <button type="button" className="window-control" aria-label="Minimize window" title="Minimize" onClick={() => void runAction('minimize')}>
        <Minus aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <button type="button" className="window-control" aria-label={maximized ? 'Restore window' : 'Maximize window'} title={maximized ? 'Restore' : 'Maximize'} onClick={() => void runAction('toggleMaximize')}>
        {maximized ? <Copy aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Square aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.5} />}
      </button>
      <button type="button" className="window-control window-control-close" aria-label="Close window" title="Close" onClick={() => void runAction('close')}>
        <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}
