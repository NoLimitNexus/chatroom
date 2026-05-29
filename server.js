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

app.get('/api/map', async (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
        await syncFromProd();
    }
    res.json(mapData);
});

// Status endpoint for admin hub
app.get('/api/status', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        uptime: process.uptime(),
        players: Object.keys(players).length,
        playerList: Object.values(players).map(p => ({ username: p.username, charType: p.charType })),
        mapObjects: mapData.objects ? mapData.objects.length : 0,
        droppedItems: Object.keys(droppedItemsNetwork).length,
        memoryMB: Math.round(mem.rss / 1024 / 1024),
        heapMB: Math.round(mem.heapUsed / 1024 / 1024),
        nodeVersion: process.version,
        env: process.env.NODE_ENV || 'development',
        connectedSockets: io.sockets.sockets.size
    });
});

app.post('/api/map', (req, res) => {
    mapData = req.body;
    fs.writeFileSync(MAP_FILE, JSON.stringify(mapData, null, 2));
    io.emit('mapUpdate', mapData); // Broadcast to all connected clients
    res.json({ success: true });
});

// Sync map from production NAS — pulls latest and broadcasts to local clients
const PROD_MAP_URL = 'https://chatroom.nolimitnexus.com/api/map';
let lastMapHash = '';

async function syncFromProd() {
    try {
        const resp = await fetch(PROD_MAP_URL, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return;
        const prodData = await resp.json();
        const hash = JSON.stringify(prodData);
        if (hash !== lastMapHash) {
            lastMapHash = hash;
            mapData = prodData;
            fs.writeFileSync(MAP_FILE, JSON.stringify(mapData, null, 2));
            io.emit('mapUpdate', mapData);
            console.log(`[Sync] Pulled ${prodData.objects?.length || 0} objects from production`);
        }
    } catch (e) { /* prod unreachable, skip */ }
}

// Manual sync endpoint
app.get('/api/sync-from-prod', async (req, res) => {
    await syncFromProd();
    res.json({ success: true, objects: mapData.objects?.length || 0 });
});

// Auto-sync from production every 30 seconds
setInterval(syncFromProd, 30000);
syncFromProd(); // Initial sync on startup

// Store player state
const players = {};

// Store global dropped items
const ITEMS_FILE = path.join(DATA_DIR, 'droppedItems.json');
let droppedItemsNetwork = {};
if (fs.existsSync(ITEMS_FILE)) {
    try {
        droppedItemsNetwork = JSON.parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
        // Set expirations for any items loaded from disk
        for (let itemId in droppedItemsNetwork) {
            scheduleItemExpiration(itemId);
        }
    } catch (e) {
        console.error("Error reading droppedItems.json", e);
    }
}
function saveDroppedItems() {
    fs.writeFileSync(ITEMS_FILE, JSON.stringify(droppedItemsNetwork, null, 2));
}

function scheduleItemExpiration(itemId) {
    setTimeout(() => {
        if (droppedItemsNetwork[itemId]) {
            delete droppedItemsNetwork[itemId];
            saveDroppedItems();
            // Re-use itemPickedUp event to tell clients to remove the object from the world
            io.emit('itemPickedUp', itemId); 
        }
    }, 120000); // 2 minutes
}

let itemCounter = Date.now();

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
        saveDroppedItems();
        io.emit('itemDropped', droppedItemsNetwork[itemId]);
        scheduleItemExpiration(itemId);
    });

    socket.on('itemPickedUp', (itemId) => {
        if (droppedItemsNetwork[itemId]) {
            delete droppedItemsNetwork[itemId];
            saveDroppedItems();
            io.emit('itemPickedUp', itemId);
        }
    });

    socket.on('boatMoved', (data) => {
        socket.broadcast.emit('boatMoved', data);
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
            players[socket.id].camYaw = movementData.camYaw;
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
                camYaw: movementData.camYaw,
                useFBX: movementData.useFBX,
                isFishing: movementData.isFishing,
                isCooking: movementData.isCooking,
                fishingTarget: movementData.fishingTarget
            });
        }
    });

    // Handle shooting
    socket.on('playerShoot', (data) => {
        if (players[socket.id]) {
            // Broadcast with full context so all observers can render the shot
            io.emit('remoteShoot', {
                id: socket.id,
                inventory: players[socket.id].inventory || 0,
                x: players[socket.id].x,
                y: players[socket.id].y,
                z: players[socket.id].z,
                ry: players[socket.id].ry,
                camPitch: players[socket.id].camPitch || 0,
                camYaw: players[socket.id].camYaw || players[socket.id].ry,
                aimDirX: data.aimDirX,
                aimDirY: data.aimDirY,
                aimDirZ: data.aimDirZ
            });
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
