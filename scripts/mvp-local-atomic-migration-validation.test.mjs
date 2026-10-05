import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./mvp-local-atomic-migration-validation.sh', import.meta.url))
const config = 'project_id = "default"\n[api]\nport = 54321\n[db]\nport = 54322\nshadow_port = 54320\nmajor_version = 17\n[db.migrations]\nenabled = true\n[db.seed]\nenabled = true\n[studio]\nenabled = true\nport = 54323\n[local_smtp]\nenabled = true\nport = 54324\n[analytics]\nenabled = true\nport = 54327\n[edge_runtime]\nenabled = true\n'

async function run(mode) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'arch9-replay-check-'))
  try {
    const logPath = path.join(directory, 'calls.jsonl')
    const fake = `#!${process.execPath}
      const fs = require('node:fs'), path = require('node:path')
      const args = process.argv.slice(2), name = path.basename(process.argv[1])
      const workdir = args[args.indexOf('--workdir') + 1]
      const mode = process.env.ARCH9_REPLAY_TEST_MODE
      const record = { name, args, telemetryDisabled: process.env.SUPABASE_TELEMETRY_DISABLED }
      if (name === 'docker' && args[0] === 'info' && mode === 'no-docker') process.exit(1)
      if (name === 'docker' && args[0] === 'context') console.log(mode === 'remote-docker' ? 'ssh://example.test' : 'unix:///synthetic/docker.sock')
      if (name === 'npx' && args.includes('init')) {
        fs.mkdirSync(path.join(workdir, 'supabase/migrations'), { recursive: true })
        const config = ${JSON.stringify(config)}
        fs.writeFileSync(path.join(workdir, 'supabase/config.toml'), mode === 'legacy-config' ? config.replace('local_smtp', 'inbucket') : config)
      }
      if (name === 'npx' && ['start','reset','status'].some(action => args.includes(action))) record.config = fs.readFileSync(path.join(workdir,'supabase/config.toml'),'utf8')
      if (name === 'npx' && args.includes('start')) record.files = fs.readdirSync(path.join(workdir,'supabase'))
      fs.appendFileSync(process.env.ARCH9_REPLAY_TEST_LOG,JSON.stringify(record)+'\\n')
      if (name === 'npx' && args.includes('start') && mode === 'start-failure') process.exit(1)
      if (name === 'npx' && args.includes('reset') && mode === 'reset-failure') {
        console.error('Applying migration 202601010001_synthetic.sql... SQLSTATE 42703 synthetic-hidden-secret')
        process.exit(1)
      }
      if (name === 'npx' && args.includes('status')) {
        const port = record.config.match(/\\[api\\][\\s\\S]*?port = (\\d+)/)[1]
        console.log('API_URL="http://' + (mode === 'remote-url' ? 'example.test' : '127.0.0.1') + ':'+port+'"')
        console.log('SERVICE_ROLE_KEY="synthetic-hidden-secret"')
      }
      if (name === 'curl') {
        const file = args[args.indexOf('-o') + 1]
        fs.writeFileSync(file,'{}')
        process.stdout.write('200')
      }
      if (name === 'df') console.log('Filesystem 1024-blocks Used Available Capacity Mounted on\\nfixture 99999999 1000 '+(mode === 'no-space' ? '512000' : '20000000')+' 1% /')
    `
    for (const name of ['docker','npx','curl','df']) await fs.writeFile(path.join(directory,name),fake,{mode:0o755})
    const result = spawnSync('bash',[script],{encoding:'utf8',timeout:20000,env:{...process.env,DOCKER_HOST:'',PATH:`${directory}:${process.env.PATH}`,ARCH9_REPLAY_TEST_LOG:logPath,ARCH9_REPLAY_TEST_MODE:mode}})
    const calls = (await fs.readFile(logPath,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(JSON.parse)
    const workdirs = calls.filter(call=>call.args.includes('--workdir')).map(call=>call.args[call.args.indexOf('--workdir')+1])
    for (const workdir of new Set(workdirs)) assert.equal(await fs.stat(workdir).then(()=>true,()=>false),false,'Temporary projects must be removed')
    assert.ok(!`${result.stdout}${result.stderr}`.includes('synthetic-hidden-secret'),'Credentials and SQL literals cannot reach the output')
    return {result,calls}
  } finally { await fs.rm(directory,{recursive:true,force:true}) }
}

test('unavailable Docker stops before creating or resetting a project', async () => {
  const {result,calls}=await run('no-docker')
  assert.equal(result.status,2)
  assert.equal(calls.length,0)
})

for (const mode of ['no-space','remote-docker']) test(`${mode} stops before creating or resetting a project`, async () => {
  const {result,calls}=await run(mode)
  assert.equal(result.status,2)
  assert.ok(!calls.some(call=>call.name==='npx'))
  assert.ok(!calls.some(call=>call.name==='docker' && call.args[0]==='network'))
})

test('replay uses unique local ports, fresh config, no seed, blocked egress and only local resets', async () => {
  const {result,calls}=await run('success')
  assert.equal(result.status,0,result.stderr)
  const start=calls.find(call=>call.args.includes('start'))
  assert.equal(start.telemetryDisabled,'1')
  assert.deepEqual(start.files.sort(),['config.toml','migrations'])
  assert.match(start.config,/project_id = "arch9-mvp-atomic-/)
  assert.match(start.config,/\[db.migrations\]\nenabled = false/)
  assert.match(start.config,/\[db.seed\]\nenabled = false/)
  const ports=[...start.config.matchAll(/(?:port|shadow_port) = (\d+)/g)].map(match=>Number(match[1]))
  assert.equal(new Set(ports).size,ports.length)
  assert.ok(ports.every(port=>port!==54321 && port!==54322))
  assert.ok(calls.some(call=>call.name==='docker' && call.args.includes('--internal')))
  assert.ok(calls.some(call=>call.name==='docker' && call.args.some(value=>value.includes('cron.launch_active_jobs'))))
  const reset=calls.find(call=>call.args.includes('reset'))
  assert.ok(reset.args.includes('--local') && reset.args.includes('--no-seed'))
  assert.match(reset.config,/\[db.migrations\]\nenabled = true/)
  assert.ok(!calls.some(call=>call.args.some(arg=>['--linked','--db-url','push','repair'].includes(arg))))
  assert.ok(calls.some(call=>call.args.includes('stop') && call.args.includes('--no-backup')))
  assert.ok(calls.some(call=>call.name==='docker' && call.args[0]==='network' && call.args[1]==='rm'))
})

test('legacy local SMTP configuration receives a separate sandbox port', async () => {
  const {result,calls}=await run('legacy-config')
  assert.equal(result.status,0,result.stderr)
  assert.match(calls.find(call=>call.args.includes('start')).config,/\[inbucket\]\n(?:enabled = true\n)?port = (?!54324)\d+/)
})

for (const mode of ['start-failure','reset-failure','remote-url']) test(`${mode} cleans up and cannot call an external API`, async () => {
  const {result,calls}=await run(mode)
  assert.ok(result.status!==0)
  assert.ok(calls.some(call=>call.args.includes('stop')))
  assert.ok(calls.some(call=>call.name==='docker' && call.args[1]==='rm'))
  assert.ok(!calls.some(call=>call.name==='curl'))
})
