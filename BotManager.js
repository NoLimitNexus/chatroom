const botNames = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy", "Mallory", "Peggy", "Trent", "Victor", "Walter"];

class BotManager {
    constructor(io, players, getMapData) {
        this.io = io;
        this.players = players;
        this.getMapData = getMapData;
        
        this.bots = {}; // id -> bot AI state
        
        // Run tick loop every 100ms
        setInterval(() => this.tick(), 100);
    }
    
    tick() {
        const mapData = this.getMapData();
        if (!mapData || !mapData.botConfig || !mapData.botConfig.enabled) {
            // Remove all bots if disabled
            for (let id in this.bots) {
                this.removeBot(id);
            }
            return;
        }
        
        const config = mapData.botConfig;
        
        // Maintain bot count
        const currentCount = Object.keys(this.bots).length;
        if (currentCount < config.count) {
            this.addBot(config);
        } else if (currentCount > config.count) {
            const botIds = Object.keys(this.bots);
            this.removeBot(botIds[0]);
        }
        
        // Tick each bot
        const delta = 0.1; // 100ms
        for (let id in this.bots) {
            this.tickBot(id, delta, config);
        }
    }
    
    addBot(config) {
        const id = 'bot_' + Math.floor(Math.random() * 1000000);
        
        // spawn near center
        const rx = config.zoneCenter.x + (Math.random() * 10 - 5);
        const rz = config.zoneCenter.z + (Math.random() * 10 - 5);
        
        this.players[id] = {
            x: rx,
            y: 0,
            z: rz,
            ry: 0,
            color: 0xffff00,
            username: 'Bot_' + botNames[Math.floor(Math.random() * botNames.length)],
            charType: 'goop',
            inventory: 0,
            joinTime: Date.now(),
            isBot: true,
            isMoving: false,
            isFishing: false,
            isCooking: false
        };
        
        this.bots[id] = {
            state: 'idle', // idle, wandering, moving_to_target, fishing, cooking
            timer: Math.random() * 2,
            targetX: rx,
            targetZ: rz,
            speed: 1.5 + Math.random() * 1.5 // 1.5 to 3.0 m/s
        };
        
        this.io.emit('playerJoined', { id: id, ...this.players[id] });
    }
    
    removeBot(id) {
        delete this.players[id];
        delete this.bots[id];
        this.io.emit('playerLeft', id);
    }
    
    tickBot(id, delta, config) {
        const player = this.players[id];
        const bot = this.bots[id];
        
        if (bot.timer > 0) {
            bot.timer -= delta;
            if (bot.timer <= 0) {
                // Change state
                this.pickNextAction(id, config);
            }
        }
        
        // Execute state
        if (bot.state === 'moving_to_target' || bot.state === 'wandering') {
            const dx = bot.targetX - player.x;
            const dz = bot.targetZ - player.z;
            const dist = Math.hypot(dx, dz);
            
            if (dist < 0.5) {
                // Reached destination
                player.isMoving = false;
                if (bot.state === 'moving_to_target' && bot.onReachTarget) {
                    bot.onReachTarget();
                    bot.onReachTarget = null;
                } else {
                    bot.state = 'idle';
                    bot.timer = 1 + Math.random() * 3;
                }
            } else {
                // Move
                player.isMoving = true;
                const dirX = dx / dist;
                const dirZ = dz / dist;
                player.x += dirX * bot.speed * delta;
                player.z += dirZ * bot.speed * delta;
                
                // Smooth rotation
                const targetRy = Math.atan2(dirX, dirZ);
                // Simple angle interpolation
                let angleDiff = targetRy - player.ry;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                player.ry += angleDiff * 5 * delta;
            }
        }
        
        // Periodically sync position to clients
        // We don't want to flood the network, maybe 5 times a second
        if (Math.random() < 0.5 || bot.timer <= 0) {
             this.io.emit('playerMoved', { 
                id: id, 
                x: player.x, 
                y: player.y,
                z: player.z,
                ry: player.ry,
                isMoving: player.isMoving,
                isSprinting: false,
                isCrouching: false,
                inventory: player.inventory,
                isFishing: player.isFishing,
                isCooking: player.isCooking,
                fishingTarget: player.fishingTarget
            });
        }
    }
    
    pickNextAction(id, config) {
        const player = this.players[id];
        const bot = this.bots[id];
        const mapData = this.getMapData();
        
        const rand = Math.random();
        player.isFishing = false;
        player.isCooking = false;
        
        if (rand < 0.4) {
            // Wander inside zone
            bot.state = 'wandering';
            const r = Math.random() * config.zoneRadius;
            const theta = Math.random() * Math.PI * 2;
            bot.targetX = config.zoneCenter.x + r * Math.cos(theta);
            bot.targetZ = config.zoneCenter.z + r * Math.sin(theta);
        } else if (rand < 0.6 && mapData.objects) {
            // Find fishing spot
            const spots = mapData.objects.filter(o => o.type === 'FishingSpot');
            if (spots.length > 0) {
                const spot = spots[Math.floor(Math.random() * spots.length)];
                bot.state = 'moving_to_target';
                // Move near the spot
                bot.targetX = spot.position.x + (Math.random() * 4 - 2);
                bot.targetZ = spot.position.z + (Math.random() * 4 - 2);
                bot.onReachTarget = () => {
                    bot.state = 'fishing';
                    player.isFishing = true;
                    player.fishingTarget = { x: spot.position.x, z: spot.position.z };
                    player.ry = Math.atan2(spot.position.x - player.x, spot.position.z - player.z);
                    bot.timer = 10 + Math.random() * 10;
                    
                    // Eventually catch a fish
                    setTimeout(() => {
                        if (this.players[id] && this.bots[id] && this.bots[id].state === 'fishing') {
                            this.io.emit('playerCaughtFish', { id: id, color: Math.random() * 0xffffff, spotPos: spot.position, playerPos: {x: player.x, y: player.y, z: player.z} });
                            player.inventory = 1; // has fish
                            this.io.emit('playerMoved', { id: id, inventory: player.inventory });
                        }
                    }, 5000 + Math.random() * 5000);
                };
            } else {
                bot.state = 'idle'; bot.timer = 2;
            }
        } else if (rand < 0.8 && mapData.objects) {
            // Cook fish (if has fish or randomly)
            const fires = mapData.objects.filter(o => o.type === 'Campfire');
            if (fires.length > 0) {
                const fire = fires[Math.floor(Math.random() * fires.length)];
                bot.state = 'moving_to_target';
                bot.targetX = fire.position.x + (Math.random() * 3 - 1.5);
                bot.targetZ = fire.position.z + (Math.random() * 3 - 1.5);
                bot.onReachTarget = () => {
                    bot.state = 'cooking';
                    player.isCooking = true;
                    player.ry = Math.atan2(fire.position.x - player.x, fire.position.z - player.z);
                    bot.timer = 5 + Math.random() * 5;
                    player.inventory = 0; // used fish
                };
            } else {
                bot.state = 'idle'; bot.timer = 2;
            }
        } else {
            bot.state = 'idle';
            bot.timer = 2 + Math.random() * 3;
        }
    }
}
module.exports = BotManager;
