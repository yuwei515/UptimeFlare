import test from 'node:test'
import assert from 'node:assert/strict'
import { processNotification } from './notifications.ts'

function observation(now, overrides = {}) {
  return {
    monitorId: 'test',
    up: false,
    incidentStart: 0,
    now,
    gracePeriodMinutes: 2,
    channelCount: 1,
    ...overrides,
  }
}

function transport(result = true) {
  const calls = []
  return {
    calls,
    send: async (...args) => {
      calls.push(args)
      return typeof result === 'function' ? result(...args) : result
    },
  }
}

test('four-hour outage sends first alert at 2 minutes, then only hourly', async () => {
  let state
  const sentAt = []
  for (let now = 0; now <= 4 * 3600; now += 60) {
    state = await processNotification(state, observation(now), async (kind) => {
      sentAt.push([now, kind])
      return true
    })
    // Each tick can run in a fresh isolate after a D1 round trip.
    state = state && JSON.parse(JSON.stringify(state))
  }
  assert.deepEqual(sentAt, [[120, 'down'], [3720, 'down'], [7320, 'down'], [10920, 'down']])
})

test('brief outage recovers silently', async () => {
  const t = transport()
  let state = await processNotification(undefined, observation(0), t.send)
  state = await processNotification(state, observation(60, { up: true }), t.send)
  assert.equal(state, undefined)
  assert.equal(t.calls.length, 0)
})

test('recovery immediately follows an acknowledged alert, even at the old 150-second edge', async () => {
  const t = transport()
  let state = await processNotification(undefined, observation(120), t.send)
  state = await processNotification(state, observation(130, { up: true }), t.send)
  assert.equal(state, undefined)
  assert.deepEqual(t.calls.map((call) => call[0]), ['down', 'up'])
  await processNotification(state, observation(180, { up: true }), t.send)
  assert.equal(t.calls.length, 2)
})

test('a missed grace-period tick still delivers at the next check', async () => {
  const t = transport()
  let state = await processNotification(undefined, observation(0), t.send)
  state = await processNotification(state, observation(300), t.send)
  assert.equal(t.calls.length, 1)
  assert.equal(state.nextReminderAt, 3900)
})

test('repeated unchanged outage checks never send extra alerts', async () => {
  const t = transport()
  let state = await processNotification(undefined, observation(120), t.send)
  for (const now of [180, 240, 300, 600, 3600, 3719]) {
    state = await processNotification(state, observation(now), t.send)
  }
  assert.equal(t.calls.length, 1)
})

test('a failed send retries on later checks, succeeds, then waits one hour', async () => {
  let attempts = 0
  const t = transport(() => ++attempts === 3)
  let state = await processNotification(undefined, observation(120), t.send)
  state = await processNotification(state, observation(150), t.send)
  assert.equal(t.calls.length, 1)
  state = await processNotification(state, observation(180), t.send)
  state = await processNotification(state, observation(240), t.send)
  assert.equal(t.calls.length, 3)
  assert.equal(state.pending, undefined)
  assert.equal(state.nextReminderAt, 3840)
})

test('initial send plus three retries, then no minute-by-minute retry storm', async () => {
  const t = transport(false)
  let state
  for (const now of [120, 180, 240, 300, 360, 600, 3600, 3719]) {
    state = await processNotification(state, observation(now), t.send)
  }
  assert.equal(t.calls.length, 4)
  assert.equal(state.pending, undefined)
  state = await processNotification(state, observation(3720), t.send)
  assert.equal(t.calls.length, 5)
})

test('transport exceptions also trigger retries', async () => {
  let calls = 0
  const send = async () => { calls++; throw new Error('network failure') }
  let state = await processNotification(undefined, observation(120), send)
  state = await processNotification(state, observation(180), send)
  assert.equal(calls, 2)
  assert.equal(state.pending.attempts, 2)
})

test('successful channels are not resent during another channel retry', async () => {
  const t = transport((_kind, channel) => channel === 0)
  let state = await processNotification(undefined, observation(120, { channelCount: 2 }), t.send)
  state = await processNotification(state, observation(180, { channelCount: 2 }), t.send)
  assert.deepEqual(t.calls.map((call) => call[1]), [0, 1, 1])
})

test('recovery cancels stale DOWN retries and only reaches alerted channels', async () => {
  const t = transport((_kind, channel) => channel === 0)
  let state = await processNotification(undefined, observation(120, { channelCount: 2 }), t.send)
  state = await processNotification(state, observation(180, { up: true, channelCount: 2 }), t.send)
  assert.equal(state, undefined)
  assert.deepEqual(t.calls.map((call) => call.slice(0, 2)), [['down', 0], ['down', 1], ['up', 0]])
})

test('no recovery notification if all DOWN deliveries failed', async () => {
  const t = transport(false)
  let state = await processNotification(undefined, observation(120), t.send)
  state = await processNotification(state, observation(180, { up: true }), t.send)
  assert.equal(state, undefined)
  assert.deepEqual(t.calls.map((call) => call[0]), ['down'])
})

test('recovery failures also stop after three retries', async () => {
  const t = transport((kind) => kind === 'down')
  let state = await processNotification(undefined, observation(120), t.send)
  for (const now of [180, 240, 300, 360]) {
    state = await processNotification(state, observation(now, { up: true }), t.send)
  }
  assert.equal(state, undefined)
  await processNotification(state, observation(420, { up: true }), t.send)
  assert.equal(t.calls.filter((call) => call[0] === 'up').length, 4)
})

test('a new outage cancels obsolete recovery retries and starts a new grace period', async () => {
  const t = transport((kind) => kind === 'down')
  let state = await processNotification(undefined, observation(120), t.send)
  state = await processNotification(state, observation(180, { up: true }), t.send)
  state = await processNotification(state, observation(240, { incidentStart: 240 }), t.send)
  state = await processNotification(state, observation(300, { incidentStart: 240 }), t.send)
  assert.equal(t.calls.length, 2)
  state = await processNotification(state, observation(360, { incidentStart: 240 }), t.send)
  assert.equal(t.calls.at(-1)[0], 'down')
  assert.equal(t.calls.at(-1)[2], 240)
})

test('maintenance/suppression does not consume retries or send overdue alerts', async () => {
  const t = transport(false)
  let state = await processNotification(undefined, observation(120), t.send)
  const before = structuredClone(state)
  state = await processNotification(state, observation(180, { suppressed: true }), t.send)
  assert.deepEqual(state, before)
  assert.equal(t.calls.length, 1)
})
