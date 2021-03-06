module.exports = {
    discord: {
        // create inside channel settings once you have botmaster privs
        // Format is like: https://discordapp.com/api/webhooks/{id}/{token}
        // as of 21 March 2018.
        //
        // this isn't used anymore, though might use again in future changes
        webhookId: '',
        webhookToken: '',

        // create inside https://discordapp.com/developers
        // we don't need the Bot User checkbox checked as of 22 March 2018
        clientId: '',
        clientSecret: '',

        // this comes after checking the Bot User checkbox.
        // Don't check Public Bot or Require OAuth2 Code Grant.
        clientToken: '',

        // enable developer mode in discord, then right click channel => copy id
        // guilds are the servers you join on discord.
        guildId: '',

        // enable developer mode in discord, then right click channel => copy id
        // you'll probably want to select a text channel. e.g. #notifications
        channelId: '',

        // storage location of last sent messageId (for bot message edits)
        lastMessageIdPath: __dirname + '/../data/last_message_id',
    },
    drive: {
        // see: https://developers.google.com/drive/v3/web/quickstart/nodejs
        // you'll want to generate a client_id.json for your account, which
        // entails following some wizard to setup oauth creds.
        // As of 21 March 2018 that's here:
        //   https://console.developers.google.com/start/api?id=drive,
        clientSecrets: require('./google-drive/client_secret.json'),

        // We'll fetch an api token with the above client secrets. This is where
        // that token is cached.
        cachedTokenDir: __dirname + '/google-drive/cache-autogenerated',
        cachedTokenPath: __dirname + '/google-drive/cache-autogenerated/token.json',

        // get by navigating to team drive in browser, then taking URL
        // e.g. https://drive.google.com/drive/u/0/folders/0AA18FA123ohwA21DXQ
        // team drive id is 0AA18FA123ohwA21DXQ
        teamDriveIds: [],

        // drive snapshots are downloaded to tmp for diffs, then persisted in head
        headPath: __dirname + '/../data/head',
        nameStorePath: __dirname + '/../data/name',
        lastPageTokenStorePath: __dirname + '/../data/last_page_token'
    },
}
