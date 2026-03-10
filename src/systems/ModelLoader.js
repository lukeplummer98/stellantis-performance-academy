/**
 * ModelLoader — Loads .glb models from /public or /src/assets/models.
 * Provides a registry of loaded vehicles with metadata.
 * Drop .glb files into public/ or src/assets/models/ and register them.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { fixMaterials } from './MaterialFixer.js';

export class ModelLoader {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = new Map();     // name → { model, config }
    this.activeVehicle = null;

    // GLTF + Draco loader
    this.gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader.setDRACOLoader(dracoLoader);

    this.loadingManager = new THREE.LoadingManager();
  }

  /**
   * Load a GLB vehicle model.
   * @param {Object} config
   * @param {string} config.name — Display name (e.g. "Dodge Charger Daytona")
   * @param {string} config.brand — Stellantis brand (e.g. "Dodge")
   * @param {string} config.path — Path to .glb file (relative to public/)
   * @param {number[]} config.position — [x, y, z] placement
   * @param {number} config.scale — Uniform scale
   * @param {number} config.rotation — Y rotation in radians
   * @param {Object} config.doors — Door mesh name mappings (optional)
   * @param {Object} config.seatPosition — Camera offset for interior view
   * @param {Object} config.systems — Diagnostic system definitions
   */
  async loadVehicle(config) {
    const {
      name,
      brand = 'Stellantis',
      path,
      position = [0, 0, 0],
      scale = 1,
      rotation = 0,
      doors = {},
      seatPosition = { x: 0.4, y: 1.2, z: 0.2 },
      systems = {},
    } = config;

    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        path,
        (gltf) => {
          const model = gltf.scene;
          model.name = name;
          model.position.set(...position);
          model.scale.setScalar(scale);
          model.rotation.y = rotation;

          // Enable shadows on all meshes
          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Fix glass, mirrors, lights
          fixMaterials(model);

          // Find wheel meshes for rotation during driving
          // Supports naming conventions:
          //   - "FL wheel", "FR wheel", "RL wheel", "RR wheel"
          //   - "FrontLeftWheel", "FrontRightWheel", "RearLeftWheel", "RearRightWheel"
          //   - "Wheel.Ft.L", "Wheel.Ft.R", "Wheel.Bk.L", "Wheel.Bk.R" (McLaren style)
          // Also falls back to legacy Cylinder/Circle naming
          const wheels = { fl: null, fr: null, rl: null, rr: null, all: [] };
          model.traverse((child) => {
            const n = child.name.toLowerCase();
            // FrontLeft/FrontRight/RearLeft/RearRight convention — check FIRST
            // (prevents 'frontleftwheel' matching short 'fr' pattern)
            if (n.includes('frontleft') && n.includes('wheel')) { wheels.fl = child; wheels.all.push(child); }
            else if (n.includes('frontright') && n.includes('wheel')) { wheels.fr = child; wheels.all.push(child); }
            else if (n.includes('rearleft') && n.includes('wheel')) { wheels.rl = child; wheels.all.push(child); }
            else if (n.includes('rearright') && n.includes('wheel')) { wheels.rr = child; wheels.all.push(child); }
            // Short FL/FR/RL/RR convention
            else if (n.includes('fl') && n.includes('wheel')) { wheels.fl = child; wheels.all.push(child); }
            else if (n.includes('fr') && n.includes('wheel')) { wheels.fr = child; wheels.all.push(child); }
            else if (n.includes('rl') && n.includes('wheel')) { wheels.rl = child; wheels.all.push(child); }
            else if (n.includes('rr') && n.includes('wheel')) { wheels.rr = child; wheels.all.push(child); }
            // McLaren style: Wheel.Ft.L, Wheel.Ft.R, Wheel.Bk.L, Wheel.Bk.R
            else if (n.includes('wheel') && n.includes('.ft.') && n.includes('.l')) { wheels.fl = child; wheels.all.push(child); }
            else if (n.includes('wheel') && n.includes('.ft.') && n.includes('.r')) { wheels.fr = child; wheels.all.push(child); }
            else if (n.includes('wheel') && n.includes('.bk.') && n.includes('.l')) { wheels.rl = child; wheels.all.push(child); }
            else if (n.includes('wheel') && n.includes('.bk.') && n.includes('.r')) { wheels.rr = child; wheels.all.push(child); }
          });

          console.log(`[ModelLoader] ${name} wheels:`, {
            fl: wheels.fl?.name || 'NOT FOUND',
            fr: wheels.fr?.name || 'NOT FOUND',
            rl: wheels.rl?.name || 'NOT FOUND',
            rr: wheels.rr?.name || 'NOT FOUND',
            total: wheels.all.length
          });

          this.scene.add(model);

          // Compute bounding box for interaction radius
          const box = new THREE.Box3().setFromObject(model);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);

          const vehicleData = {
            model,
            config: { name, brand, path, doors, seatPosition, systems },
            boundingBox: box,
            center,
            size,
            wheels,
            animations: gltf.animations || [],
            mixer: gltf.animations.length > 0 ? new THREE.AnimationMixer(model) : null,
          };

          this.vehicles.set(name, vehicleData);
          resolve(vehicleData);
        },
        (progress) => {
          const pct = progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0;
          this._onProgress(name, pct);
        },
        (error) => {
          console.error(`Failed to load ${name}:`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Load multiple vehicles.
   */
  async loadAll(configs) {
    const results = [];
    for (const config of configs) {
      const result = await this.loadVehicle(config);
      results.push(result);
    }
    return results;
  }

  /**
   * Set the active vehicle for interaction.
   */
  setActive(name) {
    if (this.vehicles.has(name)) {
      this.activeVehicle = this.vehicles.get(name);
      return this.activeVehicle;
    }
    return null;
  }

  /**
   * Find the nearest vehicle to a world position.
   */
  findNearest(worldPos, maxDistance = 8) {
    let nearest = null;
    let minDist = maxDistance;

    for (const [, data] of this.vehicles) {
      const dist = worldPos.distanceTo(data.center);
      if (dist < minDist) {
        minDist = dist;
        nearest = data;
      }
    }
    return nearest;
  }

  /**
   * Get a named mesh from the active vehicle (for doors, parts, etc.).
   */
  getMeshByName(meshName) {
    if (!this.activeVehicle) return null;
    let found = null;
    this.activeVehicle.model.traverse((child) => {
      if (child.name === meshName) found = child;
    });
    return found;
  }

  _onProgress(name, pct) {
    const event = new CustomEvent('model-load-progress', {
      detail: { name, progress: pct },
    });
    window.dispatchEvent(event);
  }

  update(delta) {
    for (const [, data] of this.vehicles) {
      if (data.mixer) data.mixer.update(delta);
    }
  }
}
