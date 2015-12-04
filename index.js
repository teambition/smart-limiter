'use strict'
// **Github:** https://github.com/teambition/smart-limiter
//
// **License:** MIT

var Limiter = require('thunk-ratelimiter')

module.exports = function smartLimiter (opts) {
  // opts = {
  //   redis: null,
  //   prefix: opts.prefix,
  //   getKey: null,
  //   duration: opts.duration,
  //   policy: opts.max
  // }

  if (!opts || typeof opts.getId !== 'function') throw new Error('getKey function required')
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

  return function limit (req, res, next) {
    var id = getId.call(this, req)
    if (!id) return next()

    var method = req.method
    var pathname = req.path
    var limitKey = method + ' ' + pathname
    if (!policy[limitKey]) {
      limitKey = pathname
      if (!policy[limitKey]) {
        limitKey = method
        if (!policy[limitKey]) return next()
      }
    }

    var args = policy[limitKey]
    if (Array.isArray(args)) args = args.slice()
    else args = [args]
    args.unshift(id + limitKey)

    limiter.get(args)(function (err, limit) {
      if (err) return next(err)

      res.set('X-RateLimit-Limit', limit.total)
      res.set('X-RateLimit-Remaining', limit.remaining - 1)
      res.set('X-RateLimit-Reset', Math.ceil(limit.reset / 1000))

      if (limit.remaining) return next()

      var after = Math.ceil((limit.reset - Date.now()) / 1000)
      res.set('Retry-After', after)
      res.status(429).send('Rate limit exceeded, retry in ' + after + ' seconds')
    })
  }
}
