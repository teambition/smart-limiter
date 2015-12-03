smart-limiter
==========
Smart rate limiter middleware for express.

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]

## Requirements

- Redis 2.8+ with thunk-redis client

## Installation

```
npm install smart-limiter
```

## Example

## API


## Responses

Example 200 with header fields:

```
HTTP/1.1 200 OK

Connection:keep-alive
Content-Length:2
Content-Type:text/plain; charset=utf-8
Date:Mon, 15 Jun 2015 16:23:29 GMT
X-Powered-By:Toa
X-RateLimit-Limit:10
X-RateLimit-Remaining:9
X-RateLimit-Reset:1434386009498

Hi
```

Example 429 with header fields:

```
HTTP/1.1 429 Too Many Requests

Connection:keep-alive
Content-Length:42
Content-Type:text/plain; charset=utf-8
Date:Mon, 15 Jun 2015 16:24:10 GMT
Retry-After:558
X-Powered-By:Toa
X-RateLimit-Limit:10
X-RateLimit-Remaining:0
X-RateLimit-Reset:1434386009498

Rate limit exceeded, retry in 558 seconds.
```


## Who's using

### [Teambition](https://www.teambition.com/)
1. Teambition community https://bbs.teambition.com/

[npm-url]: https://npmjs.org/package/smart-limiter
[npm-image]: http://img.shields.io/npm/v/smart-limiter.svg

[travis-url]: https://travis-ci.org/teambition/smart-limiter
[travis-image]: http://img.shields.io/travis/teambition/smart-limiter.svg
