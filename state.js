import { defaultBrushRadius, defaultBuildStrength, defaultRainRadius, defaultRainCount, defaultSmoothing } from './config.js';

export let brushRadius = defaultBrushRadius;
export let buildStrength = defaultBuildStrength;
export let rainRadius = defaultRainRadius;
export let rainCount = defaultRainCount;
export let useSmoothing = defaultSmoothing;

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
