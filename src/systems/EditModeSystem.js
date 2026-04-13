/**
 * EditModeSystem — Scene layout editor for 3D objects.
 *
 * Features:
 *  - Toggle edit mode via UI button
 *  - Click to select a registered object (outline highlight)
 *  - Drag on ground plane to reposition
 *  - Panel with X / Y / Z position inputs + uniform scale input
 *  - Saves layout to localStorage key 'editLayout'
 *  - Restores saved layout on load
 */
import * as THREE from 'three';

const STORAGE_KEY = 'editLayout_v1';

export class EditModeSystem {
  /**
   * @param {THREE.Camera} camera
   * @param {THREE.Scene|THREE.Group} rootGroup  - parent that contains all editable objects
   */
  constructor(camera, rootGroup) {
    this._camera    = camera;
    this._root      = rootGroup;
    this._active    = false;
    this._objects   = new Map();   // name → { object, originalPos, originalScale }
    this._selected  = null;

    this._raycaster = new THREE.Raycaster();
    this._dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);  // y=0 ground
    this._dragOffset= new THREE.Vector3();
    this._dragging  = false;

    // Highlight shader via outline mesh
    this._outlineMesh = null;

    // DOM
    this._panel    = null;
    this._btn      = null;
    this._buildUI();

    // Bound handlers
    this._onMouseDown = (e) => this._handleMouseDown(e);
    this._onMouseMove = (e) => this._handleMouseMove(e);
    this._onMouseUp   = (e) => this._handleMouseUp(e);
  }

  // ─── Registration ────────────────────────────────────────────

  /**
   * Register a Three.js Object3D as editable.
   * @param {string} name   - unique label shown in the panel
   * @param {THREE.Object3D} object
   */
  register(name, object) {
    this._objects.set(name, {
      object,
      originalPos:   object.position.clone(),
      originalScale: object.scale.clone(),
    });
    this._restoreSaved(name, object);
  }

  // ─── Persistence ─────────────────────────────────────────────

  _saveAll() {
    const data = {};
    this._objects.forEach((entry, name) => {
      const o = entry.object;
      data[name] = {
        px: o.position.x, py: o.position.y, pz: o.position.z,
        sx: o.scale.x,    sy: o.scale.y,    sz: o.scale.z,
        ry: o.rotation.y,
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  _restoreSaved(name, object) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data[name]) return;
      const d = data[name];
      object.position.set(d.px, d.py, d.pz);
      object.scale.set(d.sx, d.sy, d.sz);
      if (d.ry !== undefined) object.rotation.y = d.ry;
    } catch (_) { /* ignore */ }
  }

  resetAll() {
    this._objects.forEach((entry, name) => {
      entry.object.position.copy(entry.originalPos);
      entry.object.scale.copy(entry.originalScale);
    });
    localStorage.removeItem(STORAGE_KEY);
    this._updatePanel();
  }

  // ─── Toggle ──────────────────────────────────────────────────

  setActive(active) {
    this._active = active;
    this._btn.classList.toggle('edit-mode-active', active);
    this._panel.style.display = active ? 'block' : 'none';

    if (active) {
      document.addEventListener('mousedown', this._onMouseDown);
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('mouseup',   this._onMouseUp);
      document.body.style.cursor = 'default';
    } else {
      document.removeEventListener('mousedown', this._onMouseDown);
      document.removeEventListener('mousemove', this._onMouseMove);
      document.removeEventListener('mouseup',   this._onMouseUp);
      this._deselect();
      document.body.style.cursor = '';
    }
  }

  toggle() { this.setActive(!this._active); }
  get isActive() { return this._active; }

  // ─── Mouse Interaction ────────────────────────────────────────

  _hitTest(e) {
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth)  *  2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this._raycaster.setFromCamera(mouse, this._camera);

    const meshes = [];
    this._objects.forEach(({ object }) => {
      object.traverse((c) => { if (c.isMesh) meshes.push(c); });
    });

    const hits = this._raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;

    // Walk up to the registered root object
    let obj = hits[0].object;
    while (obj) {
      for (const [name, entry] of this._objects) {
        if (entry.object === obj || obj.isDescendantOf?.(entry.object)) {
          // Check ancestry
          let cur = obj;
          while (cur) {
            if (cur === entry.object) return { name, entry, hitPoint: hits[0].point };
            cur = cur.parent;
          }
        }
      }
      obj = obj.parent;
    }
    return null;
  }

  _handleMouseDown(e) {
    if (e.button !== 0 || !this._active) return;

    // Don't interfere with panel clicks
    if (this._panel.contains(e.target) || this._btn.contains(e.target)) return;

    const result = this._hitTest(e);
    if (result) {
      e.preventDefault();
      e.stopPropagation();
      this._select(result.name, result.entry);

      // Calculate drag offset on ground plane
      const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth)  *  2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      this._raycaster.setFromCamera(mouse, this._camera);
      const groundHit = new THREE.Vector3();
      this._dragPlane.constant = -result.entry.object.position.y;
      if (this._raycaster.ray.intersectPlane(this._dragPlane, groundHit)) {
        this._dragOffset.subVectors(result.entry.object.position, groundHit);
      }
      this._dragging = true;
      document.body.style.cursor = 'grabbing';
    } else {
      this._deselect();
    }
  }

  _handleMouseMove(e) {
    if (!this._active) return;

    if (!this._dragging) {
      const result = this._hitTest(e);
      document.body.style.cursor = result ? 'grab' : 'default';
      return;
    }

    if (!this._selected) return;

    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth)  *  2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this._raycaster.setFromCamera(mouse, this._camera);
    const groundHit = new THREE.Vector3();
    if (this._raycaster.ray.intersectPlane(this._dragPlane, groundHit)) {
      const newPos = groundHit.clone().add(this._dragOffset);
      this._selected.entry.object.position.x = newPos.x;
      this._selected.entry.object.position.z = newPos.z;
      // Keep Y unchanged (use panel for Y)
      this._syncPanelFromObject();
    }
  }

  _handleMouseUp(e) {
    if (e.button !== 0) return;
    if (this._dragging) {
      this._dragging = false;
      document.body.style.cursor = 'default';
      this._saveAll();
    }
  }

  // ─── Selection ───────────────────────────────────────────────

  _select(name, entry) {
    this._deselect();
    this._selected = { name, entry };
    this._highlightObject(entry.object, true);
    this._updatePanel();
    this._populateObjectSelector(name);
  }

  _deselect() {
    if (this._selected) {
      this._highlightObject(this._selected.entry.object, false);
    }
    this._selected = null;
    this._syncPanelFromObject();
  }

  _highlightObject(object, on) {
    // Toggle a yellow emissive tint on all meshes
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (on) {
            m.userData._origEmissive = m.emissive ? m.emissive.clone() : new THREE.Color(0);
            m.userData._origEmissiveInt = m.emissiveIntensity ?? 1;
            if (m.emissive) m.emissive.set(0xffaa00);
            m.emissiveIntensity = 1.5;
          } else {
            if (m.emissive && m.userData._origEmissive) {
              m.emissive.copy(m.userData._origEmissive);
              m.emissiveIntensity = m.userData._origEmissiveInt ?? 1;
            }
          }
        });
      }
    });
  }

  // ─── UI ──────────────────────────────────────────────────────

  _buildUI() {
    // Toggle button
    const btn = document.createElement('button');
    btn.id = 'edit-mode-btn';
    btn.textContent = '✏ EDIT LAYOUT';
    btn.title = 'Toggle 3D Edit Mode — drag objects to reposition, adjust scale';
    btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(btn);
    this._btn = btn;

    // Panel
    const panel = document.createElement('div');
    panel.id = 'edit-mode-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="emp-header">
        <span>✏ EDIT MODE</span>
        <button id="emp-close" title="Close">✕</button>
      </div>
      <div class="emp-section">
        <label class="emp-label">OBJECT</label>
        <select id="emp-object-select"></select>
      </div>
      <div class="emp-section">
        <label class="emp-label">POSITION</label>
        <div class="emp-row">
          <div class="emp-field"><span>X</span><input type="number" id="emp-px" step="0.1"></div>
          <div class="emp-field"><span>Y</span><input type="number" id="emp-py" step="0.1"></div>
          <div class="emp-field"><span>Z</span><input type="number" id="emp-pz" step="0.1"></div>
        </div>
      </div>
      <div class="emp-section">
        <label class="emp-label">SCALE</label>
        <div class="emp-row">
          <div class="emp-field"><span>S</span><input type="number" id="emp-scale" step="0.05" min="0.01"></div>
          <div class="emp-field"><span>RY°</span><input type="number" id="emp-ry" step="5"></div>
        </div>
      </div>
      <div class="emp-section">
        <label class="emp-label">ACTIONS</label>
        <div class="emp-actions">
          <button id="emp-save">💾 SAVE</button>
          <button id="emp-reset">↺ RESET ALL</button>
        </div>
        <div id="emp-saved-msg" class="emp-saved-msg" style="display:none">Saved ✓</div>
      </div>
      <div class="emp-hint">Drag objects in 3D view to move. Use Y field to adjust height.</div>
    `;
    document.body.appendChild(panel);
    this._panel = panel;

    // Populate dropdown
    this._populateObjectSelector();

    // Object select dropdown
    const sel = panel.querySelector('#emp-object-select');
    sel.addEventListener('change', () => {
      const name = sel.value;
      const entry = this._objects.get(name);
      if (entry) this._select(name, entry);
    });

    // Position inputs
    ['px','py','pz'].forEach((id, i) => {
      panel.querySelector(`#emp-${id}`).addEventListener('change', (e) => {
        if (!this._selected) return;
        const axis = ['x','y','z'][i];
        this._selected.entry.object.position[axis] = parseFloat(e.target.value) || 0;
        this._saveAll();
      });
    });

    // Scale
    panel.querySelector('#emp-scale').addEventListener('change', (e) => {
      if (!this._selected) return;
      const s = Math.max(0.01, parseFloat(e.target.value) || 1);
      this._selected.entry.object.scale.setScalar(s);
      this._saveAll();
    });

    // Rotation Y
    panel.querySelector('#emp-ry').addEventListener('change', (e) => {
      if (!this._selected) return;
      this._selected.entry.object.rotation.y = (parseFloat(e.target.value) || 0) * (Math.PI / 180);
      this._saveAll();
    });

    // Save button
    panel.querySelector('#emp-save').addEventListener('click', () => {
      this._saveAll();
      const msg = panel.querySelector('#emp-saved-msg');
      msg.style.display = 'block';
      setTimeout(() => { msg.style.display = 'none'; }, 1800);
    });

    // Reset button
    panel.querySelector('#emp-reset').addEventListener('click', () => {
      if (confirm('Reset all objects to their original positions?')) {
        this.resetAll();
      }
    });

    // Close button
    panel.querySelector('#emp-close').addEventListener('click', () => this.setActive(false));
  }

  _populateObjectSelector(selectedName = null) {
    const sel = this._panel.querySelector('#emp-object-select');
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— click an object or select —';
    sel.appendChild(placeholder);
    this._objects.forEach((_, name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === selectedName) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  _syncPanelFromObject() {
    const o = this._selected?.entry?.object;
    const set = (id, val) => {
      const el = this._panel.querySelector(`#emp-${id}`);
      if (el) el.value = typeof val === 'number' ? val.toFixed(3) : '';
    };
    if (o) {
      set('px', o.position.x);
      set('py', o.position.y);
      set('pz', o.position.z);
      set('scale', o.scale.x);
      set('ry', (o.rotation.y * (180 / Math.PI)));
    } else {
      ['px','py','pz','scale','ry'].forEach((id) => set(id, ''));
    }
  }

  _updatePanel() {
    this._syncPanelFromObject();
    if (this._selected) {
      const sel = this._panel.querySelector('#emp-object-select');
      sel.value = this._selected.name;
    }
  }

  // ─── Dispose ─────────────────────────────────────────────────

  dispose() {
    this.setActive(false);
    this._btn?.remove();
    this._panel?.remove();
  }
}
