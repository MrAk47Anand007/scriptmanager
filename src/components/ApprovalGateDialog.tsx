'use client'

import { useState } from 'react'
import { useAppDispatch } from '@/store/hooks'
import { approveExecution, rejectExecution } from '@/features/ops/opsSlice'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
    open: boolean
    onClose: () => void
    remoteExecId: string
    scriptName: string
    profileName: string
    serverHost: string
    environment: 'uat' | 'production'
    onApproved: () => void
}

export function ApprovalGateDialog({
    open, onClose, remoteExecId, scriptName, profileName, serverHost, environment, onApproved,
}: Props) {
    const dispatch = useAppDispatch()
    const [approvalNote, setApprovalNote] = useState('')
    const [isApproving, setIsApproving] = useState(false)
    const [isRejecting, setIsRejecting] = useState(false)

    const isProd = environment === 'production'
    const envLabel = isProd ? 'PRODUCTION' : 'UAT'

    const handleApprove = async () => {
        if (!approvalNote.trim()) return
        setIsApproving(true)
        try {
            await dispatch(approveExecution({ id: remoteExecId, note: approvalNote.trim() }))
            onApproved()
            onClose()
        } finally {
            setIsApproving(false)
        }
    }

    const handleReject = async () => {
        setIsRejecting(true)
        try {
            await dispatch(rejectExecution(remoteExecId))
            onClose()
        } finally {
            setIsRejecting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isProd
                            ? <ShieldAlert className="h-5 w-5 text-red-500" />
                            : <AlertTriangle className="h-5 w-5 text-amber-500" />
                        }
                        Approval Required
                    </DialogTitle>
                </DialogHeader>

                {/* Environment banner */}
                <div className={cn(
                    "rounded-md px-3 py-2.5 text-sm font-medium",
                    isProd
                        ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
                        : "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                )}>
                    <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                            "text-[10px] font-bold rounded px-1.5 py-0.5",
                            isProd ? "bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100" : "bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100"
                        )}>
                            {envLabel}
                        </span>
                        <span>Sensitive environment — approval required</span>
                    </div>
                    <div className="text-xs opacity-80 space-y-0.5">
                        <div>Script: <span className="font-mono font-semibold">{scriptName}</span></div>
                        <div>Server: <span className="font-mono font-semibold">{profileName}</span> ({serverHost})</div>
                    </div>
                </div>

                <div className="space-y-3 py-1">
                    <div>
                        <Label htmlFor="approval-note" className="text-xs">
                            Approval note <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="approval-note"
                            autoFocus
                            placeholder="e.g. Approved for hotfix deploy"
                            value={approvalNote}
                            onChange={e => setApprovalNote(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && approvalNote.trim() && handleApprove()}
                            className="mt-1 h-8 text-sm"
                        />
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        This approval will be recorded in the audit trail with a timestamp.
                    </p>
                </div>

                <DialogFooter className="gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-slate-600"
                        onClick={handleReject}
                        disabled={isApproving || isRejecting}
                    >
                        {isRejecting ? 'Rejecting…' : 'Cancel / Reject'}
                    </Button>
                    <Button
                        size="sm"
                        className={cn(
                            "text-xs",
                            isProd ? "bg-red-600 hover:bg-red-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"
                        )}
                        onClick={handleApprove}
                        disabled={!approvalNote.trim() || isApproving || isRejecting}
                    >
                        {isApproving ? 'Approving…' : `Approve & Run on ${envLabel}`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
