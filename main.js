import { state } from './src/state.js';
import { initScene } from './src/scene.js';
import { loadVRMAvatar } from './src/vrmLoader.js';
import { animate } from './src/proceduralAnimation.js';
import { setupSSEListener } from './src/sseClient.js';
import { setupConfigListeners } from './src/uiControls.js';

// Global mouse tracker for interactive 3D character gaze look-at
window.addEventListener('mousemove', (e) => {
  state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  state.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});

// Initialize Diana Visual Companion Application
initScene();
loadVRMAvatar();
setupSSEListener();
setupConfigListeners();
animate();
