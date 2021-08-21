const randomString = (length) => {
    const symbols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let text = ''

    for (const symbol of symbols) {
        text += symbols.charAt(Math.floor(Math.random() * symbols.length))
    }

    return text
}

module.exports = {
    randomString
}