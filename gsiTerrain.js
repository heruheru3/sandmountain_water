import { segments } from './config.js';

/**
 * GSI Elevation Tile Decoding
 */
function decodeGSIHeight(r, g, b) {
    let x = r * 65536 + g * 256 + b;
    if (x === 8388608) return 0; // Invalid
    if (x < 8388608) return x * 0.01;
    return (x - 16777216) * 0.01;
}

/**
 * Lat/Lng to Tile coordinates (float)
 */
function latLngToTileFloat(lat, lng, zoom) {
    const latRad = lat * Math.PI / 180;
    const n = Math.pow(2, zoom);
    const x = (lng + 180) / 360 * n;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { x, y };
}

const tileCache = new Map();

async function getTileData(tx, ty, zoom) {
    const key = `${zoom}/${tx}/${ty}`;
    if (tileCache.has(key)) return tileCache.get(key);

    const url = `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${zoom}/${tx}/${ty}.png`;
    const data = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, 256, 256).data;
            const heights = new Float32Array(256 * 256);
            for (let i = 0; i < 256 * 256; i++) {
                heights[i] = decodeGSIHeight(imageData[i * 4], imageData[i * 4 + 1], imageData[i * 4 + 2]);
            }
            resolve(heights);
        };
        img.onerror = () => {
            console.warn("Missing tile, treating as sea level:", url);
            resolve(new Float32Array(256 * 256).fill(0));
        };
        img.src = url;
    });

    tileCache.set(key, data);
    return data;
}

/**
 * Calculate optimal zoom level based on geographic extent
 */
function calculateOptimalZoom(bounds, targetSegments) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const lngSpan = Math.abs(ne.lng - sw.lng);

    // Target: 1 segment in simulator roughly matches 1 pixel in tile
    // 2^Z = (360 * targetSegments) / (256 * lngSpan)
    const idealZoom = Math.log2((360 * targetSegments) / (256 * lngSpan));

    // Clamp between 6 and 14 (GSI dem_png safe range)
    return Math.max(6, Math.min(14, Math.round(idealZoom)));
}

/**
 * Fetch terrain exactly within the given LatLng bounds
 */
export async function fetchGSITerrainInBounds(bounds, targetSegments, zoom = null) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    if (zoom === null) {
        zoom = calculateOptimalZoom(bounds, targetSegments);
        console.log("Auto-selected zoom level:", zoom);
    }

    const size = targetSegments + 1;
    const resultHeights = new Float32Array(size * size);

    const dLat = (ne.lat - sw.lat) / (size - 1);
    const dLng = (ne.lng - sw.lng) / (size - 1);

    // Phase 1: Identify all unique tiles needed
    const neededTiles = new Set();
    const coords = [];
    for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
            const lat = ne.lat - j * dLat;
            const lng = sw.lng + i * dLng;
            const tf = latLngToTileFloat(lat, lng, zoom);
            const tx = Math.floor(tf.x);
            const ty = Math.floor(tf.y);
            neededTiles.add(`${tx},${ty}`);
            coords.push({ tf, tx, ty });
        }
    }

    // Phase 2: Fetch all needed tiles concurrently
    const tileMap = new Map();
    const fetchPromises = Array.from(neededTiles).map(async (key) => {
        const [tx, ty] = key.split(',').map(Number);
        const data = await getTileData(tx, ty, zoom);
        tileMap.set(key, data);
    });
    await Promise.all(fetchPromises);

    // Phase 3: Sample heights
    for (let idx = 0; idx < coords.length; idx++) {
        const { tf, tx, ty } = coords[idx];
        const tileData = tileMap.get(`${tx},${ty}`);

        const px = (tf.x - tx) * 255;
        const py = (tf.y - ty) * 255;

        // Bilinear sampling within tile
        const x1 = Math.floor(px);
        const x2 = Math.min(x1 + 1, 255);
        const y1 = Math.floor(py);
        const y2 = Math.min(y1 + 1, 255);
        const fx = px - x1;
        const fy = py - y1;

        const h11 = tileData[y1 * 256 + x1];
        const h21 = tileData[y1 * 256 + x2];
        const h12 = tileData[y2 * 256 + x1];
        const h22 = tileData[y2 * 256 + x2];

        const h1 = h11 * (1 - fx) + h21 * fx;
        const h2 = h12 * (1 - fx) + h22 * fx;
        resultHeights[idx] = h1 * (1 - fy) + h2 * fy;
    }

    return resultHeights;
}
