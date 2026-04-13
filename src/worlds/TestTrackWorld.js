/**
 * TestTrackWorld — An open test circuit with barriers, a straight, corners,
 * and markers. Good for free driving and top-speed runs.
 */
import * as THREE from 'three';
import { WorldId } from './WorldManager.js';

export class TestTrackWorld {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'world-test-track';

    // Spawn
    this.spawnPosition = new THREE.Vector3(0, 0, 0);
    this.spawnRotation = 0;

    // Environment
    this.fogColor = 0x87CEEB;
    this.skyColor = 0x87CEEB;
    this.fogNear = 80;
    this.fogFar = 400;
  }

  build() {
    this._buildGround();
    this._buildTrack();
    this._buildBarriers();
    this._buildScenery();
    this._buildLighting();
  }

  _buildGround() {
    // Large grass plane
    const groundGeo = new THREE.PlaneGeometry(500, 500);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3d6b2e,
      roughness: 0.9,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  _buildTrack() {
    // Oval track — two straights connected by semicircles
    const trackWidth = 12;
    const straightLength = 120;
    const turnRadius = 40;
    const asphaltColor = 0x333333;
    const lineColor = 0xffffff;

    // Asphalt material
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: asphaltColor,
      roughness: 0.8,
      metalness: 0.1,
    });

    // Straight sections
    const straightGeo = new THREE.PlaneGeometry(trackWidth, straightLength);
    
    // Left straight
    const leftStraight = new THREE.Mesh(straightGeo, asphaltMat);
    leftStraight.rotation.x = -Math.PI / 2;
    leftStraight.position.set(-turnRadius, 0.01, 0);
    leftStraight.receiveShadow = true;
    this.group.add(leftStraight);

    // Right straight
    const rightStraight = new THREE.Mesh(straightGeo, asphaltMat);
    rightStraight.rotation.x = -Math.PI / 2;
    rightStraight.position.set(turnRadius, 0.01, 0);
    rightStraight.receiveShadow = true;
    this.group.add(rightStraight);

    // Semicircular turns (approximated with segments)
    const turnSegments = 24;
    for (let i = 0; i < turnSegments; i++) {
      const angle0 = (i / turnSegments) * Math.PI;
      const angle1 = ((i + 1) / turnSegments) * Math.PI;

      // Top turn (z = +straightLength/2)
      this._addTurnSegment(0, straightLength / 2, turnRadius, angle0, angle1, trackWidth, asphaltMat, false);

      // Bottom turn (z = -straightLength/2)
      this._addTurnSegment(0, -straightLength / 2, turnRadius, angle0, angle1, trackWidth, asphaltMat, true);
    }

    // Centre line dashes
    this._addCentreLines(turnRadius, straightLength, trackWidth);

    // Start / finish line
    const finishGeo = new THREE.PlaneGeometry(trackWidth, 2);
    const finishMat = new THREE.MeshStandardMaterial({ color: lineColor, roughness: 0.5 });
    const finish = new THREE.Mesh(finishGeo, finishMat);
    finish.rotation.x = -Math.PI / 2;
    finish.position.set(-turnRadius, 0.02, 0);
    this.group.add(finish);

    // Checkerboard pattern on start line
    const checkerSize = 1;
    const checkerBlack = new THREE.MeshStandardMaterial({ color: 0x000000 });
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j) % 2 === 0) continue;
        const cGeo = new THREE.PlaneGeometry(checkerSize, checkerSize);
        const checker = new THREE.Mesh(cGeo, checkerBlack);
        checker.rotation.x = -Math.PI / 2;
        checker.position.set(-turnRadius - trackWidth / 2 + i * checkerSize + 0.5, 0.025, j * checkerSize - 0.5);
        this.group.add(checker);
      }
    }
  }

  _addTurnSegment(cx, cz, radius, a0, a1, width, material, flip) {
    const shape = new THREE.Shape();
    const innerR = radius - width / 2;
    const outerR = radius + width / 2;

    const dir = flip ? -1 : 1;
    const startAngle = flip ? -a0 : a0;
    const endAngle = flip ? -a1 : a1;

    const x0 = cx + Math.cos(startAngle) * outerR;
    const z0 = cz + dir * Math.sin(startAngle) * outerR;
    const x1 = cx + Math.cos(endAngle) * outerR;
    const z1 = cz + dir * Math.sin(endAngle) * outerR;
    const x2 = cx + Math.cos(endAngle) * innerR;
    const z2 = cz + dir * Math.sin(endAngle) * innerR;
    const x3 = cx + Math.cos(startAngle) * innerR;
    const z3 = cz + dir * Math.sin(startAngle) * innerR;

    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      x0, 0.01, z0,
      x1, 0.01, z1,
      x2, 0.01, z2,
      x0, 0.01, z0,
      x2, 0.01, z2,
      x3, 0.01, z3,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _addCentreLines(turnRadius, straightLength, trackWidth) {
    const dashMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const dashLength = 3;
    const gapLength = 3;
    const dashGeo = new THREE.PlaneGeometry(0.2, dashLength);

    // Left straight dashes
    for (let z = -straightLength / 2; z < straightLength / 2; z += dashLength + gapLength) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(-turnRadius, 0.02, z + dashLength / 2);
      this.group.add(dash);
    }

    // Right straight dashes
    for (let z = -straightLength / 2; z < straightLength / 2; z += dashLength + gapLength) {
      const dash = new THREE.Mesh(dashGeo, dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(turnRadius, 0.02, z + dashLength / 2);
      this.group.add(dash);
    }
  }

  _buildBarriers() {
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xcc0000, roughness: 0.6 });
    const barrierWhite = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.6 });
    const barrierHeight = 0.8;
    const barrierWidth = 0.3;
    const turnRadius = 40;
    const straightLength = 120;
    const trackHalfWidth = 6;

    // Straight barriers (inner + outer)
    const barrierGeo = new THREE.BoxGeometry(barrierWidth, barrierHeight, straightLength);

    // Left straight — inner and outer
    for (const offset of [-trackHalfWidth - 0.5, trackHalfWidth + 0.5]) {
      const barrier = new THREE.Mesh(barrierGeo, (offset < 0) ? barrierWhite : barrierMat);
      barrier.position.set(-turnRadius + offset, barrierHeight / 2, 0);
      barrier.castShadow = true;
      this.group.add(barrier);
    }

    // Right straight — inner and outer
    for (const offset of [-trackHalfWidth - 0.5, trackHalfWidth + 0.5]) {
      const barrier = new THREE.Mesh(barrierGeo, (offset > 0) ? barrierWhite : barrierMat);
      barrier.position.set(turnRadius + offset, barrierHeight / 2, 0);
      barrier.castShadow = true;
      this.group.add(barrier);
    }

    // Turn barriers (posts around semicircles)
    const segments = 20;
    const postGeo = new THREE.BoxGeometry(1, barrierHeight, 1);
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI;

      // Top turn outer
      const xOuter = Math.cos(angle) * (turnRadius + trackHalfWidth + 1);
      const zOuter = straightLength / 2 + Math.sin(angle) * (turnRadius + trackHalfWidth + 1);
      const postOuter = new THREE.Mesh(postGeo, barrierMat);
      postOuter.position.set(xOuter, barrierHeight / 2, zOuter);
      postOuter.castShadow = true;
      this.group.add(postOuter);

      // Top turn inner
      const xInner = Math.cos(angle) * (turnRadius - trackHalfWidth - 1);
      const zInner = straightLength / 2 + Math.sin(angle) * (turnRadius - trackHalfWidth - 1);
      if (turnRadius - trackHalfWidth - 1 > 2) {
        const postInner = new THREE.Mesh(postGeo, barrierWhite);
        postInner.position.set(xInner, barrierHeight / 2, zInner);
        postInner.castShadow = true;
        this.group.add(postInner);
      }

      // Bottom turn outer
      const zOuterB = -straightLength / 2 - Math.sin(angle) * (turnRadius + trackHalfWidth + 1);
      const postOuterB = new THREE.Mesh(postGeo, barrierMat);
      postOuterB.position.set(xOuter, barrierHeight / 2, zOuterB);
      postOuterB.castShadow = true;
      this.group.add(postOuterB);

      // Bottom turn inner
      const zInnerB = -straightLength / 2 - Math.sin(angle) * (turnRadius - trackHalfWidth - 1);
      if (turnRadius - trackHalfWidth - 1 > 2) {
        const postInnerB = new THREE.Mesh(postGeo, barrierWhite);
        postInnerB.position.set(xInner, barrierHeight / 2, zInnerB);
        postInnerB.castShadow = true;
        this.group.add(postInnerB);
      }
    }
  }

  _buildScenery() {
    // Trees around the track
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3728 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a1e });
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 3, 6);
    const leafGeo = new THREE.ConeGeometry(1.5, 4, 8);

    const treePositions = [];
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const dist = 65 + Math.random() * 30;
      treePositions.push([
        Math.cos(angle) * dist,
        Math.sin(angle) * dist,
      ]);
    }

    treePositions.forEach(([x, z]) => {
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 1.5, z);
      trunk.castShadow = true;
      this.group.add(trunk);

      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(x, 5, z);
      leaf.castShadow = true;
      this.group.add(leaf);
    });

    // Grandstand
    const standGeo = new THREE.BoxGeometry(30, 6, 4);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.7 });
    const grandstand = new THREE.Mesh(standGeo, standMat);
    grandstand.position.set(-40, 3, -70);
    grandstand.castShadow = true;
    this.group.add(grandstand);

    // Timing tower
    const towerGeo = new THREE.BoxGeometry(4, 12, 4);
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.6 });
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(-55, 6, -70);
    tower.castShadow = true;
    this.group.add(tower);
  }

  _buildLighting() {
    // Sun
    const sun = new THREE.DirectionalLight(0xfff4e0, 2);
    sun.position.set(50, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.bias = -0.0003;
    this.group.add(sun);

    // Ambient daylight
    const ambient = new THREE.AmbientLight(0x88aacc, 0.6);
    this.group.add(ambient);

    // Hemisphere — sky/ground
    const hemi = new THREE.HemisphereLight(0x87CEEB, 0x3d6b2e, 0.4);
    this.group.add(hemi);
  }

  getPortalPositions() {
    return [
      { x: -40, z: 50, targetWorld: WorldId.CITY_STREET,      label: 'CITY — AEB TEST',         color: 0xff4400 },
      { x:  40, z: 50, targetWorld: WorldId.SUPERMARKET,      label: 'SUPERMARKET — PARKING',    color: 0x00cc66 },
      { x:   0, z: 75, targetWorld: WorldId.CHARGING_STATION, label: 'CHARGING STATION',         color: 0x00ff88 },
    ];
  }

  update(delta, vehiclePos, vehicleSpeed) {
    // Nothing dynamic on the test track for now
  }

  getScenarioState() {
    return null;
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
