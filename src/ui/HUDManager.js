/**
 * HUDManager — Controls all UI state: loading screen, vehicle selection, diagnostic panel.
 */
export class HUDManager {
  constructor() {
    this.loadingScreen = document.getElementById('loading-screen');
    this.loaderFill = document.querySelector('.loader-fill');
    this.loaderStatus = document.querySelector('.loader-status');
    this.vehicleSelectPanel = document.getElementById('vehicle-select');
    this.vehicleList = document.getElementById('vehicle-list');
    this.diagnosticPanel = document.getElementById('diagnostic-panel');

    this._bindEvents();
  }

  _bindEvents() {
    window.addEventListener('model-load-progress', (e) => {
      const { name, progress } = e.detail;
      this.setLoadingProgress(progress, `Loading ${name}...`);
    });

    window.addEventListener('mode-change', (e) => {
      this._onModeChange(e.detail.mode);
    });
  }

  setLoadingProgress(pct, status) {
    if (this.loaderFill) this.loaderFill.style.width = `${pct}%`;
    if (this.loaderStatus) this.loaderStatus.textContent = status;
  }

  hideLoading() {
    if (this.loadingScreen) {
      this.loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        this.loadingScreen.style.display = 'none';
      }, 600);
    }
  }

  populateVehicleList(vehicles, onSelect) {
    this.vehicleList.innerHTML = '';
    for (const [name, data] of vehicles) {
      const card = document.createElement('div');
      card.className = 'vehicle-card';
      card.innerHTML = `
        <div class="vehicle-name">${name}</div>
        <div class="vehicle-brand">${data.config.brand}</div>
      `;
      card.addEventListener('click', () => onSelect(name));
      this.vehicleList.appendChild(card);
    }
  }

  _onModeChange(mode) {
    if (mode !== 'diagnose') {
      this.diagnosticPanel.classList.add('hidden');
    }
  }
}
