// Persist this state in D1; isolate memory is not reliable across scheduled runs.
export const NOTIFICATION_STATE_KEY = 'notification-state-v1'
export const REMINDER_INTERVAL_SECONDS = 60 * 60
export const RETRY_INTERVAL_SECONDS = 60
export const MAX_NOTIFICATION_RETRIES = 3

export type NotificationKind = 'down' | 'up'

type PendingNotification = {
  kind: NotificationKind
  createdAt: number
  nextAttemptAt: number
  attempts: number
  delivered: boolean[]
}

export type MonitorNotificationState = {
  incidentStart: number
  downDelivered: boolean[]
  nextReminderAt: number
  pending?: PendingNotification
}

export type NotificationStates = Record<string, MonitorNotificationState>

export type NotificationObservation = {
  monitorId: string
  up: boolean
  incidentStart: number
  now: number
  gracePeriodMinutes: number
  channelCount: number
  suppressed?: boolean
}

type SendNotification = (
  kind: NotificationKind,
  channelIndex: number,
  incidentStart: number
) => Promise<boolean>

/** One delivery attempt per channel per cron run; retries never block monitoring with sleeps. */
export async function processNotification(
  previous: MonitorNotificationState | undefined,
  observation: NotificationObservation,
  send: SendNotification
): Promise<MonitorNotificationState | undefined> {
  const { monitorId, up, incidentStart, now, channelCount } = observation
  if (observation.suppressed || channelCount === 0) return previous

  let state = previous ? structuredClone(previous) : undefined
  if (
    !state ||
    state.downDelivered.length !== channelCount ||
    (!up && state.incidentStart !== incidentStart)
  ) {
    if (up) return undefined
    state = {
      incidentStart,
      downDelivered: Array(channelCount).fill(false),
      nextReminderAt: incidentStart + Math.max(0, observation.gracePeriodMinutes) * 60,
    }
  }

  if (up) {
    // Cancel any undelivered DOWN messages. Only notify channels that saw the outage.
    if (state.pending?.kind !== 'up') {
      if (!state.downDelivered.some(Boolean)) return undefined
      state.pending = {
        kind: 'up',
        createdAt: now,
        nextAttemptAt: now,
        attempts: 0,
        delivered: state.downDelivered.map((delivered) => !delivered),
      }
    }
  } else if (!state.pending && now >= state.nextReminderAt) {
    state.pending = {
      kind: 'down',
      createdAt: now,
      nextAttemptAt: now,
      attempts: 0,
      delivered: Array(channelCount).fill(false),
    }
  }

  const pending = state.pending
  if (!pending || now < pending.nextAttemptAt) return state

  pending.attempts++
  for (let channel = 0; channel < channelCount; channel++) {
    if (pending.delivered[channel]) continue
    let delivered = false
    try {
      delivered = await send(pending.kind, channel, state.incidentStart)
    } catch {
      // Transport errors count as failures, not successful deliveries.
    }
    if (delivered) {
      pending.delivered[channel] = true
      if (pending.kind === 'down') state.downDelivered[channel] = true
    }
  }

  if (pending.delivered.every(Boolean)) {
    console.log(`[${monitorId}] ${pending.kind} notification delivered (attempt ${pending.attempts})`)
    if (pending.kind === 'up') return undefined
    state.nextReminderAt = now + REMINDER_INTERVAL_SECONDS
    delete state.pending
  } else if (pending.attempts >= MAX_NOTIFICATION_RETRIES + 1) {
    console.warn(`[${monitorId}] ${pending.kind} notification failed after ${pending.attempts} attempts`)
    if (pending.kind === 'up') return undefined
    // A failed batch is retried at the next hourly reminder, not every minute forever.
    state.nextReminderAt = Math.max(pending.createdAt + REMINDER_INTERVAL_SECONDS, now + RETRY_INTERVAL_SECONDS)
    delete state.pending
  } else {
    pending.nextAttemptAt = now + RETRY_INTERVAL_SECONDS
    console.log(`[${monitorId}] ${pending.kind} notification retry ${pending.attempts}/${MAX_NOTIFICATION_RETRIES} scheduled`)
  }
  return state
}
