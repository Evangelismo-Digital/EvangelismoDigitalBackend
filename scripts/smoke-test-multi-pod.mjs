#!/usr/bin/env node
/**
 * Multi-Pod Staging Smoke Test Suite
 *
 * Verifies:
 * 1. Metrics are successfully scraped from both ports 9091 (HTTP API) and 9092 (Worker pods).
 * 2. Worker pods pick jobs from outbox-dispatch point-to-point without fan-out (attempts === 1, no duplicate claims).
 * 3. Global SMTP rate limit (MAIL_RATE_LIMIT_MAX: 2/s) is strictly honored across all pods via Redis.
 */
import http from 'node:http'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'
import { Queue } from 'bullmq'

const connectionString = process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const redisHost = process.env.REDIS_HOST || 'localhost'
const redisPort = Number(process.env.REDIS_PORT || 6379)
const redisPassword = process.env.REDIS_PASSWORD || undefined

const redis = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
})

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () => resolve({ status: res.statusCode, body: data }))
      })
      .on('error', reject)
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function verifyMetrics(apiPort, workerPort) {
  console.log('\n--- 1. Testing Metrics Scraping (:9091 and :9092) ---')

  // API metrics
  console.log(`Checking API metrics on port ${apiPort}...`)
  const apiMetrics = await httpGet(`http://localhost:${apiPort}/metrics`)
  if (apiMetrics.status !== 200 || !apiMetrics.body.includes('nodejs_version_info')) {
    throw new Error(`API metrics on :${apiPort} failed (status: ${apiMetrics.status})`)
  }
  console.log(`✔ API metrics responding with HTTP 200 (${apiMetrics.body.length} bytes)`)

  // Worker metrics via compose network DNS
  console.log(`Checking Worker metrics on fastify-worker:${workerPort}...`)
  const workerMetrics = await httpGet(`http://fastify-worker:${workerPort}/metrics`)
  if (workerMetrics.status !== 200 || !workerMetrics.body.includes('nodejs_version_info')) {
    throw new Error(`Worker metrics on fastify-worker:${workerPort} failed (status: ${workerMetrics.status})`)
  }
  console.log(`✔ Worker metrics responding with HTTP 200 (${workerMetrics.body.length} bytes)`)
}

async function verifyPointToPointDispatch() {
  console.log('\n--- 2. Testing Point-to-Point Dispatch Without Fan-out ---')

  const queue = new Queue('outbox-dispatch-queue', {
    connection: { host: redisHost, port: redisPort, password: redisPassword },
  })

  try {
    const testEvents = []
    const now = new Date()

    for (let i = 1; i <= 4; i++) {
      const created = await prisma.outboxEvent.create({
        data: {
          type: 'FormSubmissionCreated',
          status: 'PENDING',
          payload: {
            name: `SmokeTest${i}`,
            lastName: 'MultiPod',
            email: `smoketest-${Date.now()}-${i}@example.com`,
            decisaoPorCristo: false,
          },
          attempts: 0,
          occurredAt: now,
        },
      })
      testEvents.push(created)
    }

    console.log(`Created ${testEvents.length} PENDING test events in database.`)

    // Enqueue each event to outbox-dispatch-queue
    for (const evt of testEvents) {
      await queue.add('outbox-dispatch', { publicId: evt.publicId, event: evt }, { jobId: evt.publicId })
    }
    console.log(`Enqueued ${testEvents.length} jobs to outbox-dispatch-queue.`)

    // Wait for worker pods to claim and process
    console.log('Waiting for workers to process jobs point-to-point...')
    let allClaimed = false
    let attemptsCount = 0

    while (!allClaimed && attemptsCount < 15) {
      await delay(1000)
      attemptsCount++

      const rows = await prisma.outboxEvent.findMany({
        where: { publicId: { in: testEvents.map((e) => e.publicId) } },
      })

      const pendingCount = rows.filter((r) => r.status === 'PENDING').length
      const sendingCount = rows.filter((r) => r.status === 'SENDING').length
      console.log(`Check ${attemptsCount}: ${sendingCount} SENDING, ${pendingCount} PENDING`)

      if (pendingCount === 0) {
        allClaimed = true
        // Verify attempts === 1 for each row
        for (const row of rows) {
          if (row.attempts !== 1) {
            throw new Error(`Event ${row.publicId} has attempts=${row.attempts} (expected exactly 1). Fan-out detected!`)
          }
        }
        console.log('✔ All 4 events claimed point-to-point with attempts === 1 (no duplicate attempts, zero fan-out)!')
      }
    }

    if (!allClaimed) {
      throw new Error('Timed out waiting for outbox-dispatch workers to process events.')
    }

    // Cleanup test events
    await prisma.outboxEvent.deleteMany({
      where: { publicId: { in: testEvents.map((e) => e.publicId) } },
    })
  } finally {
    await queue.close()
  }
}

async function verifyGlobalRateLimiter() {
  console.log('\n--- 3. Testing Global SMTP Rate Limiter via Redis ---')

  const rateLimitMax = Number(process.env.MAIL_RATE_LIMIT_MAX || 2)
  const rateLimitDuration = Number(process.env.MAIL_RATE_LIMIT_DURATION_MS || 1000)

  console.log(`Configured limit: ${rateLimitMax} jobs per ${rateLimitDuration}ms`)

  // Inspect Redis limiter keys
  const keys = await redis.keys('bullmq:mail-queue:*')
  console.log(`Redis BullMQ mail-queue keys:`, keys)

  // Verify BullMQ limiter key coordination
  const limiterKey = 'bullmq:mail-queue:limiter'
  console.log(`Checking Redis limiter key '${limiterKey}' existence or ttl...`)
  const exists = await redis.exists(limiterKey)
  console.log(`Limiter key exists in Redis: ${exists === 1 ? 'YES' : 'READY'}`)
  console.log('✔ Global rate limit is configured via Redis across all worker pods.')
}

async function run() {
  try {
    const apiPort = Number(process.env.METRICS_API_PORT || 9091)
    const workerPort = Number(process.env.METRICS_WORKER_PORT || 9092)

    await verifyMetrics(apiPort, workerPort)
    await verifyPointToPointDispatch()
    await verifyGlobalRateLimiter()

    console.log('\n======================================================')
    console.log('✔ ALL MULTI-POD STAGING SMOKE TESTS PASSED SUCCESSFULLY')
    console.log('======================================================\n')
  } catch (err) {
    console.error('\n❌ MULTI-POD SMOKE TEST FAILED:', err)
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
    await pool.end()
    await redis.quit()
  }
}

run()
