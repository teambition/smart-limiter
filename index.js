'use strict'
// **Github:** https://github.com/teambition/smart-limiter
//
// **License:** MIT

const thunk = require('thunks').thunk
const Limiter = require('thunk-ratelimiter')

module.exports = function (opts) {
  checkOpts(opts)
  let policy = createPolicy(opts.policy)
  let limiter = createLimiter(opts.redis, opts.prefix, opts.duration)

  limit.remove = function (req, callback) {
    let args = getArgs(req, opts.getId, policy)
    if (!args) return callback()
    limiter.remove(args[0])(callback)
  }

  return limit

  function limit (req, res, next) {
    let args = getArgs(req, opts.getId, policy)
    if (!args) return next()

    limiter.get(args)(function (err, limit) {
      if (err) return next(err)

      res.set('x-ratelimit-limit', limit.total)
      res.set('x-ratelimit-remaining', limit.remaining)
      res.set('x-ratelimit-reset', Math.ceil(limit.reset / 1000))

      if (limit.remaining >= 0) return next()

      let after = Math.ceil((limit.reset - Date.now()) / 1000)
      res.set('retry-after', after)
      res.status(429).send(`Rate limit exceeded, retry in ${after} seconds`)
    })
  }
}

module.exports.express = module.exports

module.exports.koa = function smartLimiter (opts) {
  checkOpts(opts)
  let policy = createPolicy(opts.policy)
  let limiter = createLimiter(opts.redis, opts.prefix, opts.duration)

  return function * (next) {
    let args = getArgs(this, opts.getId, policy)
    if (!args) return yield next

    let limit = yield thunk.promise(limiter.get(args))
    this.set({
      'x-ratelimit-limit': limit.total,
      'x-ratelimit-remaining': limit.remaining,
      'x-ratelimit-reset': Math.ceil(limit.reset / 1000)
    })

    if (limit.remaining >= 0) return yield next

    let after = Math.ceil((limit.reset - Date.now()) / 1000)
    this.set('retry-after', after)
    this.status = 429
    this.body = `Rate limit exceeded, retry in ${after} seconds`
  }
}

module.exports.koav2 = function (opts) {
  checkOpts(opts)
  let policy = createPolicy(opts.policy)
  let limiter = createLimiter(opts.redis, opts.prefix, opts.duration)

  return (ctx, next) => {
    let args = getArgs(ctx, opts.getId, policy)
    if (!args) return next()

    return thunk.promise(limiter.get(args)).then((limit) => {
      ctx.set({
        'x-ratelimit-limit': limit.total,
        'x-ratelimit-remaining': limit.remaining,
        'x-ratelimit-reset': Math.ceil(limit.reset / 1000)
      })

      if (limit.remaining >= 0) return next()
      let after = Math.ceil((limit.reset - Date.now()) / 1000)
      ctx.set('retry-after', after)
      ctx.status = 429
      ctx.body = `Rate limit exceeded, retry in ${after} seconds`
    })
  }
}

function checkOpts (opts) {
  if (!opts || typeof opts.getId !== 'function') throw new Error('getId function required')
  if (!opts.policy || opts.policy.constructor !== Object) throw new Error('policy required')
}

function createPolicy (policyOpts) {
  let policy = Object.create(null)
  Object.keys(policyOpts).map(function (key) {
    policy[key] = policyOpts[key]
  })

  return policy
}

function createLimiter (redis, prefix, duration) {
  if (!redis) redis = []
  else if (!Array.isArray(redis)) redis = [redis]

  let limiter = new Limiter({ prefix, duration })

  limiter.connect.apply(limiter, redis)

  return limiter
}

function getArgs (req, getId, policy) {
  let id = getId.call(req, req)
  if (!id) return null

  let method = req.method
  let pathname = req.path
  let limitKey = `${method} ${pathname}`
  if (!policy[limitKey]) {
    limitKey = pathname
    if (!policy[limitKey]) {
      limitKey = method
      if (!policy[limitKey]) return null
    }
  }

  let args = policy[limitKey]
  if (Array.isArray(args)) args = args.slice()
  else args = [args]
  args.unshift(id + limitKey)
  return args
}
