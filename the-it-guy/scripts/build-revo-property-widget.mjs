import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
await build({
  configFile: false,
  root: packageRoot,
  publicDir: false,
  envDir: resolve(packageRoot, 'output/no-preview-env'),
  envPrefix: 'REVO_WIDGET_PUBLIC_',
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: resolve(packageRoot, 'output/revo-property-widget'),
    emptyOutDir: true,
    lib: { entry: resolve(packageRoot, 'src/modules/revo/website/revoWebsiteEmbed.jsx'), formats: ['es'], fileName: 'revo-properties', cssFileName: 'revo-properties' },
  },
})
