
window.WaterShaders = {
    utils: "const float IOR_AIR = 1.0;\r\nconst float IOR_WATER = 1.333;\r\n\r\nconst vec3 abovewaterColor = vec3(0.25, 1.0, 1.25);\r\nconst vec3 underwaterColor = vec3(0.4, 0.9, 1.0);\r\n\r\nconst float poolHeight = 1.0;\r\n\r\nuniform vec3 light;\r\nuniform sampler2D tiles;\r\nuniform sampler2D causticTex;\r\nuniform sampler2D water;\r\n\r\n\r\nvec2 intersectCube(vec3 origin, vec3 ray, vec3 cubeMin, vec3 cubeMax) {\r\n  vec3 tMin = (cubeMin - origin) / ray;\r\n  vec3 tMax = (cubeMax - origin) / ray;\r\n  vec3 t1 = min(tMin, tMax);\r\n  vec3 t2 = max(tMin, tMax);\r\n  float tNear = max(max(t1.x, t1.y), t1.z);\r\n  float tFar = min(min(t2.x, t2.y), t2.z);\r\n  return vec2(tNear, tFar);\r\n}\r\n\r\n\r\nvec3 getWallColor(vec3 point) {\r\n  float scale = 0.5;\r\n\r\n  vec3 wallColor;\r\n  vec3 normal;\r\n  if (abs(point.x) > 0.999) {\r\n    wallColor = texture2D(tiles, point.yz * 0.5 + vec2(1.0, 0.5)).rgb;\r\n    normal = vec3(-point.x, 0.0, 0.0);\r\n  } else if (abs(point.z) > 0.999) {\r\n    wallColor = texture2D(tiles, point.yx * 0.5 + vec2(1.0, 0.5)).rgb;\r\n    normal = vec3(0.0, 0.0, -point.z);\r\n  } else {\r\n    wallColor = texture2D(tiles, point.xz * 0.5 + 0.5).rgb;\r\n    normal = vec3(0.0, 1.0, 0.0);\r\n  }\r\n\r\n  scale /= length(point); /* pool ambient occlusion */\r\n\r\n  /* caustics */\r\n  vec3 refractedLight = -refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);\r\n  float diffuse = max(0.0, dot(refractedLight, normal));\r\n  vec4 info = texture2D(water, point.xz * 0.5 + 0.5);\r\n  if (point.y < info.r) {\r\n    vec4 caustic = texture2D(causticTex, 0.75 * (point.xz - point.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5);\r\n    scale += diffuse * caustic.r * 2.0 * caustic.g;\r\n  } else {\r\n    /* shadow for the rim of the pool */\r\n    vec2 t = intersectCube(point, refractedLight, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));\r\n    diffuse *= 1.0 / (1.0 + exp(-200.0 / (1.0 + 10.0 * (t.y - t.x)) * (point.y + refractedLight.y * t.y - 2.0 / 12.0)));\r\n\r\n    scale += diffuse * 0.5;\r\n  }\r\n\r\n  return wallColor * scale;\r\n}\r\n",
    simulation_vertex: "attribute vec3 position;\r\nvarying vec2 coord;\r\n\r\n\r\nvoid main() {\r\n  coord = position.xy * 0.5 + 0.5;\r\n\r\n  gl_Position = vec4(position.xyz, 1.0);\r\n}\r\n",
    simulation_drop_fragment: "precision highp float;\r\nprecision highp int;\r\n\r\nconst float PI = 3.141592653589793;\r\nuniform sampler2D texture;\r\nuniform vec2 center;\r\nuniform float radius;\r\nuniform float strength;\r\nvarying vec2 coord;\r\n\r\n\r\nvoid main() {\r\n  /* Get vertex info */\r\n  vec4 info = texture2D(texture, coord);\r\n\r\n  /* Add the drop to the height */\r\n  float drop = max(0.0, 1.0 - length(center * 0.5 + 0.5 - coord) / radius);\r\n  drop = 0.5 - cos(drop * PI) * 0.5;\r\n  info.r += drop * strength;\r\n\r\n  gl_FragColor = info;\r\n}\r\n",
    simulation_normal_fragment: "precision highp float;\r\nprecision highp int;\r\n\r\nuniform sampler2D texture;\r\nuniform vec2 delta;\r\nvarying vec2 coord;\r\n\r\n\r\nvoid main() {\r\n  /* get vertex info */\r\n  vec4 info = texture2D(texture, coord);\r\n\r\n  /* update the normal */\r\n  vec3 dx = vec3(delta.x, texture2D(texture, vec2(coord.x + delta.x, coord.y)).r - info.r, 0.0);\r\n  vec3 dy = vec3(0.0, texture2D(texture, vec2(coord.x, coord.y + delta.y)).r - info.r, delta.y);\r\n  info.ba = normalize(cross(dy, dx)).xz;\r\n\r\n  gl_FragColor = info;\r\n}\r\n",
    simulation_update_fragment: "precision highp float;\r\nprecision highp int;\r\n\r\nuniform sampler2D texture;\r\nuniform vec2 delta;\r\nuniform float damping;\r\nuniform float waveSpeed;\r\nvarying vec2 coord;\r\n\r\n\r\nvoid main() {\r\n  /* get vertex info */\r\n  vec4 info = texture2D(texture, coord);\r\n\r\n  /* calculate average neighbor height */\r\n  vec2 dx = vec2(delta.x, 0.0);\r\n  vec2 dy = vec2(0.0, delta.y);\r\n  float average = (\r\n    texture2D(texture, coord - dx).r +\r\n    texture2D(texture, coord - dy).r +\r\n    texture2D(texture, coord + dx).r +\r\n    texture2D(texture, coord + dy).r\r\n  ) * 0.25;\r\n\r\n  /* change the velocity to move toward the average */\r\n  info.g += (average - info.r) * waveSpeed;\r\n\r\n  /* attenuate the velocity a little so waves do not last forever */\r\n  info.g *= damping;\r\n\r\n  /* move the vertex along the velocity */\r\n  info.r += info.g;\r\n\r\n  gl_FragColor = info;\r\n}\n",
    caustics_vertex: "precision highp float;\r\nprecision highp int;\r\n\r\nvarying vec3 oldPos;\r\nvarying vec3 newPos;\r\nvarying vec3 ray;\r\nattribute vec3 position;\r\n\r\n#include <utils>\r\n\r\n\r\n/* project the ray onto the plane */\r\nvec3 project(vec3 origin, vec3 ray, vec3 refractedLight) {\r\n  vec2 tcube = intersectCube(origin, ray, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));\r\n  origin += ray * tcube.y;\r\n  float tplane = (-origin.y - 1.0) / refractedLight.y;\r\n\r\n  return origin + refractedLight * tplane;\r\n}\r\n\r\n\r\nvoid main() {\r\n  vec4 info = texture2D(water, position.xy * 0.5 + 0.5);\r\n  info.ba *= 0.5;\r\n  vec3 normal = vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a);\r\n\r\n  /* project the vertices along the refracted vertex ray */\r\n  vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);\r\n  ray = refract(-light, normal, IOR_AIR / IOR_WATER);\r\n  oldPos = project(position.xzy, refractedLight, refractedLight);\r\n  newPos = project(position.xzy + vec3(0.0, info.r, 0.0), ray, refractedLight);\r\n\r\n  gl_Position = vec4(0.75 * (newPos.xz + refractedLight.xz / refractedLight.y), 0.0, 1.0);\r\n}\r\n",
    caustics_fragment: "precision highp float;\r\nprecision highp int;\r\n\r\n#extension GL_OES_standard_derivatives : enable\r\n\r\n#include <utils>\r\n\r\nvarying vec3 oldPos;\r\nvarying vec3 newPos;\r\nvarying vec3 ray;\r\n\r\n\r\nvoid main() {\r\n  /* if the triangle gets smaller, it gets brighter, and vice versa */\r\n  float oldArea = length(dFdx(oldPos)) * length(dFdy(oldPos));\r\n  float newArea = length(dFdx(newPos)) * length(dFdy(newPos));\r\n  gl_FragColor = vec4(oldArea / newArea * 0.2, 1.0, 0.0, 0.0);\r\n\r\n  vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);\r\n\r\n  /* shadow for the rim of the pool */\r\n  vec2 t = intersectCube(newPos, -refractedLight, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));\r\n  gl_FragColor.r *= 1.0 / (1.0 + exp(-200.0 / (1.0 + 10.0 * (t.y - t.x)) * (newPos.y - refractedLight.y * t.y - 2.0 / 12.0)));\r\n}\r\n",
    water_vertex: "uniform mat4 projectionMatrix;\r\nuniform mat4 modelViewMatrix;\r\nuniform sampler2D water;\r\n\r\nattribute vec3 position;\r\n\r\nvarying vec3 eye;\r\nvarying vec3 pos;\r\n\r\n\r\nvoid main() {\r\n  vec4 info = texture2D(water, position.xy * 0.5 + 0.5);\r\n  pos = position.xzy;\r\n  pos.y += info.r;\r\n\r\n  vec3 axis_x = vec3(modelViewMatrix[0].x, modelViewMatrix[0].y, modelViewMatrix[0].z);\r\n  vec3 axis_y = vec3(modelViewMatrix[1].x, modelViewMatrix[1].y, modelViewMatrix[1].z);\r\n  vec3 axis_z = vec3(modelViewMatrix[2].x, modelViewMatrix[2].y, modelViewMatrix[2].z);\r\n  vec3 offset = vec3(modelViewMatrix[3].x, modelViewMatrix[3].y, modelViewMatrix[3].z);\r\n\r\n  eye = vec3(dot(-offset, axis_x), dot(-offset, axis_y), dot(-offset, axis_z));\r\n\r\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);\r\n}\r\n",
    water_fragment: "precision highp float;\r\nprecision highp int;\r\n\r\n#include <utils>\r\n\r\nuniform float underwater;\r\nuniform samplerCube sky;\r\n\r\nvarying vec3 eye;\r\nvarying vec3 pos;\r\n\r\n\r\nvec3 getSurfaceRayColor(vec3 origin, vec3 ray, vec3 waterColor) {\r\n  vec3 color;\r\n\r\n  if (ray.y < 0.0) {\r\n    vec2 t = intersectCube(origin, ray, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));\r\n    color = getWallColor(origin + ray * t.y);\r\n  } else {\r\n    vec2 t = intersectCube(origin, ray, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));\r\n    vec3 hit = origin + ray * t.y;\r\n    if (hit.y < 7.0 / 12.0) {\r\n      color = getWallColor(hit);\r\n    } else {\r\n      color = textureCube(sky, ray).rgb;\r\n      color += 0.01 * vec3(pow(max(0.0, dot(light, ray)), 20.0)) * vec3(10.0, 8.0, 6.0);\r\n    }\r\n  }\r\n\r\n  if (ray.y < 0.0) color *= waterColor;\r\n\r\n  return color;\r\n}\r\n\r\n\r\nvoid main() {\r\n  vec2 coord = pos.xz * 0.5 + 0.5;\r\n  vec4 info = texture2D(water, coord);\r\n\r\n  /* make water look more \"peaked\" */\r\n  for (int i = 0; i < 5; i++) {\r\n    coord += info.ba * 0.005;\r\n    info = texture2D(water, coord);\r\n  }\r\n\r\n  vec3 normal = vec3(info.b, sqrt(1.0 - dot(info.ba, info.ba)), info.a);\r\n  vec3 incomingRay = normalize(pos - eye);\r\n\r\n  if (underwater == 1.) {\r\n    normal = -normal;\r\n    vec3 reflectedRay = reflect(incomingRay, normal);\r\n    vec3 refractedRay = refract(incomingRay, normal, IOR_WATER / IOR_AIR);\r\n    float fresnel = mix(0.5, 1.0, pow(1.0 - dot(normal, -incomingRay), 3.0));\r\n\r\n    vec3 reflectedColor = getSurfaceRayColor(pos, reflectedRay, underwaterColor);\r\n    vec3 refractedColor = getSurfaceRayColor(pos, refractedRay, vec3(1.0)) * vec3(0.8, 1.0, 1.1);\r\n\r\n    gl_FragColor = vec4(mix(reflectedColor, refractedColor, (1.0 - fresnel) * length(refractedRay)), 1.0);\r\n  } else {\r\n    vec3 reflectedRay = reflect(incomingRay, normal);\r\n    vec3 refractedRay = refract(incomingRay, normal, IOR_AIR / IOR_WATER);\r\n    float fresnel = mix(0.25, 1.0, pow(1.0 - dot(normal, -incomingRay), 3.0));\r\n\r\n    vec3 reflectedColor = getSurfaceRayColor(pos, reflectedRay, abovewaterColor);\r\n    vec3 refractedColor = getSurfaceRayColor(pos, refractedRay, abovewaterColor);\r\n\r\n    gl_FragColor = vec4(mix(refractedColor, reflectedColor, fresnel), 1.0);\r\n  }\r\n}\r\n"
};

const canvas = document.getElementById('canvas');

// Resize handling
let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    if (camera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }
    if (renderer) {
        renderer.setSize(width, height);
    }
    // Update controls screen size if using Trackball, but we use Orbit
});

// Colors
const black = new THREE.Color('black');
const white = new THREE.Color('white');
const bgColor = new THREE.Color(0x0a0a0a);

function loadFile(filename) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.FileLoader();
    loader.load(filename, (data) => resolve(data));
  });
}

// --- FOG ENGINE CONFIGURATION ---
const config = {
    sprayRate: { value: 3, min: 1, max: 10, step: 1, label: "Emission Rate" },
    forwardSpeed: { value: 0.4, min: 0.1, max: 1.0, step: 0.01, label: "Exit Velocity" },
    spread: { value: 0.08, min: 0.01, max: 0.3, step: 0.01, label: "Nozzle Spread" },
    drag: { value: 0.98, min: 0.85, max: 0.99, step: 0.01, label: "Air Resistance (Drag)" },
    buoyancy: { value: -0.002, min: -0.02, max: 0.02, step: 0.001, label: "Buoyancy / Gravity" },
    startSize: { value: 1.5, min: 0.5, max: 5.0, step: 0.1, label: "Start Size" },
    endSize: { value: 12.0, min: 5.0, max: 30.0, step: 0.5, label: "End Size" },
    lifespan: { value: 300, min: 50, max: 300, step: 10, label: "Particle Life" }
};

// --- WATER CONFIGURATION ---
const waterConfig = {
    interactionRadius: { value: 0.04, min: 0.01, max: 0.15, step: 0.01, label: "Object Ripple Size" },
    interactionStrength: { value: 0.02, min: 0.01, max: 0.10, step: 0.01, label: "Object Ripple Strength" },
    rainAmount: { value: 0, min: 0, max: 5, step: 1, label: "Background Rain" },
    damping: { value: 0.995, min: 0.900, max: 0.999, step: 0.001, label: "Wave Damping" },
    waveSpeed: { value: 2.0, min: 0.1, max: 2.0, step: 0.05, label: "Wave Travel Speed" }
};

// --- UI GENERATION ---
const controlsContainer = document.getElementById('controls-container');

function createSliderGroup(configObj, titleText) {
    const sectionTitle = document.createElement('h3');
    sectionTitle.innerText = titleText;
    sectionTitle.style.color = '#fff';
    sectionTitle.style.fontSize = '12px';
    sectionTitle.style.borderBottom = '1px solid #444';
    sectionTitle.style.paddingBottom = '4px';
    sectionTitle.style.marginTop = '15px';
    sectionTitle.style.marginBottom = '10px';
    sectionTitle.style.textTransform = 'uppercase';
    controlsContainer.appendChild(sectionTitle);

    for (const [key, settings] of Object.entries(configObj)) {
        const group = document.createElement('div');
        group.className = 'control-group';
        
        const header = document.createElement('div');
        header.className = 'control-header';
        
        const label = document.createElement('span');
        label.innerText = settings.label;
        
        const valueDisplay = document.createElement('span');
        valueDisplay.innerText = settings.value;
        valueDisplay.id = `val-${key}`;
        
        header.appendChild(label);
        header.appendChild(valueDisplay);
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = settings.min;
        slider.max = settings.max;
        slider.step = settings.step;
        slider.value = settings.value;
        
        slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            configObj[key].value = val;
            valueDisplay.innerText = val.toFixed(settings.step.toString().split('.')[1]?.length || 0);
        });
        
        group.appendChild(header);
        group.appendChild(slider);
        controlsContainer.appendChild(group);
    }
}

createSliderGroup(config, "Fog Simulation");
createSliderGroup(waterConfig, "Water Simulation");


let camera, renderer, mainScene, controls, transformControl;
let ballMesh, machineGroup;

// Shader chunks
Promise.resolve(window.WaterShaders.utils).then((utils) => {
  THREE.ShaderChunk['utils'] = utils;

  // Create Renderer & Camera
  camera = new THREE.PerspectiveCamera(75, width / height, 0.01, 100);
  camera.position.set(0, 1.5, -2.5); // position further out
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true, alpha: true});
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.autoClear = false;

  // Light direction for Water
  const light = [0.7559289460184544, 0.7559289460184544, -0.3779644730092272];

  // Create Orbit Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);

  // --- MAIN SCENE (For FOG and Objects) ---
  mainScene = new THREE.Scene();
  mainScene.fog = new THREE.FogExp2(0x0a0a0a, 0.015);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  mainScene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  mainScene.add(dirLight);

  // --- THE BALL ---
  const ballGeo = new THREE.SphereGeometry(0.3, 32, 32);
  const ballMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.2, metalness: 0.1 });
  ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.position.set(-0.5, 0.2, -0.5);
  mainScene.add(ballMesh);

  // --- THE FOG MACHINE ---
  machineGroup = new THREE.Group();
  machineGroup.scale.set(0.15, 0.15, 0.15); // Scale down for the pool size

  // Main chassis
  const chassisMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6, metalness: 0.5 });
  const chassisGeo = new THREE.BoxGeometry(3.2, 1.8, 4.2);
  const chassis = new THREE.Mesh(chassisGeo, chassisMat);
  chassis.position.y = 1.0;
  machineGroup.add(chassis);

  // Side panels
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.4, metalness: 0.8 });
  const panelGeo = new THREE.BoxGeometry(3.4, 1.2, 3.0);
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.y = 1.0;
  machineGroup.add(panel);

  // Nozzle Base & Extrusion
  const capMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.8 });
  const nozzleBaseGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.6, 32);
  const nozzleBase = new THREE.Mesh(nozzleBaseGeo, capMat);
  nozzleBase.rotation.x = Math.PI / 2;
  nozzleBase.position.set(0, 1.0, 2.2);
  machineGroup.add(nozzleBase);

  const nozzleGeo = new THREE.CylinderGeometry(0.4, 0.6, 1.2, 32);
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 1.0, 2.8);
  machineGroup.add(nozzle);

  // Set position in pool
  machineGroup.position.set(0.5, 0.2, 0.5);
  machineGroup.rotation.y = Math.PI;
  mainScene.add(machineGroup);

  // --- TRANSFORM CONTROLS ---
  transformControl = new THREE.TransformControls(camera, renderer.domElement);
  transformControl.addEventListener('dragging-changed', function (event) {
      controls.enabled = !event.value;
  });
  mainScene.add(transformControl);

  // Mode Selection Logic
  const modeRadios = document.getElementsByName('interaction-mode');
  
  function updateInteraction() {
      const mode = Array.from(modeRadios).find(r => r.checked).value;
      if (mode === 'camera') {
          transformControl.detach();
      } else if (mode === 'ball') {
          transformControl.attach(ballMesh);
      } else if (mode === 'fog') {
          transformControl.attach(machineGroup);
      }
  }

  modeRadios.forEach(radio => {
      radio.addEventListener('change', updateInteraction);
  });

  // --- FOG PARTICLE SYSTEM ---
  function createFogTexture() {
      const canvasText = document.createElement('canvas');
      canvasText.width = 128;
      canvasText.height = 128;
      const ctx = canvasText.getContext('2d');
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.8)');
      gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(canvasText);
  }

  const maxParticles = 3000;
  let spawnIndex = 0;
  const particlesData = []; // CPU physics data

  const positions = new Float32Array(maxParticles * 3);
  const sizes = new Float32Array(maxParticles);
  const opacities = new Float32Array(maxParticles);

  for (let i = 0; i < maxParticles; i++) {
      particlesData.push({
          active: false,
          life: 0,
          maxLife: 0,
          velocity: new THREE.Vector3(),
          baseOpacity: 0
      });
      sizes[i] = 0;
      opacities[i] = 0;
      positions[i * 3] = 10000; 
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));

  const vertexShader = `
      attribute float size;
      attribute float opacity;
      varying float vOpacity;
      varying vec3 vWorldPosition;
      varying float vSize;
      
      void main() {
          vOpacity = opacity;
          vSize = size;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vec4 mvPosition = viewMatrix * worldPosition;
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
      }
  `;

  const fragmentShader = `
      uniform sampler2D pointTexture;
      uniform vec3 color;
      varying float vOpacity;
      varying vec3 vWorldPosition;
      varying float vSize;
      
      void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          
          // Estimate the fragment's world Y position to create a volumetric soft-intersection with the water level
          // gl_PointCoord.y is 0 at top, 1 at bottom of the point sprite
          float fragWorldY = vWorldPosition.y + (0.5 - gl_PointCoord.y) * (vSize * 1.5);
          
          // Smoothly fade out fragments that fall beneath the water surface (y=0)
          float alphaFade = smoothstep(-0.05, 0.05, fragWorldY);
          
          gl_FragColor = vec4(color * texColor.xyz, texColor.w * vOpacity * alphaFade);
      }
  `;

  const material = new THREE.ShaderMaterial({
      uniforms: {
          pointTexture: { value: createFogTexture() },
          color: { value: new THREE.Color(0xdddddd) }
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending
  });

  const particleSystem = new THREE.Points(geometry, material);
  mainScene.add(particleSystem);

  // --- Water Dependencies ---
  const cubetextureloader = new THREE.CubeTextureLoader();
  const textureCube = cubetextureloader.load([
    'xpos.jpg', 'xneg.jpg',
    'ypos.jpg', 'ypos.jpg',
    'zpos.jpg', 'zneg.jpg',
  ]);

  const textureloader = new THREE.TextureLoader();
  const tiles = textureloader.load('tiles.jpg');

  class WaterSimulation {

    constructor() {
      this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 2000);
      this._geometry = new THREE.PlaneBufferGeometry(2, 2);
      this._textureA = new THREE.WebGLRenderTarget(256, 256, {type: THREE.FloatType});
      this._textureB = new THREE.WebGLRenderTarget(256, 256, {type: THREE.FloatType});
      this.texture = this._textureA;

      const shadersPromises = [
        Promise.resolve(window.WaterShaders.simulation_vertex),
        Promise.resolve(window.WaterShaders.simulation_drop_fragment),
        Promise.resolve(window.WaterShaders.simulation_normal_fragment),
        Promise.resolve(window.WaterShaders.simulation_update_fragment),
      ];

      this.loaded = Promise.all(shadersPromises)
          .then(([vertexShader, dropFragmentShader, normalFragmentShader, updateFragmentShader]) => {
        const dropMaterial = new THREE.RawShaderMaterial({
          uniforms: {
              center: { value: [0, 0] },
              radius: { value: 0 },
              strength: { value: 0 },
              texture: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: dropFragmentShader,
        });

        const normalMaterial = new THREE.RawShaderMaterial({
          uniforms: {
              delta: { value: [1 / 256, 1 / 256] },
              texture: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: normalFragmentShader,
        });

        const updateMaterial = new THREE.RawShaderMaterial({
          uniforms: {
              delta: { value: [1 / 256, 1 / 256] },
              texture: { value: null },
              damping: { value: 0.995 },
              waveSpeed: { value: 2.0 }
          },
          vertexShader: vertexShader,
          fragmentShader: updateFragmentShader,
        });

        this._dropMesh = new THREE.Mesh(this._geometry, dropMaterial);
        this._normalMesh = new THREE.Mesh(this._geometry, normalMaterial);
        this._updateMesh = new THREE.Mesh(this._geometry, updateMaterial);
      });
    }

    addDrop(renderer, x, y, radius, strength) {
      this._dropMesh.material.uniforms['center'].value = [x, y];
      this._dropMesh.material.uniforms['radius'].value = radius;
      this._dropMesh.material.uniforms['strength'].value = strength;
      this._render(renderer, this._dropMesh);
    }

    stepSimulation(renderer) {
      this._updateMesh.material.uniforms['damping'].value = waterConfig.damping.value;
      this._updateMesh.material.uniforms['waveSpeed'].value = waterConfig.waveSpeed.value;
      this._render(renderer, this._updateMesh);
    }

    updateNormals(renderer) {
      this._render(renderer, this._normalMesh);
    }

    _render(renderer, mesh) {
      const oldTexture = this.texture;
      const newTexture = this.texture === this._textureA ? this._textureB : this._textureA;
      mesh.material.uniforms['texture'].value = oldTexture.texture;
      renderer.setRenderTarget(newTexture);
      renderer.render(mesh, this._camera);
      this.texture = newTexture;
    }
  }

  class Caustics {
    constructor(lightFrontGeometry) {
      this._camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0, 2000);
      this._geometry = lightFrontGeometry;
      this.texture = new THREE.WebGLRenderTarget(1024, 1024, {type: THREE.UNSIGNED_BYTE});
      const shadersPromises = [
        Promise.resolve(window.WaterShaders.caustics_vertex),
        Promise.resolve(window.WaterShaders.caustics_fragment)
      ];
      this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
        const material = new THREE.RawShaderMaterial({
          uniforms: {
              light: { value: light },
              water: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });
        this._causticMesh = new THREE.Mesh(this._geometry, material);
      });
    }
    update(renderer, waterTexture) {
      this._causticMesh.material.uniforms['water'].value = waterTexture;
      renderer.setRenderTarget(this.texture);
      renderer.setClearColor(black, 0);
      renderer.clear();
      renderer.render(this._causticMesh, this._camera);
    }
  }

  class Water {
    constructor() {
      this.geometry = new THREE.PlaneBufferGeometry(2, 2, 200, 200);
      const shadersPromises = [
        Promise.resolve(window.WaterShaders.water_vertex),
        Promise.resolve(window.WaterShaders.water_fragment)
      ];
      this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
        this.material = new THREE.RawShaderMaterial({
          uniforms: {
              light: { value: light },
              tiles: { value: tiles },
              sky: { value: textureCube },
              water: { value: null },
              causticTex: { value: null },
              underwater: { value: false },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false; // prevents disappearing when panning
      });
    }

    draw(renderer, waterTexture, causticsTexture) {
      this.material.uniforms['water'].value = waterTexture;
      this.material.uniforms['causticTex'].value = causticsTexture;
      
      this.material.side = THREE.FrontSide;
      this.material.uniforms['underwater'].value = true;
      renderer.render(this.mesh, camera);

      this.material.side = THREE.BackSide;
      this.material.uniforms['underwater'].value = false;
      renderer.render(this.mesh, camera);
    }
  }

  class Pool {
    constructor() {
      this._geometry = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        -1, -1, -1, -1, -1, 1, -1, 1, -1, -1, 1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, 1,
        -1, -1, -1, 1, -1, -1, -1, -1, 1, 1, -1, 1, -1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1, 1,
        -1, -1, -1, -1, 1, -1, 1, -1, -1, 1, 1, -1, -1, -1, 1, 1, -1, 1, -1, 1, 1, 1, 1, 1
      ]);
      const indices = new Uint32Array([
        0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7, 12, 13, 14, 14, 13, 15,
        16, 17, 18, 18, 17, 19, 20, 21, 22, 22, 21, 23
      ]);
      this._geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      this._geometry.setIndex(new THREE.BufferAttribute(indices, 1));
      const shadersPromises = [
        loadFile('shaders/pool/vertex.glsl'),
        loadFile('shaders/pool/fragment.glsl')
      ];
      this.loaded = Promise.all(shadersPromises).then(([vertexShader, fragmentShader]) => {
        this._material = new THREE.RawShaderMaterial({
          uniforms: {
              light: { value: light },
              tiles: { value: tiles },
              water: { value: null },
              causticTex: { value: null },
          },
          vertexShader: vertexShader,
          fragmentShader: fragmentShader,
        });
        this._material.side = THREE.FrontSide;
        this._mesh = new THREE.Mesh(this._geometry, this._material);
        this._mesh.frustumCulled = false;
      });
    }

    draw(renderer, waterTexture, causticsTexture) {
      this._material.uniforms['water'].value = waterTexture;
      this._material.uniforms['causticTex'].value = causticsTexture;
      renderer.render(this._mesh, camera);
    }
  }

  const waterSimulation = new WaterSimulation();
  const water = new Water();
  const caustics = new Caustics(water.geometry);
  const pool = new Pool();

  // Helper vectors for rendering
  const nozzlePosition = new THREE.Vector3(0, 1, 3.4); 
  const machineWorldNozzle = new THREE.Vector3();
  const machineQuat = new THREE.Quaternion();

  let lastBallPos = new THREE.Vector3();
  let lastMachinePos = new THREE.Vector3();

  // Main rendering loop
  function animate() {
    window.requestAnimationFrame(animate);

    // --- Object Movement & Ripple Generation ---
    // If the ball has moved on the XZ plane, create a ripple
    const currentBallPos = ballMesh.position.clone();
    if (currentBallPos.distanceTo(lastBallPos) > 0.005) {
        waterSimulation.addDrop(renderer, currentBallPos.x, currentBallPos.z, waterConfig.interactionRadius.value, waterConfig.interactionStrength.value);
        lastBallPos.copy(currentBallPos);
    }
    
    // If the machine has moved
    const currentMachinePos = machineGroup.position.clone();
    if (currentMachinePos.distanceTo(lastMachinePos) > 0.005) {
        waterSimulation.addDrop(renderer, currentMachinePos.x, currentMachinePos.z, waterConfig.interactionRadius.value * 1.5, waterConfig.interactionStrength.value * 1.5);
        lastMachinePos.copy(currentMachinePos);
    }

    // Apply Random Background Rain
    for (let r = 0; r < waterConfig.rainAmount.value; r++) {
        if (Math.random() < 0.05) {
            waterSimulation.addDrop(
                renderer,
                (Math.random() * 2) - 1,
                (Math.random() * 2) - 1,
                waterConfig.interactionRadius.value * 0.5,
                waterConfig.interactionStrength.value * (Math.random() * 0.5 + 0.5)
            );
        }
    }

    // --- Fog Particle Update ---
    machineGroup.getWorldPosition(machineWorldNozzle);
    machineGroup.getWorldQuaternion(machineQuat);

    // Get true nozzle world position
    const localNozzle = nozzlePosition.clone().multiplyScalar(0.15); // applying group scale
    const spawnPos = localNozzle.applyQuaternion(machineQuat).add(machineGroup.position);

    // Create air stream ripples ahead of nozzle
    if (Math.random() < 0.2) {
        const streamDir = new THREE.Vector3(0, 0, 1).applyQuaternion(machineQuat);
        waterSimulation.addDrop(
            renderer,
            spawnPos.x + streamDir.x * 0.2,
            spawnPos.z + streamDir.z * 0.2,
            0.02,
            (Math.random() - 0.5) * 0.012 * config.sprayRate.value
        );
    }

    for (let i = 0; i < config.sprayRate.value; i++) {
        const pData = particlesData[spawnIndex];
        pData.active = true;
        pData.life = 0;
        pData.maxLife = config.lifespan.value * (0.8 + Math.random() * 0.4); 
        
        pData.velocity.set(
            (Math.random() - 0.5) * config.spread.value,
            (Math.random() - 0.5) * config.spread.value,
            config.forwardSpeed.value * (0.8 + Math.random() * 0.4) // adjust scale for pool context
        ).multiplyScalar(0.04);

        pData.velocity.applyQuaternion(machineQuat);

        positions[spawnIndex * 3] = spawnPos.x;
        positions[spawnIndex * 3 + 1] = spawnPos.y;
        positions[spawnIndex * 3 + 2] = spawnPos.z;

        pData.baseOpacity = 0.3 + Math.random() * 0.4;
        spawnIndex = (spawnIndex + 1) % maxParticles;
    }

    for (let i = 0; i < maxParticles; i++) {
        const pData = particlesData[i];
        if (!pData.active) continue;

        pData.life++;
        const lifeProgress = pData.life / pData.maxLife;

        if (lifeProgress >= 1.0) {
            pData.active = false;
            opacities[i] = 0;
            positions[i * 3] = 10000; 
            continue;
        }

        pData.velocity.multiplyScalar(config.drag.value);
        pData.velocity.y += config.buoyancy.value * 0.05; // Scoped for smaller pool

        positions[i * 3] += pData.velocity.x;
        positions[i * 3 + 1] += pData.velocity.y;
        positions[i * 3 + 2] += pData.velocity.z;

        // Adjusted node size scaling for the Water Demo context
        sizes[i] = (config.startSize.value + (config.endSize.value - config.startSize.value) * lifeProgress) * 0.05;

        // Collision logic with the pool bounds (-1 to 1 in X/Z, 0 to 1 open top)
        // Approximate bounce
        if (positions[i * 3] > 1 || positions[i * 3] < -1) pData.velocity.x *= -0.2;
        if (positions[i * 3 + 2] > 1 || positions[i * 3 + 2] < -1) pData.velocity.z *= -0.2;
        
        // Float on water surface (appx y = 0)
        // Now that the shader soft-clips below water, we can let the centers securely rest exactly at the water level
        if (positions[i * 3 + 1] < 0) {
            // "Smooth out" across the water when descending
            if (pData.velocity.y < 0) {
                const spread = Math.abs(pData.velocity.y) * 0.6;
                // Add lateral velocity spreading strictly outward horizontally 
                const dx = pData.velocity.x;
                const dz = pData.velocity.z;
                const len = Math.sqrt(dx * dx + dz * dz) || 1;
                
                pData.velocity.x += (dx / len) * spread;
                pData.velocity.z += (dz / len) * spread;
            }
            positions[i * 3 + 1] = 0;
            pData.velocity.y = 0; // Prevent bouncing, stick to the water
            
            // Simulating a low friction coefficient when sliding over the water
            pData.velocity.x *= 0.98;
            pData.velocity.z *= 0.98;
        }

        const fade = Math.pow(1.0 - lifeProgress, 1.5);
        opacities[i] = pData.baseOpacity * fade;
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.opacity.needsUpdate = true;

    // --- Water Simulation Physics ---
    waterSimulation.stepSimulation(renderer);
    waterSimulation.updateNormals(renderer);

    const waterTexture = waterSimulation.texture.texture;
    caustics.update(renderer, waterTexture);
    const causticsTexture = caustics.texture.texture;

    // --- Render Pipeline ---
    // 1. Render the Background (clear)
    renderer.setRenderTarget(null);
    renderer.setClearColor(bgColor, 1);
    renderer.clear();

    // 2. Render the custom WebGL Water & Pool
    water.draw(renderer, waterTexture, causticsTexture);
    pool.draw(renderer, waterTexture, causticsTexture);

    // 3. Render the Fog Machine, Ball, and Particle System into the exact same depth buffer
    renderer.render(mainScene, camera);

    controls.update();
  }

  // Mouse drops
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const targetgeometry = new THREE.PlaneGeometry(2, 2);
  for (let vertex of targetgeometry.vertices) {
    vertex.z = - vertex.y;
    vertex.y = 0.;
  }
  const targetmesh = new THREE.Mesh(targetgeometry);

  function onMouseMove(event) {
    // Only send drops if we're not currently dragging any transform controls
    // Transform dragging blocks orbit so test against `controls.enabled`.
    // Wait, TransformControls disables OrbitControls on drag!
    if (!controls.enabled) return;

    if (event.buttons !== 1) return; // Only if clicking/dragging

    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * 2 / width - 1;
    mouse.y = - (event.clientY - rect.top) * 2 / height + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(targetmesh);

    for (let intersect of intersects) {
      waterSimulation.addDrop(renderer, intersect.point.x, intersect.point.z, waterConfig.interactionRadius.value, waterConfig.interactionStrength.value * 2.0);
    }
  }

  const loaded = [waterSimulation.loaded, caustics.loaded, water.loaded, pool.loaded];

  Promise.all(loaded).then(() => {
    canvas.addEventListener('mousemove', { handleEvent: onMouseMove });

    // Initial ripples
    for (var i = 0; i < 20; i++) {
        waterSimulation.addDrop(
            renderer,
            Math.random() * 2 - 1, Math.random() * 2 - 1,
            0.03, (i & 1) ? 0.02 : -0.02
        );
    }
    
    lastBallPos.copy(ballMesh.position);
    lastMachinePos.copy(machineGroup.position);

    animate();
  });

});
