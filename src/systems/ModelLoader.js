/**
 * ModelLoader — Loads .glb models from /public or /src/assets/models.
 * Provides a registry of loaded vehicles with metadata.
 * Drop .glb files into public/ or src/assets/models/ and register them.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

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
