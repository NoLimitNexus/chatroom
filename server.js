const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling']
});

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    // Disable caching for all static assets and API responses
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
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

let mapSaveTimeout = null;
function queueMapSave() {
    if (mapSaveTimeout) return;
    mapSaveTimeout = setTimeout(() => {
        fs.writeFile(MAP_FILE, JSON.stringify(mapData, null, 2), (err) => {
            if (err) console.error("Error writing map.json", err);
        });
        mapSaveTimeout = null;
    }, 5000); // Save at most once every 5 seconds
}

let boatStates = {};

function reinitBoatStates() {
    if (mapData && mapData.objects) {
        mapData.objects.forEach(obj => {
            if (obj.type === 'Boat') {
                boatStates[obj.id] = {
                    spawnPos: obj.spawnPos ? { ...obj.spawnPos } : { ...obj.position },
                    spawnRot: obj.spawnRot !== undefined ? obj.spawnRot : (obj.rotation ? obj.rotation.y : 0),
                    lastOccupiedTime: Date.now(),
                    returning: false
                };
            }
        });
    }
}

// Load map data or create default
let mapData = { objects: [] };
if (fs.existsSync(MAP_FILE)) {
    try {
        mapData = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading map.json", e);
    }
}
reinitBoatStates();
if (!mapData.environment) {
    mapData.environment = { timeOfDay: 12.0, timeSpeed: 0.1, nightBrightness: 0.0 }; // Default time speed: 0.1 (0.1 in game hours per real second = 240 seconds per game day? No, wait)
}

// Tick time of day on server
setInterval(() => {
    if (mapData.environment && mapData.environment.timeSpeed > 0) {
        // timeSpeed represents in-game hours per real second. 0.1 = 1 game hour every 10 real seconds = 240s per day.
        mapData.environment.timeOfDay += mapData.environment.timeSpeed * 0.1; // 100ms interval
        if (mapData.environment.timeOfDay >= 24.0) {
            mapData.environment.timeOfDay -= 24.0;
        }
    }
}, 100);

// Sync time with clients every 5 seconds
setInterval(() => {
    if (mapData.environment) {
        io.emit('timeSync', mapData.environment);
    }
}, 5000);

app.get('/api/map', async (req, res) => {
    res.json(mapData);
});

// Status endpoint for admin hub
app.get('/api/status', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        uptime: process.uptime(),
        players: Object.keys(players).length,
        playerList: Object.values(players).map(p => ({ username: p.username, charType: p.charType, joinTime: p.joinTime })),
        mapObjects: mapData.objects ? mapData.objects.length : 0,
        droppedItems: Object.keys(droppedItemsNetwork).length,
        memoryMB: Math.round(mem.rss / 1024 / 1024),
        heapMB: Math.round(mem.heapUsed / 1024 / 1024),
        nodeVersion: process.version,
        env: process.env.NODE_ENV || 'development',
        connectedSockets: io.sockets.sockets.size,
        analytics: {
            totalConnections: analytics.totalConnections,
            uniqueUsersCount: Object.keys(analytics.uniqueUsers).length
        },
        sessionHistory: sessionHistory.slice(-50)
    });
});

app.post('/api/map', (req, res) => {
    mapData = req.body;
    
    // Re-initialize spawn positions for all boats from the new map data
    if (mapData && mapData.objects) {
        mapData.objects.forEach(obj => {
            if (obj.type === 'Boat') {
                boatStates[obj.id] = {
                    spawnPos: obj.spawnPos ? { ...obj.spawnPos } : { ...obj.position },
                    spawnRot: obj.spawnRot !== undefined ? obj.spawnRot : (obj.rotation ? obj.rotation.y : 0),
                    lastOccupiedTime: Date.now(),
                    returning: false
                };
            }
        });
    }

    fs.writeFile(MAP_FILE, JSON.stringify(mapData, null, 2), (err) => {
        if (err) console.error("Error writing map.json", err);
    });
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
            fs.writeFile(MAP_FILE, JSON.stringify(mapData, null, 2), (err) => {
                if (err) console.error("Error writing map.json", err);
            });
            reinitBoatStates();
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

syncFromProd(); // Initial sync on startup

// ----------------------------------------------------
// AUTO-RETURN BOATS LOGIC (2 MINUTES IDLE)
// ----------------------------------------------------
const BOAT_RETURN_TIMEOUT = 20000; // 20 seconds
const BOAT_RETURN_SPEED = 3.0; // meters per sec

setInterval(() => {
    if (!mapData || !mapData.objects) return;
    const now = Date.now();

    mapData.objects.forEach(obj => {
        if (obj.type !== 'Boat') return;
        const id = obj.id;
        
        if (!boatStates[id]) return; // Safety check
        const state = boatStates[id];

        // 2 minutes of no occupancy
        if (now - state.lastOccupiedTime > BOAT_RETURN_TIMEOUT) {
            const dx = state.spawnPos.x - obj.position.x;
            const dz = state.spawnPos.z - obj.position.z;
            const dist = Math.hypot(dx, dz);

            if (dist > 30.0) {
                // Teleport if too far
                state.returning = false;
                obj.position.x = state.spawnPos.x;
                obj.position.z = state.spawnPos.z;
                obj.rotation.y = state.spawnRot;
                io.emit('boatMoved', {
                    id: id,
                    x: obj.position.x,
                    y: obj.position.y,
                    z: obj.position.z,
                    ry: obj.rotation.y
                });
            } else if (dist > 0.1) {
                state.returning = true;
                
                const moveDist = Math.min(dist, BOAT_RETURN_SPEED * 0.05); // 50ms tick
                const dirX = dx / dist;
                const dirZ = dz / dist;
                
                obj.position.x += dirX * moveDist;
                obj.position.z += dirZ * moveDist;
                
                obj.rotation = obj.rotation || {};
                obj.rotation.y = Math.atan2(dirX, dirZ);

                io.emit('boatMoved', {
                    id: id,
                    x: obj.position.x,
                    y: obj.position.y,
                    z: obj.position.z,
                    ry: obj.rotation.y
                });
            } else if (state.returning) {
                // Reached spawn perfectly
                state.returning = false;
                obj.position.x = state.spawnPos.x;
                obj.position.z = state.spawnPos.z;
                obj.rotation.y = state.spawnRot;
                io.emit('boatMoved', {
                    id: id,
                    x: obj.position.x,
                    y: obj.position.y,
                    z: obj.position.z,
                    ry: obj.rotation.y
                });
            }
        }
    });
}, 50);

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
let saveDroppedItemsTimeout = null;
function saveDroppedItems() {
    if (saveDroppedItemsTimeout) return;
    saveDroppedItemsTimeout = setTimeout(() => {
        fs.writeFile(ITEMS_FILE, JSON.stringify(droppedItemsNetwork, null, 2), (err) => {
            if (err) console.error("Error writing droppedItems.json", err);
        });
        saveDroppedItemsTimeout = null;
    }, 500);
}

// Store sessions and analytics
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
let sessionHistory = [];
if (fs.existsSync(SESSIONS_FILE)) {
    try {
        sessionHistory = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading sessions.json", e);
    }
}
function saveSessions() {
    fs.writeFile(SESSIONS_FILE, JSON.stringify(sessionHistory.slice(-100), null, 2), (err) => {});
}

const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
let analytics = { totalConnections: 0, uniqueUsers: {} };
if (fs.existsSync(ANALYTICS_FILE)) {
    try {
        analytics = JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading analytics.json", e);
    }
}
function saveAnalytics() {
    fs.writeFile(ANALYTICS_FILE, JSON.stringify(analytics, null, 2), (err) => {});
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
    socket.on('updateEnvironment', (envData) => {
        if (mapData.environment) {
            mapData.environment.timeOfDay = envData.timeOfDay;
            mapData.environment.timeSpeed = envData.timeSpeed;
            if (envData.nightBrightness !== undefined) {
                mapData.environment.nightBrightness = envData.nightBrightness;
            }
            // Optionally broadcast immediately, but the 5s loop will handle it
            io.emit('timeSync', mapData.environment);
        }
    });

    socket.on('join', (data) => {
        // Create player state only when they explicitly join
        players[socket.id] = {
            x: Math.random() * 20 - 10,
            y: 0,
            z: Math.random() * 20 - 10,
            color: Math.floor(Math.random() * 0xffffff),
            username: 'Guest_' + Math.floor(Math.random() * 1000),
            charType: 'modular', // default character type
            inventory: 0, // Default to hands (no gun)
            joinTime: Date.now()
        };

        analytics.totalConnections++;
        saveAnalytics();

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

        if (players[socket.id].username && !players[socket.id].username.startsWith('Guest_')) {
            analytics.uniqueUsers[players[socket.id].username] = (analytics.uniqueUsers[players[socket.id].username] || 0) + 1;
            saveAnalytics();
        }
    });

    socket.on('itemDropped', (data) => {
        const itemId = 'item_' + itemCounter++;
        droppedItemsNetwork[itemId] = { ...data, itemId };
        saveDroppedItems();
        io.emit('itemDropped', droppedItemsNetwork[itemId]);
        scheduleItemExpiration(itemId);
    });

    socket.on('itemsDroppedBatch', (batch) => {
        const responseBatch = [];
        batch.forEach(data => {
            const itemId = 'item_' + itemCounter++;
            droppedItemsNetwork[itemId] = { ...data, itemId };
            responseBatch.push(droppedItemsNetwork[itemId]);
            scheduleItemExpiration(itemId);
        });
        saveDroppedItems();
        io.emit('itemsDroppedBatch', responseBatch);
    });

    socket.on('playerCaughtFish', (data) => {
        socket.broadcast.emit('playerCaughtFish', {
            id: socket.id,
            color: data.color,
            spotPos: data.spotPos,
            playerPos: data.playerPos
        });
    });

    socket.on('itemPickedUp', (itemId) => {
        if (droppedItemsNetwork[itemId]) {
            delete droppedItemsNetwork[itemId];
            saveDroppedItems();
            io.emit('itemPickedUp', itemId);
        }
    });

    socket.on('boatMoved', (data) => {
        if (mapData && mapData.objects) {
            let boatObj = mapData.objects.find(o => o.id === data.id && o.type === 'Boat');
            if (boatObj) {
                boatObj.position = { x: data.x, y: data.y, z: data.z };
                if (!boatObj.rotation) boatObj.rotation = {};
                boatObj.rotation.y = data.ry;
            }
        }
        if (boatStates[data.id]) {
            boatStates[data.id].lastOccupiedTime = Date.now();
            boatStates[data.id].returning = false;
        }
        socket.broadcast.emit('boatMoved', data);
    });

    socket.on('boatOccupied', (id) => {
        if (boatStates[id]) {
            boatStates[id].lastOccupiedTime = Date.now();
            boatStates[id].returning = false;
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
            players[socket.id].fishingTarget = movementData.fishingTarget;
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
        
        if (players[socket.id] && players[socket.id].joinTime) {
            let duration = Date.now() - players[socket.id].joinTime;
            sessionHistory.push({
                username: players[socket.id].username,
                charType: players[socket.id].charType,
                duration: duration,
                joinTime: players[socket.id].joinTime,
                leaveTime: Date.now()
            });
            saveSessions();
        }
        
        delete players[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Game server listening on http://localhost:${PORT}`);
});
