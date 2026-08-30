/*!
 * AllOrigins
 * written by Gabriel Nunes <gabriel@multierso.me>
 * http://github.com/gnuns
 */
import express from 'express'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { version } = require('./package.json')
// yep, global. it's ok
// https://softwareengineering.stackexchange.com/a/47926/289420
global.AO_VERSION = version

import processRequest from './app/process-request.js'
import embedRequest from './app/embed.js'

function enableCORS(req, res, next) {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Credentials', true)
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Content-Encoding, Accept',
  )
  res.header(
    'Access-Control-Allow-Methods',
    'OPTIONS, GET, POST, PATCH, PUT, DELETE',
  )
  res.header('Via', `allOrigins v${version}`)
  next()
}

const app = express()

app.set('case sensitive routing', false)
app.set('jsonp callback name', 'callback')
app.disable('x-powered-by')
app.enable('trust proxy')
app.use(enableCORS)

// Request logging — shows every request in terminal
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`)
  next()
})

for (const format of ['get', 'raw', 'json', 'info']) {
  app.all(
    `/${format}`,
    (req, _res, next) => {
      req.params.format = format
      next()
    },
    processRequest,
  )
}

app.all('/embed', embedRequest)

// Root path — not allowed
app.all('/', (_req, res) => {
  res.status(403).json({ error: 'Not allowed' })
})

// Global error handler — logs to terminal, returns JSON to client
// ponytail: 4-arg signature is required by Express for error middleware
app.use((err, req, res, _next) => {
  console.error(
    `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`,
  )
  console.error(err.stack || err.message || err)
  res.status(500).json({ error: err.message || 'Internal Server Error' })
})

export default app
