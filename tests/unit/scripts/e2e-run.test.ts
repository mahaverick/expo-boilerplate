import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, repoRoot } from '@/tests/support/runner'

/** The script under test. */
const SCRIPT = path.join(repoRoot, 'scripts/e2e-run.mjs')

/** Where the flow files live. */
const FLOWS = path.join(repoRoot, 'e2e/flows')

/** The run id the tests pass. */
const RUN_ID = 't1'

/** What a child process left behind. */
interface Run {
  code: number
  stdout: string
  stderr: string
}

/** One plan entry, as the child reports it. */
interface PlannedFlow {
  name: string
  steps: { file?: string; action?: string }[]
  hasBefore: boolean
  hasCleanup: boolean
}

/** Temporary directories and fake servers made by a test, removed after it. */
const made: string[] = []
const servers: http.Server[] = []

afterEach(async () => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))))
})

/**
 * Run Node with arguments and an environment, without blocking the fake servers.
 * @param args - Node's arguments.
 * @param env - The child's environment.
 * @returns The exit code and output.
 */
function node(args: string[], env: NodeJS.ProcessEnv): Promise<Run> {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { env, encoding: 'utf8' }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
      resolve({ code, stdout, stderr })
    })
  })
}

/**
 * Make a fake `maestro` on a fresh `PATH` directory. It appends its arguments
 * to a log, one JSON line per call, and exits with `exitCode`.
 * @param exitCode - What it exits with.
 * @returns The directory to put first on `PATH` and a reader for the calls.
 */
function fakeMaestro(exitCode: number) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-'))
  made.push(dir)
  const log = path.join(dir, 'calls.jsonl')
  const script = path.join(dir, 'maestro')
  fs.writeFileSync(
    script,
    `#!${process.execPath}
require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n')
process.exit(${exitCode})
`
  )
  fs.chmodSync(script, 0o755)
  /**
   * The arguments of every call so far.
   * @returns One argument list per call.
   */
  const calls = (): string[][] =>
    fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as string[])
      : []
  return { dir, calls }
}

/**
 * Make a fake `maestro` that runs `body` with `outputDir` (its
 * `--test-output-dir`), `fs` and `path` in scope, then exits with `exitCode`.
 * @param body - JavaScript to run on each call.
 * @param exitCode - What it exits with.
 * @returns The directory to put first on `PATH`.
 */
function scriptedMaestro(body: string, exitCode: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-'))
  made.push(dir)
  const script = path.join(dir, 'maestro')
  fs.writeFileSync(
    script,
    `#!${process.execPath}
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const outputDir = args[args.indexOf('--test-output-dir') + 1]
${body}
process.exit(${exitCode})
`
  )
  fs.chmodSync(script, 0o755)
  return dir
}

/**
 * A fresh directory for Maestro's output, removed after the test.
 * @returns Its path.
 */
function outputDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-output-'))
  made.push(dir)
  return dir
}

/**
 * Start a fake Mailpit that never holds a message.
 * @returns Its origin.
 */
async function emptyMailpit(): Promise<string> {
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ messages: [] }))
  })
  servers.push(server)
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/**
 * The runner's environment: this process's, less any e2e setting, with every
 * required variable set and `PATH` led by `binDir`.
 * @param binDir - The directory holding the fake `maestro`.
 * @param overrides - Values to set over the defaults.
 * @returns The environment.
 */
function runnerEnv(binDir: string, overrides: Record<string, string>): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('E2E_'))
  )
  return {
    ...inherited,
    NODE_ENV: process.env.NODE_ENV ?? 'test',
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
    E2E_API_URL: 'http://127.0.0.1:9',
    E2E_MAILPIT_URL: 'http://127.0.0.1:9',
    DATABASE_URL: 'postgres://unused',
    REDIS_URL: 'redis://unused',
    E2E_API_RESTART_CMD: 'false',
    E2E_RUN_ID: RUN_ID,
    ...overrides,
  }
}

/**
 * Read `planFlows(platform)` in Node, since Jest's Babel cannot import a file
 * that uses `import.meta`.
 * @param platform - `android` or `ios`.
 * @returns Each entry's name, steps and hooks.
 */
async function plan(platform: string): Promise<PlannedFlow[]> {
  const code = `
    import { planFlows } from ${JSON.stringify(SCRIPT)}
    console.log(JSON.stringify(planFlows(${JSON.stringify(platform)}, { E2E_RUN_ID: 'x' }).map((entry) => ({
      name: entry.name,
      steps: entry.steps.map(({ file, action }) => ({ file, action })),
      hasBefore: typeof entry.before === 'function',
      hasCleanup: typeof entry.cleanup === 'function',
    }))))
  `
  const run = await node(['--input-type=module', '-e', code], process.env)
  return JSON.parse(run.stdout) as PlannedFlow[]
}

describe('planFlows', () => {
  it('lists the seven flows in order', async () => {
    expect((await plan('android')).map((entry) => entry.name)).toEqual([
      'sign-in',
      'cold-start',
      'first-workspace',
      'switch-workspace',
      'accept-invitation',
      'maintenance',
      'forced-update',
    ])
  })

  it('gives every flow a file named after it, and every file step a file', async () => {
    for (const entry of await plan('android')) {
      expect(fs.existsSync(path.join(FLOWS, `${entry.name}.yaml`))).toBe(true)
      for (const step of entry.steps) {
        if (step.file) expect(fs.existsSync(path.join(FLOWS, step.file))).toBe(true)
      }
    }
  })

  it('resolves every runFlow file a flow names', () => {
    const files = fs.readdirSync(FLOWS, { recursive: true, encoding: 'utf8' })
    for (const file of files.filter((name) => name.endsWith('.yaml'))) {
      const text = fs.readFileSync(path.join(FLOWS, file), 'utf8')
      for (const [, target] of text.matchAll(/(?:runFlow|file):\s+(\S+\.yaml)/g)) {
        expect(fs.existsSync(path.join(FLOWS, path.dirname(file), target ?? ''))).toBe(true)
      }
    }
  })

  it('snapshots the mail before the app asks for a link, and reads it after', async () => {
    const signIn = (await plan('android'))[0]
    expect(signIn?.steps).toEqual([
      { action: 'snapshot the mail' },
      { file: 'sign-in.yaml' },
      { action: 'read the sign-in link' },
      { file: 'sign-in-link.yaml' },
    ])
  })

  it('gives maintenance and forced-update a cleanup step, and no other flow one', async () => {
    const withCleanup = (await plan('android'))
      .filter((entry) => entry.hasCleanup)
      .map((entry) => entry.name)
    expect(withCleanup).toEqual(['maintenance', 'forced-update'])
  })

  it('sets maintenance full before its first file and off before its second', async () => {
    const maintenance = (await plan('android')).find((entry) => entry.name === 'maintenance')
    expect(maintenance?.steps).toEqual([
      { action: 'set maintenance full' },
      { file: 'maintenance.yaml' },
      { action: 'set maintenance off' },
      { file: 'maintenance-off.yaml' },
    ])
  })

  it.each([
    ['android', 'MINIMUM_APP_VERSION_ANDROID'],
    ['ios', 'MINIMUM_APP_VERSION_IOS'],
  ])('raises the %s minimum before the forced-update file', async (platform, variable) => {
    const forced = (await plan(platform)).find((entry) => entry.name === 'forced-update')
    expect(forced?.steps).toEqual([
      { action: `restart express with ${variable}=99.0.0` },
      { file: 'forced-update.yaml' },
    ])
  })
})

describe('runPlan', () => {
  /**
   * Run a plan in Node with the fake `maestro` on `PATH`.
   * @param body - JavaScript that builds `plan`; `log(text)` records a line.
   * @param binDir - The fake `maestro`'s directory.
   * @param env - Settings over the runner's defaults, such as `E2E_OUTPUT_DIR`.
   * @returns The exit code, output and the recorded lines.
   */
  async function runPlanned(body: string, binDir: string, env: Record<string, string> = {}) {
    const code = `
      import { runPlan } from ${JSON.stringify(SCRIPT)}
      const lines = []
      const log = (text) => lines.push(text)
      ${body}
      const exitCode = await runPlan(plan)
      console.log(JSON.stringify(lines))
      process.exitCode = exitCode
    `
    const run = await node(['--input-type=module', '-e', code], runnerEnv(binDir, env))
    const lines = JSON.parse(run.stdout.trim().split('\n').pop() ?? '[]') as string[]
    return { ...run, lines }
  }

  it('passes every variable with -e and writes under maestro-output/<flow>/<file>', async () => {
    const maestro = fakeMaestro(0)
    const run = await runPlanned(
      `const plan = [{ name: 'demo', vars: { APP_ID: 'app' }, steps: [
        { action: 'make a link', run: () => ({ LINK: 'expo-boilerplate://auth/link?token=a&email=b' }) },
        { file: 'cold-start.yaml' },
      ] }]`,
      maestro.dir
    )
    expect(run.code).toBe(0)
    expect(maestro.calls()).toEqual([
      [
        'test',
        '--test-output-dir',
        path.join(repoRoot, 'maestro-output/demo/cold-start'),
        '-e',
        'APP_ID=app',
        '-e',
        'LINK=expo-boilerplate://auth/link?token=a&email=b',
        path.join(FLOWS, 'cold-start.yaml'),
      ],
    ])
  })

  it('runs cleanup after a failed step, and stops before the next flow', async () => {
    const maestro = fakeMaestro(0)
    const run = await runPlanned(
      `const plan = [
        { name: 'first', vars: {}, steps: [{ action: 'break', run: () => { throw new Error('boom') } }, { file: 'cold-start.yaml' }], cleanup: () => log('cleaned') },
        { name: 'second', vars: {}, steps: [{ action: 'never', run: () => log('second ran') }] },
      ]`,
      maestro.dir
    )
    expect(run.code).toBe(1)
    expect(run.lines).toEqual(['cleaned'])
    expect(run.stderr).toContain('e2e: first failed: break: boom')
    expect(run.stderr).toContain('e2e: second not run')
    expect(run.stdout).not.toContain('passed')
    expect(maestro.calls()).toEqual([])
  })

  it('fails a flow whose steps passed when its cleanup fails', async () => {
    const maestro = fakeMaestro(0)
    const run = await runPlanned(
      `const plan = [{ name: 'only', vars: {}, steps: [{ action: 'pass', run: () => ({}) }], cleanup: () => { throw new Error('still on') } }]`,
      maestro.dir
    )
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('e2e: only failed: cleanup: still on')
  })

  it('names before in a failure of before, and still runs cleanup', async () => {
    const maestro = fakeMaestro(0)
    const run = await runPlanned(
      `const plan = [{ name: 'only', vars: {}, before: () => { throw new Error('no account') }, steps: [{ file: 'cold-start.yaml' }], cleanup: () => log('cleaned') }]`,
      maestro.dir
    )
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('e2e: only failed: before: no account')
    expect(run.lines).toEqual(['cleaned'])
    expect(maestro.calls()).toEqual([])
  })
})

describe('forced-update restart', () => {
  /**
   * Start a fake express whose client settings serve the Android minimum
   * held in `stateFile`; an empty file serves `null`.
   * @param stateFile - The file the restart command writes.
   * @returns Its origin.
   */
  async function fakeExpress(stateFile: string): Promise<string> {
    const server = http.createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (request.url === '/health') {
        response.end('{}')
        return
      }
      if (request.url === '/api/v1/status/client-settings') {
        const android = fs.readFileSync(stateFile, 'utf8').trim() || null
        response.end(JSON.stringify({ data: { minimumAppVersion: { ios: null, android } } }))
        return
      }
      response.statusCode = 404
      response.end('{}')
    })
    servers.push(server)
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  }

  /**
   * Run forced-update's restart step and its cleanup with a fake express and
   * a restart command, through the `env` that `planFlows` receives.
   * @param command - The restart command; `$STATE` and `$SEEN` name two files.
   * @param initial - What the state file holds before the step.
   * @returns The step's and the cleanup's error messages, and what the command recorded.
   */
  async function restartWith(command: string, initial: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'restart-'))
    made.push(dir)
    const state = path.join(dir, 'state')
    const seen = path.join(dir, 'seen')
    fs.writeFileSync(state, initial)
    const api = await fakeExpress(state)
    const env = {
      E2E_API_URL: api,
      E2E_API_RESTART_CMD: command,
      E2E_RESTART_TIMEOUT_MS: '1000',
      E2E_RUN_ID: RUN_ID,
      STATE: state,
      SEEN: seen,
      PLAN_MARKER: 'from-plan-env',
    }
    const code = `
      import { planFlows } from ${JSON.stringify(SCRIPT)}
      const entry = planFlows('android', { ...process.env, ...${JSON.stringify(env)} }).find((e) => e.name === 'forced-update')
      const result = {}
      try { await entry.steps[0].run({}) } catch (error) { result.step = error.message }
      try { await entry.cleanup({}) } catch (error) { result.cleanup = error.message }
      console.log(JSON.stringify(result))
    `
    const run = await node(['--input-type=module', '-e', code], process.env)
    const result = JSON.parse(run.stdout) as { step?: string; cleanup?: string }
    return { ...result, seen: fs.existsSync(seen) ? fs.readFileSync(seen, 'utf8') : '', api }
  }

  /** A restart command that serves the minimum it is given and records it with the marker. */
  const RESTART =
    'printf "%s" "$MINIMUM_APP_VERSION_ANDROID" > "$STATE"; printf "%s|%s;" "$MINIMUM_APP_VERSION_ANDROID" "$PLAN_MARKER" >> "$SEEN"'

  it('waits for express to serve 99.0.0, then for no minimum after the cleanup', async () => {
    const result = await restartWith(RESTART, '')
    expect(result.step).toBeUndefined()
    expect(result.cleanup).toBeUndefined()
    expect(result.seen).toBe('99.0.0|from-plan-env;|from-plan-env;')
  })

  it('fails naming the wait when express keeps serving no minimum', async () => {
    const result = await restartWith('true', '')
    expect(result.step).toBe(
      `express did not serve minimumAppVersion.android 99.0.0 at ${result.api}/api/v1/status/client-settings within 1 s; it served none`
    )
  })

  it('fails the cleanup when express keeps serving 99.0.0', async () => {
    const result = await restartWith('true', '99.0.0')
    expect(result.cleanup).toBe(
      `express did not serve minimumAppVersion.android none at ${result.api}/api/v1/status/client-settings within 1 s; it served 99.0.0`
    )
  })
})

describe('transport failures', () => {
  /** A plan of two flows, each one Maestro file; `second` may fail in a helper instead. */
  const twoFlows = (secondSteps: string) => `const plan = [
    { name: 'first', vars: {}, steps: [{ file: 'cold-start.yaml' }] },
    { name: 'second', vars: {}, steps: [${secondSteps}] },
  ]`

  /**
   * Run a plan with the scripted `maestro` and a fresh output directory.
   * @param body - JavaScript that builds `plan`.
   * @param maestroDir - The fake `maestro`'s directory.
   * @returns The exit code, the output directory and the transport note, if any.
   */
  async function runWith(body: string, maestroDir: string) {
    const out = outputDir()
    const code = `
      import { runPlan } from ${JSON.stringify(SCRIPT)}
      ${body}
      process.exitCode = await runPlan(plan)
    `
    const run = await node(
      ['--input-type=module', '-e', code],
      runnerEnv(maestroDir, { E2E_OUTPUT_DIR: out })
    )
    const notePath = path.join(out, 'transport-failure.txt')
    const note = fs.existsSync(notePath) ? fs.readFileSync(notePath, 'utf8') : null
    return { ...run, out, note }
  }

  it('exits 75 when the failed run prints a dropped adb connection', async () => {
    const maestro = scriptedMaestro(
      `process.stderr.write('maestro.android.DeviceServerDiedException: Device server died\\n')`,
      1
    )
    const run = await runWith(
      `const plan = [{ name: 'only', vars: {}, steps: [{ file: 'cold-start.yaml' }] }]`,
      maestro
    )
    expect(run.code).toBe(75)
    expect(run.stderr).toContain(
      'e2e: only failed: maestro test cold-start.yaml exited 1 (the adb connection dropped)'
    )
    expect(run.note).toBe('only: the adb connection dropped\n')
  })

  it("exits 75 when the failed run's maestro.log shows a driver that did not start", async () => {
    const maestro = scriptedMaestro(
      `fs.mkdirSync(path.join(outputDir, 'run', 'logs'), { recursive: true })
       fs.writeFileSync(path.join(outputDir, 'run', 'logs', 'maestro.log'), 'maestro.MaestroDriverStartupException$AndroidDriverTimeoutException')`,
      1
    )
    const run = await runWith(
      `const plan = [{ name: 'only', vars: {}, steps: [{ file: 'cold-start.yaml' }] }]`,
      maestro
    )
    expect(run.code).toBe(75)
    expect(run.note).toBe("only: Maestro's driver did not start\n")
  })

  // Class names from Maestro 2.11.0's jars: maestro-ios-driver (LocalXCTestInstaller) and maestro-client.
  it.each([
    [
      'xcuitest.installer.LocalXCTestInstaller$IOSDriverTimeoutException: iOS driver not ready in time',
      "Maestro's driver did not start",
    ],
    [
      'maestro.MaestroException$IOSDeviceDriverSetupException: Failed to build iOS driver for connected iOS device.',
      "Maestro's driver did not start",
    ],
    [
      'maestro.DeviceUnreachableException: Device unreachable while processing tap',
      "the simulator's XCTest driver stopped answering",
    ],
  ])("exits 75 when the failed run's maestro.log shows %s", async (line, reason) => {
    const maestro = scriptedMaestro(
      `fs.mkdirSync(path.join(outputDir, 'run', 'logs'), { recursive: true })
       fs.writeFileSync(path.join(outputDir, 'run', 'logs', 'maestro.log'), ${JSON.stringify(line)})`,
      1
    )
    const run = await runWith(
      `const plan = [{ name: 'only', vars: {}, steps: [{ file: 'cold-start.yaml' }] }]`,
      maestro
    )
    expect(run.code).toBe(75)
    expect(run.note).toBe(`only: ${reason}\n`)
  })

  it('exits 1 when an iOS UI query times out on a busy app', async () => {
    const maestro = scriptedMaestro(
      `process.stderr.write('Timed out while evaluating UI query. Unable to perform work on main run loop, process main thread busy\\n')`,
      1
    )
    const run = await runWith(
      `const plan = [{ name: 'only', vars: {}, steps: [{ file: 'cold-start.yaml' }] }]`,
      maestro
    )
    expect(run.code).toBe(1)
    expect(run.note).toBeNull()
  })

  it('exits 1 when only the device logcat mentions a dropped connection', async () => {
    const maestro = scriptedMaestro(
      `fs.mkdirSync(path.join(outputDir, 'run', 'logs'), { recursive: true })
       fs.writeFileSync(path.join(outputDir, 'run', 'logs', 'device-logcat.txt'), 'adbd: host-17: offline device offline')`,
      1
    )
    const run = await runWith(
      `const plan = [{ name: 'only', vars: {}, steps: [{ file: 'cold-start.yaml' }] }]`,
      maestro
    )
    expect(run.code).toBe(1)
    expect(run.note).toBeNull()
  })

  it('exits 1 when an earlier flow that passed logged a dropped connection', async () => {
    // Every run logs the drop; only the second flow's run fails.
    const maestro = scriptedMaestro(
      `fs.mkdirSync(path.join(outputDir, 'logs'), { recursive: true })
       fs.writeFileSync(path.join(outputDir, 'logs', 'maestro.log'), outputDir.includes('first') ? 'device offline, then reconnected' : 'Element not found: Sign in')
       if (!outputDir.includes('first')) process.exit(1)`,
      0
    )
    const run = await runWith(twoFlows(`{ file: 'cold-start.yaml' }`), maestro)
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('e2e: second failed: maestro test cold-start.yaml exited 1')
    expect(run.stderr).not.toContain('adb connection dropped')
  })

  it('exits 1 when a helper fails after an earlier run logged a dropped connection', async () => {
    const maestro = scriptedMaestro(
      `fs.mkdirSync(path.join(outputDir, 'logs'), { recursive: true })
       fs.writeFileSync(path.join(outputDir, 'logs', 'maestro.log'), 'DeviceServerDiedException')`,
      0
    )
    const run = await runWith(
      twoFlows(`{ action: 'read the sign-in link', run: () => { throw new Error('no mail') } }`),
      maestro
    )
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('e2e: second failed: read the sign-in link: no mail')
    expect(run.note).toBeNull()
  })

  it('exits 1 when a transport failure is followed by a failed cleanup', async () => {
    const maestro = scriptedMaestro(`process.stderr.write('device offline\\n')`, 1)
    const run = await runWith(
      `const plan = [{ name: 'only', vars: {}, steps: [{ file: 'cold-start.yaml' }], cleanup: () => { throw new Error('still on') } }]`,
      maestro
    )
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('e2e: only failed: cleanup: still on')
    expect(run.note).toBeNull()
  })

  it('exits 75 from the command line on a transport failure', async () => {
    const maestro = scriptedMaestro(`process.stderr.write('device offline\\n')`, 1)
    const mailpit = await emptyMailpit()
    const out = outputDir()
    const run = await node(
      [SCRIPT, 'android'],
      runnerEnv(maestro, { E2E_MAILPIT_URL: mailpit, E2E_OUTPUT_DIR: out })
    )
    expect(run.code).toBe(75)
    expect(fs.readFileSync(path.join(out, 'transport-failure.txt'), 'utf8')).toBe(
      'sign-in: the adb connection dropped\n'
    )
  })
})

describe('e2e-run', () => {
  it('exits 1 and names the flow when maestro exits 1', async () => {
    const maestro = fakeMaestro(1)
    const mailpit = await emptyMailpit()
    const run = await node(
      [SCRIPT, 'android'],
      runnerEnv(maestro.dir, { E2E_MAILPIT_URL: mailpit })
    )
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('e2e: sign-in failed: maestro test sign-in.yaml exited 1')
    expect(run.stderr).toContain('e2e: forced-update not run')
    expect(maestro.calls()).toHaveLength(1)
  })

  it('exits 1 on a missing link before Maestro opens it', async () => {
    const maestro = fakeMaestro(0)
    const mailpit = await emptyMailpit()
    const run = await node(
      [SCRIPT, 'android'],
      runnerEnv(maestro.dir, { E2E_MAILPIT_URL: mailpit, E2E_LINK_TIMEOUT_MS: '1000' })
    )
    expect(run.code).toBe(1)
    expect(run.stderr).toContain(
      `e2e: sign-in failed: read the sign-in link: no /auth/link mail reached e2e+sign-in-${RUN_ID}@example.test in 1 s`
    )
    expect(maestro.calls().map((args) => path.basename(args.at(-1) ?? ''))).toEqual([
      'sign-in.yaml',
    ])
  })

  it('exits 1 before Maestro runs when the first helper fails', async () => {
    const maestro = fakeMaestro(0)
    const run = await node([SCRIPT, 'android'], runnerEnv(maestro.dir, {}))
    expect(run.code).toBe(1)
    expect(run.stderr).toContain('e2e: sign-in failed: snapshot the mail: Mailpit request to')
    expect(maestro.calls()).toEqual([])
  })

  it.each([
    [['web'], {}, 'usage: node scripts/e2e-run.mjs <android|ios>'],
    [['android'], { E2E_RUN_ID: '' }, 'set E2E_RUN_ID'],
    [['android'], { E2E_RUN_ID: 'Run 1' }, 'E2E_RUN_ID must hold only lowercase letters'],
    [['android'], { E2E_LINK_TIMEOUT_MS: 'soon' }, 'E2E_LINK_TIMEOUT_MS must be a positive number'],
    [['android'], { E2E_LINK_TIMEOUT_MS: '0' }, 'E2E_LINK_TIMEOUT_MS must be a positive number'],
    [
      ['android'],
      { E2E_RESTART_TIMEOUT_MS: '-1' },
      'E2E_RESTART_TIMEOUT_MS must be a positive number',
    ],
  ])('exits 1 for arguments %j and %j', async (args, overrides, message) => {
    const maestro = fakeMaestro(0)
    const run = await node([SCRIPT, ...args], runnerEnv(maestro.dir, overrides))
    expect(run.code).toBe(1)
    expect(run.stderr).toContain(message)
    expect(maestro.calls()).toEqual([])
  })
})
