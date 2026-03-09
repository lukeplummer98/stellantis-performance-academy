/**
 * CameraController — First-person walk-around controller with pointer lock.
 * Handles WASD movement, mouse look, and smooth transitions between modes.
 */
import * as THREE from 'three';

const MOVE_SPEED = 3.5;           // Reduced for more natural walking pace
const LOOK_SPEED = 0.0012;        // Reduced mouse sensitivity
const LOOK_SMOOTHING = 0.15;      // Smoothing factor for mouse look (0-1, lower = smoother)
const MOVE_ACCELERATION = 4;     // Acceleration when starting to move
const MOVE_DECELERATION = 5;     // Deceleration when stopping (lower = smoother stop)
const PLAYER_HEIGHT = 1.7;

export class CameraController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.enabled = true;

    // Euler for pitch/yaw
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.euler.setFromQuaternion(camera.quaternion);
    
    // Target euler for smooth interpolation
    this.targetEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.targetEuler.copy(this.euler);

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

    // Mouse move - update target euler (actual camera follows smoothly)
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked || !this.enabled) return;
      this.targetEuler.y -= e.movementX * LOOK_SPEED;
      this.targetEuler.x -= e.movementY * LOOK_SPEED;
      this.targetEuler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.targetEuler.x));
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

    // Smooth mouse look interpolation
    const smoothFactor = 1 - Math.pow(1 - LOOK_SMOOTHING, delta * 60);
    this.euler.x += (this.targetEuler.x - this.euler.x) * smoothFactor;
    this.euler.y += (this.targetEuler.y - this.euler.y) * smoothFactor;
    this.camera.quaternion.setFromEuler(this.euler);

    // Movement direction
    this.direction.z = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0);
    this.direction.x = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0);
    this.direction.normalize();

    // Smooth acceleration/deceleration
    const isMovingZ = this.keys.forward || this.keys.backward;
    const isMovingX = this.keys.left || this.keys.right;
    
    if (isMovingZ) {
      // Accelerate toward target velocity
      const targetVelZ = -this.direction.z * MOVE_SPEED * delta;
      this.velocity.z += (targetVelZ - this.velocity.z) * MOVE_ACCELERATION * delta;
    } else {
      // Decelerate smoothly
      this.velocity.z -= this.velocity.z * MOVE_DECELERATION * delta;
    }
    
    if (isMovingX) {
      const targetVelX = -this.direction.x * MOVE_SPEED * delta;
      this.velocity.x += (targetVelX - this.velocity.x) * MOVE_ACCELERATION * delta;
    } else {
      this.velocity.x -= this.velocity.x * MOVE_DECELERATION * delta;
    }

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
          this.targetEuler.copy(this.euler);
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
