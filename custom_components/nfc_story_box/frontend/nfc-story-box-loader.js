// NFC Story Box – loader.
// Home Assistant loads this small file on every dashboard. The card pages themselves (and the fonts and
// PDF library of the label page) are only fetched when a dashboard actually shows the card.

const HERE = new URL(import.meta.url);
window.__NSB_LOADER = true;
window.__NSB_BASE = new URL(".", HERE).href;

function define(tag, file, name, description) {
  const IMPL = tag + "-impl";
  let loading = null;
  const load = () => (loading ||= import(new URL("./" + file + HERE.search, HERE).href));

  class Loader extends HTMLElement {
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
        this.textContent = "NFC Story Box: " + (err && err.message ? err.message : err);
      }
    }

    static getStubConfig() { return {}; }

    // The form that replaces YAML in the dashboard editor
    static async getConfigElement() {
      await import(new URL("./nfc-story-box-editor.js" + HERE.search, HERE).href);
      return document.createElement(tag + "-editor");
    }
  }

  if (!customElements.get(tag)) {
    customElements.define(tag, Loader);
    window.customCards = window.customCards || [];
    window.customCards.push({ type: tag, name, description });
  }
}

define(
  "nfc-story-box-card", "nfc-story-box-card.js", "NFC Story Box",
  "Kortin á kassanum: hvað þau spila og prentanlegir miðar með forsíðumyndum.",
);
define(
  "nfc-story-box-stats-card", "nfc-story-box-stats-card.js", "NFC Story Box – tölfræði",
  "Hlustun, vinsælustu kortin og hvenær spilarinn er notaður.",
);
