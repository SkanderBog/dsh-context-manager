import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(process.env.DSH_BUILD_RUNTIME ?? root, 'package.json'))
const { build } = require('esbuild')
await build({ entryPoints: [join(root, 'src/index.mjs')], outfile: join(root, 'lib/index.mjs'), bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22', legalComments: 'inline' })
