const config = require('../config/default')
const Bluebird = require('bluebird')
const async = require('async')

// discord stuff
const Discord = require('discord.js');
const discordHook = new Discord.WebhookClient(config.discord.webhookId, config.discord.webhookToken);

// drive stuff
const DriveAuth = require('./DriveAuth')
const DriveApi = require('./DriveApi')

// Send a message using the webhook
async function mainLoop(lastPageToken) {
    let pageToken = lastPageToken || (await DriveApi.getStartPageToken()).startPageToken;
    console.log(`Using start page token: ${pageToken}`)

    try {
        while (true) {
            const res = await DriveApi.list({pageToken, fields: '*'})
            console.log(res)
        }
    } catch (e) {
        console.log(e)
    }
    await Bluebird.delay(10000);
}

function fetchNextChanges() {
    async.doWhilst(function (callback) {
        drive.changes.list({
            pageToken: pageToken,
            fields: '*'
        }, function (err, res) {
            if (err) {
                callback(err);
            } else {
                // Process changes
                res.changes.forEach(function (change) {
                    console.log('Change found for file:', change.fileId);
                });
                pageToken = res.nextPageToken;
                callback(res.newStartPageToken);
            }
        });
    }, function () {
        return !!pageToken
    }, function (err, newStartPageToken) {
        console.log('Done fetching changes');
        // Save the token (newStartPageToken)
    });
}

// discordHook.send('Test');
DriveAuth.loaded.then(() => mainLoop())
