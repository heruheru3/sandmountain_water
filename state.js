import { defaultBrushRadius, defaultBuildStrength, defaultRainRadius, defaultRainCount } from './config.js';

export let brushRadius = defaultBrushRadius;
export let buildStrength = defaultBuildStrength;
export let rainRadius = defaultRainRadius;
export let rainCount = defaultRainCount;

export let isDrawing = false;
export let isRightClicking = false;
export let isShiftHeld = false;
export let isRaining = false;

export function setBrushRadius(val) { brushRadius = val; }
export function setBuildStrength(val) { buildStrength = val; }
export function setRainRadius(val) { rainRadius = val; }
export function setRainCount(val) { rainCount = val; }

export function setDrawing(val) { isDrawing = val; }
export function setRightClicking(val) { isRightClicking = val; }
export function setShiftHeld(val) { isShiftHeld = val; }
export function setRaining(val) { isRaining = val; }

export function checkRain() {
    return isRaining || isRightClicking;
}
