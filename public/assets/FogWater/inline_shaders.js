const fs = require('fs');
const path = require('path');

function readShader(file) {
    return fs.readFileSync(path.join(__dirname, 'shaders', file), 'utf8').replace(/`/g, '\\`');
}

let out = `
const FogWaterShaders = {
    utils: \`${readShader('utils.glsl')}\`,
    simVertex: \`${readShader('simulation/vertex.glsl')}\`,
    simDropFrag: \`${readShader('simulation/drop_fragment.glsl')}\`,
    simNormalFrag: \`${readShader('simulation/normal_fragment.glsl')}\`,
    simUpdateFrag: \`${readShader('simulation/update_fragment.glsl')}\`,
    causticsVertex: \`${readShader('caustics/vertex.glsl')}\`,
    causticsFragment: \`${readShader('caustics/fragment.glsl')}\`,
    waterVertex: \`${readShader('water/vertex.glsl')}\`,
    waterFragment: \`${readShader('water/fragment.glsl')}\`,
    poolVertex: \`${readShader('pool/vertex.glsl')}\`,
    poolFragment: \`${readShader('pool/fragment.glsl')}\`
};

export { FogWaterShaders };
`;

fs.writeFileSync(path.join(__dirname, 'FogWaterShaders.js'), out);
console.log('Shaders inlined!');
