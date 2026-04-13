/**
 * ADASOverlay — HUD elements for ADAS visualizations.
 * 
 * Renders:
 *   - Speedometer (digital)
 *   - AEB warning/braking indicator
 *   - Parking sensor distance bars
 *   - Scenario info (world name, objective)
 *   - Collision/parking result banners
 */

export class ADASOverlay {
  constructor() {
    this.container = null;
    this._create();
  }

  _create() {
    // Main ADAS overlay container
    this.container = document.createElement('div');
    this.container.id = 'adas-overlay';
    this.container.innerHTML = `
      <!-- Speed + AEB cluster (bottom-left) -->
      <div id="adas-cluster">
        <div id="adas-speed">
          <span id="adas-speed-val">0</span>
          <span id="adas-speed-unit">mph</span>
        </div>
        <div id="adas-limit">
          <span id="adas-limit-val">50</span>
        </div>
        <div id="adas-aeb" class="adas-status hidden">
          <span id="adas-aeb-label">AEB</span>
        </div>
      </div>

      <!-- Parking sensors (bottom-center, shown when reversing/parking) -->
      <div id="adas-parking" class="hidden">
        <div class="park-label">PARKING SENSORS</div>
        <div id="park-visual">
          <div class="park-car-top">
            <div class="park-sensor" id="park-fl"></div>
            <div class="park-sensor" id="park-fc"></div>
            <div class="park-sensor" id="park-fr"></div>
          </div>
          <div class="park-car-body"></div>
          <div class="park-car-bottom">
            <div class="park-sensor" id="park-rl"></div>
            <div class="park-sensor" id="park-rc"></div>
            <div class="park-sensor" id="park-rr"></div>
          </div>
        </div>
        <div id="park-distance">
          <span id="park-dist-val">—</span>
          <span id="park-dist-label"></span>
        </div>
      </div>

      <!-- World / scenario info (top-center) -->
      <div id="adas-scenario">
        <span id="adas-world-name"></span>
        <span id="adas-objective"></span>
      </div>

      <!-- Result banner (center, hidden until triggered) -->
      <div id="adas-result" class="hidden">
        <div id="adas-result-icon"></div>
        <div id="adas-result-title"></div>
        <div id="adas-result-detail"></div>
        <div id="adas-result-action">Press R to retry</div>
      </div>

      <!-- Portal proximity indicator -->
      <div id="adas-portal" class="hidden">
        <span id="adas-portal-label">APPROACHING PORTAL</span>
        <span id="adas-portal-name"></span>
      </div>

      <!-- Camera mode button (bottom-right) -->
      <button id="cam-mode-btn" title="Cycle camera (V)">
        <span id="cam-mode-icon">🎥</span>
        <span id="cam-mode-label">CHASE</span>
      </button>

      <!-- Battery HUD (charging world only) -->
      <div id="battery-hud" class="hidden">
        <div class="battery-title">⚡ BATTERY</div>
        <div class="battery-bar-outer">
          <div class="battery-bar-fill" id="battery-fill"></div>
          <span class="battery-pct" id="battery-pct">12%</span>
        </div>
        <div class="battery-status" id="battery-status">Park in the EV bay</div>
        <div class="battery-segments">
          <div class="batt-seg" id="bseg-0"></div>
          <div class="batt-seg" id="bseg-1"></div>
          <div class="batt-seg" id="bseg-2"></div>
          <div class="batt-seg" id="bseg-3"></div>
          <div class="batt-seg" id="bseg-4"></div>
        </div>
      </div>
    `;

    document.getElementById('app').appendChild(this.container);

    // Camera mode button click → dispatch cycling event
    const btn = document.getElementById('cam-mode-btn');
    if (btn) btn.addEventListener('click', () => window.dispatchEvent(new Event('cam-cycle')));

    // Listen for mode changes to update label
    window.addEventListener('cam-mode-changed', (e) => {
      const icons = { CHASE: '🎥', HOOD: '🚗', CINEMATIC: '🎬' };
      const labelEl = document.getElementById('cam-mode-label');
      const iconEl = document.getElementById('cam-mode-icon');
      if (labelEl) labelEl.textContent = e.detail.mode;
      if (iconEl) iconEl.textContent = icons[e.detail.mode] || '🎥';
    });
  }

  /**
   * Update all HUD elements each frame.
   */
  update(adasState, worldId, scenarioState) {
    if (!adasState) return;

    // Speed
    const speedEl = document.getElementById('adas-speed-val');
    if (speedEl) speedEl.textContent = Math.round(adasState.speedMph);

    // Speed limit
    const limitEl = document.getElementById('adas-limit-val');
    if (limitEl) limitEl.textContent = adasState.speedLimit;

    // AEB indicator
    const aebEl = document.getElementById('adas-aeb');
    const aebLabel = document.getElementById('adas-aeb-label');
    if (aebEl) {
      if (adasState.aebState === 'braking') {
        aebEl.classList.remove('hidden');
        aebEl.className = 'adas-status aeb-braking';
        aebLabel.textContent = 'AEB ACTIVE';
      } else if (adasState.aebState === 'warning') {
        aebEl.classList.remove('hidden');
        aebEl.className = 'adas-status aeb-warning';
        aebLabel.textContent = 'COLLISION WARNING';
      } else if (adasState.aebState === 'stopped') {
        aebEl.classList.remove('hidden');
        aebEl.className = 'adas-status aeb-stopped';
        aebLabel.textContent = 'AEB — VEHICLE STOPPED';
      } else {
        aebEl.className = 'adas-status hidden';
      }
    }

    // Parking sensors
    const parkEl = document.getElementById('adas-parking');
    if (parkEl) {
      if (adasState.parkingZone) {
        parkEl.classList.remove('hidden');

        // Update sensor bars
        this._updateSensorBar('park-fl', adasState.parkingDistances.frontLeft);
        this._updateSensorBar('park-fc', adasState.parkingDistances.frontCenter);
        this._updateSensorBar('park-fr', adasState.parkingDistances.frontRight);
        this._updateSensorBar('park-rl', adasState.parkingDistances.rearLeft);
        this._updateSensorBar('park-rc', adasState.parkingDistances.rearCenter);
        this._updateSensorBar('park-rr', adasState.parkingDistances.rearRight);

        const distVal = document.getElementById('park-dist-val');
        const distLabel = document.getElementById('park-dist-label');
        if (distVal) {
          const minDist = Math.min(
            ...Object.values(adasState.parkingDistances).filter((d) => d < Infinity)
          );
          distVal.textContent = minDist < Infinity ? `${minDist.toFixed(1)}m` : '—';
          distVal.style.color = adasState.parkingZone ? `#${adasState.parkingZone.color.toString(16).padStart(6, '0')}` : '#fff';
        }
        if (distLabel) {
          distLabel.textContent = adasState.parkingZone ? adasState.parkingZone.label : '';
        }
      } else {
        parkEl.classList.add('hidden');
      }
    }

    // Scenario state
    if (scenarioState) {
      if (scenarioState.type === 'parking' && scenarioState.parked) {
        this.showResult('success', 'PARKED!', `Score: ${scenarioState.parkScore}/100\nTime: ${scenarioState.parkTimer.toFixed(1)}s`);
      }
      if (scenarioState.type === 'aeb' && scenarioState.result === 'hit') {
        this.showResult('fail', 'COLLISION!', 'The AEB system failed to stop in time.\nTry approaching at a lower speed.');
      }
    }

    // Battery HUD (charging world)
    const battEl = document.getElementById('battery-hud');
    if (battEl) {
      if (scenarioState?.type === 'charging') {
        battEl.classList.remove('hidden');

        const lvl = scenarioState.batteryLevel ?? 0;
        const fillEl  = document.getElementById('battery-fill');
        const pctEl   = document.getElementById('battery-pct');
        const statEl  = document.getElementById('battery-status');

        if (fillEl) {
          fillEl.style.width = `${lvl}%`;
          const hue = (lvl / 100) * 120; // red → green
          fillEl.style.background = `hsl(${hue}, 100%, 45%)`;
          fillEl.style.boxShadow  = `0 0 8px hsl(${hue}, 100%, 55%)`;
        }
        if (pctEl) pctEl.textContent = `${Math.round(lvl)}%`;

        if (statEl) {
          if (scenarioState.state === 'charging')  statEl.textContent = '⚡ CHARGING...';
          else if (scenarioState.state === 'complete') statEl.textContent = '✓ FULLY CHARGED';
          else if (scenarioState.nearCharger)      statEl.textContent = 'Press E to connect charger';
          else                                     statEl.textContent = 'Pull forward into the EV bay';
        }

        // Update 5 segment icons
        const filled = Math.floor((lvl / 100) * 5);
        for (let i = 0; i < 5; i++) {
          const seg = document.getElementById(`bseg-${i}`);
          if (seg) seg.classList.toggle('filled', i < filled);
        }
      } else {
        battEl.classList.add('hidden');
      }
    }
  }

  _updateSensorBar(id, distance) {
    const el = document.getElementById(id);
    if (!el) return;

    if (distance >= 5 || distance === Infinity) {
      el.className = 'park-sensor';
      return;
    }

    if (distance < 0.5) el.className = 'park-sensor zone-danger';
    else if (distance < 1.0) el.className = 'park-sensor zone-vclose';
    else if (distance < 1.5) el.className = 'park-sensor zone-close';
    else if (distance < 2.5) el.className = 'park-sensor zone-near';
    else el.className = 'park-sensor zone-detected';
  }

  setWorldInfo(worldName, objective) {
    const nameEl = document.getElementById('adas-world-name');
    const objEl = document.getElementById('adas-objective');
    if (nameEl) nameEl.textContent = worldName;
    if (objEl) objEl.textContent = objective;
  }

  showResult(type, title, detail) {
    const el = document.getElementById('adas-result');
    if (!el) return;

    el.classList.remove('hidden');
    el.className = `result-${type}`;

    const iconEl = document.getElementById('adas-result-icon');
    const titleEl = document.getElementById('adas-result-title');
    const detailEl = document.getElementById('adas-result-detail');

    if (iconEl) iconEl.textContent = type === 'success' ? '✓' : '✗';
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
  }

  hideResult() {
    const el = document.getElementById('adas-result');
    if (el) el.classList.add('hidden');
  }

  showPortalHint(label) {
    const el = document.getElementById('adas-portal');
    const nameEl = document.getElementById('adas-portal-name');
    if (el) el.classList.remove('hidden');
    if (nameEl) nameEl.textContent = label;
  }

  hidePortalHint() {
    const el = document.getElementById('adas-portal');
    if (el) el.classList.add('hidden');
  }

  show() {
    if (this.container) this.container.style.display = '';
  }

  hide() {
    if (this.container) this.container.style.display = 'none';
  }
}
