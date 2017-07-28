const url = require('url')

const sharp = require('sharp')

const fileStream = require('fs')

const path = require('path')

// const PassThroughStream = require('stream').PassThrough

const debug = require('debug')('koa-image-srv')

const util = require('./util')

const defaultConfig = {
    imgRoot: process.cwd(),
    urlPrefix: ['imgs', 'images', 'imgsrv'],
    allowExt: ['png', 'jpg', 'jpeg', 'tiff', 'webp'],
    maxAge: 60 * 60 * 24 * 7,
    isweak: true
}

module.exports = function(config) {

    config = config ? Object.assign({}, defaultConfig, config) : defaultConfig

    return new ImageServer(config)
}

class ImageServer {
    constructor(config) {

        this._conf = config

        if (config.urlPrefix && config.urlPrefix.length && config.allowExt && config.allowExt.length)
            this._pattern = new RegExp('^\/(' + config.urlPrefix.join('|') + ')\/(.+)\.(' + config.allowExt.join('|') + ')\?((keep|rotate|size)=.+)')
    }

    /**
     * 解析客户端的路径url
     * @param {any} path 客户端路由地址(不带?查询)
     * @param {any} url 客户端路由
     * @memberof ImageServer
     */
    _resolveUrl(path) {

        //取消忽略网址编码的字符（必须显式替换空格，因为它们不会自动解码）
        path = decodeURIComponent(path.replace(/\+/g, ' '))

        //规范化斜杠
        path = path.replace(/\\/g, '/')

        //剥离双斜杠
        path = path.replace(/[/]{2,}/g, '/')

        //剥离前置和尾部的斜杠
        path = path.replace(/^[/]|[/]$/g, '')

        //剥离任何路径遍历
        path = path.replace(/\.\.\//g, '/')

        return url.resolve(this._conf.imgRoot, path)
    }

    /**
     * 解析客户端传递的size数据,得到真实的resize的宽高比例
     * 
     * @param {any} sizeVal 
     * @returns 
     * @memberof ImageServer
     */
    _resolveSize(sizeVal) {

        if (!sizeVal) return null

        let sizeArr = ('' + sizeVal).split('x')

        let size = {}

        size.width = sizeArr[0] ? parseInt(sizeArr[0], 10) : null

        if (sizeArr.length === 2) {
            size.height = sizeArr[1] ? parseInt(sizeArr[1], 10) : null
        }

        return size
    }

    /**
     * 解析客户端传递的rotate数据,得到真实的旋转角度
     *  默认采用四舍五入算法
     * @param {any} rotate 旋转的角度 必须是90的倍数
     * @memberof ImageServer
     */
    _resolveRotate(rotate) {

        let rotateNumber = parseInt(rotate, 10)

        rotateNumber = Math.round(rotateNumber / 90)

        return rotateNumber * 90
    }

    /**
     * 基于原始图片地址的基础上,配合客户端传入的图片操作配置项来生成新的文件地址
     * 
     * @param {any} sourcePath 原始文件地址
     * @param {any} imageHandleOptions 客户端图片操作配置项 
     * @memberof ImageServer
     * @return {String} 新的文件地址
     */
    _resolveImagePath(sourcePath, imageHandleOptions) {
        //get directory of source image file
        let dir = path.dirname(sourcePath)

        //get extension of source image file
        let ext = path.extname(sourcePath)

        //get name of source image file
        let imageName = path.basename(sourcePath, ext)

        if (imageHandleOptions.keep) {
            imageName += '_k'
        }

        if (imageHandleOptions.rotate) {
            imageName += '_' + imageHandleOptions.rotate
        }

        if (imageHandleOptions.size) {

            let width = imageHandleOptions.size.width

            let height = imageHandleOptions.size.height

            if (width) {
                imageName += '_' + width

                if (height) {
                    imageName += 'x' + height
                }
            } else if (height) {
                imageName += '_' + height
            }


        }
        return path.join(dir, imageName + ext)
    }

    /**
     * 解析当前图片地址请求
     * 
     * @param {any} clientUrl 客户端请求url
     * @param {any} clientPath 客户端请求path
     * @param {any} queryString 客户端请求参数部分
     * @memberof ImageServer
     * @return {Boolean|FileStat}
     */
    async resolve(clientUrl, clientPath, query) {

        if (!clientUrl) return false

        let parsedUrl = url.parse(clientUrl)

        if (this._pattern && this._pattern.test(parsedUrl.path)) {

            this._adjustImageHandleOptions(query)

            let imagePath = this._resolveImagePath(clientPath, query)

            imagePath = this._resolveUrl(imagePath)

            debug('handledImagePath:', imagePath)

            let handledImageStat = await util.fileStatAsync(imagePath)

            handledImageStat && (handledImageStat.path = imagePath)

            imagePath = this._resolveUrl(clientPath)

            let sourceImageStat = await util.fileStatAsync(imagePath)

            sourceImageStat && (sourceImageStat.path = imagePath)

            return {
                source: sourceImageStat,
                handled: handledImageStat
            }
        }

        return false
    }

    /**
     * 获取文件资源的ETag值
     * 
     * @param {any} imageStat 
     * @returns 
     * @memberof ImageServer
     */
    async getETag(imageStat) {
        return (this._conf.isweak ? 'W/' : '') + imageStat.mtime.toString(16) + '-' + imageStat.size.toString(16)
    }

    /**
     * 调整客户端传入的图片操作配置项
     * 
     * @param {any} options 客户端传入的图片操作配置项
     * @memberof ImageServer
     */
    _adjustImageHandleOptions(options) {

        if (!'keep' in options) {
            options.keep = true
        } else {
            options.keep = options.keep === undefined || options.keep === null ? true : (!!options.keep)
        }

        if ('size' in options) {
            options.size = typeof options.size === 'object' ? options.size : this._resolveSize(options.size)
        } else {
            options.size = 0
        }

        if ('rotate' in options && options.rotate) {
            options.rotate = this._resolveRotate(options.rotate)
        } else {
            options.rotate = 0
        }
    }

    /**
     * 生成新的文件流,并将其传输至response输出流中
     * 
     * @param {any} response http.response对象
     * @param {any} sourceImageStat 原始图片文件资源的stat对象
     * @param {any} imageHandleOptions 图片操作的配置对象
     *      `size`:[`String|Number`]要resize的长宽参数 格式： Width [x [Height || 0]] or [Width||0] X Height 例如: 100x100、100、x100、0x100、100x
     *      `rotate`: [`Number`] 旋转度数 90、180、270
     *      `keep`: [`Boolean`] 是否保持文件的宽高比例 (Default:`true`)
     * @memberof ImageServer
     */
    async stream(response, sourceImageStat, imageHandleOptions) {

        //获取当前要执行的Image操作

        let metadata = await sharp(sourceImageStat.path).metadata()

        this._adjustImageHandleOptions(imageHandleOptions)

        let transformer = sharp().resize(imageHandleOptions.size.width, imageHandleOptions.size.height)

        if (imageHandleOptions.size.width > metadata.width || imageHandleOptions.size.height > metadata.height) {
            if (options.keep) {
                transformer = transformer.max()
            }
        }

        if (!imageHandleOptions.keep) {
            transformer = transformer.ignoreAspectRatio()
        }

        if (imageHandleOptions.rotate !== 0) {
            transformer = transformer.rotate(imageHandleOptions.rotate)
        }

        if (!transformer) {
            response.writeHead(500, 'Server Transform Image Error')
            response.end('500 Server Transform Image Error')
            return
        }

        //获取新的转换流

        let inputStream = fileStream.createReadStream(sourceImageStat.path)
            .on('error', error => {
                //handleContentReadStreamError
                // NOTE: If an error occurs on the read-stream, it will take
                // care of destroying itself. As such, we only have to worry 
                // about cleaning up the possible down-stream connections 
                // that have been established.
                try {
                    response.setHeader('Content-Length', 0)
                    response.setHeader('Image-Name', null)
                    response.setHeader('Cache-Control', 'max-age=0')
                    response.writeHead(500, 'Server Error')
                } catch (headerError) {
                    // We can't set a header once the headers have already 
                    // been sent - catch failed attempt to overwrite the 
                    // response code.
                } finally {
                    response.end('500 Server Error')
                }
            })

        let handledImagePath = this._resolveImagePath(sourceImageStat.path, imageHandleOptions)

        debug('realImagePath:', handledImagePath)

        response.setHeader('Image-Name', path.basename(handledImagePath, path.extname(handledImagePath)))

        response.writeHead(200, 'OK')

        transformer.pipe(fileStream.createWriteStream(handledImagePath).on('error', err => console.error(err)))

        transformer.clone().pipe(response)

        inputStream.pipe(transformer)
    }

}