import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'
import react from '@vitejs/plugin-react'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
export const HOME_SEEKERS_DEPLOYMENT_ROOT = join(packageRoot, '.vercel/home-seekers-website')
export const HOME_SEEKERS_VERCEL_PROJECT = {
  projectId: 'prj_uxIQ3zvHt7AM0iKSBXLa9ezBh5MA',
  orgId: 'team_ezJ5RCE7qwTf14fw215IhPs5',
  projectName: 'home-seekers-website',
}
export const HOME_SEEKERS_FUNCTIONS = ['site', 'leads', 'analytics', 'applications', 'recruitment']

export async function buildHomeSeekersFrontend(frontendDirectory) {
  // Use the public route entry rather than building the frequently active CRM
  // checkout. Server credentials are only read by the packaged functions.
  const result = await build({
    root: packageRoot,
    configFile: false,
    envFile: false,
    plugins: [react()],
    define: { 'import.meta.env.VITE_HOME_SEEKERS_STANDALONE': JSON.stringify('true') },
    build: {
      outDir: frontendDirectory,
      emptyOutDir: true,
      rollupOptions: { input: join(packageRoot, 'home-seekers.html') },
    },
  })
  await rename(join(frontendDirectory, 'home-seekers.html'), join(frontendDirectory, 'index.html'))
  return result
}

// Resolve real files and functions before the SPA fallback. Unknown API paths
// must return an error rather than a successful response containing index.html.
export const HOME_SEEKERS_OUTPUT_CONFIG = {
  version: 3,
  routes: [
    { src: '^/assets/.*$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
    { src: '^/(?:$|(?:guarantee|about|contact|selling|buying|renting|join|buy|sell|rent|developments|people|areas|valuation)/?$|(?:buying|properties)/[^/]+/?$)', headers: { 'Cache-Control': 'no-store' }, continue: true },
    { src: '^/demo/homeseekers(?:/.*)?$', headers: { 'Cache-Control': 'no-store' }, continue: true },
    { handle: 'filesystem' },
    { src: '^/api(?:/.*)?$', dest: '/api-not-found.json', status: 404 },
    { src: '^/(?:$|(?:guarantee|about|contact|selling|buying|renting|join|buy|sell|rent|developments|people|areas|valuation)/?$|(?:buying|properties)/[^/]+/?$)', dest: '/index.html' },
    { src: '^/demo/homeseekers(?:/.*)?$', dest: '/index.html' },
    { src: '^/.*$', dest: '/not-found.html', status: 404 },
  ],
}

export async function buildHomeSeekersFunctions(outputRoot) {
  for (const name of HOME_SEEKERS_FUNCTIONS) {
    const functionDirectory = join(outputRoot, 'functions/api/home-seekers', `${name}.func`)
    await build({
      root: packageRoot,
      configFile: false,
      publicDir: false,
      envFile: false,
      logLevel: 'warn',
      ssr: { noExternal: true },
      build: {
        ssr: join(packageRoot, 'api/home-seekers', `${name}.js`),
        target: 'node24',
        outDir: functionDirectory,
        emptyOutDir: true,
        minify: false,
        rollupOptions: { output: { format: 'cjs', exports: 'default', entryFileNames: 'index.cjs', inlineDynamicImports: true } },
      },
    })
    await writeFile(join(functionDirectory, '.vc-config.json'), `${JSON.stringify({
      runtime: 'nodejs24.x',
      handler: 'index.cjs',
      launcherType: 'Nodejs',
      shouldAddHelpers: true,
      maxDuration: 30,
      regions: ['cpt1'],
    }, null, 2)}\n`)
  }
}

export async function packageHomeSeekersWebsite({ frontendDirectory, deploymentRoot = HOME_SEEKERS_DEPLOYMENT_ROOT }) {
  // Fail before replacing the previous artifact if the frontend is incomplete.
  await readFile(join(frontendDirectory, 'index.html'), 'utf8')
  const outputRoot = join(deploymentRoot, '.vercel/output')
  await rm(outputRoot, { recursive: true, force: true })
  await mkdir(outputRoot, { recursive: true })
  await cp(frontendDirectory, join(outputRoot, 'static'), { recursive: true })
  await buildHomeSeekersFunctions(outputRoot)
  await writeFile(join(outputRoot, 'static/api-not-found.json'), '{"error":"not_found"}\n')
  await writeFile(join(outputRoot, 'static/not-found.html'), '<!doctype html><title>Page not found | Home Seekers</title><h1>Page not found</h1><a href="/">Home Seekers home</a>\n')
  await writeFile(join(outputRoot, 'config.json'), `${JSON.stringify(HOME_SEEKERS_OUTPUT_CONFIG, null, 2)}\n`)
  // Bind the prebuilt output to Home Seekers without changing the main app's
  // existing local Vercel link or copying any credentials into the artifact.
  await mkdir(join(deploymentRoot, '.vercel'), { recursive: true })
  await writeFile(join(deploymentRoot, '.vercel/project.json'), `${JSON.stringify(HOME_SEEKERS_VERCEL_PROJECT, null, 2)}\n`)
  return outputRoot
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const frontendDirectory = join(HOME_SEEKERS_DEPLOYMENT_ROOT, 'frontend')
  await buildHomeSeekersFrontend(frontendDirectory)
  const outputRoot = await packageHomeSeekersWebsite({ frontendDirectory })
  console.log(`Home Seekers website prepared at ${outputRoot}`)
  console.log('Includes site, leads, analytics, applications and recruitment signup APIs. No deployment was performed.')
}
