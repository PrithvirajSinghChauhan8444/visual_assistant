import * as THREE from 'three';

export const state = {
  scene: null,
  camera: null,
  renderer: null,
  gridHelper: null,
  currentVrm: null,
  currentFallbackMesh: null,
  digitalOrb: null,
  standardMixer: null,
  mouse: new THREE.Vector2(0, 0),
  targetMouthOpen: 0,
  currentMouthOpen: 0,
  clock: new THREE.Clock(),
  gazeTrackingEnabled: true,
  modelRotation: 0,
  cameraZoomZ: 3.8,
  currentMotion: 'idle',
  activeMotionKeyframes: null,
  motionFrameIndex: 0,
  motionFrameTime: 0,
  motionFps: 20,
  motionWeight: 0.0,
  isThinking: false,
  isSpeaking: false,
  blinkTimer: 0,
  nextBlinkTime: 3.0 + Math.random() * 4.0,
  themes: {
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
      secondary: '#ff0055',
      orbColor: 0xff0055,
      coreColor: 0xff9900,
      gridColor: 0xff9900
    }
  },
  currentTheme: 'pink'
};
