import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.join(__dirname, 'src')

async function walk(dir, callback) {
  const files = await fs.readdir(dir, { withFileTypes: true })
  for (const file of files) {
    const res = path.resolve(dir, file.name)
    if (file.isDirectory()) {
      await walk(res, callback)
    } else {
      await callback(res)
    }
  }
}

async function migrateFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return

  let content = await fs.readFile(filePath, 'utf-8')
  let modified = false

  // 1. next/dynamic -> React.lazy
  if (content.includes('next/dynamic')) {
    content = content.replace(/import dynamic from ['"]next\/dynamic['"];?\n?/g, '')
    // Add lazy to react imports if not there
    if (content.includes("import React") || content.includes("import {") && content.includes("'react'")) {
      if (!content.includes('lazy')) {
        content = content.replace(/import\s+{([^}]*)}\s+from\s+['"]react['"]/g, "import { lazy, $1 } from 'react'")
      }
    } else {
      content = "import { lazy } from 'react';\n" + content
    }
    
    // Replace dynamic(() => import(...), { ssr: false }) with lazy(() => import(...))
    content = content.replace(/dynamic\(\s*\(\)\s*=>\s*import\(([^)]+)\)(?:,\s*\{[^}]*\}\s*)?\)/g, 'lazy(() => import($1))')
    modified = true
  }

  // 2. next/link -> react-router-dom Link
  if (content.includes('next/link')) {
    content = content.replace(/import Link from ['"]next\/link['"];?/g, "import { Link } from 'react-router-dom'")
    modified = true
  }

  // 3. next/navigation -> react-router-dom hooks
  if (content.includes('next/navigation')) {
    let routerImports = []
    if (content.includes('useRouter')) routerImports.push('useNavigate')
    if (content.includes('usePathname')) routerImports.push('useLocation')
    if (content.includes('useSearchParams')) routerImports.push('useSearchParams')
    
    content = content.replace(/import\s+\{[^}]*\}\s+from\s+['"]next\/navigation['"];?/g, `import { ${routerImports.join(', ')} } from 'react-router-dom'`)
    
    // Replace hook usages
    content = content.replace(/const (\w+) = useRouter\(\)/g, 'const $1 = useNavigate()')
    content = content.replace(/const (\w+) = usePathname\(\)/g, 'const $1 = useLocation().pathname')
    // router.push -> navigate
    content = content.replace(/(\w+)\.push\(/g, '$1(') 
    
    modified = true
  }

  // 4. next/image -> native img
  if (content.includes('next/image')) {
    content = content.replace(/import Image from ['"]next\/image['"];?\n?/g, '')
    content = content.replace(/<Image/g, '<img')
    modified = true
  }

  // Remove "use client" as it's not needed in Vite
  if (content.includes("'use client'") || content.includes('"use client"')) {
    content = content.replace(/['"]use client['"];?\n?/g, '')
    modified = true
  }

  if (modified) {
    await fs.writeFile(filePath, content, 'utf-8')
    console.log(`Migrated: ${path.relative(__dirname, filePath)}`)
  }
}

async function run() {
  console.log('Starting Next.js to Vite React migration...')
  await walk(srcDir, migrateFile)
  console.log('Done!')
}

run().catch(console.error)
