import http from 'k6/http'
import { sleep, check, fail } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 200 }, // ramp up to 200 users
    { duration: '2m', target: 200 }, // stay at 200 users
    { duration: '1m', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% of requests should be below 3s
    http_req_failed: ['rate<0.1'], // less than 10% of requests should fail
    checks: ['rate>0.9'], // 90% of checks should pass
  },
}

const BASE_URL = 'http://localhost:3333'

const credentials = {
  login: 'admin@example.com',
  password: __ENV.SEED_ADMIN_PASSWORD || 'ChangeMe123!SeedAdmin',
}

export function setup() {
  const loginRes = http.post(`${BASE_URL}/users/sessions`, JSON.stringify(credentials), {
    headers: { 'Content-Type': 'application/json' },
  })

  const token = loginRes.json('token')
  if (!token) {
    fail('Failed to obtain authentication token during setup')
  }

  return { token }
}

export default (data) => {
  const token = data.token

  const timestamp = Date.now()
  const vuId = __VU
  const iterationId = __ITER
  const uniqueId = `${vuId}-${iterationId}-${timestamp}`

  const churchData = {
    name: `Igreja Teste ${uniqueId}`,
    address: `Rua Teste ${uniqueId}, 123`,
    lat: -23.5505 + (Math.random() * 0.1 - 0.05),
    lon: -46.6333 + (Math.random() * 0.1 - 0.05),
  }

  const createChurchRes = http.post(`${BASE_URL}/churches/create`, JSON.stringify(churchData), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  const createSuccess = check(createChurchRes, {
    'church created successfully': (res) => res.status === 201,
    'response has church property': (res) => {
      const body = res.json()
      return body?.church !== undefined
    },
    'church is an array': (res) => {
      const body = res.json()
      return Array.isArray(body?.church)
    },
    'church array has data': (res) => {
      const body = res.json()
      return body?.church?.length > 0
    },
    'church has publicId': (res) => {
      const body = res.json()
      return body?.church?.[0]?.publicId !== undefined
    },
    'church name matches': (res) => {
      const body = res.json()
      return body?.church?.[0]?.name?.toLowerCase() === churchData.name.toLowerCase()
    },
    'church has address': (res) => {
      const body = res.json()
      return body?.church?.[0]?.address?.toLowerCase() === churchData.address.toLowerCase()
    },
    'church has coordinates': (res) => {
      const body = res.json()
      const church = body?.church?.[0]
      return church?.lat !== undefined && church?.lon !== undefined
    },
    'church has timestamps': (res) => {
      const body = res.json()
      const church = body?.church?.[0]
      return church?.createdAt !== undefined && church?.updatedAt !== undefined
    },
  })

  if (!createSuccess) {
    console.error(`Failed checks. Status: ${createChurchRes.status}, Body: ${createChurchRes.body}`)
  }

  sleep(1)
}

export function teardown(data) {
  console.log('Load test completed')
}
