/**
 * ChargingStationWorld — EV Charging demo scene.
 *
 * Scenario:
 *  1. Drive into the marked charging bay
 *  2. Press E to lift the charger off the rack
 *  3. Cable animates connecting to the car's charge port
 *  4. Electric particles flow along the cable to the battery
 *  5. Battery fills to 100% — press E to disconnect
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { WorldId } from './WorldManager.js';

const POST_X           = 4.5;
const POST_Z           = 5;
const HANDLE_RESTING   = new THREE.Vector3(POST_X + 0.22, 1.25, POST_Z);
const HANDLE_LIFTED    = new THREE.Vector3(POST_X,        1.85, POST_Z);
const CHARGE_PORT_DX   = 1.58;   // metres right of vehicle centre
const CHARGE_PORT_DY   = 0.55;   // metres above ground
const INTERACT_RANGE   = 7;      // metres from post
const BATTERY_START    = 12;     // %
const BATTERY_FILL_SEC = 10;     // seconds to go 0 → 100 %

export class ChargingStationWorld {
  constructor(scene, camera = null) {
    this.scene = scene;
    this._camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'world-charging';

    this.spawnPosition = new THREE.Vector3(0, 0, 40);
    this.spawnRotation = Math.PI;

    this.fogColor = 0x080810;
    this.skyColor = 0x080810;
    this.fogNear  = 30;
    this.fogFar   = 150;

    // Scenario state
    this.state        = 'idle';   // idle | charging | complete
    this.batteryLevel = BATTERY_START;
    this.chargeTimer  = 0;
    this.nearCharger  = false;
    this._vehiclePos  = new THREE.Vector3();

    // Animation
    this._handleLifted = false;
    this._handleAnimT  = 0;

    // Three.js refs
    this.chargerHandle = null;
    this.cable         = null;
    this.cableGlow     = null;
    this.cableCurve    = null;
    this.portIndicator = null;
    this.chargeLight   = null;
    this.particles     = [];

    // Editable scene objects (exposed to EditModeSystem)
    this._editableGroups = new Map();

    this.obstacles = [];

    // Drag-to-connect state
    this._raycaster       = new THREE.Raycaster();
    this._dragActive      = false;
    this._dragTarget      = new THREE.Vector3(POST_X, 1.3, POST_Z);
    this._dragPlane       = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.3);
    this._handleMeshes    = [];
    this._snapIndicator   = null;
    this._previewLine     = null;
    this._snapRange       = 1.8;

    this._keyHandler       = (e) => this._onKey(e);
    this._mouseDownHandler = (e) => this._onMouseDownDrag(e);
    this._mouseMoveHandler = (e) => this._onMouseMoveDrag(e);
    this._mouseUpHandler   = (e) => this._onMouseUpDrag(e);
    document.addEventListener('keydown',   this._keyHandler);
    document.addEventListener('mousedown', this._mouseDownHandler);
    document.addEventListener('mousemove', this._mouseMoveHandler);
    document.addEventListener('mouseup',   this._mouseUpHandler);
  }

  // ─────────────────────────── BUILD ────────────────────────────

  build() {
    this._buildGround();
    this._buildBay();
    this._buildChargerPost();
    this._buildCanopy();
    this._buildLighting();
    this._loadStationModel();
    // Collect handle meshes for raycasting — use only the invisible hitbox for a big click target
    if (this._hitboxMesh) {
      this._handleMeshes = [this._hitboxMesh];
    } else if (this.chargerHandle) {
      this.chargerHandle.traverse((c) => { if (c.isMesh) this._handleMeshes.push(c); });
    }
    this._buildSnapIndicator();

    // Register editable objects (station model registered async after GLB loads)
    this._editableGroups.set('Charger Post', this._postGroup);
    this._editableGroups.set('Charger Handle', this.chargerHandle);
    this._editableGroups.set('Canopy', this._canopyGroup);
  }

  _buildGround() {
    // Main tarmac pad
    const geo = new THREE.PlaneGeometry(100, 100);
    const mat = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, -5);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _buildBay() {
    const bx = 0, bz = POST_Z;
    const bw = 3.2, bd = 6;

    // Glowing bay line material
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 1.4,
    });

    const makeRect = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.01, z);
      this.group.add(m);
    };

    makeRect(0.07, bd, bx - bw / 2, bz);         // left edge
    makeRect(0.07, bd, bx + bw / 2, bz);         // right edge
    makeRect(bw,   0.07, bx, bz - bd / 2);       // back edge
    makeRect(bw,   0.07, bx, bz + bd / 2);       // front edge

    // EV lightning bolt on bay floor
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.font = 'bold 130px sans-serif';
    ctx.fillStyle = 'rgba(0,255,136,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', 128, 128);
    const evGeo = new THREE.PlaneGeometry(2.2, 2.2);
    const evMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true });
    const evMesh = new THREE.Mesh(evGeo, evMat);
    evMesh.rotation.x = -Math.PI / 2;
    evMesh.position.set(bx, 0.02, bz);
    this.group.add(evMesh);

    // Drive-in arrow markings
    for (let i = 0; i < 3; i++) {
      const ac = document.createElement('canvas');
      ac.width = 128; ac.height = 200;
      const actx = ac.getContext('2d');
      actx.clearRect(0, 0, 128, 200);
      actx.font = 'bold 90px sans-serif';
      actx.fillStyle = 'rgba(255,255,255,0.15)';
      actx.textAlign = 'center';
      actx.textBaseline = 'middle';
      actx.fillText('↑', 64, 100);
      const am = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.8),
        new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(ac), transparent: true })
      );
      am.rotation.x = -Math.PI / 2;
      am.position.set(bx, 0.015, bz + 12 + i * 6);
      this.group.add(am);
    }

    // Bay pulse light
    const glow = new THREE.PointLight(0x00ff88, 1.0, 8);
    glow.name = 'bay-glow';
    glow.position.set(bx, 0.2, bz);
    this.group.add(glow);
  }

  _buildChargerPost() {
    const px = POST_X, pz = POST_Z;

    // Group all post elements so they can be moved together in edit mode
    this._postGroup = new THREE.Group();
    this._postGroup.name = 'charger-post-group';
    this.group.add(this._postGroup);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.3, metalness: 0.9 });
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.8, 0.18), postMat);
    post.position.set(px, 0.9, pz);
    post.castShadow = true;
    this._postGroup.add(post);

    // Base plinth
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x222233, roughness: 0.6, metalness: 0.8 })
    );
    plinth.position.set(px, 0.04, pz);
    this._postGroup.add(plinth);

    // Glowing status strip (side)
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0x00aaff, emissive: 0x0055ff, emissiveIntensity: 2, roughness: 0.1,
    });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.02), stripMat);
    strip.name = 'status-strip';
    strip.position.set(px + 0.148, 0.9, pz);
    this._postGroup.add(strip);

    // Screen canvas
    const sc = document.createElement('canvas');
    sc.width = 256; sc.height = 384;
    const sctx = sc.getContext('2d');
    sctx.fillStyle = '#000d1a';
    sctx.fillRect(0, 0, 256, 384);
    sctx.fillStyle = '#00aaff';
    sctx.font = 'bold 22px monospace';
    sctx.textAlign = 'center';
    sctx.fillText('STELLANTIS', 128, 40);
    sctx.fillStyle = '#004488';
    sctx.fillRect(20, 55, 216, 2);
    sctx.fillStyle = '#88ccff';
    sctx.font = '16px monospace';
    sctx.fillText('EV CHARGING', 128, 80);
    sctx.fillStyle = '#00ff88';
    sctx.font = 'bold 32px monospace';
    sctx.fillText('⚡ READY', 128, 140);
    sctx.fillStyle = '#aaaaaa';
    sctx.font = '13px monospace';
    sctx.fillText('Park in bay nearby,', 128, 210);
    sctx.fillText('then  DRAG  hose', 128, 234);
    sctx.fillText('to charge port', 128, 257);
    sctx.fillStyle = '#446688';
    sctx.font = '11px monospace';
    sctx.fillText('(or press E)', 128, 284);
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.3),
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(sc),
        emissive: 0x002244,
        emissiveIntensity: 0.4,
      })
    );
    screenMesh.name = 'charger-screen';
    screenMesh.position.set(px - 0.15, 1.1, pz);
    screenMesh.rotation.y = Math.PI / 2;
    this._postGroup.add(screenMesh);

    // Holster slot
    const holster = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.05, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.9 })
    );
    holster.position.set(px + 0.22, HANDLE_RESTING.y - 0.08, pz);
    this._postGroup.add(holster);

    // ── CHARGER HANDLE GROUP ──
    const handleGroup = new THREE.Group();
    handleGroup.name = 'charger-handle';
    handleGroup.position.copy(HANDLE_RESTING);

    // Grip barrel
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, roughness: 0.35, metalness: 0.7 })
    );
    grip.rotation.z = Math.PI / 2;
    handleGroup.add(grip);

    // Trigger guard
    const guard = new THREE.Mesh(
      new THREE.TorusGeometry(0.04, 0.01, 6, 12, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.5, metalness: 0.6 })
    );
    guard.position.set(-0.01, -0.04, 0);
    guard.rotation.z = Math.PI / 2;
    handleGroup.add(guard);

    // Plug head (connector end)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.065, 0.048),
      new THREE.MeshStandardMaterial({
        color: 0x0055bb, emissive: 0x0033aa, emissiveIntensity: 0.9,
        roughness: 0.2, metalness: 0.6,
      })
    );
    head.position.set(0.135, 0, 0);
    handleGroup.add(head);

    // Connector pins
    for (let i = 0; i < 3; i++) {
      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.03, 6),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95 })
      );
      pin.rotation.z = Math.PI / 2;
      pin.position.set(0.165, (i - 1) * 0.018, 0);
      handleGroup.add(pin);
    }

    // Handle halo glow
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 0.15 });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 10), haloMat);
    halo.name = 'handle-halo';
    handleGroup.add(halo);

    this.group.add(handleGroup);
    this.chargerHandle = handleGroup;

    // Large invisible hitbox for easy clicking
    const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), hitboxMat);
    hitbox.name = 'charger-hitbox';
    handleGroup.add(hitbox);
    this._hitboxMesh = hitbox;

    // Cable reel (decorative)
    const reel = new THREE.Mesh(
      new THREE.TorusGeometry(0.11, 0.025, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.6, metalness: 0.5 })
    );
    reel.position.set(px + 0.1, 1.35, pz + 0.1);
    reel.rotation.y = Math.PI / 4;
    this._postGroup.add(reel);

    // Post top light
    const topLight = new THREE.PointLight(0x0088ff, 2.0, 6);
    topLight.position.set(px, 2.0, pz);
    this._postGroup.add(topLight);
  }

  _buildCanopy() {
    this._canopyGroup = new THREE.Group();
    this._canopyGroup.name = 'canopy-group';
    this.group.add(this._canopyGroup);

    // Flat roof canopy over the bay area
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x0c0c18, roughness: 0.5, metalness: 0.4 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 10), roofMat);
    roof.position.set(1.5, 4.8, 3);
    this._canopyGroup.add(roof);

    // Support columns
    const colMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2a, metalness: 0.8, roughness: 0.2 });
    const colGeo = new THREE.CylinderGeometry(0.07, 0.07, 4.8, 8);
    [[-5, -2], [8, -2], [-5, 8], [8, 8]].forEach(([x, z]) => {
      const col = new THREE.Mesh(colGeo, colMat);
      col.position.set(x, 2.4, z);
      col.castShadow = true;
      this._canopyGroup.add(col);
    });

    // LED strip emitters along canopy underside
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0xddeeFF, emissive: 0xaaccff, emissiveIntensity: 2,
    });
    for (let x = -4; x <= 7; x += 2.5) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.05), ledMat);
      strip.rotation.x = Math.PI / 2;
      strip.position.set(x, 4.73, 3);
      this._canopyGroup.add(strip);
    }
  }

  _buildLighting() {
    // Night ambient
    const ambient = new THREE.AmbientLight(0x0a0a20, 1.0);
    this.group.add(ambient);

    // Canopy downlights
    [[-2, 0], [2, 0], [-2, 6], [2, 6], [6, 3]].forEach(([x, z]) => {
      const l = new THREE.PointLight(0xcce0ff, 2, 14);
      l.position.set(x, 4.7, z);
      this.group.add(l);
    });

    // Charger area spotlight
    const spot = new THREE.SpotLight(0x2255ff, 4, 20, Math.PI / 6, 0.6, 1.5);
    spot.position.set(POST_X, 5, POST_Z);
    spot.target.position.set(0, 0, POST_Z);
    this.group.add(spot);
    this.group.add(spot.target);
  }

  _loadStationModel() {
    const loader = new GLTFLoader();
    loader.load('/StellantisElectricChargingStationv2.glb', (gltf) => {
      const model = gltf.scene;
      model.name = 'station-model';
      model.position.set(-12, 0, -20);
      model.scale.setScalar(0.7);
      model.rotation.y = Math.PI / 6;
      model.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = true;
          if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere();
          child.castShadow = child.geometry.boundingSphere.radius > 0.4;
        }
      });
      this.group.add(model);
      // Register once the GLB is loaded
      this._editableGroups.set('Station Model', model);
    }, undefined, (err) => {
      console.warn('[ChargingWorld] Station GLB failed to load:', err);
    });
  }

  // ─────────────────────────── SNAP INDICATOR ─────────────────

  _buildSnapIndicator() {
    const geo = new THREE.TorusGeometry(0.28, 0.025, 8, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0 });
    this._snapIndicator = new THREE.Mesh(geo, mat);
    this._snapIndicator.rotation.z = Math.PI / 2;
    this.group.add(this._snapIndicator);
  }

  _getPortPosition() {
    return new THREE.Vector3(
      this._vehiclePos.x + CHARGE_PORT_DX,
      CHARGE_PORT_DY,
      this._vehiclePos.z
    );
  }

  // ─────────────────────────── DRAG HANDLERS ───────────────────

  _onMouseDownDrag(e) {
    if (e.button !== 0) return;
    if (this.state !== 'idle' || !this._camera || !this.nearCharger) return;

    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth)  *  2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(mouse, this._camera);
    this._raycaster.firstHitOnly = true;
    const hits = this._raycaster.intersectObjects(this._handleMeshes, false);
    if (hits.length === 0) return;

    e.preventDefault();
    this._dragActive = true;
    this._dragTarget.copy(this.chargerHandle.position);
    this._dragPlane.constant = -this.chargerHandle.position.y;
    document.body.style.cursor = 'grabbing';
    this._createPreviewLine();
  }

  _onMouseMoveDrag(e) {
    if (!this._camera) return;

    // Hover cursor when idle and near charger
    if (!this._dragActive && this.state === 'idle' && this.nearCharger) {
      const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth)  *  2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this._raycaster.setFromCamera(mouse, this._camera);
      const hits = this._raycaster.intersectObjects(this._handleMeshes, false);
      document.body.style.cursor = hits.length > 0 ? 'grab' : '';
    }

    if (!this._dragActive) return;
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth)  *  2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    this._raycaster.setFromCamera(mouse, this._camera);
    const hit = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._dragPlane, hit)) {
      this._dragTarget.copy(hit);
    }
  }

  _onMouseUpDrag(e) {
    if (!this._dragActive || e.button !== 0) return;
    this._dragActive = false;
    document.body.style.cursor = '';

    const portPos    = this._getPortPosition();
    const distToPort = this.chargerHandle.position.distanceTo(portPos);
    if (distToPort < this._snapRange) {
      this._snapToPort(portPos);
    } else {
      this._returnToRack();
      this._removePreviewLine();
    }
  }

  _snapToPort(portPos) {
    this._removePreviewLine();
    this._dragTarget.copy(portPos);
    this._handleLifted = true;
    this._handleAnimT  = 0;
    setTimeout(() => this._startCharging(true), 260);
  }

  _returnToRack() {
    this._handleLifted = false;
    this._handleAnimT  = 0;
  }

  _createPreviewLine() {
    this._removePreviewLine();
    const pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 0.55 });
    this._previewLine = new THREE.Line(geo, mat);
    this.group.add(this._previewLine);
  }

  _updatePreviewLine() {
    if (!this._previewLine) return;
    const portPos  = this._getPortPosition();
    const ropeRoot = new THREE.Vector3(POST_X, 1.3, POST_Z);
    const mid      = ropeRoot.clone().lerp(this.chargerHandle.position, 0.5);
    mid.y -= 0.35;
    const pts = [ropeRoot, mid, this.chargerHandle.position.clone(), portPos];
    this._previewLine.geometry.setFromPoints(pts);
    this._previewLine.geometry.attributes.position.needsUpdate = true;
  }

  _removePreviewLine() {
    if (this._previewLine) {
      this.group.remove(this._previewLine);
      this._previewLine.geometry.dispose();
      this._previewLine.material.dispose();
      this._previewLine = null;
    }
  }

  // ─────────────────────────── INPUT ────────────────────────────

  _onKey(e) {
    if (e.code !== 'KeyE') return;
    if (this.state === 'idle' && this.nearCharger) {
      this._startCharging();
    } else if (this.state === 'charging' || this.state === 'complete') {
      this._disconnect();
    }
  }

  // ─────────────────────────── CHARGING SEQUENCE ────────────────

  _startCharging(immediate = false) {
    this.state       = 'charging';
    this.chargeTimer = 0;
    this._handleLifted = true;
    this._handleAnimT  = 0;

    const delay = immediate ? 80 : 500;
    setTimeout(() => {
      this._createCable(this._vehiclePos);
      this._createParticles();
      window.dispatchEvent(new Event('charging-started'));
    }, delay);
  }

  _disconnect() {
    this.state = 'idle';
    this._handleLifted = false;
    this._handleAnimT  = 0;
    this._removeCable();
    this._removeParticles();
    window.dispatchEvent(new Event('charging-stopped'));
  }

  _createCable(vehiclePos) {
    if (!vehiclePos) return;

    // End points
    const stationEnd = this.chargerHandle.position.clone();

    const carEnd = vehiclePos.clone();
    carEnd.x += CHARGE_PORT_DX;
    carEnd.y = CHARGE_PORT_DY;

    // Sag — droops more with distance
    const dist = stationEnd.distanceTo(carEnd);
    const sag  = Math.max(0.5, dist * 0.22);
    const mid  = stationEnd.clone().lerp(carEnd, 0.5);
    mid.y -= sag;

    this.cableCurve = new THREE.CatmullRomCurve3([
      stationEnd,
      new THREE.Vector3(stationEnd.x + 0.08, stationEnd.y - 0.18, stationEnd.z),
      mid,
      new THREE.Vector3(carEnd.x - 0.05, carEnd.y + 0.12, carEnd.z),
      carEnd,
    ]);

    // Black outer rubber sheath
    const tubeGeo = new THREE.TubeGeometry(this.cableCurve, 60, 0.03, 8, false);
    this.cable = new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({
      color: 0x080808, roughness: 0.75,
    }));
    this.group.add(this.cable);

    // Inner emissive glow strand
    const glowGeo = new THREE.TubeGeometry(this.cableCurve, 60, 0.009, 6, false);
    this.cableGlow = new THREE.Mesh(glowGeo, new THREE.MeshStandardMaterial({
      color: 0x0088ff,
      emissive: 0x0044ff,
      emissiveIntensity: 3,
      transparent: true,
      opacity: 0.85,
    }));
    this.group.add(this.cableGlow);

    // Charge port puck on the car side
    const portMat = new THREE.MeshStandardMaterial({
      color: 0x00aaff, emissive: 0x0066ff, emissiveIntensity: 4,
    });
    this.portIndicator = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), portMat);
    this.portIndicator.position.copy(carEnd);
    this.group.add(this.portIndicator);

    // Dynamic light at port
    this.chargeLight = new THREE.PointLight(0x0088ff, 2.5, 3);
    this.chargeLight.position.copy(carEnd);
    this.group.add(this.chargeLight);
  }

  _createParticles() {
    const geo = new THREE.SphereGeometry(0.048, 6, 6);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const p   = new THREE.Mesh(geo, mat);
      p.userData.t     = i / 14;
      p.userData.speed = 0.5 + Math.random() * 0.3;
      this.particles.push(p);
      this.group.add(p);
    }

    // Larger "charge bolt" particles (rarer, faster)
    const bigGeo = new THREE.SphereGeometry(0.09, 6, 6);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const p   = new THREE.Mesh(bigGeo, mat);
      p.userData.t     = Math.random();
      p.userData.speed = 0.9 + Math.random() * 0.4;
      this.particles.push(p);
      this.group.add(p);
    }
  }

  _removeCable() {
    [this.cable, this.cableGlow].forEach((m) => {
      if (m) { this.group.remove(m); m.geometry.dispose(); }
    });
    this.cable = null; this.cableGlow = null;

    if (this.portIndicator) { this.group.remove(this.portIndicator); this.portIndicator = null; }
    if (this.chargeLight)   { this.group.remove(this.chargeLight);   this.chargeLight   = null; }
    this.cableCurve = null;
  }

  _removeParticles() {
    for (const p of this.particles) {
      this.group.remove(p);
      p.geometry.dispose();
      p.material.dispose();
    }
    this.particles = [];
  }

  // ─────────────────────────── UPDATE ───────────────────────────

  update(delta, vehiclePos, vehicleSpeed) {
    if (!vehiclePos) return;
    this._vehiclePos.copy(vehiclePos);

    const t = Date.now() * 0.001;

    // Proximity check
    const postPos  = new THREE.Vector3(POST_X, 0, POST_Z);
    const wasNear  = this.nearCharger;
    this.nearCharger = vehiclePos.distanceTo(postPos) < INTERACT_RANGE && this.state === 'idle';
    if (wasNear && !this.nearCharger && !this._dragActive) document.body.style.cursor = '';

    // Bay glow pulse
    const bayGlow = this.group.getObjectByName('bay-glow');
    if (bayGlow) bayGlow.intensity = 0.7 + Math.sin(t * 2.2) * 0.35;

    // Status strip flicker when charging
    const strip = this.group.getObjectByName('status-strip');
    if (strip) {
      if (this.state === 'charging') {
        strip.material.color.setHSL(0.35 + Math.sin(t * 6) * 0.05, 1, 0.55);  // green
        strip.material.emissive.setHSL(0.35, 1, 0.4);
        strip.material.emissiveIntensity = 1.5 + Math.sin(t * 8) * 0.5;
      } else if (this.state === 'complete') {
        strip.material.color.set(0x00ff88);
        strip.material.emissiveIntensity = 3;
      } else {
        strip.material.color.set(0x00aaff);
        strip.material.emissiveIntensity = 2;
      }
    }

    // Handle animation
    if (this.chargerHandle) {
      if (this._dragActive) {
        // Follow drag position on horizontal plane
        this.chargerHandle.position.lerp(this._dragTarget, 0.18);
        this.chargerHandle.rotation.set(0, 0, 0);
        this._updatePreviewLine();

        // Snap indicator
        if (this._snapIndicator) {
          const portPos  = this._getPortPosition();
          this._snapIndicator.position.copy(portPos);
          const dist = this.chargerHandle.position.distanceTo(portPos);
          if (dist < this._snapRange) {
            this._snapIndicator.material.opacity = 0.5 + Math.abs(Math.sin(t * 14)) * 0.4;
            this._snapIndicator.material.color.setHex(0x00ff88);
            document.body.style.cursor = 'cell';
          } else {
            this._snapIndicator.material.opacity = Math.max(0, 0.25 - (dist - this._snapRange) * 0.1);
            this._snapIndicator.material.color.setHex(0x0088ff);
            document.body.style.cursor = 'grabbing';
          }
        }
      } else {
        // Normal rack / lifted animation
        if (this._snapIndicator) this._snapIndicator.material.opacity = 0;

        this._handleAnimT = Math.min(1, this._handleAnimT + delta * 2.5);
        const ease = 1 - Math.pow(1 - this._handleAnimT, 3);

        if (this._handleLifted) {
          this.chargerHandle.position.lerpVectors(HANDLE_RESTING, HANDLE_LIFTED, ease);
          this.chargerHandle.rotation.z = -0.5 * ease;
          this.chargerHandle.rotation.y = -0.3 * ease;
        } else {
          this.chargerHandle.position.lerpVectors(HANDLE_LIFTED, HANDLE_RESTING, ease);
          this.chargerHandle.rotation.z = -0.5 * (1 - ease);
          this.chargerHandle.rotation.y = -0.3 * (1 - ease);
        }
      }

      // Halo glow
      const halo = this.chargerHandle.getObjectByName('handle-halo');
      if (halo) {
        halo.material.opacity = this._dragActive
          ? 0.3 + Math.abs(Math.sin(t * 8)) * 0.15
          : (this.nearCharger ? 0.15 + Math.sin(t * 4) * 0.08 : 0.03);
      }
    }

    // Charging animation
    if (this.state === 'charging' && this.cableCurve) {
      this.chargeTimer  += delta;
      this.batteryLevel  = Math.min(100,
        BATTERY_START + (this.chargeTimer / BATTERY_FILL_SEC) * (100 - BATTERY_START));

      // Particles flowing toward car
      for (const p of this.particles) {
        p.userData.t = (p.userData.t + delta * p.userData.speed) % 1;
        const pt = this.cableCurve.getPoint(p.userData.t);
        p.position.copy(pt);

        // Colour cycle cyan → white
        const h = 0.5 + Math.sin(t * 3 + p.userData.t * 10) * 0.06;
        const l = 0.65 + (Math.random() < 0.05 ? 0.25 : 0);
        p.material.color.setHSL(h, 1, l);
      }

      // Pulse charge light
      if (this.chargeLight) {
        this.chargeLight.intensity = 2 + Math.sin(t * 12) * 1;
      }

      // Animate glow strand opacity
      if (this.cableGlow) {
        this.cableGlow.material.opacity = 0.6 + Math.sin(t * 8) * 0.25;
        this.cableGlow.material.emissiveIntensity = 2 + Math.sin(t * 6) * 1.5;
      }

      if (this.batteryLevel >= 100) {
        this.state = 'complete';
        window.dispatchEvent(new Event('charging-complete'));
      }
    }
  }

  // ─────────────────────────── API ──────────────────────────────

  getScenarioState() {
    return {
      type:         'charging',
      state:        this.state,
      batteryLevel: this.batteryLevel,
      nearCharger:  this.nearCharger,
      obstacles:    this.obstacles,
    };
  }

  getPortalPositions() {
    return [
      { x: -18, z: 42, targetWorld: WorldId.TEST_TRACK,  label: 'TEST TRACK',  color: 0x00aaff },
      { x:  18, z: 42, targetWorld: WorldId.CITY_STREET, label: 'CITY STREET', color: 0xff4400 },
      { x:   0, z: -40, targetWorld: WorldId.SUPERMARKET, label: 'SUPERMARKET', color: 0x00cc66 },
    ];
  }

  // ─────────────────────────── EDIT MODE API ────────────────────

  /**
   * Returns a Map of name → Object3D for all layout-editable objects.
   * Called by EditModeSystem after the world is loaded.
   */
  getEditableObjects() {
    return this._editableGroups;
  }

  dispose() {
    document.removeEventListener('keydown',   this._keyHandler);
    document.removeEventListener('mousedown', this._mouseDownHandler);
    document.removeEventListener('mousemove', this._mouseMoveHandler);
    document.removeEventListener('mouseup',   this._mouseUpHandler);
    document.body.style.cursor = '';
    this._removePreviewLine();
    this._removeCable();
    this._removeParticles();
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
