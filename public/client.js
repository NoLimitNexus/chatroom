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
    var backBtn = document.getElementById('back-btn');
    var joinBtn = document.getElementById('join-btn');
    var chatBox = document.getElementById('chat-box');
    var chatInput = document.getElementById('chat-input');
    var chatMessages = document.getElementById('chat-messages');
    var crosshair = document.getElementById('crosshair');
    var container = document.getElementById('game-container');

    var selectedChar = 'modular';
    var isPlaying = false;
    var myId = null;
    var players = {};
    var isLocked = false;
    var myCharacter = null;
    var camRig = new THREE.Group();
    var keys = {};
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
        inventory: 1,
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

    // Character select UI
    document.querySelectorAll('.char-option').forEach(function(el) {
        el.addEventListener('click', function() {
            document.querySelectorAll('.char-option').forEach(function(o){ o.classList.remove('selected'); });
            el.classList.add('selected');
            selectedChar = el.dataset.char;
        });
    });
    nextBtn.addEventListener('click', function() {
        if (!usernameInput.value.trim()) { usernameInput.style.borderColor = '#ef4444'; return; }
        step1.style.display = 'none'; step2.style.display = 'block';
        initCharPreviews();
    });
    backBtn.addEventListener('click', function() { step2.style.display = 'none'; step1.style.display = 'block'; });
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

    // --- Modular Man helpers (from ModularMan/index.html) ---
    function createRoundedBoxGeometry(w, h, d, r, bevelSegments) {
        bevelSegments = bevelSegments || 4;
        var shape = new THREE.Shape();
        var x = -w / 2, y = -d / 2;
        shape.moveTo(x, y + r);
        shape.lineTo(x, y + d - r);
        shape.quadraticCurveTo(x, y + d, x + r, y + d);
        shape.lineTo(x + w - r, y + d);
        shape.quadraticCurveTo(x + w, y + d, x + w, y + d - r);
        shape.lineTo(x + w, y + r);
        shape.quadraticCurveTo(x + w, y, x + w - r, y);
        shape.lineTo(x + r, y);
        shape.quadraticCurveTo(x, y, x, y + r);
        var extrudeSettings = {
            depth: Math.max(0.001, h - (r * 2)),
            bevelEnabled: true, bevelSegments: bevelSegments,
            steps: 1, bevelSize: r, bevelThickness: r
        };
        var geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.center();
        geo.rotateX(Math.PI / 2);
        return geo;
    }

    function mmGetMaterial(color) {
        return new THREE.MeshPhysicalMaterial({ color: color, roughness: 0.3, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.1 });
    }

    function mmCreatePart(w, h, d, color, partType) {
        partType = partType || 'limb';
        var roundness = 0.49;
        var mat = mmGetMaterial(color);
        var minDim = Math.min(w, h / 2, d);
        var r = minDim * roundness;
        var geo = createRoundedBoxGeometry(w, h, d, r, 12);
        geo.translate(0, -h / 2, 0);
        if (partType === 'hand') {
            var handR = Math.max(w, d) * (0.2 + roundness);
            geo = new THREE.SphereGeometry(handR, 24, 24);
            geo.translate(0, -h / 2, 0);
        }
        var mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = partType;
        var group = new THREE.Group();
        group.add(mesh); group.mesh = mesh;
        return group;
    }

    function mmCreateLeg(limbColor) {
        var thigh = mmCreatePart(0.12, 0.45, 0.12, limbColor, 'limb');
        var calf = mmCreatePart(0.1, 0.45, 0.1, limbColor, 'limb');
        calf.position.y = -0.45;
        thigh.add(calf);
        var foot = mmCreatePart(0.11, 0.06, 0.22, limbColor, 'foot');
        foot.mesh.geometry.translate(0, 0, 0.06);
        foot.position.y = -0.45;
        calf.add(foot);
        thigh.calf = calf; thigh.foot = foot;
        return thigh;
    }

    function mmCreateArm(limbColor) {
        var upper = mmCreatePart(0.1, 0.35, 0.1, limbColor, 'limb');
        var lower = mmCreatePart(0.08, 0.32, 0.08, limbColor, 'limb');
        lower.position.y = -0.35;
        upper.add(lower);
        var hand = mmCreatePart(0.08, 0.1, 0.08, limbColor, 'hand');
        hand.position.y = -0.32;
        lower.add(hand);
        upper.lower = lower; upper.hand = hand;
        return upper;
    }

    // Build EXACT Modular Man from Unified Workspace
    function buildModularMan(playerColor) {
        var colorTorso = '#3b82f6';
        var colorHead = '#ffdbac';
        var colorLimbs = '#1e40af';
        var group = new THREE.Group();

        // PELVIS
        var pelvis = mmCreatePart(0.25, 0.15, 0.12, colorTorso, 'pelvis');
        group.add(pelvis);

        // TORSO
        var torsoR = Math.min(0.28, 0.45 / 2, 0.18) * 0.49;
        var torsoGeo = createRoundedBoxGeometry(0.28, 0.45, 0.18, torsoR, 12);
        torsoGeo.translate(0, 0.45 / 2, 0);
        var torso = new THREE.Mesh(torsoGeo, mmGetMaterial(colorTorso));
        torso.position.y = 0.15;
        torso.castShadow = true; torso.receiveShadow = true; torso.name = 'torso';
        pelvis.add(torso);

        // HEAD
        var headR = Math.min(0.18, 0.22 / 2, 0.18) * 0.49;
        var headGeo = createRoundedBoxGeometry(0.18, 0.22, 0.18, headR, 12);
        var head = new THREE.Mesh(headGeo, mmGetMaterial(colorHead));
        head.position.y = 0.45 + 0.12;
        head.castShadow = true; head.receiveShadow = true; head.name = 'head';

        // VISOR
        var visorGeo = createRoundedBoxGeometry(0.12, 0.04, 0.04, 0.015, 8);
        var visorMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.1, metalness: 0.9, clearcoat: 1.0 });
        var visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 0.04, 0.09); visor.name = 'visor';
        head.add(visor);
        torso.add(head);

        // LEGS
        var legL = mmCreateLeg(colorLimbs);
        legL.position.set(0.095, 0, 0);
        pelvis.add(legL);
        var legR = mmCreateLeg(colorLimbs);
        legR.position.set(-0.095, 0, 0);
        pelvis.add(legR);

        // ARMS
        var armL = mmCreateArm(colorLimbs);
        armL.position.set(0.19, 0.40, 0);
        torso.add(armL);
        var armR = mmCreateArm(colorLimbs);
        armR.position.set(-0.19, 0.40, 0);
        torso.add(armR);

        // WEAPONS
        var weaponsMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.6 });
        var gun = new THREE.Group();
        gun.position.set(0, -0.05, 0);
        var barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.05), weaponsMat);
        barrel.position.set(0, -0.1, 0.05);
        barrel.castShadow = true;
        var grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.12), weaponsMat);
        grip.position.set(0, 0, -0.02);
        grip.castShadow = true;
        gun.add(barrel); gun.add(grip);
        gun.visible = true;
        armR.hand.add(gun);

        // Position pelvis at correct height (legs are ~0.9 total)
        pelvis.position.y = 0.9;

        // Store direct refs like Unified Workspace bodyParts.*
        group.userData.bp = { pelvis: pelvis, torso: torso, head: head, legL: legL, legR: legR, armL: armL, armR: armR, gun: gun };

        return group;
    }

    // Build EXACT Goop (Blob) from Unified Workspace
    function buildGoop(playerColor) {
        var group = new THREE.Group();
        var c = playerColor || 0x059669;
        
        var mat = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.1, metalness: 0.0, transmission: 0.9, thickness: 0.5, clearcoat: 1.0, clearcoatRoughness: 0.1, ior: 1.5 });
        
        var roundness = 0.5;

        function goopCreatePart(w, h, d, partType) {
            var minDim = Math.min(w, h / 2, d);
            var r = minDim * roundness;
            var geo = createRoundedBoxGeometry(w, h, d, r, 12);
            geo.translate(0, -h / 2, 0);
            if (partType === 'hand') {
                var handR = Math.max(w, d) * (0.2 + roundness);
                geo = new THREE.SphereGeometry(handR, 24, 24);
                geo.translate(0, -h / 2, 0);
            }
            var mesh = new THREE.Mesh(geo, mat);
            mesh.name = partType;
            mesh.userData.isGoop = true;
            mesh.visible = false;
            var pgroup = new THREE.Group();
            pgroup.add(mesh);
            pgroup.mesh = mesh;
            return pgroup;
        }

        var pelvis = goopCreatePart(0.25, 0.15, 0.12, 'pelvis');
        group.add(pelvis);

        var torsoR = Math.min(0.28, 0.45 / 2, 0.18) * roundness;
        var torsoGeo = createRoundedBoxGeometry(0.28, 0.45, 0.18, torsoR, 12);
        torsoGeo.translate(0, 0.45 / 2, 0); 
        var torso = new THREE.Mesh(torsoGeo, mat);
        torso.position.y = 0.15;
        torso.name = 'torso';
        torso.userData.isGoop = true;
        torso.visible = false;
        pelvis.add(torso);

        var headR = Math.min(0.18, 0.22 / 2, 0.18) * roundness;
        var headGeo = createRoundedBoxGeometry(0.18, 0.22, 0.18, headR, 12);
        var head = new THREE.Mesh(headGeo, mat);
        head.position.y = 0.45 + 0.12;
        head.name = 'head';
        head.userData.isGoop = true;
        head.visible = false;
        torso.add(head);

        var eyeGeo = new THREE.SphereGeometry(0.04, 16, 16);
        var eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        var pupilGeo = new THREE.SphereGeometry(0.015, 16, 16);
        var pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

        var eyeL = new THREE.Group();
        eyeL.add(new THREE.Mesh(eyeGeo, eyeMat));
        var pupilL = new THREE.Mesh(pupilGeo, pupilMat);
        pupilL.position.z = 0.035;
        eyeL.add(pupilL);
        eyeL.position.set(-0.04, 0.02, 0.1);
        head.add(eyeL);

        var eyeR = new THREE.Group();
        eyeR.add(new THREE.Mesh(eyeGeo, eyeMat));
        var pupilR = new THREE.Mesh(pupilGeo, pupilMat);
        pupilR.position.z = 0.035;
        eyeR.add(pupilR);
        eyeR.position.set(0.04, 0.02, 0.1);
        head.add(eyeR);

        function createLeg() {
            var thigh = goopCreatePart(0.12, 0.45, 0.12, 'limb');
            var calf = goopCreatePart(0.1, 0.45, 0.1, 'limb');
            calf.position.y = -0.45;
            thigh.add(calf);
            var foot = goopCreatePart(0.11, 0.06, 0.22, 'foot');
            foot.mesh.geometry.translate(0, 0, 0.06);
            foot.position.y = -0.45;
            calf.add(foot);
            thigh.calf = calf;
            thigh.foot = foot;
            return thigh;
        }

        var legL = createLeg(); legL.position.set(0.09, 0, 0); pelvis.add(legL);
        var legR = createLeg(); legR.position.set(-0.09, 0, 0); pelvis.add(legR);

        function createArm() {
            var upper = goopCreatePart(0.1, 0.35, 0.1, 'limb');
            var lower = goopCreatePart(0.08, 0.32, 0.08, 'limb');
            lower.position.y = -0.35;
            upper.add(lower);
            var hand = goopCreatePart(0.08, 0.1, 0.08, 'hand');
            hand.position.y = -0.32;
            lower.add(hand);
            upper.lower = lower;
            upper.hand = hand;
            return upper;
        }

        var armL = createArm(); armL.position.set(0.18, 0.45, 0); torso.add(armL);
        var armR = createArm(); armR.position.set(-0.18, 0.45, 0); torso.add(armR);

        var weaponsMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.6 });
        var gun = new THREE.Group();
        gun.position.set(0, -0.05, 0);
        var barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.05), weaponsMat);
        barrel.position.set(0, -0.1, 0.05);
        barrel.castShadow = true;
        var grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.12), weaponsMat);
        grip.position.set(0, 0, -0.02);
        grip.castShadow = true;
        gun.add(barrel); gun.add(grip);
        gun.visible = true;
        armR.hand.add(gun);

        var resolution = 48; // lower resolution for multiplayer performance
        var marchingCubes = new THREE.MarchingCubes(resolution, mat, false, false);
        marchingCubes.scale.set(1.5, 1.5, 1.5);
        marchingCubes.position.set(0, 1.0, 0);
        group.add(marchingCubes);

        group.userData.marchingCubes = marchingCubes;
        group.userData.leftEye = eyeL;
        group.userData.rightEye = eyeR;
        group.userData.bp = { pelvis: pelvis, torso: torso, head: head, legL: legL, legR: legR, armL: armL, armR: armR, gun: gun };

        return group;
    }

    // === MINI 3D PREVIEWS ===
    var previewScenes = {};
    function initCharPreviews() {
        if (previewScenes.modular) return;
        createPreview('preview-modular', 'modular');
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
        var model = (type === 'goop') ? buildGoop() : buildModularMan();
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
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 0, 75);
    var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1, 0);
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio); renderer.shadowMap.enabled = true;
    container.insertBefore(renderer.domElement, document.getElementById('ui-layer'));

    scene.add(new THREE.AmbientLight(0x6688cc, 0.5));
    scene.add(new THREE.HemisphereLight(0xaaccff, 0x44aa44, 0.6));
    var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10); dirLight.castShadow = true;
    dirLight.shadow.camera.top = 30; dirLight.shadow.camera.bottom = -30;
    dirLight.shadow.camera.left = -30; dirLight.shadow.camera.right = 30;
    scene.add(dirLight);

    function getTerrainHeight(x, z) {
        if (Math.abs(x) < 3 && Math.abs(z) < 3) return 0;
        return (Math.sin(x * 0.2) * Math.cos(-z * 0.2)) * 0.8 + (Math.sin(x * 0.05) * Math.cos(-z * 0.05)) * 3.0;
    }

    function buildEnvironment() {
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 1.5, 7);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3219, roughness: 1.0 });
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 });
        const darkLeafMat = new THREE.MeshStandardMaterial({ color: 0x1f401b, roughness: 0.9 });

        for (let i = 0; i < 200; i++) {
            const tx = (Math.random() - 0.5) * 200;
            const tz = (Math.random() - 0.5) * 200;
            if (Math.abs(tx) < 8 && Math.abs(tz) < 8) continue;
            
            const th = getTerrainHeight(tx, tz);
            const tree = new THREE.Group();
            
            const trunkH = 1.0 + Math.random() * 2.0;
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.scale.y = trunkH / 1.5;
            trunk.position.y = trunkH / 2;
            trunk.castShadow = true;
            tree.add(trunk);

            const canopyR = 1.0 + Math.random() * 1.5;
            const mat = Math.random() > 0.5 ? leafMat : darkLeafMat;
            const canopy = new THREE.Mesh(new THREE.SphereGeometry(canopyR, 8, 6), mat);
            canopy.position.y = trunkH + canopyR * 0.5;
            canopy.scale.y = 0.7 + Math.random() * 0.3;
            canopy.castShadow = true;
            tree.add(canopy);

            if (Math.random() > 0.4) {
                const sub = new THREE.Mesh(new THREE.SphereGeometry(canopyR * 0.6, 8, 6), mat);
                sub.position.set((Math.random() - 0.5) * canopyR, trunkH + canopyR * 0.2, (Math.random() - 0.5) * canopyR);
                sub.castShadow = true;
                tree.add(sub);
            }

            tree.position.set(tx, th, tz);
            tree.rotation.y = Math.random() * Math.PI * 2;
            tree.rotation.z = (Math.random() - 0.5) * 0.15;
            tree.rotation.x = (Math.random() - 0.5) * 0.15;
            scene.add(tree);
        }
    }

    const floorGeo = new THREE.PlaneGeometry(250, 250, 250, 250);
    const pos = floorGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        if (Math.abs(x) < 3 && Math.abs(y) < 3) continue;
        const z = (Math.sin(x * 0.2) * Math.cos(y * 0.2)) * 0.8 + (Math.sin(x * 0.05) * Math.cos(y * 0.05)) * 3.0;
        pos.setZ(i, z);
    }
    floorGeo.computeVertexNormals();

    const floor = new THREE.Mesh(
        floorGeo,
        new THREE.MeshStandardMaterial({ 
            color: 0x3a7a2a, 
            roughness: 0.9, 
            metalness: 0.0, 
            flatShading: true 
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    buildEnvironment();

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
            mPanel.style.display = (!isLocked && isPlaying && selectedChar === 'goop') ? 'block' : 'none';
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

        flash.position.set(0, -0.28, 0.05);
        flash.rotation.x = -Math.PI / 2;
        flash.rotation.y = Math.random() * Math.PI;
        if (bp && bp.gun) bp.gun.add(flash);
        else if (shooterObj.userData.rightEye) {
            flash.position.set(0, 0, 0.1);
            shooterObj.userData.rightEye.add(flash);
        }

        setTimeout(() => {
            if (bp && bp.gun && flash) bp.gun.remove(flash);
            else if (shooterObj.userData.rightEye && flash) shooterObj.userData.rightEye.remove(flash);
            flashGeo.dispose(); flashMat.dispose();
        }, 50);

        // Tracer
        const tracerGeo = new THREE.CylinderGeometry(0.015, 0.015, 4.0);
        tracerGeo.rotateX(Math.PI / 2);
        const tracer = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.8 }));
        scene.add(tracer);

        const startPos = new THREE.Vector3();
        if (bp && bp.gun) bp.gun.localToWorld(startPos.set(0, -0.25, 0.05));
        else if (shooterObj.userData.rightEye) shooterObj.userData.rightEye.localToWorld(startPos.set(0, 0, 0.2));
        
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

    // Join
    joinBtn.addEventListener('click', function () {
        var username = usernameInput.value.trim();
        if (username) socket.emit('join', { username: username, charType: selectedChar });
    });
    document.addEventListener('click', function (e) {
        if (isPlaying && document.activeElement !== chatInput && !isLocked) renderer.domElement.requestPointerLock();
    });

    document.addEventListener('mousedown', function (e) {
        if (!isLocked || !myCharacter) return;
        if (e.button === 0 && state.inventory === 1) { // Left click to shoot
            if (state.shootTime <= 0) {
                shootGun(myCharacter, true);
                socket.emit('playerShoot', { id: myId });
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
        
        myCharacter = (selectedChar === 'goop') ? buildGoop() : buildModularMan();
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
            addChatMessage('System', p.username + ' joined as ' + (p.charType === 'goop' ? 'The Goop' : 'Modular Man'), 0xaaaaaa);
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
            shootGun(players[d.id].mesh, false);
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
        var mesh = (charType === 'goop') ? buildGoop() : buildModularMan();
        mesh.position.set(data.x, data.y, data.z);
        scene.add(mesh);
        var tag = document.createElement('div'); tag.textContent = data.username;
        tag.style.cssText = 'position:absolute;color:white;background:rgba(0,0,0,.6);padding:3px 8px;border-radius:4px;pointer-events:none;font:600 11px Inter,sans-serif;transform:translate(-50%,-50%);white-space:nowrap;';
        document.getElementById('ui-layer').appendChild(tag);
        data.id = id;
        data.inventory = 1;
        players[id] = { mesh: mesh, nametag: tag, targetPos: new THREE.Vector3(data.x, data.y, data.z), targetRy: data.ry || 0, userData: data, charType: charType };
    }

    function animateCharacter(mesh, charType, isMoving, isSprinting, isCrouching, jumpTime, t, delta, speedStr, inventory, shootTime, camPitch) {
        inventory = inventory || 0;
        camPitch = camPitch || 0;
        shootTime = shootTime || 0;
        if (mesh.userData.bp) {
            // Use direct refs stored at build time (like Unified Workspace bodyParts.*)
            var bp = mesh.userData.bp;
            var pelvis = bp.pelvis, torso = bp.torso, head = bp.head;
            var legL = bp.legL, legR = bp.legR, armL = bp.armL, armR = bp.armR;

            if (mesh.userData.useFBX) {
                if (mesh.userData.mixer) {
                    var targetAction = mesh.userData.actions.idle;
                    if (isMoving) targetAction = isSprinting ? mesh.userData.actions.run : mesh.userData.actions.walk;
                    
                    if (mesh.userData.currentAction !== targetAction) {
                        mesh.userData.currentAction.fadeOut(0.2);
                        targetAction.reset().fadeIn(0.2).play();
                        mesh.userData.currentAction = targetAction;
                    }
                    mesh.userData.mixer.update(delta);
                }
            } else {
                // --- EXACT resetPose from Unified Workspace ---
                pelvis.position.y = 0.9;
                pelvis.position.z = 0;
                torso.rotation.x = 0; torso.rotation.y = 0; torso.scale.y = 1.0;
                if (head) { head.rotation.x = 0; head.rotation.y = 0; }
                legL.rotation.x = 0; legR.rotation.x = 0;
                legL.calf.rotation.x = 0; legR.calf.rotation.x = 0;
                legL.foot.rotation.x = 0; legR.foot.rotation.x = 0;
                armL.rotation.x = 0; armL.rotation.z = 0; armL.lower.rotation.x = 0;
                armR.rotation.x = 0; armR.rotation.z = 0; armR.lower.rotation.x = 0;

                let thighRot = 0;
                let calfRot = 0;
                if (isCrouching) {
                    thighRot = -1.2;
                    calfRot = 1.9;
                    
                    legL.rotation.x = thighRot;
                    legR.rotation.x = thighRot;
                    legL.calf.rotation.x = calfRot;
                    legR.calf.rotation.x = calfRot;
                    
                    torso.rotation.x = -0.4;
                    armL.rotation.x = 0.6;
                    armR.rotation.x = 0.6;
                }

                const legH = 0.45 * (state.legs || 1.0);
                const footH = 0.09 * (state.legs || 1.0);
                const currentPelvisY = legH * Math.cos(thighRot) + legH * Math.cos(thighRot + calfRot) + footH;
                pelvis.position.y = currentPelvisY;

                // --- EXACT walk/run animation from Unified Workspace (line 2582-2604) ---
                if (isMoving) {
                    var speed = isSprinting ? 14 : 8;
                    var amp = isSprinting ? 0.9 : 0.5;
                    var phase = t * speed;
                    legL.rotation.x += Math.sin(phase) * amp;
                    legR.rotation.x += Math.sin(phase + Math.PI) * amp;
                    legL.calf.rotation.x += Math.max(0, Math.sin(phase - 1.2)) * amp * 2.2;
                    legR.calf.rotation.x += Math.max(0, Math.sin(phase + Math.PI - 1.2)) * amp * 2.2;
                    armL.rotation.x = Math.sin(phase + Math.PI) * amp;
                    armR.rotation.x = Math.sin(phase) * amp;

                    if (jumpTime < 0) {
                        var bobAmt = isSprinting ? 0.12 : 0.05;
                        pelvis.position.y += (Math.cos(phase * 2) * -0.5 + 0.5) * bobAmt;
                    }
                    torso.rotation.x += isSprinting ? 0.3 : 0.05;
                    torso.rotation.y = Math.sin(phase) * 0.15;
                } else {
                    // --- EXACT idle from Unified Workspace (line 2699-2703) ---
                    var breath = Math.sin(t * 2);
                    torso.scale.y = 1.0 + breath * 0.012;
                    armL.rotation.z = 0.15 + breath * 0.02;
                    armR.rotation.z = -0.15 - breath * 0.02;
                }

                // --- EXACT flat feet from Unified Workspace (line 2602-2604) ---
                legL.foot.rotation.x = -(legL.rotation.x + legL.calf.rotation.x);
                legR.foot.rotation.x = -(legR.rotation.x + legR.calf.rotation.x);

                // --- EXACT jump from Unified Workspace (line 2572-2580) ---
                if (jumpTime >= 0) {
                    legL.rotation.x = -0.4 * Math.sin(Math.min(jumpTime, 1) * Math.PI) * 1.3;
                    legR.rotation.x = -0.4 * Math.sin(Math.min(jumpTime, 1) * Math.PI) * 1.3;
                }
            } // end procedural

            // Weapon visibility
            if (bp.gun) {
                bp.gun.visible = (inventory === 1);
            }

            // --- ARC RAIDERS UPPER BODY AIMING ---
            let appliedTorsoPitch = camPitch * 0.2;
            
            // Aiming Inventory Overrides (applied even with FBX to control aiming)
            if (inventory === 1) { // Gun
                armR.rotation.x = -Math.PI / 2 + (camPitch - appliedTorsoPitch);
                if (shootTime > 0) {
                    armR.rotation.x -= Math.sin((shootTime / 0.15) * Math.PI) * 0.4;
                }
                armR.rotation.z = -0.05;
                armR.rotation.y = 0.2;

                armL.rotation.x = -0.8 + (camPitch - appliedTorsoPitch); // Lower, tucked support hand
                armL.lower.rotation.x = -0.9;  // Elbow bent, hand near chest
                armL.rotation.z = 0.25;  // Kept close to body
                armL.rotation.y = -0.1;
            }
        }

        if (charType === 'goop' && mesh.userData.marchingCubes) {
            var marchingCubes = mesh.userData.marchingCubes;
            marchingCubes.reset();
            const actualDomainSize = marchingCubes.scale.x * 2.0;
            const P = marchingCubes.position;

            mesh.traverse((child) => {
                if (child.isMesh && child.userData.isGoop) {
                    if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
                    const bbox = child.geometry.boundingBox;
                    
                    const height = bbox.max.y - bbox.min.y;
                    const width = bbox.max.x - bbox.min.x;
                    const depth = bbox.max.z - bbox.min.z;
                    
                    let radius = 0.07; 
                    if (child.name === 'torso') radius = 0.13;
                    else if (child.name === 'head') radius = 0.11;
                    else if (child.name === 'pelvis') radius = 0.09;
                    else if (child.name === 'foot' || child.name === 'hand') radius = 0.08;
                    
                    const primaryDim = Math.max(width, height, depth);
                    const numBalls = Math.max(1, Math.ceil(primaryDim / (radius * 0.75)));

                    // Multiply size by a baseline factor for isolation 80
                    const size = 110 * Math.pow(radius / actualDomainSize, 2);

                    for (let i = 0; i <= numBalls; i++) {
                        const t_ball = numBalls === 0 ? 0.5 : i / numBalls;
                        const center = new THREE.Vector3();
                        
                        if (child.name === 'pelvis') {
                            // Spread horizontally along X
                            center.x = bbox.min.x + width * t_ball;
                            center.y = (bbox.max.y + bbox.min.y) / 2;
                            center.z = (bbox.max.z + bbox.min.z) / 2;
                        } else if (child.name === 'foot') {
                            // Spread forward/backward along Z
                            center.x = (bbox.max.x + bbox.min.x) / 2;
                            center.y = (bbox.max.y + bbox.min.y) / 2;
                            center.z = bbox.min.z + depth * t_ball;
                        } else {
                            // Spread vertically along Y
                            center.x = (bbox.max.x + bbox.min.x) / 2;
                            center.z = (bbox.max.z + bbox.min.z) / 2;
                            center.y = bbox.min.y + height * t_ball;
                        }
                        
                        const localCenter = center.clone();
                        child.localToWorld(localCenter);
                        const localPos = mesh.worldToLocal(localCenter);
                        
                        const mappedX = (localPos.x - P.x) / actualDomainSize + 0.5;
                        const mappedY = (localPos.y - P.y) / actualDomainSize + 0.5;
                        const mappedZ = (localPos.z - P.z) / actualDomainSize + 0.5;
                        
                        marchingCubes.addBall(mappedX, mappedY, mappedZ, size, 12, 1.0);
                    }
                }
            });
            marchingCubes.update();
        }
    }

    function animate() {
        if (!isPlaying) return;
        requestAnimationFrame(animate);
        var time = performance.now(), delta = Math.min((time - prevTime) / 1000, 0.1), t = time * 0.001;
        
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
