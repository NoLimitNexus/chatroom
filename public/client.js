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
    var isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    var joystickMoveX = 0;
    var joystickMoveZ = 0;

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

    // Fishing rod functions are now in ObjectFactory
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
                    // Dropping outside is handled by the global drop listener
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
                dragState.fromIdx = -1;
            });
            invGrid.appendChild(el);
        }
    }

    // Prevent browser default drag behavior and handle drops outside inventory
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        const invUI = document.getElementById('inventory-ui');
        if (invUI && invUI.contains(e.target)) return; // Handled by inventory slots
        if (dragState.fromIdx >= 0) {
            dropItemOnGround(dragState.fromIdx);
            dragState.fromIdx = -1;
        }
    });

    // Cached Geometries to prevent lag on item spawn
    const sharedDroppedGeo = new THREE.SphereGeometry(0.2, 10, 10);
    const sharedDroppedHaloGeo = new THREE.SphereGeometry(0.35, 10, 10);

    function spawnDroppedItem(data) {
        const item = data.itemData;
        const pickupGroup = new THREE.Group();
        // Glowing sphere
        const mat = new THREE.MeshStandardMaterial({
            color: item.color, emissive: item.color, emissiveIntensity: 1.5,
            transparent: true, opacity: 0.85, roughness: 0.2
        });
        const sphere = new THREE.Mesh(sharedDroppedGeo, mat);
        pickupGroup.add(sphere);
        // Halo
        const haloMat = new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.15 });
        pickupGroup.add(new THREE.Mesh(sharedDroppedHaloGeo, haloMat));
        
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

    document.addEventListener('DOMContentLoaded', function() {
        const dropAllBtn = document.getElementById('drop-all-btn');
        if (dropAllBtn) {
            dropAllBtn.addEventListener('click', function() {
                for (let i = 0; i < 20; i++) {
                    if (playerItems[i]) dropItemOnGround(i);
                }
            });
        }
    });

    let nearestInteractable = null;

    // ---- BOAT STATE ----
    var boatState = {
        active: false,
        boatGroup: null,     // The THREE.Group of the boat we're riding
        boatSpeed: 6.0,
        boatSprintSpeed: 10.0
    };
    var boatObjects = [];    // All spawned boat groups (for interaction raycasting)

    // Check nearest interactables (items, fishing spots, campfires, boats) near player
    function checkPickupDroppedItems() {
        nearestInteractable = null;
        if (!myCharacter || !isPlaying) {
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
        
        // Check fishing spots (extended range when on a boat)
        var fishingRange = boatState.active ? 6.0 : 4.0;
        fishingSpots.forEach(s => {
            const dist = myCharacter.position.distanceTo(s.position);
            if (dist < fishingRange && dist < closestDist) {
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

        // Check boats
        boatObjects.forEach(boat => {
            // Ignore the boat we are currently riding
            if (boatState.active && boatState.boatGroup === boat) return;
            
            const dist = myCharacter.position.distanceTo(boat.position);
            if (dist < 5.0 && dist < closestDist) {
                closestDist = dist;
                closestItem = boat;
            }
        });

        // --- RAYCAST TARGETING FOR BOATS & FISHING SPOTS (with range pre-filtering) ---
        let targetedSpot = null;
        let interactables = [];
        
        // Only consider nearby objects for raycasting to optimize performance
        fishingSpots.forEach(s => {
            if (myCharacter.position.distanceTo(s.position) < 12.0) {
                interactables.push(s);
            }
        });
        boatObjects.forEach(boat => {
            if (boatState.active && boatState.boatGroup === boat) return;
            if (myCharacter.position.distanceTo(boat.position) < 12.0) {
                interactables.push(boat);
            }
        });

        if (interactables.length > 0) {
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            const hits = raycaster.intersectObjects(interactables, true);
            if (hits.length > 0) {
                let curr = hits[0].object;
                while (curr && !curr.userData.isEnvironmentObject) {
                    curr = curr.parent;
                }
                targetedSpot = curr;
            }
        }

        // Update fishing spot rings based on raycast targeting
        fishingSpots.forEach(group => {
            if (group.userData.ring) {
                const isTargeted = (group === targetedSpot) && myCharacter.position.distanceTo(group.position) < 8.0;
                group.userData.ring.visible = isTargeted;
            }
        });

        // Set nearestInteractable: prioritize targeted boat/fishing spot if in range
        if (targetedSpot && targetedSpot.userData && targetedSpot.userData.action === 'boat' && myCharacter.position.distanceTo(targetedSpot.position) < 5.0) {
            nearestInteractable = targetedSpot;
        } else if (targetedSpot && targetedSpot.userData && targetedSpot.userData.action === 'fishing' && myCharacter.position.distanceTo(targetedSpot.position) < fishingRange) {
            nearestInteractable = targetedSpot;
        } else {
            nearestInteractable = closestItem;
        }

        updateInteractionPrompt();
    }

    function updateInteractionPrompt() {
        const promptEl = document.getElementById('interaction-prompt');
        if (!promptEl) return;
        
        if (boatState.active && !inventoryOpen) {
            promptEl.style.display = 'block';
            if (nearestInteractable && nearestInteractable.userData && nearestInteractable.userData.action === 'fishing') {
                document.getElementById('interaction-action').innerText = 'fish from';
                document.getElementById('interaction-item-name').innerText = 'Boat';
            } else {
                document.getElementById('interaction-action').innerText = 'disembark';
                document.getElementById('interaction-item-name').innerText = 'Boat';
            }
        } else if (nearestInteractable && !inventoryOpen) {
            promptEl.style.display = 'block';
            if (nearestInteractable.userData && nearestInteractable.userData.droppedItem) {
                document.getElementById('interaction-action').innerText = 'pick up';
                document.getElementById('interaction-item-name').innerText = nearestInteractable.userData.droppedItem.name;
            } else if (nearestInteractable.userData && nearestInteractable.userData.action === 'fishing') {
                document.getElementById('interaction-action').innerText = 'start';
                document.getElementById('interaction-item-name').innerText = 'Fishing';
            } else if (nearestInteractable.userData && nearestInteractable.userData.action === 'boat') {
                document.getElementById('interaction-action').innerText = 'board';
                document.getElementById('interaction-item-name').innerText = 'Boat';
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
        } else if (pickup.userData && pickup.userData.action === 'boat') {
            // Board the boat
            if (!boatState.active) {
                boatState.active = true;
                // Find the parent group wrapper (the boat itself)
                let curr = pickup;
                while (curr && !curr.userData.isEnvironmentObject) {
                    curr = curr.parent;
                }
                boatState.boatGroup = curr || pickup;
                // Snap player onto boat
                myCharacter.position.set(
                    boatState.boatGroup.position.x,
                    boatState.boatGroup.position.y + 0.5,
                    boatState.boatGroup.position.z
                );
                addChatMessage('System', 'Boarded the boat! WASD to sail, press E near land to disembark.', 0x4fc3f7);
                nearestInteractable = null;
                updateInteractionPrompt();
            }
        } else if (pickup.userData && pickup.userData.action === 'fishing') {
            // Check inventory space before starting
            if (playerItems.indexOf(null) === -1) {
                addChatMessage('System', 'Inventory full! Drop items to fish.', 0xff4444);
                return;
            }
            stopGathering();
            autoFishing.active = true;
            autoFishing.spotGroup = pickup;
            autoFishing.timer = 0;
            if (window.ObjectFactory) ObjectFactory.attachFishingRodToPlayer(myCharacter, scene);
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
        let oldInv = state.inventory;
        if (wheelState.selection >= 0) state.inventory = wheelState.selection;
        document.querySelectorAll('.wheel-item').forEach(el => el.classList.remove('highlighted'));
        
        if (oldInv !== state.inventory && myCharacter) {
            socket.emit('playerMovement', { x: myCharacter.position.x, y: myCharacter.position.y, z: myCharacter.position.z, ry: myCharacter.rotation.y, isMoving: false, isSprinting: false, isCrouching: state.isCrouching, jumpTime: state.jumpTime, localVx: 0, localVz: 0, inventory: state.inventory, camPitch: state.camPitch, camYaw: state.camYaw, useFBX: myCharacter.userData.useFBX || false, isFishing: autoFishing.active, isCooking: autoCooking.active });
        }
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
        
        playerMesh.userData.fbxWeapons = {};
        clone.traverse(child => {
            if (child.isMesh) {
                const name = child.name.toLowerCase();
                if (name.includes('gun')) {
                    playerMesh.userData.fbxWeapons.gun = child;
                    child.visible = false;
                }
                if (name.includes('axe')) {
                    playerMesh.userData.fbxWeapons.axe = child;
                    child.visible = false;
                }
            }
        });
        
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
    var splashParticles = [];
    var splashGeometry, splashMaterial;
    function spawnSplashParticle(x, y, z) {
        if (!splashGeometry) splashGeometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
        if (!splashMaterial) splashMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
        const mesh = new THREE.Mesh(splashGeometry, splashMaterial);
        mesh.position.set(x + (Math.random() - 0.5) * 1.5, y, z + (Math.random() - 0.5) * 1.5);
        scene.add(mesh);
        splashParticles.push({
            mesh: mesh,
            life: 1.0,
            vy: 0.5 + Math.random() * 1.5,
            vx: (Math.random() - 0.5) * 1.0,
            vz: (Math.random() - 0.5) * 1.0
        });
    }

    function spawnEnvironmentObject(data) {
        if (window.ObjectFactory) {
            const factoryObj = window.ObjectFactory.create(data.type, data.config);
            if (factoryObj) {
                // Create a parent wrapper group to match editor.js hierarchy exactly
                const wrapper = new THREE.Group();
                wrapper.userData.id = data.id;
                wrapper.userData.type = data.type;
                wrapper.userData.isEnvironmentObject = true;
                wrapper.add(factoryObj.group);

                // Apply transformations to the wrapper group
                if (data.type === 'Boat') {
                    data.position.y = -1.2;
                }

                // Fallbacks for safe initialization
                const rx = (data.rotation && typeof data.rotation.x === 'number') ? data.rotation.x : 0;
                const ry = (data.rotation && typeof data.rotation.y === 'number') ? data.rotation.y : 0;
                const rz = (data.rotation && typeof data.rotation.z === 'number') ? data.rotation.z : 0;

                const sx = (data.scale && typeof data.scale.x === 'number') ? data.scale.x : 1;
                const sy = (data.scale && typeof data.scale.y === 'number') ? data.scale.y : 1;
                const sz = (data.scale && typeof data.scale.z === 'number') ? data.scale.z : 1;

                wrapper.position.set(data.position.x, data.position.y, data.position.z);
                wrapper.rotation.set(rx, ry, rz);
                wrapper.scale.set(sx, sy, sz);
                
                scene.add(wrapper);
                environmentObjects.push(wrapper);
                if (factoryObj.updatable) {
                    environmentUpdatables.push(factoryObj.updatable);
                }

                // Register FishingSpot objects for interaction
                if (data.type === 'FishingSpot') {
                    wrapper.userData.interactable = true;
                    wrapper.userData.action = 'fishing';
                    // Build bubbles array for the legacy animation loop
                    const bubbles = [];
                    wrapper.traverse(child => {
                        if (child.isMesh && child.geometry && child.geometry.type === 'SphereGeometry') {
                            bubbles.push(child);
                        }
                    });
                    wrapper.userData.bubbles = bubbles;
                    fishingSpots.push(wrapper);
                }

                // Register Boat objects for interaction
                if (data.type === 'Boat') {
                    wrapper.userData.interactable = true;
                    wrapper.userData.action = 'boat';
                    boatObjects.push(wrapper);
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
        boatObjects = [];
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
        
        if (mPanel) {
            mPanel.style.display = (!isLocked && isPlaying && selectedChar === 'goop-man') ? 'block' : 'none';
        }
        if (dPanel) {
            dPanel.style.display = (!isLocked && isPlaying && selectedChar === 'modular') ? 'block' : 'none';
        }
    });
    document.addEventListener('mousemove', function (e) {
        if ((!isLocked && !isDraggingView) || !myCharacter) return;
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

    function shootGun(shooterObj, isLocal, aimTarget) {
        if (!shooterObj) return;
        const bp = shooterObj.userData.bp;
        // For local: check our own state. For remote: caller already validated inv===1
        if (isLocal && state.inventory !== 1) return;
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
        } else if (aimTarget && aimTarget.dirX !== undefined) {
            // Use exact aim direction from shooter's camera
            const dir = new THREE.Vector3(aimTarget.dirX, aimTarget.dirY, aimTarget.dirZ);
            aimTgt = startPos.clone().add(dir.multiplyScalar(100));
        } else {
            // Fallback to camYaw/camPitch if no aim direction
            const pitch = (aimTarget && aimTarget.camPitch) || 0;
            const yaw = (aimTarget && aimTarget.camYaw) || shooterObj.rotation.y;
            const dir = new THREE.Vector3(0, 0, 1);
            dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), -pitch);
            dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
            aimTgt = startPos.clone().add(dir.multiplyScalar(100));
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

    // Cached geometries for VFX orbs
    const sharedOrbGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const sharedOrbGlowGeo = new THREE.SphereGeometry(0.3, 12, 12);
    const sharedTrailGeo = new THREE.SphereGeometry(0.06, 4, 4);

    // --- Spawn a glowing collection orb with light trail ---
    function spawnCollectionOrb(fromPos, item) {
        const orbMat = new THREE.MeshStandardMaterial({
            color: item.color, emissive: item.color, emissiveIntensity: 2.0,
            transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.3
        });
        const trailMat = new THREE.MeshBasicMaterial({
            color: item.color, transparent: true, opacity: 0.6
        });
        const orb = new THREE.Mesh(sharedOrbGeo, orbMat);
        orb.position.copy(fromPos);
        // Outer glow halo
        const glowMat = new THREE.MeshBasicMaterial({ color: item.color, transparent: true, opacity: 0.25 });
        const glow = new THREE.Mesh(sharedOrbGlowGeo, glowMat);
        orb.add(glow);
        scene.add(orb);
        // Trail particles array
        const trail = [];
        vfxOrbs.push({ mesh: orb, glow, light: null, target: myCharacter, life: 1.5, trail, trailTimer: 0, trailMat });
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
        let changed = false;
        if (autoFishing.active) {
            autoFishing.active = false;
            ObjectFactory.detachFishingRodFromPlayer(myCharacter, scene);
            addChatMessage('System', 'Stopped fishing.', 0x4fc3f7);
            changed = true;
        }
        if (autoCooking.active) {
            autoCooking.active = false;
            addChatMessage('System', 'Stopped cooking.', 0xff9800);
            changed = true;
        }
        if (changed) {
            socket.emit('playerMovement', { x: myCharacter.position.x, y: myCharacter.position.y, z: myCharacter.position.z, ry: myCharacter.rotation.y, isMoving: false, isSprinting: false, isCrouching: state.isCrouching, jumpTime: state.jumpTime, localVx: 0, localVz: 0, inventory: state.inventory, camPitch: state.camPitch, camYaw: state.camYaw, useFBX: myCharacter.userData.useFBX || false, isFishing: autoFishing.active, isCooking: autoCooking.active });
        }
    }

    let isDraggingView = false;
    document.addEventListener('mouseup', function (e) {
        isDraggingView = false;
    });

    document.addEventListener('mousedown', function (e) {
        if (inventoryOpen && e.target.tagName === 'CANVAS') {
            isDraggingView = true;
            return;
        }
        if (!isLocked || !myCharacter) return;
        if (e.button === 0) { // Left click
            if (state.inventory === 0) {
                // Hand attack placeholder
                state.shootTime = 0.5;
            } else if (state.inventory === 1 || state.inventory === 2) {
                if (state.shootTime <= 0) {
                    if (state.inventory === 1) shootGun(myCharacter, true);
                    else state.shootTime = 0.15; // Swing axe
                    // Send aim DIRECTION (unit vector) so remote tracers fly the same way
                    var aimDir = new THREE.Vector3(0, 0, 1).applyQuaternion(camRig.quaternion);
                    socket.emit('playerShoot', { id: myId, aimDirX: aimDir.x, aimDirY: aimDir.y, aimDirZ: aimDir.z });
                }
            }
        }
    });

    // Keys
    document.addEventListener('keydown', function (e) {
        if (e.code === 'Enter' && isPlaying && !inventoryOpen) {
            if (document.activeElement !== chatInput) {
                e.preventDefault();
                document.exitPointerLock();
                chatInput.focus();
                return;
            }
        }
        if (document.activeElement === chatInput || !isPlaying) return;
        keys[e.code] = true;
        if (e.code === 'Space' && state.jumpTime < 0) state.jumpTime = 0;
        if (e.code === 'KeyC') state.isCrouching = !state.isCrouching;
        if (e.code === 'KeyE') {
            // If on a boat, E = disembark (or fish if near a fishing spot)
            if (boatState.active && boatState.boatGroup) {
                // Check if near a fishing spot first — prioritize fishing
                if (nearestInteractable && nearestInteractable.userData && nearestInteractable.userData.action === 'fishing') {
                    interactWithNearest();
                } else {
                    // Disembark — find nearest walkable ground
                    var boat = boatState.boatGroup;
                    var bestDist = Infinity, bestX = boat.position.x, bestZ = boat.position.z;
                    var foundLand = false;
                    // Search in a ring around the boat for the nearest shore
                    for (var a = 0; a < Math.PI * 2; a += 0.3) {
                        for (var r = 1; r < 8; r += 0.5) {
                            var tx = boat.position.x + Math.cos(a) * r;
                            var tz = boat.position.z + Math.sin(a) * r;
                            var th = getTerrainHeight(tx, tz);
                            if (th >= -1.25) { // land or shallow shore
                                var d = r;
                                if (d < bestDist) { bestDist = d; bestX = tx; bestZ = tz; foundLand = true; }
                                break;
                            }
                        }
                    }
                    if (foundLand) {
                        boatState.active = false;
                        stopGathering(); // stop fishing if active
                        myCharacter.position.set(bestX, getTerrainHeight(bestX, bestZ), bestZ);
                        boatState.boatGroup = null;
                        addChatMessage('System', 'Disembarked from the boat.', 0x4fc3f7);
                    } else {
                        addChatMessage('System', 'Too far from shore to disembark.', 0xffaa00);
                    }
                }
            } else {
                if (nearestInteractable && !inventoryOpen) interactWithNearest();
            }
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
            if (!inventoryOpen) {
                renderer.domElement.requestPointerLock();
            }
        }
        
        // Drop all hotkey
        if ((e.code === 'Delete' || e.code === 'Backspace') && !e.repeat) {
            const dropAllBtn = document.getElementById('drop-all-btn');
            if (dropAllBtn) dropAllBtn.click();
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
    chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // prevent newline if it were a textarea
            var msg = chatInput.value.trim();
            if (msg) { socket.emit('chatMessage', msg); chatInput.value = ''; }
            chatInput.blur();
            if (isPlaying && !inventoryOpen && !isMobile) {
                renderer.domElement.requestPointerLock();
            }
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
        
        // Ensure player doesn't spawn in water (water level is -0.8)
        if (getTerrainHeight(me.x, me.z) < -0.6) {
            for (let i = 0; i < 50; i++) {
                let testX = Math.random() * 40 - 20;
                let testZ = Math.random() * 40 - 20;
                let th = getTerrainHeight(testX, testZ);
                if (th >= -0.5) {
                    me.x = testX;
                    me.y = th;
                    me.z = testZ;
                    // Instantly sync safe spawn location to server
                    socket.emit('playerMovement', { x: me.x, y: me.y, z: me.z, ry: 0, isMoving: false, isSprinting: false, isCrouching: false, jumpTime: -1, localVx: 0, localVz: 0, inventory: 0, camPitch: 0, camYaw: 0, useFBX: false, isFishing: false, isCooking: false });
                    break;
                }
            }
        }
        
        myCharacter = (selectedChar === 'goop') ? buildGoop() : (selectedChar === 'goop-man') ? buildGoopMan() : buildModularMan();
        myCharacter.position.set(me.x, me.y, me.z);
        scene.add(myCharacter);
        scene.add(camRig);
        state.baseY = me.y;

        for (var id in data.players) { if (id !== myId) createPlayer(id, data.players[id]); }
        
        var welcomePanel = document.getElementById('welcome-panel');
        var welcomeOkBtn = document.getElementById('welcome-ok-btn');
        if (welcomePanel && welcomeOkBtn) {
            welcomePanel.style.display = 'block';
            welcomeOkBtn.onclick = function() {
                welcomePanel.style.display = 'none';
                if (!isMobile) renderer.domElement.requestPointerLock();
            };
        } else {
            if (!isMobile) renderer.domElement.requestPointerLock();
        }
        
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
    
    socket.on('disconnect', function() {
        console.log('Disconnected from server. Waiting for reconnect...');
        socket.once('connect', function() {
            console.log('Reconnected! Reloading page to fetch latest updates...');
            window.location.reload(true);
        });
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
            players[d.id].userData.isFishing = d.isFishing;
            players[d.id].userData.fishingTarget = d.fishingTarget;
            players[d.id].userData.isCooking = d.isCooking;
            players[d.id].userData.camYaw = d.camYaw;
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
    socket.on('boatMoved', function (d) {
        for (let i = 0; i < environmentObjects.length; i++) {
            if (environmentObjects[i].userData.id === d.id && environmentObjects[i].userData.type === 'Boat') {
                environmentObjects[i].position.set(d.x, d.y, d.z);
                environmentObjects[i].rotation.y = d.ry;
                break;
            }
        }
    });
    socket.on('remoteShoot', function (d) {
        if (d.id === myId) return; // Already handled locally
        if (players[d.id]) {
            const inv = d.inventory !== undefined ? d.inventory : 0;
            players[d.id].userData.shootTime = 0.15;
            // Pass aim target coords {aimX, aimY, aimZ} or fallback data
            if (inv === 1) shootGun(players[d.id].mesh, false, { dirX: d.aimDirX, dirY: d.aimDirY, dirZ: d.aimDirZ, camPitch: d.camPitch, camYaw: d.camYaw });
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

    var lastEmitTime = 0;
    var lastBoatEmitTime = 0;
    var lastInteractionCheckTime = 0; // Throttle interaction proximity checks
    function animate() {
        if (!isPlaying) return;
        requestAnimationFrame(animate);
        var time = performance.now(), delta = Math.min((time - prevTime) / 1000, 0.1), t = time * 0.001;
        
        environmentUpdatables.forEach(u => {
            if (u.update) u.update(t, delta);
        });

        for (let i = splashParticles.length - 1; i >= 0; i--) {
            let p = splashParticles[i];
            p.life -= delta * 2.0;
            if (p.life <= 0) {
                scene.remove(p.mesh);
                splashParticles.splice(i, 1);
            } else {
                p.mesh.position.y += p.vy * delta;
                p.mesh.position.x += p.vx * delta;
                p.mesh.position.z += p.vz * delta;
                p.vy -= 2.0 * delta; // gravity
                p.mesh.scale.setScalar(p.life);
                p.mesh.material.opacity = p.life * 0.8;
            }
        }

        if (window.sharedWater) {
            window.sharedWater.material.uniforms['time'].value += delta;
            window.sharedWater.position.y = -1.2 + Math.sin(t * 0.5) * 0.05;
        }
        if (window.RippleWater) {
            window.RippleWater.update(renderer);
        }
        if (window.sharedClouds) {
            window.sharedClouds.rotation.y += 0.0005;
        }
        // Targeting and interaction checks are now consolidated inside checkPickupDroppedItems()
        // --- FISHING SPOTS BUBBLES ---
        // Bubbles are now animated by the updatable object created in ObjectFactory.js

        // --- AUTO-FISHING LOOP + ROD ANIMATION ---
        if (autoFishing.active && autoFishing.spotGroup && myCharacter) {
            const dist = myCharacter.position.distanceTo(autoFishing.spotGroup.position);
            if (dist > 10.0) {
                autoFishing.active = false;
                ObjectFactory.detachFishingRodFromPlayer(myCharacter, scene);
                addChatMessage('System', 'Stopped fishing.', 0x4fc3f7);
            } else {
                autoFishing.timer += delta;
                if (autoFishing.timer >= autoFishing.interval) {
                    autoFishing.timer = 0;
                    collectFish(autoFishing.spotGroup);
                }

                // --- Animate fishing rod ---
                if (myCharacter.userData.fishingRodData && autoFishing.spotGroup) {
                    myCharacter.userData.fishingRodData.tugPhase += delta;
                    const catchProgress = autoFishing.timer / autoFishing.interval; // 0→1
                    
                    const spotPos = autoFishing.spotGroup.position;
                    const waterTarget = new THREE.Vector3(
                        spotPos.x + Math.sin(t * 0.5) * 0.3,
                        -1.0 + Math.sin(t * 1.5) * 0.05,
                        spotPos.z + Math.cos(t * 0.5) * 0.3
                    );

                    ObjectFactory.animateFishingRod(myCharacter.userData.fishingRodData, myCharacter, waterTarget, t, catchProgress);
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

        // --- DROPPED ITEMS (bobbing + auto-pickup) --- throttle proximity check to 5Hz
        if (time - lastInteractionCheckTime > 200) {
            checkPickupDroppedItems();
            lastInteractionCheckTime = time;
        }
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
                const tMesh = new THREE.Mesh(sharedTrailGeo, orbObj.trailMat);
                tMesh.position.copy(orbObj.mesh.position);
                scene.add(tMesh);
                orbObj.trail.push({ mesh: tMesh, life: 0.4 });
            }

            // Update trail particles
            for (let j = orbObj.trail.length - 1; j >= 0; j--) {
                orbObj.trail[j].life -= delta;
                // Don't modify opacity of shared material here, scale the mesh instead to fade it out visually
                orbObj.trail[j].mesh.scale.multiplyScalar(0.92);
                if (orbObj.trail[j].life <= 0) {
                    scene.remove(orbObj.trail[j].mesh);
                    // Do not dispose shared trail material or geometry here
                    orbObj.trail.splice(j, 1);
                }
            }

            if (orbObj.mesh.position.distanceTo(targetPos) < 0.5 || orbObj.life <= 0) {
                scene.remove(orbObj.mesh);
                // Do not dispose shared orb geometry
                orbObj.mesh.material.dispose();
                if (orbObj.trailMat) orbObj.trailMat.dispose();
                if (orbObj.light) orbObj.light.dispose();
                // Clean remaining trail
                orbObj.trail.forEach(tp => { scene.remove(tp.mesh); });
                vfxOrbs.splice(i, 1);
            }
        }

        if ((isLocked || inventoryOpen || isMobile) && myCharacter) {
            // --- EXACT input from Unified Workspace (line 2469-2470) ---
            var keyMoveZ = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
            var keyMoveX = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
            var moveZ = keyMoveZ || joystickMoveZ;
            var moveX = keyMoveX || joystickMoveX;
            var isMoving = Math.abs(moveZ) > 0 || Math.abs(moveX) > 0;
            var isSprinting = keys['ShiftLeft'] || keys['ShiftRight'];

            var localVx = 0, localVz = 0;
            // Stop gathering if player moves out of range
            if (autoCooking.active && autoCooking.campfireGroup) {
                if (myCharacter.position.distanceTo(autoCooking.campfireGroup.position) > 6.0) {
                    stopGathering();
                    addChatMessage('System', 'Moved too far from campfire.', 0xff9800);
                }
            }
            if (autoFishing.active && autoFishing.spotGroup) {
                var fishDist = myCharacter.position.distanceTo(autoFishing.spotGroup.position);
                var maxFishDist = boatState.active ? 6.0 : 4.0; // Extended range when on boat
                if (fishDist > maxFishDist) {
                    stopGathering();
                    addChatMessage('System', 'Moved too far from fishing spot.', 0xff9800);
                }
            }
            // ---- BOAT RIDING MODE ----
            if (boatState.active && boatState.boatGroup) {
                var boat = boatState.boatGroup;
                if (isMoving) {

                    var bSpeed = isSprinting ? boatState.boatSprintSpeed : boatState.boatSpeed;
                    var direction = new THREE.Vector3(moveX, 0, moveZ).normalize();
                    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.camYaw);

                    // Rotate boat to face movement direction (always allowed)
                    var targetYaw = Math.atan2(direction.x, direction.z);
                    var diff = targetYaw - boat.rotation.y;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    boat.rotation.y += diff * 4 * delta;

                    // Calculate next position
                    var nextX = boat.position.x + direction.x * bSpeed * delta;
                    var nextZ = boat.position.z + direction.z * bSpeed * delta;
                    
                    // Bounding box terrain sampling for robust shoreline collision
                    const w = 0.5, l = 1.3;
                    const pts = [
                        new THREE.Vector3(0, 0, 0),
                        new THREE.Vector3(w, 0, l),
                        new THREE.Vector3(-w, 0, l),
                        new THREE.Vector3(w, 0, -l),
                        new THREE.Vector3(-w, 0, -l)
                    ];
                    let canMove = true;
                    for (let pt of pts) {
                        pt.applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y);
                        // Water is at -1.2, so anything above -1.3 is considered shallow/shore
                        if (getTerrainHeight(nextX + pt.x, nextZ + pt.z) > -1.3) {
                            canMove = false;
                            break;
                        }
                    }

                    if (canMove) {
                        boat.position.x = nextX;
                        boat.position.z = nextZ;

                        // Wake ripples
                        if (window.RippleWater) {
                            window.RippleWater.addDrop(renderer, boat.position.x, boat.position.z, 3.0, 0.2);
                        }
                        if (Math.random() < 0.4) {
                            spawnSplashParticle(boat.position.x, boat.position.y, boat.position.z);
                            spawnSplashParticle(boat.position.x, boat.position.y, boat.position.z);
                        }
                    }
                    // else: boat is blocked by land — can still turn
                    

                    if (time - lastBoatEmitTime > 50) {
                        console.log("[Client] Emitting boatMoved event:", boat.userData.id, boat.position.x, boat.position.z);
                        socket.emit('boatMoved', {
                            id: boat.userData.id,
                            x: boat.position.x,
                            y: boat.position.y,
                            z: boat.position.z,
                            ry: boat.rotation.y
                        });
                        lastBoatEmitTime = time;
                    }

                    var moveLen = Math.hypot(moveX, moveZ);
                    var charSpeed = isSprinting ? 1.0 : 0.5;
                    localVx = (moveX / moveLen) * charSpeed;
                    localVz = (moveZ / moveLen) * charSpeed;
                }

                // Snap player to boat position (always)
                myCharacter.position.set(boat.position.x, boat.position.y + 0.5, boat.position.z);
                myCharacter.rotation.y = boat.rotation.y;
                state.baseY = myCharacter.position.y;

            // ---- NORMAL WALKING MODE ----
            } else if (isMoving) {
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
                    if (Math.random() < 0.2) {
                        spawnSplashParticle(myCharacter.position.x, myCharacter.position.y, myCharacter.position.z);
                    }
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
            if (!boatState.active) {
                state.baseY = getTerrainHeight(myCharacter.position.x, myCharacter.position.z);
            }

            // --- EXACT jump from Unified Workspace (line 2572-2580) ---
            if (state.jumpTime >= 0 && !boatState.active) {
                state.jumpTime += delta * 2.5;
                var jumpH = Math.sin(Math.min(state.jumpTime, 1) * Math.PI) * 1.3;
                myCharacter.position.y = state.baseY + Math.max(0, jumpH);
                if (state.jumpTime >= 1.0) state.jumpTime = -1;
            } else if (!boatState.active) {
                myCharacter.position.y = state.baseY;
            }

            if (state.shootTime > 0) state.shootTime -= delta;

            if (fbxLoaded && selectedChar === 'modular' && !myCharacter.userData.fbxModel) {
                setupPlayerFBX(myCharacter);
            }

            if (myCharacter.userData.useFBX && myCharacter.userData.fbxWeapons) {
                if (myCharacter.userData.fbxWeapons.gun) myCharacter.userData.fbxWeapons.gun.visible = (state.inventory === 1);
                if (myCharacter.userData.fbxWeapons.axe) myCharacter.userData.fbxWeapons.axe.visible = (state.inventory === 2);
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

            if (time - lastEmitTime > 50) {
                const fTarget = (autoFishing.active && autoFishing.spotGroup) ? { x: autoFishing.spotGroup.position.x, z: autoFishing.spotGroup.position.z } : null;
                socket.emit('playerMovement', { x: myCharacter.position.x, y: myCharacter.position.y, z: myCharacter.position.z, ry: myCharacter.rotation.y, isMoving: isMoving, isSprinting: isSprinting, isCrouching: state.isCrouching, jumpTime: state.jumpTime, localVx: localVx, localVz: localVz, inventory: state.inventory, camPitch: state.camPitch, camYaw: state.camYaw, useFBX: myCharacter.userData.useFBX || false, isFishing: autoFishing.active, fishingTarget: fTarget, isCooking: autoCooking.active });
                lastEmitTime = time;
            }
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
                if (Math.random() < 0.2) {
                    spawnSplashParticle(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z);
                }
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
            
            // Handle remote fishing
            if (p.userData.isFishing) {
                if (!p.mesh.userData.fishingRodData) ObjectFactory.attachFishingRodToPlayer(p.mesh, scene);
                
                // Generic idle catching animation for remote players
                if (p.mesh.userData.fishingRodData) {
                    let wx, wz;
                    if (p.userData.fishingTarget) {
                        wx = p.userData.fishingTarget.x;
                        wz = p.userData.fishingTarget.z;
                    } else {
                        wx = p.mesh.position.x + Math.sin(p.mesh.rotation.y) * 4.0;
                        wz = p.mesh.position.z + Math.cos(p.mesh.rotation.y) * 4.0;
                    }
                    const waterTarget = new THREE.Vector3(
                        wx + Math.sin(t * 0.5) * 0.3,
                        -1.0 + Math.sin(t * 1.5) * 0.05,
                        wz + Math.cos(t * 0.5) * 0.3
                    );
                    const catchProgress = 0.5 + Math.sin(t) * 0.2; // simulate variable tension
                    ObjectFactory.animateFishingRod(p.mesh.userData.fishingRodData, p.mesh, waterTarget, t, catchProgress);
                }
            } else {
                ObjectFactory.detachFishingRodFromPlayer(p.mesh, scene);
            }
            
            if (typeof window.animateCharacter === 'function') {
                if (p.mesh.userData.useFBX && p.mesh.userData.fbxWeapons) {
                    if (p.mesh.userData.fbxWeapons.gun) p.mesh.userData.fbxWeapons.gun.visible = (inv === 1);
                    if (p.mesh.userData.fbxWeapons.axe) p.mesh.userData.fbxWeapons.axe.visible = (inv === 2);
                }
                window.animateCharacter(
                    p.mesh, p.charType || 'modular',
                    p.isMoving, p.isSprinting, p.isCrouching,
                    p.jumpTime, t, delta,
                    Math.hypot(p.localVx || 0, p.localVz || 0),
                    inv, Math.max(0, p.userData.shootTime || 0), p.userData.camPitch || 0
                );

                // Apply upper-body twist so remote players visually aim where their camera looks
                if (p.charType === 'modular' && p.mesh.userData.bp && p.userData.camYaw !== undefined) {
                    var ubp = p.mesh.userData.bp;
                    var yawDiff = p.userData.camYaw - p.mesh.rotation.y;
                    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
                    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
                    var maxTwist = Math.PI * 0.5;
                    var twist = Math.max(-maxTwist, Math.min(maxTwist, yawDiff));
                    ubp.torso.rotation.y += twist * 0.4;
                    if (ubp.head) ubp.head.rotation.y = twist * 0.6;
                    ubp.torso.rotation.x += (p.userData.camPitch || 0) * 0.2;
                    if (ubp.head) ubp.head.rotation.x += (p.userData.camPitch || 0) * 0.4;
                }
            }
            
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
    
    // --- MOBILE CONTROLS INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", () => {
        if (isMobile) {
            document.getElementById('mobile-controls').style.display = 'block';
            
            if (window.nipplejs) {
                const manager = nipplejs.create({
                    zone: document.getElementById('joystick-zone'),
                    mode: 'static',
                    position: { left: '50%', top: '50%' },
                    color: 'white',
                    size: 100
                });
                manager.on('move', (evt, data) => {
                    joystickMoveX = -data.vector.x;
                    joystickMoveZ = data.vector.y;
                });
                manager.on('end', () => {
                    joystickMoveX = 0;
                    joystickMoveZ = 0;
                });
            }

            let lastTouchX = null, lastTouchY = null;
            const lookZone = document.getElementById('look-zone');
            lookZone.addEventListener('touchstart', (e) => {
                lastTouchX = e.changedTouches[0].pageX;
                lastTouchY = e.changedTouches[0].pageY;
            });
            lookZone.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (lastTouchX === null || lastTouchY === null) return;
                const touch = e.changedTouches[0];
                const dx = touch.pageX - lastTouchX;
                const dy = touch.pageY - lastTouchY;
                lastTouchX = touch.pageX;
                lastTouchY = touch.pageY;
                
                state.camYaw -= dx * 0.005;
                state.camPitch += dy * 0.005;
                state.camPitch = Math.max(-1.0, Math.min(1.2, state.camPitch));
            }, { passive: false });
            lookZone.addEventListener('touchend', () => {
                lastTouchX = null; lastTouchY = null;
            });

            // Mobile Buttons
            const btnInv = document.getElementById('mobile-btn-inv');
            const btnDrop = document.getElementById('mobile-btn-drop');
            const btnChat = document.getElementById('mobile-btn-chat');
            const btnE = document.getElementById('mobile-btn-e');
            const btnJump = document.getElementById('mobile-btn-jump');

            btnInv.addEventListener('touchstart', (e) => {
                e.preventDefault();
                document.dispatchEvent(new KeyboardEvent('keydown', { 'code': 'Tab' }));
            }, {passive: false});

            btnDrop.addEventListener('touchstart', (e) => {
                e.preventDefault();
                document.dispatchEvent(new KeyboardEvent('keydown', { 'code': 'Backspace' }));
            }, {passive: false});

            btnChat.addEventListener('touchstart', (e) => {
                e.preventDefault();
                chatInput.focus();
            }, {passive: false});

            btnE.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (nearestInteractable && !inventoryOpen) interactWithNearest();
            }, {passive: false});

            btnJump.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (state.jumpTime < 0) state.jumpTime = 0;
            }, {passive: false});
        }
    });

})();
