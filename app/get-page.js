import { got } from './http-client.js'
import iconv from 'iconv-lite'
import QuickLRU from 'quick-lru'

// ponytail: app-level LRU cache replaces got's built-in cache.
// got's cache goes through cacheable-request → Keyv, whose EventManager.once()
// wraps the listener so removeListener() silently fails — one leaked error
// listener per request. Caching at this level avoids that code path entirely.
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const cache = new QuickLRU({ maxSize: 1000, maxAge: CACHE_TTL })

export default getPage

function getPage({ url, format, requestMethod, charset, disableCache }) {
  const cacheKey = `${format}:${requestMethod}:${url}:${charset || ''}`
  if (!disableCache && cache.has(cacheKey)) return cache.get(cacheKey)

  let result
  if (format === 'info' || requestMethod === 'HEAD') {
    result = getPageInfo(url)
  } else if (format === 'raw') {
    result = getRawPage(url, requestMethod, charset)
  } else {
    result = getPageContents(url, requestMethod, charset)
  }

  if (!disableCache) {
    result = Promise.resolve(result).then((page) => {
      if (!(page.status || {}).error) cache.set(cacheKey, page)
      return page
    })
  }

  return result
}

async function getPageInfo(url) {
  const { response, error } = await request(url, 'HEAD')
  if (error) return processError(error)

  return {
    url: url,
    content_type: response.headers['content-type'],
    content_length: +response.headers['content-length'] || -1,
    http_code: response.statusCode,
  }
}

async function getRawPage(url, requestMethod, charset) {
  const { content, response, error } = await request(
    url,
    requestMethod,
    true,
    charset,
  )
  if (error) return processError(error)

  const contentLength = Buffer.byteLength(content)
  return {
    content,
    contentType: response.headers['content-type'],
    contentLength,
  }
}

async function getPageContents(url, requestMethod, charset) {
  const { content, response, error } = await request(
    url,
    requestMethod,
    false,
    charset,
  )
  if (error) return processError(error)

  const contentLength = Buffer.byteLength(content)
  return {
    contents: Buffer.from(content).toString(),
    status: {
      url: url,
      content_type: response.headers['content-type'],
      content_length: contentLength,
      http_code: response.statusCode,
    },
  }
}

async function request(url, requestMethod, raw = false, charset = null) {
  try {
    const options = {
      method: requestMethod,
      decompress: !raw,
    }

    const response = await got(url, options)
    if (options.method === 'HEAD') return { response }

    return processContent(response, charset)
  } catch (error) {
    return { error }
  }
}

async function processContent(response, charset) {
  const res = { response: response, content: response.body }
  if (charset && iconv.encodingExists(charset)) {
    res.content = iconv.decode(res.content, charset)
  }
  return res
}

async function processError(e) {
  const { response } = e
  if (!response)
    return {
      contents: null,
      status: { error: { message: e.message, code: e.code } },
    }

  const { url, statusCode: http_code, headers, body } = response
  const contentLength = Buffer.byteLength(body)

  return {
    contents: Buffer.from(body).toString(),
    status: {
      url,
      http_code,
      content_type: headers['content-type'],
      content_length: contentLength,
    },
  }
}
