import * as THREE from 'three';
import { terrainWidth, terrainDepth, segments, colorGrass, colorSand, colorRock, colorBorder, domeHeight, bedrockLimit, maxHeight, slumpRate, randomHillCountMin, randomHillCountMax, randomHillRadiusMin, randomHillRadiusMax, randomHillStrengthMin, randomHillStrengthMax, sourceMarkerHeight, defaultWaterOpacity, defaultWaterRoughness, defaultWaterMetalness, treeHardness, treeRadius, houseHardness, houseRadius, defaultHeightRange } from './config.js';
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

// Wireframe mesh that follows terrain height
export const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x444444,
    wireframe: true,
    transparent: true,
    opacity: 0.3,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
});
export const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
wireframeMesh.visible = state.showGrid;
scene.add(wireframeMesh);

export const waterDepths = new Float32Array((segments + 1) * (segments + 1));
export const nextWaterDepths = new Float32Array((segments + 1) * (segments + 1));
export const waterColors = new Float32Array((segments + 1) * (segments + 1) * 4); // RGBA for each vertex
export const hardness = new Float32Array((segments + 1) * (segments + 1));
export const treeResistance = new Float32Array((segments + 1) * (segments + 1)); // Permanent reinforcement from trees
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
                } else if (treeResistance[i] > 1.5) {
                    // House (Fixed gray)
                    targetColor = colorRock;
                } else if (treeResistance[i] > 0.5) {
                    // Tree (Fixed green)
                    targetColor = colorGrass;
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
            } else if (treeResistance[i] > 1.5) {
                targetColor = colorRock;
            } else if (treeResistance[i] > 0.5) {
                targetColor = colorGrass;
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

        // Ensure even the lowest point is at least bedrockLimit
        if (positions[i * 3 + 1] < bedrockLimit) positions[i * 3 + 1] = bedrockLimit;

        hardness[i] = 1.0;
        waterDepths[i] = 0;
        sediment[i] = 0;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    updateTerrainColors();
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    createNorthIndicator();
}

function createNorthIndicator() {
    const arrowDir = new THREE.Vector3(0, 0, -1);
    const arrowOrigin = new THREE.Vector3(0, 1, -terrainDepth / 2 - 2);
    const arrowLength = 10;
    const arrowColor = 0xff3333; // Red for North
    const headLength = 3;
    const headWidth = 2;

    const arrow = new THREE.ArrowHelper(arrowDir, arrowOrigin, arrowLength, arrowColor, headLength, headWidth);
    scene.add(arrow);

    // Create a simple 3D "N" label
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const geo = new THREE.CylinderGeometry(0.3, 0.3, 4, 8);

    // Left vertical
    const n1 = new THREE.Mesh(geo, mat);
    n1.position.set(-1.5, 0, 0);
    group.add(n1);

    // Right vertical
    const n2 = new THREE.Mesh(geo, mat);
    n2.position.set(1.5, 0, 0);
    group.add(n2);

    // Diagonal
    const n3 = new THREE.Mesh(geo, mat);
    n3.rotation.z = -Math.PI / 5;
    group.add(n3);

    group.position.set(0, 2, -terrainDepth / 2 - 15);
    scene.add(group);
}

export function updateWaterMesh() {
    const tPos = geometry.attributes.position.array;
    const wPos = waterPlaneGeo.attributes.position.array;
    const dAlphas = waterPlaneGeo.attributes.alpha.array;

    for (let i = 0; i < (segments + 1) * (segments + 1); i++) {
        const depth = waterDepths[i];

        // Fading logic: If depth is less than fadeThreshold, it starts fading smoothly.
        const fadeThreshold = 0.05;
        const fade = Math.min(1.0, depth / fadeThreshold);

        if (depth > 0.001) {
            // Increase physical offset slightly to prevent z-fighting on steep slopes
            wPos[i * 3 + 1] = tPos[i * 3 + 1] + depth + 0.1;

            // Use linear fading for better visibility of thin water
            dAlphas[i] = waterColors[i * 4 + 3] * fade;
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

                // Use the higher of surface hardness or permanent tree reinforcement (roots)
                let effectiveHardness = Math.max(hardness[idx], treeResistance[idx]);
                let effectiveMaxSlope = state.maxSlope * (1.0 + effectiveHardness * 4.0);

                if (diff > effectiveMaxSlope) {
                    let transfer = (diff - effectiveMaxSlope) * slumpRate * 0.5;
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
// Tree Planting Logic
export function createTreeMarker(point) {
    const group = new THREE.Group();

    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.75;
    group.add(trunk);

    // Leaves (Cone)
    const leavesGeo = new THREE.ConeGeometry(1.2, 2.5, 8);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32 });
    const leaves = new THREE.Mesh(leavesGeo, leavesMat);
    leaves.position.y = 2.5;
    group.add(leaves);

    group.position.copy(point);
    scene.add(group);
    return group;
}

export function plantTree(point) {
    const positions = geometry.attributes.position.array;
    const radius = treeRadius;
    let changed = false;

    // Fix ground hardness around the tree
    for (let i = 0; i < positions.length; i += 3) {
        const vx = positions[i];
        const vz = positions[i + 2];
        const dx = vx - point.x;
        const dz = vz - point.z;
        if (dx * dx + dz * dz < radius * radius) {
            let idx = i / 3;
            // Record as Tree (1.0)
            treeResistance[idx] = 1.0;
            hardness[idx] = 1.0;
            changed = true;
        }
    }

    if (changed) {
        updateTerrainColors(point, radius);

        // Find closest grid index for height tracking
        const gx = Math.round((point.x + terrainWidth / 2) / terrainWidth * segments);
        const gz = Math.round((point.z + terrainDepth / 2) / terrainDepth * segments);
        const treeIdx = gz * (segments + 1) + gx;

        const marker = createTreeMarker(point);
        state.addTree(marker, treeIdx);
    }
}

// House Building Logic
export function createHouseMarker(point) {
    const group = new THREE.Group();

    // Box (Main body)
    const boxGeo = new THREE.BoxGeometry(3, 2, 4);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 1;
    group.add(box);

    // Roof (Prism-like)
    const roofGeo = new THREE.ConeGeometry(3.5, 2, 4);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    group.position.copy(point);
    scene.add(group);
    return group;
}

export function buildHouse(point) {
    const positions = geometry.attributes.position.array;
    const radius = houseRadius;
    let changed = false;

    for (let i = 0; i < positions.length; i += 3) {
        const vx = positions[i];
        const vz = positions[i + 2];
        const dx = vx - point.x;
        const dz = vz - point.z;
        if (dx * dx + dz * dz < radius * radius) {
            let idx = i / 3;
            // Record as House (2.0)
            treeResistance[idx] = 2.0;
            hardness[idx] = 1.0;
            changed = true;
        }
    }

    if (changed) {
        updateTerrainColors(point, radius);
        const gx = Math.round((point.x + terrainWidth / 2) / terrainWidth * segments);
        const gz = Math.round((point.z + terrainDepth / 2) / terrainDepth * segments);
        const houseIdx = gz * (segments + 1) + gx;
        const marker = createHouseMarker(point);
        state.addHouse(marker, houseIdx);
    }
}

export function createSourceMarker(point, color = null) {
    const group = new THREE.Group();

    // Sphere Marker
    const sphereGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const sphereMat = new THREE.MeshStandardMaterial({
        color: color || 0x00ffff,
        emissive: color || 0x0088ff,
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
        color: color || 0x3a86ff,
        transparent: true,
        opacity: 0.5,
        emissive: color || 0x3a86ff,
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

export function setHeightData(heights, targetRange = defaultHeightRange, initialHardness = 1.0, naturalScale = 0.1, forestData = null) {
    const positions = geometry.attributes.position.array;

    // Clear structures first to avoid double-processing
    state.clearTrees();
    state.clearHouses();
    state.clearWaterSources();

    // Find min and max height to normalize
    let minH = Infinity;
    let maxH = -Infinity;
    for (let h of heights) {
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
    }

    const currentRange = maxH - minH;
    // Scale factor to make (max - min) equal to targetRange, or use naturalScale if normalization is off
    const isNormalizing = targetRange !== null && targetRange !== undefined;
    const scale = isNormalizing ? (currentRange > 0 ? targetRange / currentRange : 1.0) : naturalScale;

    for (let i = 0; i < heights.length; i++) {
        const rawH = heights[i];
        const xIdx = i % (segments + 1);
        const zIdx = Math.floor(i / (segments + 1));

        // Shift entire terrain up so minimum point is at bedrockLimit
        const h = (rawH - minH) * scale;

        // --- Sea/Lake/Water Handling ---
        // GSI dem_png uses 0 for sea level. Lakes/Rivers have elevation but are perfectly flat.
        let isWater = rawH <= 0.01;
        if (!isWater) {
            if (xIdx > 0 && xIdx < segments && zIdx > 0 && zIdx < segments) {
                // Check if neighbors have the same exact elevation (typical for lake data)
                let flatNeighbors = 0;
                const neighborOffsets = [-1, 1, -(segments + 1), (segments + 1)];
                for (const offset of neighborOffsets) {
                    if (Math.abs(rawH - heights[i + offset]) < 0.0001) flatNeighbors++;
                }
                if (flatNeighbors >= 3) isWater = true;
            }
        }

        if (isWater) {
            const basinDepth = 1.7; // Create a basin
            positions[i * 3 + 1] = h + bedrockLimit - basinDepth;
            waterDepths[i] = 1.5;   // Pre-fill with water
            treeResistance[i] = 0;
            hardness[i] = initialHardness;
        } else {
            positions[i * 3 + 1] = h + bedrockLimit;
            waterDepths[i] = 0;

            // --- Forest Detection & Automatic Planting ---
            if (forestData && forestData[i] === 1) {
                treeResistance[i] = 1.0; // Stabilize ground
                hardness[i] = 1.0;      // Harder soil due to roots

                // Randomly place a 3D tree marker to visualize the forest
                // (Don't place on every vertex to keep performance balanced)
                if (Math.random() < 0.35) { // ~35% density for visual representation
                    const vx = positions[i * 3];
                    const vy = positions[i * 3 + 1];
                    const vz = positions[i * 3 + 2];
                    const marker = createTreeMarker(new THREE.Vector3(vx, vy, vz));
                    state.addTree(marker, i);
                }
            } else {
                treeResistance[i] = 0;
                hardness[i] = initialHardness;
            }
        }

        // Reset other sub-systems
        sediment[i] = 0;
    }

    geometry.attributes.position.needsUpdate = true;
    updateTerrainColors();
    geometry.computeVertexNormals();
}

export function resetTreeResistance() {
    treeResistance.fill(0);
}
