'use strict'
// **Github:** https://github.com/teambition/smart-limiter
//
// **License:** MIT

const thunk = require('thunks').thunk
const Limiter = require('thunk-ratelimiter')
const slice = Array.prototype.slice

module.exports = function (opts) {
  checkOpts(opts)
  const policy = createPolicy(opts.policy)
  const limiter = opts.limiter || createLimiter(opts.redis, opts.prefix, opts.duration)

  function middleware (req, res, next) {
    const args = getArgs(req, opts.getId, policy)
    if (!args) return next()

    thunk(limiter.get(args))(function (err, limit) {
      if (err) return next(err)

      res.set('x-ratelimit-limit', limit.total)
      res.set('x-ratelimit-remaining', limit.remaining)
      res.set('x-ratelimit-reset', Math.ceil(limit.reset / 1000))

      if (limit.remaining >= 0) return next()

      const after = Math.ceil((limit.reset - Date.now()) / 1000)
      res.set('retry-after', after)
      res.status(429).send(`Rate limit exceeded, retry in ${after} seconds`)
    })
  }

  middleware.get = function (id, max, duration) {
    return limiter.get(slice.call(arguments))
  }

  middleware.remove = function (req, callback) {
    const args = getArgs(req, opts.getId, policy)
    if (!args) return callback()
    thunk(limiter.remove(args[0]))(callback)
  }

  return middleware
}

module.exports.express = module.exports

module.exports.koa = function smartLimiter (opts) {
  checkOpts(opts)
  const policy = createPolicy(opts.policy)
  const limiter = opts.limiter || createLimiter(opts.redis, opts.prefix, opts.duration)

  function * middleware (next) {
    const args = getArgs(this, opts.getId, policy)
    if (!args) return yield next

    const limit = yield limiter.get(args)
    this.set({
      'x-ratelimit-limit': limit.total,
      'x-ratelimit-remaining': limit.remaining,
      'x-ratelimit-reset': Math.ceil(limit.reset / 1000)
    })

    if (limit.remaining >= 0) return yield next

    const after = Math.ceil((limit.reset - Date.now()) / 1000)
    this.set('retry-after', after)
    this.status = 429
    this.body = `Rate limit exceeded, retry in ${after} seconds`
  }

  middleware.get = function (id, max, duration) {
    return limiter.get(slice.call(arguments))
  }

  middleware.remove = function (req) {
    const args = getArgs(req, opts.getId, policy)
    if (!args) return Promise.resolve()
    return limiter.remove(args[0])
  }

  return middleware
}

module.exports.koav2 = function (opts) {
  checkOpts(opts)
  const policy = createPolicy(opts.policy)
  const limiter = opts.limiter || createLimiter(opts.redis, opts.prefix, opts.duration)

  function middleware (ctx, next) {
    const args = getArgs(ctx, opts.getId, policy)
    if (!args) return next()

    return thunk.promise(limiter.get(args)).then((limit) => {
      ctx.set({
        'x-ratelimit-limit': limit.total,
        'x-ratelimit-remaining': limit.remaining,
        'x-ratelimit-reset': Math.ceil(limit.reset / 1000)
      })

      if (limit.remaining >= 0) return next()
      const after = Math.ceil((limit.reset - Date.now()) / 1000)
      ctx.set('retry-after', after)
      ctx.status = 429
      ctx.body = `Rate limit exceeded, retry in ${after} seconds`
    })
  }

  middleware.get = function (id, max, duration) {
    return limiter.get(slice.call(arguments))
  }

  middleware.remove = function (req) {
    const args = getArgs(req, opts.getId, policy)
    if (!args) return Promise.resolve()
    return limiter.remove(args[0])
  }

  return middleware
}

function checkOpts (opts) {
  if (!opts || typeof opts.getId !== 'function') throw new Error('getId function required')
  if (!opts.policy || opts.policy.constructor !== Object) throw new Error('policy required')
}

function createPolicy (policyOpts) {
  const policy = Object.create(null)
  Object.keys(policyOpts).map(function (key) {
    policy[key] = policyOpts[key]
  })

  return policy
}

function createLimiter (redis, prefix, duration) {
  if (!redis) redis = []
  else if (!Array.isArray(redis)) redis = [redis]

  const limiter = new Limiter({ prefix, duration })

  limiter.connect.apply(limiter, redis)

  return limiter
}

function getArgs (req, getId, policy) {
  const id = getId.call(req, req)
  if (!id) return null

  const method = req.method
  const pathname = req.path
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
