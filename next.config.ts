import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
    serverExternalPackages: ['node-pty'],
    // Enable standalone output only during Electron builds for packaging
    output: process.env.ELECTRON_BUILD ? 'standalone' : undefined,
}

export default nextConfig
