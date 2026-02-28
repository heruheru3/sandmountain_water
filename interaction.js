import * as THREE from 'three';
import * as state from './state.js';
import * as terrainModule from './terrain.js';
import { camera, scene, controls } from './scene.js';

export const raycaster = new THREE.Raycaster();
export const mouse = new THREE.Vector2();

// Brush cursor
const cursorGeo = new THREE.RingGeometry(0.7, 1.3, 48);
const cursorMat = new THREE.MeshBasicMaterial({
    color: 0x4facfe,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    depthTest: false
});
export const cursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
cursorMesh.rotation.x = -Math.PI / 2;
scene.add(cursorMesh);

export function initInteraction() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') state.setShiftHeld(true);
        if (e.key === 'r' || e.key === 'R') state.setRaining(true);
    });

    window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') state.setShiftHeld(false);
        if (e.key === 'r' || e.key === 'R') state.setRaining(false);
    });

    window.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('#ui-container')) e.preventDefault();
    });

    let lastRightClickTime = 0;
    const doubleClickThreshold = 300;

    window.addEventListener('pointerdown', (e) => {
        if (e.target.closest('#ui-container')) return;
        if (e.button === 0) state.setDrawing(true);
        if (e.button === 2) {
            if (state.isShiftHeld) {
                // Shift + Right is handled by OrbitControls for Pan
            } else {
                const now = Date.now();
                if (now - lastRightClickTime < doubleClickThreshold) {
                    // Right Double Click detected
                    handleRightDoubleClick(e);
                    lastRightClickTime = 0; // Reset after double click
                    state.setRightClicking(false); // Cancel the hold-rain for double clicks
                } else {
                    state.setRightClicking(true);
                    lastRightClickTime = now;
                }
            }
        }
    });

    function handleRightDoubleClick(event) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // Check if we clicked on an existing marker
        const markerGroups = state.waterSources.map(s => s.marker).filter(m => m);
        const markerIntersects = raycaster.intersectObjects(markerGroups, true); // Recursive check
        if (markerIntersects.length > 0) {
            let hitObject = markerIntersects[0].object;
            // Find which group this hit object belongs to
            const source = state.waterSources.find(s => s.marker === hitObject.parent || s.marker === hitObject);
            if (source) {
                state.removeWaterSource(source.id);
                return;
            }
        }

        // Check if we clicked on terrain
        const intersects = raycaster.intersectObject(terrainModule.terrain);
        if (intersects.length > 0) {
            const p = intersects[0].point;
            const marker = terrainModule.createSourceMarker(p);
            state.addWaterSource(p.x, p.z, marker);
        }
    }

    window.addEventListener('pointerup', (e) => {
        if (e.target.closest('#ui-container')) return;
        if (e.button === 0) state.setDrawing(false);
        if (e.button === 2) state.setRightClicking(false);
    });

    window.addEventListener('pointermove', (event) => {
        if (event.target.closest('#ui-container')) return;
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(terrainModule.terrain);

        if (intersects.length > 0) {
            cursorMesh.position.copy(intersects[0].point);
            cursorMesh.position.y += 0.5;
            cursorMesh.visible = true;

            if (state.isDrawing) {
                if (state.isShiftHeld) {
                    terrainModule.lowerTerrain(intersects[0].point);
                } else {
                    terrainModule.buildMountain(intersects[0].point);
                }
            }
        } else {
            cursorMesh.visible = false;
        }
    });

    // UI Listeners
    const rainRadiusSlider = document.getElementById('rainRadius');
    const rainAmountSlider = document.getElementById('rainAmount');
    const mountainRadiusSlider = document.getElementById('mountainRadius');
    const buildStrengthSlider = document.getElementById('buildStrength');
    const smoothShadingToggle = document.getElementById('smoothShading');
    const randomBtn = document.getElementById('randomBtn');
    const resetBtn = document.getElementById('resetBtn');

    const rainRadiusVal = document.getElementById('rainRadiusVal');
    const rainAmountVal = document.getElementById('rainAmountVal');
    const mountainRadiusVal = document.getElementById('mountainRadiusVal');
    const buildStrengthVal = document.getElementById('buildStrengthVal');

    // Initialize UI with state values
    if (rainRadiusSlider) {
        rainRadiusSlider.value = state.rainRadius;
        rainRadiusVal.textContent = state.rainRadius;
        cursorMesh.geometry.dispose();
        cursorMesh.geometry = new THREE.RingGeometry(state.rainRadius - 0.3, state.rainRadius + 0.3, 48);
    }
    if (rainAmountSlider) {
        rainAmountSlider.value = state.rainCount;
        rainAmountVal.textContent = state.rainCount;
    }
    if (mountainRadiusSlider) {
        mountainRadiusSlider.value = state.brushRadius;
        mountainRadiusVal.textContent = state.brushRadius;
    }
    if (buildStrengthSlider) {
        buildStrengthSlider.value = state.buildStrength;
        buildStrengthVal.textContent = state.buildStrength;
    }
    if (smoothShadingToggle) {
        smoothShadingToggle.checked = state.useSmoothing;
    }

    if (rainRadiusSlider) {
        rainRadiusSlider.addEventListener('input', () => {
            state.setRainRadius(parseFloat(rainRadiusSlider.value));
            rainRadiusVal.textContent = state.rainRadius;
            cursorMesh.geometry.dispose();
            cursorMesh.geometry = new THREE.RingGeometry(state.rainRadius - 0.3, state.rainRadius + 0.3, 48);
        });
    }

    if (rainAmountSlider) {
        rainAmountSlider.addEventListener('input', () => {
            state.setRainCount(parseInt(rainAmountSlider.value));
            rainAmountVal.textContent = state.rainCount;
        });
    }

    if (mountainRadiusSlider) {
        mountainRadiusSlider.addEventListener('input', () => {
            state.setBrushRadius(parseFloat(mountainRadiusSlider.value));
            mountainRadiusVal.textContent = state.brushRadius;
        });
    }

    if (buildStrengthSlider) {
        buildStrengthSlider.addEventListener('input', () => {
            state.setBuildStrength(parseFloat(buildStrengthSlider.value));
            buildStrengthVal.textContent = state.buildStrength;
        });
    }

    if (smoothShadingToggle) {
        smoothShadingToggle.addEventListener('change', () => {
            state.setUseSmoothing(smoothShadingToggle.checked);
            terrainModule.material.flatShading = !state.useSmoothing;
            terrainModule.material.needsUpdate = true;
        });
    }

    const globalRainBtn = document.getElementById('globalRainBtn');
    if (globalRainBtn) {
        globalRainBtn.addEventListener('click', () => {
            const newState = !state.isGlobalRaining;
            state.setGlobalRaining(newState);
            if (newState) {
                globalRainBtn.classList.add('active');
                globalRainBtn.textContent = 'Global Rain: ON';
            } else {
                globalRainBtn.classList.remove('active');
                globalRainBtn.textContent = 'Global Rain: OFF';
            }
        });
    }

    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            terrainModule.generateRandomTerrain();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            state.clearWaterSources();
            terrainModule.initTerrain();
            terrainModule.updateWaterMesh();
        });
    }
}
