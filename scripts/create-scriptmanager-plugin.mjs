import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const [directory, id] = process.argv.slice(2)
if (!directory || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(id ?? '')) { console.error('Usage: npm run plugin:create -- <directory> <plugin-id>'); process.exit(1) }
await mkdir(directory, { recursive: true })
const manifest = { manifestVersion: 1, id, name: id.split('.').at(-1), version: '1.0.0', compatibility: '^1.0.0', capabilities: [], settingsSchema: { type: 'object', properties: {}, additionalProperties: false }, nodes: [{ type: 'example', name: 'Example', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } }], lifecycle: ['healthCheck'] }
await writeFile(path.join(directory, 'scriptmanager.plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
await writeFile(path.join(directory, 'plugin.ts'), "import type { PluginRuntime } from '@scriptmanager/plugin-sdk'\nexport const plugin: PluginRuntime = { async executeNode(_type, _config, input) { return input }, async healthCheck() { return { healthy: true } } }\n", { flag: 'wx' })
console.log(`Created ${id} in ${path.resolve(directory)}`)
