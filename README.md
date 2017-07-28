# koa-image
> a middleware for koa.js which is based of 'sharp' lib

· resize图片
· 旋转图片
· 控制图片宽高比

# Install

```sh
$ npm install --save  koa-image
```

## Config Options

 *  `imgRoot`: [`String`] 图片本地磁盘存放路径(Default:`process.cwd()`) **Required**
 *  `urlPrefix`:[`Array`] 可允许的路由前缀(Default:`[imgs]`) **Required**
 *  `allowExt`:[`Array`] 可允许的图片后缀(Default:`["png","jpg","jpeg","tiff","webp"]`)  **Required**
 *  `maxAge`:[`Number`] 资源缓存时间 (Default:`60*60*24*7 = 7天`)
 *  `isweak`:[`Boolean`] 是否使用弱ETag (Default:`true`)

## How to use

```js

const Koa = require('koa')
const KoaImage = require('koa-image')
const app = new Koa()

app.use(KoaImage(/*options*/))

```

## How to sharp image

1.过滤客户端请求

    请求格式: /{urlPrefix`的某个值}/{图片名称}.{allowExt中允许的图片后缀}?(size|keep|rotate)=value

2.得到图片请求的query数据

    query: {
        `size`:要resize的图片宽高比例: 100、100x、100x20、x20,
        `keep`:是否保持宽高比(Default:`true`)
        `rotate`: 图片旋转度数
        /*待续*/
    }

3.解析转换得到真实的本地图片路径

    实际图片文件名称格式: {文件名}[_k][_{旋转度数}]_{宽高比例}

Note: "[]"内的代表可选参数

## Test

```sh
$ npm run test
```

or 

```sh
$ cd workdir/test
$ mocha test.js
```