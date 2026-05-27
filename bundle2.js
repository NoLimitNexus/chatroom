const fs = require('fs');
const path = require('path');
const dir = 'C:/Users/nolim/Desktop/desktop/FOG-WATER-MACHINE';

let utils = fs.readFileSync(path.join(dir, 'shaders/utils.glsl'), 'utf8');

function loadShader(name) {
    return fs.readFileSync(path.join(dir, 'shaders', name), 'utf8');
}

let code = `
window.WaterShaders = {
    utils: ` + JSON.stringify(utils) + `,
    simulation_vertex: ` + JSON.stringify(loadShader('simulation/vertex.glsl')) + `,
    simulation_drop_fragment: ` + JSON.stringify(loadShader('simulation/drop_fragment.glsl')) + `,
    simulation_normal_fragment: ` + JSON.stringify(loadShader('simulation/normal_fragment.glsl')) + `,
    simulation_update_fragment: ` + JSON.stringify(loadShader('simulation/update_fragment.glsl')) + `,
    caustics_vertex: ` + JSON.stringify(loadShader('caustics/vertex.glsl')) + `,
    caustics_fragment: ` + JSON.stringify(loadShader('caustics/fragment.glsl')) + `,
    water_vertex: ` + JSON.stringify(loadShader('water/vertex.glsl')) + `,
    water_fragment: ` + JSON.stringify(loadShader('water/fragment.glsl')) + `
};

THREE.ShaderChunk['utils'] = window.WaterShaders.utils;
`;

let indexJs = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
let lines = indexJs.split('\n');
let classesCode = lines.slice(324, 474).join('\n'); // Up to end of Water class, skipping Pool

// Fix loadFile to use the sync strings
classesCode = classesCode.replace(/loadFile\('shaders\/simulation\/vertex\.glsl'\)/g, 'Promise.resolve(window.WaterShaders.simulation_vertex)');
classesCode = classesCode.replace(/loadFile\('shaders\/simulation\/drop_fragment\.glsl'\)/g, 'Promise.resolve(window.WaterShaders.simulation_drop_fragment)');
classesCode = classesCode.replace(/loadFile\('shaders\/simulation\/normal_fragment\.glsl'\)/g, 'Promise.resolve(window.WaterShaders.simulation_normal_fragment)');
classesCode = classesCode.replace(/loadFile\('shaders\/simulation\/update_fragment\.glsl'\)/g, 'Promise.resolve(window.WaterShaders.simulation_update_fragment)');

classesCode = classesCode.replace(/loadFile\('shaders\/caustics\/vertex\.glsl'\)/g, 'Promise.resolve(window.WaterShaders.caustics_vertex)');
classesCode = classesCode.replace(/loadFile\('shaders\/caustics\/fragment\.glsl'\)/g, 'Promise.resolve(window.WaterShaders.caustics_fragment)');

classesCode = classesCode.replace(/loadFile\('shaders\/water\/vertex\.glsl'\)/g, 'Promise.resolve(window.WaterShaders.water_vertex)');
classesCode = classesCode.replace(/loadFile\('shaders\/water\/fragment\.glsl'\)/g, 'Promise.resolve(window.WaterShaders.water_fragment)');

// Fix hardcoded waterConfig
classesCode = classesCode.replace(/waterConfig\.damping\.value/g, '0.995');
classesCode = classesCode.replace(/waterConfig\.waveSpeed\.value/g, '2.0');

// Export to window
code += '\n' + classesCode;
code += '\nwindow.WaterSimulation = WaterSimulation;\nwindow.Caustics = Caustics;\nwindow.Water = Water;\n';

fs.writeFileSync('C:/Users/nolim/Desktop/desktop/3D-Unified-Workspace/public/shared-water.js', code);
