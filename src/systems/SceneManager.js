/**
 * SceneManager — Core Three.js scene, renderer, camera, lighting, ground plane.
 * Provides the foundation environment for the showroom.
 */
import * as THREE from 'three';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.fog = new THREE.Fog(0x0a0a0a, 40, 120);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    this.camera.position.set(0, 1.7, 8);

    this._setupLighting();
    this._setupGround();
    this._setupEnvironment();

    window.addEventListener('resize', () => this._onResize());
  }

  _setupLighting() {
    // Ambient — subtle fill
    const ambient = new THREE.AmbientLight(0x404060, 0.4);
    this.scene.add(ambient);

    // Hemisphere — sky/ground color variation
    const hemi = new THREE.HemisphereLight(0x6688cc, 0x222222, 0.5);
    this.scene.add(hemi);

    // Key light — main directional
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(10, 20, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 80;
    key.shadow.camera.left = -30;
    key.shadow.camera.right = 30;
    key.shadow.camera.top = 30;
    key.shadow.camera.bottom = -30;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    // Fill light — opposite side, cooler
    const fill = new THREE.DirectionalLight(0x4488ff, 0.4);
    fill.position.set(-8, 10, -6);
    this.scene.add(fill);

    // Rim light — back edge highlight
    const rim = new THREE.DirectionalLight(0xff6633, 0.3);
    rim.position.set(0, 5, -15);
    this.scene.add(rim);

    // Spot — showroom spotlight on center
    const spot = new THREE.SpotLight(0xffffff, 2, 50, Math.PI / 6, 0.5, 1);
    spot.position.set(0, 15, 0);
    spot.target.position.set(0, 0, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    this.scene.add(spot);
    this.scene.add(spot.target);
  }

  _setupGround() {
    // Showroom floor — large reflective-looking surface
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.3,
      roughness: 0.6,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid overlay
    const grid = new THREE.GridHelper(200, 100, 0x222222, 0x181818);
    grid.position.y = 0.01;
    this.scene.add(grid);
  }

  _setupEnvironment() {
    // Simple showroom boundary pillars
    const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 6, 8);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.8,
      roughness: 0.2,
    });

    const positions = [
      [-12, 3, -12], [12, 3, -12], [-12, 3, 12], [12, 3, 12],
      [-12, 3, 0], [12, 3, 0], [0, 3, -12], [0, 3, 12],
    ];

    for (const [x, y, z] of positions) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(x, y, z);
      pillar.castShadow = true;
      this.scene.add(pillar);
    }
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  get deltaTime() {
    return this.clock.getDelta();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
