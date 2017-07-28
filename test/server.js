const Koa = require('koa')

const path = require('path')

const app = new Koa()

const middleware = require('../index')

app.use(middleware({
    imgRoot: path.join(__dirname, './'),
    maxAge: 1000,
    isweak: true
}))

app.use(async(ctx, next) => {
    ctx.throw(404, 'Not Found')
})

module.exports = app.listen()