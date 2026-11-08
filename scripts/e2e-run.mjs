import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createWorkspace, invite, signIn, workspaceSlug } from '../e2e/helpers/api.mjs'
import { appLink } from '../e2e/helpers/links.mjs'
import { latestLink, messageIds } from '../e2e/helpers/mailpit.mjs'
import { setMaintenance } from '../e2e/helpers/maintenance.mjs'

/** The repository root. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Where the Maestro flows live. */
const FLOWS_DIR = path.join(ROOT, 'e2e/flows')

/** Where each Maestro run writes its screenshots, logs and `commands.json`. */
const OUTPUT_DIR = path.join(ROOT, 'maestro-output')

/** The platforms the runner drives. */
const PLATFORMS = ['android', 'ios']

/** The app ID of the e2e build, used when `E2E_APP_ID` is unset. */
const DEFAULT_APP_ID = 'com.mahaverick.expoboilerplate.e2e'

/** The environment the runner needs; `E2E_APP_ID` has a default. */
const REQUIRED_ENV = [
  'E2E_API_URL',
  'E2E_MAILPIT_URL',
  'DATABASE_URL',
  'REDIS_URL',
  'E2E_API_RESTART_CMD',
  'E2E_RUN_ID',
]

/** The path prefix of an emailed sign-in link. */
const SIGN_IN_PATH = '/auth/link'

/** The path prefix of an emailed invitation link. */
const INVITATION_PATH = '/invitations/accept'

/** The message the maintenance flow sets and then looks for. */
const MAINTENANCE_MESSAGE = 'E2E maintenance check'

/** The minimum version the forced-update flow makes express require. */
const FORCED_MINIMUM = '99.0.0'

/** How long a mail or a restarted express may take, unless the environment says otherwise. */
const DEFAULT_TIMEOUT_MS = 60_000

/** The settings that hold a wait in milliseconds; each must be a positive number. */
const TIMEOUT_ENV = ['E2E_LINK_TIMEOUT_MS', 'E2E_RESTART_TIMEOUT_MS']

/** Express's client settings, which carry `minimumAppVersion`. */
const CLIENT_SETTINGS_PATH = '/api/v1/status/client-settings'

/**
 * The fresh address of one flow's account.
 * @param flow - The flow, or another name for a second account in it.
 * @param runId - `E2E_RUN_ID`.
 * @returns `e2e+<flow>-<run id>@example.test`.
 */
function address(flow, runId) {
  return `e2e+${flow}-${runId}@example.test`
}

/**
 * The express variable that holds the platform's minimum app version.
 * @param platform - `android` or `ios`.
 * @returns `MINIMUM_APP_VERSION_ANDROID` or `MINIMUM_APP_VERSION_IOS`.
 */
function minimumVariable(platform) {
  return `MINIMUM_APP_VERSION_${platform.toUpperCase()}`
}

/**
 * A wait in milliseconds from the environment.
 * @param value - The variable's text, if set.
 * @returns The number, or `DEFAULT_TIMEOUT_MS` when unset; `main` refuses one that is not positive.
 */
function timeoutFrom(value) {
  return value ? Number(value) : DEFAULT_TIMEOUT_MS
}

/**
 * The runner's settings, read from the environment.
 * @param env - The environment.
 * @returns The settings; a missing one is an empty string, which `main` refuses before any run.
 */
function settingsFrom(env) {
  return {
    env,
    api: env.E2E_API_URL ?? '',
    mailpit: env.E2E_MAILPIT_URL ?? '',
    databaseUrl: env.DATABASE_URL ?? '',
    redisUrl: env.REDIS_URL ?? '',
    appId: env.E2E_APP_ID || DEFAULT_APP_ID,
    restartCmd: env.E2E_API_RESTART_CMD ?? '',
    runId: env.E2E_RUN_ID ?? '',
    linkTimeoutMs: timeoutFrom(env.E2E_LINK_TIMEOUT_MS),
    restartTimeoutMs: timeoutFrom(env.E2E_RESTART_TIMEOUT_MS),
  }
}

/**
 * The steps that sign `EMAIL` in through the app: snapshot the address's mail,
 * run `<flow>.yaml` (which starts the app signed out and asks for a link), read
 * the new link, then run `<flow>-link.yaml`, which opens it.
 * @param flow - The flow's name.
 * @param settings - The runner's settings.
 * @returns The steps.
 */
function appSignInSteps(flow, settings) {
  return [
    {
      action: 'snapshot the mail',
      run: async (vars) => ({ MAIL_BEFORE: await messageIds(settings.mailpit, vars.EMAIL) }),
    },
    { file: `${flow}.yaml` },
    {
      action: 'read the sign-in link',
      run: async (vars) => ({
        LINK: appLink(
          await latestLink(
            settings.mailpit,
            vars.EMAIL,
            SIGN_IN_PATH,
            settings.linkTimeoutMs,
            vars.MAIL_BEFORE
          )
        ),
      }),
    },
    { file: `${flow}-link.yaml` },
  ]
}

/**
 * The minimum version express now serves for a platform, or `null` when it
 * serves none or cannot be read.
 * @param url - The client settings URL.
 * @param platform - `android` or `ios`.
 * @returns The version, or `null`.
 */
async function servedMinimum(url, platform) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return null
    const body = await response.json()
    return body?.data?.minimumAppVersion?.[platform] || null
  } catch {
    return null
  }
}

/**
 * Run `E2E_API_RESTART_CMD` in a shell, with the environment `planFlows` was
 * given, then wait until the restarted express serves the expected minimum.
 * Express answering is not enough: the old process may still be up, so the
 * wait reads the client settings until they show the new configuration.
 * @param settings - The runner's settings.
 * @param platform - `android` or `ios`.
 * @param overrides - Variables to set on the command; `undefined` removes one.
 * @param expected - The minimum the platform must then have, or `null` for none.
 * @returns Resolves once express serves `expected`.
 * @throws When the command exits non-zero, or express does not serve `expected` within `E2E_RESTART_TIMEOUT_MS`.
 */
async function restartApi(settings, platform, overrides, expected) {
  const env = { ...settings.env }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn(settings.restartCmd, { shell: true, stdio: 'inherit', env })
    child.on('error', reject)
    child.on('exit', (exitCode) => resolve(exitCode))
  })
  if (code !== 0) throw new Error(`E2E_API_RESTART_CMD exited ${code}`)
  const url = new URL(CLIENT_SETTINGS_PATH, settings.api).href
  const deadline = Date.now() + settings.restartTimeoutMs
  for (;;) {
    const served = await servedMinimum(url, platform)
    if (served === expected) return
    if (Date.now() + 1000 > deadline) {
      throw new Error(
        `express did not serve minimumAppVersion.${platform} ${expected ?? 'none'} at ${url} within ${settings.restartTimeoutMs / 1000} s; it served ${served ?? 'none'}`
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

/**
 * The flows, in the order they run. Each entry is `{ name, vars, before?,
 * steps, cleanup? }`:
 * - `vars` are the Maestro variables the flow starts with;
 * - `before(vars)` and each action step's `run(vars)` return more variables;
 * - a `file` step runs `maestro test` on `e2e/flows/<file>` with every variable;
 * - `cleanup(vars)` runs after the steps, even when one failed.
 * @param platform - `android` or `ios`.
 * @param env - The environment; see `main`.
 * @returns The plan.
 */
export function planFlows(platform, env = process.env) {
  const settings = settingsFrom(env)
  const { runId } = settings
  const base = { APP_ID: settings.appId }
  const minimum = minimumVariable(platform)
  const owner = address('accept-invitation-owner', runId)
  const invitedName = `E2E Invite ${runId}`
  const nameA = `E2E A ${runId}`
  const nameB = `E2E B ${runId}`
  const firstName = `E2E ${runId}`
  return [
    {
      name: 'sign-in',
      vars: { ...base, EMAIL: address('sign-in', runId) },
      steps: appSignInSteps('sign-in', settings),
    },
    {
      name: 'cold-start',
      vars: { ...base },
      steps: [{ file: 'cold-start.yaml' }],
    },
    {
      name: 'first-workspace',
      vars: {
        ...base,
        EMAIL: address('first-workspace', runId),
        WORKSPACE: firstName,
        SLUG: workspaceSlug(firstName),
      },
      steps: appSignInSteps('first-workspace', settings),
    },
    {
      name: 'switch-workspace',
      vars: { ...base, EMAIL: address('switch-workspace', runId) },
      before: async (vars) => {
        const { accessToken } = await signIn(settings.api, settings.mailpit, vars.EMAIL)
        const a = await createWorkspace(settings.api, accessToken, nameA)
        const b = await createWorkspace(settings.api, accessToken, nameB)
        return {
          WORKSPACE_A: nameA,
          WORKSPACE_B: nameB,
          ROW_A: `${nameA}, /${a.slug}`,
          ROW_B: `${nameB}, /${b.slug}`,
        }
      },
      steps: appSignInSteps('switch-workspace', settings),
    },
    {
      name: 'accept-invitation',
      vars: { ...base, EMAIL: address('accept-invitation', runId), WORKSPACE: invitedName },
      before: async (vars) => {
        const { accessToken } = await signIn(settings.api, settings.mailpit, owner)
        const { slug } = await createWorkspace(settings.api, accessToken, invitedName)
        const before = await messageIds(settings.mailpit, vars.EMAIL)
        await invite(settings.api, accessToken, slug, vars.EMAIL)
        const link = await latestLink(
          settings.mailpit,
          vars.EMAIL,
          INVITATION_PATH,
          settings.linkTimeoutMs,
          before
        )
        return { INVITE_LINK: appLink(link) }
      },
      steps: appSignInSteps('accept-invitation', settings),
    },
    {
      name: 'maintenance',
      vars: { ...base, MESSAGE: MAINTENANCE_MESSAGE },
      steps: [
        {
          action: 'set maintenance full',
          run: () =>
            setMaintenance(settings.databaseUrl, settings.redisUrl, 'full', MAINTENANCE_MESSAGE),
        },
        { file: 'maintenance.yaml' },
        {
          action: 'set maintenance off',
          run: () => setMaintenance(settings.databaseUrl, settings.redisUrl, 'off'),
        },
        { file: 'maintenance-off.yaml' },
      ],
      cleanup: () => setMaintenance(settings.databaseUrl, settings.redisUrl, 'off'),
    },
    {
      name: 'forced-update',
      vars: { ...base },
      steps: [
        {
          action: `restart express with ${minimum}=${FORCED_MINIMUM}`,
          run: () => restartApi(settings, platform, { [minimum]: FORCED_MINIMUM }, FORCED_MINIMUM),
        },
        { file: 'forced-update.yaml' },
      ],
      cleanup: () =>
        restartApi(
          settings,
          platform,
          { MINIMUM_APP_VERSION_ANDROID: undefined, MINIMUM_APP_VERSION_IOS: undefined },
          null
        ),
    },
  ]
}

/**
 * Run `maestro test` on one flow file, with every variable as `-e KEY=value`
 * and its output under `maestro-output/<flow>/<file name>/`. No shell runs, so
 * a link's `&` stays literal.
 * @param flow - The flow's name.
 * @param file - The file under `e2e/flows/`.
 * @param vars - The variables; a non-string becomes JSON.
 * @returns Resolves when Maestro exits 0.
 * @throws When Maestro exits non-zero or cannot start.
 */
async function runMaestro(flow, file, vars) {
  const output = path.join(OUTPUT_DIR, flow, path.basename(file, '.yaml'))
  const args = ['test', '--test-output-dir', output]
  for (const [key, value] of Object.entries(vars)) {
    args.push('-e', `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
  }
  args.push(path.join(FLOWS_DIR, file))
  const code = await new Promise((resolve, reject) => {
    const child = spawn('maestro', args, { stdio: 'inherit' })
    child.on('error', (error) => reject(new Error(`maestro did not start: ${error.message}`)))
    child.on('exit', (exitCode) => resolve(exitCode))
  })
  if (code !== 0) throw new Error(`maestro test ${file} exited ${code}`)
}

/**
 * Run one flow: `before`, then each step in order, then `cleanup`, which runs
 * even when a step or `before` failed. Each error names where it happened.
 * @param entry - The plan entry.
 * @returns The errors, step first and cleanup second; empty when the flow passed.
 */
async function runFlow(entry) {
  const vars = { ...entry.vars }
  const errors = []
  try {
    if (entry.before) {
      try {
        Object.assign(vars, await entry.before(vars))
      } catch (error) {
        throw new Error(`before: ${error.message}`, { cause: error })
      }
    }
    for (const step of entry.steps) {
      if (step.file) {
        await runMaestro(entry.name, step.file, vars)
      } else {
        try {
          Object.assign(vars, await step.run(vars))
        } catch (error) {
          throw new Error(`${step.action}: ${error.message}`, { cause: error })
        }
      }
    }
  } catch (error) {
    errors.push(error)
  } finally {
    if (entry.cleanup) {
      try {
        await entry.cleanup(vars)
      } catch (error) {
        errors.push(new Error(`cleanup: ${error.message}`, { cause: error }))
      }
    }
  }
  return errors
}

/**
 * Run the plan in order and stop at the first flow that fails. Each result
 * prints as `e2e: <flow> passed` or `e2e: <flow> failed: <reason>`, and the
 * flows after a failure print as `not run`, never as passed.
 * @param plan - The entries `planFlows` returns.
 * @returns True when every flow passed.
 */
export async function runPlan(plan) {
  for (const [index, entry] of plan.entries()) {
    const errors = await runFlow(entry)
    if (errors.length === 0) {
      console.log(`e2e: ${entry.name} passed`)
      continue
    }
    for (const error of errors) console.error(`e2e: ${entry.name} failed: ${error.message}`)
    for (const skipped of plan.slice(index + 1)) console.error(`e2e: ${skipped.name} not run`)
    return false
  }
  return true
}

/**
 * Run `node scripts/e2e-run.mjs <android|ios>` with the app installed on one
 * booted device and Maestro on `PATH`. It exits 1 on a bad argument, a
 * missing variable or the first failing flow.
 *
 * Environment:
 * - `E2E_API_URL`: express's origin, for the helpers.
 * - `E2E_MAILPIT_URL`: Mailpit's origin.
 * - `DATABASE_URL`, `REDIS_URL`: express's stores, for the maintenance helper,
 *   which also reads `E2E_PSQL`, `E2E_REDIS_CLI` and `E2E_REDIS_KEY_PREFIX`.
 * - `E2E_APP_ID`: the e2e build's app ID. Default `com.mahaverick.expoboilerplate.e2e`.
 * - `E2E_API_RESTART_CMD`: a shell command that restarts express with the
 *   environment it is given. The forced-update flow runs it with
 *   `MINIMUM_APP_VERSION_<PLATFORM>=99.0.0`, then again with both
 *   `MINIMUM_APP_VERSION_*` removed. After each run the runner reads
 *   `/api/v1/status/client-settings` until the platform's minimum is 99.0.0,
 *   then until it is none.
 * - `E2E_RUN_ID`: lowercase letters, digits and hyphens; it makes every address,
 *   workspace name and slug unique.
 * - `E2E_LINK_TIMEOUT_MS`: how long to wait for a mail. Default 60000.
 * - `E2E_RESTART_TIMEOUT_MS`: how long a restarted express may take to serve
 *   the expected minimum. Default 60000.
 *
 * Express must run with `SIGN_IN_LINK_MAIL_COOLDOWN=1s`: switch-workspace
 * signs one address in twice, through the API and then the app, and the
 * default cooldown (1m) mails nothing the second time. The link wait then
 * fails with a message naming the address. Express's `WEB_URL` must be https,
 * since the app link is made from the mailed https link.
 */
async function main() {
  const platform = process.argv[2]
  if (!PLATFORMS.includes(platform ?? '')) {
    console.error('e2e: usage: node scripts/e2e-run.mjs <android|ios>')
    process.exitCode = 1
    return
  }
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  if (missing.length > 0) {
    console.error(`e2e: set ${missing.join(', ')}`)
    process.exitCode = 1
    return
  }
  if (!/^[a-z0-9-]+$/.test(process.env.E2E_RUN_ID ?? '')) {
    console.error('e2e: E2E_RUN_ID must hold only lowercase letters, digits and hyphens')
    process.exitCode = 1
    return
  }
  const badTimeout = TIMEOUT_ENV.find((key) => {
    const value = process.env[key]
    return Boolean(value) && !(Number.isFinite(Number(value)) && Number(value) > 0)
  })
  if (badTimeout) {
    console.error(`e2e: ${badTimeout} must be a positive number of milliseconds`)
    process.exitCode = 1
    return
  }
  if (!(await runPlan(planFlows(platform)))) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
