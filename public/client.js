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
        legs: 1.0,
        baseY: 0
    };

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

        // Position pelvis at correct height (legs are ~0.9 total)
        pelvis.position.y = 0.9;

        // Store direct refs like Unified Workspace bodyParts.*
        group.userData.bp = { pelvis: pelvis, torso: torso, head: head, legL: legL, legR: legR, armL: armL, armR: armR };

        return group;
    }

    // Build EXACT Goop (Blob) from Unified Workspace
    function buildGoop(playerColor) {
        var group = new THREE.Group();

        // Blob body — EXACT deformed sphere from Blob/entities/Character.js
        var blobGeo = new THREE.SphereGeometry(0.35, 32, 32);
        var pos = blobGeo.attributes.position;
        for (var i = 0; i < pos.count; i++) {
            var x = pos.getX(i);
            var y = pos.getY(i);
            var z = pos.getZ(i);
            var yNorm = (y + 0.35) / 0.7; // 0 at bottom, 1 at top
            // Fatter on bottom, slightly squished on top
            var scaleFactor = 1.4 - Math.pow(yNorm, 1.5) * 0.7;
            // Slug protrusion at the back
            var tailAmount = 0;
            if (z < 0) {
                var zBlend = -z / 0.35;
                tailAmount = Math.pow(1 - yNorm, 2) * 0.6 * zBlend;
            }
            x *= scaleFactor;
            z = (z * scaleFactor) - tailAmount;
            pos.setXYZ(i, x, y, z);
        }
        blobGeo.computeVertexNormals();

        // EXACT material from Blob Character.js
        var blobMat = new THREE.MeshPhysicalMaterial({
            color: 0x059669, emissive: 0x064e3b, emissiveIntensity: 0.1,
            roughness: 0.2, metalness: 0.4,
            transparent: true, opacity: 0.4,
            clearcoat: 1.0, clearcoatRoughness: 0.1,
            depthWrite: true
        });
        var blobMesh = new THREE.Mesh(blobGeo, blobMat);
        blobMesh.position.y = 0.35;
        blobMesh.castShadow = false; blobMesh.receiveShadow = false;

        // EXACT eyes from Blob Character.js
        var eyeGeo = new THREE.SphereGeometry(0.06, 16, 16);
        var eyeMat = new THREE.MeshBasicMaterial({ color: 0x0fffc2 });
        var pupilGeo = new THREE.SphereGeometry(0.03, 16, 16);
        var pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

        var leftEye = new THREE.Group();
        leftEye.add(new THREE.Mesh(eyeGeo, eyeMat));
        var lePupil = new THREE.Mesh(pupilGeo, pupilMat);
        lePupil.position.z = 0.04;
        leftEye.add(lePupil);
        leftEye.position.set(-0.14, 0.15, 0.3);
        blobMesh.add(leftEye);

        var rightEye = new THREE.Group();
        rightEye.add(new THREE.Mesh(eyeGeo, eyeMat));
        var rePupil = new THREE.Mesh(pupilGeo, pupilMat);
        rePupil.position.z = 0.04;
        rightEye.add(rePupil);
        rightEye.position.set(0.14, 0.15, 0.3);
        blobMesh.add(rightEye);

        group.add(blobMesh);
        group.userData.blob = blobMesh;
        group.userData.leftEye = leftEye;
        group.userData.rightEye = rightEye;

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
            if (k === 'goop' && p.model.userData.blob) {
                var breath = Math.sin(t * 3.5) * 0.06;
                p.model.userData.blob.scale.set(1 - breath * 0.5, 1 + breath, 1 - breath * 0.5);
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

    var floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    var grid = new THREE.GridHelper(100, 50, 0x000000, 0x000000);
    grid.material.opacity = 0.15; grid.material.transparent = true; scene.add(grid);

    function addBlock(x, y, z, w, h, d, color) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color }));
        m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
    addBlock(5, 0, -8, 2, 3, 2, 0x8b4513);
    addBlock(-10, 0, 5, 3, 1.5, 3, 0x556b2f);
    addBlock(12, 0, 12, 1.5, 4, 1.5, 0x708090);
    addBlock(-7, 0, -12, 4, 2, 2, 0xa0522d);
    addBlock(0, 0, 15, 2, 5, 2, 0x4682b4);

    // Pointer Lock
    var PI_2 = Math.PI / 2;
    document.addEventListener('pointerlockchange', function () {
        isLocked = (document.pointerLockElement === renderer.domElement);
        crosshair.style.display = isLocked ? 'block' : 'none';
        if (!isLocked && isPlaying) chatInput.focus();
    });
    document.addEventListener('mousemove', function (e) {
        if (!isLocked || !myCharacter) return;
        state.camYaw -= (e.movementX || 0) * 0.003;
        state.camPitch += (e.movementY || 0) * 0.003;
        state.camPitch = Math.max(-1.0, Math.min(1.2, state.camPitch));
    });

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

    // Keys
    document.addEventListener('keydown', function (e) {
        if (document.activeElement === chatInput || !isPlaying) return;
        keys[e.code] = true;
        if (e.code === 'Space' && state.jumpTime < 0) state.jumpTime = 0;
        if (e.code === 'KeyX' && !e.repeat) state.camSide *= -1;
    });
    document.addEventListener('keyup', function (e) {
        keys[e.code] = false;
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
        var el = document.createElement('div'); el.style.marginBottom = '5px';
        var hex = '#' + color.toString(16).padStart(6, '0');
        el.innerHTML = '<strong style="color:' + hex + '">' + username + ':</strong> ' + message;
        chatMessages.appendChild(el); chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Socket Events
    socket.on('init', function (data) {
        myId = data.id;
        loginPanel.style.display = 'none'; chatBox.style.display = 'flex'; isPlaying = true;
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
            players[d.id].jumpTime = d.jumpTime;
            players[d.id].localVx = d.localVx;
            players[d.id].localVz = d.localVz;
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
        players[id] = { mesh: mesh, nametag: tag, targetPos: new THREE.Vector3(data.x, data.y, data.z), targetRy: data.ry || 0, userData: data, charType: charType };
    }

    function animateCharacter(mesh, charType, isMoving, isSprinting, jumpTime, t, delta, speedStr) {
        if (charType === 'goop' && mesh.userData.blob) {
            var blob = mesh.userData.blob;
            var stretchMod = speedStr * 0.4;
            var targetScaleZ = (1 + stretchMod);
            var targetScaleX = (1 / Math.sqrt(1 + stretchMod));
            var targetScaleY = (1 / Math.sqrt(1 + stretchMod));
            var breathCycle = t * 3.5;
            var breathY = Math.sin(breathCycle) * 0.06;
            var breathXZ = -Math.sin(breathCycle) * 0.03;
            targetScaleY += breathY;
            targetScaleX += breathXZ;
            targetScaleZ += breathXZ;
            
            if (!blob.userData.bp) blob.userData.bp = { scaleX:1, scaleY:1, scaleZ:1, scaleVX:0, scaleVY:0, scaleVZ:0, spring:0.1, damp:0.8 };
            var bp = blob.userData.bp;
            bp.scaleVX += (targetScaleX - bp.scaleX) * bp.spring;
            bp.scaleVY += (targetScaleY - bp.scaleY) * bp.spring;
            bp.scaleVZ += (targetScaleZ - bp.scaleZ) * bp.spring;
            bp.scaleVX *= bp.damp; bp.scaleVY *= bp.damp; bp.scaleVZ *= bp.damp;
            bp.scaleX += bp.scaleVX; bp.scaleY += bp.scaleVY; bp.scaleZ += bp.scaleVZ;
            blob.scale.set(bp.scaleX, bp.scaleY, bp.scaleZ);

            if (speedStr > 0.05) {
                blob.rotation.z = Math.sin(t * 15) * speedStr * 0.05;
                blob.rotation.x = Math.cos(t * 12) * speedStr * 0.05;
                if (mesh.userData.leftEye) mesh.userData.leftEye.position.z = 0.3 + Math.min(speedStr * 0.2, 0.5) * 0.175;
                if (mesh.userData.rightEye) mesh.userData.rightEye.position.z = 0.3 + Math.min(speedStr * 0.2, 0.5) * 0.175;
            }
        } else if (charType === 'modular' && mesh.userData.bp) {
            // Use direct refs stored at build time (like Unified Workspace bodyParts.*)
            var bp = mesh.userData.bp;
            var pelvis = bp.pelvis, torso = bp.torso, head = bp.head;
            var legL = bp.legL, legR = bp.legR, armL = bp.armL, armR = bp.armR;

            // --- EXACT resetPose from Unified Workspace ---
            pelvis.position.y = 0.9;
            pelvis.position.z = 0;
            torso.rotation.x = 0; torso.rotation.y = 0; torso.scale.y = 1.0;
            if (head) { head.rotation.x = 0; head.rotation.y = 0; }
            legL.rotation.x = 0; legR.rotation.x = 0;
            legL.calf.rotation.x = 0; legR.calf.rotation.x = 0;
            legL.foot.rotation.x = 0; legR.foot.rotation.x = 0;
            armL.rotation.x = 0; armL.rotation.z = 0;
            armR.rotation.x = 0; armR.rotation.z = 0;

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

            // --- EXACT jump from Unified Workspace (line 2572-2580) ---
            if (state.jumpTime >= 0) {
                state.jumpTime += delta * 2.5;
                var jumpH = Math.sin(Math.min(state.jumpTime, 1) * Math.PI) * 1.3;
                myCharacter.position.y = (state.baseY || 0) + Math.max(0, jumpH);
                if (state.jumpTime >= 1.0) state.jumpTime = -1;
            } else {
                myCharacter.position.y = state.baseY;
            }

            animateCharacter(myCharacter, selectedChar, isMoving, isSprinting, state.jumpTime, t, delta, Math.hypot(localVx, localVz));

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

            socket.emit('playerMovement', { x: myCharacter.position.x, y: myCharacter.position.y, z: myCharacter.position.z, ry: myCharacter.rotation.y, isMoving: isMoving, isSprinting: isSprinting, jumpTime: state.jumpTime, localVx: localVx, localVz: localVz });
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

            animateCharacter(p.mesh, p.charType, p.isMoving, p.isSprinting, p.jumpTime || -1, t, delta, Math.hypot(p.localVx || 0, p.localVz || 0));

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
