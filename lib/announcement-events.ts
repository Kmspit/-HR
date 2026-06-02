import { EventEmitter } from 'events'

declare global {
  // eslint-disable-next-line no-var
  var _announcementEmitter: EventEmitter | undefined
}

if (!globalThis._announcementEmitter) {
  globalThis._announcementEmitter = new EventEmitter()
  globalThis._announcementEmitter.setMaxListeners(500)
}

export const announcementEmitter = globalThis._announcementEmitter
