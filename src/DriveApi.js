const fs = require('fs')
const google = require('googleapis');
const Bluebird = require('bluebird');
const config = require('../config/default');
const DriveAuth = require('./DriveAuth');

const drive = google.drive('v3');

const buildAuth = async () => {
    const authClient = await DriveAuth.getClient()
    return {
        request: (opts, cb) => {
            if (opts.url.includes('v3/changes')) {
                const queryParameters = [
                    'pageToken',
                    'includeCorpusRemovals',
                    'includeRemoved',
                    'includeTeamDriveItems',
                    'pageSize',
                    'restrictToMyDrive',
                    'spaces',
                    'supportsTeamDrives',
                    'teamDriveId']
                opts.qs = opts.qs || {}
                for (let p of queryParameters) {
                    if (opts.params && p in opts.params) {
                        opts.qs[p] = opts.params[p]
                    }
                }
            }

            if (opts.url.includes('/files/') && opts.url.endsWith('/export')) {
                if (opts.params.mimeType) {
                    opts.qs = opts.qs || {}
                    opts.qs.mimeType = opts.params.mimeType
                }
            }

            if (opts.url.endsWith('v3/files')) {
                const queryParameters = [
                    'q',
                    'orderBy',
                    'corpora',
                    'corpus',
                    'spaces',
                    'pageToken',
                    'pageSize',
                    'includeTeamDriveItems',
                    'supportsTeamDrives',
                    'teamDriveId']
                opts.qs = opts.qs || {}
                for (let p of queryParameters) {
                    if (opts.params && p in opts.params) {
                        opts.qs[p] = opts.params[p]
                    }
                }
            }

            //console.log("OPTS Now: ", JSON.stringify(opts))
            return authClient.request(opts, cb)
        }
    }
}

const imbueAuth = async (x, api) => {
    let y = Object.assign({}, x)

    // wtf... google api node.js impl bug - pageToken is supposed to
    // be a query param, but their code tries to post that?
    y.auth = await buildAuth()

    return new Bluebird((fulfill, reject) => {
        api(y, (gerr, gres) => {
            if (gerr) reject(gerr)
            else fulfill(gres)
        })
    })
};

const fetchDocsFileAsString = async (fileId) => {
    const auth = await buildAuth()
    const mimeType = 'text/plain';
    const params = {auth, fileId, mimeType}
    return imbueAuth(params, (y, cb) => drive.files.export(y, cb));
};

module.exports = {
    changesGetStartPageToken: x => imbueAuth(x, (y, cb) => drive.changes.getStartPageToken(y, cb)),
    changesList: x => imbueAuth(x, (y, cb) => drive.changes.list(y, cb)),
    fetchDocsFileAsString,
    filesList: x => imbueAuth(x, (y, cb) => drive.files.list(y, cb)),
}
