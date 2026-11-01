/**
 * Regression — SNYK-JS-IOREDIS-19963957 (Uncontrolled Recursion, HIGH).
 *
 * What broke: ioredis 5 parsed RESP with `redis-parser`, which recursed once
 * per nested array header. A reply made of thousands of nested `*1` headers
 * exhausted the V8 stack inside the socket's `data` handler, and the RangeError
 * escaped as an uncaught exception — killing the API or the worker outright.
 *
 * Why it matters: every queue, lock, cache read and rate-limit check goes
 * through these connections, so a malicious or compromised Redis endpoint (or
 * anything able to sit on that TCP path) could take the whole process down with
 * one reply. ioredis 6 wraps the decoder and turns a parse failure into a
 * recoverable connection error; this spec pins that behaviour so a downgrade,
 * or a future client swap, cannot bring the crash back unnoticed.
 *
 * The server below is a loopback stand-in for Redis that answers with whatever
 * bytes the test chooses — no Docker, no real Redis.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server, type Socket } from 'node:net'
import type { AddressInfo } from 'node:net'
import Redis from 'ioredis'
import { REDIS_WIRE_PROTOCOL } from './redis-wire-protocol'

/** Deep enough to overflow the V8 stack of a recursive RESP parser. */
const MALICIOUS_DEPTH = 200_000

const maliciousNestedReply = (depth: number) => `${'*1\r\n'.repeat(depth)}:1\r\n`

type FakeRedis = { server: Server; port: number; received: string[] }

let fake: FakeRedis | null = null
let client: Redis | null = null

/**
 * Splits complete RESP request arrays (`*N` of `$len` bulk strings) off the
 * front of `buffer`. The client may send several commands in one chunk — the
 * connection handshake does — and each must get exactly one reply, or the
 * command under test waits forever for an answer that went to another.
 */
function takeCommands(buffer: string): { commands: string[][]; rest: string } {
  const commands: string[][] = []
  let cursor = 0
  for (;;) {
    const header = /^\*(\d+)\r\n/.exec(buffer.slice(cursor))
    if (!header) break
    let offset = cursor + header[0].length
    const args: string[] = []
    for (let i = 0; i < Number(header[1]); i++) {
      const bulk = /^\$(\d+)\r\n/.exec(buffer.slice(offset))
      const end = bulk ? offset + bulk[0].length + Number(bulk[1]) : Infinity
      if (!bulk || end + 2 > buffer.length) return { commands, rest: buffer.slice(cursor) }
      args.push(buffer.slice(offset + bulk[0].length, end))
      offset = end + 2
    }
    commands.push(args)
    cursor = offset
  }
  return { commands, rest: buffer.slice(cursor) }
}

/** Answers GET with `reply` and every handshake command with +OK. */
async function startFakeRedis(reply: string): Promise<FakeRedis> {
  const received: string[] = []
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    let pending = ''
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('data', (chunk) => {
      received.push(chunk.toString('latin1'))
      const { commands, rest } = takeCommands(pending + chunk.toString('latin1'))
      pending = rest
      for (const [name] of commands) socket.write(name?.toLowerCase() === 'get' ? reply : '+OK\r\n')
    })
  })
  server.on('close', () => {
    for (const socket of sockets) socket.destroy()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

  return { server, port: (server.address() as AddressInfo).port, received }
}

function connect(port: number): Redis {
  return new Redis({
    host: '127.0.0.1',
    port,
    protocol: REDIS_WIRE_PROTOCOL,
    enableReadyCheck: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  })
}

afterEach(async () => {
  client?.disconnect()
  client = null
  if (fake) {
    const { server } = fake
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  fake = null
})

describe('a deeply nested reply from Redis', () => {
  it('rejects the command instead of crashing the process', async () => {
    fake = await startFakeRedis(maliciousNestedReply(MALICIOUS_DEPTH))
    client = connect(fake.port)
    client.on('error', () => undefined)

    // On the vulnerable client the stack overflow escapes the socket handler as
    // an uncaught exception, which Vitest reports as an unhandled error and
    // fails the run; the patched client settles the command with an error.
    await expect(client.get('key')).rejects.toThrow()
  })

  it('still parses a legitimately nested reply', async () => {
    // Counterweight: the fix must not reject nesting outright — Lua scripts and
    // commands like XREAD return arrays of arrays in normal operation.
    fake = await startFakeRedis(maliciousNestedReply(32))
    client = connect(fake.port)

    let reply: unknown = await client.get('key')
    for (let depth = 0; depth < 32; depth++) {
      expect(Array.isArray(reply)).toBe(true)
      reply = (reply as unknown[])[0]
    }
    expect(reply).toBe(1)
  })

  it('still resolves an ordinary reply', async () => {
    fake = await startFakeRedis('$5\r\nvalue\r\n')
    client = connect(fake.port)

    await expect(client.get('key')).resolves.toBe('value')
  })

  it('is spoken over RESP2: the client never negotiates RESP3 with HELLO', async () => {
    fake = await startFakeRedis('$5\r\nvalue\r\n')
    client = connect(fake.port)

    await client.get('key')

    const wire = fake.received.join('')
    expect(wire).not.toMatch(/HELLO/i)
    expect(wire).toContain('$3\r\nget\r\n$3\r\nkey\r\n')
  })
})
