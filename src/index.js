const config = require('../config/default')

const Bluebird = require('bluebird')
const cli = require('commander')
const fs = require('fs')
const JsDiff = require('diff')
const parseDuration = require('parse-duration')
Bluebird.promisifyAll(fs)

// discord stuff
const Discord = require('discord.js');
const discordHook = new Discord.WebhookClient(config.discord.webhookId, config.discord.webhookToken);
const discordClient = new Discord.Client();

// drive stuff
const DriveAuth = require('./DriveAuth')
const DriveApi = require('./DriveApi')

// Send a message using the webhook
async function fetchLatestDriveOnFirstRun() {
    if (fs.existsSync(config.drive.lastPageTokenStorePath)) {
        console.log(`Found ${config.drive.lastPageTokenStorePath} - not pulling all files again.`)
        return;
    }
    console.log(`Didn't find ${config.drive.lastPageTokenStorePath} - pulling all files again.`)
    fs.writeFileAsync(config.drive.lastPageTokenStorePath, (await DriveApi.changesGetStartPageToken()).startPageToken)

    let includeTeamDriveItems = true;
    let supportsTeamDrives = true;
    for (let teamDriveId of config.drive.teamDriveIds) {
        let pageToken = null;
        const makeRequest = () => DriveApi.filesList({pageToken, pageSize: 10, corpora: 'teamDrive', spaces: 'drive', includeTeamDriveItems, supportsTeamDrives, teamDriveId});
        let res = await makeRequest()
        console.log(JSON.stringify(res))
        while (true) {
            for (const file of res.files) {
                if (file.kind != 'drive#file') continue;
                if (file.mimeType != 'application/vnd.google-apps.document') continue;

                const headStoreFilePath = config.drive.headStorePath + '/' + file.id + '.txt'
                const nameStoreFilePath = config.drive.nameStorePath + '/' + file.id + '.txt'
                if (!fs.existsSync(headStoreFilePath)) {
                    console.log(`Init: fetch ${file.name} (${file.id}).`)
                    const content = await DriveApi.fetchDocsFileAsString(file.id);
                    await fs.writeFileAsync(headStoreFilePath, content);
                }
                await fs.writeFileAsync(nameStoreFilePath, file.name);
            }
            if (!res.nextPageToken) {
                break;
            }
            pageToken = res.nextPageToken
            res = await makeRequest();
        }
    }
}

async function buildSummary(updateHead) {
    let pageToken = (await fs.readFileAsync(config.drive.lastPageTokenStorePath, 'utf8')).trim();
    if (pageToken.length == 0) {
        console.log(`Warning: Corrupt initial start page token. Fetching again...`)
        pageToken = (await DriveApi.changesGetStartPageToken()).startPageToken;
        await fs.writeFileAsync(config.drive.lastPageTokenStorePath, pageToken);
    }
    console.log(`Using start page token: ${pageToken}`)

    let includeTeamDriveItems = true;
    let supportsTeamDrives = true;
    let includeRemoved = true;
    let res = await DriveApi.changesList({pageToken, includeTeamDriveItems, supportsTeamDrives, includeRemoved});

    const changes = [];
    while (true) {
        const nextPageToken = res.nextPageToken || res.newStartPageToken;
        if (pageToken == nextPageToken) {
            break;
        }

        console.log(`Next page token: ${nextPageToken}`)
        const filteredChanges = res.changes.filter(c => c.file && config.drive.teamDriveIds.includes(c.file.teamDriveId))
        changes.push(...filteredChanges)

        pageToken = nextPageToken
        res = await DriveApi.changesList({pageToken, includeTeamDriveItems, supportsTeamDrives, includeRemoved});
    }

    // change summary
    //console.log(`Changes: ${JSON.stringify(changes)}`);

    // run through changes backwards, tagging name updates...
    const nameByFileId = {}
    for (var i = changes.length - 1; i >= 0; i--) {
        if (changes[i].file && changes[i].file.name) {
            const id = changes[i].file.id
            if (id in nameByFileId) {
                changes[i].file.name = nameByFileId[id]
            }
            nameByFileId[id] = changes[i].file.name
        }
    }

    const summaryAdds = [];
    const summaryModifies = [];
    const summaryRemovals = [];
    for (var change of changes) {
        if (!change.file) continue;
        if (change.file.kind != 'drive#file') continue;
        if (change.file.mimeType != 'application/vnd.google-apps.document') continue;

        if (change.removed) {
            summaryRemovals.push(change);
            continue;
        }
        const content = await DriveApi.fetchDocsFileAsString(change.fileId);
        const headStoreFilePath = config.drive.headStorePath + '/' + change.file.id + '.txt'
        if (fs.existsSync(headStoreFilePath)) {
            const oldContent = await fs.readFileAsync(headStoreFilePath, 'utf8');
            const delta = JsDiff.diffWords(oldContent, content);
            //console.log(JSON.stringify(delta))

            const add = (a, b) => a + b;
            const wc = s => s.split(' ').filter(x => x.length).length;
            const wordsAdded = delta.filter(c => c.added).map(c => wc(c.value)).reduce(add, 0)
            const wordsRemoved = delta.filter(c => c.removed).map(c => wc(c.value)).reduce(add, 0)
            if (wordsAdded > 0 || wordsRemoved > 0) {
                summaryModifies.push([change, wordsAdded, wordsRemoved])
            }
        } else {
            summaryAdds.push(change)
        }

        if (updateHead) {
            await fs.writeFileAsync(headStoreFilePath, content)
        }

        const nameStoreFilePath = config.drive.nameStorePath + '/' + change.file.id + '.txt'
        await fs.writeFileAsync(nameStoreFilePath, change.file.name);
    }

    const addedFiles = summaryAdds.sort((a, b) => a.file.name < b.file.name ? -1 : 1)
    const modifiedFiles = summaryModifies.sort((a, b) => - ((a[1] + a[2]) - (b[1] + b[2])))
    const removedFiles = summaryRemovals;

    let summaryLines = [];
    if (addedFiles.length) {
        const changeToString = (change) => change.file.name + " (https://docs.google.com/document/d/" + change.file.id + "/edit)";
        if (addedFiles.length == 1) {
            summaryLines.push('Added: ' + changeToString(addedFiles[0]))
        } else {
            summaryLines.push('Added: ')
            for (let file of addedFiles)
                summaryLines.push(' * ' + changeToString(file))
        }
    }
    if (modifiedFiles.length) {
        const deltaToString = (n, sign) => n > 0 ? `${sign}${n} ` : '';
        const changeToString = (arr) => deltaToString(arr[1], '+') + deltaToString(arr[2], '-') + 'in ' + arr[0].file.name + " (https://docs.google.com/document/d/" + arr[0].file.id + "/edit)";
        if (modifiedFiles.length == 1) {
            summaryLines.push('Changed: ' + changeToString(modifiedFiles[0]))
        } else {
            summaryLines.push('Changed: ')
            for (let arr of modifiedFiles) {
                summaryLines.push(' * ' + changeToString(arr))
            }
        }
    }

    // this doesn't work - we're not getting removed changes.
    if (removedFiles.length) {
        const changeFileName = async (c) => {
            const nameStoreFilePath = config.drive.nameStorePath + '/' + c.file.id + '.txt'
            if (!fs.existsSync(nameStoreFilePath)) return '(unknown)';
            return (await fs.readFileAsync(nameStoreFilePath), 'utf8').trim()
        }
        if (removedFiles.length == 1) {
            summaryLines.push('Removed: ' + await changeFileName(removedFiles[0]))
        } else {
            summaryLines.push('Removed: ')
            for (let c of removedFiles) {
                summaryLines.push(' * ' + await changeFileName(c))
            }
        }
    }

    if (updateHead) {
        await fs.writeFileAsync(config.drive.lastPageTokenStorePath, pageToken)
    }

    return [summaryLines.join('\r\n'), pageToken];
}

async function main(opts) {
    if (opts.forceCreateMessageDuration) {
        opts.forceCreateMessageDuration = parseDuration(opts.forceCreateMessageDuration);
    }
    console.log('Running with options: ', JSON.stringify(opts))

    await DriveAuth.loaded;
    await fetchLatestDriveOnFirstRun();
    await discordClient.login(config.discord.clientToken);
    console.log(`Logged in as ${discordClient.user.tag}!`);
    const channel = discordClient.guilds.get(config.discord.guildId).channels.get(config.discord.channelId);

    if (opts.dryRun) {
        // do nothing, summar
        console.log("== Dry Run ==");
        const [summary, pageToken] = await buildSummary(false);
        console.log(summary);
        console.log("Page Token:", pageToken);
    } else {
        let oldMessage = null;
        if (opts.editPreviousMessage && fs.existsSync(config.discord.lastMessageIdPath)) {
            try {
                const oldMessageId = (await fs.readFileAsync(config.discord.lastMessageIdPath, 'utf8')).trim();
                console.log("Trying old message id:", oldMessageId);
                oldMessage = await channel.fetchMessage(oldMessageId);
            } catch(e) {
                console.error("Failed to load edit messageId or message:", e)
            }
        }

        if (!oldMessage) {
            const [summary, pageToken] = await buildSummary(true);
            console.log("Pushing new message:", summary)
            if (summary.trim().length == 0) {
                console.log("Summary would be empty. Doing nothing.")
            } else {
                console.log("Page Token:", pageToken);
                const message = await channel.send(summary);

                console.log("New message id:", message.id);
                fs.writeFileAsync(config.discord.lastMessageIdPath, message.id);
            }
        } else {
            let [summary, pageToken] = await buildSummary(false);
            console.log("Editing old message:", oldMessage.id);
            if (summary.trim().length == 0) {
                console.log("Summary empty. Doing nothing.")
            } else {
                await oldMessage.edit(summary);
            }

            if (opts.forceCreateMessageDuration) {
                const oldMessageAge = oldMessage.editedTimestamp - oldMessage.createdTimestamp;
                console.log("Old Message Age:", oldMessageAge, "vs", opts.forceCreateMessageDuration);

                if (oldMessageAge > opts.forceCreateMessageDuration) {
                    console.log("Old message too old! Will consider posting a new one next run.")
                    let [newSummary, newPageToken] = await buildSummary(true);
                    if (newSummary.trim().length == 0) {
                        console.log("Summary empty. Doing nothing.")
                    } else {
                        await oldMessage.edit(newSummary);
                    }
                    await fs.writeFileAsync(config.discord.lastMessageIdPath, "");
                }
            }

            console.log("Page Token:", pageToken);
        }
    }

    await discordClient.destroy();
}

cli.option('--dry-run', 'Dry run (just prints parsed options + summary to console)')
   .option('--edit-previous-message', 'Edits prev discord message if exists, else posts new')
   .option('--force-create-message-duration [duration]', 'Forces new post if old message this old. E.g. 1hr.')
   .parse(process.argv)

main(cli.opts());
