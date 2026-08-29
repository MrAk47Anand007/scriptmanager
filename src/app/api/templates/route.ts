import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { BUILT_IN_TEMPLATES } from '@/lib/templateCatalog'

// ---- Helper ----

function toApiShape(t: {
  id: string
  name: string
  description: string
  category: string
  language: string
  interpreter: string | null
  content: string
  parameters: string
  isBuiltIn: boolean
  createdAt: Date
}) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    language: t.language,
    interpreter: t.interpreter,
    content: t.content,
    parameters: (() => { try { return JSON.parse(t.parameters ?? '[]') } catch { return [] } })(),
    is_built_in: t.isBuiltIn,
    created_at: t.createdAt.toISOString(),
  }
}

// ---- Lazy seed ----

async function seedBuiltInsIfEmpty() {
  const count = await prisma.scriptTemplate.count()
  if (count > 0) return
  await prisma.scriptTemplate.createMany({
    data: BUILT_IN_TEMPLATES,
  })
}

// ---- Route handlers ----

export async function GET() {
  await seedBuiltInsIfEmpty()

  const templates = await prisma.scriptTemplate.findMany({
    orderBy: [
      { isBuiltIn: 'desc' },
      { name: 'asc' },
    ],
  })

  return NextResponse.json(templates.map(toApiShape))
}

export async function POST(req: Request) {
  const data = await req.json()
  const { name, description, category, language, interpreter, content, parameters } = data

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (content === undefined || content === null) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  let parametersJson = '[]'
  if (Array.isArray(parameters)) {
    try { parametersJson = JSON.stringify(parameters) } catch { parametersJson = '[]' }
  }

  const existing = await prisma.scriptTemplate.findUnique({ where: { name: name.trim() } })
  if (existing) {
    return NextResponse.json({ error: 'A template with this name already exists' }, { status: 409 })
  }

  const template = await prisma.scriptTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() ?? '',
      category: category?.trim() || 'general',
      language: language ?? 'python',
      interpreter: language === 'custom' ? (interpreter ?? null) : null,
      content,
      parameters: parametersJson,
      isBuiltIn: false,
    },
  })

  return NextResponse.json(toApiShape(template), { status: 201 })
}
