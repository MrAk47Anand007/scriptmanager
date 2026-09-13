import { useState } from 'react'
import { CloudUpload, Download, GitBranch, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  exportWorkspaceRuntime,
  importWorkspaceRuntime,
  publishWorkspaceToGitRuntime,
  type ImportWorkspaceResult,
} from '@/lib/workspaceSyncRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

/**
 * Workspace Sync: export/import the whole workspace as a JSON bundle, or
 * publish it to a git repo folder so teams share via their own remotes.
 */
export function WorkspaceSyncSection() {
  const [exporting, setExporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportWorkspaceResult | null>(null)
  const [repoPath, setRepoPath] = useState('')
  const [publishing, setPublishing] = useState(false)

  const download = (content: string, fileName: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const bundle = await exportWorkspaceRuntime()
      download(
        JSON.stringify(bundle, null, 2),
        `scriptmanager-workspace-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      )
      toast.success('Workspace exported')
    } catch (error) {
      toast.error(getOperationError(error, 'Export failed'))
    } finally {
      setExporting(false)
    }
  }

  const doImport = async (dryRun: boolean) => {
    setImporting(true)
    try {
      const bundle = JSON.parse(importText)
      const result = await importWorkspaceRuntime({ bundle, onConflict: 'skip', dryRun })
      setImportResult(result)
      if (dryRun) toast.success(`Dry run: ${result.scripts} scripts, ${result.workflows} workflows, ${result.apiRequests} requests would be imported`)
      else toast.success(`Imported ${result.scripts} scripts, ${result.workflows} workflows, ${result.apiRequests} requests (${result.skipped} skipped)`)
    } catch (error) {
      toast.error(getOperationError(error, 'Import failed'))
    } finally {
      setImporting(false)
    }
  }

  const doPublish = async () => {
    setPublishing(true)
    try {
      const result = await publishWorkspaceToGitRuntime({ repoPath, commitMessage: 'Sync workspace from ScriptManager' })
      toast.success(`Committed ${result.commitId.slice(0, 8)} to ${result.repoPath}`)
    } catch (error) {
      toast.error(getOperationError(error, 'Git publish failed'))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Workspace Sync</h2>
        <p className="text-muted-foreground">Back up or share your whole workspace via a JSON bundle or a git repo folder.</p>
      </div>

      <div className="rounded-lg border border-wb-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-accent-brand" />
          <span className="text-xs font-semibold">Export workspace</span>
        </div>
        <p className="text-[11px] text-muted-foreground">Downloads a JSON bundle with all scripts, API collections + requests, workflows, and data sets.</p>
        <Button className="gap-1.5 h-8 text-xs" disabled={exporting} onClick={() => void doExport()}>
          {exporting ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Export
        </Button>
      </div>

      <div className="rounded-lg border border-wb-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CloudUpload className="h-4 w-4 text-accent-brand" />
          <span className="text-xs font-semibold">Import workspace</span>
        </div>
        <textarea
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder="Paste a workspace bundle JSON…"
          spellCheck={false}
          className="h-28 w-full resize-none rounded-md border border-wb-border bg-background p-2 font-mono text-[10px] outline-none focus:border-accent-brand"
        />
        <div className="flex gap-1.5">
          <Button variant="outline" className="h-8 text-xs" disabled={!importText.trim() || importing} onClick={() => void doImport(true)}>
            Dry run
          </Button>
          <Button className="h-8 text-xs" disabled={!importText.trim() || importing} onClick={() => void doImport(false)}>
            Import (skip existing)
          </Button>
        </div>
        {importResult && (
          <div className="rounded-md border border-wb-border bg-muted/40 p-2 text-[11px] text-muted-foreground">
            {importResult.dryRun ? 'Would import: ' : 'Imported: '}
            {importResult.scripts} scripts, {importResult.collections} collections, {importResult.apiRequests} requests, {importResult.workflows} workflows
            {importResult.skipped > 0 ? ` · ${importResult.skipped} skipped` : ''}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-wb-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-accent-brand" />
          <span className="text-xs font-semibold">Publish to git</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Writes the workspace bundle to <code className="font-mono">scriptmanager-workspace.json</code> in a git repo folder and commits it.
        </p>
        <div className="flex gap-1.5">
          <input
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder="D:\\work\\scriptmanager-sync (local folder)"
            className="h-8 flex-1 rounded-md border border-wb-border bg-background px-2.5 font-mono text-xs outline-none focus:border-accent-brand"
          />
          <Button className="h-8 gap-1.5 text-xs" disabled={!repoPath.trim() || publishing} onClick={() => void doPublish()}>
            {publishing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
            Commit
          </Button>
        </div>
      </div>
    </section>
  )
}
