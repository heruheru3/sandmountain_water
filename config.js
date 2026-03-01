import * as THREE from 'three';

// --- 地形の基本設定 ---
export const terrainWidth = 100;  // 地形の幅
export const terrainDepth = 100;  // 地形の奥行き
export const segments = 100;      // グリッドの分割数（解像度）
export const showGrid = true;     // グリッドヘルパーを表示するか

// --- 色の設定 ---
// export const colorGrass = new THREE.Color(0x3a5f0b); // 基本の地面（草地）
export const colorGrass = new THREE.Color(0xaaaaaa); // 基本の地面（草地）
export const colorSand = new THREE.Color(0xeeeeee);  // 砂の色
export const colorRock = new THREE.Color(0xdddddd);  // 削られた砂の色（少し暗いトーン）
export const colorBorder = new THREE.Color(0x444444); // マップ端の境界線（濃い色）
export const colorWater = 0x3a86ff;                  // 水の色

// --- 地形変形の制限 ---
export const domeHeight = 10.0;    // 初期の丘の高さ
export const maxHeight = 1000;    // 山の最大高度
export const bedrockLimit = 1; // 地盤の最低高度（これ以上掘れない）

// --- シミュレーション・パラメータ ---
export const slumpRate = 0.8;            // 砂が崩れる際の速度 (0〜1)
export const evaporation = 0.0002;       // フレームごとの水の蒸発量 (微量に設定)
export const sedimentCapacityFactor = 4.0; // 水が運べる土砂の容量係数 (下げて安定化)
export const erosionRate = 0.4;          // 地形が削れる速度
export const erosionMax = 0.3;           // 1フレームで削れる最大深さ
export const depositionRate = 0.1;       // 土砂が堆積する速度

// --- スライダーの初期値と範囲 ---
export const configRainRadius = { default: 1.0, min: 1.0, max: 20.0, step: 0.5 };
export const configRainCount = { default: 10, min: 1, max: 100, step: 1 };
export const configBrushRadius = { default: 15.0, min: 1.0, max: 40.0, step: 0.5 };
export const configBuildStrength = { default: 0.2, min: 0.01, max: 1.0, step: 0.01 };
export const configMaxFlowFactor = { default: 0.2, min: 0.01, max: 1.0, step: 0.01 };
export const configBrushSharpness = { default: 2.0, min: 0.1, max: 10.0, step: 0.1 };
export const configMaxSlope = { default: 3.0, min: 0.5, max: 50.0, step: 0.5 };
export const defaultSmoothing = false;    // スムージングの初期設定 (true = Smooth, false = Flat)

// For backward compatibility or simpler access
export const defaultRainRadius = configRainRadius.default;
export const defaultRainCount = configRainCount.default;
export const defaultBrushRadius = configBrushRadius.default;
export const defaultBuildStrength = configBuildStrength.default;
export const defaultMaxFlowFactor = configMaxFlowFactor.default;
export const defaultBrushSharpness = configBrushSharpness.default;
export const defaultMaxSlope = configMaxSlope.default;

// --- ランダム地形生成のパラメタ ---
export const randomHillCountMin = 5;
export const randomHillCountMax = 10;
export const randomHillRadiusMin = 10;
export const randomHillRadiusMax = 30;
export const randomHillStrengthMin = 2; // 前より高く (0.1 -> 0.3)
export const randomHillStrengthMax = 30; // 前より高く (0.3 -> 0.8)

// --- 雨の降下パラメタ ---
export const rainDropAmount = 0.2;        // マウス位置の1滴あたりの水量
export const globalRainDropAmount = 0.03;  // 全体雨の1滴あたりの水量
export const globalRainDensity = 1.0;     // 全体雨の密度係数
// --- 水源（湧水点）の設定 ---
export const sourceMarkerHeight = 10.0;  // 地面からアイコンまでの高さ
