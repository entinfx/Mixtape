/* Libraries */
const express = require('express')
const request = require('request')
const cors = require('cors')
const querystring = require('querystring')
const cookieParser = require('cookie-parser')
const moment = require('moment')

/* Local import */
const tools = require('../tools.js')

/* App credentials */
const clientId = process.env.MIXTAPE_CLIENT_ID
const clientSecret = process.env.MIXTAPE_CLIENT_SECRET
const redirectURI = process.env.MIXTAPE_REDIRECT_URI

/* Variables */
const app = express()
const stateKey = 'spotify_auth_state'

let scope = 'user-read-currently-playing' // user-read-private user-read-email user-read-currently-playing
let accessToken = null
let refreshToken = null
let accessTokenExpiryTime = null

/* Middleware */
app.use(express.static(__dirname + '/public'))
app.use(cors())
app.use(cookieParser())

/* Request currently playing song */
app.get('/song', (req, res) => {
    const options = {
        url: 'https://api.spotify.com/v1/me/player/currently-playing',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        json: true
    }

    request.get(options, (error, response, body) => {
        if (error || response.statusCode !== 200) {
            console.log(`${moment().format()} Error occurred or no song is currently playing`)
            res.send(`It's quiet. Too quiet...`)
        } else {
            const songName = body.item.name
            const url = body.item.external_urls.spotify

            let artists = ''

            body.item.artists.forEach((value, key, array) => {
                const separator = key === array.length - 1 ? '' : ', '
                artists += `${value.name}${separator}`
            })

            const prefix = body.is_playing ? 'Currently playing:' : 'Playback paused, last played song:'
            const song = `${prefix} ${artists} - ${songName} ${url}`

            res.send(song)
            console.log(`${moment().format()} Current song requested. Currently playing: ${song}`)
        }
    })
})

/* Request authorization */
app.get('/login', (req, res) => {
    console.log(`${moment().format()} Requesting authorization`)

    const state = tools.randomString(16)
    res.cookie(stateKey, state)

    // Redirect user to Spotify login page, then redirect user to the /callback page
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: clientId,
            scope: scope,
            redirect_uri: redirectURI,
            state: state
        })
    )
})

/* Request access and refresh tokens */
app.get('/callback', (req, res) => {
    console.log(`${moment().format()} Requesting access and refresh tokens`)

    const code = req.query.code || null
    const state = req.query.state || null
    const storedState = req.cookies ? req.cookies[stateKey] : null

    if (state === null || state !== storedState) {
        res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }))
    } else {
        res.clearCookie(stateKey)

        const authOptions = {
            url: 'https://accounts.spotify.com/api/token',
            form: {
                code: code,
                redirect_uri: redirectURI,
                grant_type: 'authorization_code'
            },
            headers: {
                'Authorization': 'Basic ' + (new Buffer(clientId + ':' + clientSecret).toString('base64'))
            },
            json: true
        }

        request.post(authOptions, (error, response, body) => {
            if (error || response.statusCode !== 200) {
                console.log(`${moment().format()} Failed to obtain access and refresh tokens`)
                res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }))
            } else {
                accessToken = body.access_token
                refreshToken = body.refresh_token
                accessTokenExpiryTime = (parseInt(body.expires_in) - 5) * 1000
                scope = body.scope

                const timer = setTimeout(() => {
                    console.log(`${moment().format()} Access token expires soon, timer ran out`)
                    requestNewAccessToken()
                }, accessTokenExpiryTime)

                console.log(`${moment().format()} Access and refresh tokens obtained`)
                console.log(`${moment().format()} Set timer for access token refresh (${accessTokenExpiryTime}ms)`)

                // Pass the token to browser
                res.redirect('/#' + querystring.stringify({ access_token: accessToken, refresh_token: refreshToken }))
            }
        })
    }
})

/* Request new access token using refresh token */
app.get('/refresh_token', (req, res) => {
    requestNewAccessToken()
})

function requestNewAccessToken() {
    console.log(`${moment().format()} Requesting new access token`)

    const authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            'Authorization': 'Basic ' + (new Buffer(clientId + ':' + clientSecret).toString('base64'))
        },
        form: {
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        },
        json: true
    }

    request.post(authOptions, (error, response, body) => {
        if (error || response.statusCode !== 200) {
            console.log(`${moment().format()} Failed to obtain new access token`)
        } else {
            accessToken = body.access_token
            accessTokenExpiryTime = (parseInt(body.expires_in) - 5) * 1000
            scope = body.scope
            // res.send({ 'access_token': accessToken })

            const timer = setTimeout(() => {
                console.log(`${moment().format()} Access token expires soon, timer ran out`)
                requestNewAccessToken()
            }, accessTokenExpiryTime)

            console.log(`${moment().format()} New access token obtained`)
            console.log(`${moment().format()} Set timer for access token refresh (${accessTokenExpiryTime}ms)`)
        }
    })
}

console.log(`${moment().format()} Listening on ${process.env.PORT || 8888}`)
app.listen(process.env.PORT || 8888)
