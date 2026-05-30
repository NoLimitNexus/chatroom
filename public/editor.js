// ============================================================
// STEAM CHATROOM - WORLD EDITOR (God Mode Observer)
// ============================================================
// WASD fly, follow-player camera, full object palette,
// live player rendering with animation & nametags

// Connect to the SAME server the editor is served from (relative connection).
// If opened from localhost:3000/editor.html, it connects to localhost:3000.
// If opened from chatroom.nolimitnexus.com/editor.html, it connects to prod.
const socket = io({ transports: ['websocket', 'polling'] });
socket.on('connect', () => console.log('Editor connected to:', window.location.origin));
socket.on('connect_error', (err) => console.warn('Editor socket error:', err.message));

// ============================================================
// SCENE SETUP
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.FogExp2(0x87ceeb, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Orbit controls (default mode)
const orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.maxPolarAngle = Math.PI * 0.48;
orbitControls.minDistance = 1;
orbitControls.maxDistance = 200;

// Transform Controls
const transformControl = new THREE.TransformControls(camera, renderer.domElement);
transformControl.addEventListener('dragging-changed', function(event) {
    orbitControls.enabled = !event.value;
    if (!event.value) saveMap();
});
scene.add(transformControl);

// Shared Environment (terrain, water, sky, clouds)
if (window.setupSharedEnvironment) {
    window.setupSharedEnvironment(scene, renderer, camera);
    // Init ripple simulation for smooth water (same as game client)
    if (window.RippleWater && window.sharedWater) {
        window.RippleWater.init(renderer, window.sharedWater);
    }
}

// ============================================================
// STATE
// ============================================================
let environmentObjects = [];
let droppedItems = [];
let updatables = [];
let selectedObject = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const livePlayers = {};

// ============================================================
// TERRAIN EDITOR STATE & SETUP
// ============================================================
let terrainOffsets = {};
let floorMesh = null;
let terrainMode = false;
let terrainBrushMode = 'raise';
let terrainBrushSize = 10;
let terrainBrushStrength = 0.5;
let isPaintingTerrain = false;

// Brush mesh
const brushGeo = new THREE.RingGeometry(0, 10, 32);
const brushMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
const terrainBrush = new THREE.Mesh(brushGeo, brushMat);
terrainBrush.rotation.x = -Math.PI / 2;
terrainBrush.visible = false;
scene.add(terrainBrush);

// Find floor mesh
setTimeout(() => {
    scene.traverse(child => {
        if (child.isMesh && child.geometry && child.geometry.type === 'PlaneGeometry' && child.geometry.parameters.width === 500) {
            floorMesh = child;
        }
    });
}, 100);

// Setup terrain override
if (window.getSharedTerrainHeight) {
    const baseHeight = window.getSharedTerrainHeight;
    window.getSharedTerrainHeight = function(x, z) {
        let h = baseHeight(x, z);
        const rx = Math.round(x);
        const rz = Math.round(z);
        const key = `${rx},${rz}`;
        if (terrainOffsets[key]) h += terrainOffsets[key];
        return h;
    };
}

function applyTerrainOffsetsToFloor() {
    if (!floorMesh) return;
    const pos = floorMesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        // Plane geometry +Y maps to world -Z
        const z = window.getSharedTerrainHeight(x, -y);
        pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    floorMesh.geometry.computeVertexNormals();
}

// Camera mode: 'free' | 'follow'
let cameraMode = 'free';
let followTargetId = null;
let followDistance = 8;

// Keyboard state for WASD
const editorKeys = {};
const chatInput = document.getElementById('editor-chat-input');

// ============================================================
// OBJECT PALETTE + CLICK-TO-PLACE
// ============================================================
let placementMode = null; // null or type string
let placementGhost = null; // preview mesh

(function buildPalette() {
    const palette = document.getElementById('obj-palette');
    if (!window.ObjectFactory || !window.ObjectFactory.types) return;
    const types = window.ObjectFactory.types;
    for (const typeName in types) {
        const info = types[typeName];
        const btn = document.createElement('div');
        btn.className = 'obj-btn';
        btn.dataset.type = typeName;
        btn.innerHTML = `<span class="obj-icon">${info.icon}</span><span class="obj-label">${typeName}</span>`;
        btn.onclick = () => enterPlacementMode(typeName);
        palette.appendChild(btn);
    }
})();

function enterPlacementMode(type) {
    cancelPlacementMode();
    placementMode = type;
    // Highlight active palette button
    document.querySelectorAll('.obj-btn').forEach(b => b.style.borderColor = b.dataset.type === type ? '#3b82f6' : 'rgba(255,255,255,0.08)');
    renderer.domElement.style.cursor = 'crosshair';
    showNotification('Click on terrain to place ' + type + ' (Esc to cancel)');
    // Create ghost preview
    const factory = window.ObjectFactory.create(type);
    if (factory) {
        placementGhost = factory.group;
        placementGhost.traverse(c => { if (c.material) { c.material = c.material.clone(); c.material.transparent = true; c.material.opacity = 0.4; }});
        scene.add(placementGhost);
    }
}

function cancelPlacementMode() {
    placementMode = null;
    if (placementGhost) { scene.remove(placementGhost); placementGhost = null; }
    document.querySelectorAll('.obj-btn').forEach(b => b.style.borderColor = 'rgba(255,255,255,0.08)');
    renderer.domElement.style.cursor = 'default';
}

// Water surface level constant — fishing spots snap here
const WATER_LEVEL = -1.2;

// Update ghost position on mouse move
window.addEventListener('pointermove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    if (terrainMode && floorMesh) {
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(floorMesh);
        if (intersects.length > 0) {
            terrainBrush.visible = true;
            terrainBrush.position.copy(intersects[0].point);
            terrainBrush.position.y = window.getSharedTerrainHeight(terrainBrush.position.x, terrainBrush.position.z) + 0.1;
            if (isPaintingTerrain) paintTerrain();
        } else {
            terrainBrush.visible = false;
        }
        return;
    }

    if (!placementMode || !placementGhost) return;
    raycaster.setFromCamera(mouse, camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, hitPoint);
    if (hitPoint) {
        if (placementMode === 'FishingSpot' || placementMode === 'Boat') {
            // Water-only objects sit on the water surface
            hitPoint.y = WATER_LEVEL;
            // Tint ghost red/green based on whether it's actually over water
            if (window.getSharedTerrainHeight) {
                const terrainH = window.getSharedTerrainHeight(hitPoint.x, hitPoint.z);
                const overWater = terrainH < WATER_LEVEL + 0.2;
                placementGhost.traverse(c => { if (c.material && c.material.emissive) c.material.emissive.setHex(overWater ? 0x004400 : 0x440000); });
            }
        } else if (window.getSharedTerrainHeight) {
            hitPoint.y = window.getSharedTerrainHeight(hitPoint.x, hitPoint.z);
        }
        placementGhost.position.copy(hitPoint);
    }
});

window.addEventListener('pointerup', () => {
    if (terrainMode && isPaintingTerrain) {
        isPaintingTerrain = false;
        orbitControls.enabled = true;
    }
});

function placeObjectAtClick(event) {
    if (!placementMode) return false;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, hitPoint);
    if (hitPoint) {
        if (placementMode === 'FishingSpot' || placementMode === 'Boat') {
            // Validate: must be placed over water
            if (window.getSharedTerrainHeight) {
                const terrainH = window.getSharedTerrainHeight(hitPoint.x, hitPoint.z);
                if (terrainH >= WATER_LEVEL + 0.2) {
                    showNotification('⚠️ ' + placementMode + ' can only be placed on water!');
                    cancelPlacementMode();
                    return true;
                }
            }
            hitPoint.y = WATER_LEVEL;
        } else if (window.getSharedTerrainHeight) {
            hitPoint.y = window.getSharedTerrainHeight(hitPoint.x, hitPoint.z);
        }
        instantiateObject({
            type: placementMode,
            position: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 }
        });
        const newObj = environmentObjects[environmentObjects.length - 1];
        selectObject(newObj);
        updateObjectList();
        saveMap();
    }
    cancelPlacementMode();
    return true;
}

// ============================================================
// LOAD INITIAL MAP (loads from local dev server — save pushes to both)
// ============================================================
fetch('/api/map')
    .then(res => res.json())
    .then(data => {
        if (data && data.terrainOffsets) {
            terrainOffsets = data.terrainOffsets;
            setTimeout(applyTerrainOffsetsToFloor, 500); // Give shared floor time to create
        }
        if (data && data.objects) {
            data.objects.forEach(objData => instantiateObject(objData));
            updateObjectList();
            console.log(`Loaded ${data.objects.length} objects from map`);
        }
    })
    .catch(err => console.error("Error loading map:", err));

function instantiateObject(data) {
    let mesh;
    let updatable = null;

    if (window.ObjectFactory) {
        const factoryObj = window.ObjectFactory.create(data.type, data.config);
        if (factoryObj) {
            mesh = new THREE.Group();
            mesh.userData.isEnvironmentObject = true;
            mesh.userData.type = data.type;
            mesh.add(factoryObj.group);

            if (factoryObj.updatable) {
                updatable = factoryObj.updatable;
                mesh.userData.updatable = factoryObj.updatable;
            }

            // Hit box for raycasting
            const hitGeo = new THREE.CylinderGeometry(1, 1, 3, 8);
            const hitMat = new THREE.MeshBasicMaterial({ visible: false });
            const hitBox = new THREE.Mesh(hitGeo, hitMat);
            hitBox.position.y = 1.5;
            mesh.add(hitBox);
            mesh.userData.hitBox = hitBox;

            // BoxHelper for selection
            const boxHelper = new THREE.BoxHelper(mesh, 0xffff00);
            boxHelper.visible = false;
            mesh.add(boxHelper);
            mesh.userData.boxHelper = boxHelper;
        }
    }

    if (mesh) {
        mesh.position.set(data.position.x, data.position.y, data.position.z);
        mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
        mesh.userData.id = data.id || 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        mesh.userData.tags = data.tags || [];
        mesh.userData.name = data.name || '';
        scene.add(mesh);
        environmentObjects.push(mesh);
        if (updatable) updatables.push(updatable);
    }
}

// ============================================================
// MAP SAVE — pushes to local + production
// ============================================================
const PROD_URL = 'https://chatroom.nolimitnexus.com';

function saveMap() {
    const mapData = {
        terrainOffsets,
        objects: environmentObjects.map(obj => {
            const isBoat = obj.userData.type === 'Boat';
            return {
                id: obj.userData.id,
                type: obj.userData.type,
                name: obj.userData.name || '',
                tags: obj.userData.tags || [],
                position: { 
                    x: obj.position.x, 
                    y: isBoat ? -1.2 : obj.position.y, 
                    z: obj.position.z 
                },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
            };
        })
    };
    const body = JSON.stringify(mapData);
    const headers = { 'Content-Type': 'application/json' };

    // Save to whichever server this editor is served from
    const localSave = fetch('/api/map', { method: 'POST', headers, body })
        .then(() => 'local')
        .catch(() => null);

    // Save to production NAS
    const prodSave = fetch(PROD_URL + '/api/map', { method: 'POST', headers, body })
        .then(() => 'live')
        .catch(() => null);

    Promise.all([localSave, prodSave]).then(results => {
        const saved = results.filter(Boolean);
        if (saved.length === 2) {
            showNotification('✅ Saved to Local + Live!');
        } else if (saved.length === 1) {
            showNotification('⚠️ Saved to ' + saved[0] + ' only');
        } else {
            showNotification('❌ Save failed!');
        }
    });
}

function showNotification(msg) {
    const notif = document.getElementById('notification');
    notif.innerText = msg;
    notif.style.opacity = 1;
    setTimeout(() => { notif.style.opacity = 0; }, 2500);
}

// ============================================================
// RAYCASTING FOR SELECTION
// ============================================================
window.addEventListener('pointerdown', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT' ||
        event.target.closest('#ui-layer') || event.target.closest('#editor-chat') ||
        event.target.closest('.obj-btn') || transformControl.dragging) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (terrainMode) {
        if (event.button === 0) {
            isPaintingTerrain = true;
            paintTerrain();
            orbitControls.enabled = false;
        }
        return;
    }

    // If in placement mode, place the object and return
    if (placementMode) { placeObjectAtClick(event); return; }

    raycaster.setFromCamera(mouse, camera);

    const testMeshes = [];
    environmentObjects.forEach(obj => {
        if (obj.userData.hitBox) testMeshes.push(obj.userData.hitBox);
        else testMeshes.push(obj);
    });

    const intersects = raycaster.intersectObjects(testMeshes, true);
    if (intersects.length > 0) {
        let selected = intersects[0].object;
        while (selected.parent && !environmentObjects.includes(selected)) selected = selected.parent;
        if (environmentObjects.includes(selected)) selectObject(selected);
    } else {
        selectObject(null);
    }
});

function selectObject(obj) {
    if (selectedObject && selectedObject.userData.boxHelper) selectedObject.userData.boxHelper.visible = false;
    selectedObject = obj;
    if (obj) {
        if (obj.userData.boxHelper) obj.userData.boxHelper.visible = true;
        transformControl.attach(obj);
    } else {
        transformControl.detach();
    }
    updateObjectList();
}

// ============================================================
// UI — Transform modes
// ============================================================
document.getElementById('btn-translate').addEventListener('click', (e) => {
    transformControl.setMode('translate');
    document.querySelectorAll('.transform-modes .btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
});
document.getElementById('btn-rotate').addEventListener('click', (e) => {
    transformControl.setMode('rotate');
    document.querySelectorAll('.transform-modes .btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
});
document.getElementById('btn-scale').addEventListener('click', (e) => {
    transformControl.setMode('scale');
    document.querySelectorAll('.transform-modes .btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
});

// ============================================================
// UI — Actions
// ============================================================
document.getElementById('btn-delete').addEventListener('click', () => {
    if (!selectedObject) return;
    scene.remove(selectedObject);
    transformControl.detach();
    environmentObjects = environmentObjects.filter(o => o !== selectedObject);
    if (selectedObject.userData.updatable) updatables = updatables.filter(u => u !== selectedObject.userData.updatable);
    selectedObject = null;
    updateObjectList();
    saveMap();
});

document.getElementById('btn-snap-ground').addEventListener('click', () => {
    if (!selectedObject) return;
    selectedObject.position.y = window.getSharedTerrainHeight
        ? window.getSharedTerrainHeight(selectedObject.position.x, selectedObject.position.z) : 0;
    saveMap();
});

document.getElementById('btn-duplicate').addEventListener('click', () => {
    if (!selectedObject) return;
    instantiateObject({
        type: selectedObject.userData.type,
        position: {
            x: selectedObject.position.x + 1.5,
            y: selectedObject.position.y,
            z: selectedObject.position.z + 1.5
        },
        rotation: { x: selectedObject.rotation.x, y: selectedObject.rotation.y, z: selectedObject.rotation.z },
        scale: { x: selectedObject.scale.x, y: selectedObject.scale.y, z: selectedObject.scale.z }
    });
    const dup = environmentObjects[environmentObjects.length - 1];
    selectObject(dup);
    updateObjectList();
    saveMap();
});

document.getElementById('btn-save').addEventListener('click', saveMap);

document.getElementById('btn-sync').addEventListener('click', () => {
    fetch('/api/sync-from-prod')
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                alert(`Successfully synced ${data.objects} objects from Production. The page will now reload to apply changes.`);
                window.location.reload();
            }
        })
        .catch(err => {
            console.error('Error syncing from prod:', err);
            alert('Failed to sync from production.');
        });
});

// ============================================================
// UI — Camera modes
// ============================================================
document.getElementById('cam-free').addEventListener('click', () => setCameraMode('free'));
document.getElementById('cam-follow').addEventListener('click', () => {
    // If players online, follow first one; otherwise stay free
    const ids = Object.keys(livePlayers);
    if (ids.length > 0) {
        startFollowing(ids[0]);
    } else {
        showNotification("No players to follow");
    }
});
document.getElementById('follow-stop').addEventListener('click', () => setCameraMode('free'));

function setCameraMode(mode) {
    cameraMode = mode;
    followTargetId = null;
    document.getElementById('cam-free').classList.toggle('active', mode === 'free');
    document.getElementById('cam-follow').classList.toggle('active', mode === 'follow');
    document.getElementById('follow-banner').style.display = mode === 'follow' ? 'block' : 'none';
    updatePlayerList();
}

function startFollowing(playerId) {
    if (!livePlayers[playerId]) return;
    cameraMode = 'follow';
    followTargetId = playerId;
    document.getElementById('cam-free').classList.remove('active');
    document.getElementById('cam-follow').classList.add('active');
    document.getElementById('follow-banner').style.display = 'block';
    document.getElementById('follow-name').textContent = livePlayers[playerId].username;
    // Set initial camera offset
    const p = livePlayers[playerId].mesh.position;
    orbitControls.target.copy(p);
    updatePlayerList();
}

// ============================================================
// KEYBOARD — WASD fly & shortcuts
// ============================================================
window.addEventListener('keydown', (e) => {
    if (document.activeElement === chatInput) return;
    editorKeys[e.code] = true;

    switch (e.key) {
        case 'Shift':
            transformControl.setTranslationSnap(1);
            transformControl.setRotationSnap(THREE.MathUtils.degToRad(15));
            transformControl.setScaleSnap(0.25);
            break;
        case 'Delete':
            document.getElementById('btn-delete').click();
            break;
        case 'Escape':
            if (placementMode) cancelPlacementMode();
            else if (cameraMode === 'follow') setCameraMode('free');
            else selectObject(null);
            break;
    }
});

window.addEventListener('keyup', (e) => {
    editorKeys[e.code] = false;
    if (e.key === 'Shift') {
        transformControl.setTranslationSnap(null);
        transformControl.setRotationSnap(null);
        transformControl.setScaleSnap(null);
    }
});

// Zoom scroll when in follow mode — adjusts follow distance
renderer.domElement.addEventListener('wheel', (e) => {
    if (cameraMode === 'follow') {
        followDistance = Math.max(2, Math.min(50, followDistance + e.deltaY * 0.01));
    }
});

// ============================================================
// UPDATE LISTS
// ============================================================
function updateObjectList() {
    const list = document.getElementById('object-list');
    const count = document.getElementById('obj-count');
    count.textContent = environmentObjects.length;
    list.innerHTML = '';
    environmentObjects.forEach((obj, idx) => {
        const div = document.createElement('div');
        div.className = 'object-item' + (obj === selectedObject ? ' selected' : '');
        const icon = (window.ObjectFactory && window.ObjectFactory.types[obj.userData.type])
            ? window.ObjectFactory.types[obj.userData.type].icon + ' ' : '';
        const label = obj.userData.name || (obj.userData.type + ' ' + (idx + 1));
        const tagStr = (obj.userData.tags && obj.userData.tags.length) ? ' [' + obj.userData.tags.join(', ') + ']' : '';
        div.innerHTML = `<span>${icon}${label}</span><span style="color:#475569;font-size:0.6rem;">${tagStr}</span>`;
        div.onclick = () => {
            selectObject(obj);
            orbitControls.target.copy(obj.position);
            showPropertiesPanel(obj);
        };
        list.appendChild(div);
    });
}

// ============================================================
// PROPERTIES PANEL — Name + Tags editor for selected object
// ============================================================
function showPropertiesPanel(obj) {
    let panel = document.getElementById('props-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'props-panel';
        panel.style.cssText = 'margin-top:10px; background:rgba(0,0,0,0.3); border-radius:6px; padding:8px; font-size:0.78rem;';
        document.getElementById('object-list').parentNode.insertBefore(panel, document.getElementById('object-list').nextSibling);
    }
    if (!obj) { panel.innerHTML = ''; return; }

    const cat = (window.ObjectFactory && window.ObjectFactory.types[obj.userData.type])
        ? window.ObjectFactory.types[obj.userData.type].category : 'Unknown';

    panel.innerHTML = `
        <div style="color:#94a3b8;font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Selected: ${obj.userData.type} <span style="color:#3b82f6;">[${cat}]</span></div>
        <div style="margin-bottom:4px;"><label style="color:#64748b;font-size:0.65rem;">NAME</label>
            <input id="prop-name" type="text" value="${obj.userData.name || ''}" placeholder="e.g. Main Campfire" style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:4px 6px;border-radius:4px;font-size:0.75rem;outline:none;margin-top:2px;"></div>
        <div style="margin-bottom:4px;"><label style="color:#64748b;font-size:0.65rem;">TAGS (comma separated)</label>
            <input id="prop-tags" type="text" value="${(obj.userData.tags || []).join(', ')}" placeholder="e.g. spawn, north, fishing" style="width:100%;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);color:#fff;padding:4px 6px;border-radius:4px;font-size:0.75rem;outline:none;margin-top:2px;"></div>
        <div style="color:#475569;font-size:0.6rem;">ID: ${obj.userData.id}</div>
        <div style="color:#475569;font-size:0.6rem;">Pos: <span id="prop-pos-val">${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${obj.position.z.toFixed(1)}</span></div>
    `;

    document.getElementById('prop-name').addEventListener('change', function() {
        obj.userData.name = this.value.trim();
        updateObjectList();
        saveMap();
    });
    document.getElementById('prop-tags').addEventListener('change', function() {
        obj.userData.tags = this.value.split(',').map(t => t.trim()).filter(t => t);
        updateObjectList();
        saveMap();
    });
}

function updatePlayerList() {
    const list = document.getElementById('player-list');
    const count = document.getElementById('player-count');
    const playerIds = Object.keys(livePlayers);
    count.textContent = playerIds.length;

    if (playerIds.length === 0) {
        list.innerHTML = '<div style="color:#475569;font-style:italic;font-size:0.75rem;">No players online</div>';
        return;
    }

    list.innerHTML = '';
    playerIds.forEach(id => {
        const p = livePlayers[id];
        const isTracking = (cameraMode === 'follow' && followTargetId === id);
        const div = document.createElement('div');
        div.className = 'player-entry' + (isTracking ? ' tracking' : '');
        div.innerHTML = `<span class="player-dot"></span>
            <span style="flex:1">${p.username}</span>
            <span style="color:#475569;font-size:0.65rem;">${p.charType}</span>`;
        div.onclick = () => startFollowing(id);
        list.appendChild(div);
    });
}

// ============================================================
// LIVE PLAYER RENDERING
// ============================================================
function createLivePlayer(id, data) {
    const charType = data.charType || 'modular';
    let mesh;

    console.log(`[Editor] Creating player "${data.username}" id=${id} charType=${charType}`);
    console.log(`[Editor] Build functions: buildModularMan=${!!window.buildModularMan}, buildGoop=${!!window.buildGoop}, buildGoopMan=${!!window.buildGoopMan}, animateCharacter=${!!window.animateCharacter}`);

    if (charType === 'goop' && window.buildGoop) {
        mesh = window.buildGoop();
        console.log('[Editor] Built GOOP character');
    } else if (charType === 'goop-man' && window.buildGoopMan) {
        mesh = window.buildGoopMan();
        console.log('[Editor] Built GOOP-MAN character');
    } else if (window.buildModularMan) {
        mesh = window.buildModularMan();
        console.log('[Editor] Built MODULAR MAN character');
    } else {
        console.warn('[Editor] FALLBACK: No build functions available! Using placeholder box.');
        const geo = new THREE.BoxGeometry(0.5, 1.5, 0.5);
        const mat = new THREE.MeshStandardMaterial({ color: data.color || 0x3b82f6 });
        mesh = new THREE.Mesh(geo, mat);
        mesh.geometry.translate(0, 0.75, 0);
    }

    mesh.position.set(data.x || 0, data.y || 0, data.z || 0);
    scene.add(mesh);

    // Nametag
    const nametag = document.createElement('div');
    nametag.textContent = data.username || 'Unknown';
    nametag.style.cssText = 'position:absolute;color:#fff;background:rgba(0,0,0,.7);padding:2px 8px;border-radius:4px;pointer-events:none;font:600 10px Inter,sans-serif;transform:translate(-50%,-50%);white-space:nowrap;border:1px solid rgba(59,130,246,0.3);z-index:10;';
    document.body.appendChild(nametag);

    livePlayers[id] = {
        mesh, nametag, charType,
        targetPos: new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0),
        targetRy: data.ry || 0,
        isMoving: false, isSprinting: false, isCrouching: false,
        jumpTime: -1, localVx: 0, localVz: 0,
        username: data.username || 'Unknown',
        userData: { 
            inventory: 0, 
            camPitch: data.camPitch || 0, 
            camYaw: data.camYaw || 0,
            shootTime: 0, 
            useFBX: false,
            isFishing: data.isFishing || false,
            isCooking: data.isCooking || false,
            fishingTarget: data.fishingTarget || null
        }
    };
    updatePlayerList();
    return livePlayers[id];
}

function removeLivePlayer(id) {
    if (!livePlayers[id]) return;
    if (window.ObjectFactory) window.ObjectFactory.detachFishingRodFromPlayer(livePlayers[id].mesh, scene);
    scene.remove(livePlayers[id].mesh);
    livePlayers[id].mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
            else child.material.dispose();
        }
    });
    if (livePlayers[id].nametag && livePlayers[id].nametag.parentNode) livePlayers[id].nametag.remove();
    // If we were following this player, go back to free
    if (followTargetId === id) setCameraMode('free');
    delete livePlayers[id];
    updatePlayerList();
}

// ============================================================
// SOCKET.IO — Observer Events
// ============================================================
socket.emit('editorRequestPlayers');

socket.on('editorPlayerSnapshot', function(allPlayers) {
    for (const id in allPlayers) {
        if (!livePlayers[id]) createLivePlayer(id, allPlayers[id]);
    }
    addEditorChat('System', 'Editor connected — observing ' + Object.keys(allPlayers).length + ' player(s)', '#3b82f6');
});

socket.on('playerJoined', function(data) {
    if (!livePlayers[data.id]) {
        createLivePlayer(data.id, data);
        addEditorChat('System', data.username + ' joined the game', '#10b981');
    }
});

socket.on('disconnect', function() {
    console.log('Disconnected from server. Waiting for reconnect...');
    socket.once('connect', function() {
        console.log('Reconnected! Reloading page to fetch latest updates...');
        window.location.reload(true);
    });
});

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
    scene.add(pickupGroup);
    droppedItems.push(pickupGroup);
}

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
        scene.remove(droppedItems[idx]);
        droppedItems.splice(idx, 1);
    }
});


socket.on('playerMoved', function(d) {
    if (!livePlayers[d.id]) return;
    const p = livePlayers[d.id];
    p.targetPos.set(d.x, d.y, d.z);
    p.targetRy = d.ry;
    p.isMoving = d.isMoving;
    p.isSprinting = d.isSprinting;
    p.isCrouching = d.isCrouching;
    p.jumpTime = d.jumpTime;
    p.localVx = d.localVx;
    p.localVz = d.localVz;
    p.userData.inventory = d.inventory;
    p.userData.camPitch = d.camPitch;
    p.userData.isFishing = d.isFishing;
    p.userData.isCooking = d.isCooking;
    p.userData.fishingTarget = d.fishingTarget;
    p.userData.camYaw = d.camYaw;
});

socket.on('boatMoved', function (d) {
    console.log("[Editor] Received boatMoved event:", d);
    let found = false;
    for (let i = 0; i < environmentObjects.length; i++) {
        if (environmentObjects[i].userData.id === d.id && environmentObjects[i].userData.type === 'Boat') {
            console.log("[Editor] Found matching boat, updating position:", d.x, d.y, d.z);
            environmentObjects[i].position.set(d.x, d.y, d.z);
            environmentObjects[i].rotation.y = d.ry;
            
            // If the moved boat is currently selected, update selection helper and coordinate display
            if (selectedObject === environmentObjects[i]) {
                if (selectedObject.userData.boxHelper) {
                    selectedObject.userData.boxHelper.update();
                }
                const posEl = document.getElementById('prop-pos-val');
                if (posEl) {
                    posEl.textContent = `${d.x.toFixed(1)}, ${d.y.toFixed(1)}, ${d.z.toFixed(1)}`;
                }
            }
            found = true;
            break;
        }
    }
    if (!found) {
        const boatIds = environmentObjects
            .filter(o => o.userData.type === 'Boat')
            .map(o => o.userData.id);
        console.warn(`[Editor] Boat with ID "${d.id}" not found in editor! Existing boat IDs:`, boatIds);
    }
});

socket.on('playerLeft', function(id) {
    if (livePlayers[id]) {
        addEditorChat('System', livePlayers[id].username + ' left the game', '#ef4444');
        removeLivePlayer(id);
    }
});

socket.on('playerCaughtFish', function (data) {
    if (!livePlayers[data.id]) return; // Skip if we don't know this player
    
    // Ensure ObjectFactory is loaded and ready
    if (typeof window.ObjectFactory === 'undefined' || typeof window.ObjectFactory.create3DFish !== 'function') return;

    const spotPos = new THREE.Vector3(data.spotPos.x, data.spotPos.y, data.spotPos.z);
    const playerPos = new THREE.Vector3(data.playerPos.x, data.playerPos.y, data.playerPos.z);
    
    // Create 3D fish mesh
    const fishMesh = window.ObjectFactory.create3DFish(data.color);
    scene.add(fishMesh);
    
    // Add to activeJumpingFish to be animated
    activeJumpingFish.push({
        mesh: fishMesh,
        startPos: spotPos,
        endPos: playerPos,
        elapsed: 0,
        duration: 1.2
    });
});

// ---- SHOOTING VISUALS IN EDITOR ----
const editorTracers = [];
const activeJumpingFish = [];

function editorShootGun(playerObj, shootData) {
    if (!playerObj || !playerObj.mesh) return;
    const mesh = playerObj.mesh;
    const bp = mesh.userData.bp;
    const inv = shootData.inventory !== undefined ? shootData.inventory : 0;

    // Set shootTime for recoil animation
    playerObj.userData.shootTime = 0.15;

    if (inv !== 1) return; // Only spawn bullets for guns

    // Muzzle flash
    const flashGeo = new THREE.PlaneGeometry(0.4, 0.4);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const flash1 = new THREE.Mesh(flashGeo, flashMat);
    const flash2 = new THREE.Mesh(flashGeo, flashMat);
    flash2.rotation.y = Math.PI / 2;
    const flash = new THREE.Group();
    flash.add(flash1); flash.add(flash2);
    
    const gunObj = (bp && bp.gun) ? bp.gun : (mesh.userData.gun ? mesh.userData.gun : null);
    if (gunObj) {
        if (mesh.userData.blob) {
            flash.position.set(0, 0, 0.35);
        } else {
            flash.position.set(0, -0.28, 0.05);
            flash.rotation.x = -Math.PI / 2;
        }
        flash.rotation.y = Math.random() * Math.PI;
        gunObj.add(flash);
    }

    setTimeout(() => {
        if (gunObj && flash) gunObj.remove(flash);
        flashGeo.dispose(); flashMat.dispose();
    }, 50);

    // Tracer - thicker for editor visibility
    const tracerGeo = new THREE.CylinderGeometry(0.03, 0.03, 5.0);
    tracerGeo.rotateX(Math.PI / 2);
    const tracer = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.9 }));
    scene.add(tracer);

    // Start from shoulder height
    const startPos = mesh.position.clone();
    startPos.y += 1.3;

    let aimDir;
    if (shootData.aimDirX !== undefined) {
        // Use exact aim direction from shooter's camera
        aimDir = new THREE.Vector3(shootData.aimDirX, shootData.aimDirY, shootData.aimDirZ).normalize();
    } else {
        // Fallback to camYaw/camPitch
        const ry = shootData.camYaw !== undefined ? shootData.camYaw : (shootData.ry || mesh.rotation.y);
        const pitch = shootData.camPitch || 0;
        aimDir = new THREE.Vector3(0, 0, 1);
        aimDir.applyAxisAngle(new THREE.Vector3(1, 0, 0), -pitch);
        aimDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    }

    startPos.addScaledVector(aimDir, 0.5); // nudge forward along aim
    const aimTgt = startPos.clone().add(aimDir.clone().multiplyScalar(100));

    tracer.position.copy(startPos);
    tracer.lookAt(aimTgt);

    const velocity = aimDir.clone().multiplyScalar(120);
    editorTracers.push({ mesh: tracer, v: velocity, life: 1.5 });
}

socket.on('remoteShoot', function(d) {
    if (livePlayers[d.id]) editorShootGun(livePlayers[d.id], d);
});

// ============================================================
// ADMIN HUB TABS AND FETCHING
// ============================================================

document.getElementById('tab-editor').addEventListener('click', () => {
    document.getElementById('tab-editor').style.borderColor = '#3b82f6';
    document.getElementById('tab-editor').style.color = '#fff';
    document.getElementById('tab-admin').style.borderColor = 'transparent';
    document.getElementById('tab-admin').style.color = '#94a3b8';
    document.getElementById('panel-editor').style.display = 'block';
    document.getElementById('panel-admin').style.display = 'none';
    document.getElementById('main-panel-header').textContent = 'World Editor';
    document.getElementById('main-panel-sub').textContent = 'WASD to fly • Shift = fast • Scroll = zoom';
});

document.getElementById('tab-admin').addEventListener('click', () => {
    document.getElementById('tab-admin').style.borderColor = '#3b82f6';
    document.getElementById('tab-admin').style.color = '#fff';
    document.getElementById('tab-editor').style.borderColor = 'transparent';
    document.getElementById('tab-editor').style.color = '#94a3b8';
    document.getElementById('panel-admin').style.display = 'block';
    document.getElementById('panel-editor').style.display = 'none';
    document.getElementById('main-panel-header').textContent = 'Admin Hub';
    document.getElementById('main-panel-sub').textContent = 'Server Status & Session Logs';
    fetchAdminStatus();
});

document.getElementById('btn-admin-sync').addEventListener('click', () => {
    document.getElementById('btn-sync').click();
});

document.getElementById('btn-admin-refresh').addEventListener('click', fetchAdminStatus);

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function fetchAdminStatus() {
    fetch('/api/status')
        .then(r => r.json())
        .then(data => {
            const statusBadge = document.getElementById('admin-status-badge');
            statusBadge.textContent = 'Online';
            statusBadge.className = 'badge badge-green';

            document.getElementById('admin-uptime').textContent = formatUptime(data.uptime);
            document.getElementById('admin-players').textContent = data.players;
            document.getElementById('admin-memory').textContent = data.heapMB + ' MB';
            document.getElementById('admin-unique-users').textContent = data.analytics ? data.analytics.uniqueUsersCount : '—';
            document.getElementById('admin-total-connections').textContent = data.analytics ? data.analytics.totalConnections : '—';

            const sessionList = document.getElementById('admin-session-history');
            sessionList.innerHTML = '';
            
            // Render currently online players as active sessions
            if (data.playerList) {
                data.playerList.forEach(p => {
                    const duration = Date.now() - (p.joinTime || Date.now());
                    const div = document.createElement('div');
                    div.style.cssText = 'padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between;';
                    div.innerHTML = `<span style="color:#10b981; font-weight:bold;">🟢 ${p.username}</span> <span>${formatUptime(duration/1000)} (Active)</span>`;
                    sessionList.appendChild(div);
                });
            }

            // Render past sessions (newest first)
            if (data.sessionHistory && data.sessionHistory.length > 0) {
                const reversed = [...data.sessionHistory].reverse();
                reversed.forEach(s => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; color: #94a3b8;';
                    const leaveTime = new Date(s.leaveTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    div.innerHTML = `<span>⭕ ${s.username}</span> <span>${formatUptime(s.duration/1000)} (${leaveTime})</span>`;
                    sessionList.appendChild(div);
                });
            } else if (!data.playerList || data.playerList.length === 0) {
                sessionList.innerHTML = '<div style="color:#475569; font-style:italic;">No recent sessions found.</div>';
            }
        })
        .catch(err => {
            console.error("Failed to fetch admin status", err);
            const statusBadge = document.getElementById('admin-status-badge');
            statusBadge.textContent = 'Offline';
            statusBadge.className = 'badge badge-red';
            statusBadge.style.background = 'rgba(239,68,68,0.25)';
            statusBadge.style.color = '#ef4444';
        });
}

// Auto-refresh admin status if tab is active
setInterval(() => {
    if (document.getElementById('panel-admin').style.display === 'block') {
        fetchAdminStatus();
    }
}, 5000);

socket.on('chatMessage', function(d) {
    const hex = '#' + d.color.toString(16).padStart(6, '0');
    addEditorChat(d.username, d.message, hex);
});

socket.on('mapUpdate', function(data) {
    environmentObjects.forEach(obj => scene.remove(obj));
    environmentObjects = [];
    updatables = [];
    transformControl.detach();
    selectedObject = null;
    if (data && data.objects) data.objects.forEach(objData => instantiateObject(objData));
    updateObjectList();
    showNotification("Map synced from server");
});

// ============================================================
// EDITOR CHAT
// ============================================================
function addEditorChat(username, message, color) {
    const container = document.getElementById('editor-chat-messages');
    const el = document.createElement('div');
    el.className = 'chat-msg';
    el.innerHTML = `<span class="chat-username" style="color:${color || '#fff'}">${username}:</span> ${message}`;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    while (container.children.length > 100) container.removeChild(container.firstChild);
}

chatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        const msg = this.value.trim();
        if (msg) { socket.emit('chatMessage', msg); this.value = ''; }
    }
});

// ============================================================
// RESIZE
// ============================================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// ANIMATION LOOP
// ============================================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    // ---- WASD Camera Movement ----
    if (document.activeElement !== chatInput && !transformControl.dragging) {
        const speed = editorKeys['ShiftLeft'] || editorKeys['ShiftRight'] ? 0.8 : 0.25;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

        const moveVec = new THREE.Vector3();
        if (editorKeys['KeyW']) moveVec.add(forward);
        if (editorKeys['KeyS']) moveVec.sub(forward);
        if (editorKeys['KeyD']) moveVec.add(right);
        if (editorKeys['KeyA']) moveVec.sub(right);
        if (editorKeys['KeyQ'] || editorKeys['Space']) moveVec.y += 1;
        if (editorKeys['KeyE'] || editorKeys['ControlLeft'] || editorKeys['KeyC']) moveVec.y -= 1;

        if (moveVec.lengthSq() > 0) {
            moveVec.normalize().multiplyScalar(speed);
            // In free mode, move both camera and orbit target together
            if (cameraMode === 'free') {
                camera.position.add(moveVec);
                orbitControls.target.add(moveVec);
            }
        }
    }

    // ---- Follow Mode ----
    if (cameraMode === 'follow' && followTargetId && livePlayers[followTargetId]) {
        const target = livePlayers[followTargetId].mesh.position;
        orbitControls.target.lerp(target, 0.15);
        // Keep camera at follow distance from target
        const camDir = camera.position.clone().sub(orbitControls.target);
        if (camDir.length() < 0.01) camDir.set(0, 1, 1);
        camDir.normalize().multiplyScalar(followDistance);
        const desiredCamPos = orbitControls.target.clone().add(camDir);
        camera.position.lerp(desiredCamPos, 0.08);
    }

    // ---- Updatables (campfires, torches, etc.) ----
    updatables.forEach(u => u.update && u.update(t, dt));

    if (window.sharedWater) window.sharedWater.material.uniforms['time'].value += dt;
    if (window.RippleWater) window.RippleWater.update(renderer);
    if (window.sharedClouds) window.sharedClouds.rotation.y += 0.0005;

    // ---- Animate Live Players ----
    for (const id in livePlayers) {
        const p = livePlayers[id];

        // Smooth position interpolation
        p.mesh.position.x += (p.targetPos.x - p.mesh.position.x) * 0.12;
        p.mesh.position.z += (p.targetPos.z - p.mesh.position.z) * 0.12;
        p.mesh.position.y += (p.targetPos.y - p.mesh.position.y) * 0.2;

        // Smooth rotation
        if (p.targetRy !== undefined) {
            let diff = p.targetRy - p.mesh.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            p.mesh.rotation.y += diff * 0.2;
        }

        // Shoot time decay
        if (p.userData.shootTime > 0) p.userData.shootTime -= dt;

        // Animate character
        if (typeof window.animateCharacter === 'function') {
            if (p.mesh.userData.useFBX && p.mesh.userData.fbxWeapons) {
                if (p.mesh.userData.fbxWeapons.gun) p.mesh.userData.fbxWeapons.gun.visible = (p.userData.inventory === 1);
                if (p.mesh.userData.fbxWeapons.axe) p.mesh.userData.fbxWeapons.axe.visible = (p.userData.inventory === 2);
            }
            window.animateCharacter(
                p.mesh, p.charType || 'modular',
                p.isMoving, p.isSprinting, p.isCrouching,
                p.jumpTime, t, dt,
                Math.hypot(p.localVx || 0, p.localVz || 0),
                p.userData.inventory || 0,
                Math.max(0, p.userData.shootTime || 0),
                p.userData.camPitch || 0
            );

            // Upper-body twist so editor shows players aiming where their camera looks
            if ((p.charType === 'modular') && p.mesh.userData.bp && p.userData.camYaw !== undefined) {
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

        if (window.ObjectFactory) {
            if (p.userData.isFishing) {
                if (!p.mesh.userData.fishingRodData) window.ObjectFactory.attachFishingRodToPlayer(p.mesh, scene);
                if (p.mesh.userData.fishingRodData) {
                    p.mesh.userData.fishingRodData.tugPhase += dt;
                    let wx, wz;
                    if (p.userData.fishingTarget) {
                        wx = p.userData.fishingTarget.x;
                        wz = p.userData.fishingTarget.z;
                    } else {
                        // fallback local offset if missing target
                        const fVec = new THREE.Vector3(0, 0, 2);
                        fVec.applyQuaternion(p.mesh.quaternion);
                        wx = p.mesh.position.x + fVec.x + Math.sin(t * 0.5) * 0.3;
                        wz = p.mesh.position.z + fVec.z + Math.cos(t * 0.5) * 0.3;
                    }
                    const waterTarget = new THREE.Vector3(wx, -1.0 + Math.sin(t * 1.5) * 0.05, wz);
                    const catchProgress = 0.5 + Math.sin(t) * 0.2; 
                    window.ObjectFactory.animateFishingRod(p.mesh.userData.fishingRodData, p.mesh, waterTarget, t, catchProgress);
                }
            } else {
                window.ObjectFactory.detachFishingRodFromPlayer(p.mesh, scene);
            }
        }

        // Nametag projection
        const namePos = p.mesh.position.clone();
        namePos.y += (p.charType === 'goop') ? 1.0 : 1.8;
        namePos.project(camera);

        if (namePos.z > 1) {
            p.nametag.style.display = 'none';
        } else {
            p.nametag.style.display = 'block';
            p.nametag.style.left = ((namePos.x * 0.5 + 0.5) * window.innerWidth) + 'px';
            p.nametag.style.top = ((-(namePos.y * 0.5) + 0.5) * window.innerHeight) + 'px';
        }
    }

    // Update editor tracers (bullet projectiles)
    for (let i = editorTracers.length - 1; i >= 0; i--) {
        const t = editorTracers[i];
        t.mesh.position.addScaledVector(t.v, dt);
        t.life -= dt * 1.5;
        t.mesh.material.opacity = Math.max(0, t.life);
        if (t.life <= 0) {
            scene.remove(t.mesh);
            t.mesh.geometry.dispose();
            t.mesh.material.dispose();
            editorTracers.splice(i, 1);
        }
    }

    // Update jumping fish animations
    for (let i = activeJumpingFish.length - 1; i >= 0; i--) {
        let jf = activeJumpingFish[i];
        jf.elapsed += dt;
        if (jf.elapsed >= jf.duration) {
            scene.remove(jf.mesh);
            activeJumpingFish.splice(i, 1);
        } else {
            let progress = jf.elapsed / jf.duration;
            jf.mesh.position.lerpVectors(jf.startPos, jf.endPos, progress);
            let arc = Math.sin(progress * Math.PI) * 2.5; 
            jf.mesh.position.y += arc;
            jf.mesh.rotation.x -= 10 * dt;
        }
    }

    orbitControls.update();
    renderer.render(scene, camera);
}
animate();

// ============================================================
// TERRAIN EDITOR UI BINDINGS
// ============================================================

document.getElementById('tab-editor').addEventListener('click', (e) => {
    document.getElementById('panel-editor').style.display = 'block';
    document.getElementById('panel-terrain').style.display = 'none';
    document.getElementById('panel-admin').style.display = 'none';
    e.target.style.color = '#fff';
    e.target.style.borderColor = '#3b82f6';
    document.getElementById('tab-terrain').style.color = '#94a3b8';
    document.getElementById('tab-terrain').style.borderColor = 'transparent';
    document.getElementById('tab-admin').style.color = '#94a3b8';
    document.getElementById('tab-admin').style.borderColor = 'transparent';
    terrainMode = false;
    if (terrainBrush) terrainBrush.visible = false;
});

document.getElementById('tab-terrain').addEventListener('click', (e) => {
    document.getElementById('panel-editor').style.display = 'none';
    document.getElementById('panel-terrain').style.display = 'block';
    document.getElementById('panel-admin').style.display = 'none';
    e.target.style.color = '#fff';
    e.target.style.borderColor = '#10b981';
    document.getElementById('tab-editor').style.color = '#94a3b8';
    document.getElementById('tab-editor').style.borderColor = 'transparent';
    document.getElementById('tab-admin').style.color = '#94a3b8';
    document.getElementById('tab-admin').style.borderColor = 'transparent';
    terrainMode = true;
    selectObject(null);
    cancelPlacementMode();
});

document.getElementById('tab-admin').addEventListener('click', (e) => {
    document.getElementById('panel-editor').style.display = 'none';
    document.getElementById('panel-terrain').style.display = 'none';
    document.getElementById('panel-admin').style.display = 'block';
    e.target.style.color = '#fff';
    e.target.style.borderColor = '#8b5cf6';
    document.getElementById('tab-editor').style.color = '#94a3b8';
    document.getElementById('tab-editor').style.borderColor = 'transparent';
    document.getElementById('tab-terrain').style.color = '#94a3b8';
    document.getElementById('tab-terrain').style.borderColor = 'transparent';
    terrainMode = false;
    if (terrainBrush) terrainBrush.visible = false;
});

['raise', 'lower', 'flatten', 'smooth'].forEach(mode => {
    document.getElementById('brush-' + mode).addEventListener('click', (e) => {
        ['raise', 'lower', 'flatten', 'smooth'].forEach(m => document.getElementById('brush-' + m).classList.remove('active'));
        e.target.classList.add('active');
        terrainBrushMode = mode;
    });
});

document.getElementById('brush-size').addEventListener('input', (e) => {
    terrainBrushSize = parseFloat(e.target.value);
    document.getElementById('brush-size-val').innerText = terrainBrushSize;
    if (terrainBrush) {
        terrainBrush.geometry.dispose();
        terrainBrush.geometry = new THREE.RingGeometry(0, terrainBrushSize, 32);
    }
});

document.getElementById('brush-strength').addEventListener('input', (e) => {
    terrainBrushStrength = parseFloat(e.target.value);
    document.getElementById('brush-strength-val').innerText = terrainBrushStrength;
});

document.getElementById('btn-save-terrain').addEventListener('click', () => {
    saveMap();
});

function paintTerrain() {
    if (!terrainMode || !floorMesh || !isPaintingTerrain) return;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(floorMesh);
    if (intersects.length > 0) {
        const hit = intersects[0].point;
        const radius = terrainBrushSize;
        const cx = hit.x;
        const cz = hit.z;
        
        const minX = Math.floor(cx - radius);
        const maxX = Math.ceil(cx + radius);
        const minZ = Math.floor(cz - radius);
        const maxZ = Math.ceil(cz + radius);
        
        let avgH = 0;
        let count = 0;
        
        if (terrainBrushMode === 'smooth' || terrainBrushMode === 'flatten') {
            for (let x = minX; x <= maxX; x++) {
                for (let z = minZ; z <= maxZ; z++) {
                    const dist = Math.sqrt((x - cx)**2 + (z - cz)**2);
                    if (dist <= radius) {
                        const h = window.getSharedTerrainHeight(x, z);
                        avgH += h;
                        count++;
                    }
                }
            }
            if (count > 0) avgH /= count;
        }
        
        const flattenHeight = avgH;

        for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
                const dist = Math.sqrt((x - cx)**2 + (z - cz)**2);
                if (dist <= radius) {
                    const falloff = 1 - (dist / radius); // Linear falloff
                    const key = `${x},${z}`;
                    let currentOffset = terrainOffsets[key] || 0;
                    
                    let delta = 0;
                    if (terrainBrushMode === 'raise') delta = terrainBrushStrength * 0.1 * falloff;
                    else if (terrainBrushMode === 'lower') delta = -terrainBrushStrength * 0.1 * falloff;
                    else if (terrainBrushMode === 'flatten') {
                        const h = window.getSharedTerrainHeight(x, z);
                        delta = (flattenHeight - h) * 0.1 * terrainBrushStrength * falloff;
                    } else if (terrainBrushMode === 'smooth') {
                        const h = window.getSharedTerrainHeight(x, z);
                        delta = (avgH - h) * 0.1 * terrainBrushStrength * falloff;
                    }
                    
                    terrainOffsets[key] = currentOffset + delta;
                }
            }
        }
        applyTerrainOffsetsToFloor();
    }
}

