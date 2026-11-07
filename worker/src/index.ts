import { DurableObject } from 'cloudflare:workers'
import { MonitorTarget } from '../../types/config'
import { workerConfig } from '../../uptime.config'
import { doMonitor, getStatus } from './monitor'
import { formatAndNotify, getWorkerLocation, isNotificationSuppressed } from './util'
import { NOTIFICATION_STATE_KEY, processNotification } from './notifications'
import type { NotificationStates } from './notifications'
import { CompactedMonitorStateWrapper, getFromStore, setToStore } from './store'
import pLimit from 'p-limit'

export interface Env {
  REMOTE_CHECKER_DO: DurableObjectNamespace<RemoteChecker>
  UPTIMEFLARE_D1: D1Database
}

const Worker = {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const workerLocation = (await getWorkerLocation()) || 'ERROR'
    console.log(`Running scheduled event on ${workerLocation}...`)

    // Create a wrapped MonitorState from stored compacted state
    const [monitorSnapshot, notificationSnapshot] = await Promise.all([
      getFromStore(env, 'state'),
      getFromStore(env, NOTIFICATION_STATE_KEY),
    ])
    const state = new CompactedMonitorStateWrapper(monitorSnapshot)
    const notificationStates: NotificationStates = JSON.parse(notificationSnapshot || '{}')
    const configuredWebhook = workerConfig.notification?.webhook
    const notificationWebhooks = configuredWebhook
      ? Array.isArray(configuredWebhook) ? configuredWebhook : [configuredWebhook]
      : []
    // Drop retry state for monitors removed from the configuration.
    const monitorIds = new Set(workerConfig.monitors.map((monitor) => monitor.id))
    let removedNotificationState = false
    for (const id of Object.keys(notificationStates)) {
      if (!monitorIds.has(id)) {
        delete notificationStates[id]
        removedNotificationState = true
      }
    }
    if (removedNotificationState) {
      await setToStore(env, NOTIFICATION_STATE_KEY, JSON.stringify(notificationStates))
    }
    state.data.overallDown = 0
    state.data.overallUp = 0

    let statusChanged = false
    const currentTimeSecond = Math.round(Date.now() / 1000)

    // Parallel check multiple monitors
    // Max concurrent connection is 6 limited by Cloudflare Workers, we use 5 here to be safe
    type CheckResult = { id: string; location: string; status: { ping: number; up: boolean; err: string } }
    let checkQueue: Promise<CheckResult>[] = []
    let checkResult: Record<string, CheckResult> = {};
    const limit = pLimit(5);
    for (const monitor of workerConfig.monitors) {
      checkQueue.push(limit(() => doMonitor(monitor, workerLocation, env)))
    }
    for (const result of await Promise.all(checkQueue)) {
      checkResult[result.id] = result
    }

    // Update each monitor's state based on check results
    for (const monitor of workerConfig.monitors) {
      console.log(`Processing monitor result: ${monitor.name} (${monitor.id})`)

      let monitorStatusChanged = false
      const { location: checkLocation, status } = checkResult[monitor.id]

      // Update counters
      status.up ? state.data.overallUp++ : state.data.overallDown++

      // Update incidents
      // Create a dummy incident to store the start time of the monitoring and simplify logic
      if (state.incidentLen(monitor.id) === 0) {
        state.appendIncident(monitor.id, {
          start: [currentTimeSecond],
          end: currentTimeSecond,
          error: ['dummy'],
        })
      }

      // Then lastIncident here must not be null
      let lastIncident = state.getIncident(monitor.id, state.incidentLen(monitor.id) - 1)

      if (status.up) {
        // Current status is up
        // close existing incident if any
        if (lastIncident.end === null) {
          lastIncident.end = currentTimeSecond
          // write back the modified last incident
          state.setIncident(monitor.id, state.incidentLen(monitor.id) - 1, lastIncident)

          monitorStatusChanged = true
          try {
            console.log('Calling config onStatusChange callback...')
            await workerConfig.callbacks?.onStatusChange?.(
              env,
              monitor,
              true,
              lastIncident.start[0],
              currentTimeSecond,
              'OK'
            )
          } catch (e) {
            console.log('Error calling callback: ')
            console.log(e)
          }
        }
      } else {
        // Current status is down
        // open new incident if not already open
        if (lastIncident.end !== null) {
          state.appendIncident(monitor.id, {
            start: [currentTimeSecond],
            end: null,
            error: [status.err],
          })
          monitorStatusChanged = true
        } else if (lastIncident.end === null && lastIncident.error.slice(-1)[0] !== status.err) {
          // append if the error message changes
          lastIncident.start.push(currentTimeSecond)
          lastIncident.error.push(status.err)

          // write back the modified last incident
          state.setIncident(monitor.id, state.incidentLen(monitor.id) - 1, lastIncident)
          monitorStatusChanged = true
        }

        const currentIncident = state.getIncident(monitor.id, state.incidentLen(monitor.id) - 1)
        try {
          if (monitorStatusChanged) {
            console.log('Calling config onStatusChange callback...')
            await workerConfig.callbacks?.onStatusChange?.(
              env,
              monitor,
              false,
              currentIncident.start[0],
              currentTimeSecond,
              status.err
            )
          }
        } catch (e) {
          console.log('Error calling callback: ')
          console.log(e)
        }

        try {
          console.log('Calling config onIncident callback...')
          await workerConfig.callbacks?.onIncident?.(
            env,
            monitor,
            currentIncident.start[0],
            currentTimeSecond,
            status.err
          )
        } catch (e) {
          console.log('Error calling callback: ')
          console.log(e)
        }
      }

      // Persist delivery/retry state separately from incident history and its write cooldown.
      if (notificationWebhooks.length > 0) {
        const incident = state.getIncident(monitor.id, state.incidentLen(monitor.id) - 1)
        const before = JSON.stringify(notificationStates[monitor.id])
        const next = await processNotification(
          notificationStates[monitor.id],
          {
            monitorId: monitor.id,
            up: status.up,
            incidentStart: incident.start[0],
            now: currentTimeSecond,
            gracePeriodMinutes: workerConfig.notification?.gracePeriod ?? 0,
            channelCount: notificationWebhooks.length,
            suppressed: isNotificationSuppressed(monitor, currentTimeSecond),
          },
          (kind, channel, incidentStart) => formatAndNotify(
            monitor,
            kind === 'up',
            incidentStart,
            currentTimeSecond,
            status.up ? 'OK' : status.err,
            notificationWebhooks[channel]
          )
        )
        if (next) notificationStates[monitor.id] = next
        else delete notificationStates[monitor.id]
        if (JSON.stringify(next) !== before) {
          await setToStore(env, NOTIFICATION_STATE_KEY, JSON.stringify(notificationStates))
        }
      }

      // append to latency data
      state.appendLatency(monitor.id, {
        loc: checkLocation,
        ping: status.ping,
        time: currentTimeSecond,
      })

      // discard old data
      while (state.getFirstLatency(monitor.id).time < currentTimeSecond - 12 * 60 * 60) {
        state.unshiftLatency(monitor.id)
      }

      // discard old incidents
      while (
        state.incidentLen(monitor.id) > 0 &&
        state.getIncident(monitor.id, 0).end &&
        state.getIncident(monitor.id, 0).end! < currentTimeSecond - 90 * 24 * 60 * 60
      ) {
        state.shiftIncident(monitor.id)
      }

      if (
        state.incidentLen(monitor.id) === 0 ||
        (state.getIncident(monitor.id, 0).start[0] > currentTimeSecond - 90 * 24 * 60 * 60 &&
          state.getIncident(monitor.id, 0).error[0] != 'dummy')
      ) {
        // put the dummy incident back
        state.unshiftIncident(monitor.id, {
          start: [currentTimeSecond - 90 * 24 * 60 * 60],
          end: currentTimeSecond - 90 * 24 * 60 * 60,
          error: ['dummy'],
        })
      }

      statusChanged ||= monitorStatusChanged
    }

    console.log(
      `statusChanged: ${statusChanged}, lastUpdate: ${state.data.lastUpdate}, currentTime: ${currentTimeSecond}`
    )
    // Update state
    // Allow for a cooldown period before writing to storage
    if (
      statusChanged ||
      currentTimeSecond - state.data.lastUpdate >=
        (workerConfig.kvWriteCooldownMinutes ?? 3) * 60 - 10 // Allow for 10 seconds of clock drift
    ) {
      console.log('Updating state...')
      state.data.lastUpdate = currentTimeSecond
      await setToStore(env, 'state', state.getCompactedStateStr())
    } else {
      console.log('Skipping state update due to cooldown period.')
    }
  },
}

export default Worker

export class RemoteChecker extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
  }

  async getLocationAndStatus(
    monitor: MonitorTarget
  ): Promise<{ location: string; status: { ping: number; up: boolean; err: string } }> {
    const colo = (await getWorkerLocation()) as string
    console.log(`Running remote checker (DurableObject) at ${colo}...`)
    const status = await getStatus(monitor)
    return {
      location: colo,
      status: status,
    }
  }

  async kill() {
    // Throwing an error in `blockConcurrencyWhile` will terminate the Durable Object instance
    // https://developers.cloudflare.com/durable-objects/api/state/#blockconcurrencywhile
    this.ctx.blockConcurrencyWhile(async () => {
      throw 'killed'
    })
  }
}
