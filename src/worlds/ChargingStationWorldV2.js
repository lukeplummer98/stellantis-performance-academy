/**
 * ChargingStationWorldV2 — EV Charging demo scene with realtime rope physics.
 *
 * v2 improvements over v1:
 *  - Flexi-charging cable uses Verlet integration (position-based dynamics)
 *  - Cable sags and drapes realistically under gravity while you drag the handle
 *  - N_NODES particles form the rope; distance constraints keep them spaced evenly
 *  - The rope root is anchored at the post; the tip follows the handle grip
 *  - On snap-to-port the live rope freezes into the final connected shape
 *
 * Physics approach:
 *   Each node stores current + previous position. Each update:
 *   1. Apply gravity (verlet integration)
 *   2. Enforce distance constraints (N iterations for stiffness)
 *   3. Clamp the root node in place
 *   4. Clamp the tip node to the handle position
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WorldId } from './WorldManager.js';
import { ChargingStationWorld } from './ChargingStationWorld.js';

// ── Rope tuning ────────────────────────────────────────────────
const N_NODES         = 28;      // number of rope particles
const ROPE_REST_LEN   = 0.18;    // natural distance between neighbours (m)
const GRAVITY         = -9.0;    // m/s²
const CONSTRAINT_ITER = 18;      // solver iterations per frame (more = stiffer)
const DAMPING         = 0.985;   // velocity damping (1=no loss, 0=instant stop)
const ROPE_RADIUS     = 0.028;   // visual tube radius (m)
const GLOW_RADIUS     = 0.008;   // inner glow strand radius

export class ChargingStationWorldV2 extends ChargingStationWorld {
  constructor(scene, camera) {
    super(scene, camera);
    this.group.name = 'world-charging-v2';

    // Override: rope physics state
    this._ropeNodes     = [];      // Array<{ pos: Vector3, prev: Vector3 }>
    this._ropeRestLen   = ROPE_REST_LEN;
    this._ropeMesh      = null;
    this._ropeGlowMesh  = null;
    this._ropeActive    = false;   // rope only simulates during drag / pre-snap

    // Override cable creation — we use live rope instead of static TubeGeometry
    this._useRope = true;
  }

  // ── Override build to also init rope ─────────────────────────

  build() {
    super.build();
    this._initRope();
  }

  // ── Rope Initialisation ───────────────────────────────────────

  _initRope() {
    // Create N_NODES particles hanging from the post holster
    const rootPos = new THREE.Vector3(4.5 + 0.22, 1.25, 5);  // holster resting position

    this._ropeNodes = [];
    for (let i = 0; i < N_NODES; i++) {
      const t = i / (N_NODES - 1);
      // Initially hang straight down in a slight arc
      const pos = new THREE.Vector3(
        rootPos.x,
        rootPos.y - t * (N_NODES - 1) * ROPE_REST_LEN * 0.5,
        rootPos.z
      );
      this._ropeNodes.push({ pos: pos.clone(), prev: pos.clone() });
    }

    // Pre-build tube geometry buffers (will be updated every frame)
    this._buildRopeMeshes();
    this._ropeActive = false;
  }

  _buildRopeMeshes() {
    // Build with N_NODES as-is; will regenerate geometry in update
    const pts = this._ropeNodes.map((n) => n.pos.clone());
    const curve = new THREE.CatmullRomCurve3(pts);

    const tubeGeo = new THREE.TubeGeometry(curve, (N_NODES - 1) * 2, ROPE_RADIUS, 8, false);
    this._ropeMesh = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({
      color: 0x080808, roughness: 0.75,
    }));
    this._ropeMesh.visible = false;
    this.group.add(this._ropeMesh);

    const glowTubeGeo = new THREE.TubeGeometry(curve, (N_NODES - 1) * 2, GLOW_RADIUS, 6, false);
    this._ropeGlowMesh = new THREE.Mesh(glowTubeGeo, new THREE.MeshStandardMaterial({
      color: 0x0088ff, emissive: 0x0044ff, emissiveIntensity: 3,
      transparent: true, opacity: 0.85,
    }));
    this._ropeGlowMesh.visible = false;
    this.group.add(this._ropeGlowMesh);
  }

  // ── Physics Update ────────────────────────────────────────────

  _updateRopePhysics(delta, rootPos, tipPos) {
    const dt = Math.min(delta, 0.025); // cap sub-step

    // 1. Verlet integration (apply gravity)
    for (let i = 0; i < this._ropeNodes.length; i++) {
      const n = this._ropeNodes[i];
      const vel = n.pos.clone().sub(n.prev);
      vel.multiplyScalar(DAMPING);
      n.prev.copy(n.pos);
      n.pos.add(vel);
      n.pos.y += GRAVITY * dt * dt;
    }

    // 2. Constraint relaxation
    const restLen = this._ropeRestLen;
    for (let iter = 0; iter < CONSTRAINT_ITER; iter++) {
      for (let i = 0; i < this._ropeNodes.length - 1; i++) {
        const a = this._ropeNodes[i];
        const b = this._ropeNodes[i + 1];

        const delta3 = b.pos.clone().sub(a.pos);
        const dist = delta3.length();
        if (dist < 0.0001) continue;
        const correction = delta3.multiplyScalar((dist - restLen) / dist);

        // Both interior nodes move equally; endpoints are pinned
        const pinA = (i === 0);
        const pinB = (i === this._ropeNodes.length - 2);

        if (!pinA && !pinB) {
          a.pos.addScaledVector(correction,  0.5);
          b.pos.addScaledVector(correction, -0.5);
        } else if (pinA) {
          b.pos.addScaledVector(correction, -1.0);
        } else if (pinB) {
          a.pos.addScaledVector(correction,  1.0);
        }
      }

      // 3. Pin root and tip each iteration
      this._ropeNodes[0].pos.copy(rootPos);
      this._ropeNodes[0].prev.copy(rootPos);
      this._ropeNodes[N_NODES - 1].pos.copy(tipPos);
      this._ropeNodes[N_NODES - 1].prev.copy(tipPos);
    }
  }

  _rebuildRopeGeometry() {
    const pts = this._ropeNodes.map((n) => n.pos.clone());

    // Rebuild curve and regenerate tube geometry
    const curve = new THREE.CatmullRomCurve3(pts);
    const segs = (N_NODES - 1) * 2;

    if (this._ropeMesh) {
      this._ropeMesh.geometry.dispose();
      this._ropeMesh.geometry = new THREE.TubeGeometry(curve, segs, ROPE_RADIUS, 8, false);
    }
    if (this._ropeGlowMesh) {
      this._ropeGlowMesh.geometry.dispose();
      this._ropeGlowMesh.geometry = new THREE.TubeGeometry(curve, segs, GLOW_RADIUS, 6, false);
    }
  }

  // ── Override parent drag handlers to activate rope ────────────

  _onMouseDownDrag(e) {
    super._onMouseDownDrag(e);
    if (this._dragActive) {
      // Wake up the rope — reset nodes from a hanging state
      this._activateRope();
    }
  }

  _onMouseUpDrag(e) {
    super._onMouseUpDrag(e);
    // If not snapped (returned to rack), hide rope
    if (!this._handleLifted || this.state === 'idle') {
      setTimeout(() => {
        if (this.state === 'idle') {
          this._ropeActive = false;
          if (this._ropeMesh)     this._ropeMesh.visible     = false;
          if (this._ropeGlowMesh) this._ropeGlowMesh.visible = false;
        }
      }, 300);
    }
  }

  _activateRope() {
    this._ropeActive = true;
    if (this._ropeMesh)     this._ropeMesh.visible     = true;
    if (this._ropeGlowMesh) this._ropeGlowMesh.visible = true;

    // Reset prev positions to current to kill any accumulated velocity
    for (const n of this._ropeNodes) {
      n.prev.copy(n.pos);
    }
  }

  // ── Override parent _createCable to use rope mesh ─────────────

  _createCable(vehiclePos) {
    // Do NOT call super._createCable — we already have the rope mesh
    if (!vehiclePos) return;

    const carEnd = vehiclePos.clone();
    carEnd.x += 1.58;
    carEnd.y = 0.55;

    // Freeze rope into connected pose (no more physics)
    this._ropeActive = false;

    // Bake the last simulated rope shape into permanent meshes
    if (this._ropeMesh)     this._ropeMesh.visible     = true;
    if (this._ropeGlowMesh) this._ropeGlowMesh.visible = true;

    // Animate glow strand for charging effect
    if (this._ropeGlowMesh) {
      this._ropeGlowMesh.material.emissiveIntensity = 3;
    }

    // Port indicator
    const portMat = new THREE.MeshStandardMaterial({
      color: 0x00aaff, emissive: 0x0066ff, emissiveIntensity: 4,
    });
    this.portIndicator = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), portMat);
    this.portIndicator.position.copy(carEnd);
    this.group.add(this.portIndicator);

    // Dynamic light
    this.chargeLight = new THREE.PointLight(0x0088ff, 2.5, 3);
    this.chargeLight.position.copy(carEnd);
    this.group.add(this.chargeLight);
  }

  _removeCable() {
    // Hide rope meshes instead of disposing (they persist for re-use)
    if (this._ropeMesh)     this._ropeMesh.visible     = false;
    if (this._ropeGlowMesh) this._ropeGlowMesh.visible = false;
    this._ropeActive = false;

    if (this.portIndicator) { this.group.remove(this.portIndicator); this.portIndicator = null; }
    if (this.chargeLight)   { this.group.remove(this.chargeLight);   this.chargeLight   = null; }
    this.cable = null; this.cableGlow = null; this.cableCurve = null;
  }

  // ── Override update to simulate rope ─────────────────────────

  update(delta, vehiclePos, vehicleSpeed) {
    // Run parent update (handles handle animation, drag, charging state, particles, etc.)
    super.update(delta, vehiclePos, vehicleSpeed);

    // Rope physics: only simulate when dragging or freshly connected
    if (this._dragActive || this._ropeActive) {
      const rootPos = new THREE.Vector3(4.5 + 0.22, 1.25, 5);  // rack anchor
      const tipPos  = this.chargerHandle.position.clone();       // handle follows drag

      this._updateRopePhysics(delta, rootPos, tipPos);
      this._rebuildRopeGeometry();

      if (this._ropeMesh)     this._ropeMesh.visible     = true;
      if (this._ropeGlowMesh) this._ropeGlowMesh.visible = true;
    }

    // Charging glow animation on rope
    if (this.state === 'charging' && this._ropeGlowMesh) {
      const t = Date.now() * 0.001;
      this._ropeGlowMesh.material.opacity = 0.6 + Math.sin(t * 8) * 0.25;
      this._ropeGlowMesh.material.emissiveIntensity = 2 + Math.sin(t * 6) * 1.5;
    }
  }

  // ── World identification ──────────────────────────────────────

  getPortalPositions() {
    return super.getPortalPositions();
  }

  // ── Dispose ──────────────────────────────────────────────────

  dispose() {
    super.dispose();
    if (this._ropeMesh) {
      this.group.remove(this._ropeMesh);
      this._ropeMesh.geometry.dispose();
      this._ropeMesh.material.dispose();
    }
    if (this._ropeGlowMesh) {
      this.group.remove(this._ropeGlowMesh);
      this._ropeGlowMesh.geometry.dispose();
      this._ropeGlowMesh.material.dispose();
    }
  }
}
