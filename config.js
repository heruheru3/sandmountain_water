import * as THREE from 'three';

// --- 地形の基本設定 ---
export const terrainWidth = 100;  // 地形の幅
export const terrainDepth = 100;  // 地形の奥行き
export const segments = 100;      // グリッドの分割数（解像度）
export const showGrid = true;     // グリッドヘルパーを表示するか

// --- 色の設定 ---
export const colorGrass = new THREE.Color(0x3a5f0b); // 基本の地面（草地）
export const colorSand = new THREE.Color(0xdeb887);  // 砂の色
export const colorRock = new THREE.Color(0xa69b8d);  // 侵食された岩の色
export const colorBorder = new THREE.Color(0x1a1a2e); // マップ端の境界線（濃い色）
export const colorWater = 0x3a86ff;                  // 水の色

// --- 地形変形の制限 ---
export const domeHeight = 2.0;    // 初期の丘の高さ
export const maxHeight = 1000;    // 山の最大高度
export const bedrockLimit = 0; // 地盤の最低高度（これ以上掘れない）

// --- シミュレーション・パラメータ ---
export const maxSlope = 2.5;             // 砂が崩れ始める最大傾斜
export const slumpRate = 0.8;            // 砂が崩れる際の速度 (0〜1)
export const evaporation = 0.01;       // フレームごとの水の蒸発量 (微量に設定)
export const sedimentCapacityFactor = 2.0; // 水が運べる土砂の容量係数 (下げて安定化)
export const erosionRate = 0.2;          // 地形が削れる速度
export const erosionMax = 0.1;           // 1フレームで削れる最大深さ
export const depositionRate = 0.1;       // 土砂が堆積する速度
export const maxFlowFactor = 0.45;       // 水の流動性係数（高いほど速く流れる）

// --- スライダーの初期値 ---
export const defaultRainRadius = 1;      // 雨の範囲の初期値
export const defaultRainCount = 10;       // 雨の量の初期値
export const defaultBrushRadius = 15;    // 山のブラシ半径の初期値
export const defaultBuildStrength = 0.5; // 地形変形強度の初期値
