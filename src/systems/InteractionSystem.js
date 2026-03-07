/**
 * InteractionSystem — Manages proximity-based vehicle interactions.
 * Raycasting for part selection, mode transitions (enter, drive, diagnose).
 */
import * as THREE from 'three';

export const InteractionMode = {
  SHOWROOM: 'showroom',
  INTERIOR: 'interior',
  DRIVE: 'drive',
  DIAGNOSE: 'diagnose',
};

export class InteractionSystem {
  constructor(camera, scene, modelLoader, cameraController) {
    this.camera = camera;
    this.scene = scene;
    this.modelLoader = modelLoader;
    this.cameraController = cameraController;

    this.mode = InteractionMode.SHOWROOM;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 15;
    this.mouse = new THREE.Vector2(0, 0); // center screen

    this.hoveredPart = null;
    this.selectedPart = null;
    this.nearbyVehicle = null;

    // UI refs
    this.modeIndicator = document.getElementById('mode-indicator');
    this.interactPrompt = null;
    this._createPromptElement();

    // Highlight material
    this.highlightColor = new THREE.Color(0x0066ff);
    this.originalMaterials = new Map();

    this._bindEvents();
  }

  _createPromptElement() {
    this.interactPrompt = document.createElement('div');
    this.interactPrompt.id = 'interact-prompt';
    document.getElementById('app').appendChild(this.interactPrompt);
  }

  _bindEvents() {
    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('click', (e) => this._onClick(e));
  }

  _onKeyDown(event) {
    switch (event.code) {
      case 'KeyE':
        if (this.mode === InteractionMode.SHOWROOM && this.nearbyVehicle) {
          this.enterVehicle();
        }
        break;
      case 'KeyF':
        if (this.mode === InteractionMode.INTERIOR) {
          this.exitVehicle();
        }
        break;
      case 'Tab':
        event.preventDefault();
        if (this.mode === InteractionMode.SHOWROOM && this.nearbyVehicle) {
          this.enterDiagnosticMode();
        } else if (this.mode === InteractionMode.DIAGNOSE) {
          this.exitDiagnosticMode();
        }
        break;
      case 'Space':
        if (this.mode === InteractionMode.INTERIOR) {
          event.preventDefault();
          this.startDriving();
        } else if (this.mode === InteractionMode.DRIVE) {
          // Brake is handled in DriveSystem
        }
        break;
      case 'Escape':
        if (this.mode === InteractionMode.DRIVE) {
          this.stopDriving();
        }
        break;
    }
  }

  _onClick() {
    if (this.mode === InteractionMode.DIAGNOSE && this.hoveredPart) {
      this.selectPart(this.hoveredPart);
    }
  }

  /**
   * Enter vehicle — transition camera to seat position.
   */
  async enterVehicle() {
    if (!this.nearbyVehicle) return;
    this.modelLoader.setActive(this.nearbyVehicle.config.name);

    const seatPos = this.nearbyVehicle.config.seatPosition;
    const vehiclePos = this.nearbyVehicle.model.position;
    const target = new THREE.Vector3(
      vehiclePos.x + seatPos.x,
      vehiclePos.y + seatPos.y,
      vehiclePos.z + seatPos.z
    );
    const lookAt = new THREE.Vector3(
      vehiclePos.x + seatPos.x + 1,
      vehiclePos.y + seatPos.y,
      vehiclePos.z + seatPos.z
    );

    this.cameraController.enabled = false;
    await this.cameraController.transitionTo(target, lookAt, 0.8);

    this.setMode(InteractionMode.INTERIOR);
    this.cameraController.enabled = true; // re-enable look only
  }

  /**
   * Exit vehicle — move camera back outside.
   */
  async exitVehicle() {
    if (!this.nearbyVehicle) return;
    const vehiclePos = this.nearbyVehicle.center.clone();
    const exitPos = new THREE.Vector3(
      vehiclePos.x + 3,
      1.7,
      vehiclePos.z + 3
    );

    this.cameraController.enabled = false;
    await this.cameraController.transitionTo(exitPos, vehiclePos, 0.8);

    this.setMode(InteractionMode.SHOWROOM);
    this.cameraController.enabled = true;
  }

  /**
   * Enter diagnostic mode — orbit camera around vehicle.
   */
  async enterDiagnosticMode() {
    if (!this.nearbyVehicle) return;
    this.modelLoader.setActive(this.nearbyVehicle.config.name);

    const center = this.nearbyVehicle.center.clone();
    const offset = this.nearbyVehicle.size.length() * 0.8;
    const diagPos = new THREE.Vector3(
      center.x + offset,
      center.y + offset * 0.5,
      center.z + offset
    );

    this.cameraController.enabled = false;
    await this.cameraController.transitionTo(diagPos, center, 0.8);

    this.setMode(InteractionMode.DIAGNOSE);
    document.getElementById('diagnostic-panel').classList.remove('hidden');
    document.getElementById('diag-vehicle-name').textContent = this.nearbyVehicle.config.name;

    this._populateDiagnostics();
  }

  /**
   * Exit diagnostic mode.
   */
  async exitDiagnosticMode() {
    this._clearHighlight();
    document.getElementById('diagnostic-panel').classList.add('hidden');

    const vehiclePos = this.nearbyVehicle ? this.nearbyVehicle.center.clone() : new THREE.Vector3();
    const exitPos = new THREE.Vector3(vehiclePos.x + 4, 1.7, vehiclePos.z + 4);

    await this.cameraController.transitionTo(exitPos, vehiclePos, 0.6);
    this.setMode(InteractionMode.SHOWROOM);
    this.cameraController.enabled = true;
  }

  /**
   * Start driving — hand off to DriveSystem.
   */
  startDriving() {
    this.setMode(InteractionMode.DRIVE);
    window.dispatchEvent(new CustomEvent('drive-start', {
      detail: { vehicle: this.nearbyVehicle },
    }));
  }

  /**
   * Stop driving — return to interior.
   */
  stopDriving() {
    this.setMode(InteractionMode.INTERIOR);
    window.dispatchEvent(new CustomEvent('drive-stop'));
  }

  /**
   * Select a part for diagnostic display.
   */
  selectPart(mesh) {
    this._clearHighlight();
    this.selectedPart = mesh;

    // Highlight selected
    if (mesh.material) {
      this.originalMaterials.set(mesh.uuid, mesh.material.clone());
      if (mesh.material.emissive) {
        mesh.material = mesh.material.clone();
        mesh.material.emissive = this.highlightColor;
        mesh.material.emissiveIntensity = 0.3;
      }
    }

    // Update UI
    document.getElementById('diag-part-name').textContent = mesh.name || 'Unknown Part';
    document.getElementById('diag-part-info').textContent =
      `Vertices: ${mesh.geometry?.attributes?.position?.count || '—'} | ` +
      `Material: ${mesh.material?.name || mesh.material?.type || '—'}`;
  }

  _clearHighlight() {
    if (this.selectedPart && this.originalMaterials.has(this.selectedPart.uuid)) {
      this.selectedPart.material = this.originalMaterials.get(this.selectedPart.uuid);
      this.originalMaterials.delete(this.selectedPart.uuid);
    }
    this.selectedPart = null;
  }

  _populateDiagnostics() {
    const container = document.getElementById('diag-systems');
    container.innerHTML = '';

    const systems = this.nearbyVehicle?.config?.systems || {
      'Engine': 'ok',
      'Transmission': 'ok',
      'Brakes': 'ok',
      'Suspension': 'ok',
      'Electrical': 'ok',
      'Cooling': 'ok',
    };

    for (const [system, status] of Object.entries(systems)) {
      const row = document.createElement('div');
      row.className = 'status-row';
      row.innerHTML = `
        <span class="status-label">${system}</span>
        <span class="status-value status-${status}">${status.toUpperCase()}</span>
      `;
      container.appendChild(row);
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.modeIndicator.textContent = mode.toUpperCase();

    // Update control hint visibility
    document.querySelectorAll('#controls-hint span').forEach((el) => {
      el.style.display = el.dataset.mode === mode ? '' : 'none';
    });

    window.dispatchEvent(new CustomEvent('mode-change', { detail: { mode } }));
  }

  update(delta) {
    // Proximity check in showroom mode
    if (this.mode === InteractionMode.SHOWROOM) {
      this.nearbyVehicle = this.modelLoader.findNearest(this.camera.position);

      if (this.nearbyVehicle) {
        this.interactPrompt.style.display = 'block';
        this.interactPrompt.textContent = `Press E to enter ${this.nearbyVehicle.config.name}`;
      } else {
        this.interactPrompt.style.display = 'none';
      }
    }

    // Raycast in diagnostic mode
    if (this.mode === InteractionMode.DIAGNOSE && this.modelLoader.activeVehicle) {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(
        this.modelLoader.activeVehicle.model,
        true
      );

      if (intersects.length > 0) {
        this.hoveredPart = intersects[0].object;
        this.canvas?.style && (document.body.style.cursor = 'pointer');
      } else {
        this.hoveredPart = null;
        document.body.style.cursor = 'crosshair';
      }
    }
  }
}
