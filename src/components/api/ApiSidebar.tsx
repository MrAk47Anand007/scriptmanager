'use client'

import { memo, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveRequest,
  newRequest,
  deleteApiRequest,
  deleteApiCollection,
  createApiCollection,
  updateApiCollection,
  saveApiRequest,
  clearApiHistory,
  loadHistoryEntry,
  type ApiRequest,
  type ApiCollection,
  type ApiHistoryEntry,
  type ApiRequestDraft,
  type KeyValueRow,
  type ApiEnvironment,
  saveApiEnvironment,
  deleteApiEnvironment,
  setActiveEnvironment,
  saveApiGlobals,
  runApiCollection,
  setActiveCollectionRun,
  type ApiCollectionRun,
} from '@/features/api/apiSlice'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MethodBadge } from './MethodBadge'
import { VariableEditorDialog } from './VariableEditorDialog'
import { CollectionRunDialog } from './CollectionRunDialog'
import { parseVariableRows } from '@/lib/apiRequestMaterialization'
import {
  buildNativeApiExport,
  buildPostmanCollectionExport,
  buildPostmanEnvironmentExport,
  importPostmanData,
} from '@/lib/postmanInterop'
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Clock,
  Trash2,
  Globe,
  MoreHorizontal,
  FolderPlus,
  FlaskConical,
  Settings2,
  Play,
  Download,
  Upload,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function blankRow(): KeyValueRow {
  return { id: crypto.randomUUID(), key: '', value: '', enabled: true }
}

function ensureRows(rows: KeyValueRow[]): KeyValueRow[] {
  return rows.length > 0 ? rows : [blankRow()]
}

function truncateUrl(url: string, maxLen = 38): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname + parsed.search
    if (path.length > maxLen) return path.slice(0, maxLen) + '…'
    return path || parsed.host
  } catch {
    if (url.length > maxLen) return url.slice(0, maxLen) + '…'
    return url
  }
}

function parseDraft(request: ApiRequest): ApiRequestDraft {
  return {
    id: request.id,
    name: request.name,
    method: request.method,
    url: request.url,
    headers: ensureRows((() => { try { return JSON.parse(request.headers) } catch { return [] } })()),
    queryParams: ensureRows((() => { try { return JSON.parse(request.query_params) } catch { return [] } })()),
    variables: ensureRows(parseVariableRows(request.variables).map((row) => ({
      id: row.id ?? crypto.randomUUID(),
      key: row.key,
      value: row.value,
      enabled: row.enabled,
    }))),
    requestOptions: (() => { try { return JSON.parse(request.request_options) } catch { return { useCookieJar: false } } })(),
    preRequestScript: request.pre_request_script ?? '',
    testScript: request.test_script ?? '',
    responseMappings: (() => { try { return JSON.parse(request.response_mappings) } catch { return [] } })(),
    bodyType: request.body_type as ApiRequestDraft['bodyType'],
    body: request.body,
    authType: request.auth_type as ApiRequestDraft['authType'],
    authConfig: (() => { try { return JSON.parse(request.auth_config) } catch { return {} } })(),
    collectionId: request.collection_id
  }
}

interface RequestItemProps {
  request: ApiRequest
  active: boolean
  collections: ApiCollection[]
  indent?: boolean
  onDeleteRequest?: (request: ApiRequest) => Promise<void>
  isDeleting?: boolean
}

const RequestItem = memo(function RequestItem({ request, active, collections, indent, onDeleteRequest, isDeleting = false }: RequestItemProps) {
  const dispatch = useAppDispatch()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleDelete = async () => {
    if (onDeleteRequest) {
      await onDeleteRequest(request)
      return
    }
    await dispatch(deleteApiRequest(request.id))
  }

  const handleDuplicate = async () => {
    const draft = { ...parseDraft(request), id: undefined, name: `${request.name} (Copy)` }
    await dispatch(saveApiRequest(draft))
  }

  const handleMoveToCollection = async (collectionId: string | null) => {
    await dispatch(saveApiRequest({ ...parseDraft(request), collectionId }))
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 rounded cursor-pointer select-none',
        indent ? 'pl-6 pr-1 py-1' : 'px-2 py-1',
        active
          ? 'bg-blue-50 dark:bg-blue-950/40 border-l-2 border-blue-500 pl-5'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 border-l-2 border-transparent'
      )}
      onClick={() => dispatch(setActiveRequest(request.id))}
    >
      <MethodBadge method={request.method} />
      <span className={cn(
        'text-xs truncate flex-1 min-w-0',
        active ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-700 dark:text-slate-300'
      )}>
        {request.name}
      </span>
      {isDeleting && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />}

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'h-5 w-5 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-opacity',
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
            onClick={(e) => e.stopPropagation()}
            disabled={isDeleting}
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem className="text-xs" onClick={handleDuplicate}>
            Duplicate
          </DropdownMenuItem>
          {collections.length > 0 && (
            <>
              <DropdownMenuSeparator />
              {collections.map(c => (
                <DropdownMenuItem
                  key={c.id}
                  className="text-xs"
                  onClick={() => handleMoveToCollection(c.id)}
                >
                  Move to: {c.name}
                </DropdownMenuItem>
              ))}
              {request.collection_id && (
                <DropdownMenuItem className="text-xs" onClick={() => handleMoveToCollection(null)}>
                  Remove from collection
                </DropdownMenuItem>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs text-red-600 dark:text-red-400 focus:text-red-600"
            onClick={handleDelete}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})

interface CollectionItemProps {
  collection: ApiCollection
  requests: ApiRequest[]
  allCollections: ApiCollection[]
  activeRequestId: string | null
  onEditVariables: (collection: ApiCollection) => void
  onRunCollection: (collection: ApiCollection) => void
  onAddRequest: (collection: ApiCollection) => void
  onExportCollection: (collection: ApiCollection) => void
  onDeleteRequest: (request: ApiRequest) => Promise<void>
  onDeleteCollection: (collection: ApiCollection) => Promise<void>
  isDeleting?: boolean
}

const CollectionItem = memo(function CollectionItem({
  collection,
  requests,
  allCollections,
  activeRequestId,
  onEditVariables,
  onRunCollection,
  onAddRequest,
  onExportCollection,
  onDeleteRequest,
  onDeleteCollection,
  isDeleting = false,
}: CollectionItemProps) {
  const dispatch = useAppDispatch()
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(collection.name)

  const collectionRequests = requests.filter(r => r.collection_id === collection.id)
  const variableCount = parseVariableRows(collection.variables).filter((row) => row.enabled && row.key).length

  const handleRename = async () => {
    if (renameValue.trim() && renameValue.trim() !== collection.name) {
      await dispatch(updateApiCollection({
        id: collection.id,
        name: renameValue.trim(),
        description: collection.description,
        variables: ensureRows(parseVariableRows(collection.variables).map((row) => ({
          id: row.id ?? crypto.randomUUID(),
          key: row.key,
          value: row.value,
          enabled: row.enabled,
        }))),
      }))
    }
    setRenaming(false)
  }

  const handleDelete = async () => {
    await onDeleteCollection(collection)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          <div
            className="group flex items-center gap-1 px-2 py-1 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 select-none"
            onClick={() => setExpanded(v => !v)}
          >
            <span className="text-slate-400 shrink-0">
              {expanded
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />}
            </span>
            {expanded
              ? <FolderOpen className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              : <Folder className="h-3.5 w-3.5 text-slate-400 shrink-0" />}

            {renaming ? (
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') { setRenaming(false); setRenameValue(collection.name) }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                className="h-5 text-xs py-0 px-1 flex-1 min-w-0"
              />
            ) : (
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate flex-1 min-w-0">
                {collection.name}
              </span>
            )}
            {isDeleting && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />}
            {variableCount > 0 && (
              <span className="text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {variableCount} vars
              </span>
            )}
            <button
              className="h-5 w-5 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 opacity-0 group-hover:opacity-100"
              title="Add request to collection"
              onClick={(e) => {
                e.stopPropagation()
                onAddRequest(collection)
              }}
              disabled={isDeleting}
            >
              <Plus className="h-3 w-3" />
            </button>
            <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
              {collectionRequests.length}
            </span>
          </div>

          {expanded && (
            <div>
              {collectionRequests.map(r => (
                <RequestItem
                  key={r.id}
                  request={r}
                  active={activeRequestId === r.id}
                  collections={allCollections}
                  indent
                  onDeleteRequest={onDeleteRequest}
                  isDeleting={false}
                />
              ))}
              {collectionRequests.length === 0 && (
                <p className="pl-8 py-1 text-[11px] text-slate-400 italic">Empty</p>
              )}
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem
          className="text-xs"
          onClick={() => { setRenameValue(collection.name); setRenaming(true) }}
        >
          Rename
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => onEditVariables(collection)}>
          Edit Variables
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => onRunCollection(collection)}>
          Run Collection
        </ContextMenuItem>
        <ContextMenuItem className="text-xs" onClick={() => onExportCollection(collection)}>
          Export as Postman
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-xs text-red-600 dark:text-red-400 focus:text-red-600"
          onClick={handleDelete}
        >
          Delete Collection
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

interface EnvironmentItemProps {
  environment: ApiEnvironment
  active: boolean
  onEdit: (environment: ApiEnvironment) => void
  onDelete: (environment: ApiEnvironment) => Promise<void>
  isDeleting?: boolean
}

const EnvironmentItem = memo(function EnvironmentItem({ environment, active, onEdit, onDelete, isDeleting = false }: EnvironmentItemProps) {
  const dispatch = useAppDispatch()
  const variableCount = parseVariableRows(environment.variables).filter((row) => row.enabled && row.key).length

  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-2 py-1 rounded cursor-pointer',
        active
          ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
      )}
      onClick={() => dispatch(setActiveEnvironment(environment.id))}
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span className="text-xs truncate flex-1">{environment.name}</span>
      {isDeleting && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />}
      {variableCount > 0 && (
        <span className="text-[10px] text-slate-400 shrink-0">{variableCount}</span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="opacity-0 group-hover:opacity-100 h-5 w-5 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            onClick={(e) => e.stopPropagation()}
            disabled={isDeleting}
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem className="text-xs" onClick={() => onEdit(environment)}>
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs text-red-600 dark:text-red-400 focus:text-red-600"
            onClick={() => onDelete(environment)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})

export function ApiSidebar() {
  const dispatch = useAppDispatch()
  const {
    collections,
    requests,
    activeRequestId,
    history,
    collectionRuns,
    activeCollectionRun,
    environments,
    activeEnvironmentId,
    globalVariables,
    isRunningCollection,
  } = useAppSelector(s => s.api)
  const [activeSection, setActiveSection] = useState<'requests' | 'history' | 'runs'>('requests')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [showNewCollection, setShowNewCollection] = useState(false)
  const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false)
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null)
  const [environmentName, setEnvironmentName] = useState('')
  const [environmentVariables, setEnvironmentVariables] = useState<KeyValueRow[]>([blankRow()])
  const [globalsDialogOpen, setGlobalsDialogOpen] = useState(false)
  const [globalsDraft, setGlobalsDraft] = useState<KeyValueRow[]>([blankRow()])
  const [collectionVariablesOpen, setCollectionVariablesOpen] = useState(false)
  const [collectionVariableTarget, setCollectionVariableTarget] = useState<ApiCollection | null>(null)
  const [collectionVariableRows, setCollectionVariableRows] = useState<KeyValueRow[]>([blankRow()])
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [isCreatingCollection, setIsCreatingCollection] = useState(false)
  const [isSavingEnvironment, setIsSavingEnvironment] = useState(false)
  const [isSavingGlobals, setIsSavingGlobals] = useState(false)
  const [isSavingCollectionVariables, setIsSavingCollectionVariables] = useState(false)
  const [isClearingHistory, setIsClearingHistory] = useState(false)
  const [deletingCollectionId, setDeletingCollectionId] = useState<string | null>(null)
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null)
  const [deletingEnvironmentId, setDeletingEnvironmentId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const uncollectedRequests = requests.filter(r => !r.collection_id)
  const activeEnvironment = useMemo(
    () => environments.find((environment) => environment.id === activeEnvironmentId) ?? null,
    [environments, activeEnvironmentId]
  )

  const openEnvironmentDialog = (environment?: ApiEnvironment) => {
    setEditingEnvironmentId(environment?.id ?? null)
    setEnvironmentName(environment?.name ?? '')
    setEnvironmentVariables(ensureRows(parseVariableRows(environment?.variables).map((row) => ({
      id: row.id ?? crypto.randomUUID(),
      key: row.key,
      value: row.value,
      enabled: row.enabled,
    }))))
    setEnvironmentDialogOpen(true)
  }

  const openGlobalsDialog = () => {
    setGlobalsDraft(ensureRows(globalVariables))
    setGlobalsDialogOpen(true)
  }

  const openCollectionVariablesDialog = (collection: ApiCollection) => {
    setCollectionVariableTarget(collection)
    setCollectionVariableRows(ensureRows(parseVariableRows(collection.variables).map((row) => ({
      id: row.id ?? crypto.randomUUID(),
      key: row.key,
      value: row.value,
      enabled: row.enabled,
    }))))
    setCollectionVariablesOpen(true)
  }

  const handleCreateCollection = async () => {
    if (newCollectionName.trim()) {
      setIsCreatingCollection(true)
      try {
        await dispatch(createApiCollection({ name: newCollectionName.trim() }))
        setNewCollectionName('')
        setShowNewCollection(false)
      } finally {
        setIsCreatingCollection(false)
      }
    }
  }

  const handleSaveEnvironment = async () => {
    if (!environmentName.trim()) return
    setIsSavingEnvironment(true)
    try {
      await dispatch(saveApiEnvironment({
        id: editingEnvironmentId ?? undefined,
        name: environmentName.trim(),
        variables: environmentVariables,
      }))
      setEnvironmentDialogOpen(false)
    } finally {
      setIsSavingEnvironment(false)
    }
  }

  const handleSaveGlobals = async () => {
    setIsSavingGlobals(true)
    try {
      await dispatch(saveApiGlobals(globalsDraft))
      setGlobalsDialogOpen(false)
    } finally {
      setIsSavingGlobals(false)
    }
  }

  const handleSaveCollectionVariables = async () => {
    if (!collectionVariableTarget) return
    setIsSavingCollectionVariables(true)
    try {
      await dispatch(updateApiCollection({
        id: collectionVariableTarget.id,
        name: collectionVariableTarget.name,
        description: collectionVariableTarget.description,
        variables: collectionVariableRows,
      }))
      setCollectionVariablesOpen(false)
    } finally {
      setIsSavingCollectionVariables(false)
    }
  }

  const handleRunCollection = async (collection: ApiCollection) => {
    const result = await dispatch(runApiCollection({
      collectionId: collection.id,
      environmentId: activeEnvironmentId,
    }))
    if (runApiCollection.fulfilled.match(result)) {
      dispatch(setActiveCollectionRun(result.payload))
      setRunDialogOpen(true)
    }
  }

  const handleImportPostman = async (file: File) => {
    setIsImporting(true)
    try {
      const raw = await file.text()
      const imported = importPostmanData(raw)

      for (const environment of imported.environments) {
        await dispatch(saveApiEnvironment({ name: environment.name, variables: environment.variables }))
      }

      for (const collection of imported.collections) {
        const createdCollection = await dispatch(createApiCollection({ name: collection.name }))
        if (!createApiCollection.fulfilled.match(createdCollection)) continue

        for (const request of collection.requests) {
          await dispatch(saveApiRequest({
            name: request.name ?? 'Imported Request',
            method: request.method ?? 'GET',
            url: request.url ?? '',
            headers: request.headers ?? [blankRow()],
            queryParams: request.queryParams ?? [blankRow()],
            variables: request.variables ?? [blankRow()],
            requestOptions: request.requestOptions ?? { useCookieJar: false },
            preRequestScript: request.preRequestScript ?? '',
            testScript: request.testScript ?? '',
            responseMappings: request.responseMappings ?? [],
            bodyType: request.bodyType ?? 'none',
            body: request.body ?? '',
            authType: request.authType ?? 'none',
            authConfig: request.authConfig ?? {},
            collectionId: createdCollection.payload.id,
          }))
        }
      }
    } finally {
      setIsImporting(false)
    }
  }

  const handleExportWorkspace = () => {
    setIsExporting(true)
    try {
      const payload = buildNativeApiExport({
        collections,
        requests,
        environments,
        globalVariables,
      })
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `scriptmanager-api-export-${Date.now()}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } finally {
      window.setTimeout(() => setIsExporting(false), 250)
    }
  }

  const downloadJson = (filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPostmanCollection = () => {
    setIsExporting(true)
    downloadJson(
      `scriptmanager-postman-collection-${Date.now()}.json`,
      buildPostmanCollectionExport({ collections, requests })
    )
    window.setTimeout(() => setIsExporting(false), 250)
  }

  const handleExportPostmanEnvironment = () => {
    setIsExporting(true)
    downloadJson(
      `scriptmanager-postman-environment-${activeEnvironment?.name?.replace(/\s+/g, '-').toLowerCase() ?? 'default'}.json`,
      buildPostmanEnvironmentExport({ environment: activeEnvironment })
    )
    window.setTimeout(() => setIsExporting(false), 250)
  }

  const handleExportSingleCollection = (collection: ApiCollection) => {
    setIsExporting(true)
    downloadJson(
      `scriptmanager-postman-${collection.name.replace(/\s+/g, '-').toLowerCase() || 'collection'}.json`,
      buildPostmanCollectionExport({
        collections: [collection],
        requests: requests.filter((request) => request.collection_id === collection.id),
      })
    )
    window.setTimeout(() => setIsExporting(false), 250)
  }

  const handleAddRequestToCollection = (collection: ApiCollection) => {
    dispatch(newRequest({
      name: `${collection.name} Request`,
      collectionId: collection.id,
    }))
  }

  const handleDeleteCollection = async (collection: ApiCollection) => {
    setDeletingCollectionId(collection.id)
    try {
      await dispatch(deleteApiCollection(collection.id))
    } finally {
      setDeletingCollectionId((current) => current === collection.id ? null : current)
    }
  }

  const handleDeleteEnvironment = async (environment: ApiEnvironment) => {
    setDeletingEnvironmentId(environment.id)
    try {
      await dispatch(deleteApiEnvironment(environment.id))
    } finally {
      setDeletingEnvironmentId((current) => current === environment.id ? null : current)
    }
  }

  const handleDeleteRequest = async (request: ApiRequest) => {
    setDeletingRequestId(request.id)
    try {
      await dispatch(deleteApiRequest(request.id))
    } finally {
      setDeletingRequestId((current) => current === request.id ? null : current)
    }
  }

  const activeStatusText = useMemo(() => {
    if (isImporting) return 'Importing Postman workspace...'
    if (isExporting) return 'Preparing export...'
    if (isCreatingCollection) return 'Creating collection...'
    if (isSavingEnvironment) return 'Saving environment...'
    if (isSavingGlobals) return 'Saving global variables...'
    if (isSavingCollectionVariables) return 'Saving collection variables...'
    if (isRunningCollection) return 'Running collection...'
    if (isClearingHistory) return 'Clearing request history...'
    if (deletingCollectionId) return 'Deleting collection...'
    if (deletingRequestId) return 'Deleting request...'
    if (deletingEnvironmentId) return 'Deleting environment...'
    return null
  }, [
    isImporting,
    isExporting,
    isCreatingCollection,
    isSavingEnvironment,
    isSavingGlobals,
    isSavingCollectionVariables,
    isRunningCollection,
    isClearingHistory,
    deletingCollectionId,
    deletingRequestId,
    deletingEnvironmentId,
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-950">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 flex-1 truncate">
          API Client
        </span>
        <Button
          size="sm"
          onClick={() => dispatch(newRequest())}
          className="h-6 text-[11px] px-2 gap-1 shrink-0"
        >
          <Plus className="h-3 w-3" />
          New
        </Button>
        <button
          className="h-6 w-6 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
          title="Import Postman JSON"
          disabled={isImporting}
          onClick={() => importInputRef.current?.click()}
        >
          {isImporting
            ? <Loader2 className="h-3.5 w-3.5 mx-auto animate-spin" />
            : <Download className="h-3.5 w-3.5 mx-auto" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-6 w-6 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
              title="Export"
              disabled={isExporting}
            >
              {isExporting
                ? <Loader2 className="h-3.5 w-3.5 mx-auto animate-spin" />
                : <Upload className="h-3.5 w-3.5 mx-auto" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem className="text-xs" onClick={handleExportWorkspace}>
              Export Native Workspace
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={handleExportPostmanCollection}>
              Export Postman Collection
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={handleExportPostmanEnvironment}>
              Export Postman Environment
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            await handleImportPostman(file)
            event.target.value = ''
          }}
        />
      </div>

      {activeStatusText && (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 shrink-0">
          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
          <span>{activeStatusText}</span>
        </div>
      )}

      <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
        <button
          onClick={() => setActiveSection('requests')}
          className={cn(
            'flex-1 text-[11px] py-1.5 font-medium transition-colors',
            activeSection === 'requests'
              ? 'text-slate-900 dark:text-slate-100 border-b-2 border-blue-500'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          Collections
        </button>
        <button
          onClick={() => setActiveSection('history')}
          className={cn(
            'flex-1 text-[11px] py-1.5 font-medium transition-colors flex items-center justify-center gap-1',
            activeSection === 'history'
              ? 'text-slate-900 dark:text-slate-100 border-b-2 border-blue-500'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          <Clock className="h-3 w-3" />
          History
        </button>
        <button
          onClick={() => setActiveSection('runs')}
          className={cn(
            'flex-1 text-[11px] py-1.5 font-medium transition-colors flex items-center justify-center gap-1',
            activeSection === 'runs'
              ? 'text-slate-900 dark:text-slate-100 border-b-2 border-blue-500'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          <Play className="h-3 w-3" />
          Runs
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {activeSection === 'requests' && (
          <div className="py-1">
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Collections
              </span>
              <button
                onClick={() => setShowNewCollection(true)}
                className="h-4 w-4 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="New collection"
              >
                <FolderPlus className="h-3 w-3" />
              </button>
            </div>

            {showNewCollection && (
              <div className="flex items-center gap-1 px-2 py-1">
                <Input
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateCollection()
                    if (e.key === 'Escape') { setShowNewCollection(false); setNewCollectionName('') }
                  }}
                  placeholder="Collection name"
                  disabled={isCreatingCollection}
                  autoFocus
                  className="h-6 text-xs py-0 px-1.5 flex-1"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  onClick={handleCreateCollection}
                  disabled={isCreatingCollection}
                >
                  {isCreatingCollection
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Plus className="h-3 w-3" />}
                </Button>
              </div>
            )}

            {collections.map(col => (
              <CollectionItem
                key={col.id}
                collection={col}
                requests={requests}
                allCollections={collections}
                activeRequestId={activeRequestId}
                onEditVariables={openCollectionVariablesDialog}
                onRunCollection={handleRunCollection}
                onAddRequest={handleAddRequestToCollection}
                onExportCollection={handleExportSingleCollection}
                onDeleteRequest={handleDeleteRequest}
                onDeleteCollection={handleDeleteCollection}
                isDeleting={deletingCollectionId === col.id}
              />
            ))}

            {uncollectedRequests.length > 0 && (
              <>
                {collections.length > 0 && (
                  <div className="mx-3 my-1.5 border-t border-slate-100 dark:border-slate-800" />
                )}
                <div className="px-3 pt-1 pb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Uncollected
                  </span>
                </div>
                {uncollectedRequests.map(r => (
                  <RequestItem
                    key={r.id}
                    request={r}
                    active={activeRequestId === r.id}
                    collections={collections}
                    onDeleteRequest={handleDeleteRequest}
                    isDeleting={deletingRequestId === r.id}
                  />
                ))}
              </>
            )}

            <div className="mx-3 my-2 border-t border-slate-100 dark:border-slate-800" />

            <div className="flex items-center justify-between px-3 pt-1 pb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Environments
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={openGlobalsDialog}
                  className="h-4 w-4 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Global variables"
                >
                  <Settings2 className="h-3 w-3" />
                </button>
                <button
                  onClick={() => openEnvironmentDialog()}
                  className="h-4 w-4 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="New environment"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>

            <button
              className={cn(
                'mx-2 mb-1 flex w-[calc(100%-1rem)] items-center gap-2 rounded px-2 py-1 text-left text-xs',
                activeEnvironmentId === null
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
              )}
              onClick={() => dispatch(setActiveEnvironment(null))}
            >
              <Globe className="h-3.5 w-3.5" />
              No environment
            </button>

            {environments.map((environment) => (
              <EnvironmentItem
                key={environment.id}
                environment={environment}
                active={environment.id === activeEnvironmentId}
                onEdit={openEnvironmentDialog}
                onDelete={handleDeleteEnvironment}
                isDeleting={deletingEnvironmentId === environment.id}
              />
            ))}

            <div className="px-3 pt-2">
              <button
                className="w-full rounded border border-dashed border-slate-200 dark:border-slate-800 px-3 py-2 text-left hover:border-slate-300 dark:hover:border-slate-700"
                onClick={openGlobalsDialog}
              >
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Global Variables</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {globalVariables.filter((row) => row.enabled && row.key).length} shared values available
                </p>
              </button>
            </div>

            {collections.length === 0 && uncollectedRequests.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-3">
                <Globe className="h-9 w-9 text-slate-200 dark:text-slate-700" />
                <div>
                  <p className="text-xs font-medium text-slate-500">No requests yet</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5">
                    Create your first request
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => dispatch(newRequest())}
                  className="h-6 text-xs px-3 gap-1"
                >
                  <Plus className="h-3 w-3" />
                  New Request
                </Button>
              </div>
            )}
          </div>
        )}

        {activeSection === 'history' && (
          <div className="py-1">
            {history.length > 0 && (
              <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Recent ({history.length})
                </span>
                <button
                  onClick={async () => {
                    setIsClearingHistory(true)
                    try {
                      await dispatch(clearApiHistory())
                    } finally {
                      setIsClearingHistory(false)
                    }
                  }}
                  disabled={isClearingHistory}
                  className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5 disabled:opacity-60"
                >
                  {isClearingHistory ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Trash2 className="h-2.5 w-2.5" />}
                  {isClearingHistory ? 'Clearing' : 'Clear'}
                </button>
              </div>
            )}

            {history.slice(0, 50).map((entry: ApiHistoryEntry) => (
              <div
                key={entry.id}
                onClick={() => dispatch(loadHistoryEntry(entry))}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                <MethodBadge method={entry.method} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                    {truncateUrl(entry.url)}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <span className={cn(
                      'font-semibold',
                      entry.status >= 200 && entry.status < 300 ? 'text-green-600 dark:text-green-400' :
                      entry.status >= 400 ? 'text-red-500 dark:text-red-400' :
                      'text-slate-400'
                    )}>
                      {entry.status}
                    </span>
                    <span>·</span>
                    <span>{entry.duration}ms</span>
                  </div>
                </div>
              </div>
            ))}

            {history.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
                <Clock className="h-9 w-9 text-slate-200 dark:text-slate-700" />
                <div>
                  <p className="text-xs font-medium text-slate-500">No history yet</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5">
                    Past requests will appear here
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'runs' && (
          <div className="py-1">
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Collection Runs ({collectionRuns.length})
                </span>
                {isRunningCollection && (
                  <span className="text-[10px] text-blue-600 dark:text-blue-300 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Running…
                  </span>
                )}
              </div>

            {collectionRuns.map((run: ApiCollectionRun) => (
              <div
                key={run.id}
                onClick={() => {
                  dispatch(setActiveCollectionRun(run))
                  setRunDialogOpen(true)
                }}
                className="mx-2 mb-1 rounded border border-slate-100 dark:border-slate-800 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{run.collection_name}</span>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
                    run.failed_requests > 0
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  )}>
                    {run.failed_requests > 0 ? 'Issues' : 'Passed'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                  <span>{run.passed_requests}/{run.total_requests} passed</span>
                  {run.environment_name && <><span>·</span><span>{run.environment_name}</span></>}
                  {run.duration_ms !== null && <><span>·</span><span>{run.duration_ms}ms</span></>}
                </div>
              </div>
            ))}

            {collectionRuns.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
                <Play className="h-9 w-9 text-slate-200 dark:text-slate-700" />
                <div>
                  <p className="text-xs font-medium text-slate-500">No collection runs yet</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5">
                    Run a collection to see aggregate results here
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <VariableEditorDialog
        open={environmentDialogOpen}
        onOpenChange={setEnvironmentDialogOpen}
        title={editingEnvironmentId ? 'Edit Environment' : 'New Environment'}
        description="Environment variables are local to this machine and can be referenced with {{name}}."
        name={environmentName}
        onNameChange={setEnvironmentName}
        rows={environmentVariables}
        onRowsChange={setEnvironmentVariables}
        onSave={handleSaveEnvironment}
        isSaving={isSavingEnvironment}
        savingLabel="Saving..."
      />

      <VariableEditorDialog
        open={globalsDialogOpen}
        onOpenChange={setGlobalsDialogOpen}
        title="Global Variables"
        description="Globals are available to all requests unless overridden by environment, collection, or request variables."
        rows={globalsDraft}
        onRowsChange={setGlobalsDraft}
        onSave={handleSaveGlobals}
        isSaving={isSavingGlobals}
        savingLabel="Saving..."
      />

      <VariableEditorDialog
        open={collectionVariablesOpen}
        onOpenChange={setCollectionVariablesOpen}
        title={collectionVariableTarget ? `${collectionVariableTarget.name} Variables` : 'Collection Variables'}
        description="Collection variables apply to every request inside this collection unless a request overrides them."
        rows={collectionVariableRows}
        onRowsChange={setCollectionVariableRows}
        onSave={handleSaveCollectionVariables}
        isSaving={isSavingCollectionVariables}
        savingLabel="Saving..."
      />

      <CollectionRunDialog
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        run={activeCollectionRun}
      />
    </div>
  )
}
