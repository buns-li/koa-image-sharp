const request = require('supertest')

const Should = require('should')

describe('GET', function() {

    let server

    beforeEach(function() {
        server = require('./server')
    })

    afterEach(function() {
        server.close()
    })

    it.skip('respond 404 of url of imagehandle can\'t contains "size","keep","rotate"', function(done) {
        request(server)
            .get('/imgs/hank-hill.png?test')
            .expect(404, done)
    })

    it.skip('respond 404 of url of imagehandle("size","keep","rotate") not set value', function(done) {
        request(server)
            .get('/imgs/hank-hill.png?size')
            .expect(404, done)
    })

    it.skip('respond 404 of image is not exists in disk', function(done) {
        request(server)
            .get('/imgs/hank-hill2.png?size=100x100')
            .expect(404, done)
    })

    it('respond 200 of image is exists and generated resize image', function(done) {

        request(server)
            .get('/imgs/hank-hill.png?size=100x100')
            .expect(200)
            .expect('Image-Name', 'hank-hill_k_100x100')
            .end((err, res) => {
                setTimeout(function() {
                    if (err) return done(err)
                    done()
                }, 1000)
            })

    })
})