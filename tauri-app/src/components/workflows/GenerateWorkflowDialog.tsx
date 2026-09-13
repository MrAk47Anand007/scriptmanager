import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createWorkflowRuntime } from '@/lib/workflowsRuntimeClient'
import { listAgentProfilesRuntime, type AgentProfileRuntime } from '@/lib/agentRuntimeClient'
import { draftWorkflowRuntime } from '@/lib/workflowsRuntimeClient'
import { getOperationError } from '@/lib/operationError'
import { toast } from '@/components/ui/toast'

/**
 * Natural-language -> workflow draft: the configured agent drafts a
 * definition JSON, it is validated, and a draft (never published) is created
 * for review on the canvas. Only runs on an explicit button click.
 */
export function GenerateWorkflowDialog({ open, onOpenChange, onCreated }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (definition: unknown, issues: Array<{ code: string; message: string }>) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [profiles, setProfiles] = useState<AgentProfileRuntime[]>([])
  const [profileId, setProfileId] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [issues, setIssues] = useState<Array<{ code: string; message: string }> | null>(null)
  const [draft, setDraft] = useState<{ definition: unknown; issues: Array<{ code: string; message: string }> } | null>(null)

  const loadProfiles = useCallback(async () => {
    try {
      const list = await listAgentProfilesRuntime()
      setProfiles(list)
      if (list.length > 0) setProfileId((current) => current || list[0].id)
    } catch {
      setProfiles([])
    }
  }, [])

  useEffect(() => {
    if (open) void loadProfiles()
  }, [open, loadProfiles])

  const generate = async () => {
    setDrafting(true)
    setIssues(null)
    try {
      const result = await draftWorkflowRuntime({ prompt: prompt.trim(), profileId: profileId || null })
      setDraft({ definition: result.definition, issues: result.issues ?? [] })
      setIssues(result.issues ?? [])
    } catch (error) {
      toast.error(getOperationError(error, 'Draft generation failed'))
    } finally {
      setDrafting(false)
    }
  }

  const createDraft = async () => {
    if (!draft) return
    try {
      const definition = draft.definition as { name?: string }
      await createWorkflowRuntime({
        name: definition.name ? `${definition.name} (AI draft)` : 'AI draft',
        definition: draft.definition as Parameters<typeof createWorkflowRuntime>[0]['definition'],
      })
      onCreated(draft.definition, draft.issues)
      onOpenChange(false)
      setDraft(null)
      setPrompt('')
      toast.success('AI draft created — review it on the canvas before publishing')
    } catch (error) {
      toast.error(getOperationError(error, 'Failed to create the draft'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-accent-brand" /> Generate workflow with AI</DialogTitle>
          <DialogDescription>
            Describe the automation. The agent drafts a workflow; you review it on the canvas — drafts are never published or run automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="e.g. Every time we release, call the health API, wait 30 seconds, and if it fails send a desktop notification."
            className="h-24 w-full resize-none rounded-md border border-wb-border bg-background p-2.5 text-xs outline-none focus:border-accent-brand"
          />
          {profiles.length > 0 ? (
            <select
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
              aria-label="Agent profile"
              className="h-8 w-full rounded-md border border-wb-border bg-background px-2 text-xs outline-none focus:border-accent-brand"
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name} ({profile.provider})</option>
              ))}
            </select>
          ) : (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              No agent profiles yet — create one in the Agents panel first.
            </p>
          )}
          {issues && issues.length > 0 && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
              The draft has {issues.length} structural issue{issues.length === 1 ? '' : 's'} — fix them on the canvas:
              <ul className="ml-3 mt-1 list-disc">
                {issues.slice(0, 4).map((issue, index) => <li key={index}>{issue.message}</li>)}
              </ul>
            </div>
          )}
          {issues && issues.length === 0 && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Draft looks structurally valid.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" className="gap-1.5" disabled={drafting || !prompt.trim() || profiles.length === 0} onClick={() => void generate()}>
            {drafting && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {draft ? 'Regenerate' : 'Generate draft'}
          </Button>
          <Button disabled={!draft} onClick={() => void createDraft()}>Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
