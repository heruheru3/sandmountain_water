import * as THREE from 'three';
import { scene, camera, renderer, controls } from './scene.js';
import { initTerrain } from './terrain.js';
import { initInteraction, mouse } from './interaction.js';
import { updateSimulation } from './simulation.js';
import { loadSavedColors } from './state.js';

// Init
loadSavedColors();
initTerrain();
initInteraction();

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();

    updateSimulation(mouse);

    renderer.render(scene, camera);
}

animate();
