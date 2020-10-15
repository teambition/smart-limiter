'use strict'
// **Github:** https://github.com/teambition/smart-limiter
//
// **License:** MIT

const tman = require('tman')
const assert = require('assert')
const thunk = require('thunks')()
const express = require('express')
const koa = require('koa')
const request = require('supertest')
const redis = require('thunk-redis')
const smartLimiter = require('../index')

const redisClient = redis.createClient()

tman.suite('smart-limiter', function () {
  this.timeout(10000)

  tman.it('should throw error with wrong options', function () {
    assert.throws(function () {
      smartLimiter({})
    })

    assert.throws(function () {
      smartLimiter({
        getId: 'test'
      })
    })

    assert.throws(function () {
      smartLimiter({
        getId: function (req) {},
        policy: []
      })
    })
  })

  const frameworksToTest = {
    express: {
      constructor: express,
      helloMiddleware: function (req, res) { res.send('Hello') },
      getId: function (req) { return req.ip }
    },
    koav2: {
      constructor: koa,
      helloMiddleware: function (ctx, next) { ctx.body = 'Hello' },
      getId: function (ctx) { return ctx.ip }
    }
  }

  Object.keys(frameworksToTest).forEach(function (frameworkName) {
    tman.suite(`${frameworkName} middleware`, function () {
      tman.beforeEach(function (done) {
        redisClient.keys('*LIMIT:*')(function (err, keys) {
          if (err) throw err
          return thunk.all(keys.map(function (key) {
            return redisClient.del(key)
          }))
        })(done)
      })

      tman.it('should work without redis options', function () {
        const app = new frameworksToTest[frameworkName].constructor()
        app.use(smartLimiter[frameworkName]({
          duration: 500,
          policy: {
            GET: 5
          },
          getId: frameworksToTest[frameworkName].getId
        }))

        app.use(frameworksToTest[frameworkName].helloMiddleware)

        const now = Date.now() / 1000
        const after = (Date.now() + 500) / 1000
        return request(app.listen())
          .get('/')
          .expect(200)
          .expect(function (res) {
            assert.strictEqual(res.text, 'Hello')
            assert.strictEqual(res.headers['x-ratelimit-limit'], '5')
            assert.strictEqual(res.headers['x-ratelimit-remaining'], '4')
            assert.strictEqual(+res.headers['x-ratelimit-reset'] > now, true)
            assert.strictEqual(+res.headers['x-ratelimit-reset'] <= Math.ceil(after), true)
          })
      })

      tman.it('should work with simple options', function (done) {
        const app = new frameworksToTest[frameworkName].constructor()
        app.use(smartLimiter[frameworkName]({
          redis: redisClient,
          getId: frameworksToTest[frameworkName].getId,
          policy: {
            GET: [3, 1000]
          }
        }))

        app.use(frameworksToTest[frameworkName].helloMiddleware)

        const now = Date.now() / 1000
        const after = (Date.now() + 1000) / 1000
        const server = app.listen()
        thunk.all([
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.text, 'Hello')
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '2')
              assert.strictEqual(+res.headers['x-ratelimit-reset'] > now, true)
              assert.strictEqual(+res.headers['x-ratelimit-reset'] <= Math.ceil(after), true)
            }),
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
            }),
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
            }),
          request(server)
            .get('/')
            .expect(429)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
            }),
          request(server)
            .get('/')
            .expect(429)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
            })
        ])(done)
      })

      tman.it('should work with vary policy', function (done) {
        const app = new frameworksToTest[frameworkName].constructor()
        app.use(smartLimiter[frameworkName]({
          duration: 1000,
          redis: redisClient,
          getId: frameworksToTest[frameworkName].getId,
          policy: {
            GET: [5, 500],
            'GET /path1': [4, 500],
            '/path2': 3
          }
        }))

        app.use(frameworksToTest[frameworkName].helloMiddleware)

        const server = app.listen()

        thunk.all([
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.text, 'Hello')
              assert.strictEqual(res.headers['x-ratelimit-limit'], '5')
            }),
          request(server)
            .get('/path1')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.text, 'Hello')
              assert.strictEqual(res.headers['x-ratelimit-limit'], '4')
            }),
          request(server)
            .get('/path2')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.text, 'Hello')
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
            }),
          request(server)
            .post('/')
            .send({})
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.text, 'Hello')
              assert.strictEqual(res.headers['x-ratelimit-limit'], undefined)
            })
        ])(done)
      })

      tman.it('should work with multiple policy', function (done) {
        const app = new frameworksToTest[frameworkName].constructor()
        app.use(smartLimiter[frameworkName]({
          redis: redisClient,
          getId: frameworksToTest[frameworkName].getId,
          policy: {
            GET: [3, 500, 2, 1000, 1, 1000]
          }
        }))

        app.use(frameworksToTest[frameworkName].helloMiddleware)

        const server = app.listen()
        // policy [3, 500]
        thunk.all([
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '2')
            }),
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
            }),
          request(server)
            .get('/path2')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
            }),
          request(server)
            .get('/')
            .expect(429)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
            }),
          thunk.delay(600)
        ])(function () {
          // policy [2, 1000]
          return thunk.all([
            request(server)
              .get('/')
              .expect(200)
              .expect(function (res) {
                assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
                assert.strictEqual(res.headers['x-ratelimit-remaining'], '1')
              }),
            request(server)
              .get('/')
              .expect(200)
              .expect(function (res) {
                assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
                assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
              }),
            request(server)
              .get('/path2')
              .expect(429)
              .expect(function (res) {
                assert.strictEqual(res.headers['x-ratelimit-limit'], '2')
                assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
              }),
            thunk.delay(1100)
          ])
        })(function () {
          // policy [1, 1000]
          return thunk.all([
            request(server)
              .get('/')
              .expect(200)
              .expect(function (res) {
                assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
                assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
              }),
            request(server)
              .get('/')
              .expect(429)
              .expect(function (res) {
                assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
                assert.strictEqual(res.headers['x-ratelimit-remaining'], '-1')
              }),
            // this delay exceed policy duration(1000 * 2), will restore to default policy
            thunk.delay(2100)
          ])
        })(function () {
          // return to default policy [3, 500]
          return request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '3')
            })
        })(done)
      })

      tman.it('should remove rate limit data', function (done) {
        if (frameworkName !== 'express') return done()
        const app = frameworksToTest[frameworkName].constructor()
        const limiter = smartLimiter[frameworkName]({
          redis: redisClient,
          getId: frameworksToTest[frameworkName].getId,
          policy: {
            GET: [1, 500]
          }
        })
        app.use(limiter)
        app.use(function (req, res, next) {
          limiter.remove(req, function (err, res) {
            assert.strictEqual(err, null)
            assert.strictEqual(res, 1)
            next()
          })
        })
        app.use(frameworksToTest[frameworkName].helloMiddleware)

        const server = app.listen()
        thunk.seq([
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.text, 'Hello')
              assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
            }),
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
            }),
          request(server)
            .get('/')
            .expect(200)
            .expect(function (res) {
              assert.strictEqual(res.headers['x-ratelimit-limit'], '1')
              assert.strictEqual(res.headers['x-ratelimit-remaining'], '0')
            })
        ])(done)
      })
    })
  })
})
