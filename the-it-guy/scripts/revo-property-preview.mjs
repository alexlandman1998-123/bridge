import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { build, createServer } from 'vite'
import react from '@vitejs/plugin-react'
import sharp from 'sharp'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const root = resolve(packageRoot, 'previews/revo-properties')
const output = resolve(packageRoot, 'output/revo-property-preview')
const base = process.argv.find((argument) => argument.startsWith('--base='))?.slice(7) || '/'
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw new Error('Preview base must be a path beginning and ending with /.')
const sources = { sales: 'public/demo-listing-images/revo-sales-cover.png', rental: 'public/demo-listing-images/revo-rental-cover.png', 'short-stay': 'public/demo-listing-images/revo-short-stay-cover.png', interior: 'public/brand/harbour-heights-apartment-14.png' }
const image = (name) => sharp(resolve(packageRoot,sources[name])).resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
const config = { configFile: false, root, base, publicDir: false, envDir: resolve(packageRoot,'output/no-preview-env'), envPrefix: 'REVO_PREVIEW_PUBLIC_', plugins: [react()], build: { outDir: output, emptyOutDir: true }, server: { host: '127.0.0.1', port: 4190, strictPort: true, fs: { allow: [packageRoot] } } }
if (process.argv[2] === 'build') {
  await build(config)
  await mkdir(resolve(output,'images'),{recursive:true})
  await Promise.all(Object.keys(sources).map(async(name) => writeFile(resolve(output,'images',`${name}.webp`), await image(name))))
  const hosting = JSON.parse(await readFile(resolve(root,'vercel.json'), 'utf8'))
  if (base !== '/') hosting.rewrites = [{ source: `${base.slice(0,-1)}/:path*`, destination: '/:path*' }, ...(hosting.rewrites || [])]
  await writeFile(resolve(output,'vercel.json'), JSON.stringify(hosting, null, 2))
  console.log(`Revo design preview built: ${output}`)
} else {
  const images = new Map(await Promise.all(Object.keys(sources).map(async(name) => [name,await image(name)])))
  config.plugins.push({ name: 'revo-preview-images', configureServer(server) { server.middlewares.use((request,response,next) => {
    const path = request.url?.split('?')[0]
    const imagePath = base !== '/' && path?.startsWith(base) ? path.slice(base.length - 1) : path
    const name = imagePath?.match(/^\/images\/(sales|rental|short-stay|interior)\.webp$/)?.[1]
    if (!name) return next()
    response.setHeader('Content-Type','image/webp');response.end(images.get(name))
  }) } })
  const server = await createServer(config)
  await server.listen()
  console.log('Revo design preview: http://127.0.0.1:4190')
  const stop = async () => { await server.close();process.exit(0) }
  process.on('SIGINT',stop);process.on('SIGTERM',stop)
}
