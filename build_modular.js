const fs = require('fs');
const path = require('path');

const destPath = 'c:\\Users\\nolim\\Desktop\\desktop\\3D-Unified-Workspace\\src\\characters\\ModularMan\\index.html';

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Character Studio - Modular Man</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #050505;
            --glass-bg: rgba(15, 15, 20, 0.65);
            --glass-border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-dim: #94a3b8;
            --accent: #3b82f6;
            --accent-glow: rgba(59, 130, 246, 0.4);
        }
        body { margin: 0; overflow: hidden; background: var(--bg-color); font-family: 'Inter', sans-serif; color: var(--text-main); }
        #canvas-container { position: absolute; inset: 0; }
        #ui-layer { position: absolute; inset: 0; pointer-events: none; z-index: 10; display: flex; }
        .sidebar {
            width: 340px; height: 100%; pointer-events: auto;
            background: var(--glass-bg); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
            border-right: 1px solid var(--glass-border); display: flex; flex-direction: column;
            box-shadow: 4px 0 32px rgba(0,0,0,0.5); transition: transform 0.3s ease;
        }
        .header { padding: 32px 24px 24px; border-bottom: 1px solid var(--glass-border); }
        .header h1 { margin: 0 0 8px; font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 900; letter-spacing: 2px; color: #fff; text-shadow: 0 0 12px var(--accent-glow); }
        .header p { margin: 0; font-size: 12px; color: var(--text-dim); line-height: 1.5; }
        
        .section { padding: 24px; border-bottom: 1px solid var(--glass-border); }
        .section h3 { margin: 0 0 16px; font-size: 11px; font-weight: 700; color: #64748b; letter-spacing: 1.5px; text-transform: uppercase; }
        
        .control-group { margin-bottom: 16px; }
        .control-group:last-child { margin-bottom: 0; }
        .control-header { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; font-weight: 600; }
        .control-val { color: var(--accent); font-family: monospace; }
        
        input[type=range] { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; appearance: none; outline: none; }
        input[type=range]::-webkit-slider-thumb { appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); cursor: pointer; box-shadow: 0 0 10px var(--accent-glow); }
        input[type=color] { width: 100%; height: 32px; border: none; border-radius: 6px; cursor: pointer; background: none; }
        input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type=color]::-webkit-color-swatch { border: 1px solid var(--glass-border); border-radius: 6px; }
        
        .glow-btn { width: 100%; padding: 14px; background: var(--accent); color: white; border: none; border-radius: 8px; font-family: 'Orbitron', sans-serif; font-weight: 700; font-size: 12px; letter-spacing: 1px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 16px var(--accent-glow); margin-top: 10px; pointer-events: auto; }
        .glow-btn:hover { background: #2563eb; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(37,99,235,0.6); }
        
        #crosshair { display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 24px; height: 24px; pointer-events: none; }
        #crosshair::before, #crosshair::after { content: ''; position: absolute; background: rgba(255,255,255,0.8); }
        #crosshair::before { top: 11px; left: 0; width: 24px; height: 2px; }
        #crosshair::after { left: 11px; top: 0; height: 24px; width: 2px; }
        #crosshair.hit::before, #crosshair.hit::after { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
        
        #weapon-wheel { display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 220px; height: 220px; pointer-events: none; z-index: 60; }
        #weapon-wheel.active { display: block; }
        .wheel-item { position: absolute; width: 70px; height: 70px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-direction: column; font-size: 10px; font-weight: 900; color: #9ca3af; border: 2px solid rgba(255,255,255,0.1); background: rgba(17,24,39,0.85); transition: all 0.15s; }
        .wheel-item.highlighted { color: white; border-color: #60a5fa; background: rgba(37,99,235,0.6); box-shadow: 0 0 20px rgba(96,165,250,0.4); transform: scale(1.15); }
        
        .controls-hint { position: absolute; bottom: 20px; right: 20px; background: var(--glass-bg); padding: 15px; border-radius: 8px; border: 1px solid var(--glass-border); font-size: 11px; color: var(--text-dim); display: none; pointer-events: none; }
        .controls-hint span { color: var(--text-main); font-weight: bold; margin-right: 8px; }
    </style>
</head>
<body>
    <div id="canvas-container"></div>
    <div id="crosshair"></div>
    <div id="weapon-wheel">
        <div class="wheel-item" id="wheel-0" style="top: 0; left: 50%; transform: translateX(-50%);">HANDS</div>
        <div class="wheel-item" id="wheel-1" style="top: 50%; right: 0; transform: translateY(-50%);">PISTOL</div>
        <div class="wheel-item" id="wheel-2" style="bottom: 0; left: 50%; transform: translateX(-50%);">AXE</div>
        <div class="wheel-item" id="wheel-3" style="top: 50%; left: 0; transform: translateY(-50%);">MAGIC</div>
    </div>
    <div class="controls-hint" id="controls-hint">
        <div><span>WASD</span> Move</div>
        <div><span>SHIFT</span> Sprint</div>
        <div><span>SPACE</span> Jump</div>
        <div><span>CLICK</span> Shoot/Attack</div>
        <div><span>HOLD Q</span> Weapon Wheel</div>
        <div><span>ESC</span> Exit Control Mode</div>
    </div>
    
    <div id="ui-layer">
        <div class="sidebar" id="sidebar">
            <div class="header">
                <h1>MODULAR MAN</h1>
                <p>Studio Edition</p>
            </div>
            <div class="section" style="flex:1; overflow-y:auto;">
                <h3>AESTHETICS & SHAPING</h3>
                <div class="control-group">
                    <div class="control-header"><span>Torso Color</span><span class="control-val" id="val-colorTorso">#3b82f6</span></div>
                    <input type="color" id="in-colorTorso" value="#3b82f6">
                </div>
                <div class="control-group">
                    <div class="control-header"><span>Head Color</span><span class="control-val" id="val-colorHead">#ffdbac</span></div>
                    <input type="color" id="in-colorHead" value="#ffdbac">
                </div>
                <div class="control-group">
                    <div class="control-header"><span>Limbs Color</span><span class="control-val" id="val-colorLimbs">#1e40af</span></div>
                    <input type="color" id="in-colorLimbs" value="#1e40af">
                </div>
                <div class="control-group">
                    <div class="control-header"><span>Torso Bulk</span><span class="control-val" id="val-scaleTorso">1.0</span></div>
                    <input type="range" id="in-scaleTorso" min="0.5" max="2.0" step="0.05" value="1.0">
                </div>
                <div class="control-group">
                    <div class="control-header"><span>Head Size</span><span class="control-val" id="val-scaleHead">1.0</span></div>
                    <input type="range" id="in-scaleHead" min="0.5" max="2.0" step="0.05" value="1.0">
                </div>
                <div class="control-group">
                    <div class="control-header"><span>Arm Thickness</span><span class="control-val" id="val-scaleArms">1.0</span></div>
                    <input type="range" id="in-scaleArms" min="0.5" max="2.0" step="0.05" value="1.0">
                </div>
                <div class="control-group">
                    <div class="control-header"><span>Leg Thickness</span><span class="control-val" id="val-scaleLegs">1.0</span></div>
                    <input type="range" id="in-scaleLegs" min="0.5" max="2.0" step="0.05" value="1.0">
                </div>
                
                <h3 style="margin-top:24px;">SPELLS & COMBAT</h3>
                <div class="control-group">
                    <div class="control-header"><span>Spell Core Color</span><span class="control-val" id="val-spellCore">#00f0ff</span></div>
                    <input type="color" id="in-spellCore" value="#00f0ff">
                </div>
                <div class="control-group">
                    <div class="control-header"><span>Spell Glow Color</span><span class="control-val" id="val-spellGlow">#0055ff</span></div>
                    <input type="color" id="in-spellGlow" value="#0055ff">
                </div>
                
                <button id="btn-control" class="glow-btn" style="background:#10b981; box-shadow: 0 4px 16px rgba(16,185,129,0.4); margin-top: 24px;">ENTER CONTROL MODE</button>
            </div>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script src="https://nolimitnexus.github.io/3D-Unified-Workspace/shared-characters.js"></script>
    <script>
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0f1e);
        scene.fog = new THREE.FogExp2(0x0a0f1e, 0.05);

        const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 100);
        camera.position.set(0, 1.2, 3);
        
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.getElementById('canvas-container').appendChild(renderer.domElement);

        const orbit = new THREE.OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true; orbit.target.set(0, 0.9, 0);
        
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dl = new THREE.DirectionalLight(0xffffff, 1.2);
        dl.position.set(3, 5, 4); dl.castShadow = true; scene.add(dl);
        
        const grid = new THREE.GridHelper(40, 40, 0x38bdf8, 0x1e293b);
        grid.position.y = -0.01; grid.material.opacity = 0.2; grid.material.transparent = true; scene.add(grid);

        let myCharacter = window.buildModularMan('#3b82f6');
        scene.add(myCharacter);
        
        const camRig = new THREE.Group();
        scene.add(camRig);
        camRig.add(camera);

        let state = {
            isControl: false, inventory: 0, shootTime: 0,
            camYaw: 0, camPitch: 0, jumpTime: -1, isCrouching: false,
            colorTorso: '#3b82f6', colorHead: '#ffdbac', colorLimbs: '#1e40af',
            scaleTorso: 1, scaleHead: 1, scaleArms: 1, scaleLegs: 1,
            spellCore: '#00f0ff', spellGlow: '#0055ff',
            tracers: [], projectiles: []
        };
        
        // Setup UI Sync
        const keys = ['colorTorso', 'colorHead', 'colorLimbs', 'scaleTorso', 'scaleHead', 'scaleArms', 'scaleLegs', 'spellCore', 'spellGlow'];
        keys.forEach(k => {
            const inEl = document.getElementById('in-'+k);
            const valEl = document.getElementById('val-'+k);
            inEl.addEventListener('input', (e) => {
                state[k] = (inEl.type === 'range') ? parseFloat(e.target.value) : e.target.value;
                valEl.innerText = (inEl.type === 'range') ? state[k].toFixed(2) : state[k];
                applyConfig();
            });
        });

        function applyConfig() {
            const bp = myCharacter.userData.bp;
            if(!bp) return;
            bp.torso.material.color.set(state.colorTorso);
            bp.head.material.color.set(state.colorHead);
            bp.pelvis.material.color.set(state.colorTorso);
            bp.armL.children[0].material.color.set(state.colorLimbs);
            bp.armR.children[0].material.color.set(state.colorLimbs);
            bp.legL.children[0].material.color.set(state.colorLimbs);
            bp.legR.children[0].material.color.set(state.colorLimbs);
            bp.torso.scale.set(state.scaleTorso, state.scaleTorso, state.scaleTorso);
            bp.head.scale.set(state.scaleHead, state.scaleHead, state.scaleHead);
            bp.armL.scale.set(state.scaleArms, state.scaleArms, state.scaleArms);
            bp.armR.scale.set(state.scaleArms, state.scaleArms, state.scaleArms);
            bp.legL.scale.set(state.scaleLegs, state.scaleLegs, state.scaleLegs);
            bp.legR.scale.set(state.scaleLegs, state.scaleLegs, state.scaleLegs);
        }

        let keyState = {};
        document.addEventListener('keydown', e => keyState[e.code] = true);
        document.addEventListener('keyup', e => {
            keyState[e.code] = false;
            if (e.code === 'KeyQ') closeWeaponWheel();
        });

        document.getElementById('btn-control').addEventListener('click', () => {
            renderer.domElement.requestPointerLock();
        });

        document.addEventListener('pointerlockchange', () => {
            state.isControl = (document.pointerLockElement === renderer.domElement);
            document.getElementById('sidebar').style.transform = state.isControl ? 'translateX(-100%)' : 'translateX(0)';
            document.getElementById('crosshair').style.display = state.isControl ? 'block' : 'none';
            document.getElementById('controls-hint').style.display = state.isControl ? 'block' : 'none';
            if(state.isControl) {
                orbit.enabled = false;
                camRig.position.copy(myCharacter.position);
                camera.position.set(0.5, 1.5, 3);
            } else {
                orbit.enabled = true;
                camera.position.copy(camRig.localToWorld(new THREE.Vector3(0.5, 1.5, 3)));
                camera.lookAt(myCharacter.position);
                camRig.position.set(0,0,0); camera.rotation.set(0,0,0);
            }
        });

        document.addEventListener('mousemove', e => {
            if(!state.isControl) return;
            if(wheelOpen) {
                wheelX += e.movementX; wheelY += e.movementY; updateWheel();
            } else {
                state.camYaw -= e.movementX * 0.003;
                state.camPitch += e.movementY * 0.003;
                state.camPitch = Math.max(-1.0, Math.min(1.2, state.camPitch));
            }
        });

        // Weapon Wheel
        let wheelOpen = false, wheelX = 0, wheelY = 0, wheelSel = -1;
        document.addEventListener('keydown', e => {
            if(e.code === 'KeyQ' && state.isControl && !e.repeat) {
                wheelOpen = true; wheelX = 0; wheelY = 0; wheelSel = -1;
                document.getElementById('weapon-wheel').classList.add('active');
            }
        });
        function closeWeaponWheel() {
            if(!wheelOpen) return;
            wheelOpen = false; document.getElementById('weapon-wheel').classList.remove('active');
            if(wheelSel >= 0) state.inventory = wheelSel;
            for(let i=0;i<4;i++) document.getElementById('wheel-'+i).classList.remove('highlighted');
        }
        function updateWheel() {
            const dist = Math.hypot(wheelX, wheelY);
            if(dist < 20) wheelSel = -1;
            else {
                const angle = Math.atan2(wheelX, -wheelY) * (180/Math.PI);
                if(angle >= -45 && angle < 45) wheelSel = 0;
                else if(angle >= 45 && angle <= 135) wheelSel = 1;
                else if(angle > 135 || angle < -135) wheelSel = 2;
                else wheelSel = 3;
            }
            for(let i=0;i<4;i++) document.getElementById('wheel-'+i).classList.toggle('highlighted', i === wheelSel);
        }

        // Shooting & Spells
        document.addEventListener('mousedown', e => {
            if(!state.isControl) return;
            if(state.inventory === 1) shootGun();
            else if(state.inventory === 3) shootMagic();
            else state.shootTime = 0.2; // punch/axe swing
        });

        function shootGun() {
            state.shootTime = 0.15;
            const gun = myCharacter.userData.bp.gun;
            if(!gun) return;
            const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xffdd00, side: THREE.DoubleSide, transparent:true, opacity:0.9 }));
            flash.position.set(0, -0.28, 0.05); flash.rotation.x = -Math.PI/2; flash.rotation.y = Math.random()*Math.PI;
            gun.add(flash);
            setTimeout(()=>gun.remove(flash), 50);

            const t = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 4), new THREE.MeshBasicMaterial({color: 0xffffee, transparent:true, opacity:0.8}));
            t.geometry.rotateX(Math.PI/2);
            scene.add(t);
            const start = new THREE.Vector3(); gun.localToWorld(start.set(0,-0.25,0.05));
            const tgt = new THREE.Vector3(); camRig.localToWorld(tgt.set(0,0,100));
            t.position.copy(start); t.lookAt(tgt);
            const v = tgt.clone().sub(start).normalize().multiplyScalar(120);
            state.tracers.push({mesh:t, v:v, life:1.0});
            document.getElementById('crosshair').classList.add('hit');
            setTimeout(()=>document.getElementById('crosshair').classList.remove('hit'), 100);
        }

        function shootMagic() {
            state.shootTime = 0.2;
            const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshBasicMaterial({color: state.spellCore}));
            const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshBasicMaterial({color: state.spellGlow, transparent:true, opacity:0.5, blending: THREE.AdditiveBlending}));
            p.add(glow);
            scene.add(p);
            
            const start = new THREE.Vector3(); myCharacter.userData.bp.armR.hand.localToWorld(start.set(0,-0.1,0));
            const tgt = new THREE.Vector3(); camRig.localToWorld(tgt.set(0,0,100));
            p.position.copy(start);
            const v = tgt.clone().sub(start).normalize().multiplyScalar(40);
            state.projectiles.push({mesh:p, v:v, life:2.0});
        }

        const clock = new THREE.Clock();
        function animate() {
            requestAnimationFrame(animate);
            const delta = clock.getDelta();
            const time = clock.getElapsedTime();

            if(!state.isControl) {
                orbit.update();
            } else {
                // Movement
                const speed = keyState['ShiftLeft'] ? 12 : 6;
                const mX = (keyState['KeyA']?1:0) - (keyState['KeyD']?1:0);
                const mZ = (keyState['KeyW']?1:0) - (keyState['KeyS']?1:0);
                const isMoving = Math.abs(mX)>0 || Math.abs(mZ)>0;
                
                if(isMoving) {
                    const dir = new THREE.Vector3(mX, 0, mZ).normalize();
                    dir.applyAxisAngle(new THREE.Vector3(0,1,0), state.camYaw);
                    let targetYaw = Math.atan2(dir.x, dir.z);
                    let diff = targetYaw - myCharacter.rotation.y;
                    while(diff < -Math.PI) diff += Math.PI*2;
                    while(diff > Math.PI) diff -= Math.PI*2;
                    myCharacter.rotation.y += diff * 12 * delta;
                    myCharacter.position.addScaledVector(dir, speed * delta);
                }

                if(keyState['Space'] && state.jumpTime < 0) state.jumpTime = 0;
                if(state.jumpTime >= 0) {
                    state.jumpTime += delta * 1.5;
                    myCharacter.position.y = Math.sin(Math.min(state.jumpTime, 1) * Math.PI) * 1.5;
                    if(state.jumpTime > 1) { state.jumpTime = -1; myCharacter.position.y = 0; }
                }

                camRig.position.copy(myCharacter.position);
                camRig.rotation.y = state.camYaw;
                camera.rotation.x = state.camPitch;
            }

            if(state.shootTime > 0) state.shootTime -= delta;

            if(window.animateCharacter) {
                const isMoving = (state.isControl && (keyState['KeyW']||keyState['KeyS']||keyState['KeyA']||keyState['KeyD']));
                const isSprinting = keyState['ShiftLeft'];
                window.animateCharacter(myCharacter, 'modular', isMoving, isSprinting, false, state.jumpTime, time, delta, 0, state.inventory, state.shootTime, state.camPitch);
            }

            // Projectiles
            for(let i=state.tracers.length-1; i>=0; i--) {
                const t = state.tracers[i];
                t.mesh.position.addScaledVector(t.v, delta);
                t.life -= delta;
                if(t.life <= 0) { scene.remove(t.mesh); state.tracers.splice(i,1); }
            }
            for(let i=state.projectiles.length-1; i>=0; i--) {
                const p = state.projectiles[i];
                p.mesh.position.addScaledVector(p.v, delta);
                p.life -= delta;
                if(p.life <= 0) { scene.remove(p.mesh); state.projectiles.splice(i,1); }
            }

            renderer.render(scene, camera);
        }
        
        applyConfig();
        animate();
    </script>
</body>
</html>`;

fs.writeFileSync(destPath, htmlContent);
console.log('Successfully wrote studio logic to ModularMan/index.html');
