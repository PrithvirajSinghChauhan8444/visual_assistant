import * as THREE from 'three';
import { state } from './state.js';

export function animate() {
  requestAnimationFrame(animate);

  const delta = state.clock.getDelta();
  const time = state.clock.getElapsedTime();

  // Draw Voice Soundwave
  drawSoundwave(time);

  // 1. Animate Digital Orb if VRM fallback is active
  if (state.digitalOrb) {
    state.digitalOrb.rotation.y = time * 0.35;
    state.digitalOrb.rotation.x = time * 0.18;
    
    // Pulsate based on speech mouth open value
    const scale = 1.0 + state.currentMouthOpen * 0.65 + Math.sin(time * 3.5) * 0.04;
    state.digitalOrb.scale.set(scale, scale, scale);
    
    // Smooth follow cursor gaze if active
    const targetX = 0 + (state.gazeTrackingEnabled ? state.mouse.x * 0.15 : 0);
    const targetY = 0.75 + (state.gazeTrackingEnabled ? state.mouse.y * 0.15 : 0);
    state.digitalOrb.position.x = THREE.MathUtils.lerp(state.digitalOrb.position.x, targetX, 0.1);
    state.digitalOrb.position.y = THREE.MathUtils.lerp(state.digitalOrb.position.y, targetY, 0.1);
  }

  // 2. Animate VRM Model (Idle sway, gaze, lip sync)
  if (state.currentVrm) {
    // Progress specialized VRM Animation Mixer for .vrma streams
    if (state.vrmMixer) {
        state.vrmMixer.update(delta);
    }
    
    // Apply model rotation offset dynamically
    state.currentVrm.scene.rotation.y = Math.PI + state.modelRotation;

    // Define default idle targets
    let leftUpperArmZ = -1.25 + Math.sin(time * 1.5) * 0.025 + Math.sin(time * 3) * 0.2 * state.currentMouthOpen;
    let leftUpperArmX = 0.15;
    let leftUpperArmY = 0;

    let rightUpperArmZ = 1.25 - Math.sin(time * 1.5) * 0.025 - Math.sin(time * 3) * 0.2 * state.currentMouthOpen;
    let rightUpperArmX = 0.15;
    let rightUpperArmY = 0;

    let leftLowerArmX = 0.1 + Math.sin(time * 3.5) * 0.35 * state.currentMouthOpen;
    let leftLowerArmY = -0.15 + Math.sin(time * 1.5) * 0.05 * state.currentMouthOpen;
    let leftLowerArmZ = -0.1 - Math.sin(time * 2.5) * 0.25 * state.currentMouthOpen;

    let rightLowerArmX = 0.1 + Math.sin(time * 3.5) * 0.35 * state.currentMouthOpen;
    let rightLowerArmY = 0.15 - Math.sin(time * 1.5) * 0.05 * state.currentMouthOpen;
    let rightLowerArmZ = 0.1 + Math.sin(time * 2.5) * 0.25 * state.currentMouthOpen;

    let leftHandZ = -0.1 - Math.sin(time * 5) * 0.12 * state.currentMouthOpen;
    let rightHandZ = 0.1 + Math.sin(time * 5) * 0.12 * state.currentMouthOpen;

    let hipsX = 0;
    let hipsY = Math.sin(time * 0.4) * 0.06;
    let hipsZ = Math.cos(time * 0.4) * 0.02;
    let hipsPosY = Math.sin(time * 1.2) * 0.005;
    let hipsPosX = 0;

    let spineX = Math.sin(time * 1.2) * 0.015 + 0.02;
    let spineY = -Math.sin(time * 0.4) * 0.04;
    let spineZ = -Math.cos(time * 0.4) * 0.02;

    let chestX = Math.sin(time * 1.2) * 0.01;
    let chestY = 0;
    let chestZ = Math.sin(time * 1.2) * 0.015;

    let headX = Math.sin(time * 4.0) * 0.08 * state.currentMouthOpen + Math.sin(time * 0.8) * 0.03;
    let headY = Math.sin(time * 0.5) * 0.05 + Math.sin(time * 2.5) * 0.05 * state.currentMouthOpen;
    let headZ = 0;

    let neckX = 0;
    let neckY = 0;
    let neckZ = 0;

    let expressionHappy = 0;
    let expressionRelaxed = 0;

    // Blend MoMask Neural Idle Streams
    if (state.momaskFrames && state.momaskFrames.length > 0) {
      const frame = state.momaskFrames[state.momaskFrameIndex];
      
      // Hips are allowed to translate in VRM
      hipsPosX += frame[0][0];
      hipsPosY += frame[0][1];
      
      // Convert MoMask counter-balance translations to subtle rotations for the VRM rig
      neckY += frame[12][1] * 2.0; 
      headX += frame[15][0] * 2.0;
      
      // Advance frame index safely
      state.momaskFrameIndex = (state.momaskFrameIndex + 1) % state.momaskFrames.length;
    }

    // Apply dynamic motion keyframes from motion diffusion or default to idle breathing
    switch (state.currentMotion) {
      case 'dynamic':
        if (state.activeMotionKeyframes) {
          // Progress keyframe index by elapsed time delta
          state.motionFrameTime += delta;
          const targetIndex = Math.floor(state.motionFrameTime * state.motionFps);
          
          if (targetIndex < state.activeMotionKeyframes.length) {
            state.motionFrameIndex = targetIndex;
            const keyframe = state.activeMotionKeyframes[state.motionFrameIndex];
            
            // Blend in weight smoothly
            state.motionWeight = Math.min(state.motionWeight + delta * 5.0, 1.0);
            
            // Smoothly interpolate current bone targets towards generative keyframe angles
            if (keyframe.leftUpperArm) {
              leftUpperArmX = THREE.MathUtils.lerp(leftUpperArmX, keyframe.leftUpperArm.x, state.motionWeight);
              leftUpperArmY = THREE.MathUtils.lerp(leftUpperArmY, keyframe.leftUpperArm.y, state.motionWeight);
              leftUpperArmZ = THREE.MathUtils.lerp(leftUpperArmZ, keyframe.leftUpperArm.z, state.motionWeight);
            }
            if (keyframe.rightUpperArm) {
              rightUpperArmX = THREE.MathUtils.lerp(rightUpperArmX, keyframe.rightUpperArm.x, state.motionWeight);
              rightUpperArmY = THREE.MathUtils.lerp(rightUpperArmY, keyframe.rightUpperArm.y, state.motionWeight);
              rightUpperArmZ = THREE.MathUtils.lerp(rightUpperArmZ, keyframe.rightUpperArm.z, state.motionWeight);
            }
            if (keyframe.leftLowerArm) {
              leftLowerArmX = THREE.MathUtils.lerp(leftLowerArmX, keyframe.leftLowerArm.x, state.motionWeight);
              leftLowerArmY = THREE.MathUtils.lerp(leftLowerArmY, keyframe.leftLowerArm.y, state.motionWeight);
              leftLowerArmZ = THREE.MathUtils.lerp(leftLowerArmZ, keyframe.leftLowerArm.z, state.motionWeight);
            }
            if (keyframe.rightLowerArm) {
              rightLowerArmX = THREE.MathUtils.lerp(rightLowerArmX, keyframe.rightLowerArm.x, state.motionWeight);
              rightLowerArmY = THREE.MathUtils.lerp(rightLowerArmY, keyframe.rightLowerArm.y, state.motionWeight);
              rightLowerArmZ = THREE.MathUtils.lerp(rightLowerArmZ, keyframe.rightLowerArm.z, state.motionWeight);
            }
            if (keyframe.leftHand) {
              leftHandZ = THREE.MathUtils.lerp(leftHandZ, keyframe.leftHand.z, state.motionWeight);
            }
            if (keyframe.rightHand) {
              rightHandZ = THREE.MathUtils.lerp(rightHandZ, keyframe.rightHand.z, state.motionWeight);
            }
            if (keyframe.hips) {
              hipsX = THREE.MathUtils.lerp(hipsX, keyframe.hips.x, state.motionWeight);
              hipsY = THREE.MathUtils.lerp(hipsY, keyframe.hips.y, state.motionWeight);
              hipsZ = THREE.MathUtils.lerp(hipsZ, keyframe.hips.z, state.motionWeight);
              hipsPosX = THREE.MathUtils.lerp(hipsPosX, keyframe.hips.px, state.motionWeight);
              hipsPosY = THREE.MathUtils.lerp(hipsPosY, keyframe.hips.py, state.motionWeight);
            }
            if (keyframe.spine) {
              spineX = THREE.MathUtils.lerp(spineX, keyframe.spine.x, state.motionWeight);
              spineY = THREE.MathUtils.lerp(spineY, keyframe.spine.y, state.motionWeight);
              spineZ = THREE.MathUtils.lerp(spineZ, keyframe.spine.z, state.motionWeight);
            }
            if (keyframe.chest) {
              chestX = THREE.MathUtils.lerp(chestX, keyframe.chest.x, state.motionWeight);
              chestY = THREE.MathUtils.lerp(chestY, keyframe.chest.y, state.motionWeight);
              chestZ = THREE.MathUtils.lerp(chestZ, keyframe.chest.z, state.motionWeight);
            }
            if (keyframe.neck) {
              neckX = THREE.MathUtils.lerp(neckX, keyframe.neck.x, state.motionWeight);
              neckY = THREE.MathUtils.lerp(neckY, keyframe.neck.y, state.motionWeight);
              neckZ = THREE.MathUtils.lerp(neckZ, keyframe.neck.z, state.motionWeight);
            }
            if (keyframe.head) {
              headX = THREE.MathUtils.lerp(headX, keyframe.head.x, state.motionWeight);
              headY = THREE.MathUtils.lerp(headY, keyframe.head.y, state.motionWeight);
              headZ = THREE.MathUtils.lerp(headZ, keyframe.head.z, state.motionWeight);
            }
            expressionHappy = 0.5;
          } else {
            // Sequence completed: smoothly ramp down weight back to default breathing idle
            state.motionWeight = Math.max(state.motionWeight - delta * 4.0, 0.0);
            if (state.motionWeight <= 0.0) {
              state.activeMotionKeyframes = null;
              state.currentMotion = 'idle';
            }
          }
        }
        break;
        
      case 'idle':
      default:
        if (state.isThinking) {
          neckY = 0.25 * Math.sin(time * 0.5);
          neckX = -0.15;
          expressionRelaxed = 0.8;
        } else if (state.isSpeaking) {
          neckY = 0.1 * Math.sin(time * 1.8);
          neckX = 0.05 * Math.sin(time * 3.5);
          expressionHappy = Math.min(state.currentMouthOpen * 1.5, 0.35);
        }
        break;
    }

    // Apply shoulder postures
    const leftShoulder = state.currentVrm.humanoid.getNormalizedBoneNode('leftShoulder');
    const rightShoulder = state.currentVrm.humanoid.getNormalizedBoneNode('rightShoulder');
    if (leftShoulder) leftShoulder.rotation.y = 0.15;
    if (rightShoulder) rightShoulder.rotation.y = -0.15;

    // Smoothly lerp towards bone targets
    const hips = state.currentVrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) {
      hips.position.x = THREE.MathUtils.lerp(hips.position.x, hipsPosX, 0.08);
      hips.position.y = THREE.MathUtils.lerp(hips.position.y, hipsPosY, 0.08);
      hips.rotation.x = THREE.MathUtils.lerp(hips.rotation.x, hipsX, 0.08);
      hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, hipsY, 0.08);
      hips.rotation.z = THREE.MathUtils.lerp(hips.rotation.z, hipsZ, 0.08);
    }

    const spine = state.currentVrm.humanoid.getNormalizedBoneNode('spine');
    if (spine) {
      spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, spineX, 0.08);
      spine.rotation.y = THREE.MathUtils.lerp(spine.rotation.y, spineY, 0.08);
      spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, spineZ, 0.08);
    }

    const chest = state.currentVrm.humanoid.getNormalizedBoneNode('chest');
    if (chest) {
      chest.rotation.x = THREE.MathUtils.lerp(chest.rotation.x, chestX, 0.08);
      chest.rotation.y = THREE.MathUtils.lerp(chest.rotation.y, chestY, 0.08);
      chest.rotation.z = THREE.MathUtils.lerp(chest.rotation.z, chestZ, 0.08);
    }

    const leftUpperArm = state.currentVrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    if (leftUpperArm) {
      leftUpperArm.rotation.x = THREE.MathUtils.lerp(leftUpperArm.rotation.x, leftUpperArmX, 0.08);
      leftUpperArm.rotation.y = THREE.MathUtils.lerp(leftUpperArm.rotation.y, leftUpperArmY, 0.08);
      leftUpperArm.rotation.z = THREE.MathUtils.lerp(leftUpperArm.rotation.z, leftUpperArmZ, 0.08);
    }

    const rightUpperArm = state.currentVrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    if (rightUpperArm) {
      rightUpperArm.rotation.x = THREE.MathUtils.lerp(rightUpperArm.rotation.x, rightUpperArmX, 0.08);
      rightUpperArm.rotation.y = THREE.MathUtils.lerp(rightUpperArm.rotation.y, rightUpperArmY, 0.08);
      rightUpperArm.rotation.z = THREE.MathUtils.lerp(rightUpperArm.rotation.z, rightUpperArmZ, 0.08);
    }

    const leftLowerArm = state.currentVrm.humanoid.getNormalizedBoneNode('leftLowerArm');
    if (leftLowerArm) {
      leftLowerArm.rotation.x = THREE.MathUtils.lerp(leftLowerArm.rotation.x, leftLowerArmX, 0.08);
      leftLowerArm.rotation.y = THREE.MathUtils.lerp(leftLowerArm.rotation.y, leftLowerArmY, 0.08);
      leftLowerArm.rotation.z = THREE.MathUtils.lerp(leftLowerArm.rotation.z, leftLowerArmZ, 0.08);
    }

    const rightLowerArm = state.currentVrm.humanoid.getNormalizedBoneNode('rightLowerArm');
    if (rightLowerArm) {
      rightLowerArm.rotation.x = THREE.MathUtils.lerp(rightLowerArm.rotation.x, rightLowerArmX, 0.08);
      rightLowerArm.rotation.y = THREE.MathUtils.lerp(rightLowerArm.rotation.y, rightLowerArmY, 0.08);
      rightLowerArm.rotation.z = THREE.MathUtils.lerp(rightLowerArm.rotation.z, rightLowerArmZ, 0.08);
    }

    const leftHand = state.currentVrm.humanoid.getNormalizedBoneNode('leftHand');
    if (leftHand) {
      leftHand.rotation.z = THREE.MathUtils.lerp(leftHand.rotation.z, leftHandZ, 0.08);
    }

    const rightHand = state.currentVrm.humanoid.getNormalizedBoneNode('rightHand');
    if (rightHand) {
      rightHand.rotation.z = THREE.MathUtils.lerp(rightHand.rotation.z, rightHandZ, 0.08);
    }

    const head = state.currentVrm.humanoid.getNormalizedBoneNode('head');
    if (head) {
      head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, headX, 0.08);
      head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, headY, 0.08);
      head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, headZ, 0.08);
    }

    const neck = state.currentVrm.humanoid.getNormalizedBoneNode('neck');
    if (neck) {
      neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, neckX, 0.08);
      neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, neckY, 0.08);
      neck.rotation.z = THREE.MathUtils.lerp(neck.rotation.z, neckZ, 0.08);
    }

    // Dynamic Blinking
    state.blinkTimer += delta;
    if (state.blinkTimer > state.nextBlinkTime) {
      const blinkProgress = Math.sin((state.blinkTimer - state.nextBlinkTime) * Math.PI * 6);
      if (blinkProgress > 0) {
        state.currentVrm.expressionManager.setValue('blink', blinkProgress);
      } else {
        state.currentVrm.expressionManager.setValue('blink', 0);
        state.blinkTimer = 0;
        state.nextBlinkTime = 3.0 + Math.random() * 5.0;
      }
    }

    // Gaze LookAt
    if (state.gazeTrackingEnabled) {
      let targetX = state.mouse.x * 3.0;
      let targetY = state.mouse.y * 3.0 + 0.75;
      if (state.currentMotion === 'think') {
        targetX += 1.0 * Math.sin(time * 0.5);
        targetY += 1.0;
      }
      const lookAtTarget = new THREE.Vector3(targetX, targetY, 3.8);
      state.currentVrm.lookAt.lookAt(lookAtTarget);
    } else {
      let targetX = 0;
      let targetY = 0.75;
      if (state.currentMotion === 'think') {
        targetX += 1.0 * Math.sin(time * 0.5);
        targetY += 1.0;
      }
      const standardLook = new THREE.Vector3(targetX, targetY, 3.8);
      state.currentVrm.lookAt.lookAt(standardLook);
    }

    // Lip Sync
    state.currentMouthOpen = THREE.MathUtils.lerp(state.currentMouthOpen, state.targetMouthOpen, 0.35);
    state.currentVrm.expressionManager.setValue('aa', state.currentMouthOpen);
    state.currentVrm.expressionManager.setValue('ih', state.currentMouthOpen * 0.4);
    state.currentVrm.expressionManager.setValue('ou', state.currentMouthOpen * 0.3);

    // Expressions
    const currentRelaxed = state.currentVrm.expressionManager.getValue('relaxed') || 0;
    const currentHappy = state.currentVrm.expressionManager.getValue('happy') || 0;
    state.currentVrm.expressionManager.setValue('relaxed', THREE.MathUtils.lerp(currentRelaxed, expressionRelaxed, 0.08));
    state.currentVrm.expressionManager.setValue('happy', THREE.MathUtils.lerp(currentHappy, expressionHappy, 0.08));

    state.currentVrm.expressionManager.update();
    state.currentVrm.update(delta);
  } else {
    state.currentMouthOpen = THREE.MathUtils.lerp(state.currentMouthOpen, state.targetMouthOpen, 0.28);
  }

  if (state.standardMixer) {
    state.standardMixer.update(delta);
  }

  if (state.currentFallbackMesh) {
    state.currentFallbackMesh.rotation.y = Math.PI + state.modelRotation;
  }

  // Camera Zoom lerping
  state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, state.cameraZoomZ, 0.08);

  state.renderer.render(state.scene, state.camera);
}

function drawSoundwave(time) {
  const soundwaveCanvas = document.getElementById('soundwave-canvas');
  if (!soundwaveCanvas) return;
  const ctx = soundwaveCanvas.getContext('2d');
  ctx.clearRect(0, 0, soundwaveCanvas.width, soundwaveCanvas.height);
  
  const width = soundwaveCanvas.width;
  const height = soundwaveCanvas.height;
  const middle = height / 2;
  
  const theme = state.themes[state.currentTheme];
  const color = theme.primary;
  
  const layers = 3;
  const baseAmplitude = state.currentMouthOpen * 14.0;
  
  for (let l = 0; l < layers; l++) {
    ctx.beginPath();
    const alpha = (1.0 - l * 0.35).toFixed(2);
    ctx.strokeStyle = color;
    ctx.lineWidth = l === 0 ? 2 : 1;
    ctx.globalAlpha = parseFloat(alpha);
    
    const frequency = 0.02 + l * 0.01;
    const speed = 7.0 + l * 3.5;
    
    for (let x = 0; x < width; x++) {
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
}
