const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const fs = require('fs');

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "my_bot_session" })
});

let contacts = {};

try {
    const contactsData = fs.readFileSync('./contacts.json', 'utf8');
    const parsed = JSON.parse(contactsData);
    // Struktur contoh: [ { "1": {name, jid}, "2": {name, jid} } ]
    contacts = parsed[0] || {};
    console.log('Contacts loaded from contacts.json');
} catch (err) {
    console.error('Error loading contacts.json or file not found. Using empty contacts object.', err.message);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

/* ===================== Utilities ===================== */

function isLikelyIndividual(numberStr) {
    // Heuristik: nomor WA Indonesia (62...) dan panjang <= 13 -> user (c.us)
    return numberStr.length <= 13 && numberStr.startsWith('62');
}

function resolveRecipient(raw) {
    let recipient = raw.trim();
    if (!recipient.includes('@')) {
        recipient = isLikelyIndividual(recipient) ? `${recipient}@c.us` : `${recipient}@g.us`;
    }
    return recipient;
}

/**
 * Kirim pesan ke recipient.
 * - Jika `content` adalah MessageMedia -> kirim media dengan opsi caption.
 * - Jika `content` string -> kirim teks.
 * - Jika `content` tidak ada -> prompt user untuk mengetik pesan teks.
 */
async function sendMessage(recipient, content, caption = '') {
    try {
        if (content instanceof MessageMedia) {
            await client.sendMessage(recipient, content, { caption });
            console.log('Media sent successfully!');
        } else if (typeof content === 'string' && content.length > 0) {
            await client.sendMessage(recipient, content);
            console.log('Message sent successfully!');
        } else {
            // Prompt teks kalau belum ada konten
            rl.question(`Enter message to send to ${recipient}: `, async (input) => {
                if (input.toLowerCase() === 'exit') return startMessagingSession();
                try {
                    await client.sendMessage(recipient, input);
                    console.log('Message sent successfully!');
                } catch (err) {
                    console.error('Error sending message:', err);
                }
                startMessagingSession();
            });
            return; // penting: jangan langsung startMessagingSession() di bawah
        }
    } catch (err) {
        console.error('Error sending message:', err);
    }
    startMessagingSession();
}

/* ===================== UI Flow ===================== */

function startMessagingSession() {
    console.log('\nSelect an option:');
    console.log('1. Send text message');
    console.log('2. Send image');
    console.log('3. Send video');
    console.log('4. Send audio');
    console.log('5. Send document');
    console.log('Type "exit" to quit.');

    rl.question('Enter your choice (1-5): ', (choice) => {
        const c = choice.trim().toLowerCase();
        if (c === 'exit') {
            rl.close();
            return;
        }

        if (c === '1') {
            textSourceMenu();
        } else if (c === '2') {
            mediaSourceMenu("image");
        } else if (c === '3') {
            mediaSourceMenu("video");
        } else if (c === '4') {
            mediaSourceMenu("audio");
        } else if (c === '5') {
            mediaSourceMenu("document");
        } else {
            console.log('Invalid choice. Please enter 1-5, or "exit".');
            startMessagingSession();
        }
    });
}

/* ===================== Text ===================== */

function textSourceMenu() {
    console.log('\nSend text message:');
    console.log('1. Type manually');
    console.log('2. From local file (.txt)');

    rl.question('Enter your choice (1 or 2): ', (choice) => {
        const c = choice.trim();
        if (c === '1') {
            sendTextMessageManual();
        } else if (c === '2') {
            sendTextMessageFromFile();
        } else {
            console.log('Invalid choice. Returning to main menu.');
            startMessagingSession();
        }
    });
}

function chooseRecipientForText(message) {
    console.log('\nSelect an option to send the text:');
    console.log('1. Select from contact list');
    console.log('2. Manually enter recipient JID');

    rl.question('Enter your choice (1 or 2): ', (choice) => {
        const c = choice.trim();
        if (c === '1') {
            selectContact(message);
        } else if (c === '2') {
            manualInput(message);
        } else {
            console.log('Invalid choice. Returning to main menu.');
            startMessagingSession();
        }
    });
}

function sendTextMessageManual() {
    rl.question('Enter your message: ', (message) => {
        if (!message.trim()) {
            console.log('Message cannot be empty.');
            startMessagingSession();
            return;
        }
        chooseRecipientForText(message); // langsung string
    });
}

function sendTextMessageFromFile() {
    rl.question('Enter text file path (e.g., ./message.txt): ', (filePath) => {
        try {
            const content = fs.readFileSync(filePath.trim(), 'utf8');
            if (!content.trim()) {
                console.log('File is empty.');
                startMessagingSession();
                return;
            }
            console.log(`\nLoaded text from file:\n---\n${content}\n---`);
            chooseRecipientForText(content); // langsung string
        } catch (err) {
            console.error('Error reading file:', err.message);
            startMessagingSession();
        }
    });
}

/* ================================================================= */

function chooseRecipientForMedia(payload) {
    console.log('\nSelect an option to send:');
    console.log('1. From contact list');
    console.log('2. Manual JID/number');

    rl.question('Enter your choice (1 or 2): ', (choice) => {
        if (choice.trim() === '1') {
            selectContact(payload);
        } else if (choice.trim() === '2') {
            manualInput(payload);
        } else {
            console.log('Invalid choice. Returning to main menu.');
            startMessagingSession();
        }
    });
}

/* ===================== Media Menu ===================== */

function mediaSourceMenu(type) {
    console.log(`\nSend ${type}:`);
    console.log('1. From URL');
    console.log('2. From local file');

    rl.question('Enter your choice (1 or 2): ', (choice) => {
        const c = choice.trim();
        if (c === '1') {
            if (type === "image") sendImageFromUrl();
            if (type === "video") sendVideoFromUrl();
            if (type === "audio") sendAudioFromUrl();
            if (type === "document") sendDocumentFromUrl();
        } else if (c === '2') {
            if (type === "image") sendImageFromFile();
            if (type === "video") sendVideoFromFile();
            if (type === "audio") sendAudioFromFile();
            if (type === "document") sendDocumentFromFile();
        } else {
            console.log('Invalid choice. Returning to main menu.');
            startMessagingSession();
        }
    });
}

/* ===================== Image ===================== */

function sendImageFromUrl() {
    rl.question('Enter the image URL: ', async (url) => {
        try {
            const media = await MessageMedia.fromUrl(url.trim());
            rl.question('Enter a caption (optional): ', (caption) => {
                chooseRecipientForMedia({ media, caption });
            });
        } catch (err) {
            console.error('Error fetching image:', err);
            startMessagingSession();
        }
    });
}

function sendImageFromFile() {
    rl.question('Enter image file path (e.g., ./image.jpg): ', async (filePath) => {
        try {
            const media = await MessageMedia.fromFilePath(filePath.trim());
            rl.question('Enter a caption (optional): ', (caption) => {
                chooseRecipientForMedia({ media, caption });
            });
        } catch (err) {
            console.error('Error loading image file:', err);
            startMessagingSession();
        }
    });
}

/* ===================== Video ===================== */

function sendVideoFromUrl() {
    rl.question('Enter the video URL: ', async (url) => {
        try {
            const media = await MessageMedia.fromUrl(url.trim());
            rl.question('Enter a caption (optional): ', (caption) => {
                chooseRecipientForMedia({ media, caption });
            });
        } catch (err) {
            console.error('Error fetching video:', err);
            startMessagingSession();
        }
    });
}

function sendVideoFromFile() {
    rl.question('Enter video file path (e.g., ./video.mp4): ', async (filePath) => {
        try {
            const media = await MessageMedia.fromFilePath(filePath.trim());
            rl.question('Enter a caption (optional): ', (caption) => {
                chooseRecipientForMedia({ media, caption });
            });
        } catch (err) {
            console.error('Error loading video file:', err);
            startMessagingSession();
        }
    });
}

/* ===================== Audio ===================== */

function sendAudioFromUrl() {
    rl.question('Enter the audio URL: ', async (url) => {
        try {
            const media = await MessageMedia.fromUrl(url.trim());
            rl.question('Send as voice note? (y/n): ', (ans) => {
                const options = ans.toLowerCase() === 'y'
                    ? { media, sendAudioAsVoice: true }
                    : { media };
                chooseRecipientForMedia(options);
            });
        } catch (err) {
            console.error('Error fetching audio:', err);
            startMessagingSession();
        }
    });
}

function sendAudioFromFile() {
    rl.question('Enter audio file path (e.g., ./audio.mp3): ', async (filePath) => {
        try {
            const media = await MessageMedia.fromFilePath(filePath.trim());
            rl.question('Send as voice note? (y/n): ', (ans) => {
                const options = ans.toLowerCase() === 'y'
                    ? { media, sendAudioAsVoice: true }
                    : { media };
                chooseRecipientForMedia(options);
            });
        } catch (err) {
            console.error('Error loading audio file:', err);
            startMessagingSession();
        }
    });
}

/* ===================== Document ===================== */

function sendDocumentFromUrl() {
    rl.question('Enter the document URL: ', async (url) => {
        try {
            const media = await MessageMedia.fromUrl(url.trim());
            rl.question('Enter a caption (optional): ', (caption) => {
                chooseRecipientForMedia({ media, caption });
            });
        } catch (err) {
            console.error('Error fetching document:', err);
            startMessagingSession();
        }
    });
}

function sendDocumentFromFile() {
    rl.question('Enter document file path (e.g., ./file.pdf): ', async (filePath) => {
        try {
            const media = await MessageMedia.fromFilePath(filePath.trim());
            rl.question('Enter a caption (optional): ', (caption) => {
                chooseRecipientForMedia({ media, caption });
            });
        } catch (err) {
            console.error('Error loading document file:', err);
            startMessagingSession();
        }
    });
}

/**
 * Pilih kontak dari contacts. Jika `payload` disediakan:
 * - payload = { media: MessageMedia, caption: string }
 * Jika tidak ada payload -> setelah pilih recipient, user akan diminta mengetik pesan teks.
 */
function selectContact(payload) {
    const keys = Object.keys(contacts);
    if (keys.length === 0) {
        console.log('No contacts available. Please use manual input.');
        return manualInput(payload);
    }

    console.log('\nAvailable contacts:');
    for (const key of keys) {
        console.log(`${key}. ${contacts[key].name}`);
    }

    rl.question('Enter the number of the contact to send to: ', (contactKey) => {
        const key = contactKey.trim();
        if (key.toLowerCase() === 'exit') return startMessagingSession();

        const contact = contacts[key];
        if (!contact) {
            console.log('Invalid contact number. Returning to main menu.');
            return startMessagingSession();
        }

        const recipient = resolveRecipient(contact.jid);

        if (payload instanceof MessageMedia) {
            return sendMessage(recipient, payload.media, payload.caption || '');
        } else if (typeof payload === 'string') {
            return sendMessage(recipient, payload);
        }
        return sendMessage(recipient);
    });
}

function manualInput(payload) {
    rl.question('Enter recipient ID/number (e.g., 62812xxxx@c.us or group ID): ', (recipientRaw) => {
        const ans = recipientRaw.trim();
        if (ans.toLowerCase() === 'exit') return startMessagingSession();

        const recipient = resolveRecipient(ans);

        if (payload instanceof MessageMedia) {
            return sendMessage(recipient, payload.media, payload.caption || '');
        } else if (typeof payload === 'string') {
            return sendMessage(recipient, payload);
        }
        return sendMessage(recipient);
    });
}


/* ===================== Client Events ===================== */

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR code generated. Scan it with your phone.');
});

client.on('ready', () => {
    console.log('Client is ready!');
    console.log('Session loaded successfully. No need to scan again!');
    startMessagingSession();
});

client.on('message', async (message) => {
    if (message.body === '!ping') {
        return message.reply('pong');
    }
    if (message.body === '!help') {
        return message.reply([
            '!ping',
            '!getGroupId'
        ].join('\n'));
    }
    if (message.body === '!getGroupId' && message.from.endsWith('@g.us')) {
        console.log('Group ID:', message.from);
        return message.reply(`Group ID: ${message.from}`);
    }
});

/* ===================== Cleanup ===================== */

rl.on('close', () => {
    console.log('Exiting...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\nClosing the client...');
    try {
        await client.destroy();
        console.log('Client destroyed. Exiting process.');
    } catch (e) {
        console.error('Error while destroying client:', e);
    }
    process.exit(0);
});

/* ===================== Start ===================== */

client.initialize();
