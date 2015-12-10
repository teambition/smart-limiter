'use strict'
// **Github:** https://github.com/teambition/smart-limiter
//
// **License:** MIT

var express = require('express')
var smartLimiter = require('../index')

var app = express()

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
