/**
 * Wheel Animation Test Lab
 * 
 * A testing page to visualize wheel/tyre animations from all sides.
 * Shows 4 camera views and provides controls for speed and steering.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { vehicleConfigs } from './vehicleConfig.js';
import { fixMaterials } from './systems/MaterialFixer.js';

const WHEEL_RADIUS = 0.35;
const VISUAL_SPIN_SCALE = 0.3; // dampen visual spin so spokes stay visible
const MAX_STEER_ANGLE = 0.5;

class WheelTestLab {
  constructor() {
    this.viewports = [];
    this.vehicle = null;
    this.wheels = { fl: null, fr: null, rl: null, rr: null, all: [] };
    this.speed = 0;
    this.steerAngle = 0;
    this.wheelRotation = 0;

    this._setupRenderers();
    this._setupLoaders();
    this._setupControls();
    this._populateVehicleSelect();
    
    // Load first vehicle
    if (vehicleConfigs.length > 0) {
      this._loadVehicle(vehicleConfigs[0]);
    }

    this._animate();
  }

  _setupRenderers() {
    // Create 4 viewports with different camera angles
    const viewConfigs = [
      { id: 'view-front', angle: 0, label: 'Front' },
      { id: 'view-right', angle: Math.PI / 2, label: 'Right' },
      { id: 'view-rear', angle: Math.PI, label: 'Rear' },
      { id: 'view-left', angle: -Math.PI / 2, label: 'Left' },
    ];

    viewConfigs.forEach((config) => {
      const container = document.getElementById(config.id);
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x3a3a5e);

      // Add ground grid
      const grid = new THREE.GridHelper(20, 40, 0x666666, 0x555555);
      scene.add(grid);

      // Add lights
      const ambient = new THREE.AmbientLight(0xffffff, 1.2);
      scene.add(ambient);

      const directional = new THREE.DirectionalLight(0xffffff, 2);
      directional.position.set(5, 10, 7);
      directional.castShadow = true;
      directional.shadow.mapSize.width = 1024;
      directional.shadow.mapSize.height = 1024;
      scene.add(directional);

      // Fill light from opposite side
      const fill = new THREE.DirectionalLight(0xffffff, 1);
      fill.position.set(-5, 5, -7);
      scene.add(fill);

      // Camera
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(
        Math.sin(config.angle) * 5,
        1.5,
        Math.cos(config.angle) * 5
      );
      camera.lookAt(0, 0.5, 0);

      // Orbit controls for interactivity
      const controls = new OrbitControls(camera, canvas);
      controls.target.set(0, 0.5, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.update();

      this.viewports.push({
        container,
        canvas,
        renderer,
        scene,
        camera,
        controls,
        angle: config.angle,
      });
    });

    // Handle resize
    window.addEventListener('resize', () => this._onResize());
    this._onResize();
  }

  _onResize() {
    this.viewports.forEach((vp) => {
      const rect = vp.container.getBoundingClientRect();
      vp.renderer.setSize(rect.width, rect.height);
      vp.camera.aspect = rect.width / rect.height;
      vp.camera.updateProjectionMatrix();
    });
  }

  _setupLoaders() {
    this.gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader.setDRACOLoader(dracoLoader);
  }

  _setupControls() {
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    const steerSlider = document.getElementById('steer-slider');
    const steerValue = document.getElementById('steer-value');

    speedSlider.addEventListener('input', () => {
      this.speed = parseFloat(speedSlider.value);
      speedValue.textContent = `${this.speed} m/s`;
    });

    steerSlider.addEventListener('input', () => {
      const steerPct = parseFloat(steerSlider.value);
      this.steerAngle = (steerPct / 100) * MAX_STEER_ANGLE;
      steerValue.textContent = `${Math.round(steerPct * 0.5)}°`;
    });

    // Quick buttons
    document.getElementById('btn-forward').addEventListener('click', () => {
      this.speed = 20;
      speedSlider.value = 20;
      speedValue.textContent = '20 m/s';
    });

    document.getElementById('btn-stop').addEventListener('click', () => {
      this.speed = 0;
      speedSlider.value = 0;
      speedValue.textContent = '0 m/s';
    });

    document.getElementById('btn-reverse').addEventListener('click', () => {
      this.speed = -15;
      speedSlider.value = -15;
      speedValue.textContent = '-15 m/s';
    });

    // Vehicle select
    document.getElementById('vehicle-select').addEventListener('change', (e) => {
      const config = vehicleConfigs.find((v) => v.name === e.target.value);
      if (config) {
        this._loadVehicle(config);
      }
    });
  }

  _populateVehicleSelect() {
    const select = document.getElementById('vehicle-select');
    vehicleConfigs.forEach((config) => {
      const option = document.createElement('option');
      option.value = config.name;
      option.textContent = `${config.brand} - ${config.name}`;
      select.appendChild(option);
    });
  }

  _loadVehicle(config) {
    document.getElementById('loading').classList.remove('hidden');

    // Remove old vehicle from all scenes
    if (this.vehicle) {
      this.viewports.forEach((vp) => {
        const old = vp.scene.getObjectByName(this.vehicle.name);
        if (old) vp.scene.remove(old);
      });
    }

    this.gltfLoader.load(
      config.path,
      (gltf) => {
        const model = gltf.scene;
        model.name = config.name;
        model.scale.setScalar(config.scale || 1);
        model.rotation.y = 0; // Reset rotation for testing

        // Center model
        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.sub(center);
        model.position.y = -box.min.y; // Sit on ground

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        fixMaterials(model);

        // Find wheels - supports multiple naming conventions
        // Long names checked FIRST to prevent 'frontleftwheel' matching short 'fr'
        this.wheels = { fl: null, fr: null, rl: null, rr: null, all: [] };
        model.traverse((child) => {
          const n = child.name.toLowerCase();
          // FrontLeft/FrontRight/RearLeft/RearRight convention — check FIRST
          if (n.includes('frontleft') && n.includes('wheel')) {
            this.wheels.fl = child;
            this.wheels.all.push(child);
          } else if (n.includes('frontright') && n.includes('wheel')) {
            this.wheels.fr = child;
            this.wheels.all.push(child);
          } else if (n.includes('rearleft') && n.includes('wheel')) {
            this.wheels.rl = child;
            this.wheels.all.push(child);
          } else if (n.includes('rearright') && n.includes('wheel')) {
            this.wheels.rr = child;
            this.wheels.all.push(child);
          }
          // Short FL/FR/RL/RR naming
          else if (n.includes('fl') && n.includes('wheel')) {
            this.wheels.fl = child;
            this.wheels.all.push(child);
          } else if (n.includes('fr') && n.includes('wheel')) {
            this.wheels.fr = child;
            this.wheels.all.push(child);
          } else if (n.includes('rl') && n.includes('wheel')) {
            this.wheels.rl = child;
            this.wheels.all.push(child);
          } else if (n.includes('rr') && n.includes('wheel')) {
            this.wheels.rr = child;
            this.wheels.all.push(child);
          }
          // McLaren style: Wheel.Ft.L, Wheel.Ft.R, Wheel.Bk.L, Wheel.Bk.R
          else if (n.includes('wheel') && n.includes('.ft.') && n.includes('.l')) {
            this.wheels.fl = child;
            this.wheels.all.push(child);
          } else if (n.includes('wheel') && n.includes('.ft.') && n.includes('.r')) {
            this.wheels.fr = child;
            this.wheels.all.push(child);
          } else if (n.includes('wheel') && n.includes('.bk.') && n.includes('.l')) {
            this.wheels.rl = child;
            this.wheels.all.push(child);
          } else if (n.includes('wheel') && n.includes('.bk.') && n.includes('.r')) {
            this.wheels.rr = child;
            this.wheels.all.push(child);
          }
        });

        // Clone model for each viewport
        this.viewports.forEach((vp) => {
          const clone = model.clone();
          vp.scene.add(clone);
        });

        this.vehicle = model;
        this.wheelRotation = 0;

        // Update wheel references to point to first viewport's model
        const firstModel = this.viewports[0].scene.getObjectByName(config.name);
        if (firstModel) {
          this.wheels = { fl: null, fr: null, rl: null, rr: null, all: [] };
          firstModel.traverse((child) => {
            const n = child.name.toLowerCase();
            // FrontLeft/FrontRight/RearLeft/RearRight — check FIRST
            if (n.includes('frontleft') && n.includes('wheel')) {
              this.wheels.fl = child;
              this.wheels.all.push(child);
            } else if (n.includes('frontright') && n.includes('wheel')) {
              this.wheels.fr = child;
              this.wheels.all.push(child);
            } else if (n.includes('rearleft') && n.includes('wheel')) {
              this.wheels.rl = child;
              this.wheels.all.push(child);
            } else if (n.includes('rearright') && n.includes('wheel')) {
              this.wheels.rr = child;
              this.wheels.all.push(child);
            }
            // Short FL/FR/RL/RR naming
            else if (n.includes('fl') && n.includes('wheel')) {
              this.wheels.fl = child;
              this.wheels.all.push(child);
            } else if (n.includes('fr') && n.includes('wheel')) {
              this.wheels.fr = child;
              this.wheels.all.push(child);
            } else if (n.includes('rl') && n.includes('wheel')) {
              this.wheels.rl = child;
              this.wheels.all.push(child);
            } else if (n.includes('rr') && n.includes('wheel')) {
              this.wheels.rr = child;
              this.wheels.all.push(child);
            }
            // McLaren style: Wheel.Ft.L, Wheel.Ft.R, Wheel.Bk.L, Wheel.Bk.R
            else if (n.includes('wheel') && n.includes('.ft.') && n.includes('.l')) {
              this.wheels.fl = child;
              this.wheels.all.push(child);
            } else if (n.includes('wheel') && n.includes('.ft.') && n.includes('.r')) {
              this.wheels.fr = child;
              this.wheels.all.push(child);
            } else if (n.includes('wheel') && n.includes('.bk.') && n.includes('.l')) {
              this.wheels.rl = child;
              this.wheels.all.push(child);
            } else if (n.includes('wheel') && n.includes('.bk.') && n.includes('.r')) {
              this.wheels.rr = child;
              this.wheels.all.push(child);
            }
          });
        }

        document.getElementById('loading').classList.add('hidden');
        console.log('Loaded vehicle:', config.name, 'Wheels found:', this.wheels);
      },
      undefined,
      (error) => {
        console.error('Failed to load:', error);
        document.getElementById('loading').classList.add('hidden');
      }
    );
  }

  _updateWheels(delta) {
    if (!this.vehicle) return;

    const angularVelocity = (this.speed / WHEEL_RADIUS) * VISUAL_SPIN_SCALE;
    this.wheelRotation += angularVelocity * delta;

    // Update wheels in all viewports
    this.viewports.forEach((vp, vpIdx) => {
      const model = vp.scene.getObjectByName(this.vehicle.name);
      if (!model) return;

      // One-time debug: log all wheel nodes found
      if (!this._debuggedWheels) {
        this._debuggedWheels = true;
        const found = [];
        model.traverse((c) => {
          if (c.name.toLowerCase().includes('wheel')) found.push(c.name);
        });
        console.log('[WheelTest] Wheel nodes in model:', found);
      }

      model.traverse((child) => {
        const n = child.name.toLowerCase();
        // Only match actual wheel nodes — not cylinders, rims, or other parts
        if (!n.includes('wheel')) return;

        const isFront = n.includes('frontleft') || n.includes('frontright')
          || (n.includes('fl') && !n.includes('rear'))
          || (n.includes('fr') && !n.includes('rear'))
          || (n.includes('.ft.') && n.includes('wheel'));

        // Use YXZ order so steering (Y) is applied before spin (X)
        if (isFront && child.rotation.order !== 'YXZ') {
          child.rotation.order = 'YXZ';
        }

        // Spin wheel around X axis
        child.rotation.x = this.wheelRotation;

        // Steer front wheels around Y axis (yaw)
        if (isFront) {
          child.rotation.y = this.steerAngle;
        }
      });
    });

    // Update info panel
    const toDeg = (rad) => `${(rad * 180 / Math.PI).toFixed(1)}°`;
    document.getElementById('fl-rot').textContent = this.wheels.fl ? toDeg(this.wheelRotation) : 'N/A';
    document.getElementById('fr-rot').textContent = this.wheels.fr ? toDeg(this.wheelRotation) : 'N/A';
    document.getElementById('rl-rot').textContent = this.wheels.rl ? toDeg(this.wheelRotation) : 'N/A';
    document.getElementById('rr-rot').textContent = this.wheels.rr ? toDeg(this.wheelRotation) : 'N/A';
    document.getElementById('steer-rot').textContent = toDeg(this.steerAngle);
  }

  _animate() {
    const clock = new THREE.Clock();

    const loop = () => {
      requestAnimationFrame(loop);
      const delta = clock.getDelta();

      this._updateWheels(delta);

      this.viewports.forEach((vp) => {
        vp.controls.update();
        vp.renderer.render(vp.scene, vp.camera);
      });
    };

    loop();
  }
}

// Start the test lab
new WheelTestLab();
