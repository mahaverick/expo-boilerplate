import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** The modes express's `maintenance_mode_state` accepts. */
const MODES = ['off', 'read_only', 'full']

/** The message a mode other than `off` needs when the caller gives none; the table requires one. */
const DEFAULT_MESSAGE = 'Down for maintenance.'

/**
 * The statement that changes the mode, with `psql` variables filled by `-v`
 * and quoted by `:'name'`, so the message never reaches the SQL as text.
 */
const UPDATE_SQL =
  "UPDATE maintenance_mode_state SET mode = :'mode', message = NULLIF(:'message', ''), changed_at = now(), version = version + 1 WHERE id = 1 RETURNING id;\n"

/**
 * Split a tool setting into its command and leading arguments on whitespace.
 * @param setting - e.g. `psql` or `docker compose -f ../express/docker-compose.yml exec -T postgres psql`.
 * @returns What to pass to `execFile`.
 */
function splitCommand(setting) {
  const [file = '', ...args] = setting.trim().split(/\s+/)
  return { file, args }
}

/**
 * Run a tool without a shell, feeding it standard input.
 * @param setting - The tool setting, see `splitCommand`.
 * @param args - Arguments that follow the setting's own.
 * @param [input] - Text for standard input.
 * @returns Standard output.
 * @throws With the tool's standard error when it fails.
 */
function run(setting, args, input = '') {
  const { file, args: leading } = splitCommand(setting)
  return new Promise((resolve, reject) => {
    const child = execFile(file, [...leading, ...args], (error, stdout, stderr) => {
      if (error) reject(new Error(`${file} failed: ${stderr.trim() || error.message}`))
      else resolve(stdout)
    })
    child.stdin?.end(input)
  })
}

/**
 * Change express's maintenance mode: update the single `maintenance_mode_state`
 * row, then publish `reload` on `<REDIS_KEY_PREFIX>:maintenance-mode` so every
 * replica rereads it. The tools run with `execFile` and separate arguments.
 *
 * Environment:
 * - `E2E_PSQL`: the `psql` command, with optional leading arguments split on
 *   whitespace. Default `psql`. Set `docker compose -f ../express/docker-compose.yml exec -T postgres psql`
 *   when the host has no `psql`; then `databaseUrl` must work inside that container.
 * - `E2E_REDIS_CLI`: the `redis-cli` command, set the same way. Default `redis-cli`.
 * - `E2E_REDIS_KEY_PREFIX`: express's `REDIS_KEY_PREFIX`. Default `express-boilerplate`.
 * @param databaseUrl - Postgres connection URL.
 * @param redisUrl - Redis connection URL.
 * @param mode - The mode to set.
 * @param [message] - The notice; a mode other than `off` needs one, and gets a default.
 * @returns Resolves once the row is updated and the reload is published.
 */
export async function setMaintenance(databaseUrl, redisUrl, mode, message) {
  if (!MODES.includes(mode)) throw new Error(`mode must be one of ${MODES.join(', ')}, got ${mode}`)
  const env = process.env
  const prefix = env.E2E_REDIS_KEY_PREFIX ?? 'express-boilerplate'
  const text = message ?? (mode === 'off' ? '' : DEFAULT_MESSAGE)
  const updated = await run(
    env.E2E_PSQL ?? 'psql',
    [
      '-X',
      '-q',
      '-t',
      '-A',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      `mode=${mode}`,
      '-v',
      `message=${text}`,
      '-f',
      '-',
      databaseUrl,
    ],
    UPDATE_SQL
  )
  if (updated.trim() !== '1') {
    throw new Error('maintenance_mode_state has no row with id 1: nothing was changed or published')
  }
  const channel = `${prefix}:maintenance-mode`
  const reply = await run(env.E2E_REDIS_CLI ?? 'redis-cli', [
    '-u',
    redisUrl,
    'PUBLISH',
    channel,
    'reload',
  ])
  // redis-cli can exit 0 on an error reply.
  if (!/^\d+\s*$/.test(reply)) throw new Error(`redis-cli PUBLISH failed: ${reply.trim()}`)
  if (Number(reply) === 0) {
    throw new Error(
      `the row changed, but no express is listening on ${channel}: check E2E_REDIS_KEY_PREFIX and the Redis URL`
    )
  }
}

/**
 * Run `set <databaseUrl> <redisUrl> <mode> [message]`. Any failure prints a
 * message to stderr and sets exit code 1.
 */
async function main() {
  const [command, databaseUrl, redisUrl, mode, message] = process.argv.slice(2)
  try {
    if (command !== 'set' || !mode) {
      throw new Error(
        'usage: maintenance.mjs set <databaseUrl> <redisUrl> off|read_only|full [message]'
      )
    }
    await setMaintenance(databaseUrl, redisUrl, mode, message)
    console.log('ok')
  } catch (error) {
    console.error(`maintenance: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
