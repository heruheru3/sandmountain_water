import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 50, 80);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // Prevent going below ground

// Custom mouse buttons to prevent interference with drawing
controls.mouseButtons = {
    LEFT: THREE.MOUSE.NONE,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: THREE.MOUSE.PAN
};

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
scene.add(dirLight);

// --- Terrain Generation (Plane) ---
const terrainWidth = 100;
const terrainDepth = 100;
const segments = 100; // Resolution of the grid (reverted for performance)

const geometry = new THREE.PlaneGeometry(terrainWidth, terrainDepth, segments, segments);
geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

// Color settings
const colorGrass = new THREE.Color(0x3a5f0b); // Hard ground / Grass (Base)
const colorSand = new THREE.Color(0xdeb887);  // Mountain
const colorRock = new THREE.Color(0x736d65);  // Eroded rock

const material = new THREE.MeshStandardMaterial({
    vertexColors: true, // Enable vertex colors for erosion visualization
    wireframe: false,
    flatShading: true,
    roughness: 0.9,
    metalness: 0.0
});

const terrain = new THREE.Mesh(geometry, material);
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// --- Dynamic Water System (Pools) ---
const waterPlaneGeo = new THREE.PlaneGeometry(terrainWidth, terrainDepth, segments, segments);
waterPlaneGeo.rotateX(-Math.PI / 2);
const waterPlaneMat = new THREE.MeshStandardMaterial({
    color: 0x3a86ff,
    transparent: true,
    opacity: 0.6,
    roughness: 0.2, // Make it look a bit shiny/liquid
    metalness: 0.1,
    flatShading: false,
    depthWrite: false
});
const waterPlane = new THREE.Mesh(waterPlaneGeo, waterPlaneMat);
scene.add(waterPlane);

const waterDepths = new Float32Array((segments + 1) * (segments + 1));
const nextWaterDepths = new Float32Array((segments + 1) * (segments + 1));
const hardness = new Float32Array((segments + 1) * (segments + 1)); // 1.0 = hard, 0.0 = soft

// Initialize vertex colors and hardness (Base is Grass/Hard Ground)
const positions = geometry.attributes.position.array;
const colors = [];
for (let i = 0; i < positions.length / 3; i++) {
    colors.push(colorGrass.r, colorGrass.g, colorGrass.b);
    hardness[i] = 1.0; // Ground starts very hard
}
geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

// Add a helper grid
const gridHelper = new THREE.GridHelper(terrainWidth, segments, 0x4facfe, 0xffffff);
gridHelper.material.opacity = 0.1;
gridHelper.material.transparent = true;
gridHelper.position.y = 0.01;
scene.add(gridHelper);


// --- Interaction Logic (Mountain & Rain) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDrawing = false;

// Brush cursor (blue line circle)
const cursorGeo = new THREE.RingGeometry(2.3, 2.7, 32);
const cursorMat = new THREE.MeshBasicMaterial({
    color: 0x4facfe,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    depthTest: false // Ensures it's always visible on top of terrain
});
const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
cursorMesh.rotation.x = -Math.PI / 2;
scene.add(cursorMesh);

window.addEventListener('pointerdown', (e) => {
    if (e.button === 0) isDrawing = true; // Left click
});
window.addEventListener('pointerup', () => {
    isDrawing = false;
});
window.addEventListener('pointermove', (event) => {
    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // See if the ray from the camera into the world hits the terrain
    const intersects = raycaster.intersectObject(terrain);

    if (intersects.length > 0) {
        // Move the cursor ring to the intersection point
        cursorMesh.position.copy(intersects[0].point);
        cursorMesh.position.y += 0.5; // Float slightly above the ground
        cursorMesh.visible = true;

        if (isDrawing) {
            raiseTerrain(intersects[0].point);
        }
    } else {
        cursorMesh.visible = false;
    }
});




function raiseTerrain(point) {
    const positions = geometry.attributes.position.array;
    const radius = 5; // Brush radius
    const strength = 0.2; // Brush strength (reduced for slower building)

    let changed = false;

    // Iterate through all vertices (each vertex is 3 values: x, y, z)
    for (let i = 0; i < positions.length; i += 3) {
        const vx = positions[i];
        const vz = positions[i + 2];

        // Calculate distance from click point (in XZ plane)
        const dx = vx - point.x;
        const dz = vz - point.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < radius) {
            let idx = i / 3;
            const maxHeight = 15.0; // Maximum terrain height cap
            const currentH = positions[i + 1];

            // Use a smooth bell curve (Gaussian-like) for the raise profile
            const falloff = Math.pow(Math.cos((distance / radius) * (Math.PI / 2)), 2);

            // Soften raising strength near the peak: the higher we are, the less we can raise
            // This naturally creates a gentle dome shape instead of a spike
            const heightFactor = Math.max(0, 1.0 - (currentH / maxHeight) * (currentH / maxHeight));
            positions[i + 1] = Math.min(maxHeight, currentH + strength * falloff * heightFactor);

            // Raised terrain becomes soft sand
            hardness[idx] -= strength * falloff * heightFactor;
            hardness[idx] = Math.max(0.0, hardness[idx]);

            changed = true;

            // Raised terrain is always sand color
            const colors = geometry.attributes.color.array;
            colors[i] = colorSand.r;
            colors[i + 1] = colorSand.g;
            colors[i + 2] = colorSand.b;
        }
    }

    if (changed) {
        slumpTerrain(); // Prevent spikes by limiting neighbor height difference
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.computeVertexNormals(); // Recalculate lighting shading

        // Also update water geometry immediately so it doesn't float
        updateWaterMesh();
    }
}

// Prevent spiky terrain by collapsing steep slopes between neighbors
function slumpTerrain() {
    const positions = geometry.attributes.position.array;
    const maxSlope = 1.4; // Max allowed height diff between adjacent cells
    const slumpRate = 0.4; // How fast excess collapses (0=none, 1=instant)

    for (let z = 1; z < segments; z++) {
        for (let x = 1; x < segments; x++) {
            let idx = (z * (segments + 1) + x);
            let h = positions[idx * 3 + 1];

            // Check all 4 neighbors
            let neighbors = [
                idx - 1, idx + 1,
                idx - (segments + 1), idx + (segments + 1)
            ];

            for (let nIdx of neighbors) {
                let nH = positions[nIdx * 3 + 1];
                let diff = h - nH;
                if (diff > maxSlope) {
                    // Excess slope — collapse towards neighbor
                    let transfer = (diff - maxSlope) * slumpRate * 0.5;
                    positions[idx * 3 + 1] -= transfer;
                    positions[nIdx * 3 + 1] += transfer;
                    h -= transfer;
                }
            }
        }
    }
}

function updateWaterMesh() {
    const tPos = geometry.attributes.position.array;
    const wPos = waterPlaneGeo.attributes.position.array;

    for (let i = 0; i < waterDepths.length; i++) {
        const depth = waterDepths[i];
        if (depth > 0.01) { // If there's water
            wPos[i * 3 + 1] = tPos[i * 3 + 1] + depth; // Water surface is terrain height + depth
        } else {
            // Hide deeper below terrain to prevent z-fighting / flickering 
            wPos[i * 3 + 1] = tPos[i * 3 + 1] - 0.5;
        }
    }
    waterPlaneGeo.computeVertexNormals(); // Smooth lighting
    waterPlaneGeo.attributes.position.needsUpdate = true;
}


// --- Water Simulation System ---
const waterGeo = new THREE.PlaneGeometry(0, 0); // Dummy to remove error
// We don't use instanced mesh anymore
const MAX_PARTICLES = 0;
let waterParticles = [];

// Remove Particle mesh (clean up scene)
// scene.remove(waterInstancedMesh); // This line is now commented out as waterInstancedMesh is removed

let isRaining = false;
window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
        isRaining = true;
    }
});
window.addEventListener('keyup', (e) => {
    if (e.key === 'r' || e.key === 'R') {
        isRaining = false;
    }
});


class WaterParticle {
    constructor(x, z) {
        this.pos = new THREE.Vector3(x, getElevation(x, z), z);
        this.dir = new THREE.Vector3(0, 0, 0);
        this.speed = 0.0;
        this.volume = 1.0;
        this.sediment = 0.0;
        this.active = true;
        this.life = 0;
    }
}

function spawnRain() {
    // Make sure we have a valid mouse coordinate
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(terrain);

    if (intersects.length > 0) {
        const point = intersects[0].point;

        // Add water in a small radius around the mouse pointer
        for (let i = 0; i < 20; i++) {
            let rx = point.x + (Math.random() - 0.5) * 5;
            let rz = point.z + (Math.random() - 0.5) * 5;

            let gridX = Math.round((rx + terrainWidth / 2) / terrainWidth * segments);
            let gridZ = Math.round((rz + terrainDepth / 2) / terrainDepth * segments);

            if (gridX > 0 && gridX < segments && gridZ > 0 && gridZ < segments) {
                let idx = gridZ * (segments + 1) + gridX;
                waterDepths[idx] += 0.2;
            }
        }
    }
}

// Helper: Get elevation at specific XZ coordinates (bilinear interpolation)
function getElevation(x, z) {
    const positions = geometry.attributes.position.array;
    // Map X, Z from world space to grid indices
    const gridX = Math.floor((x + terrainWidth / 2) / terrainWidth * segments);
    const gridZ = Math.floor((z + terrainDepth / 2) / terrainDepth * segments);

    if (gridX < 0 || gridX >= segments || gridZ < 0 || gridZ >= segments) return 0;

    const idx = (gridZ * (segments + 1) + gridX) * 3;
    return positions[idx + 1];
}

// Helper: Calculate surface normal/gradient at XZ
function getGradient(x, z) {
    const eps = 0.5;
    const hx1 = getElevation(x + eps, z);
    const hx0 = getElevation(x - eps, z);
    const hz1 = getElevation(x, z + eps);
    const hz0 = getElevation(x, z - eps);
    return new THREE.Vector3(hx0 - hx1, 0, hz0 - hz1); // Gradient points downhill
}

// Grid-state arrays for sediment (same size as waterDepths)
const sediment = new Float32Array((segments + 1) * (segments + 1));
const nextSediment = new Float32Array((segments + 1) * (segments + 1));

function updateSimulation() {
    if (isRaining) {
        spawnRain();
    }

    const dt = 0.05;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;
    let geometryNeedsUpdate = false;

    // 1. Fluid Flow (Pipe Model / Cellular Automaton based on SWE concepts)
    // Copy current state
    for (let i = 0; i < waterDepths.length; i++) {
        nextWaterDepths[i] = waterDepths[i];
        nextSediment[i] = sediment[i];
    }

    // Arrays to store flow out of each cell (left, right, bottom, top)
    const flux = new Float32Array(waterDepths.length * 4);

    const dx = terrainWidth / segments;
    const g = 9.81;
    const friction = 0.05;

    // Calculate Flux (Outflow)
    for (let z = 1; z < segments; z++) {
        for (let x = 1; x < segments; x++) {
            let idx = z * (segments + 1) + x;
            let d = waterDepths[idx];
            if (d <= 0.001) continue;

            let h = positions[idx * 3 + 1] + d; // Total head (terrain + water)

            // Neighbors: left(0), right(1), bottom(2), top(3)
            let offsets = [-1, 1, -(segments + 1), (segments + 1)];

            let totalDh = 0;
            let dhs = [0, 0, 0, 0];

            for (let i = 0; i < 4; i++) {
                let nIdx = idx + offsets[i];
                let nH = positions[nIdx * 3 + 1] + waterDepths[nIdx];
                let dh = h - nH;
                if (dh > 0) {
                    dhs[i] = dh;
                    totalDh += dh;
                }
            }

            if (totalDh > 0) {
                // Distribute volume proportionally to slope
                let maxFlow = d * 0.15; // Slower drain to prevent checkboard jaggedness/instability

                for (let i = 0; i < 4; i++) {
                    if (dhs[i] > 0) {
                        let flow = (dhs[i] / totalDh) * maxFlow;
                        let nIdx = idx + offsets[i];

                        nextWaterDepths[idx] -= flow;
                        nextWaterDepths[nIdx] += flow;

                        // Advect sediment with water flow
                        if (sediment[idx] > 0) {
                            let sedimentFlow = (flow / d) * sediment[idx];
                            nextSediment[idx] -= sedimentFlow;
                            nextSediment[nIdx] += sedimentFlow;
                        }

                        // Track flux for erosion
                        flux[idx * 4 + i] = flow;
                    }
                }
            }
        }
    }

    // 2. Erosion and Deposition based on Flow
    for (let z = 1; z < segments; z++) {
        for (let x = 1; x < segments; x++) {
            let idx = z * (segments + 1) + x;

            // Calculate total flux crossing this cell
            let totalFlowOut = flux[idx * 4 + 0] + flux[idx * 4 + 1] + flux[idx * 4 + 2] + flux[idx * 4 + 3];
            let waterLevel = nextWaterDepths[idx];

            if (waterLevel > 0.01 && totalFlowOut > 0.001) {
                // Fast flow causes erosion, slow flow deposits
                let velocity = totalFlowOut / (waterLevel * dx);
                let slope = Math.abs(positions[idx * 3 + 1] - Math.max(
                    positions[(idx - 1) * 3 + 1],
                    positions[(idx + 1) * 3 + 1],
                    positions[(idx - (segments + 1)) * 3 + 1],
                    positions[(idx + (segments + 1)) * 3 + 1]
                ));

                let sedimentCapacity = Math.max(0, slope * velocity * 2.0); // Simple capacity formula
                let currentSediment = nextSediment[idx];

                if (currentSediment < sedimentCapacity && slope > 0.05) {
                    // Erode
                    let amountToErode = Math.min((sedimentCapacity - currentSediment) * 0.1, 0.05);

                    // Scale erosion by how soft the ground is (0.01 for hard, 1.0 for soft)
                    let erosionFactor = 1.0 - hardness[idx] * 0.99;
                    amountToErode *= erosionFactor;

                    let targetHeight = positions[idx * 3 + 1] - amountToErode;

                    if (targetHeight > -1.0) { // Bedrock limit
                        positions[idx * 3 + 1] -= amountToErode;
                        nextSediment[idx] += amountToErode;

                        // Rock color
                        colors[idx * 3] = Math.max(colorRock.r, colors[idx * 3] - 0.05);
                        colors[idx * 3 + 1] = Math.max(colorRock.g, colors[idx * 3 + 1] - 0.05);
                        colors[idx * 3 + 2] = Math.max(colorRock.b, colors[idx * 3 + 2] - 0.05);
                        geometryNeedsUpdate = true;
                    }
                } else if (currentSediment > sedimentCapacity) {
                    // Deposit
                    let amountToDeposit = (currentSediment - sedimentCapacity) * 0.1;

                    // Prevent building above water level
                    let maxAllowed = Math.max(0, waterLevel);
                    amountToDeposit = Math.min(amountToDeposit, maxAllowed);

                    positions[idx * 3 + 1] += amountToDeposit;
                    nextSediment[idx] -= amountToDeposit;

                    // Deposited sand is soft
                    hardness[idx] -= amountToDeposit * 2.0;
                    hardness[idx] = Math.max(0.0, hardness[idx]);

                    // Deposit color: grass if low, sand if high
                    let h = positions[idx * 3 + 1];
                    let blend = Math.min(1.0, Math.max(0.0, h / 2.0));
                    let targetR = THREE.MathUtils.lerp(colorGrass.r, colorSand.r, blend);
                    let targetG = THREE.MathUtils.lerp(colorGrass.g, colorSand.g, blend);
                    let targetB = THREE.MathUtils.lerp(colorGrass.b, colorSand.b, blend);

                    colors[idx * 3] = Math.min(targetR, colors[idx * 3] + 0.02);
                    colors[idx * 3 + 1] = Math.min(targetG, colors[idx * 3 + 1] + 0.02);
                    colors[idx * 3 + 2] = Math.min(targetB, colors[idx * 3 + 2] + 0.02);
                    geometryNeedsUpdate = true;
                }
            }
        }
    }

    // Apply exact state updates and evaporation
    for (let i = 0; i < waterDepths.length; i++) {
        waterDepths[i] = Math.max(0, nextWaterDepths[i] - 0.0001); // global evaporation
        sediment[i] = Math.max(0, nextSediment[i]);
    }

    updateWaterMesh();

    if (geometryNeedsUpdate) {
        slumpTerrain(); // Keep terrain slope natural
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.computeVertexNormals();
    }
}


// --- Resize Handling ---
window.addEventListener('resize', onWindowResize, false);
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update(); // required if controls.enableDamping or controls.autoRotate are set

    updateSimulation(); // Run water and erosion logic

    renderer.render(scene, camera);
}

animate();
