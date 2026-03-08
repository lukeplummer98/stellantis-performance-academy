/**
 * ThemeEngine — Applies brand themes dynamically to the HUD, scene lighting, and CSS.
 * Listens for vehicle proximity/selection and swaps the visual identity.
 */
import * as THREE from 'three';
import { getTheme } from './BrandThemes.js';

export class ThemeEngine {
  constructor(scene) {
    this.scene = scene;
    this.currentBrand = null;
    this.transitionDuration = 0.6; // seconds

    // Cache scene lights for theme changes
    this.ambientLight = null;
    this.spotLight = null;
    this.scene.traverse((child) => {
      if (child.isAmbientLight) this.ambientLight = child;
      if (child.isSpotLight) this.spotLight = child;
    });
  }

  /**
   * Apply a brand theme. Call when a vehicle becomes active/nearby.
   */
  applyTheme(brand) {
    if (brand === this.currentBrand) return;
    this.currentBrand = brand;

    const theme = getTheme(brand);
    this._applyCSSTheme(theme);
    this._applySceneTheme(theme);
    this._applyHUDBrand(theme);
  }

  /**
   * Reset to default Stellantis theme.
   */
  resetTheme() {
    this.currentBrand = null;
    const theme = getTheme('_default');
    this._applyCSSTheme(theme);
    this._applySceneTheme(theme);
    this._applyHUDBrand(theme);
  }

  _applyCSSTheme(theme) {
    const root = document.documentElement;
    root.style.setProperty('--color-bg', theme.background);
    root.style.setProperty('--color-surface', theme.surface);
    root.style.setProperty('--color-accent', theme.accent);
    root.style.setProperty('--color-text', theme.text);
    root.style.setProperty('--color-text-dim', theme.textDim);
    root.style.setProperty('--color-border', theme.border);

    // Animate mode indicator border + color
    const modeInd = document.getElementById('mode-indicator');
    if (modeInd) {
      modeInd.style.borderColor = theme.accent;
      modeInd.style.color = theme.accent;
      modeInd.style.background = `rgba(${theme.accentRgb}, 0.08)`;
    }
  }

  _applySceneTheme(theme) {
    // Fog
    if (this.scene.fog) {
      this.scene.fog.color.setHex(theme.fogColor);
    }
    this.scene.background = new THREE.Color(theme.fogColor);

    // Ambient light
    if (this.ambientLight) {
      this.ambientLight.color.setHex(theme.ambientColor);
      this.ambientLight.intensity = theme.ambientIntensity;
    }

    // Spotlight
    if (this.spotLight) {
      this.spotLight.color.setHex(theme.spotColor);
      this.spotLight.intensity = theme.spotIntensity;
    }
  }

  _applyHUDBrand(theme) {
    const brandMark = document.querySelector('.brand-mark');
    const brandSub = document.querySelector('.brand-sub');

    if (brandMark) {
      if (theme.logo) {
        brandMark.innerHTML = theme.logo;
        brandMark.style.color = theme.accent;
      } else {
        brandMark.textContent = theme.name;
        brandMark.style.color = '';
      }
    }

    if (brandSub) {
      brandSub.textContent = theme.tagline;
      brandSub.style.color = theme.textDim;
    }
  }
}
