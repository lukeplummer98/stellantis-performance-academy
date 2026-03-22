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
const CHASE_DISTANCE = 5.5;
const CHASE_HEIGHT = 2.2;
const CHASE_SMOOTH = 3;
const WHEEL_RADIUS = 0.35; // approximate tire radius in meters
const VISUAL_SPIN_SCALE = 0.3; // dampen visual spin so spokes stay visible
const MAX_STEER_ANGLE = 0.5; // max front wheel turn angle in radians
const STEER_RETURN_SPEED = 4; // how fast wheels straighten
const ORBIT_SENSITIVITY = 0.003; // mouse orbit sensitivity while driving

export class DriveSystem {
  constructor(camera) {
    this.camera = camera;
    this.active = false;
    this.vehicle = null;

    this.speed = 0;
    this.steerAngle = 0;
    this.frontWheelAngle = 0;
    this.chassisRotation = 0;
    this.wheelSpinAngle = 0; // accumulated wheel spin

    // Camera orbit around vehicle while driving
    this.orbitYaw = 0;   // horizontal orbit offset (radians)
    this.orbitPitch = 0;  // vertical orbit offset (radians)

    this.keys = { forward: false, backward: false, left: false, right: false, brake: false };
    this.chaseTarget = new THREE.Vector3();
    this.chaseLookAt = new THREE.Vector3();

    // Store original wheel quaternions for wobble-free rotation
    this.wheelOriginalQuats = new Map();

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

    // Mouse orbit while driving
    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      this.orbitYaw -= e.movementX * ORBIT_SENSITIVITY;
      this.orbitPitch -= e.movementY * ORBIT_SENSITIVITY;
      this.orbitPitch = Math.max(-0.5, Math.min(0.8, this.orbitPitch));
    });
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
    this.wheelSpinAngle = 0;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.chassisRotation = this.vehicle.model.rotation.y;
    this.chaseTarget.copy(this.camera.position);

    // Cache original wheel quaternions for proper rotation
    this.wheelOriginalQuats.clear();
    const w = this.vehicle.wheels;
    if (w) {
      console.log('[DriveSystem] Started with wheels:', {
        fl: w.fl?.name || 'NOT FOUND',
        fr: w.fr?.name || 'NOT FOUND',
        rl: w.rl?.name || 'NOT FOUND',
        rr: w.rr?.name || 'NOT FOUND',
      });
      for (const wheel of w.all) {
        this.wheelOriginalQuats.set(wheel, wheel.quaternion.clone());
      }
    }
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

    // Rotate wheels
    const w = this.vehicle.wheels;
    if (w && w.all.length > 0) {
      const angularVelocity = (this.speed / WHEEL_RADIUS) * VISUAL_SPIN_SCALE;
      this.wheelSpinAngle += angularVelocity * delta;

      // Front wheel steering angle
      let targetSteer = 0;
      if (this.keys.left) targetSteer = MAX_STEER_ANGLE;
      else if (this.keys.right) targetSteer = -MAX_STEER_ANGLE;
      this.frontWheelAngle += (targetSteer - this.frontWheelAngle) * Math.min(STEER_RETURN_SPEED * delta, 1);

      // Use quaternions to avoid Euler wobble issues
      const spinQuat = new THREE.Quaternion();
      const steerQuat = new THREE.Quaternion();
      const xAxis = new THREE.Vector3(1, 0, 0);
      const yAxis = new THREE.Vector3(0, 1, 0);
      spinQuat.setFromAxisAngle(xAxis, this.wheelSpinAngle);
      steerQuat.setFromAxisAngle(yAxis, this.frontWheelAngle);

      // Apply to each named wheel directly
      const applyWheel = (wheel, steer) => {
        if (!wheel) return;
        const origQuat = this.wheelOriginalQuats.get(wheel);
        if (!origQuat) return;
        if (steer) {
          wheel.quaternion.copy(origQuat).multiply(steerQuat).multiply(spinQuat);
        } else {
          wheel.quaternion.copy(origQuat).multiply(spinQuat);
        }
      };

      applyWheel(w.fl, true);   // front left — spin + steer
      applyWheel(w.fr, true);   // front right — spin + steer
      applyWheel(w.rl, false);  // rear left — spin only
      applyWheel(w.rr, false);  // rear right — spin only
    }

    // Chase camera with mouse orbit support
    const camAngle = this.chassisRotation + Math.PI + this.orbitYaw;
    const camPitch = this.orbitPitch;
    const idealOffset = new THREE.Vector3(
      Math.sin(camAngle) * CHASE_DISTANCE * Math.cos(camPitch),
      CHASE_HEIGHT + Math.sin(camPitch) * CHASE_DISTANCE,
      Math.cos(camAngle) * CHASE_DISTANCE * Math.cos(camPitch)
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
