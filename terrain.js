import * as THREE from 'three';
import { terrainWidth, terrainDepth, segments, colorGrass, colorSand, colorRock, colorBorder, domeHeight, bedrockLimit, maxHeight, slumpRate, randomHillCountMin, randomHillCountMax, randomHillRadiusMin, randomHillRadiusMax, randomHillStrengthMin, randomHillStrengthMax, sourceMarkerHeight, defaultWaterOpacity, defaultWaterRoughness, defaultWaterMetalness } from './config.js';
import * as state from './state.js';
import { scene } from './scene.js';

export { colorGrass, colorSand, colorRock, colorBorder };

export const geometry = new THREE.PlaneGeometry(terrainWidth, terrainDepth, segments, segments);
geometry.rotateX(-Math.PI / 2);

export const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    wireframe: false,
    flatShading: !state.useSmoothing,
    roughness: 0.9,
    metalness: 0.0
});

export const terrain = new THREE.Mesh(geometry, material);
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

export const waterDepths = new Float32Array((segments + 1) * (segments + 1));
export const nextWaterDepths = new Float32Array((segments + 1) * (segments + 1));
export const waterColors = new Float32Array((segments + 1) * (segments + 1) * 4); // RGBA for each vertex
export const hardness = new Float32Array((segments + 1) * (segments + 1));
export const sediment = new Float32Array((segments + 1) * (segments + 1));
export const nextSediment = new Float32Array((segments + 1) * (segments + 1));

// Initialize Water Plane
export const waterPlaneGeo = new THREE.PlaneGeometry(terrainWidth, terrainDepth, segments, segments);
waterPlaneGeo.rotateX(-Math.PI / 2);
export const waterPlaneMat = new THREE.MeshStandardMaterial({
    vertexColors: true, // Use vertex colors
    transparent: true,
    opacity: state.waterOpacity, // Base global opacity
    roughness: defaultWaterRoughness,
    metalness: defaultWaterMetalness,
    flatShading: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
});

// Support vertex alpha in StandardMaterial
waterPlaneMat.onBeforeCompile = (shader) => {
    // Inject attribute and varying declarations at the top
    shader.vertexShader = `
        attribute float alpha;
        varying float vAlpha;
        ${shader.vertexShader}
    `.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
        vAlpha = alpha;`
    );

    shader.fragmentShader = `
        varying float vAlpha;
        ${shader.fragmentShader}
    `.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.a *= vAlpha;`
    );
};

// Initialize water colors with a base blue
const baseWaterColor = new THREE.Color(0x3a86ff);
for (let i = 0; i < (segments + 1) * (segments + 1); i++) {
    waterColors[i * 4] = baseWaterColor.r;
    waterColors[i * 4 + 1] = baseWaterColor.g;
    waterColors[i * 4 + 2] = baseWaterColor.b;
    waterColors[i * 4 + 3] = 1.0; // Full alpha initially
}

// Separate array for display-only alpha (simulation alpha * fade * opacity)
const displayAlphas = new Float32Array((segments + 1) * (segments + 1));
for (let i = 0; i < displayAlphas.length; i++) displayAlphas[i] = 0;

// Interleave the state buffer: Color (3) + StateAlpha (1 - not directly used by shader here but kept for state)
const waterStateBuffer = new THREE.InterleavedBuffer(waterColors, 4);
waterPlaneGeo.setAttribute('color', new THREE.InterleavedBufferAttribute(waterStateBuffer, 3, 0));
waterPlaneGeo.setAttribute('alpha', new THREE.BufferAttribute(displayAlphas, 1));

export const waterPlane = new THREE.Mesh(waterPlaneGeo, waterPlaneMat);
scene.add(waterPlane);

export function updateTerrainColors(point = null, radius = null) {
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;

    // If point and radius are provided, only update a local area to save performance
    if (point && radius) {
        // Expand radius slightly to catch neighbors/slumping
        const updateRadius = radius * 1.5;
        for (let i = 0; i < positions.length / 3; i++) {
            const vx = positions[i * 3];
            const vz = positions[i * 3 + 2];
            const dx = vx - point.x;
            const dz = vz - point.z;
            if (dx * dx + dz * dz < updateRadius * updateRadius) {
                const xIdx = i % (segments + 1);
                const zIdx = Math.floor(i / (segments + 1));
                const currentH = positions[i * 3 + 1];

                let targetColor;
                if (xIdx === 0 || xIdx === segments || zIdx === 0 || zIdx === segments) {
                    targetColor = colorBorder;
                } else {
                    if (hardness[i] < 0.2) {
                        targetColor = colorRock;
                    } else if (hardness[i] < 0.99) {
                        targetColor = colorSand;
                    } else {
                        targetColor = colorGrass;
                    }
                }
                colors[i * 3] = targetColor.r;
                colors[i * 3 + 1] = targetColor.g;
                colors[i * 3 + 2] = targetColor.b;
            }
        }
    } else {
        // Fallback: Full update
        for (let i = 0; i < positions.length / 3; i++) {
            const xIdx = i % (segments + 1);
            const zIdx = Math.floor(i / (segments + 1));
            const currentH = positions[i * 3 + 1];

            let targetColor;
            if (xIdx === 0 || xIdx === segments || zIdx === 0 || zIdx === segments) {
                targetColor = colorBorder;
            } else {
                if (hardness[i] < 0.2) {
                    targetColor = colorRock;
                } else if (hardness[i] < 0.99) {
                    targetColor = colorSand;
                } else {
                    targetColor = colorGrass;
                }
            }
            colors[i * 3] = targetColor.r;
            colors[i * 3 + 1] = targetColor.g;
            colors[i * 3 + 2] = targetColor.b;
        }
    }
    geometry.attributes.color.needsUpdate = true;
}

export function initTerrain() {
    const positions = geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);
    for (let i = 0; i < positions.length / 3; i++) {
        const xIdx = i % (segments + 1);
        const zIdx = Math.floor(i / (segments + 1));
        const vx = positions[i * 3];
        const vz = positions[i * 3 + 2];
        const dist = Math.sqrt(vx * vx + vz * vz);
        const maxDist = Math.sqrt((terrainWidth / 2) ** 2 + (terrainDepth / 2) ** 2);
        const domeOffset = domeHeight * (1 - (dist / maxDist) ** 2);
        positions[i * 3 + 1] = domeOffset + bedrockLimit;

        hardness[i] = 1.0;
        waterDepths[i] = 0;
        sediment[i] = 0;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    updateTerrainColors();
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
}

export function updateWaterMesh() {
    const tPos = geometry.attributes.position.array;
    const wPos = waterPlaneGeo.attributes.position.array;
    const dAlphas = waterPlaneGeo.attributes.alpha.array;

    for (let i = 0; i < (segments + 1) * (segments + 1); i++) {
        const depth = waterDepths[i];

        // Fading logic: If depth is less than 0.1, it starts fading smoothly.
        // Also ensure depth has to be greater than a slightly higher threshold to display.
        const fadeThreshold = 0.1;
        const fade = Math.min(1.0, depth / fadeThreshold);

        if (depth > 0.005) { // Increased minimum visible depth threshold
            // Increased the physical offset slightly to prevent z-fighting on steep slopes
            wPos[i * 3 + 1] = tPos[i * 3 + 1] + depth + 0.05;

            // Calculate display alpha (Simulated prop * depth-fade)
            // Global opacity is handled at the Material level (this.opacity)
            // Use ease-in fading for smoother visual disappearance before z-fighting starts
            dAlphas[i] = waterColors[i * 4 + 3] * (fade * fade); 
        } else {
            wPos[i * 3 + 1] = tPos[i * 3 + 1] - 10.0; // Hide well below terrain
            dAlphas[i] = 0;
        }
    }
    waterPlaneGeo.attributes.position.needsUpdate = true;
    waterPlaneGeo.attributes.alpha.needsUpdate = true;
    // Tell standard colors to update from the interleaved state buffer
    waterPlaneGeo.attributes.color.data.needsUpdate = true;
}

export function slumpTerrain(point = null, radius = null) {
    const positions = geometry.attributes.position.array;

    const zStart = point ? Math.max(1, Math.floor((point.z - radius * 1.5 + terrainDepth / 2) / terrainDepth * segments)) : 1;
    const zEnd = point ? Math.min(segments - 1, Math.ceil((point.z + radius * 1.5 + terrainDepth / 2) / terrainDepth * segments)) : segments - 1;
    const xStart = point ? Math.max(1, Math.floor((point.x - radius * 1.5 + terrainWidth / 2) / terrainWidth * segments)) : 1;
    const xEnd = point ? Math.min(segments - 1, Math.ceil((point.x + radius * 1.5 + terrainWidth / 2) / terrainWidth * segments)) : segments - 1;

    for (let z = zStart; z <= zEnd; z++) {
        for (let x = xStart; x <= xEnd; x++) {
            let idx = (z * (segments + 1) + x);
            let h = positions[idx * 3 + 1];
            let neighbors = [
                idx - 1, idx + 1,
                idx - (segments + 1), idx + (segments + 1),
                idx - (segments + 1) - 1, idx - (segments + 1) + 1,
                idx + (segments + 1) - 1, idx + (segments + 1) + 1
            ];
            for (let nIdx of neighbors) {
                if (nIdx < 0 || nIdx >= (segments + 1) * (segments + 1)) continue;
                let nH = positions[nIdx * 3 + 1];
                let diff = h - nH;
                if (diff > state.maxSlope) {
                    let transfer = (diff - state.maxSlope) * slumpRate * 0.5;
                    positions[idx * 3 + 1] -= transfer;
                    positions[nIdx * 3 + 1] += transfer;
                    h -= transfer;
                }
            }
        }
    }
}

export function updateLocalNormals(point, radius) {
    const positions = geometry.attributes.position.array;
    const normals = geometry.attributes.normal.array;
    const segmentsPlusOne = segments + 1;

    const zStart = Math.max(1, Math.floor((point.z - radius * 2 + terrainDepth / 2) / terrainDepth * segments));
    const zEnd = Math.min(segments - 1, Math.ceil((point.z + radius * 2 + terrainDepth / 2) / terrainDepth * segments));
    const xStart = Math.max(1, Math.floor((point.x - radius * 2 + terrainWidth / 2) / terrainWidth * segments));
    const xEnd = Math.min(segments - 1, Math.ceil((point.x + radius * 2 + terrainWidth / 2) / terrainWidth * segments));

    const vL = new THREE.Vector3();
    const vR = new THREE.Vector3();
    const vU = new THREE.Vector3();
    const vD = new THREE.Vector3();
    const normal = new THREE.Vector3();

    for (let z = zStart; z <= zEnd; z++) {
        for (let x = xStart; x <= xEnd; x++) {
            const idx = z * segmentsPlusOne + x;

            const idxL = z * segmentsPlusOne + (x - 1);
            const idxR = z * segmentsPlusOne + (x + 1);
            const idxU = (z - 1) * segmentsPlusOne + x;
            const idxD = (z + 1) * segmentsPlusOne + x;

            vL.set(positions[idxL * 3], positions[idxL * 3 + 1], positions[idxL * 3 + 2]);
            vR.set(positions[idxR * 3], positions[idxR * 3 + 1], positions[idxR * 3 + 2]);
            vU.set(positions[idxU * 3], positions[idxU * 3 + 1], positions[idxU * 3 + 2]);
            vD.set(positions[idxD * 3], positions[idxD * 3 + 1], positions[idxD * 3 + 2]);

            const tangentX = vR.sub(vL);
            const tangentZ = vD.sub(vU);
            normal.crossVectors(tangentZ, tangentX).normalize();

            normals[idx * 3] = normal.x;
            normals[idx * 3 + 1] = normal.y;
            normals[idx * 3 + 2] = normal.z;
        }
    }
    geometry.attributes.normal.needsUpdate = true;
}

export function buildMountain(point) {
    const positions = geometry.attributes.position.array;
    const radius = state.brushRadius;
    const strength = state.buildStrength;
    let changed = false;
    for (let i = 0; i < positions.length; i += 3) {
        const vx = positions[i];
        const vz = positions[i + 2];
        const currentH = positions[i + 1];
        const dx = vx - point.x;
        const dz = vz - point.z;
        if (dx * dx + dz * dz < radius * radius) {
            let idx = i / 3;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const falloff = Math.pow(Math.cos((distance / radius) * (Math.PI / 2)), state.brushSharpness);
            const heightFactor = Math.max(0, 1.0 - (currentH / maxHeight) * (currentH / maxHeight));
            positions[i + 1] = Math.min(maxHeight, currentH + strength * falloff * heightFactor);
            hardness[idx] = 0.8; // 土を盛った場所は「砂」として色を変える
            changed = true;
        }
    }
    if (changed) {
        slumpTerrain(point, radius);
        updateTerrainColors(point, radius);
        geometry.attributes.position.needsUpdate = true;
        updateLocalNormals(point, radius);
    }
}

export function lowerTerrain(point) {
    const positions = geometry.attributes.position.array;
    const radius = state.brushRadius;
    const strength = state.buildStrength * 2.0;
    let changed = false;
    for (let i = 0; i < positions.length; i += 3) {
        const vx = positions[i];
        const vz = positions[i + 2];
        const dx = vx - point.x;
        const dz = vz - point.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < radius * radius) {
            const distance = Math.sqrt(d2);
            const falloff = Math.pow(Math.cos((distance / radius) * (Math.PI / 2)), state.brushSharpness);
            const newH = positions[i + 1] - strength * falloff;
            positions[i + 1] = Math.max(bedrockLimit, newH);
            let idx = i / 3;
            hardness[idx] = 0.1; // 削った場所は「岩（硬い）」として色を暗くする
            changed = true;
        }
    }
    if (changed) {
        slumpTerrain(point, radius);
        updateTerrainColors(point, radius);
        geometry.attributes.position.needsUpdate = true;
        updateLocalNormals(point, radius);
    }
}

export function generateRandomTerrain() {
    // 既存の地形を維持したまま、ランダムな場所に山を追加する
    const numHills = randomHillCountMin + Math.floor(Math.random() * (randomHillCountMax - randomHillCountMin + 1));
    for (let h = 0; h < numHills; h++) {
        const randomPoint = {
            x: (Math.random() - 0.5) * terrainWidth * 0.8,
            z: (Math.random() - 0.5) * terrainDepth * 0.8
        };
        // 保存されている状態を一時的に書き換えて山を作る
        const originalRadius = state.brushRadius;
        const originalStrength = state.buildStrength;

        state.setBrushRadius(randomHillRadiusMin + Math.random() * (randomHillRadiusMax - randomHillRadiusMin));
        state.setBuildStrength(randomHillStrengthMin + Math.random() * (randomHillStrengthMax - randomHillStrengthMin));

        buildMountain(randomPoint);

        // 状態を戻す
        state.setBrushRadius(originalRadius);
        state.setBuildStrength(originalStrength);
    }
}
export function createSourceMarker(point) {
    const group = new THREE.Group();

    // Sphere Marker
    const sphereGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x0088ff,
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.7
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(0, sourceMarkerHeight, 0);
    group.add(sphere);

    // Water Stream (Cylinder)
    const streamHeight = point.y + sourceMarkerHeight;
    const streamGeo = new THREE.CylinderGeometry(0.2, 0.4, streamHeight, 8);
    const streamMat = new THREE.MeshStandardMaterial({
        color: 0x3a86ff,
        transparent: true,
        opacity: 0.5,
        emissive: 0x3a86ff,
        emissiveIntensity: 0.5
    });
    const stream = new THREE.Mesh(streamGeo, streamMat);
    // Align cylinder to reach from sphere down to global y=0
    stream.position.set(0, sourceMarkerHeight - (streamHeight / 2), 0);
    group.add(stream);

    group.position.copy(point);
    scene.add(group);
    return group;
}
