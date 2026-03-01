import * as THREE from 'three';
import * as state from './state.js';
import * as terrainModule from './terrain.js';
import { camera, scene, controls } from './scene.js';
import {
    configRainRadius,
    configRainCount,
    configBrushRadius,
    configBuildStrength,
    configMaxFlowFactor,
    configBrushSharpness,
    configMaxSlope,
    configWaterOpacity
} from './config.js';

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
    let rightClickTimeout = null;

    window.addEventListener('pointerdown', (e) => {
        if (e.target.closest('#ui-container')) return;
        if (e.button === 0) state.setDrawing(true);
        if (e.button === 2) {
            const now = Date.now();
            const isClickSequence = (now - lastRightClickTime < doubleClickThreshold);

            if (state.isShiftHeld) {
                // Shift + Right Click triggers water source placement/removal
                handleRightDoubleClick(e);
                lastRightClickTime = 0; // Prevent ensuing rain
            } else if (isClickSequence) {
                // Right Double Click detected
                clearTimeout(rightClickTimeout);
                handleRightDoubleClick(e);
                lastRightClickTime = 0; // Reset after double click
                state.setRightClicking(false);
            } else {
                // Potential start of hold-rain OR start of double-click
                lastRightClickTime = now;
                // Only start raining if button still down after threshold
                rightClickTimeout = setTimeout(() => {
                    if (e.buttons & 2) { // 2 = Right button still held
                        state.setRightClicking(true);
                    }
                }, doubleClickThreshold);
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
        if (e.button === 2) {
            state.setRightClicking(false);
            clearTimeout(rightClickTimeout);
        }
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

    const uiToggle = document.getElementById('ui-toggle');
    const uiContainer = document.getElementById('ui-container');
    if (uiToggle && uiContainer) {
        uiToggle.addEventListener('click', () => {
            uiContainer.classList.toggle('collapsed');
            uiToggle.textContent = uiContainer.classList.contains('collapsed') ? '➕' : '☰';
        });
    }

    // UI Listeners
    const rainRadiusSlider = document.getElementById('rainRadius');
    const rainAmountSlider = document.getElementById('rainAmount');
    const mountainRadiusSlider = document.getElementById('mountainRadius');
    const buildStrengthSlider = document.getElementById('buildStrength');
    const buildStrengthVal = document.getElementById('buildStrengthVal');
    const maxFlowSlider = document.getElementById('maxFlowFactor');
    const maxFlowVal = document.getElementById('maxFlowVal');
    const sharpnessSlider = document.getElementById('brushSharpness');
    const sharpnessVal = document.getElementById('sharpnessVal');
    const maxSlopeSlider = document.getElementById('maxSlope');
    const maxSlopeVal = document.getElementById('maxSlopeVal');
    const waterOpacitySlider = document.getElementById('waterOpacity');
    const waterOpacityVal = document.getElementById('waterOpacityVal');
    const smoothShadingToggle = document.getElementById('smoothShading');
    const randomBtn = document.getElementById('randomBtn');
    const resetBtn = document.getElementById('resetBtn');

    const rainRadiusVal = document.getElementById('rainRadiusVal');
    const rainAmountVal = document.getElementById('rainAmountVal');
    const mountainRadiusVal = document.getElementById('mountainRadiusVal');

    // Initialize UI with state values
    if (rainRadiusSlider) {
        rainRadiusSlider.min = configRainRadius.min;
        rainRadiusSlider.max = configRainRadius.max;
        rainRadiusSlider.step = configRainRadius.step;
        rainRadiusSlider.value = state.rainRadius;
        rainRadiusVal.textContent = state.rainRadius;
        cursorMesh.geometry.dispose();
        cursorMesh.geometry = new THREE.RingGeometry(state.rainRadius - 0.3, state.rainRadius + 0.3, 48);
    }
    if (rainAmountSlider) {
        rainAmountSlider.min = configRainCount.min;
        rainAmountSlider.max = configRainCount.max;
        rainAmountSlider.step = configRainCount.step;
        rainAmountSlider.value = state.rainCount;
        rainAmountVal.textContent = state.rainCount;
    }
    if (mountainRadiusSlider) {
        mountainRadiusSlider.min = configBrushRadius.min;
        mountainRadiusSlider.max = configBrushRadius.max;
        mountainRadiusSlider.step = configBrushRadius.step;
        mountainRadiusSlider.value = state.brushRadius;
        mountainRadiusVal.textContent = state.brushRadius;
    }
    if (buildStrengthSlider) {
        buildStrengthSlider.min = configBuildStrength.min;
        buildStrengthSlider.max = configBuildStrength.max;
        buildStrengthSlider.step = configBuildStrength.step;
        buildStrengthSlider.value = state.buildStrength;
        buildStrengthVal.textContent = state.buildStrength;
    }
    if (maxFlowSlider) {
        maxFlowSlider.min = configMaxFlowFactor.min;
        maxFlowSlider.max = configMaxFlowFactor.max;
        maxFlowSlider.step = configMaxFlowFactor.step;
        maxFlowSlider.value = state.maxFlowFactor;
        maxFlowVal.textContent = state.maxFlowFactor;
    }
    if (sharpnessSlider) {
        sharpnessSlider.min = configBrushSharpness.min;
        sharpnessSlider.max = configBrushSharpness.max;
        sharpnessSlider.step = configBrushSharpness.step;
        sharpnessSlider.value = state.brushSharpness;
        sharpnessVal.textContent = state.brushSharpness;
    }
    if (maxSlopeSlider) {
        maxSlopeSlider.min = configMaxSlope.min;
        maxSlopeSlider.max = configMaxSlope.max;
        maxSlopeSlider.step = configMaxSlope.step;
        maxSlopeSlider.value = state.maxSlope;
        maxSlopeVal.textContent = state.maxSlope;
    }
    if (waterOpacitySlider) {
        waterOpacitySlider.min = configWaterOpacity.min;
        waterOpacitySlider.max = configWaterOpacity.max;
        waterOpacitySlider.step = configWaterOpacity.step;
        waterOpacitySlider.value = state.waterOpacity;
        waterOpacityVal.textContent = state.waterOpacity;
        // Sync material with loaded state
        terrainModule.waterPlaneMat.opacity = state.waterOpacity;
    }
    if (smoothShadingToggle) {
        smoothShadingToggle.checked = state.useSmoothing;
        // Sync terrain shading
        terrainModule.material.flatShading = !state.useSmoothing;
        terrainModule.material.needsUpdate = true;
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

    if (maxFlowSlider) {
        maxFlowSlider.addEventListener('input', () => {
            state.setMaxFlowFactor(parseFloat(maxFlowSlider.value));
            maxFlowVal.textContent = state.maxFlowFactor;
        });
    }

    if (sharpnessSlider) {
        sharpnessSlider.addEventListener('input', () => {
            state.setBrushSharpness(parseFloat(sharpnessSlider.value));
            sharpnessVal.textContent = state.brushSharpness;
        });
    }

    if (maxSlopeSlider) {
        maxSlopeSlider.addEventListener('input', () => {
            state.setMaxSlope(parseFloat(maxSlopeSlider.value));
            maxSlopeVal.textContent = state.maxSlope;
        });
    }

    if (waterOpacitySlider) {
        waterOpacitySlider.addEventListener('input', () => {
            state.setWaterOpacity(parseFloat(waterOpacitySlider.value));
            waterOpacityVal.textContent = state.waterOpacity;
            terrainModule.waterPlaneMat.opacity = state.waterOpacity;
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

    // Color Pickers
    ['colorGrass', 'colorSand', 'colorRock', 'colorBorder'].forEach(key => {
        const picker = document.getElementById(key + 'Picker');
        if (picker) {
            // Set initial picker value from live config color
            const currentConfigColor = terrainModule[key];
            if (currentConfigColor) {
                picker.value = '#' + currentConfigColor.getHexString();
            }

            picker.addEventListener('input', (e) => {
                state.updateColor(key, e.target.value);
                terrainModule.updateTerrainColors();
            });
        }
    });
}
