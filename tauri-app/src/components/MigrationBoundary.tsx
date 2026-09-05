import React from 'react'
import { getErrorMessage } from '@/lib/unsupportedTauriFeature'

type MigrationBoundaryProps = {
  children: React.ReactNode
  enabled?: boolean
  feature: string
}

type MigrationBoundaryState = {
  error: unknown
}

export function MigrationPending({ feature }: { feature: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-white p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold">{feature}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          This surface is migration-pending in the Tauri build.
        </p>
      </div>
    </div>
  )
}

export class MigrationBoundary extends React.Component<MigrationBoundaryProps, MigrationBoundaryState> {
  state: MigrationBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): MigrationBoundaryState {
    return { error }
  }

  componentDidUpdate(previousProps: MigrationBoundaryProps) {
    if (previousProps.feature !== this.props.feature && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.props.enabled === false) {
      return <MigrationPending feature={this.props.feature} />
    }

    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-white p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <div className="max-w-lg rounded-lg border border-red-200 bg-white p-5 shadow-sm dark:border-red-900/60 dark:bg-slate-900">
            <h2 className="text-base font-semibold">{this.props.feature}</h2>
            <p className="mt-2 text-sm leading-6 text-red-700 dark:text-red-300">
              {getErrorMessage(this.state.error)}
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
