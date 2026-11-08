import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, repoRoot } from '@/tests/support/runner'

const execFileAsync = promisify(execFile)

/** The module under test. */
const MODULE = path.join(repoRoot, 'e2e/helpers/maintenance.mjs')

/** Temporary directories made by a test, removed after it. */
const made: string[] = []

afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

/**
 * Make a stand-in for a tool: a Node script that records its arguments and
 * standard input as JSON and prints a reply.
 * @param dir - Where to write it.
 * @param name - The file name, which also names its log.
 * @param reply - What it prints and the exit code.
 * @returns The script's path and its log's path.
 */
function fakeTool(dir: string, name: string, reply: { out: string; code: number }) {
  const script = path.join(dir, name)
  const log = `${script}.json`
  fs.writeFileSync(
    script,
    `const fs = require('node:fs')
const input = fs.readFileSync(0, 'utf8')
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args: process.argv.slice(2), input }))
process.stdout.write(${JSON.stringify(reply.out)})
process.exit(${reply.code})
`
  )
  return { script, log }
}

/**
 * Run `maintenance.mjs set` with stand-in tools.
 * @param psqlReply - What the stand-in `psql` prints and its exit code.
 * @param redisReply - The same for `redis-cli`.
 * @param extraEnv - More environment for the child.
 * @param args - The arguments after `set`.
 * @returns The run's result and the recorded calls.
 */
async function runSet(
  psqlReply: { out: string; code: number },
  redisReply: { out: string; code: number },
  extraEnv: Record<string, string>,
  ...args: string[]
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maintenance-'))
  made.push(dir)
  const psql = fakeTool(dir, 'psql.cjs', psqlReply)
  const redis = fakeTool(dir, 'redis.cjs', redisReply)
  /** The call a stand-in recorded, or undefined when it never ran. */
  const read = (file: string) =>
    fs.existsSync(file)
      ? (JSON.parse(fs.readFileSync(file, 'utf8')) as { args: string[]; input: string })
      : undefined
  const result = await execFileAsync(process.execPath, [MODULE, 'set', ...args], {
    env: {
      ...process.env,
      E2E_PSQL: `${process.execPath} ${psql.script} lead-a lead-b`,
      E2E_REDIS_CLI: `${process.execPath} ${redis.script}`,
      ...extraEnv,
    },
  }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    (error: { code: number; stdout: string; stderr: string }) => error
  )
  return { result, psql: read(psql.log), redis: read(redis.log) }
}

describe('setMaintenance', () => {
  it('updates the row with quoted variables, then publishes reload, without a shell', async () => {
    const { result, psql, redis } = await runSet(
      { out: '', code: 0 },
      { out: '1\n', code: 0 },
      {},
      'postgres://db/x',
      'redis://cache:6379',
      'read_only',
      "Back at 5; it's 'quoted'"
    )

    expect(result.code).toBe(0)
    expect(psql?.args).toEqual([
      'lead-a',
      'lead-b',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'mode=read_only',
      '-v',
      "message=Back at 5; it's 'quoted'",
      '-f',
      '-',
      'postgres://db/x',
    ])
    expect(psql?.input).toBe(
      "UPDATE maintenance_mode_state SET mode = :'mode', message = NULLIF(:'message', ''), changed_at = now(), version = version + 1 WHERE id = 1;\n"
    )
    expect(redis?.args).toEqual([
      '-u',
      'redis://cache:6379',
      'PUBLISH',
      'express-boilerplate:maintenance-mode',
      'reload',
    ])
  })

  it('uses the key prefix from the environment and clears the message for off', async () => {
    const { psql, redis } = await runSet(
      { out: '', code: 0 },
      { out: '0\n', code: 0 },
      { E2E_REDIS_KEY_PREFIX: 'e2e' },
      'postgres://db/x',
      'redis://cache:6379',
      'off'
    )
    expect(psql?.args).toContain('message=')
    expect(redis?.args).toContain('e2e:maintenance-mode')
  })

  it('gives a default message to a mode that needs one', async () => {
    const { psql } = await runSet(
      { out: '', code: 0 },
      { out: '1\n', code: 0 },
      {},
      'p',
      'r',
      'full'
    )
    expect(psql?.args).toContain('message=Down for maintenance.')
  })

  it('rejects an unknown mode before running anything', async () => {
    const { result, psql } = await runSet(
      { out: '', code: 0 },
      { out: '1\n', code: 0 },
      {},
      'p',
      'r',
      'sideways'
    )
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/mode must be one of/)
    expect(psql).toBeUndefined()
  })

  it('stops with a message, and does not publish, when psql fails', async () => {
    const { result, redis } = await runSet(
      { out: '', code: 3 },
      { out: '1\n', code: 0 },
      {},
      'p',
      'r',
      'full'
    )
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/failed/)
    expect(redis).toBeUndefined()
  })

  it('fails when redis-cli prints an error reply', async () => {
    const { result } = await runSet(
      { out: '', code: 0 },
      { out: 'NOAUTH Authentication required.\n', code: 0 },
      {},
      'p',
      'r',
      'full'
    )
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/PUBLISH failed: NOAUTH/)
  })

  it('prints usage without a mode', async () => {
    const { result } = await runSet({ out: '', code: 0 }, { out: '1\n', code: 0 }, {}, 'p', 'r')
    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/usage/)
  })
})
