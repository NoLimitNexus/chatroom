// studio.js — Goop Lab
(function(){
'use strict';

// STATE
var ver='original', animState='idle', turntable=false, inventory=0;
var controlMode=false, animTime=0, jumpTime=-1;
var keys={}, camYaw=0, camPitch=0;
var goop=null, drips=[], dripPool=[];
var fpsN=0, fpsT=performance.now();

// CONFIG — sliders write here, render reads here
var C = {
  color:'#059669', scaleX:1, scaleY:1, scaleZ:1,
  opacity:0.4, roughness:0.2, metalness:0.4, clearcoat:1,
  emissiveColor:'#064e3b', emissiveIntensity:0.1,
  // prototype extras
  dripRate:3, dripSize:0.04, dripLife:2, dripGravity:2,
  wobbleAmp:0.012, wobbleSpeed:3,
  innerGlow:0.5, transmission:0.6, ior:1.45, thickness:0.8,
  // scene
  bgColor:'#0a0f1e', floorColor:'#0f172a', fogDensity:0.05,
  keyIntensity:1.2, fillColor:'#0ea5e9', rimColor:'#818cf8', ambient:0.6,
  gridOpacity:0.2
};

// THREE SETUP
var container=document.getElementById('canvas-container');
var scene=new THREE.Scene();
scene.background=new THREE.Color(C.bgColor);
scene.fog=new THREE.FogExp2(C.bgColor,C.fogDensity);

var camera=new THREE.PerspectiveCamera(45,1,0.1,100);
camera.position.set(0,1,3.5);
var renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.0;
container.appendChild(renderer.domElement);

var orbit=new THREE.OrbitControls(camera,renderer.domElement);
orbit.enableDamping=true; orbit.dampingFactor=0.06;
orbit.target.set(0,0.5,0); orbit.minDistance=1; orbit.maxDistance=8;

// Lighting
var ambLight=new THREE.AmbientLight(0xffffff,C.ambient); scene.add(ambLight);
var dirLight=new THREE.DirectionalLight(0xffffff,C.keyIntensity);
dirLight.position.set(3,5,4); dirLight.castShadow=true; scene.add(dirLight);
var fillLight=new THREE.DirectionalLight(C.fillColor,0.5);
fillLight.position.set(-3,2,-3); scene.add(fillLight);
var rimLight=new THREE.DirectionalLight(C.rimColor,0.8);
rimLight.position.set(0,3,-5); scene.add(rimLight);

// Floor
var grid=new THREE.GridHelper(20,20,0x38bdf8,0x1e293b);
grid.position.y=-0.01; grid.material.opacity=C.gridOpacity; grid.material.transparent=true;
scene.add(grid);
var floorMat=new THREE.MeshStandardMaterial({color:C.floorColor,roughness:0.1,metalness:0.8});
var floor=new THREE.Mesh(new THREE.CircleGeometry(6,64),floorMat);
floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

// Resize
function onResize(){
  var w=container.clientWidth,h=container.clientHeight;
  if(!w||!h) return;
  camera.aspect=w/h; camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
window.addEventListener('resize',onResize);

// BUILD PROTOTYPE GOOP — enhanced jelly creature
function buildProtoGoop(){
  var group=new THREE.Group();
  var geo=new THREE.SphereGeometry(0.35,32,32);
  var pos=geo.attributes.position;
  // Store original positions for wobble
  var orig=new Float32Array(pos.array.length);
  orig.set(pos.array);

  // Shape deformation (same as original)
  for(var i=0;i<pos.count;i++){
    var x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    var yN=(y+0.35)/0.7;
    var sf=1.4-Math.pow(yN,1.5)*0.7;
    var tail=0;
    if(z<0){ tail=Math.pow(1-yN,2)*0.6*(-z/0.35); }
    pos.setXYZ(i,x*sf,y,z*sf-tail);
  }
  // Save shaped positions as the base
  var shaped=new Float32Array(pos.array.length);
  shaped.set(pos.array);
  geo.computeVertexNormals();

  var mat=new THREE.MeshPhysicalMaterial({
    color:C.color, roughness:C.roughness, metalness:C.metalness,
    transparent:true, opacity:C.opacity,
    clearcoat:C.clearcoat, clearcoatRoughness:0.05,
    emissive:C.emissiveColor, emissiveIntensity:C.emissiveIntensity,
    transmission:C.transmission, thickness:C.thickness, ior:C.ior,
    depthWrite:true, side:THREE.DoubleSide
  });

  var blob=new THREE.Mesh(geo,mat);
  blob.position.y=0.35; blob.castShadow=true;
  blob.userData.origPositions=orig;
  blob.userData.shapedPositions=shaped;

  // Inner glow core
  var innerMat=new THREE.MeshBasicMaterial({
    color:0x0fffc2, transparent:true, opacity:C.innerGlow*0.3
  });
  var inner=new THREE.Mesh(new THREE.SphereGeometry(0.18,16,16),innerMat);
  inner.position.y=0.05;
  blob.add(inner);
  group.userData.innerCore=inner;
  group.userData.innerMat=innerMat;

  // Eyes (same style but with glow)
  var eyeGeo=new THREE.SphereGeometry(0.06,16,16);
  var eyeMat=new THREE.MeshBasicMaterial({color:0x0fffc2});
  var pupilGeo=new THREE.SphereGeometry(0.03,16,16);
  var pupilMat=new THREE.MeshBasicMaterial({color:0x0f172a});

  var leye=new THREE.Group();
  leye.add(new THREE.Mesh(eyeGeo,eyeMat));
  var lp=new THREE.Mesh(pupilGeo,pupilMat); lp.position.z=0.04; leye.add(lp);
  leye.position.set(-0.14,0.15,0.3); blob.add(leye);

  var reye=new THREE.Group();
  reye.add(new THREE.Mesh(eyeGeo,eyeMat));
  var rp=new THREE.Mesh(pupilGeo,pupilMat); rp.position.z=0.04; reye.add(rp);
  reye.position.set(0.14,0.15,0.3); blob.add(reye);

  // Eye glow halos
  var haloMat=new THREE.MeshBasicMaterial({color:0x0fffc2,transparent:true,opacity:0.15});
  leye.add(new THREE.Mesh(new THREE.SphereGeometry(0.09,8,8),haloMat));
  reye.add(new THREE.Mesh(new THREE.SphereGeometry(0.09,8,8),haloMat));

  // Weapons (same as original goop)
  var wMat=new THREE.MeshStandardMaterial({color:0x111111,roughness:0.6});
  var gun=new THREE.Group();
  gun.position.set(-0.5,0.35,0);
  gun.add(new THREE.Mesh(new THREE.BoxGeometry(0.04,0.05,0.3),wMat));
  var grip=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.12,0.05),wMat);
  grip.position.set(0,-0.06,0); gun.add(grip);
  gun.visible=false; group.add(gun); group.userData.gun=gun;

  var axe=new THREE.Group();
  var handle=new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.015,0.5),wMat);
  var aGeo=new THREE.BoxGeometry(0.15,0.1,0.02);
  var aPos=aGeo.attributes.position;
  for(var i=0;i<aPos.count;i++){if(aPos.getX(i)>0)aPos.setY(i,aPos.getY(i)*2);}
  aGeo.computeVertexNormals();
  var axeH=new THREE.Mesh(aGeo,new THREE.MeshStandardMaterial({color:0x888888,metalness:0.8,roughness:0.2}));
  axeH.position.set(0.08,0.2,0);
  axe.add(handle); axe.add(axeH);
  axe.position.set(-0.5,0.35,0); axe.rotation.x=Math.PI/2;
  axe.visible=false; group.add(axe); group.userData.axe=axe;

  group.add(blob);
  group.userData.blob=blob;
  group.userData.mat=mat;
  group.userData.isProto=true;
  return group;
}

// DRIP SYSTEM
var dripGeo=new THREE.SphereGeometry(1,6,6);
var dripMat=new THREE.MeshPhysicalMaterial({
  color:C.color, transparent:true, opacity:0.7,
  roughness:0.1, metalness:0.3, clearcoat:1
});

function spawnDrip(){
  if(!goop||!goop.userData.blob) return;
  var blob=goop.userData.blob;
  // Pick random point on surface
  var theta=Math.random()*Math.PI*2;
  var phi=Math.acos(2*Math.random()-1);
  var r=0.34;
  var lx=r*Math.sin(phi)*Math.cos(theta);
  var ly=r*Math.sin(phi)*Math.sin(theta);
  var lz=r*Math.cos(phi);

  var mesh;
  if(dripPool.length>0){ mesh=dripPool.pop(); mesh.visible=true; }
  else{
    mesh=new THREE.Mesh(dripGeo,dripMat.clone());
    mesh.castShadow=true;
  }
  mesh.material.color.set(C.color);
  mesh.material.opacity=0.7;
  var s=C.dripSize*(0.7+Math.random()*0.6);
  mesh.scale.set(s,s,s);

  // World position from blob surface
  var wp=new THREE.Vector3(lx,ly+0.35,lz);
  blob.localToWorld(wp);
  mesh.position.copy(wp);

  scene.add(mesh);
  drips.push({
    mesh:mesh, life:C.dripLife, maxLife:C.dripLife,
    vy:-0.1-Math.random()*0.3, // initial slide speed
    vx:(Math.random()-0.5)*0.2,
    vz:(Math.random()-0.5)*0.2,
    phase:0 // 0=sliding, 1=falling
  });
}

function updateDrips(dt){
  var el=document.getElementById('status-drips');
  if(el) el.innerText='DRIPS: '+drips.length;

  for(var i=drips.length-1;i>=0;i--){
    var d=drips[i];
    d.life-=dt;
    if(d.life<=0){
      d.mesh.visible=false; scene.remove(d.mesh);
      dripPool.push(d.mesh); drips.splice(i,1); continue;
    }
    // Gravity accelerates
    d.vy-=C.dripGravity*dt;
    d.mesh.position.x+=d.vx*dt;
    d.mesh.position.y+=d.vy*dt;
    d.mesh.position.z+=d.vz*dt;
    // Fade out
    var t=d.life/d.maxLife;
    d.mesh.material.opacity=t*0.7;
    // Stretch as falling
    var stretch=1+Math.max(0,-d.vy)*0.3;
    var s=C.dripSize*t;
    d.mesh.scale.set(s,s*stretch,s);
    // Floor removal
    if(d.mesh.position.y<-0.1){
      d.mesh.visible=false; scene.remove(d.mesh);
      dripPool.push(d.mesh); drips.splice(i,1);
    }
  }
}

// WOBBLE (prototype only)
function updateWobble(t){
  if(!goop||!goop.userData.isProto) return;
  var blob=goop.userData.blob;
  var pos=blob.geometry.attributes.position;
  var base=blob.userData.shapedPositions;
  var amp=C.wobbleAmp, spd=C.wobbleSpeed;
  for(var i=0;i<pos.count;i++){
    var bx=base[i*3], by=base[i*3+1], bz=base[i*3+2];
    var n=Math.sin(by*8+t*spd)*Math.cos(bx*6+t*spd*0.7);
    pos.setXYZ(i, bx+n*amp, by+Math.sin(t*spd*1.3+i*0.1)*amp*0.5, bz+n*amp*0.7);
  }
  pos.needsUpdate=true;
  blob.geometry.computeVertexNormals();
}

// APPLY CONFIG TO LIVE GOOP
function applyConfig(){
  if(!goop) return;
  var blob=goop.userData.blob;
  if(!blob) return;
  blob.material.color.set(C.color);
  blob.material.opacity=C.opacity;
  blob.material.roughness=C.roughness;
  blob.material.metalness=C.metalness;
  blob.material.clearcoat=C.clearcoat;
  if(blob.material.emissive) blob.material.emissive.set(C.emissiveColor);
  blob.material.emissiveIntensity=C.emissiveIntensity;
  blob.scale.set(C.scaleX,C.scaleY,C.scaleZ);

  if(goop.userData.isProto){
    blob.material.transmission=C.transmission;
    blob.material.thickness=C.thickness;
    blob.material.ior=C.ior;
    if(goop.userData.innerMat){
      goop.userData.innerMat.opacity=C.innerGlow*0.3;
    }
  }
  // Scene
  scene.background.set(C.bgColor); scene.fog.color.set(C.bgColor);
  scene.fog.density=C.fogDensity;
  floorMat.color.set(C.floorColor);
  dirLight.intensity=C.keyIntensity; fillLight.color.set(C.fillColor);
  rimLight.color.set(C.rimColor); ambLight.intensity=C.ambient;
  grid.material.opacity=C.gridOpacity;
}

// LOAD GOOP
function loadGoop(){
  if(goop){ scene.remove(goop); }
  drips.forEach(function(d){ scene.remove(d.mesh); }); drips=[];
  if(ver==='prototype') goop=buildProtoGoop();
  else goop=window.buildGoop(C.color);
  if(!goop) return;
  goop.position.set(0,0,0);
  scene.add(goop);
  applyConfig();
  document.getElementById('status-ver').innerText=ver.toUpperCase();
  // Show/hide proto-only controls
  var fxSec=document.getElementById('fx-proto-section');
  if(fxSec) fxSec.style.display=(ver==='prototype')?'block':'none';
}

// UI BUILDER
function makeControl(parent,label,key,type,min,max,step){
  var g=document.createElement('div'); g.className='control-group';
  var val=(type==='color')?C[key]:parseFloat(C[key]).toFixed(2);
  g.innerHTML='<div class="control-header"><span>'+label+'</span><span class="control-val">'+val+'</span></div>';
  var inp=document.createElement('input');
  inp.type=(type==='color')?'color':'range';
  inp.value=C[key];
  if(type!=='color'){inp.min=min;inp.max=max;inp.step=step;}
  inp.addEventListener('input',function(e){
    var v=(type==='color')?e.target.value:parseFloat(e.target.value);
    C[key]=v;
    g.querySelector('.control-val').innerText=(type==='color')?v:v.toFixed(2);
    applyConfig();
  });
  g.appendChild(inp); parent.appendChild(g);
}

function buildControls(){
  var s=document.getElementById('shape-controls'); s.innerHTML='';
  makeControl(s,'Color','color','color');
  makeControl(s,'Width','scaleX','range',0.5,2,0.05);
  makeControl(s,'Height','scaleY','range',0.5,2,0.05);
  makeControl(s,'Depth','scaleZ','range',0.5,2,0.05);

  var m=document.getElementById('material-controls'); m.innerHTML='';
  makeControl(m,'Opacity','opacity','range',0.1,1,0.05);
  makeControl(m,'Roughness','roughness','range',0,1,0.05);
  makeControl(m,'Metalness','metalness','range',0,1,0.05);
  makeControl(m,'Clearcoat','clearcoat','range',0,1,0.05);
  makeControl(m,'Emissive Color','emissiveColor','color');
  makeControl(m,'Emissive Power','emissiveIntensity','range',0,2,0.05);
  if(ver==='prototype'){
    makeControl(m,'Transmission','transmission','range',0,1,0.05);
    makeControl(m,'Thickness','thickness','range',0,3,0.1);
    makeControl(m,'IOR','ior','range',1,2.5,0.05);
    makeControl(m,'Inner Glow','innerGlow','range',0,1,0.05);
  }

  var f=document.getElementById('fx-controls'); f.innerHTML='';
  makeControl(f,'Drip Rate','dripRate','range',0,15,0.5);
  makeControl(f,'Drip Size','dripSize','range',0.01,0.1,0.005);
  makeControl(f,'Drip Life','dripLife','range',0.5,5,0.25);
  makeControl(f,'Gravity','dripGravity','range',0.5,8,0.25);
  makeControl(f,'Wobble Amp','wobbleAmp','range',0,0.05,0.002);
  makeControl(f,'Wobble Speed','wobbleSpeed','range',0.5,8,0.25);

  var g=document.getElementById('glow-controls'); g.innerHTML='';
  // (glow uses emissive from material tab)

  var sc=document.getElementById('scene-controls'); sc.innerHTML='';
  makeControl(sc,'Background','bgColor','color');
  makeControl(sc,'Floor','floorColor','color');
  makeControl(sc,'Fog Density','fogDensity','range',0,0.2,0.005);
  makeControl(sc,'Grid Opacity','gridOpacity','range',0,1,0.05);

  var lc=document.getElementById('light-controls'); lc.innerHTML='';
  makeControl(lc,'Key Light','keyIntensity','range',0,3,0.1);
  makeControl(lc,'Fill Color','fillColor','color');
  makeControl(lc,'Rim Color','rimColor','color');
  makeControl(lc,'Ambient','ambient','range',0,2,0.1);
}

// TABS
document.querySelectorAll('.p-tab').forEach(function(tab){
  tab.addEventListener('click',function(){
    document.querySelectorAll('.p-tab').forEach(function(t){t.classList.remove('active');});
    document.querySelectorAll('.panel-body').forEach(function(p){p.classList.add('hidden');});
    tab.classList.add('active');
    document.getElementById('panel-'+tab.dataset.panel).classList.remove('hidden');
  });
});

// VERSION TABS
document.querySelectorAll('.ver-tab').forEach(function(tab){
  tab.addEventListener('click',function(){
    document.querySelectorAll('.ver-tab').forEach(function(t){t.classList.remove('active');});
    tab.classList.add('active');
    ver=tab.dataset.ver;
    buildControls();
    loadGoop();
  });
});

// ANIM BUTTONS
document.querySelectorAll('.anim-btn').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.anim-btn').forEach(function(x){x.classList.remove('active');});
    b.classList.add('active'); animState=b.dataset.anim;
    document.getElementById('status-anim').innerText=animState;
  });
});
document.querySelectorAll('.weapon-btn').forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.weapon-btn').forEach(function(x){x.classList.remove('active');});
    b.classList.add('active'); inventory=parseInt(b.dataset.weapon);
  });
});

// TURNTABLE
document.getElementById('btn-turntable').addEventListener('click',function(){
  turntable=!turntable; this.dataset.active=turntable;
});
document.getElementById('btn-reset-camera').addEventListener('click',function(){
  camera.position.set(0,1,3.5); orbit.target.set(0,0.5,0);
});

// CONTROL MODE
var controlBtn=document.getElementById('btn-control');
var controlHud=document.getElementById('control-hud');

controlBtn.addEventListener('click',function(){
  if(!controlMode) renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange',function(){
  controlMode=(document.pointerLockElement===renderer.domElement);
  controlHud.classList.toggle('hidden',!controlMode);
  controlBtn.classList.toggle('active-control',controlMode);
  controlBtn.innerHTML=controlMode?'EXIT CONTROL':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2v20"/></svg> TAKE CONTROL';
  orbit.enabled=!controlMode;
  if(!controlMode){camYaw=0;camPitch=0;jumpTime=-1;}
});

document.addEventListener('mousemove',function(e){
  if(!controlMode) return;
  camYaw-=(e.movementX||0)*0.003;
  camPitch+=(e.movementY||0)*0.003;
  camPitch=Math.max(-1,Math.min(1.2,camPitch));
});
document.addEventListener('keydown',function(e){keys[e.code]=true;});
document.addEventListener('keyup',function(e){keys[e.code]=false;});

function updateControl(dt){
  if(!controlMode||!goop) return;
  var speed=keys.ShiftLeft?8:4;
  var mx=(keys.KeyA?1:0)-(keys.KeyD?1:0);
  var mz=(keys.KeyW?1:0)-(keys.KeyS?1:0);
  var moving=Math.abs(mx)>0||Math.abs(mz)>0;

  if(moving){
    var dir=new THREE.Vector3(mx,0,mz).normalize();
    dir.applyAxisAngle(new THREE.Vector3(0,1,0),camYaw);
    var targetY=Math.atan2(dir.x,dir.z);
    var diff=targetY-goop.rotation.y;
    while(diff<-Math.PI)diff+=Math.PI*2;
    while(diff>Math.PI)diff-=Math.PI*2;
    goop.rotation.y+=diff*10*dt;
    goop.position.addScaledVector(dir,speed*dt);
  }

  if(keys.Space&&jumpTime<0) jumpTime=0;
  if(jumpTime>=0){
    jumpTime+=dt*1.5;
    goop.position.y=Math.sin(Math.min(jumpTime,1)*Math.PI)*1.2;
    if(jumpTime>1){jumpTime=-1;goop.position.y=0;}
  }

  // Camera follow
  var camOff=new THREE.Vector3(0,1.3,3);
  camOff.applyAxisAngle(new THREE.Vector3(0,1,0),camYaw);
  camera.position.copy(goop.position).add(camOff);
  camera.lookAt(goop.position.x,goop.position.y+0.5,goop.position.z);

  // Override animState
  if(moving) animState=keys.ShiftLeft?'run':'walk';
  else if(animState==='walk'||animState==='run') animState='idle';
}

// EXPORT
document.getElementById('export-btn').addEventListener('click',function(){
  var out=document.getElementById('export-output');
  out.value=JSON.stringify({version:ver,config:C},null,2);
  out.select(); document.execCommand('copy');
  this.innerText='COPIED!';
  var self=this;
  setTimeout(function(){self.innerText='EXPORT CONFIG';},1500);
});

// RENDER
var clock=new THREE.Clock();
var dripAccum=0;

function animate(){
  requestAnimationFrame(animate);
  var dt=clock.getDelta();
  animTime+=dt;

  // FPS
  fpsN++;
  var now=performance.now();
  if(now-fpsT>=500){
    document.getElementById('status-fps').innerText=Math.round(fpsN/((now-fpsT)/1000))+' FPS';
    fpsN=0; fpsT=now;
  }

  updateControl(dt);
  if(!controlMode) orbit.update();
  if(turntable&&goop) goop.rotation.y+=dt*0.5;

  // Animate goop
  if(goop&&window.animateCharacter){
    var moving=(animState==='walk'||animState==='run');
    var sprinting=(animState==='run');
    try{
      window.animateCharacter(goop,'goop',moving,sprinting,false,jumpTime,animTime,dt,0,inventory,0,0);
    }catch(e){}
  }

  // Prototype extras
  if(ver==='prototype'&&goop){
    updateWobble(animTime);
    // Inner core pulse
    if(goop.userData.innerCore){
      goop.userData.innerCore.scale.setScalar(1+Math.sin(animTime*2)*0.1);
    }
    // Drips
    var moving2=(animState==='walk'||animState==='run');
    var rate=C.dripRate*(moving2?3:1);
    if(rate>0){
      dripAccum+=dt;
      var interval=1/rate;
      while(dripAccum>=interval){
        spawnDrip();
        dripAccum-=interval;
      }
    }
  }
  updateDrips(dt);

  renderer.render(scene,camera);
}

// INIT
function init(){
  if(!window.buildGoop){setTimeout(init,100);return;}
  onResize();
  buildControls();
  loadGoop();
  animate();
}
init();

})();
