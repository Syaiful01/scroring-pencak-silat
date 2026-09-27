const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const createApiRouter = require('./src/routes/api');
const registerSocketHandlers = require('./src/socket/socketHandler');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }, // LAN lokal, semua origin diizinkan
});

app.use(express.json());
app.use('/api', createApiRouter(io));

// Static assets bersama (jika ada)
app.use('/shared', express.static(path.join(__dirname, 'public', 'shared')));

// Routing tiap role ke folder public masing-masing
// (rute exact-path didaftarkan LEBIH DULU agar tidak kena redirect trailing-slash dari express.static)
const roles = ['admin', 'timer', 'juri', 'ketua', 'display'];
roles.forEach((role) => {
    app.get(`/${role}`, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', role, 'index.html'));
    });
    app.use(`/${role}`, express.static(path.join(__dirname, 'public', role)));
});

// Halaman root -> arahkan ke admin
app.get('/', (req, res) => {
    res.redirect('/admin');
});

registerSocketHandlers(io);

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}

server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================================');
    console.log('  Digital Scoring Pencak Silat - Server AKTIF');
    console.log('========================================================');
    console.log(`  Lokal   : http://localhost:${PORT}`);
    getLocalIPs().forEach((ip) => {
        console.log(`  Jaringan: http://${ip}:${PORT}`);
    });
    console.log('--------------------------------------------------------');
    console.log(`  Admin   : /admin`);
    console.log(`  Timer   : /timer`);
    console.log(`  Juri    : /juri?id=1  /juri?id=2  /juri?id=3`);
    console.log(`  Ketua   : /ketua`);
    console.log(`  Display : /display`);
    console.log('========================================================');
});
