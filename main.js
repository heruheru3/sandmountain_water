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
const segments = 100; // Resolution of the grid

const geometry = new THREE.PlaneGeometry(terrainWidth, terrainDepth, segments, segments);
geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

// Color settings
const colorSand = new THREE.Color(0xdeb887);
const colorRock = new THREE.Color(0x736d65);

const material = new THREE.MeshStandardMaterial({
    vertexColors: true, // Enable vertex colors for erosion visualization
    wireframe: false,
    flatShading: true,
    roughness: 0.9,
    metalness: 0.0
});

const terrain = new THREE.Mesh(geometry, material);
scene.add(terrain);

// Initialize vertex colors
const positions = geometry.attributes.position.array;
const colors = [];
for (let i = 0; i < positions.length / 3; i++) {
    colors.push(colorSand.r, colorSand.g, colorSand.b);
}
geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));

// Add a helper grid
const gridHelper = new THREE.GridHelper(terrainWidth, segments, 0x4facfe, 0xffffff);
gridHelper.material.opacity = 0.1;
gridHelper.material.transparent = true;
gridHelper.position.y = 0.01;
scene.add(gridHelper);


// --- Interaction Logic (Mountain Building) ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDrawing = false;

window.addEventListener('pointerdown', (e) => {
    if (e.button === 0) isDrawing = true; // Left click
});
window.addEventListener('pointerup', () => {
    isDrawing = false;
});
window.addEventListener('pointermove', (event) => {
    if (!isDrawing) return;

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // See if the ray from the camera into the world hits the terrain
    const intersects = raycaster.intersectObject(terrain);

    if (intersects.length > 0) {
        raiseTerrain(intersects[0].point);
    }
});




function raiseTerrain(point) {
    const positions = geometry.attributes.position.array;
    const radius = 5; // Brush radius
    const strength = 1.0; // Brush strength

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
            // Use a smooth bell curve (Gaussian-like) for the raise profile
            const falloff = Math.pow(Math.cos((distance / radius) * (Math.PI / 2)), 2);
            positions[i + 1] += strength * falloff;
            changed = true;

            // Revert back to sand color when building mountain
            const colors = geometry.attributes.color.array;
            colors[i] = colorSand.r;     // R
            colors[i + 1] = colorSand.g; // G
            colors[i + 2] = colorSand.b; // B
        }
    }

    if (changed) {
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.computeVertexNormals(); // Recalculate lighting shading
    }
}


// --- Water Simulation System ---
const MAX_PARTICLES = 1000;
let waterParticles = [];

// Visual representation of water
const waterGeo = new THREE.SphereGeometry(0.3, 8, 8);
const waterMat = new THREE.MeshBasicMaterial({ color: 0x4facfe, transparent: true, opacity: 0.7 });
const waterInstancedMesh = new THREE.InstancedMesh(waterGeo, waterMat, MAX_PARTICLES);
waterInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(waterInstancedMesh);

// Hide all instances initially
const dummy = new THREE.Object3D();
for (let i = 0; i < MAX_PARTICLES; i++) {
    dummy.position.set(0, -100, 0);
    dummy.updateMatrix();
    waterInstancedMesh.setMatrixAt(i, dummy.matrix);
}
waterInstancedMesh.instanceMatrix.needsUpdate = true;

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
    if (waterParticles.length >= MAX_PARTICLES) return;

    // Spawn drop at a random location slightly above the center area
    const rx = (Math.random() - 0.5) * 40;
    const rz = (Math.random() - 0.5) * 40;

    // Only spawn if there is a mountain (elevation > 1)
    if (getElevation(rx, rz) > 1.0) {
        waterParticles.push(new WaterParticle(rx, rz));
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

function updateSimulation() {
    if (isRaining) {
        for (let i = 0; i < 5; i++) spawnRain(); // Spawn 5 drops per frame
    }

    const dt = 0.016; // fixed timestep approx
    const dt_ero = 0.3; // erosion rate multiplier
    const friction = 0.05;
    const sedimentCapacityFactor = 4.0;
    const depositionRate = 0.1;

    let geometryNeedsUpdate = false;
    const positions = geometry.attributes.position.array;
    const colors = geometry.attributes.color.array;

    for (let i = waterParticles.length - 1; i >= 0; i--) {
        let p = waterParticles[i];
        if (!p.active) continue;

        p.life++;
        if (p.life > 300) { p.active = false; continue; } // Max lifespan

        // Calculate flow direction (downhill gradient)
        let grad = getGradient(p.pos.x, p.pos.z);

        // Update direction and velocity
        p.dir.add(grad.multiplyScalar(dt));
        p.dir.normalize();

        // Move particle
        let nextX = p.pos.x + p.dir.x * p.speed;
        let nextZ = p.pos.z + p.dir.z * p.speed;

        // Out of bounds check
        if (nextX < -terrainWidth / 2 || nextX > terrainWidth / 2 || nextZ < -terrainDepth / 2 || nextZ > terrainDepth / 2) {
            p.active = false;
            continue;
        }

        let currentH = getElevation(p.pos.x, p.pos.z);
        let nextH = getElevation(nextX, nextZ);
        let dh = currentH - nextH; // Height difference (positive if going downhill)

        // Accelerate going downhill, decelerate otherwise
        if (dh > 0) {
            p.speed += 1.0 * dt; // Gravity
        } else {
            p.speed -= 2.0 * dt; // Friction on flat/uphill
        }
        p.speed = Math.max(0.1, p.speed - friction); // Minimum speed to prevent getting stuck infinitely

        p.pos.x = nextX;
        p.pos.z = nextZ;
        p.pos.y = nextH;

        // Erosion / Deposition Logic
        let capacity = Math.max(0, dh * p.speed * p.volume * sedimentCapacityFactor);

        // Find the nearest vertex to modify
        const gridX = Math.round((p.pos.x + terrainWidth / 2) / terrainWidth * segments);
        const gridZ = Math.round((p.pos.z + terrainDepth / 2) / terrainDepth * segments);
        if (gridX > 0 && gridX < segments && gridZ > 0 && gridZ < segments) {
            let idx = (gridZ * (segments + 1) + gridX) * 3;

            if (p.sediment < capacity) {
                // Erode: pick up sediment
                let amountToErode = Math.min((capacity - p.sediment) * dt_ero, dh * 0.5);
                p.sediment += amountToErode;
                positions[idx + 1] -= amountToErode;

                // Color mapping: make eroded parts darker (rockier)
                colors[idx] = Math.max(colorRock.r, colors[idx] - 0.05);
                colors[idx + 1] = Math.max(colorRock.g, colors[idx + 1] - 0.05);
                colors[idx + 2] = Math.max(colorRock.b, colors[idx + 2] - 0.05);

                geometryNeedsUpdate = true;

            } else {
                // Deposit: drop sediment
                let amountToDeposit = (p.sediment - capacity) * depositionRate;
                p.sediment -= amountToDeposit;
                positions[idx + 1] += amountToDeposit;

                // Color mapping: make deposited parts sandy again
                colors[idx] = Math.min(colorSand.r, colors[idx] + 0.02);
                colors[idx + 1] = Math.min(colorSand.g, colors[idx + 1] + 0.02);
                colors[idx + 2] = Math.min(colorSand.b, colors[idx + 2] + 0.02);

                geometryNeedsUpdate = true;
            }
        }

        // Update visual instance matrix
        dummy.position.copy(p.pos);
        dummy.position.y += 0.3; // float slightly above
        dummy.updateMatrix();
        waterInstancedMesh.setMatrixAt(i, dummy.matrix);
    }

    // Clean up dead particles
    waterParticles = waterParticles.filter(p => p.active);

    // Hide unused instances
    for (let i = waterParticles.length; i < MAX_PARTICLES; i++) {
        dummy.position.set(0, -100, 0);
        dummy.updateMatrix();
        waterInstancedMesh.setMatrixAt(i, dummy.matrix);
    }

    waterInstancedMesh.instanceMatrix.needsUpdate = true;

    if (geometryNeedsUpdate) {
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
