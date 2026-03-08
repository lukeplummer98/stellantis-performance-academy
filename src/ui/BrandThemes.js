/**
 * BrandThemes — Brand-specific visual themes that apply when a vehicle is active.
 * Each brand gets its own color palette, lighting mood, and HUD styling.
 */

export const brandThemes = {
  Lotus: {
    name: 'LOTUS',
    accent: '#00b140',        // Lotus British Racing Green
    accentRgb: '0, 177, 64',
    secondary: '#c8a84e',     // Lotus gold
    secondaryRgb: '200, 168, 78',
    background: '#050a05',
    surface: '#0a140a',
    border: '#1a2e1a',
    text: '#e0f0e0',
    textDim: '#4a6a4a',
    fogColor: 0x050a05,
    ambientColor: 0x203020,
    ambientIntensity: 0.5,
    spotColor: 0xccffcc,
    spotIntensity: 2.5,
    tagline: 'FOR THE DRIVERS',
    logo: `
      <svg viewBox="0 0 120 40" class="brand-logo-svg">
        <text x="60" y="24" text-anchor="middle" font-size="16" font-weight="700" letter-spacing="6" fill="currentColor">LOTUS</text>
        <line x1="10" y1="32" x2="110" y2="32" stroke="currentColor" stroke-width="0.5" opacity="0.5"/>
        <text x="60" y="38" text-anchor="middle" font-size="5" letter-spacing="3" fill="currentColor" opacity="0.6">FOR THE DRIVERS</text>
      </svg>
    `,
  },
  Peugeot: {
    name: 'PEUGEOT',
    accent: '#0066ff',
    accentRgb: '0, 102, 255',
    secondary: '#ffffff',
    secondaryRgb: '255, 255, 255',
    background: '#0a0a0a',
    surface: '#141414',
    border: '#222',
    text: '#e8e8e8',
    textDim: '#666',
    fogColor: 0x0a0a0a,
    ambientColor: 0x404060,
    ambientIntensity: 0.4,
    spotColor: 0xffffff,
    spotIntensity: 2,
    tagline: 'MOTION & EMOTION',
    logo: null, // uses default text branding
  },
  // Default Stellantis theme
  _default: {
    name: 'STELLANTIS',
    accent: '#0066ff',
    accentRgb: '0, 102, 255',
    secondary: '#ffffff',
    secondaryRgb: '255, 255, 255',
    background: '#0a0a0a',
    surface: '#141414',
    border: '#222',
    text: '#e8e8e8',
    textDim: '#666',
    fogColor: 0x0a0a0a,
    ambientColor: 0x404060,
    ambientIntensity: 0.4,
    spotColor: 0xffffff,
    spotIntensity: 2,
    tagline: 'PERFORMANCE ACADEMY',
    logo: null,
  },
};

export function getTheme(brand) {
  return brandThemes[brand] || brandThemes._default;
}
