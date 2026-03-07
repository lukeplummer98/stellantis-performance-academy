/**
 * CameraController — First-person walk-around controller with pointer lock.
 * Handles WASD movement, mouse look, and smooth transitions between modes.
 */
import * as THREE from 'three';

const MOVE_SPEED = 5;
const LOOK_SPEED = 0.002;
const PLAYER_HEIGHT = 1.7;

export class CameraController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.enabled = true;

    // Euler for pitch/yaw
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.euler.setFromQuaternion(camera.quaternion);

    // Movement state
    this.keys = { forward: false, backward: false, left: false, right: false };
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.isLocked = false;

    this._bindEvents();
  }

  _bindEvents() {
    // Pointer lock
    this.canvas.addEventListener('click', () => {
      if (this.enabled && !this.isLocked) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.canvas;
      document.body.classList.toggle('pointer-locked', this.isLocked);
    });

    // Mouse move
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || !this.enabled) return;
      this.euler.y -= e.movementX * LOOK_SPEED;
      this.euler.x -= e.movementY * LOOK_SPEED;
      this.euler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.euler.x));
      this.camera.quaternion.setFromEuler(this.euler);
    });

    // Keyboard
    document.addEventListener('keydown', (e) => this._onKey(e, true));
    document.addEventListener('keyup', (e) => this._onKey(e, false));
  }

  _onKey(event, pressed) {
    if (!this.enabled) return;
    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = pressed; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = pressed; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = pressed; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = pressed; break;
    }
  }

  update(delta) {
    if (!this.enabled || !this.isLocked) return;

    // Deceleration
    this.velocity.x -= this.velocity.x * 8 * delta;
    this.velocity.z -= this.velocity.z * 8 * delta;

    // Movement direction
    this.direction.z = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0);
    this.direction.x = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0);
    this.direction.normalize();

    if (this.keys.forward || this.keys.backward)
      this.velocity.z -= this.direction.z * MOVE_SPEED * delta;
    if (this.keys.left || this.keys.right)
      this.velocity.x -= this.direction.x * MOVE_SPEED * delta;

    // Apply movement relative to camera facing direction (Y-locked)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    this.camera.position.addScaledVector(forward, -this.velocity.z);
    this.camera.position.addScaledVector(right, -this.velocity.x);

    // Lock to player height
    this.camera.position.y = PLAYER_HEIGHT;
  }

  /**
   * Smoothly transition camera to a target position/rotation.
   */
  transitionTo(targetPos, targetLookAt, duration = 1.0) {
    return new Promise((resolve) => {
      const startPos = this.camera.position.clone();
      const startQuat = this.camera.quaternion.clone();

      // Compute target quaternion
      const tempCamera = this.camera.clone();
      tempCamera.position.copy(targetPos);
      tempCamera.lookAt(targetLookAt);
      const targetQuat = tempCamera.quaternion.clone();

      let elapsed = 0;
      const wasEnabled = this.enabled;
      this.enabled = false;

      const animate = () => {
        elapsed += 1 / 60;
        const t = Math.min(elapsed / duration, 1);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out

        this.camera.position.lerpVectors(startPos, targetPos, eased);
        this.camera.quaternion.slerpQuaternions(startQuat, targetQuat, eased);

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          this.euler.setFromQuaternion(this.camera.quaternion);
          this.enabled = wasEnabled;
          resolve();
        }
      };
      animate();
    });
  }

  unlock() {
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }
}
