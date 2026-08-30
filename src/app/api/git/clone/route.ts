import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { cloneGitRemote, extractRepoName, sanitizeGitUrl } from '@/lib/git/remote'
import { DEFAULT_WORKSPACE_POLICY } from '@/lib/git/types'

export async function POST(req: Request) {
  const workspaceId = req.headers.get('x-scriptmanager-workspace-id') ?? 'default'

  try {
    const { url, targetPath, token, projectName, branch } = await req.json()

    if (!url?.trim()) {
      return NextResponse.json({ error: 'Repository URL is required' }, { status: 400 })
    }
    if (!targetPath?.trim()) {
      return NextResponse.json({ error: 'Destination directory is required' }, { status: 400 })
    }

    const cleanUrl = url.trim()
    const cleanPath = targetPath.trim()
    const finalName = projectName?.trim() || extractRepoName(cleanUrl)

    // Execute clone
    const { targetPath: clonedPath, defaultBranch } = await cloneGitRemote({
      url: cleanUrl,
      targetPath: cleanPath,
      token: token?.trim(),
      branch: branch?.trim(),
    })

    // Store sanitized remoteUrl without any credentials
    const safeRemoteUrl = sanitizeGitUrl(cleanUrl)

    const project = await prisma.project.create({
      data: {
        workspaceId,
        name: finalName,
        description: `Imported from ${safeRemoteUrl}`,
        environment: 'development',
        color: '#3b82f6',
        repositoryRoot: clonedPath,
        defaultBranch,
        remoteUrl: safeRemoteUrl,
        workspacePolicy: JSON.stringify(DEFAULT_WORKSPACE_POLICY),
      },
      include: { collections: { select: { id: true } } },
    })

    return NextResponse.json(
      {
        id: project.id,
        name: project.name,
        description: project.description,
        environment: project.environment,
        color: project.color,
        repository_root: project.repositoryRoot,
        default_branch: project.defaultBranch,
        remote_url: project.remoteUrl,
        workspace_policy: JSON.parse(project.workspacePolicy || '{}'),
        collection_ids: project.collections.map((c: { id: string }) => c.id),
        created_at: project.createdAt.toISOString(),
        updated_at: project.updatedAt.toISOString(),
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to clone repository' },
      { status: 400 }
    )
  }
}
