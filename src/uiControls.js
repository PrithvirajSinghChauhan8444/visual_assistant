import { state } from './state.js';

export function setupConfigListeners() {
  // Theme Buttons handler
  const buttons = document.querySelectorAll('.theme-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      buttons.forEach(b => b.classList.remove('active'));
      const activeBtn = e.target.closest('.theme-btn');
      activeBtn.classList.add('active');
      
      const theme = activeBtn.dataset.theme;
      applyTheme(theme);
    });
  });

  // Gaze toggle handler
  const gazeToggle = document.getElementById('gaze-toggle');
  if (gazeToggle) {
    gazeToggle.addEventListener('change', (e) => {
      state.gazeTrackingEnabled = e.target.checked;
    });
  }

  // Bilateral Chat Text Input Handler
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');
  
  async function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;
    
    chatInput.value = '';
    chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    chatInput.placeholder = "Diana is typing...";
    
    try {
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
      if (sendBtn) sendBtn.disabled = false;
      chatInput.placeholder = "Type a message for Diana...";
      chatInput.focus();
    }
  }
  
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }
  
  if (sendBtn) sendBtn.addEventListener('click', sendMessage);

  // Model Rotation Controls & Slider
  const rotationSlider = document.getElementById('rotation-slider');
  const rotationVal = document.getElementById('rotation-val');
  const resetRotationBtn = document.getElementById('reset-rotation-btn');

  function updateRotation(degrees) {
    state.modelRotation = (degrees * Math.PI) / 180;
    if (rotationVal) rotationVal.textContent = `${Math.round(degrees)}°`;
  }

  if (rotationSlider) {
    rotationSlider.addEventListener('input', (e) => {
      updateRotation(parseInt(e.target.value));
    });
  }

  if (resetRotationBtn) {
    resetRotationBtn.addEventListener('click', () => {
      if (rotationSlider) rotationSlider.value = 0;
      updateRotation(0);
      resetRotationBtn.style.transform = 'scale(0.8)';
      setTimeout(() => {
        resetRotationBtn.style.transform = '';
      }, 150);
    });
  }

  // Direct canvas drag-to-rotate interaction
  const canvasContainer = document.getElementById('canvas-container');
  let isDragging = false;
  let prevX = 0;

  if (canvasContainer) {
    canvasContainer.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click only
        isDragging = true;
        prevX = e.clientX;
        canvasContainer.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging && rotationSlider) {
        const deltaX = e.clientX - prevX;
        prevX = e.clientX;

        let degrees = parseInt(rotationSlider.value) + deltaX * 0.5;

        if (degrees > 180) degrees -= 360;
        if (degrees < -180) degrees += 360;

        rotationSlider.value = Math.round(degrees);
        updateRotation(degrees);
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        canvasContainer.style.cursor = '';
      }
    });

    // Mobile touch drag support
    canvasContainer.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevX = e.touches[0].clientX;
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1 && rotationSlider) {
        const deltaX = e.touches[0].clientX - prevX;
        prevX = e.touches[0].clientX;

        let degrees = parseInt(rotationSlider.value) + deltaX * 0.5;
        if (degrees > 180) degrees -= 360;
        if (degrees < -180) degrees += 360;

        rotationSlider.value = Math.round(degrees);
        updateRotation(degrees);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });
  }

  // Camera Zoom Controls
  const zoomSlider = document.getElementById('zoom-slider');
  const zoomVal = document.getElementById('zoom-val');
  const resetZoomBtn = document.getElementById('reset-zoom-btn');

  function updateZoom(val) {
    state.cameraZoomZ = val;
    if (zoomVal) {
      const percentage = Math.round((3.8 / val) * 100);
      zoomVal.textContent = `${percentage}%`;
    }
  }

  if (zoomSlider) {
    zoomSlider.addEventListener('input', (e) => {
      updateZoom(parseFloat(e.target.value));
    });
  }

  if (resetZoomBtn) {
    resetZoomBtn.addEventListener('click', () => {
      if (zoomSlider) zoomSlider.value = 3.8;
      updateZoom(3.8);
      resetZoomBtn.style.transform = 'scale(0.8)';
      setTimeout(() => {
        resetZoomBtn.style.transform = '';
      }, 150);
    });
  }

  // Dynamic Motion Control Buttons (Triggering Generative Motion Diffusion!)
  const motionButtons = document.querySelectorAll('.motion-btn');
  
  async function triggerMotionDiffusion(promptText) {
    if (!promptText) return;
    
    // Set status indicator to processing motion
    const statusVal = document.getElementById('status-val');
    const oldStatus = statusVal ? statusVal.textContent : 'CONNECTED';
    if (statusVal) {
      statusVal.textContent = 'DIFFUSING MOTION...';
      statusVal.className = 'status-connecting';
    }
    
    try {
      const baseUrl = `${window.location.protocol}//${window.location.hostname}:8080`;
      const response = await fetch(`${baseUrl}/generate_motion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.keyframes) {
          state.activeMotionKeyframes = data.keyframes;
          state.motionFrameIndex = 0;
          state.motionFrameTime = 0;
          state.motionWeight = 0.0;
          state.currentMotion = 'dynamic';
          console.log(`🌀 [Motion Diffusion] Synthesized ${data.keyframes.length} keyframes for: '${promptText}'`);
        }
      } else {
        console.error("Failed to generate motion:", response.statusText);
      }
    } catch (err) {
      console.error("Error calling Motion Diffusion engine:", err);
    } finally {
      if (statusVal) {
        statusVal.textContent = oldStatus;
        statusVal.className = 'status-active';
      }
    }
  }

  motionButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const activeBtn = e.target.closest('.motion-btn');
      const motionType = activeBtn.dataset.motion;
      
      motionButtons.forEach(b => b.classList.remove('active'));
      activeBtn.classList.add('active');

      if (motionType === 'idle') {
        state.activeMotionKeyframes = null;
        state.currentMotion = 'idle';
        console.log("🧘 Restored default breathing idle posture.");
      } else {
        await triggerMotionDiffusion(motionType);
      }
    });
  });

  // Custom Text Motion Input Field Handler
  const customMotionInput = document.getElementById('custom-motion-input');
  const customMotionBtn = document.getElementById('custom-motion-btn');

  if (customMotionBtn && customMotionInput) {
    async function submitCustomMotion() {
      const prompt = customMotionInput.value.trim();
      if (!prompt) return;
      
      customMotionInput.value = '';
      customMotionInput.disabled = true;
      customMotionBtn.disabled = true;
      customMotionInput.placeholder = "Diffusing motion...";
      
      // Remove active states from predefined buttons
      motionButtons.forEach(b => b.classList.remove('active'));
      
      await triggerMotionDiffusion(prompt);
      
      customMotionInput.disabled = false;
      customMotionBtn.disabled = false;
      customMotionInput.placeholder = "Motion prompt (e.g. backflip)...";
    }

    customMotionBtn.addEventListener('click', submitCustomMotion);
    customMotionInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitCustomMotion();
      }
    });
  }
}

function applyTheme(themeName) {
  state.currentTheme = themeName;
  const theme = state.themes[themeName];
  
  // 1. Update CSS variables
  document.documentElement.style.setProperty('--neon-magenta', theme.primary);
  document.documentElement.style.setProperty('--neon-purple', theme.secondary);
  
  // 2. Update Grid color
  if (state.gridHelper) {
    state.gridHelper.material.color.setHex(theme.gridColor);
  }
  
  // 3. Update Digital Orb Materials
  if (state.digitalOrb) {
    state.digitalOrb.material.color.setHex(theme.orbColor);
    const core = state.digitalOrb.getObjectByName("core");
    if (core) core.material.color.setHex(theme.coreColor);
    const ring = state.digitalOrb.getObjectByName("ring");
    if (ring) ring.material.color.setHex(theme.coreColor);
  }
  
  console.log(`🎨 Theme mapped to: ${themeName}`);
}
