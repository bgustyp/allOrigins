import getPage from './get-page.js'

// ponytail: regex strip is fragile — covers common redirect patterns.
// Misses obfuscated redirects (eval, atob, setTimeout(function(){location=...})).
// Upgrade to a proper JS parser if sites start obfuscating.
const REDIRECT_PATTERNS = [
  // window/document.location = "url" or location.href = "url"
  /(?:window|document)\.location(?:\.href)?\s*=\s*["'`]https?:\/\/[^"'`]+["'`]/g,
  // window/document.location.replace("url")
  /(?:window|document)\.location\.replace\(["'`]https?:\/\/[^"'`]+["'`]\)/g,
  // location.replace("url")
  /location\.replace\(["'`]https?:\/\/[^"'`]+["'`]\)/g,
]

// iframe-buster: if (window.self === window.top) { redirect }
// Neutralize the condition so the redirect block never runs
const IFRAME_BUSTER_RE = /window\.self\s*===\s*window\.top/g

// Anti-devtools: debugger; statement pauses browser when DevTools is open
const DEBUGGER_RE = /\bdebugger\s*;?/g

// Rewrite absolute iframe src to proxy through /embed
const IFRAME_SRC_RE = /(<iframe[^>]+src=")(https?:\/\/[^"]+)(")/gi

// Rewrite relative script src to absolute (based on target URL)
const RELATIVE_SCRIPT_RE = /(<script[^>]+src=")(\/[^"]+)(")/gi

// Neutralize SPA path checks (gn1r5n.org/cast): if (path.indexOf('/e/') !== 0) { return; }
// Makes path check always pass so embed mode activates regardless of proxy path
const PATH_CHECK_RE = /path\.indexOf\(['"]\/[^'"]+['"]\)\s*!==\s*0/g

// noads: strip ad elements — popup overlay, ad scripts, tracking beacons
// Matches the specific ad structures found in videonode.de and emturbovid.com
const NOADS_PATTERNS = [
  // Popup ad overlay: <a id="uyeouyeo" ...>...</a>
  /<a\s+id="uyeouyeo"[^>]*>[\s\S]*?<\/a>/gi,
  // Ad/tracking scripts: script.min.js, googletagmanager, adsbygoogle, cloudflareinsights, yandex metrika
  /<script[^>]*src="[^"]*(?:script\.min\.js|googletagmanager|adsbygoogle|pagead2|cloudflareinsights|beacon\.min|mc\.yandex\.ru\/metrika)[^"]*"[^>]*><\/script>/gi,
  // Cloudflare challenge injected script (creates hidden iframe for bot detection)
  /<script>\(function\(\)\{function c\(\)\{[\s\S]*?<\/script>/gi,
  // Yandex.Metrika inline counter script
  /<script[^>]*>\s*\(function\(m,e,t,r,i,k,a\)[\s\S]*?<\/script>/gi,
  // Google Analytics gtag inline config script
  /<script[^>]*>\s*window\.dataLayer[\s\S]*?gtag\('config'[\s\S]*?<\/script>/gi,
  // Yandex.Metrika noscript tracking pixel
  /<noscript><div><img[^>]*mc\.yandex\.ru\/watch[^>]*><\/div><\/noscript>/gi,
  // Inline ad overlay script (playcdn.de pattern): "use strict";document.addEventListener("DOMContentLoaded"...adLastClicked...
  /<script>"use strict";document\.addEventListener\("DOMContentLoaded"[\s\S]*?<\/script>/gi,
]

// noads: neutralize dynamic ad loading (emturbovid.com pattern)
// Force custom_ads array to stay empty so VAST/popunder/direct ads never load
const NOADS_NEUTRALIZE_RE = /const\s+custom_ads\s*=\s*\[\]/g

// noads: neutralize popunder window.open calls to ad networks
const NOADS_POPUNDER_RE =
  /(?:window\.open|openNewTab)\(["']https?:\/\/(?:ad\.twinrdengine|xapi\.juicyads)[^)]+\)/gi

export default async function embedRequest(req, res) {
  const params = {
    url: req.query.url,
    format: 'raw',
    requestMethod: req.method === 'HEAD' ? 'HEAD' : 'GET',
    ...req.query,
  }

  if (params.requestMethod === 'OPTIONS') {
    return res.end()
  }

  const page = await getPage(params)

  if (page.status && page.status.error) {
    res.set('Content-Type', 'application/json; charset=utf-8')
    return res.send(Buffer.from(JSON.stringify(page)))
  }

  let content = Buffer.from(page.content)
  const contentType = page.contentType || 'text/html; charset=utf-8'

  if (contentType.includes('text/html')) {
    let html = content.toString()

    // Strip all redirect patterns
    for (const re of REDIRECT_PATTERNS) {
      html = html.replace(re, '/* redirect stripped */')
    }

    // Strip debugger; statements (anti-devtools)
    html = html.replace(DEBUGGER_RE, '/* debugger stripped */')

    // Neutralize iframe-buster: self === top → self !== self (always false)
    html = html.replace(IFRAME_BUSTER_RE, 'window.self !== window.self')

    // Neutralize SPA path checks so embed mode activates on any proxy path
    html = html.replace(PATH_CHECK_RE, 'false')

    // Rewrite absolute iframe src to /embed?url=
    const targetUrl = params.url
    const targetOrigin = (() => {
      try {
        return new URL(targetUrl).origin
      } catch {
        return ''
      }
    })()

    // Rewrite absolute iframe src to /embed?url= (absolute to proxy origin)
    // Must be absolute so <base href> doesn't redirect it to target
    const proxyOrigin = `${req.protocol}://${req.get('host')}`
    html = html.replace(IFRAME_SRC_RE, (_match, prefix, srcUrl, suffix) => {
      const cleanUrl = srcUrl.replace(/&amp;/g, '&')
      return `${prefix}${proxyOrigin}/embed?url=${encodeURIComponent(cleanUrl)}${suffix}`
    })

    // Rewrite relative script src to absolute URL
    // Only inject <base> if we actually rewrote relative scripts (P2P/CAST pattern).
    // Sites with all-absolute URLs (turbovip) don't need <base> and it breaks their ../paths.
    if (targetOrigin) {
      // Detect relative script src: "js/...", "/js/...", "assets/..." (no http:// prefix)
      const hadRelativeScripts = /<script[^>]+src="(?!https?:\/\/)[^"]+"/i.test(
        html,
      )
      html = html.replace(
        RELATIVE_SCRIPT_RE,
        (_match, prefix, path, suffix) =>
          `${prefix}${targetOrigin}${path}${suffix}`,
      )

      if (hadRelativeScripts && !html.includes('<base ')) {
        html = html.replace(
          /<head[^>]*>/i,
          (match) => `${match}<base href="${targetOrigin}/">`,
        )
      }

      // Inject fetch/XHR shim: routes target-origin API calls through /raw?url=
      // Without this, player JS API calls (P2P token resolve, CAST SPA API) get
      // rejected by target server due to wrong Referer header from localhost.
      // ponytail: only intercepts target-origin requests; CDN/3rd-party requests pass through.
      const shim = `<script>(function(){var T="${targetOrigin}",P="${proxyOrigin}/raw?url=";var f=window.fetch;window.fetch=function(u,i){if(typeof u==="string"){if(u.indexOf(T)===0)u=P+encodeURIComponent(u);else if(u.indexOf("http")!==0)u=P+encodeURIComponent(new URL(u,T).href)}return f.call(this,u,i)};var o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var a=Array.from(arguments);if(u){if(u.indexOf(T)===0)a[1]=P+encodeURIComponent(u);else if(u.indexOf("http")!==0)a[1]=P+encodeURIComponent(new URL(u,T).href)}return o.apply(this,a)}})();</script>`
      html = html.replace(/<head[^>]*>/i, (match) => `${match}${shim}`)
    }

    // noads: strip ad elements, ad scripts, and tracking beacons
    if (params.noads) {
      for (const re of NOADS_PATTERNS) {
        html = html.replace(re, '<!-- noads: stripped -->')
      }
      // Neutralize dynamic ad loading: freeze custom_ads so push() is a no-op
      html = html.replace(
        NOADS_NEUTRALIZE_RE,
        'const custom_ads = []; Object.freeze(custom_ads); custom_ads.push = () => 0',
      )
      // Neutralize popunder window.open to ad networks
      html = html.replace(NOADS_POPUNDER_RE, '/* noads: popunder blocked */')
    }

    content = Buffer.from(html)
  }

  res.set({
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(content),
    'Cache-control': 'public, max-age=3600, stale-if-error=600',
  })

  res.send(content)
}
