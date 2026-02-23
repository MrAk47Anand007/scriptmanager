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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MethodBadge } from './MethodBadge'
import { StatusBadge } from './StatusBadge'
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Clock,
  Trash2,
  Globe,
  RefreshCw
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Collection Item ─────────────────────────────────────────────────────────

interface CollectionItemProps {
  collection: ApiCollection
  requests: ApiRequest[]
  activeRequestId: string | null
}

function CollectionItem({ collection, requests, activeRequestId }: CollectionItemProps) {
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
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/60 group"
            onClick={() => setExpanded(!expanded)}
          >
            <button className="text-slate-400 shrink-0" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}>
              {expanded
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />}
            </button>
            {expanded
              ? <FolderOpen className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              : <Folder className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
            {renaming ? (
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') setRenaming(false)
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
            <span className="text-[10px] text-slate-400 shrink-0">{collectionRequests.length}</span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-44">
          <ContextMenuItem onClick={() => { setRenameValue(collection.name); setRenaming(true) }}>
            Rename
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400">
            Delete Collection
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {expanded && (
        <div className="ml-4">
          {collectionRequests.map(r => (
            <RequestItem key={r.id} request={r} active={activeRequestId === r.id} collections={[]} />
          ))}
          {collectionRequests.length === 0 && (
            <div className="px-3 py-1 text-[11px] text-slate-400 italic">Empty collection</div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Request Item ─────────────────────────────────────────────────────────────

interface RequestItemProps {
  request: ApiRequest
  active: boolean
  collections: ApiCollection[]
}

function RequestItem({ request, active, collections }: RequestItemProps) {
  const dispatch = useAppDispatch()

  const handleClick = () => {
    dispatch(setActiveRequest(request.id))
  }

  const handleDelete = async () => {
    await dispatch(deleteApiRequest(request.id))
  }

  const handleDuplicate = async () => {
    const draft: ApiRequestDraft = {
      name: `${request.name} (Copy)`,
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
    await dispatch(saveApiRequest(draft))
    dispatch(fetchApiRequests())
  }

  const handleMoveToCollection = async (collectionId: string | null) => {
    const draft: ApiRequestDraft = {
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
      collectionId
    }
    await dispatch(saveApiRequest(draft))
    dispatch(fetchApiRequests())
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onClick={handleClick}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer',
            active
              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'
          )}
        >
          <MethodBadge method={request.method} small />
          <span className="text-xs truncate flex-1 min-w-0 text-slate-700 dark:text-slate-300">
            {request.name}
          </span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={handleDuplicate}>Duplicate</ContextMenuItem>
        {collections.length > 0 && (
          <>
            <ContextMenuSeparator />
            {collections.map(c => (
              <ContextMenuItem key={c.id} onClick={() => handleMoveToCollection(c.id)}>
                Move to: {c.name}
              </ContextMenuItem>
            ))}
            {request.collection_id && (
              <ContextMenuItem onClick={() => handleMoveToCollection(null)}>
                Remove from collection
              </ContextMenuItem>
            )}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-red-600 dark:text-red-400">
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ─── History Item ─────────────────────────────────────────────────────────────

function truncateUrl(url: string, maxLen = 40): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname + parsed.search
    if (path.length > maxLen) return path.slice(0, maxLen) + '…'
    return path
  } catch {
    if (url.length > maxLen) return url.slice(0, maxLen) + '…'
    return url
  }
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
    <div className="flex flex-col h-full bg-white dark:bg-slate-950">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <Button
          size="sm"
          onClick={() => dispatch(newRequest())}
          className="w-full h-7 text-xs gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          New Request
        </Button>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
        <button
          onClick={() => setActiveSection('requests')}
          className={cn(
            'flex-1 text-xs py-1.5 font-medium transition-colors',
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
            'flex-1 text-xs py-1.5 font-medium transition-colors flex items-center justify-center gap-1',
            activeSection === 'history'
              ? 'text-slate-900 dark:text-slate-100 border-b-2 border-blue-500'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          )}
        >
          <Clock className="h-3 w-3" />
          History
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeSection === 'requests' && (
          <div className="py-2 px-1">
            {/* Collections */}
            {collections.map(col => (
              <CollectionItem
                key={col.id}
                collection={col}
                requests={requests}
                activeRequestId={activeRequestId}
              />
            ))}

            {/* New collection input */}
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
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCreateCollection}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Add collection button */}
            <button
              onClick={() => setShowNewCollection(true)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 w-full rounded hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              <Plus className="h-3 w-3" />
              Add Collection
            </button>

            {/* Divider if there are both collections and uncollected */}
            {collections.length > 0 && uncollectedRequests.length > 0 && (
              <div className="my-1.5 border-t border-slate-100 dark:border-slate-800" />
            )}

            {/* Uncollected requests */}
            {uncollectedRequests.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  Uncollected
                </div>
                {uncollectedRequests.map(r => (
                  <RequestItem
                    key={r.id}
                    request={r}
                    active={activeRequestId === r.id}
                    collections={collections}
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {collections.length === 0 && uncollectedRequests.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
                <Globe className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400">No requests yet</p>
                <p className="text-[11px] text-slate-300 dark:text-slate-600">Click "New Request" to get started</p>
              </div>
            )}
          </div>
        )}

        {activeSection === 'history' && (
          <div className="py-2">
            {history.length > 0 && (
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Recent</span>
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
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/60 group"
              >
                <MethodBadge method={entry.method} small />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">
                    {truncateUrl(entry.url)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn(
                    'text-[10px] font-mono font-semibold',
                    entry.status >= 200 && entry.status < 300 ? 'text-green-600 dark:text-green-400' :
                    entry.status >= 400 ? 'text-red-500 dark:text-red-400' :
                    'text-slate-500'
                  )}>
                    {entry.status}
                  </span>
                  <RefreshCw className="h-2.5 w-2.5 text-slate-300 group-hover:text-slate-500 dark:group-hover:text-slate-400" />
                </div>
              </div>
            ))}
            {history.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
                <Clock className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-400">No history yet</p>
                <p className="text-[11px] text-slate-300 dark:text-slate-600">Past requests will appear here</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
