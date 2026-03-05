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
    configWaterOpacity,
    configSourceEmission,
    terrainWidth,
    terrainDepth,
    segments,
    defaultHeightRange
} from './config.js';
import { fetchGSITerrainInBounds } from './gsiTerrain.js';

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

let lastPlantPosition = new THREE.Vector3();
const MIN_PLANT_DISTANCE = 8.0; // Minimum distance between trees when dragging

export function initInteraction() {
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') state.setShiftHeld(true);
        if (e.key === 'r' || e.key === 'R') state.setRaining(true);
        if (e.key === 't' || e.key === 'T') {
            const newState = !state.isPlanting;
            state.setPlanting(newState);
            if (newState) {
                state.setBuildingHouse(false);
                updateHouseUI(false);
            }
            updatePlantingUI(newState);
        }
        if (e.key === 'h' || e.key === 'H') {
            const newState = !state.isBuildingHouse;
            state.setBuildingHouse(newState);
            if (newState) {
                state.setPlanting(false);
                updatePlantingUI(false);
            }
            updateHouseUI(newState);
        }
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
        if (e.target.closest('.modal-overlay:not(.modal-hidden)')) return;

        if (e.button === 0) {
            if (state.isPlanting) {
                // Planting a tree
                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObject(terrainModule.terrain);
                if (intersects.length > 0) {
                    terrainModule.plantTree(intersects[0].point);
                    lastPlantPosition.copy(intersects[0].point);
                }
            } else if (state.isBuildingHouse) {
                // Building a house
                mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
                mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObject(terrainModule.terrain);
                if (intersects.length > 0) {
                    terrainModule.buildHouse(intersects[0].point);
                }
            } else {
                state.setDrawing(true);
            }
        }
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
            const color = state.getNextSourceColor();
            const marker = terrainModule.createSourceMarker(p, color);

            const gx = Math.round((p.x + terrainWidth / 2) / terrainWidth * segments);
            const gz = Math.round((p.z + terrainDepth / 2) / terrainDepth * segments);
            const idx = gz * (segments + 1) + gx;

            state.addWaterSource(p.x, p.z, marker, idx, color);
        }
    }

    window.addEventListener('pointerup', (e) => {
        // Always reset mouse-down states on pointerup for safety
        if (e.button === 0) state.setDrawing(false);
        if (e.button === 2) {
            state.setRightClicking(false);
            clearTimeout(rightClickTimeout);
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (e.target.closest('#ui-container')) return;
        if (e.target.closest('.modal-overlay:not(.modal-hidden)')) return;

        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

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

            if (state.isPlanting && (e.buttons & 1)) {
                // Check distance from last planted tree
                if (intersects[0].point.distanceTo(lastPlantPosition) > MIN_PLANT_DISTANCE) {
                    terrainModule.plantTree(intersects[0].point);
                    lastPlantPosition.copy(intersects[0].point);
                }
            }
        } else {
            cursorMesh.visible = false;
        }
    });

    window.addEventListener('wheel', (e) => {
        if (e.target.closest('#ui-container')) return;
        if (e.target.closest('.modal-overlay:not(.modal-hidden)')) return;

        // "Zoom towards cursor" logic
        // Find the intersection point on the terrain
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(terrainModule.terrain);
        if (intersects.length > 0) {
            const cursorPoint = intersects[0].point;

            // Move both target AND camera by the same vector.
            // This shifts the view horizontally/vertically without rotating the viewport,
            // which handles the "swaying" issue when looking from a top-down perspective.
            const shift = new THREE.Vector3().subVectors(cursorPoint, controls.target).multiplyScalar(0.1);

            controls.target.add(shift);
            camera.position.add(shift);
        }
    }, { passive: true });

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
    const sourceEmissionSlider = document.getElementById('sourceEmission');
    const sourceEmissionVal = document.getElementById('sourceEmissionVal');
    const smoothShadingToggle = document.getElementById('smoothShading');
    const showGridToggle = document.getElementById('showGrid');
    const plantBtn = document.getElementById('plantBtn');
    const houseBtn = document.getElementById('houseBtn');
    const importTerrainBtn = document.getElementById('importTerrainBtn');
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
    if (sourceEmissionSlider) {
        sourceEmissionSlider.min = configSourceEmission.min;
        sourceEmissionSlider.max = configSourceEmission.max;
        sourceEmissionSlider.step = configSourceEmission.step;
        sourceEmissionSlider.value = state.sourceEmission;
        sourceEmissionVal.textContent = state.sourceEmission;
    }
    if (smoothShadingToggle) {
        smoothShadingToggle.checked = state.useSmoothing;
        // Sync terrain shading
        terrainModule.material.flatShading = !state.useSmoothing;
        terrainModule.material.needsUpdate = true;
    }
    if (showGridToggle) {
        showGridToggle.checked = state.showGrid;
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

    if (sourceEmissionSlider) {
        sourceEmissionSlider.addEventListener('input', () => {
            state.setSourceEmission(parseFloat(sourceEmissionSlider.value));
            sourceEmissionVal.textContent = state.sourceEmission;
        });
    }

    if (smoothShadingToggle) {
        smoothShadingToggle.addEventListener('change', () => {
            state.setUseSmoothing(smoothShadingToggle.checked);
            terrainModule.material.flatShading = !state.useSmoothing;
            terrainModule.material.needsUpdate = true;
        });
    }

    if (showGridToggle) {
        showGridToggle.addEventListener('change', () => {
            state.setShowGrid(showGridToggle.checked);
            terrainModule.wireframeMesh.visible = state.showGrid;
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

    if (plantBtn) {
        plantBtn.addEventListener('click', () => {
            const newState = !state.isPlanting;
            state.setPlanting(newState);
            if (newState) {
                state.setBuildingHouse(false);
                updateHouseUI(false);
            }
            updatePlantingUI(newState);
        });
    }

    if (houseBtn) {
        houseBtn.addEventListener('click', () => {
            const newState = !state.isBuildingHouse;
            state.setBuildingHouse(newState);
            if (newState) {
                state.setPlanting(false);
                updatePlantingUI(false);
            }
            updateHouseUI(newState);
        });
    }

    function updatePlantingUI(newState) {
        if (!plantBtn) return;
        if (newState) {
            plantBtn.classList.add('active');
            plantBtn.textContent = '🌲 Plant Tree: ON';
            cursorMesh.material.color.set(0x2e7d32); // Green for planting
        } else {
            plantBtn.classList.remove('active');
            plantBtn.textContent = '🌲 Plant Tree: OFF';
            // If house is not on, revert to blue
            if (!state.isBuildingHouse) cursorMesh.material.color.set(0x4facfe);
        }
    }

    function updateHouseUI(newState) {
        if (!houseBtn) return;
        if (newState) {
            houseBtn.classList.add('active');
            houseBtn.textContent = '🏠 Build House: ON';
            cursorMesh.material.color.set(0xffa500); // Orange for house
        } else {
            houseBtn.classList.remove('active');
            houseBtn.textContent = '🏠 Build House: OFF';
            // If tree is not on, revert to blue
            if (!state.isPlanting) cursorMesh.material.color.set(0x4facfe);
        }
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            state.clearWaterSources();
            state.clearTrees();
            state.clearHouses();
            terrainModule.resetTreeResistance();
            terrainModule.initTerrain();
            terrainModule.updateWaterMesh();
        });
    }

    // --- Map Modal Logic ---
    const mapModal = document.getElementById('map-modal');
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    const cancelImportBtn = document.getElementById('cancelImportBtn');
    const closeMapModal = mapModal.querySelector('.close-modal');
    const coordDisplay = document.getElementById('coord-display');
    let map = null;
    let mapMarker = null;

    if (importTerrainBtn) {
        importTerrainBtn.addEventListener('click', () => {
            // Stop any active terrain interactions
            state.setDrawing(false);
            state.setRightClicking(false);
            state.setPlanting(false);
            state.setBuildingHouse(false);
            updatePlantingUI(false);
            updateHouseUI(false);

            const normalizeCheck = document.getElementById('normalizeHeight');
            const heightInput = document.getElementById('targetHeightRange');
            const heightVal = document.getElementById('targetHeightRangeVal');
            const heightGroup = document.getElementById('heightRangeGroup');

            const hardnessInput = document.getElementById('importHardness');
            const hardnessVal = document.getElementById('importHardnessVal');

            const autoWaterInput = document.getElementById('autoWaterSources');
            const autoWaterVal = document.getElementById('autoWaterSourcesVal');

            if (normalizeCheck) normalizeCheck.checked = state.normalizeHeight;
            if (autoWaterInput) {
                autoWaterInput.value = state.autoWaterSources;
                if (autoWaterVal) autoWaterVal.textContent = state.autoWaterSources;
            }
            if (heightInput) {
                heightInput.value = state.targetHeightRange;
                if (heightVal) heightVal.textContent = state.targetHeightRange;
            }
            if (heightGroup) heightGroup.style.display = state.normalizeHeight ? 'flex' : 'none';
            if (hardnessInput) {
                hardnessInput.value = state.importHardness;
                if (hardnessVal) hardnessVal.textContent = state.importHardness;
            }

            mapModal.style.display = 'flex';
            mapModal.classList.remove('modal-hidden');
            initMap();
        });
    }

    function hideMapModal() {
        hideModal(mapModal);
    }

    function hideModal(modal) {
        modal.classList.add('modal-hidden');

        // Safety reset for all interaction states
        state.setDrawing(false);
        state.setRightClicking(false);
        state.setRaining(false);

        setTimeout(() => {
            if (modal.classList.contains('modal-hidden')) {
                modal.style.display = 'none';
            }
        }, 300); // Wait for transition
    }

    cancelImportBtn.addEventListener('click', hideMapModal);
    closeMapModal.addEventListener('click', hideMapModal);

    function initMap() {
        if (map) return;
        // Mount Fuji center
        const startPos = [35.3606, 138.7274];
        map = L.map('map-container').setView(startPos, 14);
        L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
            attribution: '&copy; Geospatial Information Authority of Japan'
        }).addTo(map);

        // Selection rectangle (roughly 2km x 2km to match Z14 tile)
        const rectSize = 0.02; // Approx 2.2km in lat degree
        const bounds = [
            [startPos[0] - rectSize / 2, startPos[1] - rectSize / 2],
            [startPos[0] + rectSize / 2, startPos[1] + rectSize / 2]
        ];
        mapMarker = L.rectangle(bounds, { color: "#ff7800", weight: 2, fillOpacity: 0.2 }).addTo(map);

        // Enable resizing and dragging via Geoman
        mapMarker.pm.enable({
            draggable: true,
            snappable: false
        });

        const updateCoords = () => {
            const center = mapMarker.getBounds().getCenter();
            coordDisplay.textContent = `Lat: ${center.lat.toFixed(4)}, Lng: ${center.lng.toFixed(4)}`;
        };

        // Initial coordinate display
        updateCoords();

        // Update marker position when map moves, but only if not being explicitly dragged/edited
        let isInteractingWithMarker = false;
        mapMarker.on('pm:dragstart pm:markerdragstart', () => { isInteractingWithMarker = true; });

        const forceSquare = () => {
            const bounds = mapMarker.getBounds();
            const center = bounds.getCenter();
            const latDelta = Math.abs(bounds.getNorth() - bounds.getSouth());
            const lngDelta = Math.abs(bounds.getEast() - bounds.getWest());
            const size = Math.max(latDelta, lngDelta);

            const newBounds = [
                [center.lat - size / 2, center.lng - size / 2],
                [center.lat + size / 2, center.lng + size / 2]
            ];
            mapMarker.setBounds(newBounds);
            updateCoords();
        };

        mapMarker.on('pm:edit', forceSquare);

        mapMarker.on('pm:dragend pm:markerdragend pm:edit', () => {
            isInteractingWithMarker = false;
            updateCoords();
        });

        map.on('movestart', () => {
            // Hide handles while panning to avoid lag/drift
            if (!isInteractingWithMarker) mapMarker.pm.disable();
        });

        map.on('move', () => {
            if (isInteractingWithMarker) return;

            const center = map.getCenter();
            const currentBounds = mapMarker.getBounds();
            const latHalf = (currentBounds.getNorth() - currentBounds.getSouth()) / 2;
            const lngHalf = (currentBounds.getEast() - currentBounds.getWest()) / 2;

            const b = [
                [center.lat - latHalf, center.lng - lngHalf],
                [center.lat + latHalf, center.lng + lngHalf]
            ];
            mapMarker.setBounds(b);
            updateCoords();
        });

        map.on('moveend', () => {
            // Show handles again once the map stops
            if (!isInteractingWithMarker) {
                mapMarker.pm.enable({
                    draggable: true,
                    snappable: false
                });
            }
        });

        // Add a global safety reset for the flag
        window.addEventListener('mouseup', () => {
            setTimeout(() => { isInteractingWithMarker = false; }, 100);
        });
    }

    confirmImportBtn.addEventListener('click', async () => {
        const bounds = mapMarker.getBounds();
        const initialHardness = parseFloat(document.getElementById('importHardness').value) || 1.0;
        const targetRange = state.normalizeHeight ? state.targetHeightRange : null;

        // Calculate natural scale factor (proportional to real-world dimensions)
        // This prevents the "skyscraper" effect when normalization is OFF.
        const sw = bounds.getSouthWest();
        const se = bounds.getSouthEast();
        const geoWidthMeters = sw.distanceTo(se);
        const naturalScale = terrainWidth / (geoWidthMeters || 1000); // 200 units / distance in meters

        confirmImportBtn.disabled = true;
        confirmImportBtn.textContent = "Fetching...";

        try {
            // Fetch terrain and forest data precisely within selection bounds (Auto-zoom)
            const { heights, forestData } = await fetchGSITerrainInBounds(bounds, segments);
            terrainModule.setHeightData(heights, targetRange, initialHardness, naturalScale, forestData, state.autoWaterSources);
            hideMapModal();
        } catch (err) {
            console.error(err);
            alert("Failed to import terrain data.");
        } finally {
            confirmImportBtn.disabled = false;
            confirmImportBtn.textContent = "Import Area";
        }
    });

    const targetHeightRange = document.getElementById('targetHeightRange');
    const targetHeightRangeVal = document.getElementById('targetHeightRangeVal');
    const normalizeHeightCheck = document.getElementById('normalizeHeight');
    const heightRangeGroup = document.getElementById('heightRangeGroup');

    if (targetHeightRange && targetHeightRangeVal) {
        targetHeightRange.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            targetHeightRangeVal.textContent = val;
            state.setTargetHeightRange(val);
        });
    }

    if (normalizeHeightCheck) {
        normalizeHeightCheck.addEventListener('change', (e) => {
            state.setNormalizeHeight(e.target.checked);
            if (heightRangeGroup) {
                heightRangeGroup.style.display = e.target.checked ? 'flex' : 'none';
            }
        });
    }

    const importHardness = document.getElementById('importHardness');
    const importHardnessVal = document.getElementById('importHardnessVal');
    const autoWaterSourcesInput = document.getElementById('autoWaterSources');
    const autoWaterSourcesVal = document.getElementById('autoWaterSourcesVal');
    if (autoWaterSourcesInput && autoWaterSourcesVal) {
        autoWaterSourcesInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            autoWaterSourcesVal.textContent = val;
            state.setAutoWaterSources(val);
        });
    }

    if (importHardness && importHardnessVal) {
        importHardness.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            importHardnessVal.textContent = val;
            state.setImportHardness(val);
        });
    }

    // --- Settings Modal Logic ---
    const settingsModal = document.getElementById('settings-modal');
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');

    if (openSettingsBtn && settingsModal) {
        openSettingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            settingsModal.classList.remove('modal-hidden');
        });
    }

    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            hideModal(settingsModal);
        });
    }

    // Close modal when clicking outside content
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                hideModal(settingsModal);
            }
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
