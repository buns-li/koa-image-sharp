const debug = require('debug')('koa-image')

const imageServer = require('./lib/imageServer')

const fileStream = require('fs')

const path = require('path')

const MIMES = {
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.tiff': 'image/tiff'
}

/**
 * @param {Object} config 配置参数
 *      `imgRoot`: [`String`] 图片本地磁盘存放路径 **Required**
 *      `urlPrefix`:[`String|Array`] 可允许的路由前缀(Default:`imgs`) **Required**
 *      `allowExt`:[`String|Array`] 可允许的图片后缀(Default:`["png","jpg","jpeg","tiff","icon"]`)  **Required**
 *      `maxAge`:[`Number`] 资源缓存时间 (Default:60*60*24*7 = 7天)
 *      `isweak`:[`Boolean`] 是否使用弱ETag (Default:true)
 */
module.exports = function(config) {

    let imageSrv = imageServer(config)

    return async(ctx, next) => {

        if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
            return await next()
        }

        debug('current image request url:', ctx.url)

        let imgStatKV = await imageSrv.resolve(ctx.url, ctx.path, ctx.query)

        //拦截image请求
        if (imgStatKV === false) {
            return await next()
        }

        if (!imgStatKV.source && !imgStatKV.handled) {
            ctx.status = 404
            return
        }

        if (imgStatKV.handled) {

            debug('local handeld image path:', imgStatKV.handled.path)

            let etag = imageSrv.getETag(imgStatKV.handled)

            if (ctx.headers['if-none-match'] && ctx.headers['if-none-match'] === etag) {
                ctx.status = 304
                return
            }

            let lastModified = imgStatKV.handled.mtime.toUTCString()

            if (ctx.headers['if-modified-since'] && ctx.headers['if-modified-since'] === lastModified) {
                ctx.status = 304
                return
            }

            /**
             * 必须返回的response头内容
             */

            ctx.status = 200

            /**
             * 资源基础信息
             */
            ctx.length = imgStatKV.handled.size
            let ext = path.extname(imgStatKV.handled.path)
            ctx.type = MIMES[ext] || 'unknow'
            ctx.set('image-name', path.basename(imgStatKV.handled.path, ext))

            /**
             * 缓存相关
             */
            ctx.etag = etag
            ctx.lastModified = lastModified

            if (imageSrv._conf.maxAge > 0) {
                ctx.set('Cache-Control', 'max-age=' + imageSrv._conf.maxAge * 1000)
            }

            /**
             * 输出内容
             */
            ctx.body = fileStream.createReadStream(imgStatKV.handled.path)
                .on(
                    'error',
                    //handleContentReadStreamError
                    () => {
                        // NOTE: If an error occurs on the read-stream, it will take
                        // care of destroying itself. As such, we only have to worry
                        // about cleaning up the possible down-stream connections
                        // that have been established.
                        try {
                            ctx.length = 0
                            ctx.set('Cache-Control', 'max-age=0')
                            ctx.etag = ctx.lastModified = null
                            ctx.throw(500, 'ImageServer Internal Error')
                        } catch (headerError) {
                            // We can't set a header once the headers have already
                            // been sent - catch failed attempt to overwrite the
                            // response code.
                        } finally {
                            ctx.res.end('500 Server Error')
                        }
                    }
                )
            return
        }

        debug('start processing image:', imgStatKV.source.path)

        //如果没有在本地发现已经处理好的文件,则跳转至服务内部处理
        await imageSrv
            .stream(ctx.res, imgStatKV.source, ctx.query)
            .catch(() => {
                ctx.throw(500, 'ImageServer Internal Error')
            })
    }

}