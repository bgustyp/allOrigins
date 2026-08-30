All Origins
=======

Pull contents from any page via API (as JSON/P or raw) and avoid [Same-origin policy](https://en.wikipedia.org/wiki/Same-origin_policy) problems.

----

A free and open source javascript clone of [AnyOrigin](https://web.archive.org/web/20180807170914/http://anyorigin.com/), inspired by [Whatever Origin](http://WhateverOrigin.org), but with support to gzipped pages.

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `/get` | Fetch page contents as JSON (with metadata) |
| `/raw` | Fetch raw page contents with CORS headers |
| `/json` | Fetch page contents as JSON (raw, no metadata wrapper) |
| `/info` | Fetch page metadata only (content-type, status, etc.) |
| `/embed` | Fetch HTML page with redirect stripping, iframe rewriting, and ad removal |

### Examples

To `fetch` data from http://wikipedia.org:

```js
fetch(`https://api.allorigins.win/get?url=${encodeURIComponent('https://wikipedia.org')}`)
  .then(response => {
    if (response.ok) return response.json()
    throw new Error('Network response was not ok.')
  })
  .then(data => console.log(data.contents));
```

Or with jQuery

```js
$.getJSON('https://api.allorigins.win/get?url=' + encodeURIComponent('https://wikipedia.org'), function (data) {
    alert(data.contents);
});
```

### Options

###### charset
**Description:** Set the response character encoding (charset)  
**Example:** `https://api.allorigins.win/get?charset=ISO-8859-1&url=https://pt.wikipedia.org/`

###### raw
**Description:** Get the raw contents ([CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS))  
**Example:** `https://api.allorigins.win/raw?url=https://example.org/`

###### callback
**Description:** Get a [JSONP](https://www.w3schools.com/js/js_json_jsonp.asp) response  
**Example:** `https://api.allorigins.win/get?callback=myFunc&url=https://example.org/`

### /embed endpoint

Fetches an HTML page and processes it for safe embedding in an iframe:

- Strips JavaScript redirects (`window.location`, `location.replace`)
- Neutralizes iframe-buster scripts (`window.self === window.top`)
- Strips `debugger;` statements (anti-devtools)
- Rewrites absolute iframe `src` to proxy through `/embed`
- Rewrites relative script `src` to absolute URLs
- Injects `<base href>` for relative URL resolution (when needed)
- Patches `fetch`/`XMLHttpRequest` to route target-origin API calls through `/raw`

###### noads
**Description:** Strip ad elements, ad scripts, tracking beacons, and neutralize dynamic ad loading  
**Example:** `https://api.allorigins.win/embed?url=https://example.org/&noads=1`

### On your own server

```sh
# Clone the repo
git clone https://github.com/bgustyp/allOrigins

# Install dependencies (requires Node >= 22 and Yarn 4)
cd allOrigins
yarn install

# Fire it up!
yarn start  # the default port is 1458
```

### Docker

```sh
docker build -t allorigins .
docker run -p 1458:1458 allorigins
```

## License
MIT
