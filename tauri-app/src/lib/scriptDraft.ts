export type ScriptDraftRuntimePreset = 'general' | 'python' | 'node' | 'shell' | 'powershell'

export type ScriptDraft = {
  finalName: string
  language: string
  content: string
}

export function inferScriptDraft(rawName: string, runtimePreset: ScriptDraftRuntimePreset): ScriptDraft {
  let finalName = rawName.trim()
  let language = 'python'
  let content = 'print("Hello World")'

  const lowerName = finalName.toLowerCase()
  const hasExtension = /\.[a-z0-9]+$/i.test(finalName)

  if (lowerName.endsWith('.py')) {
    language = 'python'
    content = 'print("Hello World")'
  } else if (lowerName.endsWith('.js') || lowerName.endsWith('.ts')) {
    language = 'node'
    content = 'console.log("Hello World");'
  } else if (lowerName.endsWith('.ps1')) {
    language = 'powershell'
    content = 'Write-Host "Hello World"'
  } else if (lowerName.endsWith('.sh')) {
    language = 'shell'
    content = '#!/bin/bash\necho "Hello World"'
  } else if (lowerName.endsWith('.bat')) {
    language = 'shell'
    content = '@echo off\necho "Hello World"'
  } else if (!hasExtension) {
    if (runtimePreset === 'node') {
      finalName += '.js'
      language = 'node'
      content = 'console.log("Hello World");'
    } else if (runtimePreset === 'shell') {
      finalName += '.sh'
      language = 'shell'
      content = '#!/bin/bash\necho "Hello World"'
    } else if (runtimePreset === 'powershell') {
      finalName += '.ps1'
      language = 'powershell'
      content = 'Write-Host "Hello World"'
    } else {
      finalName += '.py'
    }
  }

  return { finalName, language, content }
}
