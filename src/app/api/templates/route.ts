import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ---- Built-in templates ----

const BUILT_IN_TEMPLATES = [
  {
    name: 'HTTP Request',
    description: 'Fetch data from a URL using the requests library',
    category: 'networking',
    language: 'python',
    interpreter: null,
    content: `import requests

url = "https://api.example.com/data"

response = requests.get(url)
response.raise_for_status()

data = response.json()
print(data)
`,
    parameters: '[]',
    isBuiltIn: true,
  },
  {
    name: 'Read/Write File',
    description: 'Read from and write to a file on disk',
    category: 'filesystem',
    language: 'python',
    interpreter: null,
    content: `input_path = "input.txt"
output_path = "output.txt"

with open(input_path, "r") as f:
    content = f.read()

print("Read:", content)

with open(output_path, "w") as f:
    f.write(content)

print("Written to", output_path)
`,
    parameters: '[]',
    isBuiltIn: true,
  },
  {
    name: 'Run Shell Command',
    description: 'Execute a shell command and capture output using subprocess',
    category: 'system',
    language: 'python',
    interpreter: null,
    content: `import subprocess

result = subprocess.run(
    ["echo", "Hello from shell"],
    capture_output=True,
    text=True
)

print("stdout:", result.stdout)
print("stderr:", result.stderr)
print("exit code:", result.returncode)
`,
    parameters: '[]',
    isBuiltIn: true,
  },
  {
    name: 'Parse JSON',
    description: 'Load and parse a JSON file',
    category: 'data',
    language: 'python',
    interpreter: null,
    content: `import json

with open("data.json", "r") as f:
    data = json.load(f)

print(json.dumps(data, indent=2))
`,
    parameters: '[]',
    isBuiltIn: true,
  },
  {
    name: 'Node.js HTTP Fetch',
    description: 'Fetch data from a URL using the built-in fetch API',
    category: 'networking',
    language: 'node',
    interpreter: null,
    content: `const url = "https://api.example.com/data";

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log(data);
  })
  .catch(err => {
    console.error("Error:", err);
    process.exit(1);
  });
`,
    parameters: '[]',
    isBuiltIn: true,
  },
  {
    name: 'Bash Script',
    description: 'Basic Bash script with shebang and common patterns',
    category: 'system',
    language: 'shell',
    interpreter: null,
    content: `#!/usr/bin/env bash
set -euo pipefail

echo "Script started"

# Your commands here
DATE=$(date +"%Y-%m-%d %H:%M:%S")
echo "Current time: $DATE"

echo "Done"
`,
    parameters: '[]',
    isBuiltIn: true,
  },
]

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
