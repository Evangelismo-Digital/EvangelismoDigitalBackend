import http from 'k6/http'
import { sleep, check, fail } from 'k6'

export const options = {
  stages: [
    { duration: '1m', target: 20 }, // ramp up
    { duration: '2m', target: 20 }, // stable
    { duration: '1m', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
}

const credentials = {
  login: 'admin@example.com',
  password: __ENV.SEED_ADMIN_PASSWORD || 'ChangeMe123!SeedAdmin',
}

export default () => {
  const loginRes = http.post('http://localhost:3333/users/sessions', JSON.stringify(credentials), {
    headers: { 'Content-Type': 'application/json' },
  })

  const loginSuccess = check(loginRes, {
    'login succeeded': (res) => res.status === 200 && res.json('token') !== undefined,
  })

  if (!loginSuccess) {
    console.error(`Login failed. Status: ${loginRes.status}, Body: ${loginRes.body}`)
    fail('Login failed, aborting iteration.')
  }

  const token = loginRes.json('token')
  if (!token) {
    console.error('No token received after login.')
    fail('No token received, aborting iteration.')
  }

  sleep(1)
}
