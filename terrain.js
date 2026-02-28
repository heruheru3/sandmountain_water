import * as THREE from 'three';
import { terrainWidth, terrainDepth, segments, colorGrass, colorSand, colorRock, colorBorder, domeHeight, bedrockLimit, maxHeight, maxSlope, slumpRate, randomHillCountMin, randomHillCountMax, randomHillRadiusMin, randomHillRadiusMax, randomHillStrengthMin, randomHillStrengthMax } from './config.js';
import * as state from './state.js';
import { scene } from './scene.js';

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
export const hardness = new Float32Array((segments + 1) * (segments + 1));
export const sediment = new Float32Array((segments + 1) * (segments + 1));
export const nextSediment = new Float32Array((segments + 1) * (segments + 1));

// Initialize Water Plane
export const waterPlaneGeo = new THREE.PlaneGeometry(terrainWidth, terrainDepth, segments, segments);
waterPlaneGeo.rotateX(-Math.PI / 2);
export const waterPlaneMat = new THREE.MeshStandardMaterial({
    color: 0x3a86ff,
    transparent: true,
    opacity: 0.6,
    roughness: 0.2,
    metalness: 0.1,
    flatShading: false,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
});
export const waterPlane = new THREE.Mesh(waterPlaneGeo, waterPlaneMat);
scene.add(waterPlane);

export function initTerrain() {
    const positions = geometry.attributes.position.array;
    const colors = [];
    for (let i = 0; i < positions.length / 3; i++) {
        const xIdx = i % (segments + 1);
        const zIdx = Math.floor(i / (segments + 1));
        const vx = positions[i * 3];
        const vz = positions[i * 3 + 2];
        const dist = Math.sqrt(vx * vx + vz * vz);
        const maxDist = Math.sqrt((terrainWidth / 2) ** 2 + (terrainDepth / 2) ** 2);
        const domeOffset = domeHeight * (1 - (dist / maxDist) ** 2);
        positions[i * 3 + 1] = domeOffset + bedrockLimit;

        // 端の1マスを濃い色にする
        if (xIdx === 0 || xIdx === segments || zIdx === 0 || zIdx === segments) {
            colors.push(colorBorder.r, colorBorder.g, colorBorder.b);
        } else {
            colors.push(colorGrass.r, colorGrass.g, colorGrass.b);
        }

        hardness[i] = 1.0; // 草地の初期硬度（完全に削れないように1.0に設定）
        waterDepths[i] = 0;
        sediment[i] = 0;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();
}

export function updateWaterMesh() {
    const tPos = geometry.attributes.position.array;
    const wPos = waterPlaneGeo.attributes.position.array;

    for (let z = 0; z <= segments; z++) {
        for (let x = 0; x <= segments; x++) {
            const idx = z * (segments + 1) + x;
            let avgDepth = 0;
            let count = 0;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    let nz = z + dz;
                    let nx = x + dx;
                    if (nz >= 0 && nz <= segments && nx >= 0 && nx <= segments) {
                        avgDepth += waterDepths[nz * (segments + 1) + nx];
                        count++;
                    }
                }
            }
            avgDepth /= count;
            const depth = waterDepths[idx];
            if (avgDepth > 0.01 || depth > 0.01) {
                const displayDepth = Math.max(depth, avgDepth * 0.5);
                wPos[idx * 3 + 1] = tPos[idx * 3 + 1] + displayDepth + 0.05;
            } else {
                // 水がない場所は地中に深く沈める（Z-fighting対策）
                wPos[idx * 3 + 1] = tPos[idx * 3 + 1] - 10.0;
            }
        }
    }
    waterPlaneGeo.computeVertexNormals();
    waterPlaneGeo.attributes.position.needsUpdate = true;
}

export function slumpTerrain() {
    const positions = geometry.attributes.position.array;
    for (let z = 1; z < segments; z++) {
        for (let x = 1; x < segments; x++) {
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
                if (diff > maxSlope) {
                    let transfer = (diff - maxSlope) * slumpRate * 0.5;
                    positions[idx * 3 + 1] -= transfer;
                    positions[nIdx * 3 + 1] += transfer;
                    h -= transfer;
                }
            }
        }
    }
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
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < radius) {
            let idx = i / 3;
            const falloff = Math.pow(Math.cos((distance / radius) * (Math.PI / 2)), 2);
            const heightFactor = Math.max(0, 1.0 - (currentH / maxHeight) * (currentH / maxHeight));
            positions[i + 1] = Math.min(maxHeight, currentH + strength * falloff * heightFactor);
            hardness[idx] -= strength * falloff * heightFactor;
            hardness[idx] = Math.max(0.0, hardness[idx]);
            changed = true;
            const colors = geometry.attributes.color.array;
            const xIdx = idx % (segments + 1);
            const zIdx = Math.floor(idx / (segments + 1));
            // 境界の色は変えない
            if (xIdx > 0 && xIdx < segments && zIdx > 0 && zIdx < segments) {
                colors[i] = colorSand.r;
                colors[i + 1] = colorSand.g;
                colors[i + 2] = colorSand.b;
            }
        }
    }
    if (changed) {
        slumpTerrain();
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.computeVertexNormals();
        updateWaterMesh();
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
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < radius) {
            const falloff = Math.pow(Math.cos((distance / radius) * (Math.PI / 2)), 2);
            const newH = positions[i + 1] - strength * falloff;
            positions[i + 1] = Math.max(bedrockLimit, newH);
            const colors = geometry.attributes.color.array;
            let idx = i / 3;
            const xIdx = idx % (segments + 1);
            const zIdx = Math.floor(idx / (segments + 1));
            // 境界の色は変えない
            if (xIdx > 0 && xIdx < segments && zIdx > 0 && zIdx < segments) {
                colors[i] = colorRock.r;
                colors[i + 1] = colorRock.g;
                colors[i + 2] = colorRock.b;
            }
            changed = true;
        }
    }
    if (changed) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.computeVertexNormals();
        updateWaterMesh();
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
    const geo = new THREE.SphereGeometry(0.8, 16, 16);
    const mat = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x0088ff,
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.7
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    mesh.position.y += 1.0;
    scene.add(mesh);
    return mesh;
}
