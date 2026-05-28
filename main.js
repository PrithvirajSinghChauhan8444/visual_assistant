import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// Set up globals
let scene, camera, renderer;
let currentVrm = null;
let digitalOrb = null;
let mouse = new THREE.Vector2(0, 0);
let targetMouthOpen = 0;
let currentMouthOpen = 0;
let clock = new THREE.Clock();

// Element references
const bubble = document.getElementById('chat-bubble');
const bubbleText = document.getElementById('bubble-text');
const statusVal = document.getElementById('status-val');
const speechVal = document.getElementById('speech-val');

init();
animate();
setupSSEListener();

function init() {
  const container = document.getElementById('canvas-container');

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20);
  camera.position.set(0, 1.4, 3.5);

  // Renderer (alpha: true enables transparent window background)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  // Futuristic grid/floor helper for placement anchoring
  const gridHelper = new THREE.GridHelper(10, 20, 0x8b5cf6, 0x221c38);
  gridHelper.position.y = 0;
  gridHelper.material.opacity = 0.2;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // Try loading VRM model. Fallback to stunning glowing digital orb if none found.
  loadVRMAvatar();

  // Window resize handler
  window.addEventListener('resize', onWindowResize);

  // Mouse tracking for gaze/tilt interactive control
  window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
}

function loadVRMAvatar() {
  const loader = new GLTFLoader();
  
  // Register VRM loader plugin
  loader.register((parser) => {
    return new VRMLoaderPlugin(parser);
  });

  const vrmPath = 'models/diana.vrm'; // Put your VRM file here

  loader.load(
    vrmPath,
    (gltf) => {
      const vrm = gltf.userData.vrm;
      currentVrm = vrm;
      
      // Position character on the right side of the screen
      vrm.scene.position.set(0.6, 0, 0);
      vrm.scene.rotation.y = -Math.PI / 6; // Slight angle towards the center
      scene.add(vrm.scene);

      // Disable physics/springbones updating initially
      vrm.humanoid.getNormalizedBoneNode('head');
      
      console.log('✅ VRM Model Loaded Successfully!');
      document.getElementById('model-val').textContent = 'Diana Avatar (Loaded)';
    },
    (progress) => {
      console.log(`Loading VRM: ${Math.round((progress.loaded / progress.total) * 100)}%`);
    },
    (error) => {
      console.log('ℹ️ No diana.vrm found. Initializing Android Digital Particle Orb...');
      createDigitalOrb();
    }
  );
}

function createDigitalOrb() {
  // A glowing, holographic digital particle sphere representing Diana's android AI core
  const geometry = new THREE.IcosahedronGeometry(0.5, 3);
  
  // Wireframe material with neon glow
  const material = new THREE.MeshBasicMaterial({
    color: 0x8b5cf6,
    wireframe: true,
    transparent: true,
    opacity: 0.6
  });

  digitalOrb = new THREE.Mesh(geometry, material);
  
  // Position orb bottom right
  digitalOrb.position.set(0.6, 0.8, 0);
  scene.add(digitalOrb);

  // Add inner glowing point core
  const coreGeo = new THREE.SphereGeometry(0.15, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: 0xff007f,
    transparent: true,
    opacity: 0.8
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  digitalOrb.add(core);

  // Add floating particle rings
  const ringGeo = new THREE.RingGeometry(0.7, 0.72, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff007f,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  digitalOrb.add(ring);

  document.getElementById('model-val').textContent = 'Diana Core (Active)';
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // 1. Animate Digital Orb if VRM fallback is active
  if (digitalOrb) {
    digitalOrb.rotation.y = time * 0.3;
    digitalOrb.rotation.x = time * 0.15;
    
    // Pulsate based on mouth open value (loudness)
    const scale = 1.0 + currentMouthOpen * 0.6 + Math.sin(time * 3) * 0.05;
    digitalOrb.scale.set(scale, scale, scale);
    
    // Gaze/skew slightly towards mouse cursor
    digitalOrb.position.x = 0.6 + mouse.x * 0.15;
    digitalOrb.position.y = 0.8 + mouse.y * 0.15;
  }

  // 2. Animate VRM Model (Idle sway, gaze, lip sync)
  if (currentVrm) {
    // Standard idle breath movement
    currentVrm.humanoid.getNormalizedBoneNode('chest').rotation.z = Math.sin(time) * 0.01;
    currentVrm.humanoid.getNormalizedBoneNode('head').rotation.y = Math.sin(time * 0.5) * 0.03;

    // Gaze at mouse cursor
    const lookAtTarget = new THREE.Vector3(mouse.x * 2, mouse.y * 2 + 1, 2);
    currentVrm.lookAt.lookAt(lookAtTarget);

    // Dynamic Lip Sync (Linear Interpolation for smooth motion)
    currentMouthOpen = THREE.MathUtils.lerp(currentMouthOpen, targetMouthOpen, 0.25);
    currentVrm.expressionManager.setValue('aa', currentMouthOpen);
    currentVrm.expressionManager.setValue('ih', currentMouthOpen * 0.2); // slight secondary blend
    currentVrm.expressionManager.update();
    
    // Update spring bones
    currentVrm.update(delta);
  }

  renderer.render(scene, camera);
}

// Setup EventSource listener to listen to SSE broadcast from Python Voice synthesis pipeline
function setupSSEListener() {
  const sseUrl = 'http://localhost:8080/stream';
  let eventSource = null;

  function connect() {
    statusVal.className = 'status-connecting';
    statusVal.textContent = 'CONNECTING';
    
    eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      console.log('🔌 Connected to local Diana Voice Pipeline SSE Server!');
      statusVal.className = 'status-active';
      statusVal.textContent = 'ONLINE';
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handlePipelineEvent(payload);
      } catch (err) {
        console.error('Error parsing SSE event payload:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.log('⚠️ SSE Connection lost. Retrying in 5 seconds...');
      eventSource.close();
      statusVal.className = '';
      statusVal.textContent = 'OFFLINE';
      speechVal.textContent = 'Offline';
      
      // Auto-reconnect loop
      setTimeout(connect, 5000);
    };
  }

  connect();
}

let bubbleFadeTimeout = null;

function handlePipelineEvent(event) {
  switch (event.type) {
    case 'thinking':
      speechVal.textContent = 'Thinking...';
      bubbleText.innerHTML = '<span class="thinking-dots">...</span>';
      bubble.classList.remove('hidden');
      setTimeout(() => bubble.classList.add('active'), 20);
      break;

    case 'sentence_start':
      speechVal.textContent = 'Speaking';
      bubbleText.textContent = event.text;
      bubble.classList.remove('hidden');
      bubble.classList.add('active');
      
      // Cancel any pending fade outs
      if (bubbleFadeTimeout) clearTimeout(bubbleFadeTimeout);
      
      // Simulate dynamic mouth movements during speaking if RVC or audio is playing
      startMouthSyncSimulation();
      break;

    case 'sentence_end':
      speechVal.textContent = 'Idle';
      stopMouthSyncSimulation();
      
      // Fade out bubble after 4 seconds of silence
      if (bubbleFadeTimeout) clearTimeout(bubbleFadeTimeout);
      bubbleFadeTimeout = setTimeout(() => {
        bubble.classList.remove('active');
        setTimeout(() => bubble.classList.add('hidden'), 500);
      }, 4000);
      break;

    default:
      console.log('Received unhandled event type:', event.type);
  }
}

// Lip sync logic
let mouthTimer = null;
function startMouthSyncSimulation() {
  if (mouthTimer) clearInterval(mouthTimer);
  
  // Randomly cycles mouth shapes to create realistic lip syncing pacing
  mouthTimer = setInterval(() => {
    targetMouthOpen = Math.random() > 0.35 ? Math.random() * 0.7 + 0.3 : 0;
  }, 100);
}

function stopMouthSyncSimulation() {
  if (mouthTimer) {
    clearInterval(mouthTimer);
    mouthTimer = null;
  }
  targetMouthOpen = 0;
}
