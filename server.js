const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Store player state
const players = {};

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);
    
    // Create new player object
    players[socket.id] = {
        x: Math.random() * 600 + 100, // Random starting X
        y: Math.random() * 400 + 100, // Random starting Y
        color: `hsl(${Math.random() * 360}, 70%, 50%)`, // Random color
        username: 'Guest_' + Math.floor(Math.random() * 1000)
    };

    // Send the current players to the new player
    socket.emit('currentPlayers', players);
    
    // Tell everyone else a new player joined
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    // Handle movement
    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            // Broadcast to everyone else
            socket.broadcast.emit('playerMoved', { id: socket.id, x: movementData.x, y: movementData.y });
        }
    });

    // Handle chat
    socket.on('chatMessage', (message) => {
        io.emit('newChatMessage', { id: socket.id, username: players[socket.id].username, message: message });
    });

    // Handle username change
    socket.on('updateUsername', (newUsername) => {
        if (players[socket.id]) {
            players[socket.id].username = newUsername;
            io.emit('usernameUpdated', { id: socket.id, username: newUsername });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Game server listening on http://localhost:${PORT}`);
});
