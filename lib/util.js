const fs = require('fs')

module.exports = {
    /**
     * 获取文件状态信息（Promise）
     */
    fileStatAsync: function(filepath) {
        if (!filepath) return false
        return new Promise((resolve, reject) => {
            fs.stat(filepath, (err, stat) => resolve(err || !stat || !stat.isFile() ? false : stat))
        })
    }
}