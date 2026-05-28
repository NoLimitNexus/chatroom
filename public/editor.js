// ============================================================
// STEAM CHATROOM - WORLD EDITOR
// ============================================================

const socket = io();

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue
scene.fog = new THREE.FogExp2(0x87ceeb, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 10, 20);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;

// Transform Controls
const transformControl = new THREE.TransformControls(camera, renderer.domElement);
transformControl.addEventListener('dragging-changed', function(event) {
    orbitControls.enabled = !event.value;
});
scene.add(transformControl);

// Setup Shared Environment
if (window.setupSharedEnvironment) {
    window.setupSharedEnvironment(scene, renderer, camera);
}

// State
let environmentObjects = [];
let updatables = [];
let selectedObject = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Load Initial Map Data
fetch('/api/map')
    .then(res => res.json())
    .then(data => {
        if (data && data.objects) {
            data.objects.forEach(objData => {
                instantiateObject(objData);
            });
            updateObjectList();
        }
    })
    .catch(err => console.error("Error loading map:", err));

function instantiateObject(data) {
    let mesh;
    let updatable = null;

    if (window.ObjectFactory) {
        const factoryObj = window.ObjectFactory.create(data.type, data.config);
        if (factoryObj) {
            // Wrapper group for editor manipulation
            mesh = new THREE.Group();
            mesh.userData.isEnvironmentObject = true;
            mesh.userData.type = data.type;

            mesh.add(factoryObj.group);
            
            if (factoryObj.updatable) {
                updatable = factoryObj.updatable;
                mesh.userData.updatable = factoryObj.updatable;
            }
        
        // Add a hit box for raycasting since particles are hard to click
        const hitGeo = new THREE.CylinderGeometry(1, 1, 3, 8);
        const hitMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: false });
        const hitBox = new THREE.Mesh(hitGeo, hitMat);
        hitBox.position.y = 1.5;
        mesh.add(hitBox);
        mesh.userData.hitBox = hitBox; // Reference for raycasting

            // Add a BoxHelper for the editor to see bounds
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
        
        // Give unique ID if not present
        mesh.userData.id = data.id || 'obj_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        
        scene.add(mesh);
        environmentObjects.push(mesh);
        if (updatable) {
            updatables.push(updatable);
        }
    }
}

// Map Save
function saveMap() {
    const mapData = {
        objects: environmentObjects.map(obj => {
            const data = {
                id: obj.userData.id,
                type: obj.userData.type,
                position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
            };
            // Add specific configs
            if (obj.userData.type === 'Campfire') {
                // Find updatable reference
                const updatable = updatables.find(u => u.mesh && obj.children.includes(u.mesh));
                if (updatable && updatable.config) {
                    data.config = updatable.config;
                }
            }
            return data;
        })
    };

    fetch('/api/map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapData)
    }).then(() => {
        showNotification("Map Saved to Server!");
    });
}

function showNotification(msg) {
    const notif = document.getElementById('notification');
    notif.innerText = msg;
    notif.style.opacity = 1;
    setTimeout(() => { notif.style.opacity = 0; }, 3000);
}

// Raycasting for Selection
window.addEventListener('pointerdown', (event) => {
    // Ignore UI clicks
    if (event.target.tagName === 'BUTTON' || event.target.closest('#ui-layer') || transformControl.dragging) {
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Build array of meshes to test
    const testMeshes = [];
    environmentObjects.forEach(obj => {
        if (obj.userData.hitBox) testMeshes.push(obj.userData.hitBox);
        else testMeshes.push(obj);
    });

    const intersects = raycaster.intersectObjects(testMeshes, true);

    if (intersects.length > 0) {
        let selected = intersects[0].object;
        // Traverse up to find root object in environmentObjects
        while (selected.parent && !environmentObjects.includes(selected)) {
            selected = selected.parent;
        }
        if (environmentObjects.includes(selected)) {
            selectObject(selected);
        }
    } else {
        selectObject(null);
    }
});

function selectObject(obj) {
    if (selectedObject && selectedObject.userData.boxHelper) {
        selectedObject.userData.boxHelper.visible = false;
    }
    selectedObject = obj;
    if (obj) {
        if (obj.userData.boxHelper) {
            obj.userData.boxHelper.visible = true;
        }
        transformControl.attach(obj);
    } else {
        transformControl.detach();
    }
    updateObjectList();
}

// UI Buttons
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

document.getElementById('btn-add-campfire').addEventListener('click', () => {
    instantiateObject({
        type: 'Campfire',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
    });
    const newlyAdded = environmentObjects[environmentObjects.length - 1];
    selectObject(newlyAdded);
    updateObjectList();
});

document.getElementById('btn-delete').addEventListener('click', () => {
    if (selectedObject) {
        scene.remove(selectedObject);
        transformControl.detach();
        environmentObjects = environmentObjects.filter(o => o !== selectedObject);
        // Remove from updatables if necessary
        if (selectedObject.userData.updatable) {
            updatables = updatables.filter(u => u !== selectedObject.userData.updatable);
        }
        selectedObject = null;
        updateObjectList();
    }
});

document.getElementById('btn-snap-ground').addEventListener('click', () => {
    if (selectedObject) {
        if (window.getSharedTerrainHeight) {
            selectedObject.position.y = window.getSharedTerrainHeight(selectedObject.position.x, selectedObject.position.z);
        } else {
            selectedObject.position.y = 0;
        }
    }
});

document.getElementById('btn-save').addEventListener('click', saveMap);

// Keyboard shortcuts
window.addEventListener('keydown', function (event) {
    switch (event.key) {
        case 'Shift':
            transformControl.setTranslationSnap(1);
            transformControl.setRotationSnap(THREE.MathUtils.degToRad(15));
            transformControl.setScaleSnap(0.25);
            break;
        case 'Delete':
            document.getElementById('btn-delete').click();
            break;
    }
});

window.addEventListener('keyup', function (event) {
    switch (event.key) {
        case 'Shift':
            transformControl.setTranslationSnap(null);
            transformControl.setRotationSnap(null);
            transformControl.setScaleSnap(null);
            break;
    }
});

function updateObjectList() {
    const list = document.getElementById('object-list');
    list.innerHTML = '';
    environmentObjects.forEach((obj, idx) => {
        const div = document.createElement('div');
        div.className = 'object-item' + (obj === selectedObject ? ' selected' : '');
        div.innerText = `${obj.userData.type} ${idx + 1}`;
        div.onclick = () => selectObject(obj);
        list.appendChild(div);
    });
}

// Resize handler
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Animation loop
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    
    updatables.forEach(u => u.update && u.update(dt));
    
    if (window.sharedWater) {
        window.sharedWater.material.uniforms['time'].value += dt;
    }
    if (window.sharedClouds) {
        window.sharedClouds.rotation.y += 0.0005;
    }
    
    orbitControls.update();
    renderer.render(scene, camera);
}
animate();
