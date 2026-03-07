/**
 * DiagnosticOrbitControls — Simple orbit controls for diagnostic mode.
 * Mouse drag to orbit around the vehicle, scroll to zoom.
 */
import * as THREE from 'three';

export class DiagnosticOrbitControls {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.enabled = false;

    this.target = new THREE.Vector3();
    this.spherical = new THREE.Spherical(6, Math.PI / 3, Math.PI / 4);
    this.isDragging = false;
    this.prevMouse = { x: 0, y: 0 };

    this._bindEvents();
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.isDragging = true;
      this.prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.isDragging) return;
      const dx = e.clientX - this.prevMouse.x;
      const dy = e.clientY - this.prevMouse.y;
      this.prevMouse = { x: e.clientX, y: e.clientY };

      this.spherical.theta -= dx * 0.005;
      this.spherical.phi = Math.max(0.3, Math.min(Math.PI / 2, this.spherical.phi - dy * 0.005));
    });

    this.canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.spherical.radius = Math.max(3, Math.min(20, this.spherical.radius + e.deltaY * 0.01));
    }, { passive: false });
  }

  setTarget(pos) {
    this.target.copy(pos);
  }

  update() {
    if (!this.enabled) return;
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }
}
