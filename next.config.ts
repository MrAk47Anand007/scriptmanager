import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
    outputFileTracingRoot: path.resolve(__dirname),
    serverExternalPackages: ['node-pty', 'ssh2'],
    // Enable standalone output only during Electron builds for packaging
    output: process.env.ELECTRON_BUILD ? 'standalone' : undefined,
}

export default nextConfig
