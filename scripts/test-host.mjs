/**
 * Host-half tests: the npm update check, the update service, the version
 * comparison, and the wiring apply() performs. Pure node — no browser, no DSH —
 * so CI always runs it.
 *
 * The handlers are module-private on purpose (the plugin exposes one apply()), so
 * the test lifts them out of the built lib/index.js and drives them with fake
 * req/res objects and a fake child process. That keeps the risky parts covered
 * without a running profile: the mirror-first lookup and its fallback, the
 * desktop-profile refusal, the install argv, and the routes that get registered.
 */
import { readFileSync, statSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LIB = resolve(here, '../lib/index.js')
const source = readFileSync(LIB, 'utf8')

const lift = (from, to, name) => {
  const start = source.indexOf(from)
  const end = source.indexOf(to, start)
  if (start < 0 || end < 0) throw new Error(`cannot lift ${name}`)
  // `import.meta` is not available inside new Function(); packageVersion() only
  // uses it to locate package.json, and the stub below does that itself.
  return source.slice(start, end).replaceAll('import.meta.url', 'globalThis.__metaUrl')
}

/** A child process that reports the exit code the test wants. */
function fakeSpawn(code, output) {
  return () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {}
    setTimeout(() => {
      if (output !== '') {
        child.stdout.emit('data', Buffer.from(output, 'utf8'))
      }
      child.emit('close', code)
    }, 0)
    return child
  }
}

const factory = new Function(
  'fetch',
  'readFileSync',
  'existsSync',
  'spawn',
  'statSync',
  lift('const VERSION_GLOBAL', 'const FIRST_FRAME_CSS', 'helpers') +
    '; return { compareVersions, updateHandler, applyHandler, mediaHandler, latestPublished, profileInfo, installCommand, packageVersion }',
)

const readFileSyncStub = (path, encoding) =>
  readFileSync(path instanceof URL ? fileURLToPath(path) : String(path), encoding)
const statSyncStub = (path) => statSync(path instanceof URL ? fileURLToPath(path) : String(path))
globalThis.__metaUrl = import.meta.url

const load = (fetchImpl, options = {}) =>
  factory(
    fetchImpl,
    options.readFileSync ?? readFileSyncStub,
    options.existsSync ?? (() => true),
    options.spawn ?? fakeSpawn(0, ''),
    options.statSync ?? statSyncStub,
  )

const registryOk = (version) => async (url) => {
  if (!String(url).startsWith(REGISTRY)) throw new Error(`unexpected url ${String(url)}`)
  return { ok: true, status: 200, json: async () => ({ version, dist: { tarball: `https://x/${version}.tgz` } }) }
}
const REGISTRY = 'https://registry.npmmirror.com'
const OFFICIAL = 'https://registry.npmjs.org'

/** Answer the mirror and the official registry differently, to prove the order. */
const bothRegistries = (mirror, official) => async (url) => {
  const target = String(url).startsWith(REGISTRY) ? mirror : String(url).startsWith(OFFICIAL) ? official : null
  if (target === null) throw new Error(`unexpected url ${String(url)}`)
  if (target instanceof Error) throw target
  return { ok: true, status: 200, json: async () => ({ version: target, dist: { tarball: `https://x/${target}.tgz` } }) }
}

const fakeResponse = () => {
  const out = { status: null, headers: null, body: null, ended: false }
  return {
    out,
    res: {
      writeHead(status, headers) {
        out.status = status
        out.headers = headers ?? null
      },
      end(body) {
        out.ended = true
        out.body = body ?? null
      },
    },
  }
}

const fakeRequest = (method, body = '') => ({
  method,
  async *[Symbol.asyncIterator]() {
    if (body !== '') yield Buffer.from(body, 'utf8')
  },
})

let failures = 0
const check = (label, condition, detail) => {
  if (!condition) failures += 1
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : `  (${detail})`}`)
}

console.log('version comparison')
{
  const { compareVersions } = load(registryOk('0.0.1'))
  for (const [a, b, want] of [
    ['0.2.0', '0.1.4', 1],
    ['0.1.4', '0.2.0', -1],
    ['0.1.4', '0.1.4', 0],
    ['v0.1.5', '0.1.4', 1],
    ['0.2.0-rc.1', '0.1.4', 1],
    ['0.1.4', '0.1.4-rc.1', 1],
    ['0.1.10', '0.1.9', 1],
    ['nonsense', '0.1.4', 0],
  ]) {
    check(`compare(${a}, ${b}) = ${String(want)}`, compareVersions(a, b) === want, `got ${String(compareVersions(a, b))}`)
  }
}

console.log('\npackage version')
{
  const { packageVersion } = load(registryOk('0.0.1'))
  check('reads the installed package.json', /^\d+\.\d+\.\d+/.test(String(packageVersion())), String(packageVersion()))
}

console.log('\nregistry lookup (mirror first)')
{
  const { latestPublished } = load(bothRegistries('9.9.9', '8.8.8'))
  const found = await latestPublished()
  check('prefers the mirror', found.source === 'npmmirror' && found.latest === '9.9.9', JSON.stringify(found))

  const { latestPublished: fallback } = load(bothRegistries(new Error('mirror down'), '8.8.8'))
  const second = await fallback()
  check('falls back to the official registry', second.source === 'npmjs' && second.latest === '8.8.8', JSON.stringify(second))

  const { latestPublished: broken } = load(
    bothRegistries(new Error('mirror down'), new Error('official down')),
  )
  let threw = null
  try {
    await broken()
  } catch (error) {
    threw = error
  }
  check('reports both failures', threw !== null && String(threw.message).includes('mirror down') && String(threw.message).includes('official down'))

  let calls = 0
  const { latestPublished: cached } = load(async (url) => {
    calls += 1
    return { ok: true, status: 200, json: async () => ({ version: '9.9.9', dist: {} }) }
  })
  await cached()
  await cached()
  check('a second press reuses the cache', calls === 1, `upstream calls ${String(calls)}`)
}

console.log('\nprofile handling')
{
  // The environment the CLI path is derived from has to be pinned: on this
  // machine DSH_HOME and DSH_PROFILE_DIR are inherited from the running app, but
  // CI has neither, and the argv assertion below would then compare against an
  // empty path.
  const saved = { DSH_PROFILE: process.env.DSH_PROFILE, DSH_HOME: process.env.DSH_HOME, DSH_PROFILE_DIR: process.env.DSH_PROFILE_DIR }
  process.env.DSH_HOME = '/tmp/dsh-home'
  process.env.DSH_PROFILE_DIR = '/tmp/dsh-home/profiles/web'

  const { profileInfo, installCommand } = load(registryOk('0.0.1'))
  process.env.DSH_PROFILE = 'web'
  const web = profileInfo()
  check('web profile may be updated by the host', web.canApply === true && web.profile === 'web', JSON.stringify(web))
  const command = installCommand('web')
  check('install argv targets the CLI', String(command.args[0]).endsWith('dsh/lib/bin.js'), String(command.args[0]))
  check('install argv adds the package at latest', command.args.join(' ') === `${command.args[0]} plugin --profile web add dsh-boot-deepseek@latest`, command.args.join(' '))

  process.env.DSH_PROFILE = 'desktop'
  const desktop = profileInfo()
  check('desktop is refused before spawning anything', desktop.canApply === false && desktop.reason === 'desktop-profile', JSON.stringify(desktop))

  delete process.env.DSH_PROFILE
  const unknown = profileInfo()
  check('unknown profile is refused', unknown.canApply === false && unknown.reason === 'unknown-profile', JSON.stringify(unknown))

  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

console.log('\nupdate route')
{
  const { updateHandler } = load(bothRegistries('9.9.9', '8.8.8'))
  const refused = fakeResponse()
  await updateHandler(fakeRequest('POST'), refused.res)
  check('POST is refused with 405', refused.out.status === 405, `status ${String(refused.out.status)}`)

  const probe = fakeResponse()
  await updateHandler(fakeRequest('GET'), probe.res)
  const payload = JSON.parse(String(probe.out.body))
  check('GET answers 200 JSON', probe.out.status === 200 && probe.out.headers['content-type'].includes('json'))
  check('newer version -> outdated', payload.state === 'outdated' && payload.latest === '9.9.9', JSON.stringify(payload))
  check('names the source registry', payload.source === 'npmmirror')
  check('reports the running version', typeof payload.current === 'string' && payload.current.length > 0)
  check('points at the npm page', String(payload.url).includes('npmjs.com/package/dsh-boot-deepseek'))
  check('no-store', probe.out.headers['cache-control'] === 'no-store')

  const { updateHandler: same } = load(bothRegistries('0.0.1', '0.0.1'))
  const answer = fakeResponse()
  await same(fakeRequest('GET'), answer.res)
  check('older version -> current', JSON.parse(String(answer.out.body)).state === 'current')

  const { updateHandler: unknown } = load(bothRegistries(new Error('x'), new Error('y')))
  const down = fakeResponse()
  await unknown(fakeRequest('GET'), down.res)
  const downPayload = JSON.parse(String(down.out.body))
  check('both registries down -> unknown + error', downPayload.state === 'unknown' && String(downPayload.error).includes('x'))
}

console.log('\nupdate service')
{
  // Same reason as above: the CLI path comes from the environment, so pin it here
  // too rather than relying on whatever the developer's shell happens to carry.
  const savedEnv = {
    DSH_PROFILE: process.env.DSH_PROFILE,
    DSH_HOME: process.env.DSH_HOME,
    DSH_PROFILE_DIR: process.env.DSH_PROFILE_DIR,
  }
  process.env.DSH_HOME = '/tmp/dsh-home'
  process.env.DSH_PROFILE_DIR = '/tmp/dsh-home/profiles/web'
  process.env.DSH_PROFILE = 'desktop'
  const { applyHandler } = load(registryOk('0.0.1'), { spawn: fakeSpawn(0, 'should not run') })
  const desktop = fakeResponse()
  await applyHandler(fakeRequest('POST'), desktop.res)
  const desktopPayload = JSON.parse(String(desktop.out.body))
  check('desktop is refused with 409', desktop.out.status === 409 && desktopPayload.ok === false, `status ${String(desktop.out.status)}`)
  check('the refusal explains the in-app route', String(desktopPayload.hint).includes('设置 → 插件'), String(desktopPayload.hint))
  check('nothing was spawned', desktopPayload.output === undefined)

  process.env.DSH_PROFILE = 'web'
  const { applyHandler: allowed } = load(registryOk('0.0.1'), { spawn: fakeSpawn(0, 'added 1 package') })
  const ok = fakeResponse()
  await allowed(fakeRequest('POST'), ok.res)
  const okPayload = JSON.parse(String(ok.out.body))
  check('allowed profile -> 200 ok', ok.out.status === 200 && okPayload.ok === true, JSON.stringify(okPayload))
  check('the CLI output is passed through', String(okPayload.output).includes('added 1 package'), String(okPayload.output))
  check('restart is required', okPayload.restart === true)
  check('the version comes from the cached lookup', typeof okPayload.version === 'string', String(okPayload.version))

  const { applyHandler: failed } = load(registryOk('0.0.1'), { spawn: fakeSpawn(1, 'ERR_PNPM_NO_MATCHING_VERSION') })
  const bad = fakeResponse()
  await failed(fakeRequest('POST'), bad.res)
  const badPayload = JSON.parse(String(bad.out.body))
  check('a failing install -> 500 with the output', bad.out.status === 500 && String(badPayload.output).includes('ERR_PNPM'), JSON.stringify(badPayload.output).slice(0, 80))

  const { applyHandler: wrongMethod } = load(registryOk('0.0.1'))
  const method = fakeResponse()
  await wrongMethod(fakeRequest('GET'), method.res)
  check('GET is refused with 405', method.out.status === 405)

  const { applyHandler: noCli } = load(registryOk('0.0.1'), { existsSync: () => false })
  const missing = fakeResponse()
  await noCli(fakeRequest('POST'), missing.res)
  check('no CLI -> 409 no-cli', missing.out.status === 409 && JSON.parse(String(missing.out.body)).reason === 'no-cli')

  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

console.log('\nfinale media route')
{
  // The one thing the splash needs from the host: the finale video's bytes. The
  // handler is module-private, so it is driven directly with a stubbed file read —
  // the assertions then do not depend on the 1.8 MB asset being present, and the
  // range arithmetic (the part that could silently break playback) is pinned.
  const VIDEO = Buffer.from('0123456789ABCDEF') // 16 bytes
  const reads = []
  // A mutable stat, so "the asset was replaced" can be driven: the cache is keyed
  // on size + mtime, which is exactly what swapping the file changes.
  let fileStat = { size: VIDEO.length, mtimeMs: 1000 }
  const { mediaHandler } = load(
    () => {
      throw new Error('this case must not touch the network')
    },
    {
      readFileSync: (path) => {
        reads.push(String(path))
        return VIDEO
      },
      statSync: () => fileStat,
    },
  )

  const request = (method, range) => ({
    method,
    headers: range === undefined ? {} : { range },
    async *[Symbol.asyncIterator]() {},
  })

  const full = fakeResponse()
  mediaHandler(request('GET'), full.res)
  check('GET answers the whole file', full.out.status === 200 && full.out.body.equals(VIDEO), `status ${String(full.out.status)}`)
  check('served as video/mp4', full.out.headers['content-type'] === 'video/mp4', String(full.out.headers['content-type']))
  check('ranges are advertised', full.out.headers['accept-ranges'] === 'bytes', String(full.out.headers['accept-ranges']))
  check('the length is exact', full.out.headers['content-length'] === String(VIDEO.length), String(full.out.headers['content-length']))
  // Every request above already went through the handler: one read of the asset,
  // cached while the file stays put. (package.json is read separately, by
  // packageVersion() at module scope.)
  const mediaReads = () => reads.filter((path) => path.includes('media')).length
  check('the asset is read once and cached', mediaReads() === 1, `${String(reads.length)} reads: ${reads.join(', ')}`)

  // Replacing the asset must be picked up WITHOUT restarting the app. Measured on
  // a real install before this was keyed: route live, the 15 MB film on disk, and
  // `content-length` still the previous 1,856,280 bytes served from memory.
  fileStat = { size: VIDEO.length, mtimeMs: 2000 }
  const replaced = fakeResponse()
  mediaHandler(request('GET'), replaced.res)
  check('a replaced asset is re-read', mediaReads() === 2 && replaced.out.status === 200, `${String(mediaReads())} reads`)
  const unchanged = fakeResponse()
  mediaHandler(request('GET'), unchanged.res)
  check('an unchanged asset stays cached', mediaReads() === 2, `${String(mediaReads())} reads`)

  const head = fakeResponse()
  mediaHandler(request('HEAD'), head.res)
  check('HEAD sends headers and no body', head.out.status === 200 && head.out.body === null && head.out.headers['content-length'] === '16')

  const mid = fakeResponse()
  mediaHandler(request('GET', 'bytes=4-7'), mid.res)
  check('a range answers 206', mid.out.status === 206 && mid.out.headers['content-range'] === 'bytes 4-7/16', String(mid.out.headers['content-range']))
  check('the ranged body is that slice', mid.out.body.equals(Buffer.from('4567')), String(mid.out.body))

  const open = fakeResponse()
  mediaHandler(request('GET', 'bytes=8-'), open.res)
  check('an open-ended range runs to the end', open.out.headers['content-range'] === 'bytes 8-15/16' && open.out.body.length === 8, String(open.out.headers['content-range']))

  const suffix = fakeResponse()
  mediaHandler(request('GET', 'bytes=-4'), suffix.res)
  check('a suffix range counts back from the end', suffix.out.headers['content-range'] === 'bytes 12-15/16', String(suffix.out.headers['content-range']))

  const past = fakeResponse()
  mediaHandler(request('GET', 'bytes=99-120'), past.res)
  check('an unsatisfiable range answers 416', past.out.status === 416 && past.out.headers['content-range'] === 'bytes */16', String(past.out.status))

  const wrongMethod = fakeResponse()
  mediaHandler(request('POST'), wrongMethod.res)
  check('POST is refused with 405', wrongMethod.out.status === 405 && wrongMethod.out.headers.allow === 'GET, HEAD', String(wrongMethod.out.status))

  // A missing asset must not break the splash: 404, and the client half ends the
  // show on the media error.
  const { mediaHandler: absentHandler } = load(
    () => {
      throw new Error('this case must not touch the network')
    },
    {
      readFileSync: () => {
        throw new Error('ENOENT')
      },
    },
  )
  const missing = fakeResponse()
  absentHandler(request('GET'), missing.res)
  check('a missing asset answers 404', missing.out.status === 404, String(missing.out.status))
}

console.log('\nplugin wiring')
{
  const { apply } = await import(pathToFileURL(LIB).href)
  const events = new Map()
  const routes = []
  let injected = null
  const ctx = {
    on(name, handler) {
      events.set(name, handler)
      return () => {}
    },
    inject(deps, callback) {
      injected = deps
      callback({
        effect(fn) {
          const route = fn()
          if (route !== null && typeof route === 'object' && 'path' in route) routes.push(route)
        },
        webServer: {
          register(route) {
            return route
          },
        },
      })
    },
  }
  apply(ctx)

  const table = []
  const injectHandler = events.get('webserver/index-inject')
  check('listens to webserver/index-inject', typeof injectHandler === 'function')
  injectHandler(table)
  check('injects style + script + global', table.map((row) => row.kind).join(',') === 'style,script,global', table.map((row) => row.kind).join(','))
  check('global is __dshDeepseekVersion', table.find((row) => row.kind === 'global')?.name === '__dshDeepseekVersion')
  check('global carries a version', /^\d+\.\d+\.\d+/.test(String(table.find((row) => row.kind === 'global')?.value)))
  check('script row is head-placed', table.find((row) => row.kind === 'script')?.placement === 'head')
  check('cover css mentions the splash background', String(table[0].text).includes('#050403'))

  check('injects webServer optionally', JSON.stringify(injected) === '["webServer"]', JSON.stringify(injected))
  const paths = routes.map((route) => `${route.kind} ${route.path}`)
  check(
    'registers the finale video, the check and the update route',
    paths.includes('exact /dsh-boot-deepseek/media/intro.mp4') &&
      paths.includes('exact /dsh-boot-deepseek/update') &&
      paths.includes('exact /dsh-boot-deepseek/update/apply'),
    paths.join(', '),
  )
  check('every handler is a function', routes.every((route) => typeof route.handler === 'function'))
}

// The settings rows are rendered and asserted by the browser suite
// (scripts/harness/rows.js + the "settings rows · rendered text" case): they live in
// the client bundle, which only runs inside a page.

console.log(failures === 0 ? '\nall cases pass' : `\n${String(failures)} FAILURES`)
process.exitCode = failures === 0 ? 0 : 1
