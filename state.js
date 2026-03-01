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

// Settings persistence
export function updateSetting(key, val) {
    window[key] = val; // Assuming we might want to update local let/var, but better to use specific setters
    const settings = JSON.parse(localStorage.getItem('sandmountain_settings') || '{}');
    settings[key] = val;
    localStorage.setItem('sandmountain_settings', JSON.stringify(settings));
}

export function setBrushRadius(val) { brushRadius = val; updateSetting('brushRadius', val); }
export function setBuildStrength(val) { buildStrength = val; updateSetting('buildStrength', val); }
export function setRainRadius(val) { rainRadius = val; updateSetting('rainRadius', val); }
export function setRainCount(val) { rainCount = val; updateSetting('rainCount', val); }
export function setUseSmoothing(val) { useSmoothing = val; updateSetting('useSmoothing', val); }
export function setMaxFlowFactor(val) { maxFlowFactor = val; updateSetting('maxFlowFactor', val); }
export function setBrushSharpness(val) { brushSharpness = val; updateSetting('brushSharpness', val); }
export function setMaxSlope(val) { maxSlope = val; updateSetting('maxSlope', val); }
export function setWaterOpacity(val) { waterOpacity = val; updateSetting('waterOpacity', val); }

export function setDrawing(val) { isDrawing = val; }
export function setRightClicking(val) { isRightClicking = val; }
export function setShiftHeld(val) { isShiftHeld = val; }
export function setRaining(val) { isRaining = val; }
export function setGlobalRaining(val) { isGlobalRaining = val; }

import { colorGrass, colorSand, colorRock, colorBorder } from './config.js';

// Color sync
export function updateColor(key, hex) {
    if (key === 'colorGrass') colorGrass.set(hex);
    if (key === 'colorSand') colorSand.set(hex);
    if (key === 'colorRock') colorRock.set(hex);
    if (key === 'colorBorder') colorBorder.set(hex);

    const colors = JSON.parse(localStorage.getItem('sandmountain_colors') || '{}');
    colors[key] = hex;
    localStorage.setItem('sandmountain_colors', JSON.stringify(colors));
}

// Load persisted data on start
export function loadSavedSettings() {
    // Colors
    const savedColors = localStorage.getItem('sandmountain_colors');
    if (savedColors) {
        const colors = JSON.parse(savedColors);
        Object.keys(colors).forEach(key => updateColor(key, colors[key]));
    }

    // Sliders & Toggles
    const savedSettings = localStorage.getItem('sandmountain_settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.brushRadius !== undefined) brushRadius = settings.brushRadius;
        if (settings.buildStrength !== undefined) buildStrength = settings.buildStrength;
        if (settings.rainRadius !== undefined) rainRadius = settings.rainRadius;
        if (settings.rainCount !== undefined) rainCount = settings.rainCount;
        if (settings.useSmoothing !== undefined) useSmoothing = settings.useSmoothing;
        if (settings.maxFlowFactor !== undefined) maxFlowFactor = settings.maxFlowFactor;
        if (settings.brushSharpness !== undefined) brushSharpness = settings.brushSharpness;
        if (settings.maxSlope !== undefined) maxSlope = settings.maxSlope;
        if (settings.waterOpacity !== undefined) waterOpacity = settings.waterOpacity;
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
