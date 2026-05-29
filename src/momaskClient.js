import { state } from './state.js';

export function setupMoMaskListener() {
  const motionSocket = new WebSocket('ws://localhost:8765');

  motionSocket.onopen = () => {
    console.log("🟢 Connected to MoMask Neural Stream.");
    const modelVal = document.getElementById('model-val');
    if (modelVal && state.currentVrm) {
        modelVal.textContent = 'Diana Avatar (MoMask Linked)';
    }
  };

  motionSocket.onmessage = (event) => {
    const dataPacket = JSON.parse(event.data);
    
    if (dataPacket.type === "IDLE_MOTION") {
      // Store the incoming motion frames globally to avoid fighting the animation loop
      state.momaskFrames = dataPacket.joints_data;
      state.momaskFrameIndex = 0;
    }
  };

  motionSocket.onerror = (error) => {
    console.error("❌ MoMask WebSocket Error:", error);
  };

  motionSocket.onclose = () => {
    console.warn("⚠️ MoMask Stream Disconnected. Reconnecting in 5s...");
    setTimeout(setupMoMaskListener, 5000);
  };
}
