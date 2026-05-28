import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

// Set up globals
let scene, camera, renderer, gridHelper;
let currentVrm = null;
let digitalOrb = null;
let standardMixer = null; // Plays animations for standard GLB fallbacks
let mouse = new THREE.Vector2(0, 0);
let targetMouthOpen = 0;
let currentMouthOpen = 0;
let clock = new THREE.Clock();
let gazeTrackingEnabled = true;

// Procedural blinking timers
let blinkTimer = 0;
let nextBlinkTime = 3.0 + Math.random() * 4.0;

// Active Theme settings
const themes = {
  pink: {
    primary: '#ff007f',
    secondary: '#8b5cf6',
    orbColor: 0x8b5cf6,
    coreColor: 0xff007f,
    gridColor: 0x8b5cf6
  },
  cyan: {
    primary: '#00f0ff',
    secondary: '#7000ff',
    orbColor: 0x7000ff,
    coreColor: 0x00f0ff,
    gridColor: 0x00f0ff
  },
  green: {
    primary: '#39ff14',
    secondary: '#00471b',
    orbColor: 0x00471b,
    coreColor: 0x39ff14,
    gridColor: 0x39ff14
  },
  orange: {
    primary: '#ff9900',
    secondary: '#14f195',
    orbColor: 0x14f195,
    coreColor: 0xff9900,
    gridColor: 0xff9900
  }
};
let currentTheme = 'pink';

// Element references
const bubble = document.getElementById('chat-bubble');
const bubbleText = document.getElementById('bubble-text');
const statusVal = document.getElementById('status-val');
const speechVal = document.getElementById('speech-val');
const soundwaveCanvas = document.getElementById('soundwave-canvas');
const ctx = soundwaveCanvas.getContext('2d');

init();
animate();
setupSSEListener();
setupConfigListeners();

function init() {
  const container = document.getElementById('canvas-container');

  // Scene
  scene = new THREE.Scene();

  // Camera
  // Adjusted FOV and position so her full body is perfectly visible and centered!
  camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 20);
  camera.position.set(0, 0.75, 3.8);

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
  gridHelper = new THREE.GridHelper(10, 20, 0x8b5cf6, 0x221c38);
  gridHelper.position.y = 0;
  gridHelper.material.opacity = 0.25;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // Try loading VRM model. Fallback to digital orb if none found.
  loadVRMAvatar();

  // Window resize handler
  window.addEventListener('resize', onWindowResize);
  resizeSoundwaveCanvas();

  // Mouse tracking for gaze/tilt interactive control
  window.addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });
}

function resizeSoundwaveCanvas() {
  soundwaveCanvas.width = soundwaveCanvas.clientWidth;
  soundwaveCanvas.height = soundwaveCanvas.clientHeight;
}

function loadVRMAvatar() {
  const loader = new GLTFLoader();
  
  // Register VRM loader plugin
  loader.register((parser) => {
    return new VRMLoaderPlugin(parser);
  });

  const vrmPath = 'models/diana.vrm'; 

  loader.load(
    vrmPath,
    (gltf) => {
      const vrm = gltf.userData.vrm;
      
      // Fallback: If renamed GLB has no VRM avatar metadata
      if (!vrm) {
        console.warn('⚠️ Model loaded successfully, but contains no VRM metadata. Treating as standard 3D GLB mesh.');
        
        const mesh = gltf.scene;
        // Center standard GLB character perfectly on the screen
        mesh.position.set(0, 0, 0);
        mesh.rotation.y = Math.PI; 
        
        // Auto-scale generic models to standard human size (approx height 1.4m)
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0) {
          const scaleFactor = 1.4 / size.y;
          mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
          // Adjust ground level alignment
          mesh.position.y = -box.min.y * scaleFactor;
        } else {
          mesh.position.y = 0;
        }
        
        scene.add(mesh);
        
        // Discover and play pre-packaged animations if present in GLB (e.g. idle sway/dancing!)
        if (gltf.animations && gltf.animations.length > 0) {
          console.log(`🎬 Found ${gltf.animations.length} animations in GLB! Playing first track...`);
          standardMixer = new THREE.AnimationMixer(mesh);
          const action = standardMixer.clipAction(gltf.animations[0]);
          action.play();
        }
        
        document.getElementById('model-val').textContent = 'Generic 3D Model (Loaded)';
        return;
      }
      
      currentVrm = vrm;
      
      // Center VRM character perfectly on screen (facing directly forward!)
      vrm.scene.position.set(0, 0, 0);
      vrm.scene.rotation.y = Math.PI; 
      scene.add(vrm.scene);
      
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
  
  const theme = themes[currentTheme];
  
  // Wireframe material with neon glow
  const material = new THREE.MeshBasicMaterial({
    color: theme.orbColor,
    wireframe: true,
    transparent: true,
    opacity: 0.55
  });

  digitalOrb = new THREE.Mesh(geometry, material);
  digitalOrb.position.set(0, 0.75, 0);
  scene.add(digitalOrb);

  // Add inner glowing point core
  const coreGeo = new THREE.SphereGeometry(0.16, 16, 16);
  const coreMat = new THREE.MeshBasicMaterial({
    color: theme.coreColor,
    transparent: true,
    opacity: 0.85
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.name = "core";
  digitalOrb.add(core);

  // Add floating particle rings
  const ringGeo = new THREE.RingGeometry(0.68, 0.70, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: theme.coreColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.name = "ring";
  digitalOrb.add(ring);

  document.getElementById('model-val').textContent = 'Diana Core (Active)';
}

function applyTheme(themeName) {
  currentTheme = themeName;
  const theme = themes[themeName];
  
  // 1. Update CSS Custom variables to morph styling dynamically
  document.documentElement.style.setProperty('--neon-magenta', theme.primary);
  document.documentElement.style.setProperty('--neon-purple', theme.secondary);
  
  // 2. Update WebGL Grid color
  gridHelper.material.color.setHex(theme.gridColor);
  
  // 3. Update Digital Orb Materials if active
  if (digitalOrb) {
    digitalOrb.material.color.setHex(theme.orbColor);
    const core = digitalOrb.getObjectByName("core");
    if (core) core.material.color.setHex(theme.coreColor);
    const ring = digitalOrb.getObjectByName("ring");
    if (ring) ring.material.color.setHex(theme.coreColor);
  }
  
  console.log(`🎨 Theme mapped to: ${themeName}`);
}

function setupConfigListeners() {
  // Theme Buttons handler
  const buttons = document.querySelectorAll('.theme-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Remove active from all
      buttons.forEach(b => b.classList.remove('active'));
      const activeBtn = e.target.closest('.theme-btn');
      activeBtn.classList.add('active');
      
      const theme = activeBtn.dataset.theme;
      applyTheme(theme);
    });
  });

  // Gaze toggle handler
  const gazeToggle = document.getElementById('gaze-toggle');
  gazeToggle.addEventListener('change', (e) => {
    gazeTrackingEnabled = e.target.checked;
  });

  // Bilateral Chat Text Input Handler
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  
  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    
    chatInput.value = '';
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.placeholder = "Diana is typing...";
    
    try {
      // Use dynamic hostname to allow LAN access (e.g. 172.x.x.x)
      const baseUrl = `${window.location.protocol}//${window.location.hostname}:8080`;
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      if (!response.ok) {
        console.error("Failed to send message:", response.statusText);
      }
    } catch (err) {
      console.error("Network error sending message:", err);
    } finally {
      chatInput.disabled = false;
      sendBtn.disabled = false;
      chatInput.placeholder = "Type a message for Diana...";
      chatInput.focus();
    }
  }
  
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  
  sendBtn.addEventListener('click', sendMessage);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeSoundwaveCanvas();
}

function drawSoundwave() {
  ctx.clearRect(0, 0, soundwaveCanvas.width, soundwaveCanvas.height);
  
  const width = soundwaveCanvas.width;
  const height = soundwaveCanvas.height;
  const middle = height / 2;
  
  const theme = themes[currentTheme];
  const color = theme.primary;
  
  // Draw Apple Siri / Cortana fluid nested wave aesthetics
  const layers = 3;
  const time = clock.getElapsedTime();
  const baseAmplitude = currentMouthOpen * 14.0; // Dynamic vocal bounce
  
  for (let l = 0; l < layers; l++) {
    ctx.beginPath();
    
    // Set layer color with custom alpha transparencies
    const alpha = (1.0 - l * 0.35).toFixed(2);
    ctx.strokeStyle = color;
    ctx.lineWidth = l === 0 ? 2 : 1;
    ctx.globalAlpha = parseFloat(alpha);
    
    const frequency = 0.02 + l * 0.01;
    const speed = 7.0 + l * 3.5;
    
    for (let x = 0; x < width; x++) {
      // Create horizontal dome scaling (smooth 0 at screen boundaries)
      const domeScale = Math.sin((x / width) * Math.PI);
      const y = middle + Math.sin(x * frequency + time * speed) * baseAmplitude * domeScale;
      
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1.0; // Reset
}

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // Draw Voice Soundwave inside speech bubble
  drawSoundwave();

  // 1. Animate Digital Orb if VRM fallback is active (centered)
  if (digitalOrb) {
    digitalOrb.rotation.y = time * 0.35;
    digitalOrb.rotation.x = time * 0.18;
    
    // Pulsate based on speech mouth open value (loudness)
    const scale = 1.0 + currentMouthOpen * 0.65 + Math.sin(time * 3.5) * 0.04;
    digitalOrb.scale.set(scale, scale, scale);
    
    // Smooth follow cursor gaze if active (centered)
    const targetX = 0 + (gazeTrackingEnabled ? mouse.x * 0.15 : 0);
    const targetY = 0.75 + (gazeTrackingEnabled ? mouse.y * 0.15 : 0);
    digitalOrb.position.x = THREE.MathUtils.lerp(digitalOrb.position.x, targetX, 0.1);
    digitalOrb.position.y = THREE.MathUtils.lerp(digitalOrb.position.y, targetY, 0.1);
  }

  // 2. Animate VRM Model (Idle sway, gaze, lip sync)
  if (currentVrm) {
    // Natural posture override: Rotate upper arms down at her sides naturally (relaxing T-pose)
    const leftUpperArm = currentVrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = currentVrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    
    // Advanced Hand & Arm Gestures for real Blender VRMs (Inverted Z axis to drop arms DOWN to sides)
    const leftArmTarget = -1.35 + Math.sin(time * 1.5) * 0.025 + Math.sin(time * 3) * 0.15 * currentMouthOpen;
    const rightArmTarget = 1.35 - Math.sin(time * 1.5) * 0.025 - Math.sin(time * 3) * 0.15 * currentMouthOpen;
    
    if (leftUpperArm) leftUpperArm.rotation.z = THREE.MathUtils.lerp(leftUpperArm.rotation.z, leftArmTarget, 0.1);
    if (rightUpperArm) rightUpperArm.rotation.z = THREE.MathUtils.lerp(rightUpperArm.rotation.z, rightArmTarget, 0.1);

    const leftLowerArm = currentVrm.humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = currentVrm.humanoid.getNormalizedBoneNode('rightLowerArm');
    
    // Expressive forward lifting and wrist articulation when speaking
    const leftLowerTargetZ = -0.1 - Math.sin(time * 2.5) * 0.25 * currentMouthOpen;
    const rightLowerTargetZ = 0.1 + Math.sin(time * 2.5) * 0.25 * currentMouthOpen;
    const forwardLift = Math.sin(time * 3.5) * 0.3 * currentMouthOpen;
    
    if (leftLowerArm) {
      leftLowerArm.rotation.y = -0.15 + Math.sin(time * 1.5) * 0.05 * currentMouthOpen;
      leftLowerArm.rotation.z = THREE.MathUtils.lerp(leftLowerArm.rotation.z, leftLowerTargetZ, 0.1);
      leftLowerArm.rotation.x = THREE.MathUtils.lerp(leftLowerArm.rotation.x, forwardLift, 0.1);
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.y = 0.15 - Math.sin(time * 1.5) * 0.05 * currentMouthOpen;
      rightLowerArm.rotation.z = THREE.MathUtils.lerp(rightLowerArm.rotation.z, rightLowerTargetZ, 0.1);
      rightLowerArm.rotation.x = THREE.MathUtils.lerp(rightLowerArm.rotation.x, forwardLift, 0.1);
    }

    // Natural Hand relaxing and conversational wrist flicking
    const leftHand = currentVrm.humanoid.getNormalizedBoneNode('leftHand');
    const rightHand = currentVrm.humanoid.getNormalizedBoneNode('rightHand');
    if (leftHand) leftHand.rotation.z = -0.1 - Math.sin(time * 5) * 0.12 * currentMouthOpen;
    if (rightHand) rightHand.rotation.z = 0.1 + Math.sin(time * 5) * 0.12 * currentMouthOpen;

    // Advanced Full-Body Idle Sway (Hips, Spine, Chest, and Gravity Bob)
    // 1. Vertical Breathing Bounce (entire body moves slightly up and down)
    currentVrm.scene.position.y = Math.sin(time * 1.2) * 0.005;
    
    // 2. Hip Sway (shifting weight from leg to leg)
    const hips = currentVrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) {
      hips.rotation.y = Math.sin(time * 0.4) * 0.06; // Hip rotation
      hips.rotation.z = Math.cos(time * 0.4) * 0.02; // Hip tilt
    }

    // 3. Spinal Counter-Balance (torso leaning opposite to hips to keep balance)
    const spine = currentVrm.humanoid.getNormalizedBoneNode('spine');
    if (spine) {
      spine.rotation.y = -Math.sin(time * 0.4) * 0.04; // Counter side-to-side shift
      spine.rotation.x = Math.sin(time * 1.2) * 0.015 + 0.02; // Gentle breathing tilt forward
      spine.rotation.z = -Math.cos(time * 0.4) * 0.02; // Counter tilt
    }

    // 4. Chest Expansion (Breathing)
    const chest = currentVrm.humanoid.getNormalizedBoneNode('chest');
    if (chest) {
      chest.rotation.z = Math.sin(time * 1.2) * 0.015;
      chest.rotation.x = Math.sin(time * 1.2) * 0.01;
    }
    
    const head = currentVrm.humanoid.getNormalizedBoneNode('head');
    if (head) {
      // Head bobbing & tilting driven by voice synthesis cadence!
      const headRoll = Math.sin(time * 0.5) * 0.03 + Math.sin(time * 2) * 0.015 * currentMouthOpen;
      const headPitch = Math.sin(time * 4.0) * 0.035 * currentMouthOpen; // nods in lockstep with syllable volume!
      head.rotation.y = headRoll;
      head.rotation.x = headPitch;
    }

    // Dynamic organic blinking
    blinkTimer += delta;
    if (blinkTimer > nextBlinkTime) {
      // Quick blink curve: close, then open
      const blinkProgress = Math.sin((blinkTimer - nextBlinkTime) * Math.PI * 6);
      if (blinkProgress > 0) {
        currentVrm.expressionManager.setValue('blink', blinkProgress);
      } else {
        currentVrm.expressionManager.setValue('blink', 0);
        blinkTimer = 0;
        nextBlinkTime = 3.0 + Math.random() * 5.0; // Next blink in 3-8 seconds
      }
    }

    // Gaze at mouse cursor if enabled (centered)
    if (gazeTrackingEnabled) {
      // Look target matches new camera height (0.75) and focal plane (3.8)
      const lookAtTarget = new THREE.Vector3(mouse.x * 3.0, mouse.y * 3.0 + 0.75, 3.8);
      currentVrm.lookAt.lookAt(lookAtTarget);
    } else {
      // Stare directly into the camera
      const standardLook = new THREE.Vector3(0, 0.75, 3.8);
      currentVrm.lookAt.lookAt(standardLook);
    }

    // Dynamic Lip Sync & Advanced Facial Expressions
    currentMouthOpen = THREE.MathUtils.lerp(currentMouthOpen, targetMouthOpen, 0.28);
    currentVrm.expressionManager.setValue('aa', currentMouthOpen);
    currentVrm.expressionManager.setValue('ih', currentMouthOpen * 0.18); 
    
    // Add a gentle conversational smile that naturally fades when she stops talking
    const conversationalSmile = Math.min(currentMouthOpen * 1.5, 0.35);
    currentVrm.expressionManager.setValue('happy', conversationalSmile);
    
    currentVrm.expressionManager.update();
    
    currentVrm.update(delta);
  } else {
    // Sync simulated lip value for particles even when VRM is offline
    currentMouthOpen = THREE.MathUtils.lerp(currentMouthOpen, targetMouthOpen, 0.28);
  }

  // Update standard GLB animation track if active
  if (standardMixer) {
    standardMixer.update(delta);
  }

  renderer.render(scene, camera);
}

// Setup EventSource listener to listen to SSE broadcast from Python Voice synthesis pipeline
function setupSSEListener() {
  // Dynamically resolve hostname so the UI works on mobile devices over local LAN
  const sseUrl = `${window.location.protocol}//${window.location.hostname}:8080/stream`;
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
      
      // Simulate dynamic mouth movements during speaking mapped to voice amplitude
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

// Lip sync simulation driving visual soundwave bounce
let mouthTimer = null;
function startMouthSyncSimulation() {
  if (mouthTimer) clearInterval(mouthTimer);
  
  // Randomly cycles mouth shapes to create realistic speaking cadence
  mouthTimer = setInterval(() => {
    targetMouthOpen = Math.random() > 0.32 ? Math.random() * 0.72 + 0.28 : 0;
  }, 100);
}

function stopMouthSyncSimulation() {
  if (mouthTimer) {
    clearInterval(mouthTimer);
    mouthTimer = null;
  }
  targetMouthOpen = 0;
}
