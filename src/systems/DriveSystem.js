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
const CHASE_SMOOTH = 6;
const WHEEL_RADIUS = 0.35; // approximate tire radius in meters
const VISUAL_SPIN_SCALE = 0.3; // dampen visual spin so spokes stay visible
const MAX_STEER_ANGLE = 0.5; // max front wheel turn angle in radians
const STEER_RETURN_SPEED = 4; // how fast wheels straighten
const ORBIT_SENSITIVITY = 0.003; // mouse orbit sensitivity while driving

export const CamMode = { CHASE: 'CHASE', HOOD: 'HOOD', CINEMATIC: 'CINEMATIC' };
const CAM_MODES = [CamMode.CHASE, CamMode.HOOD, CamMode.CINEMATIC];

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

    // Camera modes
    this.camModeIndex = 0;
    this.camMode = CamMode.CHASE;
    this.cinematicAngle = 0;
    this.cinematicRadius = 10;
    this.cinematicHeight = 2.5;
    this.cinematicTarget = new THREE.Vector3();
    this.cinematicLookAt = new THREE.Vector3();

    // Camera right-click drag yaw
    this.cameraYawOffset = 0;
    this._mouseDragging = false;
    this._lastMouseX = 0;

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

    window.addEventListener('cam-cycle', () => this.cycleCamMode());
    document.addEventListener('mousedown',    (e) => this._onMouseDown(e));
    document.addEventListener('mousemove',    (e) => this._onMouseMove(e));
    document.addEventListener('mouseup',      (e) => this._onMouseUp(e));
    document.addEventListener('contextmenu',  (e) => { if (this.active) e.preventDefault(); });
  }

  cycleCamMode() {
    this.camModeIndex = (this.camModeIndex + 1) % CAM_MODES.length;
    this.camMode = CAM_MODES[this.camModeIndex];
    window.dispatchEvent(new CustomEvent('cam-mode-changed', { detail: { mode: this.camMode } }));
  }

  _onKey(event, pressed) {
    if (!this.active) return;
    switch (event.code) {
      case 'KeyW': case 'ArrowUp': this.keys.forward = pressed; break;
      case 'KeyS': case 'ArrowDown': this.keys.backward = pressed; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = pressed; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = pressed; break;
      case 'Space': this.keys.brake = pressed; break;
      case 'KeyV': if (pressed) this.cycleCamMode(); break;
    }
  }

  _onMouseDown(e) {
    if (!this.active || this.camMode !== CamMode.CHASE) return;
    if (e.button === 2) {
      e.preventDefault();
      this._mouseDragging = true;
      this._lastMouseX = e.clientX;
    }
  }

  _onMouseMove(e) {
    if (!this._mouseDragging) return;
    const dx = e.clientX - this._lastMouseX;
    this._lastMouseX = e.clientX;
    this.cameraYawOffset -= dx * 0.006;
    this.cameraYawOffset = Math.max(-Math.PI * 0.85, Math.min(Math.PI * 0.85, this.cameraYawOffset));
  }

  _onMouseUp(e) {
    if (e.button === 2) this._mouseDragging = false;
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

    this.camModeIndex = 0;
    this.camMode = CamMode.CHASE;
    this.cinematicAngle = 0;

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

    // ── Camera modes ──────────────────────────────────────────────
    // Clamp delta to 50ms max so a single heavy frame can't snap the camera
    const camDelta = Math.min(delta, 0.05);
    const pos = this.vehicle.model.position;

    if (this.camMode === CamMode.CHASE) {
      // Spring yaw back to centre when not dragging
      if (!this._mouseDragging) {
        this.cameraYawOffset *= Math.pow(0.005, camDelta);
      }
      // Chase camera with optional right-click yaw offset
      const camYaw = this.chassisRotation + this.cameraYawOffset;
      const idealOffset = new THREE.Vector3(
        -Math.sin(camYaw) * CHASE_DISTANCE,
        CHASE_HEIGHT,
        -Math.cos(camYaw) * CHASE_DISTANCE
      );
      const idealTarget = pos.clone().add(idealOffset);
      const idealLookAt = pos.clone();
      idealLookAt.y += 1;

      const t = 1 - Math.exp(-CHASE_SMOOTH * camDelta);
      this.chaseTarget.lerp(idealTarget, t);
      this.chaseLookAt.lerp(idealLookAt, t);

      this.camera.position.copy(this.chaseTarget);
      this.camera.lookAt(this.chaseLookAt);

    } else if (this.camMode === CamMode.HOOD) {
      // Hood / bonnet cam — sits on the front of the car looking forward
      const forward = new THREE.Vector3(Math.sin(this.chassisRotation), 0, Math.cos(this.chassisRotation));
      const hoodPos = pos.clone()
        .addScaledVector(forward, 1.8)   // push to front
        .add(new THREE.Vector3(0, 1.05, 0));  // hood height
      const lookAhead = hoodPos.clone().addScaledVector(forward, 30);
      lookAhead.y = hoodPos.y - 0.2;

      const ht = 1 - Math.exp(-CHASE_SMOOTH * camDelta);
      this.camera.position.lerp(hoodPos, ht);
      this.chaseLookAt.lerp(lookAhead, ht);
      this.camera.lookAt(this.chaseLookAt);

    } else if (this.camMode === CamMode.CINEMATIC) {
      // Slowly orbiting dramatic cinematic camera
      this.cinematicAngle += 0.25 * delta;

      // Vary radius and height with a slow sine for drama
      const r = 11 + Math.sin(this.cinematicAngle * 0.6) * 3;
      const h = 1.8 + Math.sin(this.cinematicAngle * 0.4) * 1.2;

      const cx = pos.x + Math.sin(this.cinematicAngle) * r;
      const cz = pos.z + Math.cos(this.cinematicAngle) * r;
      const idealCinematic = new THREE.Vector3(cx, pos.y + h, cz);
      const idealLookAt = pos.clone().add(new THREE.Vector3(0, 0.8, 0));

      this.cinematicTarget.lerp(idealCinematic, 4 * delta);
      this.cinematicLookAt.lerp(idealLookAt, 6 * delta);

      this.camera.position.copy(this.cinematicTarget);
      this.camera.lookAt(this.cinematicLookAt);
    }
  }
}
