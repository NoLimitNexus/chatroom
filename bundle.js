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
`;

let indexJs = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');

// Replace loadFile calls with accessing window.WaterShaders
indexJs = indexJs.replace(/loadFile\('shaders\/utils\.glsl'\)\.then\(\(utils\) => {/, 'Promise.resolve(window.WaterShaders.utils).then((utils) => {');
indexJs = indexJs.replace(/loadFile\('shaders\/simulation\/vertex\.glsl'\)/, 'Promise.resolve(window.WaterShaders.simulation_vertex)');
indexJs = indexJs.replace(/loadFile\('shaders\/simulation\/drop_fragment\.glsl'\)/, 'Promise.resolve(window.WaterShaders.simulation_drop_fragment)');
indexJs = indexJs.replace(/loadFile\('shaders\/simulation\/normal_fragment\.glsl'\)/, 'Promise.resolve(window.WaterShaders.simulation_normal_fragment)');
indexJs = indexJs.replace(/loadFile\('shaders\/simulation\/update_fragment\.glsl'\)/, 'Promise.resolve(window.WaterShaders.simulation_update_fragment)');

indexJs = indexJs.replace(/loadFile\('shaders\/caustics\/vertex\.glsl'\)/, 'Promise.resolve(window.WaterShaders.caustics_vertex)');
indexJs = indexJs.replace(/loadFile\('shaders\/caustics\/fragment\.glsl'\)/, 'Promise.resolve(window.WaterShaders.caustics_fragment)');

indexJs = indexJs.replace(/loadFile\('shaders\/water\/vertex\.glsl'\)/, 'Promise.resolve(window.WaterShaders.water_vertex)');
indexJs = indexJs.replace(/loadFile\('shaders\/water\/fragment\.glsl'\)/, 'Promise.resolve(window.WaterShaders.water_fragment)');

code += '\n' + indexJs;

fs.writeFileSync('C:/Users/nolim/Desktop/desktop/steam_chatroom/public/shared-water.js', code);
