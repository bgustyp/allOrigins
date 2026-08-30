import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import QuickLRU from 'quick-lru'
import got from 'got'

const DEFAULT_USER_AGENT = `Mozilla/5.0 (compatible; allOrigins/${global.AO_VERSION}; +http://allorigins.win/)`

const storageAdapter = new QuickLRU({ maxSize: 1000 })

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024 // 10MB

const gotInstance = got.extend({
  agent: {
    http: new HttpAgent({
      keepAlive: true,
      maxSockets: 50,
    }),
    https: new HttpsAgent({
      keepAlive: true,
      maxSockets: 50,
    }),
  },
  responseType: 'buffer',
  dnsCache: true,
  headers: { 'user-agent': process.env.USER_AGENT || DEFAULT_USER_AGENT },
  timeout: { request: 10000 },
  cache: storageAdapter,
  cacheOptions: {
    // ponytail: shared:false caches aggressively, ignoring upstream no-cache/private.
    // Tradeoff: may serve stale content. Acceptable for a CORS proxy.
    // Switch to shared:true if upstream cache compliance matters.
    shared: false,
    cacheHeuristic: 0.1,
    immutableMinTimeToLive: 24 * 3600 * 1000, // 24h
    ignoreCargoCult: true,
  },
  hooks: {
    // ponytail: checks content-length after download, not during.
    // Prevents JSON.stringify OOM on oversized responses.
    // Full protection needs stream-based abort — refactor when needed.
    afterResponse: [
      (response) => {
        const contentLength = +response.headers['content-length']
        if (contentLength > MAX_RESPONSE_SIZE) {
          throw new Error(`Response too large: ${contentLength} bytes`)
        }
        return response
      },
    ],
  },
})

export { gotInstance as got }
