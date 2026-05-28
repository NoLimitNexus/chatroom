// 3D Chatroom Client — Exact characters from 3D-Unified-Workspace
(function () {
    'use strict';
    var socket = io();

    // UI refs
    var loginPanel = document.getElementById('login-panel');
    var step1 = document.getElementById('login-step-1');
    var step2 = document.getElementById('login-step-2');
    var usernameInput = document.getElementById('username-input');
    var nextBtn = document.getElementById('next-btn');
    var chatBox = document.getElementById('chat-box');
    var chatInput = document.getElementById('chat-input');
    var chatMessages = document.getElementById('chat-messages');
    var crosshair = document.getElementById('crosshair');
    var container = document.getElementById('game-container');

    var selectedChar = 'goop';
    var isPlaying = false;
    var myId = null;
    var players = {};
    var isLocked = false;
    var myCharacter = null;
    var camRig = new THREE.Group();
    var keys = {};

    // --- FISHING & INVENTORY ---
    var GAME_ITEMS = {
        raw_shrimp:    { id: 'raw_shrimp',    name: 'Raw Shrimp',    color: 0xffbdde, icon: 'assets/icons/fish/shrimp.png',    cookable: true, cookedId: 'cooked_shrimp' },
        raw_trout:     { id: 'raw_trout',     name: 'Raw Trout',     color: 0xa8a8a8, icon: 'assets/icons/fish/trout.png',     cookable: true, cookedId: 'cooked_trout' },
        cooked_shrimp: { id: 'cooked_shrimp', name: 'Cooked Shrimp', color: 0xff7043, icon: 'assets/icons/fish/shrimp.png',    cookable: false },
        cooked_trout:  { id: 'cooked_trout',  name: 'Cooked Trout',  color: 0xd4a574, icon: 'assets/icons/fish/trout.png',     cookable: false }
    };
    var playerItems = new Array(20).fill(null);
    var fishingSpots = [];
    var vfxOrbs = [];
    var inventoryOpen = false; // hidden by default, toggled with Tab

    // Auto-fishing & auto-cooking state (mutually exclusive)
    var autoFishing = { active: false, spotGroup: null, timer: 0, interval: 1.5 };
    var autoCooking = { active: false, campfireGroup: null, timer: 0, interval: 2.0 };
    var fishingRodData = null; // { rodGroup, line, bob, segments }

    // --- Build a procedural fishing rod ---
    function buildFishingRod() {
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
    }

    // --- Attach/detach fishing rod ---
    function attachFishingRod() {
        if (fishingRodData || !myCharacter) return;
        const { rodGroup, segments } = buildFishingRod();
        myCharacter.add(rodGroup);

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

        fishingRodData = { rodGroup, segments, line: fishLine, bob, tugPhase: 0 };
    }

    function detachFishingRod() {
        if (!fishingRodData) return;
        if (fishingRodData.rodGroup.parent) fishingRodData.rodGroup.parent.remove(fishingRodData.rodGroup);
        scene.remove(fishingRodData.line);
        fishingRodData.line.geometry.dispose();
        fishingRodData.line.material.dispose();
        scene.remove(fishingRodData.bob);
        fishingRodData.bob.geometry.dispose();
        fishingRodData.bob.material.dispose();
        fishingRodData = null;
    }
    var raycaster = new THREE.Raycaster();
    var dragState = { fromIdx: -1, ghost: null };
    var droppedItems = []; // 3D items on the ground
    
    function updateInventoryUI() {
        var invGrid = document.getElementById('inventory-grid');
        if (!invGrid) return;
        
        invGrid.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            const item = playerItems[i];
            var el = document.createElement('div');
            el.className = 'inv-slot';
            el.dataset.idx = i;
            el.style.cssText = 'background:rgba(255,255,255,0.08); border:1px solid rgba(59,130,246,0.4); border-radius:6px; width:44px; height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; cursor:pointer; transition:border-color 0.15s, background 0.15s;';
            if (item) {
                el.draggable = true;
                el.innerHTML = '<img src="' + item.icon + '" style="width:26px; height:26px; object-fit:contain; pointer-events:none;"><div style="font-size:7px; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; text-align:center; pointer-events:none; color:#cbd5e1;">' + item.name + '</div>';
                el.style.cursor = 'grab';
                // Drag start
                el.addEventListener('dragstart', (e) => {
                    dragState.fromIdx = i;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', i.toString());
                    el.style.opacity = '0.4';
                    // Create drag ghost
                    const ghost = document.createElement('div');
                    ghost.style.cssText = 'position:fixed; pointer-events:none; z-index:9999; width:40px; height:40px; background:rgba(59,130,246,0.3); border:2px solid #3b82f6; border-radius:6px; display:flex; align-items:center; justify-content:center;';
                    ghost.innerHTML = '<img src="' + item.icon + '" style="width:24px;height:24px;">';
                    document.body.appendChild(ghost);
                    e.dataTransfer.setDragImage(ghost, 20, 20);
                    dragState.ghost = ghost;
                    setTimeout(() => { if (dragState.ghost) dragState.ghost.remove(); }, 0);
                });
                el.addEventListener('dragend', (e) => {
                    el.style.opacity = '1';
                    if (dragState.ghost) { dragState.ghost.remove(); dragState.ghost = null; }
                    // Check if dropped outside the inventory panel
                    const invUI = document.getElementById('inventory-ui');
                    const rect = invUI.getBoundingClientRect();
                    const mx = e.clientX, my = e.clientY;
                    if (mx < rect.left || mx > rect.right || my < rect.top || my > rect.bottom) {
                        // Drop item on ground!
                        dropItemOnGround(dragState.fromIdx);
                    }
                    dragState.fromIdx = -1;
                });
            }
            // Drop target (for swapping/moving)
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                el.style.borderColor = '#22d3ee';
                el.style.background = 'rgba(34,211,238,0.15)';
            });
            el.addEventListener('dragleave', () => {
                el.style.borderColor = 'rgba(59,130,246,0.4)';
                el.style.background = 'rgba(255,255,255,0.08)';
            });
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.style.borderColor = 'rgba(59,130,246,0.4)';
                el.style.background = 'rgba(255,255,255,0.08)';
                const fromIdx = dragState.fromIdx;
                const toIdx = parseInt(el.dataset.idx);
                if (fromIdx >= 0 && fromIdx !== toIdx) {
                    // Swap items
                    const temp = playerItems[toIdx];
                    playerItems[toIdx] = playerItems[fromIdx];
                    playerItems[fromIdx] = temp;
                    updateInventoryUI();
                }
            });
            invGrid.appendChild(el);
        }
    }

    function spawnDroppedItem(data) {
        const item = data.itemData;
        const pickupGroup = new THREE.Group();
        // Glowing sphere
        const geo = new THREE.SphereGeometry(0.2, 10, 10);
        const mat = new THREE.MeshStandardMaterial({
            color: item.color, emissive: item.color, emissiveIntensity: 1.5,
            transparent: true, opacity: 0.85, roughness: 0.2
        });
        const sphere = new THREE.Mesh(geo, mat);
        pickupGroup.add(sphere);
        // Halo
        const haloGeo = new THREE.SphereGeometry(0.35, 10, 10);
        const haloMat = new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.15 });
        pickupGroup.add(new THREE.Mesh(haloGeo, haloMat));
        // Light
        const light = new THREE.PointLight(item.color, 2, 5);
        pickupGroup.add(light);

        pickupGroup.position.set(data.position.x, data.position.y, data.position.z);
        pickupGroup.userData.droppedItem = item;
        pickupGroup.userData.itemId = data.itemId;
        pickupGroup.userData.spawnTime = performance.now() * 0.001;
        scene.add(pickupGroup);
        droppedItems.push(pickupGroup);
    }

    // Drop item from inventory onto the 3D ground
    function dropItemOnGround(idx) {
        const item = playerItems[idx];
        if (!item || !myCharacter) return;
        playerItems[idx] = null;
        updateInventoryUI();
        addChatMessage('System', 'Dropped ' + item.name, 0xffaa00);

        // Spawn 3D pickup in front of the player
        const dropPos = myCharacter.position.clone();
        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), myCharacter.rotation.y);
        dropPos.addScaledVector(fwd, 1.5);
        dropPos.y = getTerrainHeight(dropPos.x, dropPos.z) + 0.3;

        socket.emit('itemDropped', { itemData: item, position: { x: dropPos.x, y: dropPos.y, z: dropPos.z } });
    }

    let nearestInteractable = null;

    // Check dropped items near player to prompt pickup
    function checkPickupDroppedItems() {
        nearestInteractable = null;
        if (!myCharacter || !isLocked) {
            updateInteractionPrompt();
            return;
        }
        
        let closestDist = Infinity;
        let closestItem = null;

        // Check dropped items
        for (let i = droppedItems.length - 1; i >= 0; i--) {
            const pickup = droppedItems[i];
            const dist = myCharacter.position.distanceTo(pickup.position);
            if (dist < 2.5 && dist < closestDist) {
                closestDist = dist;
                closestItem = pickup;
            }
        }
        
        // Check fishing spots
        fishingSpots.forEach(s => {
            const dist = myCharacter.position.distanceTo(s.position);
            if (dist < 8.0 && dist < closestDist) {
                closestDist = dist;
                closestItem = s;
            }
        });

        // Check campfires
        environmentObjects.forEach(obj => {
            if (obj.userData.type === 'Campfire') {
                const dist = myCharacter.position.distanceTo(obj.position);
                if (dist < 7.0 && dist < closestDist) {
                    closestDist = dist;
                    closestItem = obj;
                }
            }
        });

        nearestInteractable = closestItem;
        updateInteractionPrompt();
    }

    function updateInteractionPrompt() {
        const promptEl = document.getElementById('interaction-prompt');
        if (!promptEl) return;
        
        if (nearestInteractable && !inventoryOpen) {
            promptEl.style.display = 'block';
            if (nearestInteractable.userData && nearestInteractable.userData.droppedItem) {
                document.getElementById('interaction-action').innerText = 'pick up';
                document.getElementById('interaction-item-name').innerText = nearestInteractable.userData.droppedItem.name;
            } else if (nearestInteractable.userData && nearestInteractable.userData.action === 'fishing') {
                document.getElementById('interaction-action').innerText = 'start';
                document.getElementById('interaction-item-name').innerText = 'Fishing';
            } else if (nearestInteractable.userData && nearestInteractable.userData.type === 'Campfire') {
                document.getElementById('interaction-action').innerText = 'use';
                document.getElementById('interaction-item-name').innerText = 'Campfire (Cook)';
            }
        } else {
            promptEl.style.display = 'none';
        }
    }

    function interactWithNearest() {
        if (!nearestInteractable) return;
        
        const pickup = nearestInteractable;
        
        if (pickup.userData && pickup.userData.droppedItem) {
            const emptyIdx = playerItems.indexOf(null);
            if (emptyIdx !== -1) {
                playerItems[emptyIdx] = pickup.userData.droppedItem;
                updateInventoryUI();
                addChatMessage('System', 'Picked up ' + pickup.userData.droppedItem.name, 0x4fc3f7);
                spawnCollectionOrb(pickup.position.clone(), pickup.userData.droppedItem);
                
                socket.emit('itemPickedUp', pickup.userData.itemId);
                nearestInteractable = null;
                updateInteractionPrompt();
            } else {
                addChatMessage('System', 'Inventory full!', 0xff0000);
            }
        } else if (pickup.userData && pickup.userData.action === 'fishing') {
            stopGathering();
            autoFishing.active = true;
            autoFishing.spotGroup = pickup;
            autoFishing.timer = 0;
            attachFishingRod();
            collectFish(pickup);
            if (autoFishing.active) addChatMessage('System', 'Fishing... move away to stop.', 0x4fc3f7);
        } else if (pickup.userData && pickup.userData.type === 'Campfire') {
            stopGathering();
            autoCooking.active = true;
            autoCooking.campfireGroup = pickup;
            autoCooking.timer = 0;
            if (cookOneFish(pickup)) {
                addChatMessage('System', 'Cooking... move away to stop.', 0xff9800);
            } else {
                autoCooking.active = false;
                addChatMessage('System', 'No raw fish to cook!', 0xff4444);
            }
        }
    }
    
    // Call once to generate the empty grid slots immediately
    document.addEventListener("DOMContentLoaded", () => setTimeout(updateInventoryUI, 500));
    // Prevent browser default drag behavior so we can detect drops outside inventory
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());

    function createFishingSpot() {
        const group = new THREE.Group();
        group.userData.interactable = true;
        group.userData.action = 'fishing';

        const light = new THREE.PointLight(0x4fc3f7, 2, 4);
        light.position.set(0, 1, 0);
        group.add(light);

        const bubbles = [];
        const bubbleGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xe0f7fa, transparent: true, opacity: 0.7, roughness: 0.2 });

        for (let i = 0; i < 20; i++) {
            const bubble = new THREE.Mesh(bubbleGeo, bubbleMat.clone());
            const r = 0.8 * Math.sqrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            bubble.position.set(r * Math.cos(theta), 0.0, r * Math.sin(theta));
            bubble.userData = { speed: 0.3 + Math.random() * 0.4, initialX: bubble.position.x, initialZ: bubble.position.z, offset: Math.random() * Math.PI * 2, amp: 0.05 };
            group.add(bubble);
            bubbles.push(bubble);
        }
        group.userData.bubbles = bubbles;
        
        // Add a large invisible cylinder for easy raycasting
        const hitGeo = new THREE.CylinderGeometry(1.5, 1.5, 2.0, 8);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeo, hitMat);
        hitMesh.position.y = 1.0;
        hitMesh.userData = group.userData;
        hitMesh.userData.parentGroup = group;
        group.add(hitMesh);

        return group;
    }
    // ----------------------------
    var state = {
        camPitch: 0,
        camYaw: 0,
        camZoom: 1.0,
        camSide: 1,
        currentCamSide: 1,
        jumpTime: -1,
        isCrouching: false,
        legs: 1.0,
        baseY: 0,
        inventory: 0,
        shootTime: 0,
        tracers: []
    };

    var wheelState = { open: false, selection: -1, mouseX: 0, mouseY: 0 };

    function openWeaponWheel() {
        wheelState.open = true;
        wheelState.mouseX = 0;
        wheelState.mouseY = 0;
        wheelState.selection = -1;
        document.getElementById('weapon-wheel').classList.add('active');
        updateWheelHighlight();
    }

    function closeWeaponWheel() {
        wheelState.open = false;
        document.getElementById('weapon-wheel').classList.remove('active');
        if (wheelState.selection >= 0) state.inventory = wheelState.selection;
        document.querySelectorAll('.wheel-item').forEach(el => el.classList.remove('highlighted'));
    }

    function updateWheelHighlight() {
        const dist = Math.sqrt(wheelState.mouseX * wheelState.mouseX + wheelState.mouseY * wheelState.mouseY);
        if (dist < 20) wheelState.selection = -1;
        else {
            const angle = Math.atan2(wheelState.mouseX, -wheelState.mouseY);
            let deg = angle * (180 / Math.PI);
            if (deg >= -45 && deg < 45) wheelState.selection = 0;
            else if (deg >= 45 && deg <= 135) wheelState.selection = 1;
            else if (deg > 135 || deg < -135) wheelState.selection = 2;
            else wheelState.selection = 3;
        }
        for (let i = 0; i < 4; i++) {
            const el = document.getElementById('wheel-' + i);
            if (el) el.classList.toggle('highlighted', i === wheelState.selection);
        }
    }

    nextBtn.addEventListener('click', function() {
        if (!usernameInput.value.trim()) { usernameInput.style.borderColor = '#ef4444'; return; }
        var username = usernameInput.value.trim();
        socket.emit('join', { username: username, charType: 'goop' });
    });
    usernameInput.addEventListener('keypress', function(e) { if (e.key === 'Enter') nextBtn.click(); });
    usernameInput.addEventListener('input', function() { usernameInput.style.borderColor = 'rgba(255,255,255,0.1)'; });

    // ============================================================
    // FBX ANIMATION & BONE BINDING
    // ============================================================
    var globalFBXModel = null;
    var globalFBXAnimations = { idle: null, walk: null, run: null };
    var fbxLoaded = false;

    function loadMixamoRig() {
        var loader = new THREE.FBXLoader();
        loader.load('assets/models/T-Pose.fbx', function(object) {
            object.scale.set(0.012, 0.012, 0.012);
            object.traverse(function(child) {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x3b82f6, roughness: 0.6, metalness: 0.2
                    });
                    child.visible = false; // We just want the bones
                }
            });
            globalFBXModel = object;

            var animLoader = new THREE.FBXLoader();
            var loadedAnims = 0;
            function checkDone() {
                loadedAnims++;
                if (loadedAnims === 3) {
                    fbxLoaded = true;
                    console.log('All FBX animations loaded.');
                }
            }
            animLoader.load('assets/animations/idle.fbx', function(anim) { globalFBXAnimations.idle = anim.animations[0]; checkDone(); });
            animLoader.load('assets/animations/walk.fbx', function(anim) { globalFBXAnimations.walk = anim.animations[0]; checkDone(); });
            animLoader.load('assets/animations/run.fbx', function(anim) { globalFBXAnimations.run = anim.animations[0]; checkDone(); });
        });
    }
    loadMixamoRig();

    function setupPlayerFBX(playerMesh) {
        if (!fbxLoaded || playerMesh.userData.fbxModel || !playerMesh.userData.bp) return;
        
        var clone = THREE.SkeletonUtils.clone(globalFBXModel);
        playerMesh.userData.fbxModel = clone;
        playerMesh.add(clone);
        
        var mixer = new THREE.AnimationMixer(clone);
        playerMesh.userData.mixer = mixer;
        playerMesh.userData.actions = {
            idle: mixer.clipAction(globalFBXAnimations.idle),
            walk: mixer.clipAction(globalFBXAnimations.walk),
            run:  mixer.clipAction(globalFBXAnimations.run)
        };
        
        playerMesh.userData.actions.idle.play();
        playerMesh.userData.currentAction = playerMesh.userData.actions.idle;
        
        // Preserve any previously synced useFBX intent, default to false
        if (playerMesh.userData.useFBX === undefined) {
            playerMesh.userData.useFBX = false;
        }
        
        if (playerMesh.userData.useFBX) {
            bindPlayerBones(playerMesh);
        }
    }

    function bindPlayerBones(playerMesh) {
        if (!playerMesh.userData.fbxModel || !playerMesh.userData.bp) return;
        playerMesh.userData.useFBX = true;
        var bp = playerMesh.userData.bp;
        
        var getBone = function(name) {
            var found;
            playerMesh.userData.fbxModel.traverse(function(c) {
                if (c.name.includes('mixamorig') && c.name.includes(name)) found = c;
            });
            return found;
        };

        var bindPart = function(part, boneName) {
            var bone = getBone(boneName);
            if (bone && part) bone.attach(part);
        };

        // Put procedural parts into T-Pose before binding
        bp.pelvis.position.set(0, 0.9, 0);
        bp.torso.rotation.set(0, 0, 0); bp.torso.scale.set(1, 1, 1);
        if (bp.head) bp.head.rotation.set(0, 0, 0);
        bp.legL.rotation.set(0, 0, 0.15); bp.legR.rotation.set(0, 0, -0.15);
        bp.legL.foot.rotation.set(0, 0, -0.15); bp.legR.foot.rotation.set(0, 0, 0.15);
        bp.legL.calf.rotation.set(0, 0, 0); bp.legR.calf.rotation.set(0, 0, 0);
        bp.armL.rotation.set(0, 0, Math.PI / 2); bp.armR.rotation.set(0, 0, -Math.PI / 2);
        bp.armL.lower.rotation.set(0, 0, 0); bp.armR.lower.rotation.set(0, 0, 0);

        playerMesh.updateMatrixWorld(true);
        playerMesh.userData.fbxModel.updateMatrixWorld(true);

        bindPart(bp.pelvis, 'Hips');
        bindPart(bp.torso, 'Spine');
        if (bp.head) bindPart(bp.head, 'Head');
        bindPart(bp.armL, 'LeftArm'); bindPart(bp.armL.lower, 'LeftForeArm'); bindPart(bp.armL.hand, 'LeftHand');
        bindPart(bp.armR, 'RightArm'); bindPart(bp.armR.lower, 'RightForeArm'); bindPart(bp.armR.hand, 'RightHand');
        bindPart(bp.legL, 'LeftUpLeg'); bindPart(bp.legL.calf, 'LeftLeg'); bindPart(bp.legL.foot, 'LeftFoot');
        bindPart(bp.legR, 'RightUpLeg'); bindPart(bp.legR.calf, 'RightLeg'); bindPart(bp.legR.foot, 'RightFoot');
    }

    function unbindPlayerBones(playerMesh) {
        if (!playerMesh.userData.fbxModel || !playerMesh.userData.bp) return;
        playerMesh.userData.useFBX = false;
        var bp = playerMesh.userData.bp;
        
        playerMesh.attach(bp.pelvis);
        bp.pelvis.attach(bp.torso);
        if (bp.head) bp.torso.attach(bp.head);
        bp.pelvis.attach(bp.legL); bp.legL.attach(bp.legL.calf); bp.legL.calf.attach(bp.legL.foot);
        bp.pelvis.attach(bp.legR); bp.legR.attach(bp.legR.calf); bp.legR.calf.attach(bp.legR.foot);
        bp.torso.attach(bp.armL); bp.armL.attach(bp.armL.lower); bp.armL.lower.attach(bp.armL.hand);
        bp.torso.attach(bp.armR); bp.armR.attach(bp.armR.lower); bp.armR.lower.attach(bp.armR.hand);
        
        // Let animateCharacter set the procedural pose next frame
    }

    // ============================================================
    // EXACT CHARACTER BUILDERS — ported from 3D-Unified-Workspace
    // ============================================================
    // Characters are now loaded dynamically from shared-characters.js
    // which is hosted directly from the 3D-Unified-Workspace project!
    // ============================================================

    // === MINI 3D PREVIEWS ===
    var previewScenes = {};
    function initCharPreviews() {
        if (previewScenes.modular) return;
        createPreview('preview-modular', 'modular');
        createPreview('preview-goop-man', 'goop-man');
        createPreview('preview-goop', 'goop');
        animatePreviews();
    }
    function createPreview(containerId, type) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var w = el.clientWidth || 150, h = el.clientHeight || 140;
        var sc = new THREE.Scene();
        sc.background = new THREE.Color(0x0a0f1e);
        sc.add(new THREE.AmbientLight(0xffffff, 0.6));
        var dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(3, 5, 4); sc.add(dl);
        var fl = new THREE.DirectionalLight(0x60a5fa, 0.4); fl.position.set(-3, 2, 2); sc.add(fl);
        var cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
        cam.position.set(0, 1.0, 3.0); cam.lookAt(0, 0.6, 0);
        var r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        r.setSize(w, h); r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        el.appendChild(r.domElement);
        var gnd = new THREE.Mesh(new THREE.CircleGeometry(1.2, 32),
            new THREE.MeshStandardMaterial({ color: 0x1a2744, roughness: 0.8 }));
        gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.01; sc.add(gnd);
        var model = (type === 'goop') ? buildGoop() : (type === 'goop-man') ? buildGoopMan() : buildModularMan();
        sc.add(model);
        previewScenes[type] = { scene: sc, camera: cam, renderer: r, model: model };
    }
    function animatePreviews() {
        requestAnimationFrame(animatePreviews);
        var t = Date.now() * 0.001;
        for (var k in previewScenes) {
            var p = previewScenes[k];
            p.model.rotation.y = Math.sin(t * 0.8) * 0.4;
            
            // Re-use animateCharacter for the preview so Goop's marchingCubes updates
            if (typeof animateCharacter === 'function') {
                animateCharacter(p.model, k, false, false, false, -1, t, 0.016, 0, 0, 0, 0);
            }
            
            p.renderer.render(p.scene, p.camera);
        }
    }

    // === MAIN THREE.JS SCENE ===
    var scene = new THREE.Scene();
    // Background and fog are now set by shared-environment.js
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1, 0);
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); renderer.shadowMap.enabled = true;
    container.insertBefore(renderer.domElement, document.getElementById('ui-layer'));

    // Environment, lighting, and terrain are now handled by shared-environment.js
    if (window.setupSharedEnvironment) {
        window.setupSharedEnvironment(scene, renderer, camera);
        if (window.RippleWater && window.sharedWater) {
            window.RippleWater.init(renderer, window.sharedWater);
        }
    }

    function getTerrainHeight(x, z) {
        if (window.getSharedTerrainHeight) {
            return window.getSharedTerrainHeight(x, z);
        }
        return 0;
    }

    // Store loaded environment objects
    var environmentObjects = [];
    var environmentUpdatables = [];

    function spawnEnvironmentObject(data) {
        if (window.ObjectFactory) {
            const factoryObj = window.ObjectFactory.create(data.type, data.config);
            if (factoryObj) {
                // Store ID for tracking
                factoryObj.group.userData.id = data.id;
                factoryObj.group.userData.type = data.type;

                // Apply transformations
                factoryObj.group.position.set(data.position.x, data.position.y, data.position.z);
                factoryObj.group.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
                factoryObj.group.scale.set(data.scale.x, data.scale.y, data.scale.z);
                
                scene.add(factoryObj.group);
                environmentObjects.push(factoryObj.group);
                if (factoryObj.updatable) {
                    environmentUpdatables.push(factoryObj.updatable);
                }

                // Register FishingSpot objects for interaction
                if (data.type === 'FishingSpot') {
                    factoryObj.group.userData.interactable = true;
                    factoryObj.group.userData.action = 'fishing';
                    // Build bubbles array for the legacy animation loop
                    const bubbles = [];
                    factoryObj.group.traverse(child => {
                        if (child.isMesh && child.geometry && child.geometry.type === 'SphereGeometry') {
                            bubbles.push(child);
                        }
                    });
                    factoryObj.group.userData.bubbles = bubbles;
                    fishingSpots.push(factoryObj.group);
                }
            }
        }
    }

    function clearEnvironmentObjects() {
        environmentObjects.forEach(obj => {
            scene.remove(obj);
            obj.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
        });
        environmentObjects = [];
        environmentUpdatables = [];
        fishingSpots = [];
    }

    function loadMapData() {
        fetch('/api/map')
            .then(res => res.json())
            .then(data => {
                clearEnvironmentObjects();
                if (data && data.objects) {
                    data.objects.forEach(objData => spawnEnvironmentObject(objData));
                }
            })
            .catch(err => console.error('Error loading map:', err));
    }

    // Load initial map
    loadMapData();

    // Listen for live map updates from the editor
    socket.on('mapUpdate', function(data) {
        console.log('Map updated from server!');
        clearEnvironmentObjects();
        if (data && data.objects) {
            data.objects.forEach(objData => spawnEnvironmentObject(objData));
        }
    });

    // Fishing spots are now placed via the editor and loaded from map data
    // No random spawning needed — full editor control

    // Pointer Lock & Marching Panel
    var PI_2 = Math.PI / 2;
    var mPanel = document.getElementById('marching-panel');
    var dPanel = document.getElementById('debug-panel');
    var toggleFBX = document.getElementById('toggleFBX');
    var resSlider = document.getElementById('resSlider');
    var resVal = document.getElementById('resVal');
    var isoSlider = document.getElementById('isoSlider');
    var isoVal = document.getElementById('isoVal');

    if (resSlider) {
        resSlider.addEventListener('input', function() {
            resVal.textContent = this.value;
            if (myCharacter && myCharacter.userData.marchingCubes) {
                myCharacter.userData.marchingCubes.init(parseInt(this.value));
                if (isoSlider) myCharacter.userData.marchingCubes.isolation = parseInt(isoSlider.value);
            }
        });
    }
    if (isoSlider) {
        isoSlider.addEventListener('input', function() {
            isoVal.textContent = this.value;
            if (myCharacter && myCharacter.userData.marchingCubes) {
                myCharacter.userData.marchingCubes.isolation = parseInt(this.value);
            }
        });
    }

    if (toggleFBX) {
        toggleFBX.addEventListener('change', function() {
            if (myCharacter) {
                myCharacter.userData.useFBX = this.checked;
                if (this.checked && fbxLoaded) {
                    if (!myCharacter.userData.fbxModel) setupPlayerFBX(myCharacter);
                    else bindPlayerBones(myCharacter);
                } else if (!this.checked && myCharacter.userData.fbxModel) {
                    unbindPlayerBones(myCharacter);
                }
            }
        });
    }

    document.addEventListener('pointerlockchange', function () {
        isLocked = (document.pointerLockElement === renderer.domElement);
        crosshair.style.display = isLocked ? 'block' : 'none';
        // Don't auto-focus chat when inventory opened via Tab
        if (!isLocked && isPlaying && !inventoryOpen) chatInput.focus();
        
        if (mPanel) {
            mPanel.style.display = (!isLocked && isPlaying && selectedChar === 'goop-man') ? 'block' : 'none';
        }
        if (dPanel) {
            dPanel.style.display = (!isLocked && isPlaying && selectedChar === 'modular') ? 'block' : 'none';
        }
    });
    document.addEventListener('mousemove', function (e) {
        if (!isLocked || !myCharacter) return;
        if (wheelState.open) {
            wheelState.mouseX += e.movementX;
            wheelState.mouseY += e.movementY;
            updateWheelHighlight();
        } else {
            state.camYaw -= (e.movementX || 0) * 0.003;
            state.camPitch += (e.movementY || 0) * 0.003;
            state.camPitch = Math.max(-1.0, Math.min(1.2, state.camPitch));
        }
    });

    let audioCtx;
    let precomputedNoiseBuffer;
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const bufferSize = Math.floor(audioCtx.sampleRate * 0.2);
            precomputedNoiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = precomputedNoiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) { data[i] = Math.random() * 2 - 1; }
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playGunshot() {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.1);

        const noise = audioCtx.createBufferSource();
        noise.buffer = precomputedNoiseBuffer;

        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 6000;

        const noiseGain = audioCtx.createGain();
        noiseGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);

        osc.start(audioCtx.currentTime);
        noise.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.15);
        noise.stop(audioCtx.currentTime + 0.2);
    }

    function shootGun(shooterObj, isLocal) {
        if (!shooterObj) return;
        const bp = shooterObj.userData.bp;
        const inv = shooterObj.userData.inventory !== undefined ? shooterObj.userData.inventory : state.inventory;
        if (inv !== 1) return; // Only spawn bullets/flash if using a gun
        if (isLocal) state.shootTime = 0.15;
        if (!isLocal && shooterObj.userData) shooterObj.userData.shootTime = 0.15;

        // Muzzle flash
        const flashGeo = new THREE.PlaneGeometry(0.4, 0.4);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
        const flash1 = new THREE.Mesh(flashGeo, flashMat);
        const flash2 = new THREE.Mesh(flashGeo, flashMat);
        flash2.rotation.y = Math.PI / 2;
        const flash = new THREE.Group();
        flash.add(flash1); flash.add(flash2);

        const gunObj = (bp && bp.gun) ? bp.gun : (shooterObj.userData.gun ? shooterObj.userData.gun : null);

        if (gunObj) {
            if (shooterObj.userData.blob) { // Goop blob floating gun
                flash.position.set(0, 0, 0.35); // At tip of forward-facing barrel (+Z)
                flash.rotation.x = 0;
            } else {
                flash.position.set(0, -0.28, 0.05); // At tip of downward-facing barrel (-Y)
                flash.rotation.x = -Math.PI / 2;
            }
            flash.rotation.y = Math.random() * Math.PI;
            gunObj.add(flash);
        } else if (shooterObj.userData.rightEye) {
            flash.position.set(0, 0, 0.1);
            shooterObj.userData.rightEye.add(flash);
        }

        setTimeout(() => {
            if (gunObj && flash) gunObj.remove(flash);
            else if (shooterObj.userData.rightEye && flash) shooterObj.userData.rightEye.remove(flash);
            flashGeo.dispose(); flashMat.dispose();
        }, 50);

        // Tracer
        const tracerGeo = new THREE.CylinderGeometry(0.015, 0.015, 4.0);
        tracerGeo.rotateX(Math.PI / 2);
        const tracer = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.8 }));
        scene.add(tracer);

        const startPos = new THREE.Vector3();
        if (gunObj) {
            if (shooterObj.userData.blob) {
                gunObj.localToWorld(startPos.set(0, 0, 0.35));
            } else {
                gunObj.localToWorld(startPos.set(0, -0.25, 0.05));
            }
        } else if (shooterObj.userData.rightEye) {
            shooterObj.userData.rightEye.localToWorld(startPos.set(0, 0, 0.2));
        }
        
        let aimTgt = new THREE.Vector3();
        if (isLocal) {
            camRig.localToWorld(aimTgt.set(0, 0, 100));
        } else {
            aimTgt = startPos.clone().add(new THREE.Vector3(0, 0, 100).applyAxisAngle(new THREE.Vector3(0,1,0), shooterObj.rotation.y));
        }

        tracer.position.copy(startPos);
        tracer.lookAt(aimTgt);

        const velocity = aimTgt.clone().sub(startPos).normalize().multiplyScalar(120);
        state.tracers.push({ mesh: tracer, v: velocity, life: 1.0, shooterId: isLocal ? myId : (shooterObj.userData.id || null) });
    }

    var prevTime = performance.now();

    window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Join listener removed, handled by next-btn
    document.addEventListener('click', function (e) {
        // Don't re-lock if inventory is open (user is managing items)
        if (isPlaying && document.activeElement !== chatInput && !isLocked && !inventoryOpen) renderer.domElement.requestPointerLock();
    });

    // --- Spawn a glowing collection orb with light trail ---
    function spawnCollectionOrb(fromPos, item) {
        const orbGeo = new THREE.SphereGeometry(0.15, 12, 12);
        const orbMat = new THREE.MeshStandardMaterial({
            color: item.color, emissive: item.color, emissiveIntensity: 2.0,
            transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.3
        });
        const orb = new THREE.Mesh(orbGeo, orbMat);
        orb.position.copy(fromPos);
        // Outer glow halo
        const glowGeo = new THREE.SphereGeometry(0.3, 12, 12);
        const glowMat = new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.25 });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        orb.add(glow);
        // Point light on the orb
        const orbLight = new THREE.PointLight(item.color, 3, 6);
        orb.add(orbLight);
        scene.add(orb);
        // Trail particles array
        const trail = [];
        vfxOrbs.push({ mesh: orb, glow, light: orbLight, target: myCharacter, life: 1.5, trail, trailTimer: 0 });
    }

    // --- Collect a fish from a spot ---
    function collectFish(spotGroup) {
        const fishType = Math.random() > 0.4 ? GAME_ITEMS.raw_shrimp : GAME_ITEMS.raw_trout;
        const emptyIdx = playerItems.indexOf(null);
        if (emptyIdx !== -1) {
            playerItems[emptyIdx] = fishType;
            updateInventoryUI();
            addChatMessage('System', 'You caught a ' + fishType.name + '!', 0x4fc3f7);
            spawnCollectionOrb(spotGroup.position.clone().add(new THREE.Vector3(0, 0.5, 0)), fishType);
        } else {
            addChatMessage('System', 'Inventory full!', 0xff4444);
            stopGathering();
        }
    }

    // --- Cook one raw fish on a campfire (returns false if nothing to cook) ---
    function cookOneFish(campfireGroup) {
        const rawIdx = playerItems.findIndex(item => item && item.cookable);
        if (rawIdx === -1) return false;
        const rawItem = playerItems[rawIdx];
        const cookedItem = GAME_ITEMS[rawItem.cookedId];
        if (!cookedItem) return false;
        playerItems[rawIdx] = cookedItem;
        updateInventoryUI();
        addChatMessage('System', 'Cooked ' + rawItem.name + ' → ' + cookedItem.name + '!', 0xff9800);
        spawnCollectionOrb(campfireGroup.position.clone().add(new THREE.Vector3(0, 1.5, 0)), cookedItem);
        return true;
    }

    // --- Stop any active gathering ---
    function stopGathering() {
        if (autoFishing.active) {
            autoFishing.active = false;
            detachFishingRod();
            addChatMessage('System', 'Stopped fishing.', 0x4fc3f7);
        }
        if (autoCooking.active) {
            autoCooking.active = false;
            addChatMessage('System', 'Stopped cooking.', 0xff9800);
        }
    }

    document.addEventListener('mousedown', function (e) {
        if (!isLocked || !myCharacter) return;
        if (e.button === 0) { // Left click
            if (state.inventory === 0) {
                // Hand attack placeholder
                state.shootTime = 0.5;
            } else if (state.inventory === 1 || state.inventory === 2) {
                if (state.shootTime <= 0) {
                    if (state.inventory === 1) shootGun(myCharacter, true);
                    else state.shootTime = 0.15; // Swing axe
                    socket.emit('playerShoot', { id: myId });
                }
            }
        }
    });

    // Keys
    document.addEventListener('keydown', function (e) {
        if (document.activeElement === chatInput || !isPlaying) return;
        keys[e.code] = true;
        if (e.code === 'Space' && state.jumpTime < 0) state.jumpTime = 0;
        if (e.code === 'KeyC') state.isCrouching = !state.isCrouching;
        if (e.code === 'KeyE') {
            if (nearestInteractable && !inventoryOpen) interactWithNearest();
        }
        if (e.code === 'KeyX' && !e.repeat) state.camSide *= -1;
        if (e.code === 'KeyQ' && !e.repeat) openWeaponWheel();
        // Tab toggles inventory panel + releases/re-locks pointer
        if (e.code === 'Tab' && !e.repeat) {
            e.preventDefault();
            inventoryOpen = !inventoryOpen;
            var invUI = document.getElementById('inventory-ui');
            if (invUI) {
                invUI.style.display = inventoryOpen ? 'block' : 'none';
                invUI.style.pointerEvents = inventoryOpen ? 'auto' : 'none';
            }
            updateInteractionPrompt();
            if (inventoryOpen) {
                // Release pointer lock so user can use mouse on inventory
                document.exitPointerLock();
            } else {
                // Re-lock pointer for gameplay
                renderer.domElement.requestPointerLock();
            }
        }
    });
    document.addEventListener('keyup', function (e) {
        keys[e.code] = false;
        if (e.code === 'KeyQ' && wheelState.open) closeWeaponWheel();
    });
    window.addEventListener('wheel', function(e) {
        if (!isLocked) return;
        state.camZoom += e.deltaY * 0.0015;
        state.camZoom = Math.max(0.4, Math.min(state.camZoom, 3.0));
    });

    // Chat
    chatInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            var msg = chatInput.value.trim();
            if (msg) { socket.emit('chatMessage', msg); chatInput.value = ''; }
        }
    });
    function addChatMessage(username, message, color) {
        var el = document.createElement('div');
        el.className = 'chat-msg';
        var hex = '#' + color.toString(16).padStart(6, '0');
        el.innerHTML = '<span class="chat-username" style="color:' + hex + '">' + username + ':</span> ' + message;
        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Socket Events
    socket.on('init', function (data) {
        myId = data.id;
        loginPanel.style.display = 'none'; chatBox.style.display = 'block'; isPlaying = true;
        var invUI = document.getElementById('inventory-ui');
        if (invUI) invUI.style.display = 'block';
        var me = data.players[myId];
        
        myCharacter = (selectedChar === 'goop') ? buildGoop() : (selectedChar === 'goop-man') ? buildGoopMan() : buildModularMan();
        myCharacter.position.set(me.x, me.y, me.z);
        scene.add(myCharacter);
        scene.add(camRig);
        state.baseY = me.y;

        for (var id in data.players) { if (id !== myId) createPlayer(id, data.players[id]); }
        renderer.domElement.requestPointerLock();
        addChatMessage('System', 'Welcome, ' + me.username + '! Click to look. WASD to move. Space to jump.', 0xaaaaaa);
        requestAnimationFrame(animate);
    });
    
    socket.on('initDroppedItems', function(data) {
        for (const id in data) {
            spawnDroppedItem(data[id]);
        }
    });

    socket.on('itemDropped', function(data) {
        spawnDroppedItem(data);
    });

    socket.on('itemPickedUp', function(itemId) {
        const idx = droppedItems.findIndex(p => p.userData.itemId === itemId);
        if (idx > -1) {
            const pickup = droppedItems[idx];
            scene.remove(pickup);
            droppedItems.splice(idx, 1);
            if (nearestInteractable === pickup) {
                nearestInteractable = null;
                updateInteractionPrompt();
            }
        }
    });

    socket.on('playerJoined', function (p) {
        if (p.id !== myId) {
            createPlayer(p.id, p);
            addChatMessage('System', p.username + ' joined as ' + (p.charType === 'goop' ? 'The Goop' : (p.charType === 'goop-man' ? 'Goop Man' : 'Modular Man')), 0xaaaaaa);
        }
    });
    socket.on('playerLeft', function (id) {
        if (players[id]) {
            addChatMessage('System', players[id].userData.username + ' left.', 0xaaaaaa);
            scene.remove(players[id].mesh); players[id].nametag.remove(); delete players[id];
        }
    });
    socket.on('playerMoved', function (d) { 
        if (players[d.id]) {
            players[d.id].targetPos.set(d.x, d.y, d.z); 
            players[d.id].targetRy = d.ry;
            players[d.id].isMoving = d.isMoving;
            players[d.id].isSprinting = d.isSprinting;
            players[d.id].isCrouching = d.isCrouching;
            players[d.id].jumpTime = d.jumpTime;
            players[d.id].localVx = d.localVx;
            players[d.id].localVz = d.localVz;
            players[d.id].userData.inventory = d.inventory;
            players[d.id].userData.camPitch = d.camPitch;
            if (d.useFBX !== undefined) {
                if (d.useFBX && !players[d.id].userData.useFBX) {
                    if (players[d.id].userData.fbxModel) bindPlayerBones(players[d.id].mesh);
                    else players[d.id].userData.useFBX = true;
                } else if (!d.useFBX && players[d.id].userData.useFBX) {
                    if (players[d.id].userData.fbxModel) unbindPlayerBones(players[d.id].mesh);
                    else players[d.id].userData.useFBX = false;
                }
            }
        }
    });
    socket.on('playerShoot', function (d) {
        if (players[d.id]) {
            const inv = players[d.id].userData.inventory !== undefined ? players[d.id].userData.inventory : 0;
            if (inv === 1) shootGun(players[d.id].mesh, false);
            else players[d.id].userData.shootTime = 0.15;
        }
    });
    socket.on('playerHit', function (d) {
        if (d.shooterId === myId) {
            crosshair.classList.add('hit');
            setTimeout(() => { crosshair.classList.remove('hit'); }, 150);
        }
    });
    socket.on('chatMessage', function (d) { addChatMessage(d.username, d.message, d.color); });

    function createPlayer(id, data) {
        var charType = data.charType || 'modular';
        var mesh = (charType === 'goop') ? buildGoop() : (charType === 'goop-man') ? buildGoopMan() : buildModularMan();
        mesh.position.set(data.x, data.y, data.z);
        scene.add(mesh);
        var tag = document.createElement('div'); tag.textContent = data.username;
        tag.style.cssText = 'position:absolute;color:white;background:rgba(0,0,0,.6);padding:3px 8px;border-radius:4px;pointer-events:none;font:600 11px Inter,sans-serif;transform:translate(-50%,-50%);white-space:nowrap;';
        document.getElementById('ui-layer').appendChild(tag);
        data.id = id;
        data.inventory = data.inventory !== undefined ? data.inventory : 0;
        players[id] = { mesh: mesh, nametag: tag, targetPos: new THREE.Vector3(data.x, data.y, data.z), targetRy: data.ry || 0, userData: data, charType: charType };
    }
    // animateCharacter function has been removed.
    // It is now dynamically pulled from shared-characters.js hosted by 3D-Unified-Workspace!

    function animate() {
        if (!isPlaying) return;
        requestAnimationFrame(animate);
        var time = performance.now(), delta = Math.min((time - prevTime) / 1000, 0.1), t = time * 0.001;
        
        environmentUpdatables.forEach(u => {
            if (u.update) u.update(delta);
        });

        if (window.sharedWater) {
            window.sharedWater.material.uniforms['time'].value += delta;
        }
        if (window.RippleWater) {
            window.RippleWater.update(renderer);
        }
        if (window.sharedClouds) {
            window.sharedClouds.rotation.y += 0.0005;
        }
        // --- FISHING SPOT TARGETING (show ring when crosshair aimed) ---
        if (isLocked && myCharacter && fishingSpots.length > 0) {
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            let interactables = [];
            fishingSpots.forEach(s => s.children.forEach(c => interactables.push(c)));
            const hits = raycaster.intersectObjects(interactables, false);
            const targetedSpot = (hits.length > 0) ? (hits[0].object.userData.parentGroup || hits[0].object.parent) : null;
            fishingSpots.forEach(group => {
                if (group.userData.ring) {
                    const isTargeted = (group === targetedSpot) && myCharacter.position.distanceTo(group.position) < 8.0;
                    group.userData.ring.visible = isTargeted;
                }
            });
        }
        // --- FISHING SPOTS BUBBLES ---
        fishingSpots.forEach(group => {
            if (group.userData.bubbles && myCharacter && group.position.distanceTo(myCharacter.position) < 50) {
                group.userData.bubbles.forEach(b => {
                    if (b.userData.popping) {
                        b.scale.addScalar(delta * 8.0);
                        b.material.opacity -= delta * 3.0;
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
                    b.position.y += b.userData.speed * delta;
                    b.position.x = b.userData.initialX + Math.cos(t * 3 + b.userData.offset) * b.userData.amp;
                    b.position.z = b.userData.initialZ + Math.sin(t * 3 + b.userData.offset) * b.userData.amp;
                    if (b.position.y > 1.0) b.userData.popping = true;
                });
            }
        });

        // --- AUTO-FISHING LOOP + ROD ANIMATION ---
        if (autoFishing.active && autoFishing.spotGroup && myCharacter) {
            const dist = myCharacter.position.distanceTo(autoFishing.spotGroup.position);
            if (dist > 10.0) {
                autoFishing.active = false;
                detachFishingRod();
                addChatMessage('System', 'Stopped fishing.', 0x4fc3f7);
            } else {
                autoFishing.timer += delta;
                if (autoFishing.timer >= autoFishing.interval) {
                    autoFishing.timer = 0;
                    collectFish(autoFishing.spotGroup);
                }

                // --- Animate fishing rod ---
                if (fishingRodData) {
                    fishingRodData.tugPhase += delta;
                    const catchProgress = autoFishing.timer / autoFishing.interval; // 0→1
                    // Tug intensity ramps up as catch approaches
                    const tugBase = 0.02 + catchProgress * 0.06;
                    const tugWave = Math.sin(t * 4.0) * tugBase;
                    // Quick jerk near catch time
                    const jerk = (catchProgress > 0.7) ? Math.sin(t * 12.0) * 0.04 : 0;

                    // Bend each rod segment progressively
                    fishingRodData.segments.forEach((seg, i) => {
                        const factor = (i / fishingRodData.segments.length);
                        seg.rotation.x = factor * (tugWave + jerk) * 2.5;
                        seg.rotation.z = Math.sin(t * 2.5 + i) * factor * 0.015;
                    });

                    // Update fishing line — bezier from rod tip to water
                    const tipWorld = new THREE.Vector3();
                    // Walk up the segment chain to find world pos of tip
                    const lastSeg = fishingRodData.segments[fishingRodData.segments.length - 1];
                    const tipLocal = new THREE.Vector3(0, 1.8 / fishingRodData.segments.length, 0);
                    lastSeg.localToWorld(tipWorld.copy(tipLocal));

                    // Water target: near the fishing spot, slightly offset
                    const spotPos = autoFishing.spotGroup.position;
                    const waterY = -1.0; // water surface level
                    const waterTarget = new THREE.Vector3(
                        spotPos.x + Math.sin(t * 0.5) * 0.3,
                        waterY + Math.sin(t * 1.5) * 0.05,
                        spotPos.z + Math.cos(t * 0.5) * 0.3
                    );

                    // Bezier mid-point (line sag)
                    const mid = tipWorld.clone().lerp(waterTarget, 0.5);
                    mid.y -= 0.4 + Math.sin(t * 2) * 0.1; // sag

                    // Build curved line from bezier
                    const curve = new THREE.QuadraticBezierCurve3(tipWorld, mid, waterTarget);
                    const pts = curve.getPoints(16);
                    fishingRodData.line.geometry.dispose();
                    fishingRodData.line.geometry = new THREE.BufferGeometry().setFromPoints(pts);

                    // Bobber position at water target with bobbing
                    fishingRodData.bob.position.copy(waterTarget);
                    fishingRodData.bob.position.y += 0.03 + Math.sin(t * 3) * 0.02;
                    // Bob dips when catch is close
                    if (catchProgress > 0.8) {
                        fishingRodData.bob.position.y -= 0.06 * Math.sin(t * 10);
                    }
                }
            }
        }

        // --- AUTO-COOKING LOOP ---
        if (autoCooking.active && autoCooking.campfireGroup && myCharacter) {
            const dist = myCharacter.position.distanceTo(autoCooking.campfireGroup.position);
            if (dist > 7.0) {
                autoCooking.active = false;
                addChatMessage('System', 'Stopped cooking.', 0xff9800);
            } else {
                autoCooking.timer += delta;
                if (autoCooking.timer >= autoCooking.interval) {
                    autoCooking.timer = 0;
                    if (!cookOneFish(autoCooking.campfireGroup)) {
                        autoCooking.active = false;
                        addChatMessage('System', 'All fish cooked!', 0xff9800);
                    }
                }
            }
        }

        // --- DROPPED ITEMS (bobbing + auto-pickup) ---
        checkPickupDroppedItems();
        droppedItems.forEach(pickup => {
            const age = t - pickup.userData.spawnTime;
            pickup.position.y = getTerrainHeight(pickup.position.x, pickup.position.z) + 0.3 + Math.sin(age * 2.0) * 0.1;
            pickup.rotation.y += delta * 1.5;
            // Pulse halo
            if (pickup.children[1]) pickup.children[1].scale.setScalar(1.0 + Math.sin(age * 3) * 0.2);
        });

        // --- VFX ORBS (glowing with light trail) ---
        for (let i = vfxOrbs.length - 1; i >= 0; i--) {
            let orbObj = vfxOrbs[i];
            let targetPos = orbObj.target.position.clone().add(new THREE.Vector3(0, 1.0, 0));
            orbObj.mesh.position.lerp(targetPos, delta * 4.0);
            orbObj.life -= delta;

            // Pulse the glow
            if (orbObj.glow) {
                const pulse = 0.2 + Math.sin(performance.now() * 0.01) * 0.1;
                orbObj.glow.material.opacity = pulse;
                orbObj.glow.scale.setScalar(1.0 + Math.sin(performance.now() * 0.008) * 0.3);
            }
            if (orbObj.light) {
                orbObj.light.intensity = 2 + Math.sin(performance.now() * 0.01) * 1;
            }

            // Spawn trail particles
            orbObj.trailTimer += delta;
            if (orbObj.trailTimer > 0.03) {
                orbObj.trailTimer = 0;
                const tGeo = new THREE.SphereGeometry(0.06, 4, 4);
                const tMat = new THREE.MeshBasicMaterial({
                    color: orbObj.mesh.material.color.getHex(),
                    transparent: true, opacity: 0.6
                });
                const tMesh = new THREE.Mesh(tGeo, tMat);
                tMesh.position.copy(orbObj.mesh.position);
                scene.add(tMesh);
                orbObj.trail.push({ mesh: tMesh, life: 0.4 });
            }

            // Update trail particles
            for (let j = orbObj.trail.length - 1; j >= 0; j--) {
                orbObj.trail[j].life -= delta;
                orbObj.trail[j].mesh.material.opacity = Math.max(0, orbObj.trail[j].life / 0.4) * 0.6;
                orbObj.trail[j].mesh.scale.multiplyScalar(0.96);
                if (orbObj.trail[j].life <= 0) {
                    scene.remove(orbObj.trail[j].mesh);
                    orbObj.trail[j].mesh.geometry.dispose();
                    orbObj.trail[j].mesh.material.dispose();
                    orbObj.trail.splice(j, 1);
                }
            }

            if (orbObj.mesh.position.distanceTo(targetPos) < 0.5 || orbObj.life <= 0) {
                scene.remove(orbObj.mesh);
                orbObj.mesh.geometry.dispose();
                orbObj.mesh.material.dispose();
                if (orbObj.light) orbObj.light.dispose();
                // Clean remaining trail
                orbObj.trail.forEach(tp => { scene.remove(tp.mesh); tp.mesh.geometry.dispose(); tp.mesh.material.dispose(); });
                vfxOrbs.splice(i, 1);
            }
        }

        if (isLocked && myCharacter) {
            // --- EXACT input from Unified Workspace (line 2469-2470) ---
            var moveZ = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
            var moveX = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
            var isMoving = Math.abs(moveZ) > 0 || Math.abs(moveX) > 0;
            var isSprinting = keys['ShiftLeft'] || keys['ShiftRight'];

            var localVx = 0, localVz = 0;
            // Stop gathering if player starts moving
            if (isMoving && (autoFishing.active || autoCooking.active)) {
                stopGathering();
            }
            if (isMoving) {
                // --- EXACT speed from Unified Workspace (line 2476) ---
                var speed = isSprinting ? 0.22 : 0.1;

                // --- EXACT direction calc from Unified Workspace (line 2478-2479) ---
                var direction = new THREE.Vector3(moveX, 0, moveZ).normalize();
                direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.camYaw);

                // --- EXACT rotation from Unified Workspace (line 2481-2486) ---
                var targetYaw = Math.atan2(direction.x, direction.z);
                var diff = targetYaw - myCharacter.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                myCharacter.rotation.y += diff * 12 * delta;

                // --- EXACT movement from Unified Workspace (line 2487) ---
                myCharacter.position.addScaledVector(direction, speed);
                
                if (myCharacter.position.y < -0.8 && window.RippleWater) {
                    window.RippleWater.addDrop(renderer, myCharacter.position.x, myCharacter.position.z, 2.0, 0.15);
                }
                
                var moveLen = Math.hypot(moveX, moveZ);
                var charSpeed = isSprinting ? 1.0 : 0.5;
                localVx = (moveX / moveLen) * charSpeed;
                localVz = (moveZ / moveLen) * charSpeed;
            } else if (selectedChar === 'goop' && myCharacter.children[0]) {
                myCharacter.children[0].rotation.x *= 0.9;
                myCharacter.children[0].rotation.z *= 0.9;
            }

            // --- Update Base Y from Terrain ---
            state.baseY = getTerrainHeight(myCharacter.position.x, myCharacter.position.z);

            // --- EXACT jump from Unified Workspace (line 2572-2580) ---
            if (state.jumpTime >= 0) {
                state.jumpTime += delta * 2.5;
                var jumpH = Math.sin(Math.min(state.jumpTime, 1) * Math.PI) * 1.3;
                myCharacter.position.y = state.baseY + Math.max(0, jumpH);
                if (state.jumpTime >= 1.0) state.jumpTime = -1;
            } else {
                myCharacter.position.y = state.baseY;
            }

            if (state.shootTime > 0) state.shootTime -= delta;

            if (fbxLoaded && selectedChar === 'modular' && !myCharacter.userData.fbxModel) {
                setupPlayerFBX(myCharacter);
            }

            animateCharacter(myCharacter, selectedChar, isMoving, isSprinting, state.isCrouching, state.jumpTime, t, delta, Math.hypot(localVx, localVz), state.inventory, Math.max(0, state.shootTime), state.camPitch);

            // --- EXACT upper body aiming from Unified Workspace (line 2729-2750) ---
            if (selectedChar === 'modular' && myCharacter.userData.bp) {
                var ubp = myCharacter.userData.bp;
                // Camera-relative upper body twist
                var yawDiff = state.camYaw - myCharacter.rotation.y;
                while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                var maxTwist = Math.PI * 0.5;
                var twist = Math.max(-maxTwist, Math.min(maxTwist, yawDiff));
                ubp.torso.rotation.y += twist * 0.4;
                if (ubp.head) ubp.head.rotation.y = twist * 0.6;
                ubp.torso.rotation.x += state.camPitch * 0.2;
                if (ubp.head) ubp.head.rotation.x += state.camPitch * 0.4;
            }

            // --- EXACT camera rig from Unified Workspace (line 2511-2526) ---
            state.currentCamSide += (state.camSide - state.currentCamSide) * 10 * delta;

            var pivotOffset = new THREE.Vector3(0.6 * state.currentCamSide, 2.0, 0);
            pivotOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.camYaw);
            camRig.position.copy(myCharacter.position).add(pivotOffset);
            camRig.rotation.set(state.camPitch, state.camYaw, 0, 'YXZ');

            // -Z keeps camera behind the character (since +Z is forward movement direction)
            var localOffset = new THREE.Vector3(0, 0, -3.5 * state.camZoom);
            camRig.updateMatrixWorld(true);
            var worldPos = camRig.localToWorld(localOffset);
            if (worldPos.y < 0.3) worldPos.y = 0.3;
            camera.position.lerp(worldPos, 0.25);

            // +Z faces camera strictly outward (EXACT from Unified Workspace line 2525-2526)
            var lookTgt = camRig.localToWorld(new THREE.Vector3(0, 0, 100));
            camera.lookAt(lookTgt);

            socket.emit('playerMovement', { x: myCharacter.position.x, y: myCharacter.position.y, z: myCharacter.position.z, ry: myCharacter.rotation.y, isMoving: isMoving, isSprinting: isSprinting, isCrouching: state.isCrouching, jumpTime: state.jumpTime, localVx: localVx, localVz: localVz, inventory: state.inventory, camPitch: state.camPitch, useFBX: myCharacter.userData.useFBX || false });
        }

        for (var i = state.tracers.length - 1; i >= 0; i--) {
            var tObj = state.tracers[i];
            tObj.life -= delta;
            if (tObj.life <= 0) {
                scene.remove(tObj.mesh);
                tObj.mesh.geometry.dispose();
                tObj.mesh.material.dispose();
                state.tracers.splice(i, 1);
            } else {
                tObj.mesh.position.addScaledVector(tObj.v, delta);
                if (tObj.shooterId === myId) {
                    for (var pid in players) {
                        if (players[pid].mesh.position.distanceTo(tObj.mesh.position) < 1.0) {
                            socket.emit('playerHit', { id: pid });
                            tObj.life = 0;
                            break;
                        }
                    }
                }
            }
        }

        for (var id in players) {
            var p = players[id];
            p.mesh.position.x += (p.targetPos.x - p.mesh.position.x) * 0.1;
            p.mesh.position.z += (p.targetPos.z - p.mesh.position.z) * 0.1;
            p.mesh.position.y += (p.targetPos.y - p.mesh.position.y) * 0.2;
            
            if (p.isMoving && p.mesh.position.y < -0.8 && window.RippleWater) {
                window.RippleWater.addDrop(renderer, p.mesh.position.x, p.mesh.position.z, 2.0, 0.15);
            }
            
            if (p.targetRy !== undefined) {
                var diff = p.targetRy - p.mesh.rotation.y;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                p.mesh.rotation.y += diff * 0.2;
            }

            if (p.charType === 'goop' && p.mesh.children[0] && !p.isMoving) {
                p.mesh.children[0].rotation.x *= 0.9;
                p.mesh.children[0].rotation.z *= 0.9;
            }

            if (fbxLoaded && p.charType === 'modular' && !p.mesh.userData.fbxModel) {
                setupPlayerFBX(p.mesh);
            }

            if (p.userData && p.userData.shootTime > 0) p.userData.shootTime -= delta;
            const inv = p.userData.inventory !== undefined ? p.userData.inventory : 0;
            animateCharacter(p.mesh, p.charType, p.isMoving, p.isSprinting, p.isCrouching || false, p.jumpTime || -1, t, delta, Math.hypot(p.localVx || 0, p.localVz || 0), inv, Math.max(0, p.userData.shootTime || 0), p.userData.camPitch || 0);

            var vec = p.mesh.position.clone();
            vec.y += (p.charType === 'goop') ? 1.0 : 1.8;
            vec.project(camera);
            if (vec.z > 1) { p.nametag.style.display = 'none'; }
            else {
                p.nametag.style.display = 'block';
                p.nametag.style.left = ((vec.x * 0.5 + 0.5) * window.innerWidth) + 'px';
                p.nametag.style.top = ((-(vec.y * 0.5) + 0.5) * window.innerHeight) + 'px';
            }
        }
        renderer.render(scene, camera); prevTime = time;
    }
})();
