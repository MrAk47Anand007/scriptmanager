'use client'

import { useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveRequest,
  newRequest,
  deleteApiRequest,
  deleteApiCollection,
  createApiCollection,
  updateApiCollection,
  saveApiRequest,
  fetchApiRequests,
  fetchApiCollections,
  clearApiHistory,
  loadHistoryEntry,
  type ApiRequest,
  type ApiCollection,
  type ApiHistoryEntry,
  type ApiRequestDraft
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
  FolderPlus
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    headers: (() => { try { return JSON.parse(request.headers) } catch { return [] } })(),
    queryParams: (() => { try { return JSON.parse(request.query_params) } catch { return [] } })(),
    bodyType: request.body_type as ApiRequestDraft['bodyType'],
    body: request.body,
    authType: request.auth_type as ApiRequestDraft['authType'],
    authConfig: (() => { try { return JSON.parse(request.auth_config) } catch { return {} } })(),
    collectionId: request.collection_id
  }
}

// ─── Request Item ─────────────────────────────────────────────────────────────

interface RequestItemProps {
  request: ApiRequest
  active: boolean
  collections: ApiCollection[]
  indent?: boolean
}

function RequestItem({ request, active, collections, indent }: RequestItemProps) {
  const dispatch = useAppDispatch()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleDelete = async () => {
    await dispatch(deleteApiRequest(request.id))
  }

  const handleDuplicate = async () => {
    const draft = { ...parseDraft(request), id: undefined, name: `${request.name} (Copy)` }
    await dispatch(saveApiRequest(draft))
    dispatch(fetchApiRequests())
  }

  const handleMoveToCollection = async (collectionId: string | null) => {
    await dispatch(saveApiRequest({ ...parseDraft(request), collectionId }))
    dispatch(fetchApiRequests())
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

      {/* More menu — visible on hover or when open */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'h-5 w-5 shrink-0 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-opacity',
              menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            )}
            onClick={(e) => e.stopPropagation()}
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
}

// ─── Collection Item ─────────────────────────────────────────────────────────

interface CollectionItemProps {
  collection: ApiCollection
  requests: ApiRequest[]
  allCollections: ApiCollection[]
  activeRequestId: string | null
}

function CollectionItem({ collection, requests, allCollections, activeRequestId }: CollectionItemProps) {
  const dispatch = useAppDispatch()
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(collection.name)

  const collectionRequests = requests.filter(r => r.collection_id === collection.id)

  const handleRename = async () => {
    if (renameValue.trim() && renameValue.trim() !== collection.name) {
      await dispatch(updateApiCollection({ id: collection.id, name: renameValue.trim() }))
    }
    setRenaming(false)
  }

  const handleDelete = async () => {
    await dispatch(deleteApiCollection(collection.id))
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          {/* Collection header row */}
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
            <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
              {collectionRequests.length}
            </span>
          </div>

          {/* Children */}
          {expanded && (
            <div>
              {collectionRequests.map(r => (
                <RequestItem
                  key={r.id}
                  request={r}
                  active={activeRequestId === r.id}
                  collections={allCollections}
                  indent
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
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export function ApiSidebar() {
  const dispatch = useAppDispatch()
  const { collections, requests, activeRequestId, history } = useAppSelector(s => s.api)
  const [activeSection, setActiveSection] = useState<'requests' | 'history'>('requests')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [showNewCollection, setShowNewCollection] = useState(false)

  const uncollectedRequests = requests.filter(r => !r.collection_id)

  const handleCreateCollection = async () => {
    if (newCollectionName.trim()) {
      await dispatch(createApiCollection({ name: newCollectionName.trim() }))
      dispatch(fetchApiCollections())
      setNewCollectionName('')
      setShowNewCollection(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-slate-950">

      {/* Header */}
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
      </div>

      {/* Section tabs */}
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
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {activeSection === 'requests' && (
          <div className="py-1">
            {/* Collections section label + add button */}
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

            {/* New collection inline input */}
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
                  autoFocus
                  className="h-6 text-xs py-0 px-1.5 flex-1"
                />
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={handleCreateCollection}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Collections */}
            {collections.map(col => (
              <CollectionItem
                key={col.id}
                collection={col}
                requests={requests}
                allCollections={collections}
                activeRequestId={activeRequestId}
              />
            ))}

            {/* Uncollected requests */}
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
                  />
                ))}
              </>
            )}

            {/* Empty state */}
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
                  onClick={() => dispatch(clearApiHistory())}
                  className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                  Clear
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
      </div>
    </div>
  )
}
