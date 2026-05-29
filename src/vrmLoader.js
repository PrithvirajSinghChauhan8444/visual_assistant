import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';
import { state } from './state.js';
import { createDigitalOrb } from './scene.js';

export function loadVRMAvatar() {
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
        state.currentFallbackMesh = mesh;
        mesh.position.set(0, 0, 0);
        mesh.rotation.y = Math.PI; 
        
        // Auto-scale generic models to standard human size (approx height 1.4m)
        const box = new THREE.Box3().setFromObject(mesh);
        const size = box.getSize(new THREE.Vector3());
        if (size.y > 0) {
          const scaleFactor = 1.4 / size.y;
          mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
          mesh.position.y = -box.min.y * scaleFactor;
        } else {
          mesh.position.y = 0;
        }
        
        state.scene.add(mesh);
        
        // Discover and play pre-packaged animations if present in GLB
        if (gltf.animations && gltf.animations.length > 0) {
          console.log(`🎬 Found ${gltf.animations.length} animations in GLB! Playing first track...`);
          state.standardMixer = new THREE.AnimationMixer(mesh);
          const action = state.standardMixer.clipAction(gltf.animations[0]);
          action.play();
        }
        
        const modelVal = document.getElementById('model-val');
        if (modelVal) modelVal.textContent = 'Generic 3D Model (Loaded)';
        return;
      }
      
      state.currentVrm = vrm;
      
      // Center VRM character perfectly on screen (facing directly forward!)
      vrm.scene.position.set(0, 0, 0);
      vrm.scene.rotation.y = Math.PI; 
      state.scene.add(vrm.scene);
      
      console.log('✅ VRM Model Loaded Successfully!');
      const modelVal = document.getElementById('model-val');
      if (modelVal) modelVal.textContent = 'Diana Avatar (Loaded)';
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
