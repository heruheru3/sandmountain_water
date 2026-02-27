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

// Material: using a basic sand color
const material = new THREE.MeshStandardMaterial({
    color: 0xdeb887, // Burlywood / Sand color
    wireframe: false,
    flatShading: true,
    roughness: 0.8,
    metalness: 0.1
});

const terrain = new THREE.Mesh(geometry, material);
scene.add(terrain);

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

// Disable orbit controls when drawing
window.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') controls.enabled = false;
});
window.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') controls.enabled = true;
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
        }
    }

    if (changed) {
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals(); // Recalculate lighting shading
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
    renderer.render(scene, camera);
}

animate();
