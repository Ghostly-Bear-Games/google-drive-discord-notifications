const google = require('googleapis');
const Bluebird = require('bluebird');
const config = require('../config/default');
const DriveAuth = require('./DriveAuth');

const drive = google.drive('v3');

const imbueAuth = async (x, api) => {
    let y = Object.assign({}, x)
    const authClient = await DriveAuth.getClient()

    // wtf... google api node.js impl bug - pageToken is supposed to
    // be a query param, but their code tries to post that?
    y.auth = {
        request: (opts, cb) => {
            if (opts.url.indexOf('v3/changes') != -1) {
                opts.qs = opts.qs || {}
                opts.qs.pageToken = opts.params.pageToken
            }
            //console.log("OPTS Now: ", JSON.stringify(opts))
            return authClient.request(opts, cb)
        }
    }

    return new Bluebird((fulfill, reject) => {
        api(y, (gerr, gres) => {
            if (gerr) reject(gerr)
            else fulfill(gres)
        })
    })
};

module.exports = {
    getStartPageToken: x => imbueAuth(x, (y, cb) => drive.changes.getStartPageToken(y, cb)),
    list: x => imbueAuth(x, (y, cb) => drive.changes.list(y, cb))
}
