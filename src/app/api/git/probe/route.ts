import { NextResponse } from 'next/server'
import { probeGitRemote } from '@/lib/git/remote'

export async function POST(req: Request) {
  try {
    const { url, token } = await req.json()

    if (!url?.trim()) {
      return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 })
    }

    const result = await probeGitRemote(url.trim(), token?.trim())
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { isPrivate: false, status: 'error', message: error instanceof Error ? error.message : 'Probe failed' },
      { status: 500 }
    )
  }
}
