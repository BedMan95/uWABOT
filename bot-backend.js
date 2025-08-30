const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
    cors: {
        origin: '*', // Adjust for your frontend's origin
    }
});

const client = new Client({
    authStrategy: new LocalAuth({ clientId: "my_bot_session" })
});

let contacts = {};
try {
    const contactsData = fs.readFileSync('./contacts.json', 'utf8');
    const parsed = JSON.parse(contactsData);
    contacts = parsed[0] || {};
    console.log('Contacts loaded from contacts.json');
} catch (err) {
    console.error('Error loading contacts.json or file not found. Using empty contacts object.', err.message);
}

/* ===================== Utilities ===================== */

function isLikelyIndividual(numberStr) {
    return numberStr.length <= 13 && numberStr.startsWith('62');
}

function resolveRecipient(raw) {
    let recipient = raw.trim();
    if (!recipient.includes('@')) {
        recipient = isLikelyIndividual(recipient) ? `${recipient}@c.us` : `${recipient}@g.us`;
    }
    return recipient;
}

async function sendMessage(recipient, content, caption = '', options = {}) {
    try {
        if (content instanceof MessageMedia) {
            await client.sendMessage(recipient, content, { caption, ...options });
            return 'Media sent successfully!';
        } else if (typeof content === 'string' && content.length > 0) {
            await client.sendMessage(recipient, content);
            return 'Message sent successfully!';
        }
    } catch (err) {
        console.error('Error sending message:', err);
        throw new Error('Failed to send message.');
    }
}

/* ===================== Socket.IO Events ===================== */

io.on('connection', (socket) => {
    console.log('Frontend client connected.');

    // Endpoint for sending a text message
    socket.on('sendText', async (data) => {
        try {
            const recipient = resolveRecipient(data.recipient);
            const status = await sendMessage(recipient, data.message);
            socket.emit('status', { success: true, message: status });
        } catch (err) {
            socket.emit('status', { success: false, message: err.message });
        }
    });

    // Endpoint for sending media
    socket.on('sendMedia', async (data) => {
        try {
            const recipient = resolveRecipient(data.recipient);
            let media;
            if (data.sourceType === 'url') {
                media = await MessageMedia.fromUrl(data.source);
            } else if (data.sourceType === 'file') {
                media = await MessageMedia.fromFilePath(data.source);
            } else {
                throw new Error('Invalid media source type.');
            }
            
            const options = data.options || {};
            const status = await sendMessage(recipient, media, data.caption, options);
            socket.emit('status', { success: true, message: status });
            console.log('Media sent successfully!');
        } catch (err) {
            socket.emit('status', { success: false, message: err.message });
        }
    });

    // Endpoint for getting contacts
    socket.on('getContacts', () => {
        socket.emit('contactsList', contacts);
    });

    socket.on('disconnect', () => {
        console.log('Frontend client disconnected.');
    });
});

/* ===================== WhatsApp Client Events ===================== */

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    // Send QR code data to the frontend
    io.emit('qrCode', qr); 
});

client.on('ready', () => {
    console.log('Client is ready!');
    // Notify the frontend that the client is ready
    io.emit('ready', 'Client is ready!');
});

client.on('message', async (message) => {
    console.log(`Process message from ${message.from}: ${message.body}`);
    
    if (message.body === '!ping') {
        message.reply('pong');
    }
    if (message.body === '!help') {
        message.reply([
            '!ping',
            '!getGroupId'
        ].join('\n'));
    }
    if (message.body === '!getGroupId' && message.from.endsWith('@g.us')) {
        console.log('Group ID:', message.from);
        return message.reply(`Group ID: ${message.from}`);
    }

    io.emit('newMessage', {
        from: message.from,
        body: message.body,
        timestamp: message.timestamp
    });
});

/* ===================== Start Server ===================== */

client.initialize();
server.listen(3000, () => {
    console.log('Backend server listening on port 3000');
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