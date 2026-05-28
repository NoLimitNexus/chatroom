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
        'Rock':        { icon: '🪨', category: 'Nature' },
        'Bush':        { icon: '🌿', category: 'Nature' },
        'FishingSpot': { icon: '🐟', category: 'Interactive' },
        'Barrel':      { icon: '🛢️', category: 'Props' },
        'Crate':       { icon: '📦', category: 'Props' },
        'Fence':       { icon: '🏗️', category: 'Structures' }
    },

    buildFishingRod: function() {
        const rod = new THREE.Group();

        // Handle / grip (cork-colored)
        const gripGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.35, 8);
        const gripMat = new THREE.MeshStandardMaterial({ color: 0xc4a265, roughness: 0.9 });
        const grip = new THREE.Mesh(gripGeo, gripMat);
        grip.position.y = 0.175;
        rod.add(grip);

        // Reel (metallic)
        const reelGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10);
        const reelMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.3 });
        const reel = new THREE.Mesh(reelGeo, reelMat);
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
            const segGeo = new THREE.CylinderGeometry(Math.max(thick - 0.002, 0.003), thick, segLen, 6);
            const segMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(0.07, 0.35, 0.32 + i * 0.04),
                roughness: 0.5
            });
            const seg = new THREE.Mesh(segGeo, segMat);
            seg.position.y = segLen / 2;
            pivot.add(seg);

            // Line guides (small rings)
            if (i > 0 && i < segCount - 1) {
                const guideGeo = new THREE.TorusGeometry(0.012, 0.003, 4, 8);
                const guideMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.5 });
                const guide = new THREE.Mesh(guideGeo, guideMat);
                guide.position.y = segLen;
                guide.rotation.x = Math.PI / 2;
                pivot.add(guide);
            }

            segments.push(pivot);
            parent = pivot;
        }

        // Tip-top guide
        const tipGeo = new THREE.SphereGeometry(0.008, 6, 6);
        const tipMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6 });
        const tip = new THREE.Mesh(tipGeo, tipMat);
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
        playerMesh.add(rodGroup);

        // Fishing line (world space) — bezier curve from tip to water
        const lineMat = new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 });
        const lineGeo = new THREE.BufferGeometry();
        const fishLine = new THREE.Line(lineGeo, lineMat);
        scene.add(fishLine);

        // Bobber / float
        const bobGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const bobMat = new THREE.MeshStandardMaterial({
            color: 0xff2222, emissive: 0xff4444, emissiveIntensity: 0.4, roughness: 0.3
        });
        const bob = new THREE.Mesh(bobGeo, bobMat);
        // White bottom half
        const bob2Geo = new THREE.SphereGeometry(0.048, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        const bob2Mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
        const bob2 = new THREE.Mesh(bob2Geo, bob2Mat);
        bob.add(bob2);
        scene.add(bob);

        playerMesh.userData.fishingRodData = { rodGroup, segments, line: fishLine, bob, tugPhase: 0 };
    },

    detachFishingRodFromPlayer: function(playerMesh, scene) {
        const data = playerMesh.userData.fishingRodData;
        if (!data) return;
        if (data.rodGroup.parent) data.rodGroup.parent.remove(data.rodGroup);
        scene.remove(data.line);
        data.line.geometry.dispose();
        data.line.material.dispose();
        scene.remove(data.bob);
        data.bob.geometry.dispose();
        data.bob.material.dispose();
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
            // Point light
            const light = new THREE.PointLight(0xff6600, 2, 8);
            light.position.y = 1.5;
            group.add(light);
            // Flickering updatable
            updatable = {
                _flame: flame,
                _light: light,
                _baseIntensity: 2,
                update: function(dt) {
                    const flicker = 1.5 + Math.sin(Date.now() * 0.01) * 0.4 + Math.sin(Date.now() * 0.023) * 0.3;
                    this._light.intensity = flicker;
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
            const glassMat = new THREE.MeshPhysicalMaterial({
                color: 0xffdd88, roughness: 0.1, metalness: 0,
                transparent: true, opacity: 0.4, emissive: 0xffaa44, emissiveIntensity: 0.5
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
            // Light
            const lanternLight = new THREE.PointLight(0xffaa44, 1.5, 6);
            lanternLight.position.y = 0.2;
            group.add(lanternLight);
            // Flicker
            updatable = {
                _light: lanternLight,
                _glass: glass,
                update: function(dt) {
                    const f = 1.2 + Math.sin(Date.now() * 0.008) * 0.3 + Math.sin(Date.now() * 0.019) * 0.2;
                    this._light.intensity = f;
                    this._glass.material.emissiveIntensity = 0.3 + Math.sin(Date.now() * 0.01) * 0.2;
                }
            };
            break;
        }

        // ---- FISHING SPOT ----
        case 'FishingSpot': {
            group = new THREE.Group();
            group.userData.interactable = true;
            group.userData.action = 'fishing';
            const spotLight = new THREE.PointLight(0x4fc3f7, 1.5, 5);
            spotLight.position.set(0, 0.5, 0);
            group.add(spotLight);
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
            // Bubbles — use initialX/initialZ/amp to match game loop
            const bubbles = [];
            const bubbleGeo = new THREE.SphereGeometry(0.05, 8, 8);
            const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xe0f7fa, transparent: true, opacity: 0.7, roughness: 0.2 });
            for (let i = 0; i < 20; i++) {
                const bubble = new THREE.Mesh(bubbleGeo, bubbleMat.clone());
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
            fsHit.userData = group.userData;
            fsHit.userData.parentGroup = group;
            group.add(fsHit);
            updatable = {
                _light: spotLight,
                _bubbles: bubbles,
                update: function(dt) {
                    const t = Date.now() * 0.001;
                    this._light.intensity = 1.2 + Math.sin(t * 3) * 0.4;
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
