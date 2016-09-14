'use strict'
// **Github:** https://github.com/teambition/smart-limiter
//
// **License:** MIT

var Limiter = require('thunk-ratelimiter')

module.exports = function smartLimiter (opts) {
  if (!opts || typeof opts.getId !== 'function') throw new Error('getId function required')
  if (!opts.policy || opts.policy.constructor !== Object) throw new Error('policy required')

  var getId = opts.getId

  var redis = opts.redis
  if (!redis) redis = []
  else if (!Array.isArray(redis)) redis = [redis]

  var policy = Object.create(null)
  Object.keys(opts.policy).map(function (key) {
    policy[key] = opts.policy[key]
  })

  var limiter = new Limiter({
    prefix: opts.prefix,
    duration: opts.duration
  })

  limiter.connect.apply(limiter, redis)
  limit.remove = function (req, callback) {
    var args = getArgs(req)
    if (!args) return callback()
    limiter.remove(args[0])(callback)
  }

  return limit

  function limit (req, res, next) {
    var args = getArgs(req)
    if (!args) return next()
    limiter.get(args)(function (err, limit) {
      if (err) return next(err)

      res.set('x-ratelimit-limit', limit.total)
      res.set('x-ratelimit-remaining', limit.remaining - 1)
      res.set('x-ratelimit-reset', Math.ceil(limit.reset / 1000))

      if (limit.remaining) return next()

      var after = Math.ceil((limit.reset - Date.now()) / 1000)
      res.set('retry-after', after)
      res.status(429).send('Rate limit exceeded, retry in ' + after + ' seconds')
    })
  }

  function getArgs (req) {
    var id = getId.call(req, req)
    if (!id) return null

    var method = req.method
    var pathname = req.path
    var limitKey = method + ' ' + pathname
    if (!policy[limitKey]) {
      limitKey = pathname
      if (!policy[limitKey]) {
        limitKey = method
        if (!policy[limitKey]) return null
      }
    }

    var args = policy[limitKey]
    if (Array.isArray(args)) args = args.slice()
    else args = [args]
    args.unshift(id + limitKey)
    return args
  }
}
