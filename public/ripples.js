class RippleSimulation {
    constructor(renderer, size = 512, areaSize = 100) {
        this.renderer = renderer;
        this.size = size;
        this.areaSize = areaSize; // Physical size the texture covers (e.g., 100x100 units)

        // Floating point textures for simulation
        const options = {
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping,
            depthBuffer: false,
            stencilBuffer: false
        };

        this.rtA = new THREE.WebGLRenderTarget(size, size, options);
        this.rtB = new THREE.WebGLRenderTarget(size, size, options);

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.scene = new THREE.Scene();

        const geo = new THREE.PlaneGeometry(2, 2);

        this.dropMat = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                center: { value: new THREE.Vector2() },
                radius: { value: 0.05 },
                strength: { value: 0.05 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 center;
                uniform float radius;
                uniform float strength;
                varying vec2 vUv;
                void main() {
                    vec4 info = texture2D(tDiffuse, vUv);
                    float drop = max(0.0, 1.0 - length(center - vUv) / radius);
                    drop = 0.5 - cos(drop * 3.14159265) * 0.5;
                    info.r += drop * strength;
                    gl_FragColor = info;
                }
            `
        });

        this.updateMat = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                delta: { value: new THREE.Vector2(1 / size, 1 / size) },
                damping: { value: 0.98 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 delta;
                uniform float damping;
                varying vec2 vUv;
                void main() {
                    vec4 info = texture2D(tDiffuse, vUv);
                    vec2 dx = vec2(delta.x, 0.0);
                    vec2 dy = vec2(0.0, delta.y);
                    float average = (
                        texture2D(tDiffuse, vUv - dx).r +
                        texture2D(tDiffuse, vUv - dy).r +
                        texture2D(tDiffuse, vUv + dx).r +
                        texture2D(tDiffuse, vUv + dy).r
                    ) * 0.25;
                    info.g += (average - info.r) * 1.5; // Slightly lowered wave speed for stability
                    info.g *= damping;
                    info.r += info.g;
                    gl_FragColor = info;
                }
            `
        });

        this.normalMat = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                delta: { value: new THREE.Vector2(1 / size, 1 / size) },
                areaSize: { value: areaSize }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                uniform vec2 delta;
                uniform float areaSize;
                varying vec2 vUv;
                void main() {
                    vec4 info = texture2D(tDiffuse, vUv);
                    // Calculate spatial derivative in world units
                    float dHdx = (texture2D(tDiffuse, vec2(vUv.x + delta.x, vUv.y)).r - info.r) / (areaSize * delta.x);
                    float dHdz = (texture2D(tDiffuse, vec2(vUv.x, vUv.y + delta.y)).r - info.r) / (areaSize * delta.y);
                    info.b = dHdx;
                    info.a = dHdz;
                    gl_FragColor = info;
                }
            `
        });

        this.mesh = new THREE.Mesh(geo, this.dropMat);
        this.scene.add(this.mesh);
    }

    // Convert world X, Z to UV coordinates [0, 1]
    worldToUV(x, z) {
        // Assume simulation is centered at 0,0 and covers areaSize x areaSize
        const u = (x / this.areaSize) + 0.5;
        const v = (z / this.areaSize) + 0.5;
        return { u, v };
    }

    addDrop(x, z, radiusWorld = 1.0, strength = 0.1) {
        const uv = this.worldToUV(x, z);
        if (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) return; // out of bounds

        const radiusUV = radiusWorld / this.areaSize;

        this.mesh.material = this.dropMat;
        this.dropMat.uniforms.tDiffuse.value = this.rtA.texture;
        this.dropMat.uniforms.center.value.set(uv.u, uv.v);
        this.dropMat.uniforms.radius.value = radiusUV;
        this.dropMat.uniforms.strength.value = strength;

        this.renderer.setRenderTarget(this.rtB);
        this.renderer.render(this.scene, this.camera);
        this.swap();
    }

    step() {
        // Update heights and velocities
        this.mesh.material = this.updateMat;
        this.updateMat.uniforms.tDiffuse.value = this.rtA.texture;
        
        this.renderer.setRenderTarget(this.rtB);
        this.renderer.render(this.scene, this.camera);
        this.swap();

        // Update normals
        this.mesh.material = this.normalMat;
        this.normalMat.uniforms.tDiffuse.value = this.rtA.texture;

        this.renderer.setRenderTarget(this.rtB);
        this.renderer.render(this.scene, this.camera);
        this.swap();
    }

    swap() {
        const temp = this.rtA;
        this.rtA = this.rtB;
        this.rtB = temp;
    }

    get texture() {
        return this.rtA.texture;
    }
}

window.RippleWater = {
    init: function(renderer, waterMesh) {
        this.simulation = new RippleSimulation(renderer, 512, 100); // 100x100 area
        
        // Modify the existing THREE.Water shader to include our ripples
        const material = waterMesh.material;
        
        material.onBeforeCompile = (shader) => {
            shader.uniforms.tRipple = { value: this.simulation.texture };
            shader.uniforms.rippleArea = { value: 100.0 };
            
            // Add uniforms
            shader.vertexShader = `
                uniform sampler2D tRipple;
                uniform float rippleArea;
                varying vec2 vRippleUV;
                varying float vRippleHeight;
            ` + shader.vertexShader;

            // Compute UV and apply displacement
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                #include <begin_vertex>
                
                // Calculate Ripple UV from world position
                vec4 worldPosForUV = modelMatrix * vec4(position, 1.0);
                vRippleUV = vec2((worldPosForUV.x / rippleArea) + 0.5, (worldPosForUV.z / rippleArea) + 0.5);
                
                vRippleHeight = 0.0;
                if (vRippleUV.x >= 0.0 && vRippleUV.x <= 1.0 && vRippleUV.y >= 0.0 && vRippleUV.y <= 1.0) {
                    vec4 rippleData = texture2D(tRipple, vRippleUV);
                    vRippleHeight = rippleData.r;
                    transformed.z += vRippleHeight * 0.5; // Scaled down to prevent excessive spikes if geometry is tessellated
                }
                `
            );

            // Fragment shader modifications
            shader.fragmentShader = `
                uniform sampler2D tRipple;
                varying vec2 vRippleUV;
                varying float vRippleHeight;
            ` + shader.fragmentShader;

            // Blend the normal from our ripple texture with the normal from THREE.Water
            shader.fragmentShader = shader.fragmentShader.replace(
                'vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );',
                `
                // Remove the default tiled texture noise to fix the "squares" pattern
                vec3 surfaceNormal = vec3(0.0, 1.0, 0.0);
                
                if (vRippleUV.x > 0.001 && vRippleUV.x < 0.999 && vRippleUV.y > 0.001 && vRippleUV.y < 0.999) {
                    vec4 rippleData = texture2D(tRipple, vRippleUV);
                    // rippleData.b is dHdx, rippleData.a is dHdz
                    vec3 rippleNormal = normalize(vec3(-rippleData.b, 1.0, -rippleData.a));
                    
                    // Emphasize the ripple normal for strong specular reflections
                    surfaceNormal = normalize(surfaceNormal + rippleNormal * 8.0 - vec3(0.0, 1.0, 0.0));
                }
                `
            );
        };
        
        // This is needed to recompile the shader
        material.needsUpdate = true;
    },
    
    update: function(renderer) {
        if (!this.simulation) return;
        
        // Save current render target so we don't break Three.js rendering
        const currentRenderTarget = renderer.getRenderTarget();
        
        // Add ambient rain/wind ripples to give the water natural life
        if (Math.random() < 0.2) {
            const rx = (Math.random() - 0.5) * this.simulation.areaSize;
            const rz = (Math.random() - 0.5) * this.simulation.areaSize;
            this.simulation.addDrop(rx, rz, 1.0 + Math.random() * 1.5, 0.05 + Math.random() * 0.05);
        }
        
        this.simulation.step();
        
        renderer.setRenderTarget(currentRenderTarget);
    },
    
    addDrop: function(renderer, x, z, radius, strength) {
        if (!this.simulation) return;
        
        const currentRenderTarget = renderer.getRenderTarget();
        
        this.simulation.addDrop(x, z, radius, strength);
        
        renderer.setRenderTarget(currentRenderTarget);
    }
};
