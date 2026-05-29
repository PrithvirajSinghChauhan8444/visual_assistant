import * as THREE from 'three';
import { state } from './state.js';

export function initScene() {
  const container = document.getElementById('canvas-container');

  // Scene
  state.scene = new THREE.Scene();

  // Camera (Adjusted FOV and position so her body is perfectly visible and centered!)
  state.camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 20);
  state.camera.position.set(0, 0.75, state.cameraZoomZ);

  // Renderer (alpha: true enables transparent window background)
  state.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  state.renderer.setSize(window.innerWidth, window.innerHeight);
  state.renderer.setPixelRatio(window.devicePixelRatio);
  state.renderer.shadowMap.enabled = true;
  state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  state.renderer.toneMappingExposure = 1.0;
  container.appendChild(state.renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  state.scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(2, 4, 3);
  state.scene.add(dirLight);

  // Grid/floor helper
  const theme = state.themes[state.currentTheme];
  state.gridHelper = new THREE.GridHelper(10, 20, theme.gridColor, 0x221c38);
  state.gridHelper.position.y = 0;
  state.gridHelper.material.opacity = 0.25;
  state.gridHelper.material.transparent = true;
  state.scene.add(state.gridHelper);

  // Window resize handlers
  window.addEventListener('resize', onWindowResize);
  resizeSoundwaveCanvas();
}

export function onWindowResize() {
  if (state.camera && state.renderer) {
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  resizeSoundwaveCanvas();
}

export function resizeSoundwaveCanvas() {
  const soundwaveCanvas = document.getElementById('soundwave-canvas');
  if (soundwaveCanvas) {
    soundwaveCanvas.width = soundwaveCanvas.clientWidth;
    soundwaveCanvas.height = soundwaveCanvas.clientHeight;
  }
}

export function createDigitalOrb() {
  // A glowing, holographic digital particle sphere representing Diana's android AI core
  const geometry = new THREE.IcosahedronGeometry(0.5, 3);
  const theme = state.themes[state.currentTheme];

  const material = new THREE.MeshBasicMaterial({
    color: theme.orbColor,
    wireframe: true,
    transparent: true,
    opacity: 0.55
  });

  state.digitalOrb = new THREE.Mesh(geometry, material);
  state.digitalOrb.position.set(0, 0.75, 0);
  state.scene.add(state.digitalOrb);

  // Add inner glowing point core
  const coreGeo = new THREE.SphereGeometry(0.16, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: theme.coreColor,
    transparent: true,
    opacity: 0.85
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  state.digitalOrb.add(core);
}
