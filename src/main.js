/**
 * Stellantis Performance Academy — Main Entry Point
 *
 * Boots the 3D showroom with driveable worlds, ADAS features, and portals.
 * Vehicle spawns in a world; drive through portals to switch environments.
 */
import * as THREE from 'three';
import { SceneManager } from './systems/SceneManager.js';
import { ModelLoader } from './systems/ModelLoader.js';
import { CameraController } from './systems/CameraController.js';
import { InteractionSystem, InteractionMode } from './systems/InteractionSystem.js';
import { DriveSystem } from './systems/DriveSystem.js';
import { DiagnosticOrbitControls } from './systems/DiagnosticOrbitControls.js';
import { HUDManager } from './ui/HUDManager.js';
import { ThemeEngine } from './ui/ThemeEngine.js';
import { ADASOverlay } from './ui/ADASOverlay.js';
import { vehicleConfigs } from './vehicleConfig.js';
import { WorldManager, WorldId } from './worlds/WorldManager.js';
import { ADASSystem } from './systems/ADASSystem.js';

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
    this.themeEngine = new ThemeEngine(this.scene.scene);

    // World + ADAS systems
    this.worldManager = new WorldManager(this.scene.scene, this.scene.camera);
    this.adasSystem = new ADASSystem();
    this.adasOverlay = new ADASOverlay();

    // Track world state
    this.inWorld = false;
    this.portalCooldown = 0; // prevent rapid portal re-entry

    // Brightness toggle
    const brightnessBtn = document.getElementById('brightness-toggle');
    if (brightnessBtn) {
      brightnessBtn.addEventListener('click', () => {
        const level = this.scene.cycleBrightness();
        brightnessBtn.textContent = `☀ ${level}`;
      });
    }

    // Add crosshair element
    this._createCrosshair();

    // Mode change handler — toggle between control schemes
    window.addEventListener('mode-change', (e) => {
      this._onModeChange(e.detail.mode);
    });

    // Key handler for world-level actions
    document.addEventListener('keydown', (e) => this._onGlobalKey(e));

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
      this.hud.setLoadingProgress(50, 'No vehicles configured');
    }

    this.hud.setLoadingProgress(80, 'Building world selector...');

    // Create world selector UI
    this._createWorldSelector();

    this.hud.setLoadingProgress(100, 'Ready');
    setTimeout(() => this.hud.hideLoading(), 400);

    // Start render loop
    this._loop();
  }

  /** Build the world selection overlay */
  _createWorldSelector() {
    const sel = document.createElement('div');
    sel.id = 'world-select';
    sel.innerHTML = `
      <div class="world-select-inner">
        <h1>SELECT SCENARIO</h1>
        <p>Choose an environment to drive in. You can switch worlds via portals.</p>
        <div class="world-cards">
          <div class="world-card" data-world="${WorldId.TEST_TRACK}">
            <div class="world-icon">🏁</div>
            <div class="world-title">Test Track</div>
            <div class="world-desc">Open oval circuit. Top speed runs, free driving and obstacle avoidance.</div>
          </div>
          <div class="world-card" data-world="${WorldId.CITY_STREET}">
            <div class="world-icon">🏙️</div>
            <div class="world-title">City Street</div>
            <div class="world-desc">Urban road with AEB demo. A pram crosses — can the system stop in time?</div>
          </div>
          <div class="world-card" data-world="${WorldId.SUPERMARKET}">
            <div class="world-icon">🛒</div>
            <div class="world-title">Supermarket</div>
            <div class="world-desc">Car park with reverse parking challenge. Sensors guide you into a tight bay.</div>
          </div>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(sel);
    this.worldSelectEl = sel;

    // Card click handlers
    sel.querySelectorAll('.world-card').forEach((card) => {
      card.addEventListener('click', () => {
        const worldId = card.dataset.world;
        this._enterWorld(worldId);
      });
    });
  }

  /** Hide showroom elements and load a world */
  _enterWorld(worldId) {
    // Hide world selector
    if (this.worldSelectEl) this.worldSelectEl.classList.add('hidden');

    // Hide showroom decor (pillars, grid, spotlight, showroom ground)
    this._hideShowroomElements();

    // Get active vehicle
    const vehicleEntry = this.modelLoader.vehicles.entries().next().value;
    if (!vehicleEntry) {
      console.error('[App] No vehicle loaded!');
      return;
    }
    const [vehicleName, vehicleData] = vehicleEntry;

    // Load world
    const { spawnPos, spawnRot } = this.worldManager.loadWorld(worldId, vehicleData.model);

    // Position vehicle at spawn
    vehicleData.model.position.copy(spawnPos);
    vehicleData.model.rotation.y = spawnRot;
    vehicleData.center.copy(spawnPos);
    vehicleData.center.y += vehicleData.size.y / 2;

    // Auto-enter drive mode
    this.driveSystem.start(vehicleData);
    this.driveSystem.chassisRotation = spawnRot;
    this.interaction.setMode(InteractionMode.DRIVE);

    // Configure ADAS for this world
    this.adasSystem.reset();
    if (worldId === WorldId.CITY_STREET) {
      this.adasSystem.setSpeedLimit(30);
    } else if (worldId === WorldId.SUPERMARKET) {
      this.adasSystem.setSpeedLimit(10);
    } else {
      this.adasSystem.setSpeedLimit(120);
    }

    // Update HUD overlay
    const worldNames = {
      [WorldId.TEST_TRACK]: 'TEST TRACK',
      [WorldId.CITY_STREET]: 'CITY STREET',
      [WorldId.SUPERMARKET]: 'SUPERMARKET',
    };
    const objectives = {
      [WorldId.TEST_TRACK]: 'FREE DRIVE — EXPLORE AND HIT TOP SPEED',
      [WorldId.CITY_STREET]: 'AEB DEMO — DRIVE TOWARD THE CROSSING',
      [WorldId.SUPERMARKET]: 'REVERSE INTO THE HIGHLIGHTED BAY',
    };
    this.adasOverlay.setWorldInfo(worldNames[worldId] || worldId, objectives[worldId] || '');
    this.adasOverlay.hideResult();
    this.adasOverlay.show();

    this.inWorld = true;
    window._inWorldMode = true;
    this.portalCooldown = 2.0; // 2s cooldown after loading

    console.log(`[App] Entered world: ${worldId}`);
  }

  /** Transition between worlds via portal */
  _transitionToWorld(targetWorldId) {
    if (this.portalCooldown > 0) return;

    // Stop driving temporarily
    const vehicleData = this.driveSystem.vehicle;
    this.driveSystem.stop();

    // Small flash effect
    this.scene.scene.background = new THREE.Color(0xffffff);
    setTimeout(() => {
      const { spawnPos, spawnRot } = this.worldManager.loadWorld(targetWorldId, vehicleData.model);

      vehicleData.model.position.copy(spawnPos);
      vehicleData.model.rotation.y = spawnRot;
      vehicleData.center.copy(spawnPos);
      vehicleData.center.y += vehicleData.size.y / 2;

      // Restart drive
      this.driveSystem.start(vehicleData);
      this.driveSystem.chassisRotation = spawnRot;

      // Update ADAS
      this.adasSystem.reset();
      if (targetWorldId === WorldId.CITY_STREET) {
        this.adasSystem.setSpeedLimit(30);
      } else if (targetWorldId === WorldId.SUPERMARKET) {
        this.adasSystem.setSpeedLimit(10);
      } else {
        this.adasSystem.setSpeedLimit(120);
      }

      const worldNames = {
        [WorldId.TEST_TRACK]: 'TEST TRACK',
        [WorldId.CITY_STREET]: 'CITY STREET',
        [WorldId.SUPERMARKET]: 'SUPERMARKET',
      };
      const objectives = {
        [WorldId.TEST_TRACK]: 'FREE DRIVE — EXPLORE AND HIT TOP SPEED',
        [WorldId.CITY_STREET]: 'AEB DEMO — DRIVE TOWARD THE CROSSING',
        [WorldId.SUPERMARKET]: 'REVERSE INTO THE HIGHLIGHTED BAY',
      };
      this.adasOverlay.setWorldInfo(worldNames[targetWorldId] || targetWorldId, objectives[targetWorldId] || '');
      this.adasOverlay.hideResult();

      this.portalCooldown = 2.0;
      console.log(`[App] Portal transition to: ${targetWorldId}`);
    }, 150);
  }

  /** Hide the showroom-specific scene elements */
  _hideShowroomElements() {
    this.scene.scene.children.forEach((child) => {
      // Hide pillars, grid, showroom ground, showroom lights
      if (child.isGridHelper) child.visible = false;
      if (child.isMesh && child.geometry?.type === 'PlaneGeometry' && child.material?.color?.getHex() === 0x111111) {
        child.visible = false;
      }
      if (child.isMesh && child.geometry?.type === 'CylinderGeometry') child.visible = false;
      if (child.isSpotLight) child.visible = false;
    });
  }

  /** Show showroom elements again (when returning to showroom) */
  _showShowroomElements() {
    this.scene.scene.children.forEach((child) => {
      if (child.isGridHelper) child.visible = true;
      if (child.isMesh && child.geometry?.type === 'PlaneGeometry') child.visible = true;
      if (child.isMesh && child.geometry?.type === 'CylinderGeometry') child.visible = true;
      if (child.isSpotLight) child.visible = true;
    });
  }

  _onGlobalKey(event) {
    // R to retry/reset current world
    if (event.code === 'KeyR' && this.inWorld) {
      this._enterWorld(this.worldManager.currentWorldId);
    }
    // Escape to return to world selector (if in world)
    if (event.code === 'Escape' && this.inWorld) {
      this._returnToWorldSelect();
    }
  }

  _returnToWorldSelect() {
    this.driveSystem.stop();
    this.inWorld = false;
    window._inWorldMode = false;

    // Unload world
    if (this.worldManager.currentWorld) {
      this.worldManager.currentWorld.dispose();
      this.scene.scene.remove(this.worldManager.currentWorld.group);
      this.worldManager.portalGroup.clear();
      this.worldManager.portals = [];
      this.worldManager.currentWorld = null;
    }

    // Restore showroom
    this._showShowroomElements();
    this.scene.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.scene.fog = new THREE.Fog(0x0a0a0a, 40, 120);

    // Reset vehicle position
    const vehicleEntry = this.modelLoader.vehicles.entries().next().value;
    if (vehicleEntry) {
      const [, vehicleData] = vehicleEntry;
      vehicleData.model.position.set(0, 0, 0);
      vehicleData.model.rotation.y = 0;
    }

    // Reset camera
    this.scene.camera.position.set(0, 1.7, 8);
    this.scene.camera.lookAt(0, 0, 0);

    // Return to showroom mode
    this.interaction.setMode(InteractionMode.SHOWROOM);

    // Show world selector
    if (this.worldSelectEl) this.worldSelectEl.classList.remove('hidden');
    this.adasOverlay.hide();
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

    // Mode indicator in HUD
    const modeEl = document.getElementById('mode-indicator');
    if (modeEl) modeEl.textContent = mode.toUpperCase();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    const delta = this.scene.clock.getDelta();

    // Update base systems
    this.cameraController.update(delta);
    this.interaction.update(delta);
    this.driveSystem.update(delta);
    this.orbitControls.update();
    this.modelLoader.update(delta);

    // ── World + ADAS loop ──
    if (this.inWorld && this.driveSystem.active && this.driveSystem.vehicle) {
      const vehiclePos = this.driveSystem.vehicle.model.position;
      const vehicleRot = this.driveSystem.chassisRotation;
      const vehicleSpeed = this.driveSystem.speed;

      // Update world (NPC movement, scenario triggers, portal animation)
      this.worldManager.update(delta, vehiclePos, vehicleSpeed);

      // Get scenario state from world (obstacles, crossing status, etc.)
      const scenarioState = this.worldManager.getScenarioState();

      // Update ADAS (AEB, parking sensors)
      this.adasSystem.update(delta, this.driveSystem, scenarioState, vehiclePos, vehicleRot);

      // Update ADAS overlay HUD
      const adasHUD = this.adasSystem.getHUDState();
      this.adasOverlay.update(adasHUD, this.worldManager.currentWorldId, scenarioState);

      // Portal collision check
      if (this.portalCooldown > 0) {
        this.portalCooldown -= delta;
      } else {
        const targetWorld = this.worldManager.checkPortalCollision(vehiclePos);
        if (targetWorld) {
          this._transitionToWorld(targetWorld);
        }

        // Portal proximity hint
        let nearPortal = false;
        for (const portal of this.worldManager.portals) {
          const dist = vehiclePos.distanceTo(portal.position);
          if (dist < 12) {
            this.adasOverlay.showPortalHint(portal.label);
            nearPortal = true;
            break;
          }
        }
        if (!nearPortal) this.adasOverlay.hidePortalHint();
      }
    }

    // Brand theme — switch based on nearby vehicle
    const nearby = this.interaction.nearbyVehicle;
    if (nearby) {
      this.themeEngine.applyTheme(nearby.config.brand);
    } else if (!this.modelLoader.activeVehicle) {
      this.themeEngine.resetTheme();
    }

    // Render
    this.scene.render();
  }
}

// Boot
new App();
