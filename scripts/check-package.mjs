import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const directory = await mkdtemp(join(root, '.context-package-check-'))
try {
  if (!process.env.npm_execpath) throw new Error('Run this check with npm run test:package')
  const [packed] = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', directory], { cwd: root, encoding: 'utf8' }))
  assert.deepEqual(packed.files.map(file => file.path).sort(), [
    'LICENSE',
    'NOTICE.md',
    'README.md',
    'cordis.patch.yml',
    'lib/index.mjs',
    'package.json',
    'src/client.js',
    'src/index.mjs',
    'src/manager.mjs',
  ])
  execFileSync('tar', ['-xzf', join(directory, packed.filename), '-C', directory])
  const result = spawnSync(process.execPath, ['test/all.mjs'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DSH_CONTEXT_PLUGIN_ENTRY: join(directory, 'package/lib/index.mjs'),
      DSH_CONTEXT_CLIENT_ENTRY: join(directory, 'package/src/client.js'),
    },
  })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Packed plugin tests failed')
  console.log(`Verified ${packed.filename}: nine public files; packed host and browser tests passed.`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
