const readline = require('readline');
const io = require('socket.io-client');
const socket = io('http://localhost:3000');
const qrcode = require('qrcode-terminal');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/* ===================== Socket.IO Events ===================== */

socket.on('connect', () => {
    console.log('Connected to backend server.');
});

socket.on('qrCode', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('QR code generated. Scan it with your phone.');
});

socket.on('ready', (message) => {
    console.log(message);
    startMessagingSession();
});

socket.on('status', (data) => {
    console.log(data.success ? '✅ Success:' : '❌ Error:', data.message);
    startMessagingSession();
});

socket.on('contactsList', (contacts) => {
    const keys = Object.keys(contacts);
    if (keys.length === 0) {
        console.log('No contacts available. Please enter manually.');
        return manualInput();
    }

    console.log('\nAvailable contacts:');
    for (const key of keys) {
        console.log(`${key}. ${contacts[key].name}`);
    }

    rl.question('Enter the number of the contact to send to: ', (contactKey) => {
        const key = contactKey.trim();
        const contact = contacts[key];
        if (!contact) {
            console.log('Invalid contact number. Returning to main menu.');
            return startMessagingSession();
        }
        // ... now, ask for message/media payload and emit the event
    });
});

socket.on('newMessage', (message) => {
    console.log(`\nNew message from ${message.from}: ${message.body}`);
});

/* ===================== CLI Menus and Logic ===================== */

function startMessagingSession() {
    console.log('\nSelect an option:');
    console.log('1. Send text message');
    console.log('2. Send media (image, video, etc.)');
    console.log('Type "exit" to quit.');

    rl.question('Enter your choice (1 or 2): ', (choice) => {
        const c = choice.trim().toLowerCase();
        if (c === 'exit') {
            rl.close();
            socket.disconnect();
            return;
        }

        if (c === '1') {
            sendTextFlow();
        } else if (c === '2') {
            sendMediaFlow();
        } else {
            console.log('Invalid choice. Please enter 1, 2, or "exit".');
            startMessagingSession();
        }
    });
}

function sendTextFlow() {
    rl.question('Enter recipient JID/number (e.g., 62812xxxx or group ID): ', (recipient) => {
        rl.question('Enter your message: ', (message) => {
            if (!message.trim()) {
                console.log('Message cannot be empty.');
                return startMessagingSession();
            }
            // Emit the sendText event to the backend
            socket.emit('sendText', { recipient, message });
        });
    });
}

function sendMediaFlow() {
    rl.question('Enter recipient JID/number: ', (recipient) => {
        rl.question('Enter media type (image, video, audio, document): ', (type) => {
            rl.question('Enter media source type (url or file): ', (sourceType) => {
                rl.question(`Enter media ${sourceType} path/url: `, (source) => {
                    rl.question('Enter caption (optional): ', (caption) => {
                        // Emit the sendMedia event to the backend
                        socket.emit('sendMedia', { recipient, type, sourceType, source, caption });
                    });
                });
            });
        });
    });
}


/* ===================== Cleanup ===================== */

rl.on('close', () => {
    console.log('Exiting...');
    socket.disconnect();
    process.exit(0);
});

// Initial call to start the session, assuming backend is ready
// startMessagingSession(); // This will now be called by the `ready` event from the backend