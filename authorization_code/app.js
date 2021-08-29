const express = require('express')
const request = require('request')
const cors = require('cors')
const querystring = require('querystring')
const cookieParser = require('cookie-parser')
const moment = require('moment')

const tools = require('../tools.js')

const clientId = process.env.MIXTAPE_CLIENT_ID
const clientSecret = process.env.MIXTAPE_CLIENT_SECRET
const redirectURI = process.env.MIXTAPE_REDIRECT_URI

const app = express()
const stateKey = 'spotify_auth_state'

let accessToken = null
let refreshToken = null

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

    // Use the access token to access the Spotify Web API
    request.get(options, (error, response, body) => {
        if (!error && body.item) {
            let artists = ''
            const songName = body.item.name
            const url = body.item.external_urls.spotify

            body.item.artists.forEach((value, key, array) => {
                const separator = key === array.length - 1 ? '' : ', '
                artists += `${value.name}${separator}`
            })

            const song = `${artists} - ${songName} ${url}`
            res.send(song)
            console.log(`${moment().format()} Current song requested. Currently playing: ${song}`)
        } else {
            console.log(`${moment().format()} Error: ${error}`)
            res.send(`It's quiet. Too quiet...`)
        }
    })
})

/* Request authorization */
app.get('/login', (req, res) => {
    console.log(`${moment().format()} Requesting authorization`)

    // Generate cookie and send it to user
    const state = tools.randomString(16)
    res.cookie(stateKey, state)

    // Perform a GET request with app's client ID, redirect URI, scopes
    // and generated cookie.
    res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
            response_type: 'code',
            client_id: clientId,
            scope: 'user-read-private user-read-email user-read-currently-playing',
            redirect_uri: redirectURI,
            state: state
        })
    )
})

/* Request access and refresh tokens */
app.get('/callback', (req, res) => {
    console.log(`${moment().format()} Requesting access and refresh tokens`)

    // Get users code and state
    const code = req.query.code || null
    const state = req.query.state || null
    const storedState = req.cookies ? req.cookies[stateKey] : null

    // Check if users state matches stored one
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

        // Perform a POST request to request access and refresh tokens
        request.post(authOptions, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                console.log(`${moment().format()} Access and refresh tokens obtained`)

                accessToken = body.access_token
                refreshToken = body.refresh_token

                // Pass the token to browser
                res.redirect('/#' + querystring.stringify({ access_token: accessToken, refresh_token: refreshToken }))
            } else {
                console.log(`${moment().format()} Failed to obtain access and refresh tokens`)
                res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }))
            }
        })
    }
})

/* Request access token from refresh token */
app.get('/refresh_token', (req, res) => {
    console.log(`${moment().format()} Requesting new access token`)

    const authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            'Authorization': 'Basic ' + (new Buffer(clientId + ':' + clientSecret).toString('base64'))
        },
        form: {
            grant_type: 'refresh_token',
            refresh_token: req.query.refresh_token
        },
        json: true
    }

    request.post(authOptions, (error, response, body) => {
        if (!error && response.statusCode === 200) {
            const accessToken = body.access_token
            res.send({ 'access_token': accessToken })

            console.log(`${moment().format()} New access token obtained`)
        } else {
            console.log(`${moment().format()} Failed to obtain new access token`)
        }
    })
})

console.log(`${moment().format()} Listening on 8888`)
app.listen(8888)
