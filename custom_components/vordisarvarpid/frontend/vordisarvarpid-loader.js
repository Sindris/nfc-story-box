// Vordísarvarpið – loader.
// Home Assistant loads this small file on every dashboard. The card page itself (and its fonts and
// PDF library) is only fetched when a dashboard actually shows the card.

const TAG = "vordisarvarpid-kortamidar-card";
const IMPL = TAG + "-impl";
const HERE = new URL(import.meta.url);
window.__VORDIS_LOADER = true;
window.__VORDIS_BASE = new URL(".", HERE).href;

let loading = null;
const load = () => (loading ||= import(new URL("./vordisarvarpid-kortamidar-card.js" + HERE.search, HERE).href));

class VordisarvarpidLoader extends HTMLElement {
  setConfig(config) {
    this._config = config;
    if (this._el) this._el.setConfig(config); else this._start();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._el) this._el.hass = hass;
  }

  getCardSize() { return this._el && this._el.getCardSize ? this._el.getCardSize() : 8; }

  async _start() {
    if (this._starting) return;
    this._starting = true;
    try {
      await load();
      const el = document.createElement(IMPL);
      el.setConfig(this._config || {});
      if (this._hass) el.hass = this._hass;
      this._el = el;
      this.replaceChildren(el);
    } catch (err) {
      this._starting = false;
      this.textContent = "Vordísarvarpið: " + (err && err.message ? err.message : err);
    }
  }

  static getStubConfig() { return {}; }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, VordisarvarpidLoader);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: TAG,
    name: "Vordísarvarpið",
    description: "Kortin á Vordísarvarpinu: hvað þau spila og prentanlegir miðar með forsíðumyndum.",
  });
}
