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
        raw_shrimp: { id: 'raw_shrimp', name: 'Raw Shrimp', color: 0xffbdde, icon: 'assets/icons/fish/shrimp.png' },
        raw_trout: { id: 'raw_trout', name: 'Raw Trout', color: 0xa8a8a8, icon: 'assets/icons/fish/trout.png' }
    };
    var playerItems = new Array(20).fill(null);
    var fishingSpots = [];
    var vfxOrbs = [];
    var raycaster = new THREE.Raycaster();
    
    function updateInventoryUI() {
        var invGrid = document.getElementById('inventory-grid');
        if (!invGrid) return;
        
        invGrid.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            const item = playerItems[i];
            var el = document.createElement('div');
            el.style.cssText = 'background:rgba(255,255,255,0.1); border:1px solid #3b82f6; border-radius:4px; width:44px; height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden;';
            if (item) {
                el.innerHTML = '<img src="' + item.icon + '" style="width:24px; height:24px; object-fit:contain;"><div style="font-size:8px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; text-align:center;">' + item.name + '</div>';
            }
            invGrid.appendChild(el);
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
        if (data.type === 'Campfire' && window.Campfire) {
            const campfire = new window.Campfire();
            if (data.config) {
                Object.assign(campfire.config, data.config);
            }
            campfire.group.position.set(data.position.x, data.position.y, data.position.z);
            campfire.group.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
            campfire.group.scale.set(data.scale.x, data.scale.y, data.scale.z);
            
            // Add hit box for raycasting/physics if needed, but primarily it's visual
            scene.add(campfire.group);
            environmentObjects.push(campfire.group);
            environmentUpdatables.push(campfire);
        }
    }

    function clearEnvironmentObjects() {
        environmentObjects.forEach(obj => scene.remove(obj));
        environmentObjects = [];
        environmentUpdatables = [];
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

    // Initialize fishing spots around coastal areas
    setTimeout(() => {
        let placed = 0;
        for (let i = 0; i < 2000; i++) {
            if (placed >= 15) break;
            const tx = (Math.random() - 0.5) * 200;
            const tz = (Math.random() - 0.5) * 200;
            const th = getTerrainHeight(tx, tz);
            // Spawn spots strictly underwater (water is at -1.2) to avoid grass
            if (th < -1.25 && th > -1.6) {
                let overlap = false;
                for (let s of fishingSpots) {
                    if (s.position.distanceTo(new THREE.Vector3(tx, -1.2, tz)) < 6.0) overlap = true;
                }
                if (!overlap) {
                    const spot = createFishingSpot();
                    spot.position.set(tx, -1.2, tz); // Set at water level
                    scene.add(spot);
                    fishingSpots.push(spot);
                    placed++;
                }
            }
        }
    }, 1000);

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
        if (!isLocked && isPlaying) chatInput.focus();
        
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
        if (isPlaying && document.activeElement !== chatInput && !isLocked) renderer.domElement.requestPointerLock();
    });

    document.addEventListener('mousedown', function (e) {
        if (!isLocked || !myCharacter) return;
        if (e.button === 0) { // Left click
            if (state.inventory === 0) {
                // HANDS: Raycast for interaction
                raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
                // Get all meshes inside fishing spots
                let interactables = [];
                fishingSpots.forEach(s => s.children.forEach(c => interactables.push(c)));
                
                const intersects = raycaster.intersectObjects(interactables, false);
                if (intersects.length > 0) {
                    const hit = intersects[0].object;
                    const spotGroup = hit.userData.parentGroup || hit.parent;
                    if (spotGroup && spotGroup.userData.action === 'fishing') {
                        if (myCharacter.position.distanceTo(spotGroup.position) < 8.0) {
                            if (state.shootTime <= 0) {
                                state.shootTime = 1.0; // Fishing cooldown
                                
                                // Pick fish
                                const fishType = Math.random() > 0.4 ? GAME_ITEMS.raw_shrimp : GAME_ITEMS.raw_trout;
                                
                                const emptyIdx = playerItems.indexOf(null);
                                if (emptyIdx !== -1) {
                                    playerItems[emptyIdx] = fishType;
                                    updateInventoryUI();
                                    addChatMessage('System', 'You caught a ' + fishType.name + '!', 0x4fc3f7);

                                    // VFX Orb
                                    const orbGeo = new THREE.SphereGeometry(0.2, 8, 8);
                                    const orbMat = new THREE.MeshBasicMaterial({ color: fishType.color });
                                    const orb = new THREE.Mesh(orbGeo, orbMat);
                                    orb.position.copy(spotGroup.position).add(new THREE.Vector3(0, 0.5, 0));
                                    scene.add(orb);
                                    vfxOrbs.push({ mesh: orb, target: myCharacter, life: 1.0 });
                                } else {
                                    addChatMessage('System', 'Your inventory is full!', 0xff4444);
                                }
                            }
                        } else {
                            addChatMessage('System', 'Too far away to fish!', 0xff4444);
                        }
                    }
                }
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
        if (e.code === 'KeyX' && !e.repeat) state.camSide *= -1;
        if (e.code === 'KeyQ' && !e.repeat) openWeaponWheel();
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
        data.inventory = 0;
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

        // --- VFX ORBS ---
        for (let i = vfxOrbs.length - 1; i >= 0; i--) {
            let orbObj = vfxOrbs[i];
            let targetPos = orbObj.target.position.clone().add(new THREE.Vector3(0, 1.0, 0));
            orbObj.mesh.position.lerp(targetPos, delta * 5.0);
            orbObj.life -= delta;
            
            if (orbObj.mesh.position.distanceTo(targetPos) < 0.5 || orbObj.life <= 0) {
                scene.remove(orbObj.mesh);
                orbObj.mesh.geometry.dispose();
                orbObj.mesh.material.dispose();
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
            animateCharacter(p.mesh, p.charType, p.isMoving, p.isSprinting, p.isCrouching || false, p.jumpTime || -1, t, delta, Math.hypot(p.localVx || 0, p.localVz || 0), p.userData.inventory || 1, Math.max(0, p.userData.shootTime || 0), p.userData.camPitch || 0);

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
