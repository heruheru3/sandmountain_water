import { defaultBrushRadius, defaultBuildStrength, defaultRainRadius, defaultRainCount, defaultSmoothing, defaultMaxFlowFactor, defaultBrushSharpness, defaultMaxSlope, defaultWaterOpacity } from './config.js';

export let brushRadius = defaultBrushRadius;
export let buildStrength = defaultBuildStrength;
export let rainRadius = defaultRainRadius;
export let rainCount = defaultRainCount;
export let useSmoothing = defaultSmoothing;
export let maxFlowFactor = defaultMaxFlowFactor;
export let brushSharpness = defaultBrushSharpness;
export let maxSlope = defaultMaxSlope;
export let waterOpacity = defaultWaterOpacity;

export let isDrawing = false;
export let isRightClicking = false;
export let isShiftHeld = false;
export let isRaining = false;
export let isGlobalRaining = false;

export function setBrushRadius(val) { brushRadius = val; }
export function setBuildStrength(val) { buildStrength = val; }
export function setRainRadius(val) { rainRadius = val; }
export function setRainCount(val) { rainCount = val; }

export function setDrawing(val) { isDrawing = val; }
export function setRightClicking(val) { isRightClicking = val; }
export function setShiftHeld(val) { isShiftHeld = val; }
export function setRaining(val) { isRaining = val; }
export function setGlobalRaining(val) { isGlobalRaining = val; }
export function setUseSmoothing(val) { useSmoothing = val; }
export function setMaxFlowFactor(val) { maxFlowFactor = val; }
export function setBrushSharpness(val) { brushSharpness = val; }
export function setMaxSlope(val) { maxSlope = val; }
export function setWaterOpacity(val) { waterOpacity = val; }

import { colorGrass, colorSand, colorRock, colorBorder } from './config.js';

// Color sync
export function updateColor(key, hex) {
    if (key === 'colorGrass') colorGrass.set(hex);
    if (key === 'colorSand') colorSand.set(hex);
    if (key === 'colorRock') colorRock.set(hex);
    if (key === 'colorBorder') colorBorder.set(hex);

    // Persist to localStorage for next session
    const colors = JSON.parse(localStorage.getItem('sandmountain_colors') || '{}');
    colors[key] = hex;
    localStorage.setItem('sandmountain_colors', JSON.stringify(colors));
}

// Load persisted colors on start
export function loadSavedColors() {
    const saved = localStorage.getItem('sandmountain_colors');
    if (saved) {
        const colors = JSON.parse(saved);
        Object.keys(colors).forEach(key => updateColor(key, colors[key]));
    }
}

export let waterSources = []; // [{id, x, z, marker}]

export function addWaterSource(x, z, marker) {
    const id = Date.now();
    waterSources.push({ id, x, z, marker });
    return id;
}

export function removeWaterSource(id) {
    const index = waterSources.findIndex(s => s.id === id);
    if (index !== -1) {
        const source = waterSources[index];
        if (source.marker) {
            source.marker.parent.remove(source.marker);
        }
        waterSources.splice(index, 1);
    }
}

export function clearWaterSources() {
    waterSources.forEach(s => {
        if (s.marker && s.marker.parent) {
            s.marker.parent.remove(s.marker);
        }
    });
    waterSources = [];
}

export function checkRain() {
    return isRaining || isRightClicking;
}
