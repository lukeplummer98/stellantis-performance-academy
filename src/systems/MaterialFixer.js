/**
 * MaterialFixer — Post-processes loaded GLB models to fix common material issues.
 * Handles glass transparency, mirror reflectivity, and light emission.
 */
import * as THREE from 'three';

// Material names that should be transparent glass
const GLASS_MATERIALS = ['GlassBlack', 'GlassWhite', 'Windows', 'glass'];

// Material names that should be highly reflective (mirrors)
const MIRROR_MATERIALS = ['Mirror', 'chrome'];

// Material names that should emit light
const EMISSIVE_MATERIALS = {
  'Light': { color: 0xffffff, intensity: 2 },
  'LightRed': { color: 0xff2200, intensity: 1.5 },
  'frontLight': { color: 0xffffff, intensity: 2.5 },
  'backLights': { color: 0xff1100, intensity: 1.5 },
  'emissions': { color: 0xffffff, intensity: 1 },
};

export function fixMaterials(model) {
  model.traverse((child) => {
    if (!child.isMesh || !child.material) return;

    const matName = child.material.name;

    // ─── Glass ───
    if (GLASS_MATERIALS.includes(matName)) {
      const isDark = matName === 'GlassBlack' || matName === 'Windows';
      child.material = new THREE.MeshPhysicalMaterial({
        color: isDark ? 0x111111 : 0xffffff,
        metalness: 0.0,
        roughness: 0.05,
        transmission: 0.92,
        thickness: 0.5,
        ior: 1.5,
        transparent: true,
        opacity: 0.4,
        envMapIntensity: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        side: THREE.DoubleSide,
        name: matName,
      });
      child.renderOrder = 1;
    }

    // ─── Mirrors ───
    if (MIRROR_MATERIALS.includes(matName)) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 1.0,
        roughness: 0.05,
        envMapIntensity: 2.0,
        name: matName,
      });
    }

    // ─── Emissive lights ───
    if (EMISSIVE_MATERIALS[matName]) {
      const cfg = EMISSIVE_MATERIALS[matName];
      child.material = child.material.clone();
      child.material.emissive = new THREE.Color(cfg.color);
      child.material.emissiveIntensity = cfg.intensity;
      child.material.name = matName;
    }
  });
}
