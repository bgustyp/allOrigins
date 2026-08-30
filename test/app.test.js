import { jest } from '@jest/globals'
import request from 'supertest'
import nock from 'nock'
import app from '../app.js'
import getLogger from '../app/logger.js'

beforeAll(() => {
  nock('http://example.com')
    .persist(true)
    .get('/test.html')
    .reply(200, 'Hi, allOrigins!', {
      'Content-Type': 'text/html',
    })

    .get('/test.txt')
    .reply(200, 'Hello, allOrigins! 👽', {
      'Content-Type': 'text/plain',
    })

    .get('/cn.txt')
    .reply(200, Buffer.from('C4E3BAC3CAC0BDE7A3A1', 'hex'), {
      'Content-Type': 'text/plain',
    })

    .get('/not-found.html')
    .reply(404, 'not found!')

    .post('/test.html')
    .reply(200, "Hi, allOrigins! It's a POST!")

    .head('/test.html')
    .reply(204, undefined, {
      'Content-Type': 'text/html',
    })

  nock('http://redirect.test')
    .persist(true)
    .get('/page.html')
    .reply(
      200,
      '<html><script>if(true){window.location = "https://evil.com"}</script><body>player</body></html>',
      { 'Content-Type': 'text/html' },
    )

  nock('http://iframe.test')
    .persist(true)
    .get('/wrap.html')
    .reply(
      200,
      '<html><head><script>if(window.self===window.top){window.location.replace("https://lk21.de")}window.location.replace("https://google.com")</script></head><body><iframe src="https://abyssplayer.com/x"></iframe><script src="/script.min.js"></script></body></html>',
      { 'Content-Type': 'text/html' },
    )

  nock('http://ads.test')
    .persist(true)
    .get('/page.html')
    .reply(
      200,
      '<html><head><style>.embed-container,a#uyeouyeo{top:0}</style></head><body><a id="uyeouyeo" href="https://yellowishgather.com/xxx" target="_blank"><div class="message-box"><p>Klik untuk main</p></div></a><div class="embed-container"><iframe src="https://abyssplayer.com/x"></iframe></div><script src="/script.min.js?v4"></script><script async src="https://www.googletagmanager.com/gtag/js?id=X"></script><script>(function(){function c(){var b=a.contentDocument;var d=b.createElement("script");d.innerHTML="test";b.getElementsByTagName("head")[0].appendChild(d)}})();</script></body></html>',
      { 'Content-Type': 'text/html' },
    )
})

test('global.AO_VERSION is defined', () => {
  expect(global.AO_VERSION).toBeDefined()
})

describe('Logger', () => {
  test('process.env.DEBUG is undefined', () => {
    const logger = getLogger((process.env['DEBUG'] = undefined))
    expect(logger.logger).toBeFalsy()
    expect(
      logger.requestProcessed({
        format: 'raw',
        headers: {
          host: '127.0.0.1:34841',
          'accept-encoding': 'gzip, deflate',
          connection: 'close',
        },
        status: { response_time: 3, url: 'http://example.com/test.html' },
      }),
    ).toBeFalsy()
    expect(logger.logger.log).toBeUndefined()
  })

  test('process.env.DEBUG is defined', () => {
    const logger = getLogger((process.env['DEBUG'] = '1'))
    logger.logger = {
      log: jest.fn(() => true),
      warn: jest.fn(() => true),
    }

    expect(logger.logger).not.toBe(false)
    expect(
      logger.requestProcessed({
        format: 'raw',
        headers: {
          host: '127.0.0.1:34841',
          'accept-encoding': 'gzip, deflate',
          connection: 'close',
        },
        status: { response_time: 3, url: 'http://example.com/test.html' },
      }),
    ).not.toBeFalsy()
    expect(logger.logger.log).toHaveBeenCalled()
  })
})

test('Test basic /get request', async () => {
  const res = await request(app).get('/get?url=http://example.com/test.html')

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeDefined()
  expect(res.body.status).toBeDefined()
  expect(res.body.status.content_length).toBe(15)
})

test('Test POST to /get endpoint', async () => {
  const res = await request(app).post('/get?url=http://example.com/test.html')

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeDefined()
  expect(res.body.contents).toBe("Hi, allOrigins! It's a POST!")
  expect(res.body.status).toBeDefined()
})

test('Test /get request to not found url', async () => {
  const res = await request(app).get(
    '/get?url=http://example.com/not-found.html',
  )

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeDefined()
  expect(res.body.contents).toBe('not found!')
  expect(res.body.status).toBeDefined()
  expect(res.body.status.http_code).toBe(404)
})

test('Test /raw request', async () => {
  const res = await request(app).get('/raw?url=http://example.com/test.html')

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeUndefined()
  expect(res.body.status).toBeUndefined()
  expect(res.text).toBe('Hi, allOrigins!')
})

test('Test /get request with charset param', async () => {
  const res = await request(app).get(
    '/get?url=http://example.com/test.txt&charset=utf-8',
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; charset=utf-8')

  expect(res.body.contents).toBe('Hello, allOrigins! 👽')
})

test('Test /get request with charset param (CN)', async () => {
  const res = await request(app).get(
    '/get?url=http://example.com/cn.txt&charset=gbk',
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; charset=gbk')

  expect(res.body.contents).toBe('你好世界！')
})

test('Test /get request with callback param', async () => {
  const res = await request(app).get(
    '/get?url=http://example.com/test.txt&callback=myFunc',
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8')

  expect(res.text).toMatch(/myFunc\(\{.+\}\)/gi)
})

test('Test /info request', async () => {
  const res = await request(app).get('/info?url=http://example.com/test.html')

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeUndefined()
  expect(res.body.content_type).toBe('text/html')
  expect(res.body.content_length).toBe(-1)
  expect(res.body.http_code).toBe(204)
})

test('Test OPTIONS request', async () => {
  const RANDOM_ORIGIN = `https://${Math.random()}.random`

  const res = await request(app).options('/get').set('Origin', RANDOM_ORIGIN)

  expect(res.statusCode).toBe(200)
  // 'cause we accept requests from allOrigins :D
  expect(res.headers['access-control-allow-origin']).toBe(RANDOM_ORIGIN)
  expect(res.headers['access-control-allow-methods']).toBe(
    'OPTIONS, GET, POST, PATCH, PUT, DELETE',
  )

  expect(res.body.contents).toBeUndefined()
})

test('with disableCache', async () => {
  const res = await request(app).get(
    `/get?url=http://example.com/test.html&disableCache=true`,
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['cache-control']).toBe(
    `public, max-age=0, stale-if-error=600`,
  )

  expect(res.body.contents).toBeDefined()
  expect(res.body.status).toBeDefined()
  expect(res.body.status.content_length).toBe(15)
})

test('with disableCache and valid cacheMaxAge', async () => {
  const res = await request(app).get(
    `/get?url=http://example.com/test.html&disableCache=true&cacheMaxAge=1000`,
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['cache-control']).toBe(
    `public, max-age=0, stale-if-error=600`,
  )

  expect(res.body.contents).toBeDefined()
  expect(res.body.status).toBeDefined()
  expect(res.body.status.content_length).toBe(15)
})

describe.each([
  ['without cacheMaxAge', '', '3600'],
  ['with a valid cacheMaxAge', '342', '342'],
  ['with an invalid cacheMaxAge', 'not-valid', '3600'],
  ['with a cacheMaxAge < MIN_CACHE_TIME', '142', '300'],
])('%s', (_, param, expected) => {
  test('Test /raw request', async () => {
    const res = await request(app).get(
      `/raw?url=http://example.com/test.html&cacheMaxAge=${param}`,
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe(
      `public, max-age=${expected}, stale-if-error=600`,
    )

    expect(res.body.contents).toBeUndefined()
    expect(res.body.status).toBeUndefined()
    expect(res.text).toBe('Hi, allOrigins!')
  })

  test('Test /get request', async () => {
    const res = await request(app).get(
      `/get?url=http://example.com/test.html&cacheMaxAge=${param}`,
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe(
      `public, max-age=${expected}, stale-if-error=600`,
    )

    expect(res.body.contents).toBeDefined()
    expect(res.body.status).toBeDefined()
    expect(res.body.status.content_length).toBe(15)
  })

  test('Test POST to /json endpoint', async () => {
    const res = await request(app).post(
      `/json?url=http://example.com/test.html&cacheMaxAge=${param}`,
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBeUndefined()

    expect(res.body.contents).toBeDefined()
    expect(res.body.contents).toBe("Hi, allOrigins! It's a POST!")
    expect(res.body.status).toBeDefined()
  })
})

describe('/embed', () => {
  test('strips window.location redirect from HTML', async () => {
    const res = await request(app).get(
      '/embed?url=http://redirect.test/page.html',
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toMatch('text/html')
    expect(res.text).toContain('player')
    expect(res.text).not.toContain('window.location = "https://evil.com"')
    expect(res.text).toContain('redirect stripped')
  })

  test('passes through non-HTML content unchanged', async () => {
    const res = await request(app).get('/embed?url=http://example.com/test.txt')

    expect(res.statusCode).toBe(200)
    expect(res.text).toBe('Hello, allOrigins! 👽')
  })

  test('strips location.replace and neutralizes iframe-buster', async () => {
    const res = await request(app).get(
      '/embed?url=http://iframe.test/wrap.html',
    )

    expect(res.statusCode).toBe(200)
    expect(res.text).not.toContain('window.location.replace')
    expect(res.text).toContain('window.self !== window.self')
    expect(res.text).toContain('redirect stripped')
  })

  test('rewrites absolute iframe src to /embed proxy', async () => {
    const res = await request(app).get(
      '/embed?url=http://iframe.test/wrap.html',
    )

    expect(res.statusCode).toBe(200)
    expect(res.text).toContain('/embed?url=https%3A%2F%2Fabyssplayer.com%2Fx')
    expect(res.text).not.toContain('src="https://abyssplayer.com')
  })

  test('rewrites relative script src to absolute', async () => {
    const res = await request(app).get(
      '/embed?url=http://iframe.test/wrap.html',
    )

    expect(res.statusCode).toBe(200)
    expect(res.text).toContain('src="http://iframe.test/script.min.js"')
  })

  test('noads strips ad overlay, ad scripts, and tracking', async () => {
    const res = await request(app).get(
      '/embed?url=http://ads.test/page.html&noads=1',
    )

    expect(res.statusCode).toBe(200)
    // Ad popup overlay removed
    expect(res.text).not.toContain('yellowishgather')
    expect(res.text).not.toContain('Klik untuk main')
    // Ad scripts removed
    expect(res.text).not.toContain('script.min.js')
    expect(res.text).not.toContain('googletagmanager')
    // Cloudflare challenge script removed
    expect(res.text).not.toContain('contentDocument')
    // Player iframe still present
    expect(res.text).toContain('embed-container')
    expect(res.text).toContain('/embed?url=')
  })

  test('noads does not strip when param absent', async () => {
    const res = await request(app).get('/embed?url=http://ads.test/page.html')

    expect(res.statusCode).toBe(200)
    expect(res.text).toContain('yellowishgather')
    expect(res.text).toContain('script.min.js')
  })
})
