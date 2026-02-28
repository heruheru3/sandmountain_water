import * as THREE from 'three';
import { terrainWidth, terrainDepth, segments, colorGrass, colorSand, colorRock, evaporation, sedimentCapacityFactor, erosionRate, erosionMax, depositionRate, maxFlowFactor, bedrockLimit, rainDropAmount, globalRainDropAmount, globalRainDensity } from './config.js';
import * as state from './state.js';
import * as terrainModule from './terrain.js';
import { camera, scene } from './scene.js';

const raycaster = new THREE.Raycaster();
const nextWaterColors = new Float32Array((segments + 1) * (segments + 1) * 3);

function setWaterColorAt(idx, color) {
    terrainModule.waterColors[idx * 3] = color.r;
    terrainModule.waterColors[idx * 3 + 1] = color.g;
    terrainModule.waterColors[idx * 3 + 2] = color.b;
}

export function spawnRain(mouse) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrainModule.terrain);
    if (intersects.length > 0) {
        const point = intersects[0].point;
        for (let i = 0; i < state.rainCount; i++) {
            let rx = point.x + (Math.random() - 0.5) * state.rainRadius * 2;
            let rz = point.z + (Math.random() - 0.5) * state.rainRadius * 2;
            let gridX = Math.round((rx + terrainWidth / 2) / terrainWidth * segments);
            let gridZ = Math.round((rz + terrainDepth / 2) / terrainDepth * segments);
            if (gridX > 0 && gridX < segments && gridZ > 0 && gridZ < segments) {
                let idx = gridZ * (segments + 1) + gridX;
                terrainModule.waterDepths[idx] += rainDropAmount;
                // Rain matches base blue (0x3a86ff) with very subtle sparkle
                const base = new THREE.Color(0x3a86ff);
                terrainModule.waterColors[idx * 3] = base.r + 0.05 * Math.random();
                terrainModule.waterColors[idx * 3 + 1] = base.g + 0.05 * Math.random();
                terrainModule.waterColors[idx * 3 + 2] = base.b + 0.05 * Math.random();
            }
        }
    }
}

export function spawnGlobalRain() {
    const dropsPerFrame = segments * globalRainDensity;
    for (let i = 0; i < dropsPerFrame * (state.rainCount / 10); i++) {
        let rx = (Math.random() - 0.5) * terrainWidth;
        let rz = (Math.random() - 0.5) * terrainDepth;
        let gridX = Math.round((rx + terrainWidth / 2) / terrainWidth * segments);
        let gridZ = Math.round((rz + terrainDepth / 2) / terrainDepth * segments);
        if (gridX > 0 && gridX < segments && gridZ > 0 && gridZ < segments) {
            let idx = gridZ * (segments + 1) + gridX;
            terrainModule.waterDepths[idx] += globalRainDropAmount;
            // Subtle shift for global rain, but keep it clearly blue
            const base = new THREE.Color(0x3a86ff);
            terrainModule.waterColors[idx * 3] = base.r;
            terrainModule.waterColors[idx * 3 + 1] = base.g;
            terrainModule.waterColors[idx * 3 + 2] = base.b;
        }
    }
}

export function spawnSourceWater() {
    state.waterSources.forEach((source, sIdx) => {
        let gridX = Math.round((source.x + terrainWidth / 2) / terrainWidth * segments);
        let gridZ = Math.round((source.z + terrainDepth / 2) / terrainDepth * segments);
        if (gridX > 0 && gridX < segments && gridZ > 0 && gridZ < segments) {
            let idx = gridZ * (segments + 1) + gridX;
            terrainModule.waterDepths[idx] += 0.5;

            // Generate a unique color for each source based on its ID/index
            // We shift hue slightly for each source
            const tint = new THREE.Color().setHSL((sIdx * 0.13) % 1.0, 0.7, 0.6);
            // Blend existing color with this source tint
            terrainModule.waterColors[idx * 3] = tint.r;
            terrainModule.waterColors[idx * 3 + 1] = tint.g;
            terrainModule.waterColors[idx * 3 + 2] = tint.b;
        }
    });
}

export function updateSimulation(mouse) {
    const positions = terrainModule.geometry.attributes.position.array;
    const colors = terrainModule.geometry.attributes.color.array;
    let geometryNeedsUpdate = false;

    if (state.checkRain()) {
        spawnRain(mouse);
    }
    if (state.isGlobalRaining) {
        spawnGlobalRain();
    }
    spawnSourceWater();

    for (let i = 0; i < terrainModule.waterDepths.length; i++) {
        terrainModule.nextWaterDepths[i] = terrainModule.waterDepths[i];
        terrainModule.nextSediment[i] = terrainModule.sediment[i];
        // Initialize color buffer for next frame
        nextWaterColors[i * 3] = terrainModule.waterColors[i * 3];
        nextWaterColors[i * 3 + 1] = terrainModule.waterColors[i * 3 + 1];
        nextWaterColors[i * 3 + 2] = terrainModule.waterColors[i * 3 + 2];
    }

    const flux = new Float32Array(terrainModule.waterDepths.length * 4);
    const dx = terrainWidth / segments;

    for (let z = 1; z < segments; z++) {
        for (let x = 1; x < segments; x++) {
            let idx = z * (segments + 1) + x;
            let d = terrainModule.waterDepths[idx];
            if (d <= 0.001) continue;
            let h = positions[idx * 3 + 1] + d;
            let offsets = [-1, 1, -(segments + 1), (segments + 1)];
            let totalDh = 0;
            let dhs = [0, 0, 0, 0];
            for (let i = 0; i < 4; i++) {
                let nIdx = idx + offsets[i];
                let nH = positions[nIdx * 3 + 1] + terrainModule.waterDepths[nIdx];
                let dh = h - nH;
                if (dh > 0) {
                    dhs[i] = dh;
                    totalDh += dh;
                }
            }
            if (totalDh > 0) {
                let maxFlow = d * maxFlowFactor;
                for (let i = 0; i < 4; i++) {
                    if (dhs[i] > 0) {
                        let flow = (dhs[i] / totalDh) * maxFlow;
                        let nIdx = idx + offsets[i];
                        terrainModule.nextWaterDepths[idx] -= flow;
                        terrainModule.nextWaterDepths[nIdx] += flow;

                        // TRANSPORT COLOR: The target cell's color becomes a weighted average of its current color
                        // and the incoming water's color.
                        let currentColorAmt = terrainModule.waterDepths[nIdx];
                        let totalNewWater = currentColorAmt + flow;
                        if (totalNewWater > 0.001) {
                            let fRatio = flow / totalNewWater;
                            nextWaterColors[nIdx * 3] = THREE.MathUtils.lerp(nextWaterColors[nIdx * 3], terrainModule.waterColors[idx * 3], fRatio);
                            nextWaterColors[nIdx * 3 + 1] = THREE.MathUtils.lerp(nextWaterColors[nIdx * 3 + 1], terrainModule.waterColors[idx * 3 + 1], fRatio);
                            nextWaterColors[nIdx * 3 + 2] = THREE.MathUtils.lerp(nextWaterColors[nIdx * 3 + 2], terrainModule.waterColors[idx * 3 + 2], fRatio);
                        }

                        if (terrainModule.sediment[idx] > 0) {
                            let sedimentFlow = (flow / d) * terrainModule.sediment[idx];
                            terrainModule.nextSediment[idx] -= sedimentFlow;
                            terrainModule.nextSediment[nIdx] += sedimentFlow;
                        }
                        flux[idx * 4 + i] = flow;
                    }
                }
            }
        }
    }

    for (let z = 1; z < segments; z++) {
        for (let x = 1; x < segments; x++) {
            let idx = z * (segments + 1) + x;
            let totalFlowOut = flux[idx * 4 + 0] + flux[idx * 4 + 1] + flux[idx * 4 + 2] + flux[idx * 4 + 3];
            let waterLevel = terrainModule.nextWaterDepths[idx];
            if (waterLevel > 0.01 && totalFlowOut > 0.001) {
                let velocity = totalFlowOut / (waterLevel * dx);
                let slope = Math.abs(positions[idx * 3 + 1] - Math.max(
                    positions[(idx - 1) * 3 + 1],
                    positions[(idx + 1) * 3 + 1],
                    positions[(idx - (segments + 1)) * 3 + 1],
                    positions[(idx + (segments + 1)) * 3 + 1]
                ));
                let sedimentCapacity = Math.max(0, slope * velocity * sedimentCapacityFactor);
                let currentSediment = terrainModule.nextSediment[idx];
                if (currentSediment < sedimentCapacity && slope > 0.05) {
                    let amountToErode = Math.min((sedimentCapacity - currentSediment) * erosionRate, erosionMax);
                    let erosionFactor = Math.max(0, 1.0 - terrainModule.hardness[idx]);
                    amountToErode *= erosionFactor;
                    if (positions[idx * 3 + 1] - amountToErode > bedrockLimit) {
                        const weights = [[0.01, 0.04, 0.01], [0.04, 0.60, 0.04], [0.01, 0.04, 0.01]];
                        for (let dzInner = -1; dzInner <= 1; dzInner++) {
                            for (let dxInner = -1; dxInner <= 1; dxInner++) {
                                let nIdx = (z + dzInner) * (segments + 1) + (x + dxInner);
                                let weight = weights[dzInner + 1][dxInner + 1];
                                let actualErode = amountToErode * weight;
                                if (positions[nIdx * 3 + 1] - actualErode > bedrockLimit) {
                                    positions[nIdx * 3 + 1] -= actualErode;
                                    if (dzInner === 0 && dxInner === 0) terrainModule.nextSediment[idx] += amountToErode;

                                    let nxIdx = nIdx % (segments + 1);
                                    let nzIdx = Math.floor(nIdx / (segments + 1));
                                    if (nxIdx > 0 && nxIdx < segments && nzIdx > 0 && nzIdx < segments) {
                                        colors[nIdx * 3] = Math.max(colorRock.r, colors[nIdx * 3] - 0.005);
                                        colors[nIdx * 3 + 1] = Math.max(colorRock.g, colors[nIdx * 3 + 1] - 0.005);
                                        colors[nIdx * 3 + 2] = Math.max(colorRock.b, colors[nIdx * 3 + 2] - 0.005);
                                    }
                                }
                            }
                        }
                        geometryNeedsUpdate = true;
                    }
                } else if (currentSediment > sedimentCapacity) {
                    let amountToDeposit = (currentSediment - sedimentCapacity) * depositionRate;
                    let maxAllowed = Math.max(0, waterLevel);
                    amountToDeposit = Math.min(amountToDeposit, maxAllowed);
                    const weights = [[0.01, 0.04, 0.01], [0.04, 0.60, 0.04], [0.01, 0.04, 0.01]];
                    for (let dzInner = -1; dzInner <= 1; dzInner++) {
                        for (let dxInner = -1; dxInner <= 1; dxInner++) {
                            let nIdx = (z + dzInner) * (segments + 1) + (x + dxInner);
                            let weight = weights[dzInner + 1][dxInner + 1];
                            let actualDeposit = amountToDeposit * weight;
                            positions[nIdx * 3 + 1] += actualDeposit;
                            if (dzInner === 0 && dxInner === 0) terrainModule.nextSediment[idx] -= amountToDeposit;

                            let nxIdx = nIdx % (segments + 1);
                            let nzIdx = Math.floor(nIdx / (segments + 1));
                            if (nxIdx > 0 && nxIdx < segments && nzIdx > 0 && nzIdx < segments) {
                                terrainModule.hardness[nIdx] = Math.max(0.0, terrainModule.hardness[nIdx] - actualDeposit * 2.0);
                                let h = positions[nIdx * 3 + 1];
                                let blend = Math.min(1.0, Math.max(0.0, h / 2.0));
                                let targetR = THREE.MathUtils.lerp(colorGrass.r, colorSand.r, blend);
                                let targetG = THREE.MathUtils.lerp(colorGrass.g, colorSand.g, blend);
                                let targetB = THREE.MathUtils.lerp(colorGrass.b, colorSand.b, blend);
                                colors[nIdx * 3] = Math.min(targetR, colors[nIdx * 3] + 0.01);
                                colors[nIdx * 3 + 1] = Math.min(targetG, colors[nIdx * 3 + 1] + 0.01);
                                colors[nIdx * 3 + 2] = Math.min(targetB, colors[nIdx * 3 + 2] + 0.01);
                            }
                        }
                    }
                    geometryNeedsUpdate = true;
                }
            }
        }
    }

    for (let i = 0; i < terrainModule.waterDepths.length; i++) {
        const z = Math.floor(i / (segments + 1));
        const x = i % (segments + 1);
        if (z === 0 || z === segments || x === 0 || x === segments) {
            terrainModule.waterDepths[i] = 0;
            terrainModule.sediment[i] = 0;
        } else {
            terrainModule.waterDepths[i] = Math.max(0, terrainModule.nextWaterDepths[i] - evaporation);
            terrainModule.sediment[i] = Math.max(0, terrainModule.nextSediment[i]);

            // Sync colors
            terrainModule.waterColors[i * 3] = nextWaterColors[i * 3];
            terrainModule.waterColors[i * 3 + 1] = nextWaterColors[i * 3 + 1];
            terrainModule.waterColors[i * 3 + 2] = nextWaterColors[i * 3 + 2];
        }
    }

    terrainModule.updateWaterMesh();
    // Inform GPU that water colors have updated
    terrainModule.waterPlane.geometry.attributes.color.needsUpdate = true;

    if (geometryNeedsUpdate) {
        terrainModule.slumpTerrain();
        terrainModule.geometry.attributes.position.needsUpdate = true;
        terrainModule.geometry.attributes.color.needsUpdate = true;
        terrainModule.geometry.computeVertexNormals();
    }
}
