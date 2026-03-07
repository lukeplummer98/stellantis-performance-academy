/**
 * Vehicle Registry — Drop your .glb files into public/ and add entries here.
 *
 * Each entry defines:
 *   name         — Display name
 *   brand        — Stellantis brand (Dodge, Jeep, Ram, Alfa Romeo, Maserati, Fiat, Chrysler, etc.)
 *   path         — Path to .glb relative to public/
 *   position     — [x, y, z] world placement
 *   scale        — Uniform scale factor (tweak until it looks right)
 *   rotation     — Y-axis rotation in radians
 *   seatPosition — Camera offset from vehicle origin when sitting inside
 *   doors        — Named mesh references for door open/close animations
 *   systems      — Diagnostic system statuses: 'ok' | 'warn' | 'error'
 *
 * HOW TO ADD A VEHICLE:
 * 1. Drop your .glb file into the public/ folder
 * 2. Add a config object below
 * 3. Refresh the browser — it auto-loads on startup
 */

export const vehicleConfigs = [
  {
    name: 'Peugeot 3008',
    brand: 'Peugeot',
    path: '/3008.glb',
    position: [0, 0, 0],
    scale: 1,
    rotation: 0,
    seatPosition: { x: 0.4, y: 1.3, z: 0.2 },
    doors: {},
    systems: {
      'Engine': 'ok',
      'Transmission': 'ok',
      'Brakes': 'ok',
      'Suspension': 'ok',
      'Electrical': 'ok',
      'Cooling': 'ok',
    },
  },
  // ──────────────────────────────────────────
  // MORE VEHICLES — drop .glb in public/ and add entries
  // ──────────────────────────────────────────
  // {
  //   name: 'Dodge Charger Daytona',
  //   brand: 'Dodge',
  //   path: '/dodge_charger_daytona.glb',
  //   position: [0, 0, 0],
  //   scale: 1,
  //   rotation: 0,
  //   seatPosition: { x: 0.4, y: 1.2, z: 0.2 },
  //   doors: {
  //     driverDoor: 'Door_FL',      // mesh name in the .glb
  //     passengerDoor: 'Door_FR',
  //   },
  //   systems: {
  //     'Engine':       'ok',
  //     'Transmission': 'ok',
  //     'Brakes':       'warn',
  //     'Suspension':   'ok',
  //     'Electrical':   'ok',
  //     'Cooling':      'ok',
  //   },
  // },
  //
  // {
  //   name: 'Jeep Wrangler Rubicon',
  //   brand: 'Jeep',
  //   path: '/jeep_wrangler_rubicon.glb',
  //   position: [8, 0, 0],
  //   scale: 1,
  //   rotation: Math.PI / 4,
  //   seatPosition: { x: 0.4, y: 1.5, z: 0.2 },
  //   systems: {
  //     'Engine':       'ok',
  //     'Transmission': 'ok',
  //     'Brakes':       'ok',
  //     'Suspension':   'warn',
  //     'Electrical':   'error',
  //     'Cooling':      'ok',
  //   },
  // },
  //
  // {
  //   name: 'Alfa Romeo Giulia Quadrifoglio',
  //   brand: 'Alfa Romeo',
  //   path: '/alfa_giulia_qv.glb',
  //   position: [-8, 0, 0],
  //   scale: 1,
  //   rotation: -Math.PI / 4,
  //   seatPosition: { x: 0.35, y: 1.1, z: 0.15 },
  //   systems: {
  //     'Engine':       'ok',
  //     'Transmission': 'ok',
  //     'Brakes':       'ok',
  //     'Suspension':   'ok',
  //     'Electrical':   'ok',
  //     'Cooling':      'ok',
  //   },
  // },
];
