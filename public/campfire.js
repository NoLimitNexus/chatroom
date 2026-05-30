// Campfire implementation integrating high-fidelity FireParticles config
// Ported from 3D-Unified-Workspace FireParticles App.jsx and Vibe-MMO Campfire.js

window.Campfire = class Campfire {
    constructor() {
        this.group = new THREE.Group();
        this.particles = [];
        this.maxParticles = 200; // Drastically reduced for performance
        
        // Define presets
        this.presets = {
            campfire: {
                name: 'Campfire',
                emissionRate: 3,
                speed: 1.5,
                spread: 0.8,
                size: 3,
                colorStart: '#ffaa00',
                colorEnd: '#ff0000',
                lifeSpan: 45,
                gravity: -0.05
            },
            torch: {
                name: 'Blue Torch',
                emissionRate: 15,
                speed: 5,
                spread: 0.5,
                size: 15,
                colorStart: '#00ffff',
                colorEnd: '#0000ff',
                lifeSpan: 40,
                gravity: -0.1
            },
            magic: {
                name: 'Magic Flame',
                emissionRate: 4,
                speed: 1.5,
                spread: 4,
                size: 40,
                colorStart: '#a855f7',
                colorEnd: '#1e1b4b',
                lifeSpan: 100,
                gravity: -0.02
            },
            embers: {
                name: 'Flying Embers',
                emissionRate: 2,
                speed: 7,
                spread: 8,
                size: 6,
                colorStart: '#ffffff',
                colorEnd: '#ff4400',
                lifeSpan: 90,
                gravity: -0.08
            }
        };
        
        this.config = Object.assign({}, this.presets.campfire);
        
        this._buildBase();
        this._buildParticles();
    }
    
    // Hex to RGB
    _hexToRgb(hex) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16) / 255;
            g = parseInt(hex[2] + hex[2], 16) / 255;
            b = parseInt(hex[3] + hex[3], 16) / 255;
        } else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16) / 255;
            g = parseInt(hex.substring(3, 5), 16) / 255;
            b = parseInt(hex.substring(5, 7), 16) / 255;
        }
        return { r, g, b };
    }

    _createCharredWoodTexture() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, size, size);

        ctx.strokeStyle = '#ff4500';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';

        for (let i = 0; i < 20; i++) {
            ctx.beginPath();
            const startX = Math.random() * size;
            const startY = Math.random() * size;
            ctx.moveTo(startX, startY);
            ctx.lineTo(startX + (Math.random() - 0.5) * 40, startY + (Math.random() - 0.5) * 40);
            ctx.stroke();
        }

        for (let i = 0; i < 100; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = Math.random() * 2;
            ctx.fillStyle = Math.random() > 0.5 ? '#ff8c00' : '#ff2200';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        return new THREE.CanvasTexture(canvas);
    }

    _buildBase() {
        // Base Logs
        const burntTexture = this._createCharredWoodTexture();
        const logMat = new THREE.MeshStandardMaterial({
            map: burntTexture,
            emissive: 0xff4500,
            emissiveMap: burntTexture,
            emissiveIntensity: 0.8,
            roughness: 0.9,
            color: 0x555555
        });

        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            roughness: 0.8,
        });

        const logGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.2, 5);
        const tilt = 0.35;

        const l1 = new THREE.Mesh(logGeo, logMat);
        l1.position.set(0, 0.5, -0.2);
        l1.rotation.set(tilt, 0, -0.2);
        l1.castShadow = true;
        this.group.add(l1);

        const l2 = new THREE.Mesh(logGeo, logMat);
        l2.position.set(-0.25, 0.5, 0.2);
        l2.rotation.set(-tilt, 0, -tilt);
        l2.castShadow = true;
        this.group.add(l2);

        const l3 = new THREE.Mesh(logGeo, logMat);
        l3.position.set(0.25, 0.5, 0.2);
        l3.rotation.set(-tilt, 0, tilt);
        l3.castShadow = true;
        this.group.add(l3);

        const stoneGeo = new THREE.DodecahedronGeometry(0.15, 0);
        const stoneCount = 8;
        const radius = 0.6;

        for (let i = 0; i < stoneCount; i++) {
            const angle = (i / stoneCount) * Math.PI * 2;
            const x = Math.sin(angle) * radius;
            const z = Math.cos(angle) * radius;

            const stone = new THREE.Mesh(stoneGeo, stoneMat);
            const scaleVar = 0.8 + Math.random() * 0.4;
            stone.scale.set(scaleVar, scaleVar * 0.7, scaleVar);

            stone.position.set(x + (Math.random() - 0.5) * 0.1, 0.05, z + (Math.random() - 0.5) * 0.1);
            stone.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
            stone.castShadow = true;
            this.group.add(stone);
        }

        // Light
        this.light = new THREE.PointLight(0xffaa33, 3, 12);
        this.light.position.y = 0.8;
        this.light.castShadow = false; // Disabled to save extreme performance drop
        this.group.add(this.light);
    }

    _buildParticles() {
        this.positions = new Float32Array(this.maxParticles * 3);
        this.colors = new Float32Array(this.maxParticles * 3);
        this.sizes = new Float32Array(this.maxParticles);
        
        for (let i = 0; i < this.maxParticles; i++) {
            this.particles.push({ active: false, life: 0, maxLife: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, startSize: 0 });
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

        this.material = new THREE.ShaderMaterial({
            uniforms: {},
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = size * (200.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
                    float r = dot(cxy, cxy);
                    if (r > 1.0) discard;
                    float alpha = (1.0 - r) * (1.0 - r);
                    gl_FragColor = vec4(vColor, alpha);
                }
            `,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.position.y = 0.2; // slight offset above ground
        this.group.add(this.points);
    }

    applyPreset(presetName) {
        if (this.presets[presetName]) {
            this.config = Object.assign({}, this.presets[presetName]);
            // Update light color to match particles
            const col = new THREE.Color(this.config.colorStart);
            this.light.color.copy(col);
        }
    }

    setConfig(key, value) {
        this.config[key] = value;
    }

    update() {
        // Flicker light
        const time = Date.now() * 0.001;
        const flicker = Math.sin(time * 20) * 0.1 + Math.sin(time * 8) * 0.05 + (Math.random() - 0.5) * 0.1;
        this.light.intensity = 3 + flicker;
        this.light.position.y = 0.8 + flicker * 0.2;

        let spawned = 0;
        const emitCount = this.config.emissionRate;

        // Spawn new particles
        for (let i = 0; i < this.maxParticles && spawned < emitCount; i++) {
            if (!this.particles[i].active) {
                const p = this.particles[i];
                p.active = true;
                p.life = 0;
                p.maxLife = this.config.lifeSpan * (0.8 + Math.random() * 0.4);

                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * (this.config.size * 0.02);

                p.x = Math.cos(angle) * radius;
                p.y = 0;
                p.z = Math.sin(angle) * radius;

                p.vx = (Math.random() - 0.5) * this.config.spread * 0.02;
                p.vy = (Math.random() * this.config.speed + this.config.speed * 0.5) * 0.02;
                p.vz = (Math.random() - 0.5) * this.config.spread * 0.02;

                p.startSize = this.config.size * (0.5 + Math.random() * 0.5);
                spawned++;
            }
        }

        const startC = this._hexToRgb(this.config.colorStart);
        const endC = this._hexToRgb(this.config.colorEnd);

        // Update existing particles
        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particles[i];
            if (p.active) {
                p.life += 1;
                if (p.life >= p.maxLife) {
                    p.active = false;
                    this.sizes[i] = 0;
                    continue;
                }

                p.x += p.vx;
                p.y += p.vy;
                p.z += p.vz;
                
                p.vy -= this.config.gravity * 0.02;

                const ratio = p.life / p.maxLife;

                this.sizes[i] = Math.max(0, p.startSize * (1 - ratio));

                this.positions[i * 3] = p.x;
                this.positions[i * 3 + 1] = p.y;
                this.positions[i * 3 + 2] = p.z;

                this.colors[i * 3] = startC.r + (endC.r - startC.r) * ratio;
                this.colors[i * 3 + 1] = startC.g + (endC.g - startC.g) * ratio;
                this.colors[i * 3 + 2] = startC.b + (endC.b - startC.b) * ratio;
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.attributes.size.needsUpdate = true;
    }
};
