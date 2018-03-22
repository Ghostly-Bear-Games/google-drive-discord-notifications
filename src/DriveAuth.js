/**
 * This godawful code is from Google Drive API's node.js quickstart page:
 *   https://developers.google.com/drive/v3/web/quickstart/nodejs
 */

const fs = require('fs');
const readline = require('readline');
const google = require('googleapis');
const googleAuth = require('google-auth-library');

const Bluebird = require('bluebird');
const config = require('../config/default');

// If modifying these scopes, delete your previously saved credentials
// at config.drive.cachedTokenPath
const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];

// Load client secrets from config / force fetch config at app start (blocking)
module.exports = {};

// gets a drive api oauth client
module.exports.getClient = () => authorize(config.drive.clientSecrets);
// promise indicating when driveauth is loaded (has valid client).
module.exports.loaded = module.exports.getClient().then(() => console.log("Loaded Drive API token!"))

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 */
function authorize(credentials) {
  var clientSecret = credentials.installed.client_secret;
  var clientId = credentials.installed.client_id;
  var redirectUrl = credentials.installed.redirect_uris[0];
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

  // Check if we have previously stored a token.
  return Bluebird.promisify(fs.readFile)(config.drive.cachedTokenPath)
    .then(
      token => {
        oauth2Client.credentials = JSON.parse(token);
        return oauth2Client;
      },
      err => Bluebird.promisify(getNewToken)(oauth2Client)
    );
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES
  });
  console.log('Authorize this app by visiting this url: ', authUrl);
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question('Enter the code from that page here: ', function(code) {
    rl.close();
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        return;
      }
      oauth2Client.credentials = token;
      storeToken(token);
      callback(oauth2Client);
    });
  });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
  try {
    fs.mkdirSync(config.drive.cachedTokenDir);
  } catch (err) {
    if (err.code != 'EEXIST') {
      throw err;
    }
  }
  fs.writeFileSync(config.drive.cachedTokenPath, JSON.stringify(token));
  console.log('Token stored to ' + config.drive.cachedTokenPath);
  console.log('Now restart me');
  process.exit(0)
}

/**
 * Lists the names and IDs of up to 10 files.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listFiles(auth) {
  var service = google.drive('v3');
  service.files.list({
    auth: auth,
    pageSize: 10,
    fields: "nextPageToken, files(id, name)"
  }, function(err, response) {
    if (err) {
      console.log('The API returned an error: ' + err);
      return;
    }
    var files = response.files;
    if (files.length == 0) {
      console.log('No files found.');
    } else {
      console.log('Files:');
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        console.log('%s (%s)', file.name, file.id);
      }
    }
  });
}
