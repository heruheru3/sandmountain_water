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
    const key = `dem/${zoom}/${tx}/${ty}`;
    if (tileCache.has(key)) return tileCache.get(key);

    const url = `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${zoom}/${tx}/${ty}.png`;
    const data = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        const timeout = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            img.src = ""; // Stop loading
            console.warn("DEM tile timeout:", url);
            resolve(new Float32Array(256 * 256).fill(0));
        }, 10000);

        img.onload = () => {
            clearTimeout(timeout);
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
            clearTimeout(timeout);
            console.warn("Missing DEM tile, treating as sea level:", url);
            resolve(new Float32Array(256 * 256).fill(0));
        };
        img.src = url;
    });

    tileCache.set(key, data);
    return data;
}

async function getMapTileData(tx, ty, zoom) {
    const key = `map/${zoom}/${tx}/${ty}`;
    if (tileCache.has(key)) return tileCache.get(key);

    const url = `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${zoom}/${tx}/${ty}.jpg`;
    const data = await new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        const timeout = setTimeout(() => {
            img.onload = null;
            img.onerror = null;
            img.src = "";
            console.warn("PHOTO tile timeout:", url);
            resolve(null);
        }, 10000);

        img.onload = () => {
            clearTimeout(timeout);
            const canvas = document.createElement("canvas");
            canvas.width = 256;
            canvas.height = 256;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            resolve(ctx.getImageData(0, 0, 256, 256).data);
        };
        img.onerror = () => {
            clearTimeout(timeout);
            console.warn("Missing PHOTO tile:", url);
            resolve(null);
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
    const idealZoom = Math.log2((360 * targetSegments) / (256 * lngSpan));
    return Math.max(6, Math.min(14, Math.round(idealZoom)));
}

/**
 * Fetch terrain and forest data exactly within the given LatLng bounds
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
    const forestData = new Uint8Array(size * size);

    const dLat = (ne.lat - sw.lat) / (size - 1);
    const dLng = (ne.lng - sw.lng) / (size - 1);

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
            coords.push({ lat, lng, tf, tx, ty });
        }
    }

    const heightTileMap = new Map();
    const mapTileMap = new Map();
    const fetchPromises = Array.from(neededTiles).map(async (key) => {
        const [tx, ty] = key.split(',').map(Number);
        const [hData, mData] = await Promise.all([
            getTileData(tx, ty, zoom),
            getMapTileData(tx, ty, zoom)
        ]);
        heightTileMap.set(key, hData);
        mapTileMap.set(key, mData);
    });
    await Promise.all(fetchPromises);

    for (let idx = 0; idx < coords.length; idx++) {
        const { tf, tx, ty } = coords[idx];
        const hTile = heightTileMap.get(`${tx},${ty}`);
        const mTile = mapTileMap.get(`${tx},${ty}`);

        const px = (tf.x - tx) * 255;
        const py = (tf.y - ty) * 255;

        // Height sampling (Bilinear)
        const x1 = Math.floor(px), x2 = Math.min(x1 + 1, 255);
        const y1 = Math.floor(py), y2 = Math.min(y1 + 1, 255);
        const fx = px - x1, fy = py - y1;

        if (hTile) {
            const h11 = hTile[y1 * 256 + x1];
            const h21 = hTile[y1 * 256 + x2];
            const h12 = hTile[y2 * 256 + x1];
            const h22 = hTile[y2 * 256 + x2];
            const h1 = h11 * (1 - fx) + h21 * fx;
            const h2 = h12 * (1 - fx) + h22 * fx;
            resultHeights[idx] = h1 * (1 - fy) + h2 * fy;
        }

        // Forest detection (Map color)
        if (mTile) {
            const mx = Math.round(px);
            const my = Math.round(py);
            const pIdx = (my * 256 + mx) * 4;
            const r = mTile[pIdx];
            const g = mTile[pIdx + 1];
            const b = mTile[pIdx + 2];

            // Satellite/Aviation photo forest detection logic:
            // Forests are typically darker green (G is higher than R and B).
            // Urban areas are gray (R,G,B are almost equal).
            // Water is blue/dark blue.

            const isGreenish = (g > r * 1.05 && g > b * 1.05);
            // Ignore very bright surfaces (clouds, roofs, bright buildings)
            const isNotTooBright = (r < 180 && g < 180 && b < 180);
            // Ensure there's some actual color (not gray)
            const saturation = Math.max(r, g, b) - Math.min(r, g, b);

            if (isGreenish && isNotTooBright && saturation > 10) {
                forestData[idx] = 1;
            }
        }
    }

    return { heights: resultHeights, forestData };
}
