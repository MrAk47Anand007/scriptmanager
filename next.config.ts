import type { NextConfig } from 'next'
import path from 'node:path'
import { securityHeaders } from './src/lib/production/httpSecurity'

const nextConfig: NextConfig = {
    outputFileTracingRoot: path.resolve(__dirname),
    serverExternalPackages: ['node-pty', 'ssh2'],
    // Enable standalone output only during Electron builds for packaging
    output: process.env.ELECTRON_BUILD ? 'standalone' : undefined,
    poweredByHeader: false,
    async headers() {
        return [{ source: '/:path*', headers: [...securityHeaders] }]
    },
}

export default nextConfig
