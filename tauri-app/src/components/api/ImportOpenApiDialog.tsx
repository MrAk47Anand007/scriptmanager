import { useState } from 'react'
import { FileJson, Upload } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { importOpenApiRuntime } from '@/lib/apiRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

/** Paste or pick an OpenAPI 3 / Swagger document (JSON or YAML) to import. */
export function ImportOpenApiDialog({ open, onOpenChange, onImported }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: (collectionId: string) => void
}) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const importSpec = async (spec: string, name?: string) => {
    setImporting(true)
    try {
      const result = await importOpenApiRuntime({ spec, name })
      toast.success(`Imported ${result.requestCount} requests into “${result.collectionName}”`)
      setText('')
      setFileName(null)
      onOpenChange(false)
      onImported(result.collectionId)
    } catch (error) {
      toast.error(getOperationError(error, 'OpenAPI import failed'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import OpenAPI</DialogTitle>
          <DialogDescription>
            Creates a collection with one request per operation — paths templated, query params and JSON bodies pre-filled, and a status check per request.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-1.5 h-8 text-xs"
              disabled={importing}
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.json,.yaml,.yml'
                input.onchange = async () => {
                  const file = input.files?.[0]
                  if (!file) return
                  setFileName(file.name)
                  setText(await file.text())
                }
                input.click()
              }}
            >
              <Upload className="h-3.5 w-3.5" /> Choose file
            </Button>
            {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            placeholder={'{\n  "openapi": "3.0.0",\n  "info": { "title": "My API" },\n  "paths": { … }\n}'}
            className="h-48 w-full resize-none rounded-md border border-wb-border bg-background p-2.5 font-mono text-[11px] outline-none focus:border-accent-brand"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="gap-1.5"
            disabled={importing || !text.trim()}
            onClick={() => void importSpec(text)}
          >
            <FileJson className="h-4 w-4" />
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
