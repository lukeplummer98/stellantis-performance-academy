/**
 * Stellantis Performance Academy — Main Entry Point
 *
 * Boots the 3D showroom: scene, models, controls, interactions, diagnostics, driving.
 * Drop .glb car models into public/ and register them in vehicleConfig.js.
 */
import { SceneManager } from './systems/SceneManager.js';
import { ModelLoader } from './systems/ModelLoader.js';
import { CameraController } from './systems/CameraController.js';
import { InteractionSystem, InteractionMode } from './systems/InteractionSystem.js';
import { DriveSystem } from './systems/DriveSystem.js';
import { DiagnosticOrbitControls } from './systems/DiagnosticOrbitControls.js';
import { HUDManager } from './ui/HUDManager.js';
import { vehicleConfigs } from './vehicleConfig.js';

class App {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.hud = new HUDManager();

    // Core scene
    this.scene = new SceneManager(this.canvas);

    // Systems
    this.modelLoader = new ModelLoader(this.scene.scene);
    this.cameraController = new CameraController(this.scene.camera, this.canvas);
    this.interaction = new InteractionSystem(
      this.scene.camera,
      this.scene.scene,
      this.modelLoader,
      this.cameraController
    );
    this.driveSystem = new DriveSystem(this.scene.camera);
    this.orbitControls = new DiagnosticOrbitControls(this.scene.camera, this.canvas);

    // Add crosshair element
    this._createCrosshair();

    // Mode change handler — toggle between control schemes
    window.addEventListener('mode-change', (e) => {
      this._onModeChange(e.detail.mode);
    });

    this._init();
  }

  _createCrosshair() {
    const ch = document.createElement('div');
    ch.id = 'crosshair';
    document.getElementById('app').appendChild(ch);
  }

  async _init() {
    this.hud.setLoadingProgress(10, 'Initializing scene...');

    // Load vehicle models
    if (vehicleConfigs.length > 0) {
      this.hud.setLoadingProgress(20, 'Loading vehicles...');
      try {
        await this.modelLoader.loadAll(vehicleConfigs);
      } catch (err) {
        console.warn('Some models failed to load:', err);
      }
      this.hud.populateVehicleList(this.modelLoader.vehicles, (name) => {
        // Teleport camera near selected vehicle
        const data = this.modelLoader.vehicles.get(name);
        if (data) {
          const pos = data.center.clone();
          pos.x += 4;
          pos.y = 1.7;
          pos.z += 4;
          this.cameraController.transitionTo(pos, data.center, 0.8);
        }
      });
    } else {
      this.hud.setLoadingProgress(50, 'No vehicles configured — add .glb files to public/ and register in vehicleConfig.js');
    }

    this.hud.setLoadingProgress(100, 'Ready');
    setTimeout(() => this.hud.hideLoading(), 400);

    // Start render loop
    this._loop();
  }

  _onModeChange(mode) {
    const isShowroom = mode === InteractionMode.SHOWROOM;
    const isInterior = mode === InteractionMode.INTERIOR;
    const isDrive = mode === InteractionMode.DRIVE;
    const isDiagnose = mode === InteractionMode.DIAGNOSE;

    // Camera controller: active in showroom + interior
    this.cameraController.enabled = isShowroom || isInterior;

    // Orbit controls: active only in diagnose mode
    this.orbitControls.enabled = isDiagnose;
    if (isDiagnose && this.modelLoader.activeVehicle) {
      this.orbitControls.setTarget(this.modelLoader.activeVehicle.center);
    }

    // Pointer lock: only showroom + interior
    if (isDiagnose || isDrive) {
      this.cameraController.unlock();
    }

    // Crosshair visibility
    const ch = document.getElementById('crosshair');
    if (ch) ch.style.display = (isShowroom || isInterior) ? '' : 'none';
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    const delta = this.scene.clock.getDelta();

    // Update all systems
    this.cameraController.update(delta);
    this.interaction.update(delta);
    this.driveSystem.update(delta);
    this.orbitControls.update();
    this.modelLoader.update(delta);

    // Render
    this.scene.render();
  }
}

// Boot
new App();
