/**
 * ADASSystem — Advanced Driver-Assistance Systems simulation.
 * 
 * Features:
 *   - AEB (Autonomous Emergency Braking)  — Detects obstacles ahead, warns, then brakes
 *   - Parking Sensors                      — Rear distance beeping for reverse parking
 *   - Forward Collision Warning (FCW)      — Visual + audio warning before AEB triggers
 *   - Speed Limit Indicator                — Displays current world speed limit
 *   - Lane Departure Warning (visual)      — Warns when leaving road surface
 * 
 * The system reads obstacle data from the current world's getScenarioState()
 * and applies braking / warnings through the DriveSystem.
 */
import * as THREE from 'three';

// AEB thresholds
const AEB_WARNING_TIME = 2.0; // seconds to collision for warning
const AEB_BRAKE_TIME = 1.2;   // seconds to collision for auto-brake
const AEB_BRAKE_FORCE = 40;   // deceleration when AEB fires (m/s²)
const AEB_MIN_SPEED = 2;      // don't trigger below this speed

// Parking sensor thresholds (meters)
const PARK_ZONES = [
  { distance: 0.5, label: 'DANGER', color: 0xff0000, beepRate: 50 },
  { distance: 1.0, label: 'VERY CLOSE', color: 0xff4400, beepRate: 150 },
  { distance: 1.5, label: 'CLOSE', color: 0xff8800, beepRate: 300 },
  { distance: 2.5, label: 'NEAR', color: 0xffcc00, beepRate: 500 },
  { distance: 4.0, label: 'DETECTED', color: 0x88ff00, beepRate: 800 },
];

export class ADASSystem {
  constructor() {
    this.enabled = true;

    // AEB state
    this.aebState = 'idle'; // 'idle' | 'warning' | 'braking' | 'stopped'
    this.timeToCollision = Infinity;
    this.closestObstacle = null;
    this.closestObstacleDistance = Infinity;

    // Parking sensor state
    this.parkingDistances = {
      rearLeft: Infinity,
      rearCenter: Infinity,
      rearRight: Infinity,
      frontLeft: Infinity,
      frontCenter: Infinity,
      frontRight: Infinity,
    };
    this.parkingZone = null;

    // Beep timing
    this._beepTimer = 0;
    this._beepOn = false;

    // Audio context for beeps
    this._audioCtx = null;
    this._initAudio();

    // Speed display
    this.speedKmh = 0;
    this.speedLimit = 50; // default

    // Event callbacks
    this.onAEBWarning = null;
    this.onAEBBrake = null;
    this.onAEBClear = null;
    this.onParkingSensor = null;
  }

  _initAudio() {
    // Defer audio context creation until first user interaction
    const initOnClick = () => {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      document.removeEventListener('click', initOnClick);
      document.removeEventListener('keydown', initOnClick);
    };
    document.addEventListener('click', initOnClick);
    document.addEventListener('keydown', initOnClick);
  }

  _beep(frequency = 800, duration = 80) {
    if (!this._audioCtx) return;
    try {
      const osc = this._audioCtx.createOscillator();
      const gain = this._audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this._audioCtx.destination);
      osc.frequency.value = frequency;
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(this._audioCtx.currentTime + duration / 1000);
    } catch (e) {
      // Audio not available
    }
  }

  /**
   * Main update — call every frame with vehicle + world data.
   * @param {number} delta
   * @param {Object} driveSystem — ref to DriveSystem for reading/modifying speed
   * @param {Object} scenarioState — from WorldManager.getScenarioState()
   * @param {THREE.Vector3} vehiclePos
   * @param {number} vehicleRotation — Y rotation in radians
   */
  update(delta, driveSystem, scenarioState, vehiclePos, vehicleRotation) {
    if (!this.enabled || !driveSystem || !driveSystem.active) return;

    const speed = driveSystem.speed;
    this.speedKmh = Math.abs(speed) * 2.237; // m/s to mph

    if (!scenarioState || !vehiclePos) return;

    const obstacles = scenarioState.obstacles || [];

    // Forward direction based on vehicle rotation
    const forwardDir = new THREE.Vector3(
      Math.sin(vehicleRotation),
      0,
      Math.cos(vehicleRotation)
    );
    const rightDir = new THREE.Vector3(
      Math.cos(vehicleRotation),
      0,
      -Math.sin(vehicleRotation)
    );

    // ── AEB: Check obstacles ahead ──
    this._updateAEB(delta, driveSystem, obstacles, vehiclePos, forwardDir, speed);

    // ── Parking Sensors: Check nearby obstacles in all directions ──
    this._updateParkingSensors(delta, obstacles, vehiclePos, forwardDir, rightDir, speed);
  }

  _updateAEB(delta, driveSystem, obstacles, vehiclePos, forwardDir, speed) {
    if (Math.abs(speed) < AEB_MIN_SPEED) {
      if (this.aebState !== 'idle') {
        this.aebState = 'idle';
        if (this.onAEBClear) this.onAEBClear();
      }
      this.timeToCollision = Infinity;
      return;
    }

    let closestDist = Infinity;
    let closestObs = null;

    obstacles.forEach((obs) => {
      const obsPos = obs.getPosition();
      const toObs = obsPos.clone().sub(vehiclePos);
      
      // Project onto forward direction
      const forwardDist = toObs.dot(forwardDir);
      
      // Only care about obstacles ahead (positive forward distance)
      if (forwardDist < 0 || forwardDist > 50) return;

      // Lateral distance check — is it in our lane?
      const lateralDist = Math.abs(toObs.dot(new THREE.Vector3(-forwardDir.z, 0, forwardDir.x)));
      const obsSize = obs.getSize();
      const laneWidth = 2 + obsSize.x / 2; // vehicle half-width + obs half-width

      if (lateralDist > laneWidth) return;

      if (forwardDist < closestDist) {
        closestDist = forwardDist;
        closestObs = obs;
      }
    });

    this.closestObstacle = closestObs;
    this.closestObstacleDistance = closestDist;

    if (closestObs && speed > AEB_MIN_SPEED) {
      this.timeToCollision = closestDist / speed;

      if (this.timeToCollision < AEB_BRAKE_TIME) {
        // AUTO BRAKE
        if (this.aebState !== 'braking') {
          this.aebState = 'braking';
          console.log('[ADAS] AEB BRAKING!');
          this._beep(1200, 500);
          if (this.onAEBBrake) this.onAEBBrake();
        }
        // Apply emergency braking
        driveSystem.speed = Math.max(0, driveSystem.speed - AEB_BRAKE_FORCE * delta);
        if (driveSystem.speed < 0.1) {
          driveSystem.speed = 0;
          this.aebState = 'stopped';
        }
      } else if (this.timeToCollision < AEB_WARNING_TIME) {
        // WARNING
        if (this.aebState !== 'warning') {
          this.aebState = 'warning';
          console.log('[ADAS] Forward collision warning!');
          this._beep(800, 200);
          if (this.onAEBWarning) this.onAEBWarning();
        }
      } else {
        if (this.aebState !== 'idle') {
          this.aebState = 'idle';
          if (this.onAEBClear) this.onAEBClear();
        }
      }
    } else {
      this.timeToCollision = Infinity;
      if (this.aebState !== 'idle') {
        this.aebState = 'idle';
        if (this.onAEBClear) this.onAEBClear();
      }
    }
  }

  _updateParkingSensors(delta, obstacles, vehiclePos, forwardDir, rightDir, speed) {
    // Only active at low speed or reversing
    if (Math.abs(speed) > 8) {
      this.parkingZone = null;
      return;
    }

    const rearDir = forwardDir.clone().negate();

    // Sensor positions (relative to vehicle center)
    const sensorDefs = [
      { key: 'rearLeft', dir: rearDir.clone().add(rightDir.clone().multiplyScalar(-0.4)).normalize(), label: 'RL' },
      { key: 'rearCenter', dir: rearDir, label: 'RC' },
      { key: 'rearRight', dir: rearDir.clone().add(rightDir.clone().multiplyScalar(0.4)).normalize(), label: 'RR' },
      { key: 'frontLeft', dir: forwardDir.clone().add(rightDir.clone().multiplyScalar(-0.4)).normalize(), label: 'FL' },
      { key: 'frontCenter', dir: forwardDir, label: 'FC' },
      { key: 'frontRight', dir: forwardDir.clone().add(rightDir.clone().multiplyScalar(0.4)).normalize(), label: 'FR' },
    ];

    let closestDist = Infinity;

    sensorDefs.forEach((sensor) => {
      let minDist = Infinity;
      obstacles.forEach((obs) => {
        const obsPos = obs.getPosition();
        const toObs = obsPos.clone().sub(vehiclePos);
        const dist = toObs.dot(sensor.dir);
        if (dist > 0 && dist < 5) {
          const lateral = Math.abs(toObs.length() - dist);
          if (lateral < 1.5) {
            minDist = Math.min(minDist, dist);
          }
        }
      });
      this.parkingDistances[sensor.key] = minDist;
      closestDist = Math.min(closestDist, minDist);
    });

    // Determine zone from closest distance
    this.parkingZone = null;
    for (const zone of PARK_ZONES) {
      if (closestDist <= zone.distance) {
        this.parkingZone = zone;
        break;
      }
    }

    // Beep at rate based on proximity
    if (this.parkingZone) {
      this._beepTimer += delta * 1000;
      if (this._beepTimer >= this.parkingZone.beepRate) {
        this._beepTimer = 0;
        this._beep(600 + (4 - PARK_ZONES.indexOf(this.parkingZone)) * 200, 60);
      }
    }
  }

  /**
   * Get current state for HUD rendering.
   */
  getHUDState() {
    return {
      speedMph: this.speedKmh,
      speedLimit: this.speedLimit,
      aebState: this.aebState,
      timeToCollision: this.timeToCollision,
      closestObstacleDistance: this.closestObstacleDistance,
      parkingDistances: { ...this.parkingDistances },
      parkingZone: this.parkingZone,
    };
  }

  setSpeedLimit(limit) {
    this.speedLimit = limit;
  }

  reset() {
    this.aebState = 'idle';
    this.timeToCollision = Infinity;
    this.closestObstacle = null;
    this.closestObstacleDistance = Infinity;
    this.parkingZone = null;
    Object.keys(this.parkingDistances).forEach((k) => {
      this.parkingDistances[k] = Infinity;
    });
  }
}
