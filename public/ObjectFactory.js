// ============================================================
// OBJECT FACTORY — Procedural Environmental Props
// ============================================================
// Used by both editor.js and client.js to create world objects.
// Each type returns { group: THREE.Group, updatable: object|null }

window.ObjectFactory = {
    // Registry of all available types with display metadata
    types: {
        'Campfire':    { icon: '🔥', category: 'Lights' },
        'Torch':       { icon: '🕯️', category: 'Lights' },
        'Lantern':     { icon: '💡', category: 'Lights' },
        'Tree':        { icon: '🌳', category: 'Nature' },
        'Pine':        { icon: '🌲', category: 'Nature' },
        'PremiumPine': { icon: '🌲', category: 'Nature' },
        'Rock':        { icon: '🪨', category: 'Nature' },
        'Bush':        { icon: '🌿', category: 'Nature' },
        'FishingSpot': { icon: '🐟', category: 'Interactive' },
        'Boat':        { icon: '⛵', category: 'Interactive' },
        'Barrel':      { icon: '🛢️', category: 'Props' },
        'Crate':       { icon: '📦', category: 'Props' },
        'Fence':       { icon: '🏗️', category: 'Structures' }
    },

    sharedFishGeos: {},
    sharedFishMaterials: {},
    sharedFishFinMaterials: {},

    create3DFish: function(color) {
        const _this = window.ObjectFactory;
        if (!_this.sharedFishGeos.body) {
            _this.sharedFishGeos.body = new THREE.ConeGeometry(0.12, 0.4, 4);
            _this.sharedFishGeos.body.rotateX(Math.PI / 2); // Z-aligned
            _this.sharedFishGeos.tail = new THREE.ConeGeometry(0.08, 0.18, 4);
            _this.sharedFishGeos.tail.rotateX(Math.PI / 2);
            _this.sharedFishGeos.fin = new THREE.BoxGeometry(0.015, 0.12, 0.08);
        }
        
        if (!_this.sharedFishMaterials[color]) {
            _this.sharedFishMaterials[color] = new THREE.MeshStandardMaterial({ color: color, roughness: 0.1, metalness: 0.1 });
            _this.sharedFishFinMaterials[color] = new THREE.MeshStandardMaterial({ color: color, transparent: true, opacity: 0.8 });
        }

        const group = new THREE.Group();
        const body = new THREE.Mesh(_this.sharedFishGeos.body, _this.sharedFishMaterials[color]);
        group.add(body);
        
        const tail = new THREE.Mesh(_this.sharedFishGeos.tail, _this.sharedFishMaterials[color]);
        tail.position.z = -0.22;
        group.add(tail);
        
        const fin = new THREE.Mesh(_this.sharedFishGeos.fin, _this.sharedFishFinMaterials[color]);
        fin.position.y = 0.09;
        fin.position.z = -0.05;
        group.add(fin);
        
        return group;
    },

    createWoodTexture: function(baseColorHex, stripeColorHex, scale = 1) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = baseColorHex;
        ctx.fillRect(0, 0, 512, 512);
        
        ctx.strokeStyle = stripeColorHex;
        ctx.lineWidth = 3;
        for (let i = 0; i < 512; i += 12) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            for (let x = 0; x <= 512; x += 16) {
                const y = i + Math.sin(x * 0.03 + i * 0.1) * 8 + (Math.random() - 0.5) * 2;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        
        // Add knots
        ctx.fillStyle = stripeColorHex;
        for (let k = 0; k < 3; k++) {
            const knotX = Math.random() * 512;
            const knotY = Math.random() * 512;
            const rx = 15 + Math.random() * 20;
            const ry = 5 + Math.random() * 10;
            ctx.save();
            ctx.translate(knotX, knotY);
            ctx.rotate(Math.random() * Math.PI);
            ctx.scale(1, ry / rx);
            ctx.beginPath();
            ctx.arc(0, 0, rx, 0, Math.PI * 2);
            ctx.strokeStyle = stripeColorHex;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(scale, scale);
        return texture;
    },

    createWoodBumpMap: function(scale = 1) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 512, 512);
        
        ctx.strokeStyle = '#404040';
        ctx.lineWidth = 4;
        for (let i = 0; i < 512; i += 12) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            for (let x = 0; x <= 512; x += 16) {
                const y = i + Math.sin(x * 0.03 + i * 0.1) * 8 + (Math.random() - 0.5) * 2;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(scale, scale);
        return texture;
    },

    _cache: {},

    buildFishingRod: function() {
        const c = this._cache;
        
        // Cache Geometries
        if (!c.gripGeo) c.gripGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.35, 8);
        if (!c.reelGeo) c.reelGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10);
        if (!c.guideGeo) c.guideGeo = new THREE.TorusGeometry(0.012, 0.003, 4, 8);
        if (!c.tipGeo) c.tipGeo = new THREE.SphereGeometry(0.008, 6, 6);
        
        // Cache Materials
        if (!c.gripMat) c.gripMat = new THREE.MeshStandardMaterial({ color: 0xc4a265, roughness: 0.9 });
        if (!c.reelMat) c.reelMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.3 });
        if (!c.guideMat) c.guideMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.5 });
        if (!c.tipMat) c.tipMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 });

        const rod = new THREE.Group();

        // Handle / grip (cork-colored)
        const grip = new THREE.Mesh(c.gripGeo, c.gripMat);
        grip.position.y = 0.175;
        rod.add(grip);

        // Reel (metallic)
        const reel = new THREE.Mesh(c.reelGeo, c.reelMat);
        reel.rotation.x = Math.PI / 2;
        reel.position.set(0.035, 0.22, 0);
        rod.add(reel);

        // Shaft — 6 segments for realistic bending
        const segments = [];
        const segCount = 6;
        const totalLen = 1.8;
        const segLen = totalLen / segCount;
        let parent = rod;
        let baseY = 0.35;
        for (let i = 0; i < segCount; i++) {
            const pivot = new THREE.Group();
            pivot.position.y = (i === 0) ? baseY : segLen;
            parent.add(pivot);

            const thick = 0.018 - (i * 0.0022); // taper
            const segGeoName = 'segGeo' + i;
            if (!c[segGeoName]) c[segGeoName] = new THREE.CylinderGeometry(Math.max(thick - 0.002, 0.003), thick, segLen, 6);
            
            const segMatName = 'segMat' + i;
            if (!c[segMatName]) c[segMatName] = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.07, 0.35, 0.32 + i * 0.04),
                roughness: 0.5
            });
            const seg = new THREE.Mesh(c[segGeoName], c[segMatName]);
            seg.position.y = segLen / 2;
            pivot.add(seg);

            // Line guides (small rings)
            if (i > 0 && i < segCount - 1) {
                const guide = new THREE.Mesh(c.guideGeo, c.guideMat);
                guide.position.y = segLen;
                guide.rotation.x = Math.PI / 2;
                pivot.add(guide);
            }

            segments.push(pivot);
            parent = pivot;
        }

        // Tip-top guide
        const tip = new THREE.Mesh(c.tipGeo, c.tipMat);
        tip.position.y = segLen;
        parent.add(tip);

        // Position rod in right hand area, angled out over water
        rod.position.set(0.35, 0.75, 0.15);
        rod.rotation.set(Math.PI * 0.25, 0, -Math.PI * 0.15);

        return { rodGroup: rod, segments };
    },

    attachFishingRodToPlayer: function(playerMesh, scene) {
        if (playerMesh.userData.fishingRodData) return;
        const { rodGroup, segments } = this.buildFishingRod();
        
        // Always attach to player mesh directly to ensure visibility and scale
        if (playerMesh.userData.useFBX) {
            // Adjust position for FBX models (which have different origins/scales)
            rodGroup.position.set(0.3, 1.2, 0.5);
            rodGroup.rotation.set(Math.PI / 4, 0, -Math.PI / 8);
        }
        playerMesh.add(rodGroup);

        const c = this._cache;
        if (!c.bobGeo) c.bobGeo = new THREE.SphereGeometry(0.05, 8, 8);
        if (!c.bobMat) c.bobMat = new THREE.MeshStandardMaterial({
            color: 0xff2222, emissive: 0xff4444, emissiveIntensity: 0.4, roughness: 0.3
        });
        if (!c.bob2Geo) c.bob2Geo = new THREE.SphereGeometry(0.048, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        if (!c.bob2Mat) c.bob2Mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
        
        // Fishing line (world space) — bezier curve from tip to water
        const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 });
        const lineGeo = new THREE.BufferGeometry();
        const fishLine = new THREE.Line(lineGeo, lineMat);
        scene.add(fishLine);

        // Bobber / float
        const bob = new THREE.Mesh(c.bobGeo, c.bobMat);
        // White bottom half
        const bob2 = new THREE.Mesh(c.bob2Geo, c.bob2Mat);
        bob.add(bob2);
        scene.add(bob);

        playerMesh.userData.fishingRodData = { rodGroup, segments, line: fishLine, bob, tugPhase: 0 };
    },

    detachFishingRodFromPlayer: function(playerMesh, scene) {
        const data = playerMesh.userData.fishingRodData;
        if (!data) return;
        if (data.rodGroup && data.rodGroup.parent) data.rodGroup.parent.remove(data.rodGroup);
        if (data.line) {
            scene.remove(data.line);
            if (data.line.geometry) data.line.geometry.dispose();
            if (data.line.material) data.line.material.dispose();
        }
        if (data.bob) {
            scene.remove(data.bob);
            data.bob.traverse((child) => {
                // Do not dispose cached materials and geometries here
            });
        }
        playerMesh.userData.fishingRodData = null;
    },

    animateFishingRod: function(rodData, playerMesh, waterTarget, t, catchProgress) {
        // catchProgress 0->1 as catch approaches
        const tugBase = 0.02 + catchProgress * 0.06;
        const tugWave = Math.sin(t * 4.0) * tugBase;
        const jerk = (catchProgress > 0.7) ? Math.sin(t * 12.0) * 0.04 : 0;

        // Bend each rod segment progressively
        rodData.segments.forEach((seg, i) => {
            const factor = (i / rodData.segments.length);
            seg.rotation.x = factor * (tugWave + jerk) * 2.5;
            seg.rotation.z = Math.sin(t * 2.5 + i) * factor * 0.015;
        });

        // Update fishing line — bezier from rod tip to water
        const tipWorld = new THREE.Vector3();
        rodData.rodGroup.updateMatrixWorld(true);
        const lastSeg = rodData.segments[rodData.segments.length - 1];
        const tipLocal = new THREE.Vector3(0, 1.8 / rodData.segments.length, 0);
        lastSeg.localToWorld(tipWorld.copy(tipLocal));

        // Bezier mid-point (line sag)
        const mid = tipWorld.clone().lerp(waterTarget, 0.5);
        mid.y -= 0.4 + Math.sin(t * 2) * 0.1; // sag

        // Build curved line from bezier
        const curve = new THREE.QuadraticBezierCurve3(tipWorld, mid, waterTarget);
        const pts = curve.getPoints(16);
        rodData.line.geometry.dispose();
        rodData.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);

        // Bobber position at water target with bobbing
        rodData.bob.position.copy(waterTarget);
        rodData.bob.position.y += 0.03 + Math.sin(t * 3) * 0.02;
        // Bob dips when catch is close
        if (catchProgress > 0.8) {
            rodData.bob.position.y -= 0.06 * Math.sin(t * 10);
        }
    },

    create: function(type, config = {}) {
        let group = null;
        let updatable = null;

        switch (type) {

        // ---- CAMPFIRE ----
        case 'Campfire': {
            if (!window.Campfire) break;
            const instance = new window.Campfire();
            if (config && Object.keys(config).length > 0) {
                Object.assign(instance.config, config);
            }
            return { group: instance.group, updatable: instance };
        }

        // ---- TORCH ----
        case 'Torch': {
            group = new THREE.Group();
            // Pole
            const poleGeo = new THREE.CylinderGeometry(0.03, 0.04, 1.4, 6);
            const poleMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.y = 0.7;
            pole.castShadow = true;
            group.add(pole);
            // Holder
            const holderGeo = new THREE.CylinderGeometry(0.06, 0.04, 0.12, 8);
            const holderMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.6 });
            const holder = new THREE.Mesh(holderGeo, holderMat);
            holder.position.y = 1.4;
            group.add(holder);
            // Flame glow sphere
            const flameGeo = new THREE.SphereGeometry(0.08, 8, 8);
            const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.9 });
            const flame = new THREE.Mesh(flameGeo, flameMat);
            flame.position.y = 1.52;
            group.add(flame);
            
            // Flickering updatable
            updatable = {
                _flame: flame,
                update: function(dt) {
                    this._flame.scale.setScalar(0.8 + Math.sin(Date.now() * 0.015) * 0.3);
                }
            };
            break;
        }

        // ---- TREE (Deciduous) ----
        case 'Tree': {
            group = new THREE.Group();
            const trunkGeo = new THREE.CylinderGeometry(0.1, 0.18, 2.2, 8);
            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 1.1;
            trunk.castShadow = true;
            group.add(trunk);
            // Canopy — cluster of spheres for organic look
            const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2d8a4e, roughness: 0.85 });
            const offsets = [
                { x: 0, y: 3.0, z: 0, r: 1.1 },
                { x: 0.5, y: 2.7, z: 0.3, r: 0.8 },
                { x: -0.4, y: 2.6, z: -0.3, r: 0.75 },
                { x: 0.1, y: 3.4, z: -0.2, r: 0.7 }
            ];
            offsets.forEach(o => {
                const leafGeo = new THREE.SphereGeometry(o.r, 10, 8);
                const leaf = new THREE.Mesh(leafGeo, canopyMat);
                leaf.position.set(o.x, o.y, o.z);
                leaf.castShadow = true;
                group.add(leaf);
            });
            break;
        }

        // ---- PINE TREE ----
        case 'Pine': {
            group = new THREE.Group();
            const pTrunkGeo = new THREE.CylinderGeometry(0.08, 0.14, 2.5, 6);
            const pTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e12, roughness: 0.9 });
            const pTrunk = new THREE.Mesh(pTrunkGeo, pTrunkMat);
            pTrunk.position.y = 1.25;
            pTrunk.castShadow = true;
            group.add(pTrunk);
            // Layered cones
            const pineMat = new THREE.MeshStandardMaterial({ color: 0x1a5c32, roughness: 0.85 });
            const layers = [
                { y: 2.0, r: 1.0, h: 1.2 },
                { y: 2.8, r: 0.75, h: 1.0 },
                { y: 3.5, r: 0.5, h: 0.9 }
            ];
            layers.forEach(l => {
                const coneGeo = new THREE.ConeGeometry(l.r, l.h, 8);
                const cone = new THREE.Mesh(coneGeo, pineMat);
                cone.position.y = l.y;
                cone.castShadow = true;
                group.add(cone);
            });
            break;
        }

        // ---- PREMIUM PINE (From Shared Environment) ----
        case 'PremiumPine': {
            group = new THREE.Group();
            const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 1.2, 6);
            const tier1Geo = new THREE.ConeGeometry(1.8, 2.5, 6);
            const tier2Geo = new THREE.ConeGeometry(1.4, 2.0, 6);
            const tier3Geo = new THREE.ConeGeometry(1.0, 1.5, 6);

            trunkGeo.translate(0, 0.6, 0);
            tier1Geo.translate(0, 1.25, 0);
            tier2Geo.translate(0, 1.0, 0);
            tier3Geo.translate(0, 0.75, 0);

            const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3219, roughness: 1.0, flatShading: true });
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x245223, roughness: 0.9, flatShading: true });
            const darkLeafMat = new THREE.MeshStandardMaterial({ color: 0x1a3d19, roughness: 0.9, flatShading: true });

            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.castShadow = true; trunk.receiveShadow = true;
            group.add(trunk);

            // In procedural env, it was randomly picking leafMat vs darkLeafMat per tree. We can just pick one, or use a vertex color... let's just pick darkLeafMat as default.
            // If they want variety, we can use a seed or just random. Let's use random for visual parity.
            const mat = Math.random() > 0.5 ? leafMat : darkLeafMat;

            const t1 = new THREE.Mesh(tier1Geo, mat);
            t1.position.y = 0.8;
            t1.castShadow = true; t1.receiveShadow = true;
            group.add(t1);

            const t2 = new THREE.Mesh(tier2Geo, mat);
            t2.position.y = t1.position.y + 1.2;
            t2.castShadow = true; t2.receiveShadow = true;
            group.add(t2);

            const t3 = new THREE.Mesh(tier3Geo, mat);
            t3.position.y = t2.position.y + 1.0;
            t3.castShadow = true; t3.receiveShadow = true;
            group.add(t3);
            break;
        }

        // ---- ROCK ----
        case 'Rock': {
            group = new THREE.Group();
            const rockGeo = new THREE.DodecahedronGeometry(0.6, 1);
            // Deform vertices for organic look
            const pos = rockGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                pos.setX(i, pos.getX(i) * (0.8 + Math.random() * 0.4));
                pos.setY(i, pos.getY(i) * (0.6 + Math.random() * 0.3));
                pos.setZ(i, pos.getZ(i) * (0.8 + Math.random() * 0.4));
            }
            rockGeo.computeVertexNormals();
            const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.95, metalness: 0.05 });
            const rock = new THREE.Mesh(rockGeo, rockMat);
            rock.position.y = 0.3;
            rock.castShadow = true;
            rock.receiveShadow = true;
            group.add(rock);
            break;
        }

        // ---- BUSH ----
        case 'Bush': {
            group = new THREE.Group();
            const bushMat = new THREE.MeshStandardMaterial({ color: 0x3a9a5c, roughness: 0.9 });
            const bushPositions = [
                { x: 0, y: 0.3, z: 0, r: 0.4 },
                { x: 0.25, y: 0.25, z: 0.2, r: 0.3 },
                { x: -0.2, y: 0.2, z: -0.15, r: 0.28 },
                { x: 0.1, y: 0.35, z: -0.2, r: 0.25 }
            ];
            bushPositions.forEach(b => {
                const geo = new THREE.SphereGeometry(b.r, 8, 6);
                const mesh = new THREE.Mesh(geo, bushMat);
                mesh.position.set(b.x, b.y, b.z);
                mesh.castShadow = true;
                group.add(mesh);
            });
            break;
        }

        // ---- BARREL ----
        case 'Barrel': {
            group = new THREE.Group();
            // Main body — slightly bulging cylinder
            const barrelGeo = new THREE.CylinderGeometry(0.28, 0.26, 0.7, 12);
            const barrelMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
            const barrel = new THREE.Mesh(barrelGeo, barrelMat);
            barrel.position.y = 0.35;
            barrel.castShadow = true;
            group.add(barrel);
            // Metal rings
            const ringMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.7 });
            [0.12, 0.55].forEach(y => {
                const ringGeo = new THREE.TorusGeometry(0.28, 0.012, 6, 16);
                const ring = new THREE.Mesh(ringGeo, ringMat);
                ring.position.y = y;
                ring.rotation.x = Math.PI / 2;
                group.add(ring);
            });
            break;
        }

        // ---- CRATE ----
        case 'Crate': {
            group = new THREE.Group();
            const crateGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
            const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.85 });
            const crate = new THREE.Mesh(crateGeo, crateMat);
            crate.position.y = 0.3;
            crate.castShadow = true;
            crate.receiveShadow = true;
            group.add(crate);
            // Cross planks
            const plankMat = new THREE.MeshStandardMaterial({ color: 0x6b5335, roughness: 0.9 });
            const plankGeo = new THREE.BoxGeometry(0.62, 0.04, 0.04);
            [-1, 1].forEach(side => {
                const plank = new THREE.Mesh(plankGeo, plankMat);
                plank.position.set(0, 0.3, side * 0.31);
                group.add(plank);
                const plank2 = new THREE.Mesh(plankGeo, plankMat);
                plank2.position.set(side * 0.31, 0.3, 0);
                plank2.rotation.y = Math.PI / 2;
                group.add(plank2);
            });
            break;
        }

        // ---- FENCE (Section) ----
        case 'Fence': {
            group = new THREE.Group();
            const fenceMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85 });
            // Posts
            [-0.8, 0, 0.8].forEach(x => {
                const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6);
                const post = new THREE.Mesh(postGeo, fenceMat);
                post.position.set(x, 0.5, 0);
                post.castShadow = true;
                group.add(post);
            });
            // Rails
            [0.3, 0.7].forEach(y => {
                const railGeo = new THREE.BoxGeometry(1.8, 0.06, 0.04);
                const rail = new THREE.Mesh(railGeo, fenceMat);
                rail.position.set(0, y, 0);
                rail.castShadow = true;
                group.add(rail);
            });
            break;
        }

        // ---- LANTERN ----
        case 'Lantern': {
            group = new THREE.Group();
            // Base
            const baseGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.06, 8);
            const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3, metalness: 0.8 });
            const base = new THREE.Mesh(baseGeo, metalMat);
            base.position.y = 0.03;
            group.add(base);
            // Glass body
            const glassGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.25, 8);
            const glassMat = new THREE.MeshBasicMaterial({
                color: 0xffaa44, transparent: true, opacity: 0.6
            });
            const glass = new THREE.Mesh(glassGeo, glassMat);
            glass.position.y = 0.19;
            group.add(glass);
            // Top cap
            const capGeo = new THREE.ConeGeometry(0.1, 0.08, 8);
            const cap = new THREE.Mesh(capGeo, metalMat);
            cap.position.y = 0.36;
            group.add(cap);
            // Handle
            const handleGeo = new THREE.TorusGeometry(0.06, 0.01, 6, 12, Math.PI);
            const handle = new THREE.Mesh(handleGeo, metalMat);
            handle.position.y = 0.4;
            group.add(handle);
            
            // Flicker
            updatable = {
                _glass: glass,
                update: function(dt) {
                    this._glass.material.opacity = 0.5 + Math.sin(Date.now() * 0.01) * 0.2;
                }
            };
            break;
        }

        // ---- FISHING SPOT ----
        case 'FishingSpot': {
            group = new THREE.Group();
            group.userData.interactable = true;
            group.userData.action = 'fishing';
            
            // Ring indicator — hidden by default, shown on targeting
            const ringGeo = new THREE.RingGeometry(0.6, 0.8, 24);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.05;
            ring.visible = false;
            ring.userData._isRing = true;
            group.add(ring);
            group.userData.ring = ring;
            
            // Cache bubbles geometry and material to save RAM
            const c = window.ObjectFactory._cache;
            if (!c.bubbleGeo) c.bubbleGeo = new THREE.SphereGeometry(0.05, 8, 8);
            if (!c.bubbleMat) c.bubbleMat = new THREE.MeshBasicMaterial({ color: 0xe0f7fa, transparent: true, opacity: 0.7 });
            
            // Bubbles
            const bubbles = [];
            for (let i = 0; i < 4; i++) {
                // Must clone material because opacity is animated individually per bubble
                const bubble = new THREE.Mesh(c.bubbleGeo, c.bubbleMat.clone());
                const r = 0.8 * Math.sqrt(Math.random());
                const theta = Math.random() * 2 * Math.PI;
                bubble.position.set(r * Math.cos(theta), 0.0, r * Math.sin(theta));
                bubble.userData = {
                    speed: 0.3 + Math.random() * 0.4,
                    initialX: bubble.position.x,
                    initialZ: bubble.position.z,
                    offset: Math.random() * Math.PI * 2,
                    amp: 0.05,
                    popping: false
                };
                group.add(bubble);
                bubbles.push(bubble);
            }
            group.userData.bubbles = bubbles;
            
            // Hit cylinder for raycasting in game
            const fsHitGeo = new THREE.CylinderGeometry(1.5, 1.5, 2.0, 8);
            const fsHitMat = new THREE.MeshBasicMaterial({ visible: false });
            const fsHit = new THREE.Mesh(fsHitGeo, fsHitMat);
            fsHit.position.y = 1.0;
            fsHit.userData.interactable = true;
            fsHit.userData.action = 'fishing';
            fsHit.userData.parentGroup = group;
            group.add(fsHit);
            
            updatable = {
                _bubbles: bubbles,
                update: function(t, dt) {
                    this._bubbles.forEach(b => {
                        if (b.userData.popping) {
                            b.scale.addScalar(dt * 8.0);
                            b.material.opacity -= dt * 3.0;
                            if (b.material.opacity <= 0) {
                                b.userData.popping = false;
                                b.position.y = 0.0;
                                b.scale.setScalar(1.0);
                                b.material.opacity = 0.7;
                                const r = 0.8 * Math.sqrt(Math.random());
                                const theta = Math.random() * 2 * Math.PI;
                                b.userData.initialX = r * Math.cos(theta);
                                b.userData.initialZ = r * Math.sin(theta);
                                b.position.x = b.userData.initialX;
                                b.position.z = b.userData.initialZ;
                            }
                            return;
                        }
                        b.position.y += b.userData.speed * dt;
                        b.position.x = b.userData.initialX + Math.cos(t * 3 + b.userData.offset) * b.userData.amp;
                        b.position.z = b.userData.initialZ + Math.sin(t * 3 + b.userData.offset) * b.userData.amp;
                        if (b.position.y > 1.0) b.userData.popping = true;
                    });
                }
            };
            break;
        }

        // ---- BOAT ----
        case 'Boat': {
            group = new THREE.Group();
            group.userData.interactable = true;
            group.userData.action = 'boat';
            group.userData.type = 'Boat';

            const c = window.ObjectFactory._cache;
            if (!c.boatWoodMat) {
                const woodTex = window.ObjectFactory.createWoodTexture('#8B6914', '#5A3E10', 1);
                const woodBump = window.ObjectFactory.createWoodBumpMap(1);
                const darkWoodTex = window.ObjectFactory.createWoodTexture('#5C4010', '#3D280A', 1);
                const darkWoodBump = window.ObjectFactory.createWoodBumpMap(1);

                c.boatWoodMat = new THREE.MeshStandardMaterial({
                    map: woodTex, bumpMap: woodBump, bumpScale: 0.02, roughness: 0.8, metalness: 0.1
                });
                c.boatDarkWoodMat = new THREE.MeshStandardMaterial({
                    map: darkWoodTex, bumpMap: darkWoodBump, bumpScale: 0.02, roughness: 0.85, metalness: 0.05
                });
                c.boatMetalMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.7 });
                
                const oarBladeTex = window.ObjectFactory.createWoodTexture('#6B4226', '#4A2A18', 1);
                c.oarBladeMat = new THREE.MeshStandardMaterial({
                    map: oarBladeTex, roughness: 0.8
                });
            }

            const woodMat = c.boatWoodMat;
            const darkWoodMat = c.boatDarkWoodMat;
            const metalMat = c.boatMetalMat;
            const oarBladeMat = c.oarBladeMat;

            const visualGroup = new THREE.Group();
            visualGroup.rotation.y = Math.PI / 2;
            group.add(visualGroup);

            // Bottom hull
            const bottomGeo = new THREE.BoxGeometry(2.6, 0.12, 1.0);
            const bottom = new THREE.Mesh(bottomGeo, darkWoodMat);
            bottom.position.y = 0.0;
            visualGroup.add(bottom);

            // False floor (raised inside to physically block water from showing through)
            // Water max height relative to boat is ~0.10. Placing this at 0.12 hides the water completely.
            const falseFloorGeo = new THREE.BoxGeometry(2.5, 0.06, 0.9);
            const falseFloor = new THREE.Mesh(falseFloorGeo, darkWoodMat);
            falseFloor.position.y = 0.12; 
            visualGroup.add(falseFloor);

            // Side walls
            const sideGeo = new THREE.BoxGeometry(2.6, 0.4, 0.08);
            [-0.48, 0.48].forEach(z => {
                const side = new THREE.Mesh(sideGeo, woodMat);
                side.position.set(0, 0.24, z);
                visualGroup.add(side);
            });

            // Bow (front tapered)
            const bowGeo = new THREE.BoxGeometry(0.08, 0.4, 1.04);
            const bow = new THREE.Mesh(bowGeo, woodMat);
            bow.position.set(1.26, 0.24, 0);
            visualGroup.add(bow);

            // Stern (back)
            const sternGeo = new THREE.BoxGeometry(0.08, 0.5, 1.04);
            const stern = new THREE.Mesh(sternGeo, woodMat);
            stern.position.set(-1.26, 0.27, 0);
            visualGroup.add(stern);

            // Seat 1 (back)
            const seatGeo = new THREE.BoxGeometry(0.12, 0.06, 0.82);
            const seat1 = new THREE.Mesh(seatGeo, darkWoodMat);
            seat1.position.set(-0.5, 0.2, 0);
            visualGroup.add(seat1);

            // Seat 2 (middle)
            const seat2 = new THREE.Mesh(seatGeo, darkWoodMat);
            seat2.position.set(0.3, 0.2, 0);
            visualGroup.add(seat2);

            // Oar locks (metal pins on sides)
            const lockGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 6);
            [-0.52, 0.52].forEach(z => {
                const lock = new THREE.Mesh(lockGeo, metalMat);
                lock.position.set(0, 0.42, z);
                visualGroup.add(lock);
            });

            // Oars
            const oarShaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6);
            const oarBladeGeo = new THREE.BoxGeometry(0.18, 0.02, 0.08);

            [-1, 1].forEach(side => {
                const oarGroup = new THREE.Group();
                const shaft = new THREE.Mesh(oarShaftGeo, woodMat);
                shaft.rotation.z = Math.PI / 2;
                oarGroup.add(shaft);
                const blade = new THREE.Mesh(oarBladeGeo, oarBladeMat);
                blade.position.set(side * 0.85, 0, 0);
                oarGroup.add(blade);
                oarGroup.position.set(0, 0.35, side * 0.52);
                oarGroup.rotation.x = side * 0.3;
                visualGroup.add(oarGroup);
            });

            // Hit cylinder for raycasting (transparent, not invisible — visible:false blocks raycasting in r128)
            const boatHitGeo = new THREE.CylinderGeometry(2.0, 2.0, 1.5, 8);
            const boatHitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
            const boatHit = new THREE.Mesh(boatHitGeo, boatHitMat);
            boatHit.position.y = 0.3;
            boatHit.userData.interactable = true;
            boatHit.userData.action = 'boat';
            boatHit.userData.type = 'Boat';
            boatHit.userData.parentGroup = group;
            group.add(boatHit);

            // Bobbing animation — _baseY is set lazily from current group position on first update
            updatable = {
                _group: group,
                _baseY: null,
                update: function(t, delta) {
                    if (this._baseY === null) this._baseY = this._group.position.y;
                    this._group.position.y = this._baseY + Math.sin(t * 1.5) * 0.05;
                    visualGroup.rotation.x = Math.sin(t * 2.0) * 0.03;
                    visualGroup.rotation.z = Math.cos(t * 1.2) * 0.02;
                }
            };
            break;
        }

        default:
            console.warn(`ObjectFactory: Unknown type '${type}'`);
            return null;
        }

        if (group) {
            return { group, updatable };
        }
        return null;
    }
};
