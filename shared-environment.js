// Shared Environment for 3D-Unified-Workspace and Steam Chatroom
// This sets up the sky, lighting, and terrain.

window.setupSharedEnvironment = function(scene, renderer, camera) {
    // Sky and Fog Colors
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.015);

    // Renderer settings
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.6;
    if (renderer.shadowMap) {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // SKY
    if (THREE.Sky) {
        const sky = new THREE.Sky();
        sky.scale.setScalar(450000);
        scene.add(sky);

        const sun = new THREE.Vector3();
        const effectController = {
            turbidity: 10,
            rayleigh: 3,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.7,
            elevation: 25,
            azimuth: -150
        };

        const uniforms = sky.material.uniforms;
        uniforms[ 'turbidity' ].value = effectController.turbidity;
        uniforms[ 'rayleigh' ].value = effectController.rayleigh;
        uniforms[ 'mieCoefficient' ].value = effectController.mieCoefficient;
        uniforms[ 'mieDirectionalG' ].value = effectController.mieDirectionalG;

        const phi = THREE.MathUtils.degToRad( 90 - effectController.elevation );
        const theta = THREE.MathUtils.degToRad( effectController.azimuth );
        sun.setFromSphericalCoords( 1, phi, theta );
        uniforms[ 'sunPosition' ].value.copy( sun );

        // Sunlight (Spot)
        const spot = new THREE.DirectionalLight(0xfffff0, 1.5);
        spot.position.copy(sun).multiplyScalar(50);
        spot.castShadow = true;
        if (spot.shadow) {
            spot.shadow.mapSize.set(2048, 2048);
            spot.shadow.camera.near = 0.5;
            spot.shadow.camera.far = 150;
            spot.shadow.camera.left = -20;
            spot.shadow.camera.right = 20;
            spot.shadow.camera.top = 20;
            spot.shadow.camera.bottom = -20;
            spot.shadow.bias = -0.0005;
        }
        scene.add(spot);
    } else {
        // Fallback lighting if Sky is not loaded
        var dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(10, 20, 10); 
        dirLight.castShadow = true;
        if (dirLight.shadow) {
            dirLight.shadow.camera.top = 30; dirLight.shadow.camera.bottom = -30;
            dirLight.shadow.camera.left = -30; dirLight.shadow.camera.right = 30;
        }
        scene.add(dirLight);
    }

    // Ambient
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    // Fill Light
    const fill = new THREE.DirectionalLight(0x90b0d0, 0.6);
    fill.position.set(-10, 15, 10);
    scene.add(fill);

    // Global terrain height function for characters to walk on
    window.getSharedTerrainHeight = function(x, z) {
        if (Math.abs(x) < 3 && Math.abs(z) < 3) return 0;
        return (Math.sin(x * 0.2) * Math.cos(z * 0.2)) * 0.8 + (Math.sin(x * 0.05) * Math.cos(z * 0.05)) * 3.0;
    };

    // FLOOR
    const floorGeo = new THREE.PlaneGeometry(500, 500, 250, 250);
    const pos = floorGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = window.getSharedTerrainHeight(x, y);
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

    // WATER LAKES
    if (THREE.Water) {
        const waterGeometry = new THREE.PlaneGeometry(500, 500);
        window.sharedWater = new THREE.Water(
            waterGeometry,
            {
                textureWidth: 512,
                textureHeight: 512,
                waterNormals: new THREE.TextureLoader().load('https://nolimitnexus.github.io/3D-Unified-Workspace/waternormals.png', function ( texture ) {
                    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
                }),
                sunDirection: new THREE.Vector3(),
                sunColor: 0xaaaaaa,
                waterColor: 0x0055ff,
                distortionScale: 3.7,
                fog: scene.fog !== undefined
            }
        );
        window.sharedWater.rotation.x = - Math.PI / 2;
        window.sharedWater.position.y = -1.2; // Set lake height
        scene.add(window.sharedWater);
    }


    // CLOUDS (Low Memory InstancedMesh)
    const cloudGeo = new THREE.BoxGeometry(8, 3, 8);
    const cloudMat = new THREE.MeshStandardMaterial({ 
        color: 0xffffff, 
        roughness: 1.0, 
        metalness: 0.0,
        transparent: true,
        opacity: 0.8
    });
    
    const numClouds = 60;
    const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, numClouds);
    cloudMesh.castShadow = true;
    
    const dummy = new THREE.Object3D();
    for (let i = 0; i < numClouds; i++) {
        dummy.position.set(
            (Math.random() - 0.5) * 400,
            40 + Math.random() * 20,
            (Math.random() - 0.5) * 400
        );
        dummy.scale.set(
            1 + Math.random() * 2,
            0.5 + Math.random() * 0.5,
            1 + Math.random() * 2
        );
        dummy.rotation.y = Math.random() * Math.PI;
        dummy.updateMatrix();
        cloudMesh.setMatrixAt(i, dummy.matrix);
    }
    
    scene.add(cloudMesh);
    window.sharedClouds = cloudMesh;
};
