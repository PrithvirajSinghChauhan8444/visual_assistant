import { state } from './state.js';

let bubbleFadeTimeout = null;
let mouthTimer = null;

export function setupSSEListener() {
  const statusVal = document.getElementById('status-val');
  const speechVal = document.getElementById('speech-val');
  
  if (!statusVal) return;

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
      if (speechVal) speechVal.textContent = 'Offline';
      
      // Auto-reconnect loop
      setTimeout(connect, 5000);
    };
  }

  connect();
}

function handlePipelineEvent(event) {
  const speechVal = document.getElementById('speech-val');
  const bubble = document.getElementById('chat-bubble');
  const bubbleText = document.getElementById('bubble-text');

  switch (event.type) {
    case 'thinking':
      state.isThinking = true;
      state.isSpeaking = false;
      if (speechVal) speechVal.textContent = 'Thinking...';
      if (bubbleText) bubbleText.innerHTML = '<span class="thinking-dots">...</span>';
      if (bubble) {
        bubble.classList.remove('hidden');
        setTimeout(() => bubble.classList.add('active'), 20);
      }
      break;

    case 'sentence_start':
      state.isThinking = false;
      state.isSpeaking = true;
      if (speechVal) speechVal.textContent = 'Speaking';
      if (bubbleText) bubbleText.textContent = event.text;
      if (bubble) {
        bubble.classList.remove('hidden');
        bubble.classList.add('active');
      }
      
      // Cancel any pending fade outs
      if (bubbleFadeTimeout) clearTimeout(bubbleFadeTimeout);
      
      // Check if dynamic motion keyframes were broadcast by the generative pipeline!
      if (event.dynamic_motion) {
        state.activeMotionKeyframes = event.dynamic_motion;
        state.motionFrameIndex = 0;
        state.motionFrameTime = 0;
        state.motionWeight = 0.0; // reset for smooth blend-in!
        state.currentMotion = 'dynamic';
        console.log(`🌀 [Motion Diffusion] SSE Trigger: Received ${event.dynamic_motion.length} generative keyframes!`);
      } else if (event.motion) {
        state.currentMotion = event.motion;
        console.log(`🎭 SSE Trigger: Switched motion state to '${event.motion}'`);
      }
      
      // Simulate dynamic mouth movements during speaking mapped to voice amplitude
      startMouthSyncSimulation();
      break;

    case 'sentence_end':
      state.isThinking = false;
      state.isSpeaking = false;
      if (speechVal) speechVal.textContent = 'Idle';
      stopMouthSyncSimulation();
      
      // Return to default idle after 2.5 seconds of completing speech
      setTimeout(() => {
        if (!state.isSpeaking && state.currentMotion !== 'idle') {
          state.currentMotion = 'idle';
          const motionButtons = document.querySelectorAll('.motion-btn');
          motionButtons.forEach(btn => {
            if (btn.dataset.motion === 'idle') {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
          console.log(`🎭 Motion reset to idle after speech completion`);
        }
      }, 2500);
      
      // Fade out bubble after 4 seconds of silence
      if (bubbleFadeTimeout) clearTimeout(bubbleFadeTimeout);
      bubbleFadeTimeout = setTimeout(() => {
        if (bubble) {
          bubble.classList.remove('active');
          setTimeout(() => bubble.classList.add('hidden'), 500);
        }
      }, 4000);
      break;

    default:
      console.log('Received unhandled event type:', event.type);
  }
}

// Lip sync simulation driving visual soundwave bounce
export function startMouthSyncSimulation() {
  if (mouthTimer) clearInterval(mouthTimer);
  
  // Randomly cycles mouth shapes to create realistic speaking cadence
  mouthTimer = setInterval(() => {
    state.targetMouthOpen = Math.random() > 0.2 ? Math.random() * 0.6 + 0.4 : 0;
  }, 75); // Faster update rate for snappier mouth movements
}

export function stopMouthSyncSimulation() {
  if (mouthTimer) {
    clearInterval(mouthTimer);
    mouthTimer = null;
  }
  state.targetMouthOpen = 0;
}
