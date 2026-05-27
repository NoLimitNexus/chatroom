const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling']
});

app.use(express.static('public'));

// Store player state
const players = {};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Create player with default state
    players[socket.id] = {
        x: Math.random() * 20 - 10,
        y: 0,
        z: Math.random() * 20 - 10,
        color: Math.floor(Math.random() * 0xffffff),
        username: 'Guest_' + Math.floor(Math.random() * 1000),
        charType: 'modular' // default character type
    };

    // Handle join (client sends username + character type)
    socket.on('join', (data) => {
        if (players[socket.id]) {
            // Support both old string format and new object format
            if (typeof data === 'string') {
                players[socket.id].username = data;
            } else {
                players[socket.id].username = data.username;
                players[socket.id].charType = data.charType || 'modular';
            }
        }
        // Send back all current players + this player's id
        socket.emit('init', { id: socket.id, players: players });
        // Tell everyone else about the new player
        socket.broadcast.emit('playerJoined', { id: socket.id, ...players[socket.id] });
        console.log(`${players[socket.id].username} joined as ${players[socket.id].charType}`);
    });

    // Handle movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].ry = movementData.ry;
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
                useFBX: movementData.useFBX
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
