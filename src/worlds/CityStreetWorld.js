/**
 * CityStreetWorld — Urban environment for AEB (Autonomous Emergency Braking) demo.
 * 
 * Scenario: Driving along a residential street, a parent pushes a pram across
 * a zebra crossing. The AEB system must detect the obstacle and brake.
 * 
 * Also includes: parked cars, traffic lights, buildings, crosswalks.
 */
import * as THREE from 'three';
import { WorldId } from './WorldManager.js';

const PRAM_SPEED = 1.2; // m/s — pram crossing speed
const CROSSING_Z = -50; // Z position of the zebra crossing
const PRAM_START_X = 12; // Off to the side
const PRAM_END_X = -12;

export class CityStreetWorld {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'world-city-street';

    this.spawnPosition = new THREE.Vector3(0, 0, 60);
    this.spawnRotation = Math.PI; // facing down the street

    this.fogColor = 0xb0c4de;
    this.skyColor = 0xc0d8ee;
    this.fogNear = 60;
    this.fogFar = 250;

    // Scenario state
    this.pram = null;
    this.pramActive = false;
    this.pramTriggered = false;
    this.pramX = PRAM_START_X;
    this.scenarioResult = null; // 'stopped' | 'hit'
    this.pedestrian = null;

    // Obstacles list for ADAS sensor
    this.obstacles = [];
  }

  build() {
    this._buildRoad();
    this._buildBuildings();
    this._buildCrossing();
    this._buildPramAndPedestrian();
    this._buildParkedCars();
    this._buildTrafficLights();
    this._buildSidewalkFurniture();
    this._buildLighting();
  }

  _buildRoad() {
    // Main road
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.85 });

    const roadGeo = new THREE.PlaneGeometry(14, 300);
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.01, -80);
    road.receiveShadow = true;
    this.group.add(road);

    // Pavements / sidewalks
    const paveMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.8 });

    [-1, 1].forEach((side) => {
      const paveGeo = new THREE.PlaneGeometry(6, 300);
      const pavement = new THREE.Mesh(paveGeo, paveMat);
      pavement.rotation.x = -Math.PI / 2;
      pavement.position.set(side * 10, 0.02, -80);
      pavement.receiveShadow = true;
      this.group.add(pavement);

      // Curb
      const curbGeo = new THREE.BoxGeometry(0.3, 0.15, 300);
      const curbMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.position.set(side * 7, 0.075, -80);
      this.group.add(curb);
    });

    // Centre line dashes
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const dashGeo = new THREE.PlaneGeometry(0.15, 2);
    for (let z = 70; z > -230; z -= 5) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.02, z);
      this.group.add(dash);
    }

    // Background ground
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x556655, roughness: 0.9 });
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  _buildBuildings() {
    const colors = [0x8b7d6b, 0x9e9080, 0x7a6a5a, 0xa09585, 0x6b5e50, 0xb8a898];

    [-1, 1].forEach((side) => {
      for (let i = 0; i < 12; i++) {
        const height = 8 + Math.random() * 12;
        const depth = 6 + Math.random() * 4;
        const width = 8 + Math.random() * 6;

        const buildingGeo = new THREE.BoxGeometry(width, height, depth);
        const buildingMat = new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          roughness: 0.8,
          metalness: 0.1,
        });
        const building = new THREE.Mesh(buildingGeo, buildingMat);
        building.position.set(
          side * (16 + depth / 2),
          height / 2,
          60 - i * 22 + (Math.random() - 0.5) * 4
        );
        building.castShadow = true;
        building.receiveShadow = true;
        this.group.add(building);

        // Windows (simple emissive strips)
        const windowRows = Math.floor(height / 3);
        const windowMat = new THREE.MeshStandardMaterial({
          color: 0xffeecc,
          emissive: 0xffddaa,
          emissiveIntensity: 0.3,
        });
        for (let row = 0; row < windowRows; row++) {
          const winGeo = new THREE.PlaneGeometry(width * 0.7, 1);
          const win = new THREE.Mesh(winGeo, windowMat);
          win.position.set(
            building.position.x - side * (depth / 2 + 0.01),
            1.5 + row * 3,
            building.position.z
          );
          win.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          this.group.add(win);
        }
      }
    });
  }

  _buildCrossing() {
    // Zebra crossing stripes
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const stripeGeo = new THREE.PlaneGeometry(1, 5);

    for (let x = -6; x <= 6; x += 2) {
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.025, CROSSING_Z);
      this.group.add(stripe);
    }

    // Belisha beacons (orange spheres on poles)
    [-8, 8].forEach((x) => {
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
      const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3, 8);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x, 1.5, CROSSING_Z);
      this.group.add(pole);

      const beaconMat = new THREE.MeshStandardMaterial({
        color: 0xff8800,
        emissive: 0xff6600,
        emissiveIntensity: 1,
      });
      const beaconGeo = new THREE.SphereGeometry(0.3, 16, 16);
      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(x, 3.2, CROSSING_Z);
      this.group.add(beacon);
    });

    // Road marking "SLOW"
    this._addRoadText('SLOW', 0, CROSSING_Z + 20);
  }

  _addRoadText(text, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333333';
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = 'bold 80px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    const geo = new THREE.PlaneGeometry(6, 3);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.03, z);
    this.group.add(mesh);
  }

  _buildPramAndPedestrian() {
    // Pram — simple box on wheels
    const pramGroup = new THREE.Group();
    pramGroup.name = 'pram';

    // Pram body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2244aa });
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.5, 0.9);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.7;
    pramGroup.add(body);

    // Pram hood
    const hoodGeo = new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.95, -0.2);
    hood.rotation.x = -Math.PI / 2;
    pramGroup.add(hood);

    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12);
    [[-0.3, 0.12, -0.35], [0.3, 0.12, -0.35], [-0.3, 0.12, 0.35], [0.3, 0.12, 0.35]].forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      wheel.rotation.z = Math.PI / 2;
      pramGroup.add(wheel);
    });

    // Handle
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const handleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0, 1.0, 0.65);
    pramGroup.add(handle);

    pramGroup.position.set(PRAM_START_X, 0, CROSSING_Z);
    pramGroup.visible = false; // Hidden until triggered
    this.group.add(pramGroup);
    this.pram = pramGroup;

    // Pedestrian — simple humanoid shape
    const pedGroup = new THREE.Group();
    pedGroup.name = 'pedestrian';

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xddb69c });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x3355aa });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x222244 });

    // Head
    const headGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.7;
    pedGroup.add(head);

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.4, 0.5, 0.25);
    const torso = new THREE.Mesh(torsoGeo, clothMat);
    torso.position.y = 1.3;
    pedGroup.add(torso);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.15, 0.6, 0.2);
    [-0.1, 0.1].forEach((xOff) => {
      const leg = new THREE.Mesh(legGeo, pantsMat);
      leg.position.set(xOff, 0.75, 0);
      pedGroup.add(leg);
    });

    // Arms
    const armGeo = new THREE.BoxGeometry(0.12, 0.45, 0.15);
    [-0.26, 0.26].forEach((xOff) => {
      const arm = new THREE.Mesh(armGeo, clothMat);
      arm.position.set(xOff, 1.25, 0);
      pedGroup.add(arm);
    });

    pedGroup.position.set(PRAM_START_X + 0.5, 0, CROSSING_Z);
    pedGroup.visible = false;
    this.group.add(pedGroup);
    this.pedestrian = pedGroup;

    // Register as obstacle for ADAS
    this.obstacles.push({
      name: 'pram',
      object: pramGroup,
      getPosition: () => pramGroup.position.clone(),
      getSize: () => new THREE.Vector3(0.6, 0.95, 0.9),
      isDynamic: true,
    });
  }

  _buildParkedCars() {
    // Simplified parked car shapes along the road
    const carColors = [0x880000, 0x004488, 0x333333, 0x888888, 0x006633];
    const carMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });

    const carPositions = [
      { x: 5.5, z: 20, rot: 0 },
      { x: -5.5, z: 10, rot: Math.PI },
      { x: 5.5, z: -20, rot: 0 },
      { x: -5.5, z: -35, rot: Math.PI },
      { x: 5.5, z: -70, rot: 0 },
      { x: -5.5, z: -90, rot: Math.PI },
    ];

    carPositions.forEach((pos, i) => {
      const carGroup = new THREE.Group();
      // Body
      const bodyGeo = new THREE.BoxGeometry(2, 1, 4.5);
      const body = new THREE.Mesh(bodyGeo, carMat(carColors[i % carColors.length]));
      body.position.y = 0.7;
      carGroup.add(body);

      // Cabin
      const cabinGeo = new THREE.BoxGeometry(1.8, 0.7, 2.5);
      const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.3,
        metalness: 0.5,
        transparent: true,
        opacity: 0.7,
      });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.y = 1.55;
      carGroup.add(cabin);

      // Wheels
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
      const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
      [[-0.9, 0.3, -1.3], [0.9, 0.3, -1.3], [-0.9, 0.3, 1.3], [0.9, 0.3, 1.3]].forEach(([wx, wy, wz]) => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(wx, wy, wz);
        wheel.rotation.z = Math.PI / 2;
        carGroup.add(wheel);
      });

      carGroup.position.set(pos.x, 0, pos.z);
      carGroup.rotation.y = pos.rot;
      carGroup.castShadow = true;
      this.group.add(carGroup);

      // Register as static obstacle
      this.obstacles.push({
        name: `parked-car-${i}`,
        object: carGroup,
        getPosition: () => new THREE.Vector3(pos.x, 0.7, pos.z),
        getSize: () => new THREE.Vector3(2, 1.5, 4.5),
        isDynamic: false,
      });
    });
  }

  _buildTrafficLights() {
    const positions = [
      { x: 8, z: CROSSING_Z + 8 },
      { x: -8, z: CROSSING_Z - 8 },
    ];

    positions.forEach((pos) => {
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
      const poleGeo = new THREE.CylinderGeometry(0.08, 0.08, 5, 8);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(pos.x, 2.5, pos.z);
      this.group.add(pole);

      const boxGeo = new THREE.BoxGeometry(0.5, 1.2, 0.4);
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
      const lightBox = new THREE.Mesh(boxGeo, boxMat);
      lightBox.position.set(pos.x, 5.3, pos.z);
      this.group.add(lightBox);

      // Lights
      const lightGeo = new THREE.SphereGeometry(0.1, 12, 12);
      const redMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.5 });
      const amberMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 0.2 });
      const greenMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.8 });

      [{ y: 5.6, mat: redMat }, { y: 5.3, mat: amberMat }, { y: 5.0, mat: greenMat }].forEach(({ y, mat }) => {
        const light = new THREE.Mesh(lightGeo, mat);
        light.position.set(pos.x, y, pos.z + 0.22);
        this.group.add(light);
      });
    });
  }

  _buildSidewalkFurniture() {
    // Street lamps
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const lampPoleGeo = new THREE.CylinderGeometry(0.05, 0.06, 4, 8);
    const lampHeadGeo = new THREE.SphereGeometry(0.2, 8, 8);
    const lampLightMat = new THREE.MeshStandardMaterial({
      color: 0xffffcc,
      emissive: 0xffff88,
      emissiveIntensity: 0.5,
    });

    for (let z = 50; z > -200; z -= 20) {
      [-9, 9].forEach((x) => {
        const pole = new THREE.Mesh(lampPoleGeo, lampMat);
        pole.position.set(x, 2, z);
        this.group.add(pole);

        const head = new THREE.Mesh(lampHeadGeo, lampLightMat);
        head.position.set(x, 4.2, z);
        this.group.add(head);

        const light = new THREE.PointLight(0xffffcc, 1, 15);
        light.position.set(x, 4, z);
        this.group.add(light);
      });
    }

    // Benches
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x6b4226 });
    const benchGeo = new THREE.BoxGeometry(1.5, 0.1, 0.5);
    [-30, -60, -100].forEach((z) => {
      const bench = new THREE.Mesh(benchGeo, benchMat);
      bench.position.set(9, 0.5, z);
      this.group.add(bench);
    });

    // Bins
    const binMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const binGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.6, 8);
    [-10, -40, -80].forEach((z) => {
      const bin = new THREE.Mesh(binGeo, binMat);
      bin.position.set(-9, 0.3, z);
      this.group.add(bin);
    });
  }

  _buildLighting() {
    // Overcast daylight
    const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
    sun.position.set(20, 40, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 150;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0003;
    this.group.add(sun);

    const ambient = new THREE.AmbientLight(0x99aacc, 0.7);
    this.group.add(ambient);

    const hemi = new THREE.HemisphereLight(0xb0c4de, 0x556655, 0.3);
    this.group.add(hemi);
  }

  getPortalPositions() {
    return [
      { x: 0, z: 70, targetWorld: WorldId.TEST_TRACK, label: 'TEST TRACK', color: 0x00aaff },
      { x: 0, z: -200, targetWorld: WorldId.SUPERMARKET, label: 'SUPERMARKET — PARKING', color: 0x00cc66 },
    ];
  }

  /**
   * Scenario logic — trigger pram when vehicle approaches crossing.
   */
  update(delta, vehiclePos, vehicleSpeed) {
    if (!vehiclePos) return;

    // Trigger pram when vehicle is approaching the crossing
    const distToCrossing = vehiclePos.z - CROSSING_Z;
    if (!this.pramTriggered && distToCrossing > 0 && distToCrossing < 30 && vehicleSpeed > 2) {
      this.pramTriggered = true;
      this.pramActive = true;
      this.pram.visible = true;
      this.pedestrian.visible = true;
      this.pramX = PRAM_START_X;
      console.log('[CityStreet] Pram crossing triggered!');
    }

    // Move pram across the road
    if (this.pramActive) {
      this.pramX -= PRAM_SPEED * delta;
      this.pram.position.x = this.pramX;
      this.pedestrian.position.x = this.pramX + 0.5;

      // Check if pram finished crossing
      if (this.pramX < PRAM_END_X) {
        this.pramActive = false;
        this.pram.visible = false;
        this.pedestrian.visible = false;
        if (!this.scenarioResult) {
          this.scenarioResult = 'safe-pass';
          console.log('[CityStreet] Pram crossed safely');
        }
      }

      // Check collision with vehicle (simplified AABB)
      if (this.pramActive && vehiclePos) {
        const dx = Math.abs(vehiclePos.x - this.pramX);
        const dz = Math.abs(vehiclePos.z - CROSSING_Z);
        if (dx < 1.5 && dz < 3) {
          if (!this.scenarioResult) {
            this.scenarioResult = 'hit';
            console.log('[CityStreet] COLLISION! Pram was hit!');
            window.dispatchEvent(new CustomEvent('adas-collision', {
              detail: { type: 'pedestrian', world: 'city-street' }
            }));
          }
        }
      }
    }
  }

  getScenarioState() {
    return {
      type: 'aeb',
      pramActive: this.pramActive,
      pramPosition: this.pram ? this.pram.position.clone() : null,
      pramTriggered: this.pramTriggered,
      crossingZ: CROSSING_Z,
      result: this.scenarioResult,
      obstacles: this.obstacles,
    };
  }

  /**
   * Reset scenario for replay.
   */
  resetScenario() {
    this.pramTriggered = false;
    this.pramActive = false;
    this.pramX = PRAM_START_X;
    this.scenarioResult = null;
    if (this.pram) {
      this.pram.position.x = PRAM_START_X;
      this.pram.visible = false;
    }
    if (this.pedestrian) {
      this.pedestrian.position.x = PRAM_START_X + 0.5;
      this.pedestrian.visible = false;
    }
  }

  dispose() {
    this.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
}
