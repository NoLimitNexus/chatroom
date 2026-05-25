const socket = io();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const loginPanel = document.getElementById('login-panel');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

let players = {};
let myId = null;

// Temporary input state
const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};

const PLAYER_SPEED = 4;
const PLAYER_RADIUS = 15;

// Chat speech bubbles above heads
const activeBubbles = {}; // socket.id -> { text, timer }

// --- Socket Events ---

socket.on('connect', () => {
    myId = socket.id;
});

socket.on('currentPlayers', (serverPlayers) => {
    players = serverPlayers;
});

socket.on('newPlayer', (playerInfo) => {
    players[playerInfo.id] = playerInfo.player;
});

socket.on('playerMoved', (movementData) => {
    if (players[movementData.id]) {
        players[movementData.id].x = movementData.x;
        players[movementData.id].y = movementData.y;
    }
});

socket.on('playerDisconnected', (playerId) => {
    delete players[playerId];
    delete activeBubbles[playerId];
});

socket.on('usernameUpdated', (data) => {
    if (players[data.id]) {
        players[data.id].username = data.username;
    }
});

socket.on('newChatMessage', (data) => {
    // Add to chat box
    const msgElement = document.createElement('div');
    msgElement.classList.add('chat-msg');
    msgElement.innerHTML = `<span class="chat-username">${data.username}:</span> ${data.message}`;
    chatMessages.appendChild(msgElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Add speech bubble above head
    activeBubbles[data.id] = {
        text: data.message,
        createdAt: Date.now()
    };
});

// --- User Input & Game Loop ---

joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim() || 'Anonymous';
    socket.emit('updateUsername', name);
    loginPanel.style.display = 'none';
    
    // Focus canvas so movement works immediately
    canvas.focus();
});

// Movement listeners
window.addEventListener('keydown', (e) => {
    if (document.activeElement === chatInput || document.activeElement === usernameInput) return;
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) {
        keys[e.key] = false;
    }
});

// Chat input listener
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const text = chatInput.value.trim();
        if (text) {
            socket.emit('chatMessage', text);
            chatInput.value = '';
        }
        canvas.focus(); // give focus back to game
    }
});

function update() {
    if (!myId || !players[myId]) return;

    let moved = false;
    const me = players[myId];

    if (keys.w || keys.ArrowUp) { me.y -= PLAYER_SPEED; moved = true; }
    if (keys.s || keys.ArrowDown) { me.y += PLAYER_SPEED; moved = true; }
    if (keys.a || keys.ArrowLeft) { me.x -= PLAYER_SPEED; moved = true; }
    if (keys.d || keys.ArrowRight) { me.x += PLAYER_SPEED; moved = true; }

    // Boundaries
    me.x = Math.max(PLAYER_RADIUS, Math.min(canvas.width - PLAYER_RADIUS, me.x));
    me.y = Math.max(PLAYER_RADIUS, Math.min(canvas.height - PLAYER_RADIUS, me.y));

    if (moved) {
        socket.emit('playerMovement', { x: me.x, y: me.y });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const now = Date.now();

    // Draw all players
    Object.keys(players).forEach(id => {
        const p = players[id];
        
        // Draw avatar shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + PLAYER_RADIUS - 2, PLAYER_RADIUS, PLAYER_RADIUS * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw avatar
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        
        // Avatar border
        ctx.lineWidth = 2;
        ctx.strokeStyle = id === myId ? '#fff' : '#000';
        ctx.stroke();

        // Draw nameplate
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.username, p.x, p.y + PLAYER_RADIUS + 15);

        // Draw speech bubble if active
        if (activeBubbles[id]) {
            const bubble = activeBubbles[id];
            // Bubbles last for 4 seconds
            if (now - bubble.createdAt < 4000) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                
                const textWidth = ctx.measureText(bubble.text).width;
                const boxW = Math.max(textWidth + 20, 40);
                const boxH = 25;
                const boxX = p.x - boxW / 2;
                const boxY = p.y - PLAYER_RADIUS - 35;

                // Bubble bg
                ctx.beginPath();
                ctx.roundRect(boxX, boxY, boxW, boxH, 8);
                ctx.fill();
                ctx.stroke();

                // Bubble tail
                ctx.beginPath();
                ctx.moveTo(p.x - 5, boxY + boxH);
                ctx.lineTo(p.x, boxY + boxH + 8);
                ctx.lineTo(p.x + 5, boxY + boxH);
                ctx.fill();
                ctx.stroke();

                // Text
                ctx.fillStyle = '#000';
                ctx.fillText(bubble.text, p.x, boxY + 17);
            } else {
                delete activeBubbles[id];
            }
        }
    });
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start loop
requestAnimationFrame(gameLoop);
