// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupWorker } from 'msw/browser'
import { startBrowserMocks } from './browser'

vi.mock('msw/browser', () => ({
  setupWorker: vi.fn(() => ({ start: vi.fn().mockResolvedValue(undefined) })),
}))

let serviceWorker: EventTarget

beforeEach(() => {
  serviceWorker = new EventTarget()
  vi.stubGlobal('navigator', { serviceWorker })
  vi.clearAllMocks()
  window.sessionStorage.clear()
})
afterEach(() => vi.unstubAllGlobals())

function notification(type: string, reply?: (value: unknown) => void) {
  const event = new MessageEvent('message', { data: { type } })
  Object.defineProperty(event, 'ports', { value: reply ? [{ postMessage: reply }] : [] })
  return event
}

describe('browser mock worker lifecycle', () => {
  it('installs the acknowledgement listener before starting the worker', async () => {
    const reply = vi.fn()
    const start = vi.fn(async () => {
      serviceWorker.dispatchEvent(notification('MOCKING_ENABLED', reply))
      expect(reply).toHaveBeenCalledExactlyOnceWith(null)
    })
    vi.mocked(setupWorker).mockReturnValueOnce({ start } as unknown as ReturnType<typeof setupWorker>)
    await startBrowserMocks()
    expect(start).toHaveBeenCalledWith(expect.objectContaining({
      serviceWorker: { url: '/mockServiceWorker.js' },
    }))
  })

  it.each(['MOCKING_ENABLED', 'INTEGRITY_CHECK_RESPONSE', 'KEEPALIVE_RESPONSE', 'CLIENT_CLOSED'])(
    'replies to %s so the service worker message event can settle', async (type) => {
      await startBrowserMocks()
      const reply = vi.fn()
      serviceWorker.dispatchEvent(notification(type, reply))
      expect(reply).toHaveBeenCalledExactlyOnceWith(null)
    },
  )

  it.each(['REQUEST', 'RESPONSE', 'UNRELATED_MESSAGE'])(
    'leaves %s to MSW without sending a premature reply', async (type) => {
      await startBrowserMocks()
      const reply = vi.fn()
      serviceWorker.dispatchEvent(notification(type, reply))
      expect(reply).not.toHaveBeenCalled()
    },
  )

  it('ignores a notification without a reply port', async () => {
    await startBrowserMocks()
    expect(() => serviceWorker.dispatchEvent(notification('KEEPALIVE_RESPONSE'))).not.toThrow()
  })
  it('settles actual worker message tasks over real message channels', async () => {
    await startBrowserMocks()
    const channels: NodeMessageChannel[] = []
    class TrackedMessageChannel extends NodeMessageChannel {
      constructor() { super(); channels.push(this) }
    }
    type WorkerEvent = {
      data: string
      source: { id: string }
      waitUntil: (task: Promise<unknown>) => void
    }
    let onMessage: ((event: WorkerEvent) => void) | undefined
    const client = {
      id: 'test-client',
      postMessage(data: unknown, ports: unknown[]) {
        const event = new MessageEvent('message', { data })
        Object.defineProperty(event, 'ports', { value: ports })
        serviceWorker.dispatchEvent(event)
      },
    }
    runInNewContext(readFileSync('public/mockServiceWorker.js', 'utf8'), {
      MessageChannel: TrackedMessageChannel,
      addEventListener(type: string, listener: (event: WorkerEvent) => void) {
        if (type === 'message') onMessage = listener
      },
      self: {
        clients: { get: async () => client, matchAll: async () => [client] },
        registration: { unregister: async () => true },
      },
    })
    try {
      for (const data of ['MOCK_ACTIVATE', 'INTEGRITY_CHECK_REQUEST', 'KEEPALIVE_REQUEST', 'CLIENT_CLOSE']) {
        const waitUntil = vi.fn<(task: Promise<unknown>) => void>()
        onMessage!({ data, source: client, waitUntil })
        let settled = false
        void waitUntil.mock.calls[0][0].then(() => { settled = true })
        await vi.waitFor(() => expect(settled, data).toBe(true), { timeout: 500 })
      }
    } finally {
      for (const channel of channels) { channel.port1.close(); channel.port2.close() }
    }
  })

})
