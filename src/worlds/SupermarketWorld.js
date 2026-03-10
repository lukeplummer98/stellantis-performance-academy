/**
 * SupermarketWorld — Car park environment for reverse parking assist demo.
 * 
 * Scenario: Drive into a supermarket car park, find a bay, and reverse park.
 * Parking sensors detect obstacles and guide the driver with beeps/distance.
 * 
 * Features: parking bays, trolleys, bollards, shopping trolley collection,
 * other parked cars, a target bay highlighted for the player.
 */
import * as THREE from 'three';
import { WorldId } from './WorldManager.js';

const TARGET_BAY = { x: 0, z: -25, width: 2.8, depth: 5.5 }; // The bay to park in

export class SupermarketWorld {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'world-supermarket';

    this.spawnPosition = new THREE.Vector3(0, 0, 30);
    this.spawnRotation = Math.PI; // Facing into the car park

    this.fogColor = 0xd0d0d0;
    this.skyColor = 0xccccdd;
    this.fogNear = 50;
    this.fogFar = 180;

    // Parking scenario state
    this.targetBay = TARGET_BAY;
    this.parked = false;
    this.parkScore = null; // 0–100
    this.parkTimer = 0;
    this.isInBay = false;
    this.bayDwellTime = 0;

    // Obstacles for parking sensors
    this.obstacles = [];
  }

  build() {
    this._buildGround();
    this._buildSupermarket();
    this._buildCarPark();
    this._buildTargetBay();
    this._buildParkedCars();
    this._buildObstacles();
    this._buildLighting();
  }

  _buildGround() {
    // Tarmac car park surface
    const tarmacGeo = new THREE.PlaneGeometry(120, 120);
    const tarmacMat = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.85,
      metalness: 0.05,
    });
    const tarmac = new THREE.Mesh(tarmacGeo, tarmacMat);
    tarmac.rotation.x = -Math.PI / 2;
    tarmac.position.set(0, 0.01, -20);
    tarmac.receiveShadow = true;
    this.group.add(tarmac);

    // Outer ground
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x667766, roughness: 0.9 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  _buildSupermarket() {
    // Main building
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.6 });
    const buildingGeo = new THREE.BoxGeometry(60, 8, 20);
    const building = new THREE.Mesh(buildingGeo, buildingMat);
    building.position.set(0, 4, -60);
    building.castShadow = true;
    building.receiveShadow = true;
    this.group.add(building);

    // Store front (darker band)
    const frontMat = new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.4 });
    const frontGeo = new THREE.BoxGeometry(58, 3, 0.3);
    const front = new THREE.Mesh(frontGeo, frontMat);
    front.position.set(0, 2.5, -50.15);
    this.group.add(front);

    // Store sign
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2255aa';
    ctx.fillRect(0, 0, 1024, 256);
    ctx.font = 'bold 120px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SUPERMARKET', 512, 128);

    const tex = new THREE.CanvasTexture(canvas);
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    const signGeo = new THREE.PlaneGeometry(20, 5);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 7, -50);
    this.group.add(sign);

    // Entrance canopy
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.5 });
    const canopyGeo = new THREE.BoxGeometry(15, 0.3, 5);
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 4, -48);
    canopy.castShadow = true;
    this.group.add(canopy);
  }

  _buildCarPark() {
    // Parking bay lines
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

    // Rows of parking bays
    const rows = [
      { z: -15, count: 10, xStart: -25 },
      { z: -25, count: 10, xStart: -25 },
      { z: -35, count: 10, xStart: -25 },
    ];

    rows.forEach((row) => {
      for (let i = 0; i <= row.count; i++) {
        const x = row.xStart + i * TARGET_BAY.width;

        // Vertical lines (bay dividers)
        const lineGeo = new THREE.PlaneGeometry(0.1, TARGET_BAY.depth);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(x, 0.025, row.z);
        this.group.add(line);
      }

      // Horizontal back line
      const backGeo = new THREE.PlaneGeometry(row.count * TARGET_BAY.width, 0.1);
      const backLine = new THREE.Mesh(backGeo, lineMat);
      backLine.rotation.x = -Math.PI / 2;
      backLine.position.set(row.xStart + (row.count * TARGET_BAY.width) / 2, 0.025, row.z - TARGET_BAY.depth / 2);
      this.group.add(backLine);
    });

    // Driving lanes between rows
    const laneArrowMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.6 });
    [-20, -30].forEach((z) => {
      const arrowGeo = new THREE.PlaneGeometry(1, 2);
      for (let x = -20; x <= 20; x += 10) {
        const arrow = new THREE.Mesh(arrowGeo, laneArrowMat);
        arrow.rotation.x = -Math.PI / 2;
        arrow.position.set(x, 0.03, z + 8);
        this.group.add(arrow);
      }
    });
  }

  _buildTargetBay() {
    // Highlight the target parking bay with green lines
    const greenMat = new THREE.MeshStandardMaterial({
      color: 0x00ff44,
      emissive: 0x00ff44,
      emissiveIntensity: 0.5,
    });

    const { x, z, width, depth } = TARGET_BAY;

    // Bay outline
    const lines = [
      { pos: [x - width / 2, 0.03, z], size: [0.12, depth] }, // left
      { pos: [x + width / 2, 0.03, z], size: [0.12, depth] }, // right
      { pos: [x, 0.03, z - depth / 2], size: [width, 0.12] }, // back
    ];

    lines.forEach(({ pos, size }) => {
      const geo = new THREE.PlaneGeometry(size[0], size[1]);
      const mesh = new THREE.Mesh(geo, greenMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(pos[0], pos[1], pos[2]);
      this.group.add(mesh);
    });

    // "PARK HERE" text on ground
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 128);
    ctx.font = 'bold 40px sans-serif';
    ctx.fillStyle = '#00ff44';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PARK HERE', 128, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const textMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5 });
    const textGeo = new THREE.PlaneGeometry(2.5, 1.2);
    const textMesh = new THREE.Mesh(textGeo, textMat);
    textMesh.rotation.x = -Math.PI / 2;
    textMesh.position.set(x, 0.04, z);
    this.group.add(textMesh);

    // Pulsing light above bay
    const pulseLight = new THREE.PointLight(0x00ff44, 2, 10);
    pulseLight.position.set(x, 3, z);
    pulseLight.name = 'target-bay-light';
    this.group.add(pulseLight);
  }

  _buildParkedCars() {
    const carColors = [0x880000, 0x004488, 0x555555, 0x006633, 0x884400, 0x222266];
    const carMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 });

    // Fill some bays with parked cars (not the target bay!)
    const occupiedBays = [
      { x: -22.2, z: -15 }, { x: -16.6, z: -15 }, { x: -8.2, z: -15 },
      { x: 2.8, z: -15 }, { x: -19.4, z: -25 }, { x: -5.4, z: -25 },
      { x: 5.6, z: -25 }, { x: -22.2, z: -35 }, { x: -11, z: -35 },
      { x: 2.8, z: -35 }, { x: 8.4, z: -35 },
      // Cars adjacent to target bay (making it tighter)
      { x: TARGET_BAY.x - TARGET_BAY.width, z: TARGET_BAY.z },
      { x: TARGET_BAY.x + TARGET_BAY.width, z: TARGET_BAY.z },
    ];

    occupiedBays.forEach((pos, i) => {
      const carGroup = new THREE.Group();

      // Body
      const bodyGeo = new THREE.BoxGeometry(2, 1, 4);
      const body = new THREE.Mesh(bodyGeo, carMat(carColors[i % carColors.length]));
      body.position.y = 0.7;
      carGroup.add(body);

      // Cabin
      const cabinGeo = new THREE.BoxGeometry(1.8, 0.65, 2.2);
      const cabinMat = new THREE.MeshStandardMaterial({
        color: 0x222222,
        transparent: true,
        opacity: 0.6,
      });
      const cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.y = 1.5;
      carGroup.add(cabin);

      carGroup.position.set(pos.x, 0, pos.z);
      carGroup.castShadow = true;
      this.group.add(carGroup);

      // Register as obstacle
      this.obstacles.push({
        name: `parked-car-${i}`,
        object: carGroup,
        getPosition: () => new THREE.Vector3(pos.x, 0.7, pos.z),
        getSize: () => new THREE.Vector3(2, 1.5, 4),
        isDynamic: false,
      });
    });
  }

  _buildObstacles() {
    // Shopping trolleys scattered around
    const trolleyMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.7, roughness: 0.3 });
    
    const trolleyPositions = [
      { x: 15, z: -18 },
      { x: -15, z: -42 },
      { x: 8, z: -12 },
    ];

    trolleyPositions.forEach((pos, i) => {
      const trolleyGroup = new THREE.Group();
      
      // Basket
      const basketGeo = new THREE.BoxGeometry(0.6, 0.4, 0.8);
      const basket = new THREE.Mesh(basketGeo, trolleyMat);
      basket.position.y = 0.6;
      trolleyGroup.add(basket);

      // Handle
      const handleGeo = new THREE.BoxGeometry(0.02, 0.4, 0.6);
      const handle = new THREE.Mesh(handleGeo, trolleyMat);
      handle.position.set(0, 0.8, 0.4);
      trolleyGroup.add(handle);

      trolleyGroup.position.set(pos.x, 0, pos.z);
      this.group.add(trolleyGroup);

      this.obstacles.push({
        name: `trolley-${i}`,
        object: trolleyGroup,
        getPosition: () => new THREE.Vector3(pos.x, 0.4, pos.z),
        getSize: () => new THREE.Vector3(0.6, 0.8, 0.8),
        isDynamic: false,
      });
    });

    // Bollards at store entrance
    const bollardMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4 });
    const bollardGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.8, 8);
    for (let x = -6; x <= 6; x += 2) {
      const bollard = new THREE.Mesh(bollardGeo, bollardMat);
      bollard.position.set(x, 0.4, -46);
      this.group.add(bollard);

      this.obstacles.push({
        name: `bollard-${x}`,
        object: bollard,
        getPosition: () => new THREE.Vector3(x, 0.4, -46),
        getSize: () => new THREE.Vector3(0.2, 0.8, 0.2),
        isDynamic: false,
      });
    }

    // Trolley bay (collection area)
    const bayFrameMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 });
    const bayFrameGeo = new THREE.BoxGeometry(0.1, 1, 4);
    [-1, 1].forEach((side) => {
      const frame = new THREE.Mesh(bayFrameGeo, bayFrameMat);
      frame.position.set(20 + side * 1, 0.5, -30);
      this.group.add(frame);
    });
  }

  _buildLighting() {
    // Overcast daylight
    const sun = new THREE.DirectionalLight(0xffeedd, 1.2);
    sun.position.set(15, 30, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.bias = -0.0003;
    this.group.add(sun);

    const ambient = new THREE.AmbientLight(0xaabbcc, 0.8);
    this.group.add(ambient);

    const hemi = new THREE.HemisphereLight(0xd0d0d0, 0x667766, 0.3);
    this.group.add(hemi);

    // Car park lamp posts
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const lampGeo = new THREE.CylinderGeometry(0.06, 0.06, 6, 8);
    const lampPositions = [
      [-20, -15], [0, -15], [20, -15],
      [-20, -35], [0, -35], [20, -35],
    ];

    lampPositions.forEach(([x, z]) => {
      const pole = new THREE.Mesh(lampGeo, lampMat);
      pole.position.set(x, 3, z);
      this.group.add(pole);

      const light = new THREE.PointLight(0xffffee, 1.5, 20);
      light.position.set(x, 6, z);
      this.group.add(light);
    });
  }

  getPortalPositions() {
    return [
      { x: 0, z: 50, targetWorld: WorldId.TEST_TRACK, label: 'TEST TRACK', color: 0x00aaff },
      { x: -30, z: -20, targetWorld: WorldId.CITY_STREET, label: 'CITY — AEB TEST', color: 0xff4400 },
    ];
  }

  /**
   * Check if vehicle is correctly parked in the target bay.
   */
  update(delta, vehiclePos, vehicleSpeed) {
    if (!vehiclePos || this.parked) return;

    this.parkTimer += delta;

    // Pulse the target bay light
    const bayLight = this.group.getObjectByName('target-bay-light');
    if (bayLight) {
      bayLight.intensity = 1.5 + Math.sin(this.parkTimer * 3) * 1;
    }

    // Check if vehicle is inside the target bay
    const { x, z, width, depth } = this.targetBay;
    const inX = Math.abs(vehiclePos.x - x) < width / 2;
    const inZ = Math.abs(vehiclePos.z - z) < depth / 2;

    if (inX && inZ && Math.abs(vehicleSpeed) < 0.5) {
      this.bayDwellTime += delta;

      // Must be still for 2 seconds to count as parked
      if (this.bayDwellTime > 2 && !this.parked) {
        this.parked = true;

        // Score based on how centred the car is
        const xOffset = Math.abs(vehiclePos.x - x);
        const zOffset = Math.abs(vehiclePos.z - z);
        const centreScore = Math.max(0, 100 - (xOffset / (width / 2)) * 50 - (zOffset / (depth / 2)) * 30);
        const timeBonus = Math.max(0, 20 - this.parkTimer / 2);
        this.parkScore = Math.min(100, Math.round(centreScore + timeBonus));

        console.log(`[Supermarket] Parked! Score: ${this.parkScore}/100`);
        window.dispatchEvent(new CustomEvent('parking-complete', {
          detail: { score: this.parkScore, time: this.parkTimer }
        }));
      }
    } else {
      this.bayDwellTime = 0;
    }
  }

  getScenarioState() {
    return {
      type: 'parking',
      targetBay: this.targetBay,
      parked: this.parked,
      parkScore: this.parkScore,
      parkTimer: this.parkTimer,
      isInBay: this.isInBay,
      bayDwellTime: this.bayDwellTime,
      obstacles: this.obstacles,
    };
  }

  resetScenario() {
    this.parked = false;
    this.parkScore = null;
    this.parkTimer = 0;
    this.bayDwellTime = 0;
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
