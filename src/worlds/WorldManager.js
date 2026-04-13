/**
 * WorldManager — Manages world loading, transitions, and portals.
 * 
 * Worlds:
 *   1. Test Track    — Open circuit, free driving, speed runs
 *   2. City Street   — AEB demo: pedestrian/pram crossing scenario
 *   3. Supermarket   — Reverse parking assist with bays and obstacles
 *   4. Motorway      — Adaptive cruise control + lane-keeping
 *   5. Night City    — Auto headlights, rain, visibility challenges
 */
import * as THREE from 'three';
import { TestTrackWorld } from './TestTrackWorld.js';
import { CityStreetWorld } from './CityStreetWorld.js';
import { SupermarketWorld } from './SupermarketWorld.js';
import { ChargingStationWorld } from './ChargingStationWorld.js';
import { ChargingStationWorldV2 } from './ChargingStationWorldV2.js';

export const WorldId = {
  TEST_TRACK:          'test-track',
  CITY_STREET:         'city-street',
  SUPERMARKET:         'supermarket',
  CHARGING_STATION:    'charging-station',
  CHARGING_STATION_V2: 'charging-station-v2',
};

export class WorldManager {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.currentWorld = null;
    this.currentWorldId = null;
    this.worlds = new Map();
    this.portals = [];
    this.portalGroup = new THREE.Group();
    this.portalGroup.name = 'portals';
    this.scene.add(this.portalGroup);

    // Register world builders
    this.worldBuilders = {
      [WorldId.TEST_TRACK]:          TestTrackWorld,
      [WorldId.CITY_STREET]:         CityStreetWorld,
      [WorldId.SUPERMARKET]:         SupermarketWorld,
      [WorldId.CHARGING_STATION]:    ChargingStationWorld,
      [WorldId.CHARGING_STATION_V2]: ChargingStationWorldV2,
    };
  }

  /**
   * Load a world by ID. Unloads the current one first.
   * @param {string} worldId
   * @param {THREE.Object3D} vehicleModel — the car to reposition
   * @returns {{ spawnPos: THREE.Vector3, spawnRot: number }}
   */
  loadWorld(worldId, vehicleModel) {
    // Unload current
    if (this.currentWorld) {
      this.currentWorld.dispose();
      this.scene.remove(this.currentWorld.group);
    }

    // Clear portals
    this.portalGroup.clear();
    this.portals = [];

    // Build new world
    const WorldClass = this.worldBuilders[worldId];
    if (!WorldClass) {
      console.error(`[WorldManager] Unknown world: ${worldId}`);
      return { spawnPos: new THREE.Vector3(0, 0, 0), spawnRot: 0 };
    }

    const world = new WorldClass(this.scene, this.camera);
    world.build();
    this.scene.add(world.group);

    // Create portals to other worlds
    this._createPortals(worldId, world);

    this.currentWorld = world;
    this.currentWorldId = worldId;

    // Update fog/sky to match world
    if (world.fogColor !== undefined) {
      this.scene.fog = new THREE.Fog(world.fogColor, world.fogNear || 40, world.fogFar || 200);
      this.scene.background = new THREE.Color(world.skyColor || world.fogColor);
    }

    console.log(`[WorldManager] Loaded world: ${worldId}`);

    return {
      spawnPos: world.spawnPosition.clone(),
      spawnRot: world.spawnRotation || 0,
    };
  }

  _createPortals(currentWorldId, world) {
    const portalDefs = world.getPortalPositions ? world.getPortalPositions() : [];

    portalDefs.forEach((def) => {
      if (def.targetWorld === currentWorldId) return;

      const portal = this._buildPortalMesh(def);
      this.portalGroup.add(portal);
      this.portals.push({
        mesh: portal,
        targetWorld: def.targetWorld,
        position: new THREE.Vector3(def.x, 0, def.z),
        radius: 5,
        label: def.label,
      });
    });
  }

  _buildPortalMesh(def) {
    const group = new THREE.Group();
    group.position.set(def.x, 0, def.z);

    // Glowing ring
    const ringGeo = new THREE.TorusGeometry(3, 0.15, 16, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: def.color || 0x00aaff,
      emissive: def.color || 0x00aaff,
      emissiveIntensity: 2,
      metalness: 0.8,
      roughness: 0.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3;
    group.add(ring);

    // Inner swirl (translucent disc)
    const discGeo = new THREE.CircleGeometry(2.8, 32);
    const discMat = new THREE.MeshStandardMaterial({
      color: def.color || 0x00aaff,
      emissive: def.color || 0x00aaff,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.y = 3;
    group.add(disc);

    // Label above portal (using sprite)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, 512, 128);
    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.label || 'PORTAL', 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.y = 7;
    sprite.scale.set(6, 1.5, 1);
    group.add(sprite);

    // Point light at portal
    const light = new THREE.PointLight(def.color || 0x00aaff, 3, 15);
    light.position.y = 3;
    group.add(light);

    group.userData = { isPortal: true, targetWorld: def.targetWorld };
    return group;
  }

  /**
   * Check if vehicle is near a portal and trigger transition.
   * @param {THREE.Vector3} vehiclePos
   * @returns {string|null} worldId to transition to, or null
   */
  checkPortalCollision(vehiclePos) {
    for (const portal of this.portals) {
      const dist = vehiclePos.distanceTo(portal.position);
      if (dist < portal.radius) {
        return portal.targetWorld;
      }
    }
    return null;
  }

  /**
   * Update world animations (portal rotation, scenario NPCs, etc.)
   */
  update(delta, vehiclePos, vehicleSpeed) {
    // Spin portal rings
    this.portalGroup.children.forEach((p) => {
      const ring = p.children[0];
      if (ring) ring.rotation.z += delta * 0.5;
    });

    // Update current world logic (NPC movement, scenario triggers)
    if (this.currentWorld && this.currentWorld.update) {
      this.currentWorld.update(delta, vehiclePos, vehicleSpeed);
    }
  }

  /**
   * Get scenario data for the current world (for ADAS)
   */
  getScenarioState() {
    if (this.currentWorld && this.currentWorld.getScenarioState) {
      return this.currentWorld.getScenarioState();
    }
    return null;
  }
}
