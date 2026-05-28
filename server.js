const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling']
});

// CORS: allow cross-origin requests (editor on dev can push to prod)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});
app.use(express.static('public'));
app.use(express.json({ limit: '5mb' })); // Support JSON body for POST

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const MAP_FILE = path.join(DATA_DIR, 'map.json');

// Load map data or create default
let mapData = { objects: [] };
if (fs.existsSync(MAP_FILE)) {
    try {
        mapData = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading map.json", e);
    }
}

app.get('/api/map', (req, res) => {
    res.json(mapData);
});

app.post('/api/map', (req, res) => {
    mapData = req.body;
    fs.writeFileSync(MAP_FILE, JSON.stringify(mapData, null, 2));
    io.emit('mapUpdate', mapData); // Broadcast to all connected clients
    res.json({ success: true });
});

// Store player state
const players = {};

// Store global dropped items
const droppedItemsNetwork = {};
let itemCounter = 0;

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Send initial dropped items to any connecting client (including editor)
    socket.emit('initDroppedItems', droppedItemsNetwork);

    // Editor can request current player snapshot without joining as a player
    socket.on('editorRequestPlayers', () => {
        socket.emit('editorPlayerSnapshot', players);
    });

    // Handle join (client sends username + character type)
    socket.on('join', (data) => {
        // Create player state only when they explicitly join
        players[socket.id] = {
            x: Math.random() * 20 - 10,
            y: 0,
            z: Math.random() * 20 - 10,
            color: Math.floor(Math.random() * 0xffffff),
            username: 'Guest_' + Math.floor(Math.random() * 1000),
            charType: 'modular', // default character type
            inventory: 0 // Default to hands (no gun)
        };

        // Support both old string format and new object format
        if (typeof data === 'string') {
            players[socket.id].username = data;
        } else if (data) {
            players[socket.id].username = data.username || players[socket.id].username;
            players[socket.id].charType = data.charType || 'modular';
        }
        
        // Send back all current players + this player's id
        socket.emit('init', { id: socket.id, players: players });
        // Tell everyone else about the new player
        socket.broadcast.emit('playerJoined', { id: socket.id, ...players[socket.id] });
        console.log(`${players[socket.id].username} joined as ${players[socket.id].charType}`);
    });

    socket.on('itemDropped', (data) => {
        const itemId = 'item_' + itemCounter++;
        droppedItemsNetwork[itemId] = { ...data, itemId };
        io.emit('itemDropped', droppedItemsNetwork[itemId]);
    });

    socket.on('itemPickedUp', (itemId) => {
        if (droppedItemsNetwork[itemId]) {
            delete droppedItemsNetwork[itemId];
            io.emit('itemPickedUp', itemId);
        }
    });

    // Handle movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].ry = movementData.ry;
            players[socket.id].inventory = movementData.inventory;
            players[socket.id].isFishing = movementData.isFishing;
            players[socket.id].isCooking = movementData.isCooking;
            players[socket.id].camPitch = movementData.camPitch;
            players[socket.id].useFBX = movementData.useFBX;

            socket.broadcast.emit('playerMoved', { 
                id: socket.id, 
                x: movementData.x, 
                y: movementData.y,
                z: movementData.z,
                ry: movementData.ry,
                isMoving: movementData.isMoving,
                isSprinting: movementData.isSprinting,
                isCrouching: movementData.isCrouching,
                jumpTime: movementData.jumpTime,
                localVx: movementData.localVx,
                localVz: movementData.localVz,
                inventory: movementData.inventory,
                camPitch: movementData.camPitch,
                useFBX: movementData.useFBX,
                isFishing: movementData.isFishing,
                isCooking: movementData.isCooking
            });
        }
    });

    // Handle shooting
    socket.on('playerShoot', (data) => {
        if (players[socket.id]) {
            socket.broadcast.emit('playerShoot', { id: socket.id });
        }
    });

    // Handle hit
    socket.on('playerHit', (data) => {
        if (players[socket.id]) {
            socket.broadcast.emit('playerHit', { id: data.id, shooterId: socket.id });
        }
    });

    // Handle chat
    socket.on('chatMessage', (message) => {
        if (players[socket.id]) {
            io.emit('chatMessage', { 
                username: players[socket.id].username, 
                message: message,
                color: players[socket.id].color
            });
        } else {
            // Editor or non-player observer
            io.emit('chatMessage', {
                username: '⚡ Editor',
                message: message,
                color: 0xfbbf24
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        io.emit('playerLeft', socket.id);
        delete players[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Game server listening on http://localhost:${PORT}`);
});
