// k6 load test for the TaskBoard API.
//
// Each virtual user repeats what a person does: list tasks, create one, read
// it back, complete it, delete it. Every task a user creates is deleted by
// the same user, so the database does not grow between runs.
//
//   SCENARIO  baseline | ramp | spike   (default: baseline)
//   BASE_URL  where the application is served
//
// Run it through scripts/scaling-test.ps1, which also records how the
// autoscaler responds.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8090';
const SCENARIO = __ENV.SCENARIO || 'baseline';

// A create that returned 201 but whose task could not be read back.
const lostWrites = new Counter('lost_writes');

const PROFILES = {
  // Steady, light traffic: normal latency and error rate, no scaling expected.
  baseline: [
    { duration: '20s', target: 5 },
    { duration: '2m', target: 5 },
    { duration: '10s', target: 0 },
  ],
  // Traffic that grows over minutes: the autoscaler should keep up.
  ramp: [
    { duration: '1m', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '20s', target: 0 },
  ],
  // A sudden jump: shows what users experience before new pods are ready.
  spike: [
    { duration: '30s', target: 5 },
    { duration: '10s', target: 60 },
    { duration: '2m', target: 60 },
    { duration: '20s', target: 0 },
  ],
};

if (!PROFILES[SCENARIO]) {
  throw new Error(`Unknown SCENARIO "${SCENARIO}". Use baseline, ramp or spike.`);
}

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: PROFILES[SCENARIO],
      gracefulRampDown: '10s',
    },
  },
  // The acceptance criteria from docs/architecture.md, section 14.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
    checks: ['rate>0.99'],
    lost_writes: ['count==0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

export default function () {
  check(http.get(`${BASE_URL}/api/tasks?limit=20`), {
    'list returns 200': (r) => r.status === 200,
  });

  const title = `loadtest ${__VU}-${__ITER}`;
  const created = http.post(
    `${BASE_URL}/api/tasks`,
    JSON.stringify({ title: title, priority: 'low' }),
    JSON_HEADERS,
  );

  if (check(created, { 'create returns 201': (r) => r.status === 201 })) {
    const id = created.json('id');

    const read = http.get(`${BASE_URL}/api/tasks/${id}`);
    const readable = check(read, {
      'created task can be read back': (r) => r.status === 200 && r.json('title') === title,
    });
    if (!readable) {
      lostWrites.add(1);
    }

    check(http.patch(`${BASE_URL}/api/tasks/${id}`, JSON.stringify({ status: 'done' }), JSON_HEADERS), {
      'update returns 200': (r) => r.status === 200,
    });
    check(http.del(`${BASE_URL}/api/tasks/${id}`), {
      'delete returns 204': (r) => r.status === 204,
    });
  }

  check(http.get(`${BASE_URL}/api/tasks?status=todo&limit=20`), {
    'filtered list returns 200': (r) => r.status === 200,
  });

  // Think time between a user's actions.
  sleep(0.3 + Math.random() * 0.4);
}
