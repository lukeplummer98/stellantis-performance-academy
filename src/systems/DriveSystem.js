/**
 * DriveSystem — Simple arcade-style driving simulation.
 * Applies keyboard input to move the vehicle model and chase-camera.
 */
import * as THREE from 'three';

const ACCELERATION = 12;
const BRAKE_FORCE = 20;
const MAX_SPEED = 40;
const TURN_SPEED = 2.5;
const FRICTION = 4;
const CHASE_DISTANCE = 8;
const CHASE_HEIGHT = 3;
const CHASE_SMOOTH = 3;

export class DriveSystem {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.vehicle = null;

    this.speed = 0;
    this.steerAngle = 0;
    this.chassisRotation = 0;

    this.keys = { forward: false, backward: false, left: false, right: false, brake: false };
    this.chaseTarget = new THREE.Vector3();
    this.chaseLookAt = new THREE.Vector3();

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('drive-start', (e) => {
      this.start(e.detail.vehicle);
    });

    window.addEventListener('drive-stop', () => {
      this.stop();
    });

    document.addEventListener('keydown', (e) => this._onKey(e, true));
    document.addEventListener('keyup', (e) => this._onKey(e, false));
  }

  _onKey(event, pressed) {
    if (!this.active) return;
    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = pressed; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = pressed; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = pressed; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = pressed; break;
      case 'Space': this.keys.brake = pressed; break;
    }
  }

  start(vehicleData) {
    this.vehicle = vehicleData;
    this.active = true;
    this.speed = 0;
    this.chassisRotation = this.vehicle.model.rotation.y;
    this.chaseTarget.copy(this.camera.position);
  }

  stop() {
    this.active = false;
    this.speed = 0;
    this.keys = { forward: false, backward: false, left: false, right: false, brake: false };
  }

  update(delta) {
    if (!this.active || !this.vehicle) return;

    // Throttle / Brake
    if (this.keys.forward) {
      this.speed = Math.min(this.speed + ACCELERATION * delta, MAX_SPEED);
    } else if (this.keys.backward) {
      this.speed = Math.max(this.speed - ACCELERATION * delta, -MAX_SPEED * 0.3);
    } else {
      // Friction
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - FRICTION * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + FRICTION * delta);
      }
    }

    if (this.keys.brake) {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - BRAKE_FORCE * delta);
      else if (this.speed < 0) this.speed = Math.min(0, this.speed + BRAKE_FORCE * delta);
    }

    // Steering
    if (Math.abs(this.speed) > 0.5) {
      const turnFactor = Math.min(Math.abs(this.speed) / 10, 1);
      if (this.keys.left) this.chassisRotation += TURN_SPEED * turnFactor * delta;
      if (this.keys.right) this.chassisRotation -= TURN_SPEED * turnFactor * delta;
    }

    // Move vehicle
    const moveX = Math.sin(this.chassisRotation) * this.speed * delta;
    const moveZ = Math.cos(this.chassisRotation) * this.speed * delta;

    this.vehicle.model.position.x += moveX;
    this.vehicle.model.position.z += moveZ;
    this.vehicle.model.rotation.y = this.chassisRotation;

    // Update center for interaction system
    this.vehicle.center.copy(this.vehicle.model.position);
    this.vehicle.center.y += this.vehicle.size.y / 2;

    // Chase camera
    const idealOffset = new THREE.Vector3(
      -Math.sin(this.chassisRotation) * CHASE_DISTANCE,
      CHASE_HEIGHT,
      -Math.cos(this.chassisRotation) * CHASE_DISTANCE
    );
    const idealTarget = this.vehicle.model.position.clone().add(idealOffset);
    const idealLookAt = this.vehicle.model.position.clone();
    idealLookAt.y += 1;

    this.chaseTarget.lerp(idealTarget, CHASE_SMOOTH * delta);
    this.chaseLookAt.lerp(idealLookAt, CHASE_SMOOTH * delta);

    this.camera.position.copy(this.chaseTarget);
    this.camera.lookAt(this.chaseLookAt);
  }
}
