// studio.js - Character Studio Logic

// --- THREE.JS SCENE SETUP ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f1e);
scene.fog = new THREE.FogExp2(0x0a0f1e, 0.05);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.9, 0); // Aim at chest height
controls.minDistance = 1;
controls.maxDistance = 6;
controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go too far below ground

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(3, 5, 4);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0x0ea5e9, 0.5); // Cyan fill
fillLight.position.set(-3, 2, -3);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x818cf8, 0.8); // Purple rim
rimLight.position.set(0, 3, -5);
scene.add(rimLight);

// --- ENVIRONMENT ---
// Grid/Floor
const gridHelper = new THREE.GridHelper(20, 20, 0x38bdf8, 0x1e293b);
gridHelper.position.y = -0.01;
gridHelper.material.opacity = 0.2;
gridHelper.material.transparent = true;
scene.add(gridHelper);

const floorGeo = new THREE.CircleGeometry(5, 64);
const floorMat = new THREE.MeshStandardMaterial({ 
    color: 0x0f172a, 
    roughness: 0.1, 
    metalness: 0.8 
});
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// --- CHARACTER MANAGEMENT ---
let currentCharacter = null;
let currentType = 'modular';
let animTime = 0;

// Configuration State
const charConfigs = {
    'modular': {
        colorTorso: '#3b82f6',
        colorHead: '#ffdbac',
        colorLimbs: '#1e40af',
        scaleTorso: 1.0,
        scaleHead: 1.0,
        scaleArms: 1.0,
        scaleLegs: 1.0
    },
    'goop': {
        colorMain: '#059669',
        scaleX: 1.0,
        scaleY: 1.0,
        scaleZ: 1.0
    },
    'goop-man': {
        colorMain: '#059669',
        thickness: 0.5,
        roughness: 0.1,
        scaleTorso: 1.0,
        scaleHead: 1.0,
        scaleArms: 1.0,
        scaleLegs: 1.0
    }
};

function applyConfigToMesh(mesh, type) {
    const config = charConfigs[type];
    const bp = mesh.userData.bp;

    if (type === 'modular') {
        if (bp) {
            bp.torso.material.color.set(config.colorTorso);
            bp.head.material.color.set(config.colorHead);
            bp.pelvis.material.color.set(config.colorTorso);
            
            bp.armL.children[0].material.color.set(config.colorLimbs);
            bp.armR.children[0].material.color.set(config.colorLimbs);
            bp.legL.children[0].material.color.set(config.colorLimbs);
            bp.legR.children[0].material.color.set(config.colorLimbs);

            // Shape
            bp.torso.scale.set(config.scaleTorso, config.scaleTorso, config.scaleTorso);
            bp.head.scale.set(config.scaleHead, config.scaleHead, config.scaleHead);
            
            // Arms (Scale Y)
            bp.armL.scale.set(config.scaleArms, config.scaleArms, config.scaleArms);
            bp.armR.scale.set(config.scaleArms, config.scaleArms, config.scaleArms);
            
            // Legs
            bp.legL.scale.set(config.scaleLegs, config.scaleLegs, config.scaleLegs);
            bp.legR.scale.set(config.scaleLegs, config.scaleLegs, config.scaleLegs);
        }
    } else if (type === 'goop') {
        if (mesh.userData.blob) {
            mesh.userData.blob.material.color.set(config.colorMain);
            mesh.userData.blob.scale.set(config.scaleX, config.scaleY, config.scaleZ);
        }
    } else if (type === 'goop-man') {
        if (bp) {
            // Apply material changes to the first mesh we find (all use same material ref)
            bp.torso.children[0].material.color.set(config.colorMain);
            bp.torso.children[0].material.thickness = config.thickness;
            bp.torso.children[0].material.roughness = config.roughness;

            bp.torso.scale.set(config.scaleTorso, config.scaleTorso, config.scaleTorso);
            bp.head.scale.set(config.scaleHead, config.scaleHead, config.scaleHead);
            bp.armL.scale.set(config.scaleArms, config.scaleArms, config.scaleArms);
            bp.armR.scale.set(config.scaleArms, config.scaleArms, config.scaleArms);
            bp.legL.scale.set(config.scaleLegs, config.scaleLegs, config.scaleLegs);
            bp.legR.scale.set(config.scaleLegs, config.scaleLegs, config.scaleLegs);
        }
    }
    
    updateExportOutput();
}

function loadCharacter(type) {
    if (currentCharacter) {
        scene.remove(currentCharacter);
    }
    
    currentType = type;
    
    if (type === 'modular') currentCharacter = window.buildModularMan(charConfigs[type].colorTorso);
    else if (type === 'goop') currentCharacter = window.buildGoop(charConfigs[type].colorMain);
    else if (type === 'goop-man') currentCharacter = window.buildGoopMan(charConfigs[type].colorMain);
    
    // Default pose setup
    currentCharacter.position.set(0, 0, 0);
    scene.add(currentCharacter);
    
    applyConfigToMesh(currentCharacter, type);
    buildUIControls(type);
}

// --- UI GENERATION ---
const controlsContainer = document.getElementById('dynamic-controls');
const exportOutput = document.getElementById('export-output');
const exportBtn = document.getElementById('export-btn');

function createControl(label, type, key, min, max, step) {
    const group = document.createElement('div');
    group.className = 'control-group';
    
    const header = document.createElement('div');
    header.className = 'control-header';
    
    const title = document.createElement('span');
    title.innerText = label;
    
    const valDisplay = document.createElement('span');
    valDisplay.className = 'control-val';
    valDisplay.innerText = charConfigs[currentType][key];
    
    header.appendChild(title);
    header.appendChild(valDisplay);
    
    let input;
    if (type === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.value = charConfigs[currentType][key];
        input.addEventListener('input', (e) => {
            charConfigs[currentType][key] = e.target.value;
            valDisplay.innerText = e.target.value;
            applyConfigToMesh(currentCharacter, currentType);
        });
    } else if (type === 'slider') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = min;
        input.max = max;
        input.step = step;
        input.value = charConfigs[currentType][key];
        input.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            charConfigs[currentType][key] = v;
            valDisplay.innerText = v.toFixed(2);
            applyConfigToMesh(currentCharacter, currentType);
        });
    }
    
    group.appendChild(header);
    group.appendChild(input);
    return group;
}

function buildUIControls(type) {
    controlsContainer.innerHTML = ''; // Clear
    
    if (type === 'modular') {
        controlsContainer.appendChild(createControl('Torso Color', 'color', 'colorTorso'));
        controlsContainer.appendChild(createControl('Head Color', 'color', 'colorHead'));
        controlsContainer.appendChild(createControl('Limbs Color', 'color', 'colorLimbs'));
        controlsContainer.appendChild(createControl('Torso Bulk', 'slider', 'scaleTorso', 0.5, 2.0, 0.05));
        controlsContainer.appendChild(createControl('Head Size', 'slider', 'scaleHead', 0.5, 2.0, 0.05));
        controlsContainer.appendChild(createControl('Arm Thickness', 'slider', 'scaleArms', 0.5, 2.0, 0.05));
        controlsContainer.appendChild(createControl('Leg Thickness', 'slider', 'scaleLegs', 0.5, 2.0, 0.05));
    } else if (type === 'goop') {
        controlsContainer.appendChild(createControl('Slime Color', 'color', 'colorMain'));
        controlsContainer.appendChild(createControl('Width (X)', 'slider', 'scaleX', 0.5, 2.0, 0.05));
        controlsContainer.appendChild(createControl('Height (Y)', 'slider', 'scaleY', 0.5, 2.0, 0.05));
        controlsContainer.appendChild(createControl('Depth (Z)', 'slider', 'scaleZ', 0.5, 2.0, 0.05));
    } else if (type === 'goop-man') {
        controlsContainer.appendChild(createControl('Slime Color', 'color', 'colorMain'));
        controlsContainer.appendChild(createControl('Glass Thickness', 'slider', 'thickness', 0.0, 2.0, 0.1));
        controlsContainer.appendChild(createControl('Roughness', 'slider', 'roughness', 0.0, 1.0, 0.05));
        controlsContainer.appendChild(createControl('Torso Bulk', 'slider', 'scaleTorso', 0.5, 2.0, 0.05));
        controlsContainer.appendChild(createControl('Head Size', 'slider', 'scaleHead', 0.5, 2.0, 0.05));
        controlsContainer.appendChild(createControl('Arm Thickness', 'slider', 'scaleArms', 0.5, 2.0, 0.05));
        controlsContainer.appendChild(createControl('Leg Thickness', 'slider', 'scaleLegs', 0.5, 2.0, 0.05));
    }
}

function updateExportOutput() {
    exportOutput.value = JSON.stringify({
        type: currentType,
        config: charConfigs[currentType]
    }, null, 2);
}

exportBtn.addEventListener('click', () => {
    exportOutput.select();
    document.execCommand('copy');
    exportBtn.innerText = 'COPIED TO CLIPBOARD!';
    exportBtn.style.background = '#10b981'; // Emerald
    setTimeout(() => {
        exportBtn.innerText = 'EXPORT SETTINGS';
        exportBtn.style.background = ''; // Revert to CSS default
    }, 2000);
});

// Model Selector Links
document.querySelectorAll('.model-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.model-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        loadCharacter(e.target.dataset.model);
    });
});

// --- RENDER LOOP ---
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    animTime += delta;
    
    controls.update();

    if (currentCharacter) {
        // We use the shared animateCharacter function to keep the idle animation alive
        if (window.animateCharacter) {
            // function signature: mesh, charType, isMoving, isSprinting, isCrouching, jumpTime, t, delta, speedStr, inventory, shootTime, camPitch
            window.animateCharacter(currentCharacter, currentType, false, false, false, -1, animTime, delta, 0, 0, 0, 0);
        }
        
        // Goop Man marching cubes manual update because we override scale directly
        if (currentType === 'goop-man' && currentCharacter.userData.marchingCubes) {
            // animateCharacter already calls update() on it, but we scaled the bones dynamically
            // so bounding boxes changed. The loop inside animateCharacter handles boundingBox reading dynamically, so it should auto-adjust!
        }
    }

    renderer.render(scene, camera);
}

// Init
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Wait for shared-characters to load
setTimeout(() => {
    loadCharacter('modular');
    animate();
}, 200);
