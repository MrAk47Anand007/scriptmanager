import { useCallback, useEffect, useState } from 'react'
import { ArrowUp, Download, File as FileIcon, Folder, LoaderCircle, RefreshCw, Save, Trash2, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  deleteSftpEntryRuntime,
  listSftpDirRuntime,
  readSftpTextRuntime,
  writeSftpTextRuntime,
  type SftpEntryRuntime,
} from '@/lib/sftpRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/**
 * SFTP browser: navigate a server profile's filesystem, preview text files,
 * upload/save text content, and delete entries.
 */
export function SftpBrowserDialog({ open, onOpenChange, profileId, profileName }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string
  profileName: string
}) {
  const [dir, setDir] = useState('~')
  const [entries, setEntries] = useState<SftpEntryRuntime[]>([])
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<{ path: string; content: string; binary?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const result = await listSftpDirRuntime({ profileId, path })
      setDir(result.path)
      setEntries(result.entries)
    } catch (error) {
      toast.error(getOperationError(error, `Failed to list ${path}`))
    } finally {
      setLoading(false)
    }
  }, [profileId])

  useEffect(() => {
    if (open) {
      setDir('~')
      setPreview(null)
      void load('~')
    }
  }, [open, load])

  const openEntry = async (entry: SftpEntryRuntime) => {
    const path = entry.path ?? joinPath(dir, entry.name)
    if (entry.isDir) {
      setPreview(null)
      void load(path)
      return
    }
    try {
      const result = await readSftpTextRuntime({ profileId, path })
      if (result.binary) {
        toast.error('Binary file — text preview unavailable')
        return
      }
      setPreview({ path, content: result.content })
    } catch (error) {
      toast.error(getOperationError(error, `Failed to read ${path}`))
    }
  }

  const savePreview = async () => {
    if (!preview) return
    setSaving(true)
    try {
      await writeSftpTextRuntime({ profileId, path: preview.path, content: preview.content })
      toast.success(`Saved ${preview.path}`)
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  const uploadTo = async (dirPath: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const content = await file.text()
      const path = `${joinPath(dirPath, file.name)}`
      try {
        await writeSftpTextRuntime({ profileId, path, content })
        toast.success(`Uploaded ${file.name}`)
        await load(dirPath)
      } catch (error) {
        toast.error(getOperationError(error, `Failed to upload ${file.name}`))
      }
    }
    input.click()
  }

  const remove = async (entry: SftpEntryRuntime) => {
    const path = entry.path ?? joinPath(dir, entry.name)
    try {
      await deleteSftpEntryRuntime({ profileId, path }, entry.isDir)
      toast.success(`Deleted ${path}`)
      await load(dir)
    } catch (error) {
      toast.error(getOperationError(error, `Failed to delete ${path}`))
    }
  }

  const crumbs = dir === '~' ? ['~'] : dir.split('/').filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            SFTP browser — <span className="font-mono text-xs text-muted-foreground">{profileName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1.5 text-xs">
          <Button variant="outline" className="h-7 w-7 p-0" disabled={dir === '~'} onClick={() => void load(parentOf(dir))} aria-label="Up one level">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {crumbs.map((crumb, index) => (
              <button
                key={index}
                onClick={() => void load(index === 0 ? '~' : `/${crumbs.slice(1, index + 1).join('/')}`)}
                className="hover:text-foreground"
              >
                {crumb}/{' '}
              </button>
            ))}
          </div>
          <Button variant="outline" className="h-7 w-7 p-0" onClick={() => void load(dir)} aria-label="Refresh">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </Button>
          <Button variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => void uploadTo(dir)}>
            <Upload className="h-3 w-3" /> Upload here
          </Button>
        </div>

        {preview && (
          <div className="space-y-1.5 rounded-md border border-wb-border p-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">{preview.path}</span>
              <Button className="h-6 gap-1 px-2 text-[10px]" disabled={saving} onClick={() => void savePreview()}>
                <Save className="h-3 w-3" /> Save
              </Button>
              <Button variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setPreview(null)}>Close</Button>
            </div>
            <textarea
              value={preview.content}
              onChange={(event) => setPreview({ ...preview, content: event.target.value })}
              spellCheck={false}
              className="h-40 w-full resize-none rounded border border-wb-border bg-background p-2 font-mono text-[10px] outline-none focus:border-accent-brand"
            />
          </div>
        )}

        <div className="max-h-72 min-h-0 overflow-y-auto rounded-md border border-wb-border">
          {entries.map((entry, index) => (
            <div
              key={`${entry.name}-${index}`}
              className={cn(
                'group flex items-center gap-2 border-b border-wb-border/60 px-2 py-1.5 text-xs last:border-0',
                entry.isDir ? 'cursor-pointer hover:bg-muted/50' : 'hover:bg-muted/30'
              )}
              onDoubleClick={() => void openEntry(entry)}
            >
              {entry.isDir
                ? <Folder className="h-3.5 w-3.5 shrink-0 text-accent-brand" />
                : <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => void openEntry(entry)}>
                {entry.name}
              </button>
              {!entry.isDir && entry.size !== undefined && entry.size !== null && (
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatSize(entry.size)}</span>
              )}
              {!entry.isDir && (
                <button
                  aria-label={`Preview ${entry.name}`}
                  onClick={() => void openEntry(entry)}
                  className="rounded p-1 text-slate-400 opacity-0 hover:text-foreground group-hover:opacity-100"
                >
                  <Download className="h-3 w-3" />
                </button>
              )}
              <button
                aria-label={`Delete ${entry.name}`}
                onClick={() => void remove(entry)}
                className="rounded p-1 text-slate-400 opacity-0 hover:text-red-500 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          )}
          {!loading && entries.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">Empty directory.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function joinPath(dir: string, name: string): string {
  if (dir === '~') return `~/${name}`
  if (dir === '/') return `/${name}`
  return `${dir}/${name}`
}

function parentOf(dir: string): string {
  if (dir === '~' || dir === '/') return dir
  const withoutTrailing = dir.replace(/\/$/, '')
  const lastSlash = withoutTrailing.lastIndexOf('/')
  if (lastSlash <= 0) return dir.startsWith('~') ? '~' : '/'
  return withoutTrailing.slice(0, lastSlash)
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
