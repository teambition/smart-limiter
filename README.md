# smart-limiter

Smart rate limiter middleware for both express and koa.

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Downloads][downloads-image]][downloads-url]

## Requirements

- Redis 2.8+ with thunk-redis client

## Installation

```sh
npm install smart-limiter
```

## Example

### koa v2

```js
'use strict'

const Koa = require('koa')
const smartLimiter = require('smart-limiter')

const app = new Koa()

app.use(smartLimiter.koav2({
  redis: 6379,
  duration: 10000,
  getId: function (ctx) {
    return ctx.ip
  },
  policy: {
    'GET': [3, 5000],
    'GET /test': [3, 5000, 3, 10000],
    '/test': 5
  }
}))

app.use((ctx) => {
  ctx.body = ctx.headers
})

app.listen(3000)
console.log('Start at 3000')
```

### express

```js
'use strict'

const express = require('express')
const smartLimiter = require('smart-limiter')

const app = express()

app.use(function (req, res, next) {
  if (req.path !== '/favicon.ico') return next()
  res.end()
})

app.use(smartLimiter({
  redis: 6379,
  duration: 10000,
  getId: function (req) {
    return req.ip
  },
  policy: {
    'GET': [3, 5000],
    'GET /test': [3, 5000, 3, 10000],
    '/test': 5
  }
}))

app.use(function (req, res) {
  res.json(res._headers)
})

app.listen(3000)
console.log('Start at 3000')
```

### koa v1

```js
'use strict'

const Koa = require('koa')
const smartLimiter = require('smart-limiter')

const app = new Koa()

app.use(smartLimiter.koa({
  redis: 6379,
  duration: 10000,
  getId: function (ctx) {
    return ctx.ip
  },
  policy: {
    'GET': [3, 5000],
    'GET /test': [3, 5000, 3, 10000],
    '/test': 5
  }
}))

app.use(function * () {
  this.body = this.headers
})

app.listen(3000)
console.log('Start at 3000')
```

## API

```js
var smartLimiter = require('smart-limiter')
```

### smartLimiter(options)

```js
const limiter = smartLimiter({
  redis: thunkRedisClient,
  duration: 10000,
  getId: function (req) {
    return req.ip
  },
  policy: {
    'GET': [3, 5000],
    'GET /test': [3, 5000, 3, 10000],
    '/test': 5
  }
})
app.use(limiter)
```

return a express middleware.

- `options.prefix`: *Optional*, Type: `String`, redis key namespace, default to `LIMIT`.
- `options.redis`: *Optional*, {Mix}, thunk-redis instance or [thunk-redis options](https://github.com/thunks/thunk-redis#api-more)
- `options.duration`: *Optional*, {Number}, of limit in milliseconds, default to `3600000`
- `options.getId`: *Required*, {Function}, generate a identifier for requests
- `options.policy`: *Required*, {Object}, limit policy

    **policy key:**
    It support 3 types: `METHOD /path`, `/path` and `METHOD`. Limiter will try match `METHOD /path` first, then `/path`, then `METHOD`. It means that `METHOD /path` has highest priority, then fallback to `/path` and `METHOD`.

    **policy value:**
    If value is a member, it means max count with `options.duration`. If value is array, it should be a pair of `max` and `duration`, support one more pairs.

    The first pair is default limit policy. If someone touch the maximum of default limit,
    then the next policy will be apply, and so on. So next policy should be stricter than previous one.

    If someone touch the maximum of limit and request again after double current `duration` time, it will rollback to default policy.

    **example policy:**
    ```js
    options.policy = {
      'HEAD': 100,
      'GET': [60, 60000, 30, 60000, 30, 120000],
      'PUT': [40, 60000, 20, 60000, 10, 120000],
      'POST': [40, 60000, 10, 60000],
      'DELETE': [40, 60000, 10, 60000],
      'POST /api/organizations': [10, 60000, 2, 60000],
      'POST /api/projects': [20, 60000, 5, 60000],
      '/api/auth': [10, 60000, 5, 120000],
    }
    ```

### limiter.get(id, max, duration, max, duration...) => Promise

Return a promise that guarantee a limiter result. it support more `max` and `duration` pairs ad limit policy. The first pairs will be used as default. If some trigger limit, then the limiter will apply the next pair policy.

### limiter.remove(req, callback)
### limiter.remove(req) => Promise

Remove `req`'s rate limit data. Only available when using express middleware.

```js
limiter.remove(req, function (err, res) {
  console.log(err, res) // null, 1
})
```

## Responses

Example 200 with header fields:

```text
HTTP/1.1 200 OK

Connection:keep-alive
Content-Length:111
Content-Type:application/json; charset=utf-8
Date:Thu, 10 Dec 2015 13:21:55 GMT
X-Powered-By:Express
X-RateLimit-Limit:3
X-RateLimit-Remaining:2
X-RateLimit-Reset:1449753721
```

Example 429 with header fields:

```text
HTTP/1.1 429 Too Many Requests

Connection:keep-alive
Content-Length:39
Content-Type:text/html; charset=utf-8
Date:Thu, 10 Dec 2015 13:22:36 GMT
Retry-After:3
X-Powered-By:Express
X-RateLimit-Limit:3
X-RateLimit-Remaining:-1
X-RateLimit-Reset:1449753759
```

[npm-url]: https://npmjs.org/package/smart-limiter
[npm-image]: http://img.shields.io/npm/v/smart-limiter.svg

[travis-url]: https://travis-ci.org/teambition/smart-limiter
[travis-image]: http://img.shields.io/travis/teambition/smart-limiter.svg

[downloads-url]: https://npmjs.org/package/smart-limiter
[downloads-image]: http://img.shields.io/npm/dm/smart-limiter.svg?style=flat-square
