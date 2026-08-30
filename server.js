/*!
 * AllOrigins
 * written by Gabriel Nunes <gabriel@multiverso.me>
 * http://github.com/gnuns
 */

import app from './app.js'
const port = process.env.PORT || 1458

console.log(`Starting allOrigins v${global.AO_VERSION}`)
const server = app.listen(port, () => console.log('Listening on', port))
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Stop the other process or set PORT env.`,
    )
  } else {
    console.error('Server error:', err.message)
  }
  process.exit(1)
})
