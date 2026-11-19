// NFC Story Box – visual editor for the two dashboard cards (the form shown instead of YAML).
// Loaded only when someone edits a card in the dashboard editor.

const WORDS = {
  en: {
    entry_id: "Box (only needed with more than one)", brand: "Small text on the labels",
    return_text: "Line at the bottom of the back labels", style: "Default label style", sheet: "Label paper",
    safe_bottom: "Space above the phone's navigation bar (px)", config_entry_id: "Music Assistant (only if it picks the wrong one)",
    title: "Title", span: "Days shown", days: "days", advanced: "More options",
    big: "Big picture", classic: "Classic", blur: "Full picture", pop: "Colourful", clean: "Simple",
    cut: "Cut them out yourself", herma5028: "HERMA 5028 sticker sheets",
    help_card: "The card page for the box: what each card plays and printable labels.",
    help_stats: "How much the box is used: totals, cards played most and when it is used.",
  },
  is: {
    entry_id: "Kassi (aðeins ef þeir eru fleiri en einn)", brand: "Lítill texti á miðunum",
    return_text: "Lína neðst á bakhlið miðanna", style: "Sjálfgefið útlit miða", sheet: "Pappír fyrir miða",
    safe_bottom: "Bil fyrir ofan stikuna neðst í símanum (px)", config_entry_id: "Music Assistant (aðeins ef rangur er valinn)",
    title: "Titill", span: "Dagar sem sjást", days: "dagar", advanced: "Fleiri stillingar",
    big: "Stór mynd", classic: "Klassískt", blur: "Heil mynd", pop: "Litríkt", clean: "Einfalt",
    cut: "Klippa sjálf", herma5028: "HERMA 5028 límmiðablöð",
    help_card: "Kortasíðan: hvað hvert kort spilar og prentanlegir miðar.",
    help_stats: "Hversu mikið kassinn er notaður: samtölur, vinsælustu kortin og hvenær hann er notaður.",
  },
  sv: {
    entry_id: "Låda (behövs bara med fler än en)", brand: "Liten text på etiketterna",
    return_text: "Rad längst ner på etiketternas baksida", style: "Standardutseende för etiketter", sheet: "Etikettpapper",
    safe_bottom: "Utrymme ovanför telefonens navigeringsfält (px)", config_entry_id: "Music Assistant (bara om fel väljs)",
    title: "Rubrik", span: "Dagar som visas", days: "dagar", advanced: "Fler alternativ",
    big: "Stor bild", classic: "Klassisk", blur: "Hel bild", pop: "Färgglad", clean: "Enkel",
    cut: "Klipp själv", herma5028: "HERMA 5028 klistermärkesark",
    help_card: "Kortsidan: vad varje kort spelar och utskrivbara etiketter.",
    help_stats: "Hur mycket lådan används: summor, mest spelade kort och när den används.",
  },
};

const SCHEMAS = {
  "nfc-story-box-card": (w) => [
    { name: "brand", selector: { text: {} } },
    { name: "return_text", selector: { text: {} } },
    { name: "style", selector: { select: { mode: "dropdown", options: ["big", "classic", "blur", "pop", "clean"].map((v) => ({ value: v, label: w[v] })) } } },
    { name: "sheet", selector: { select: { mode: "dropdown", options: ["herma5028", "cut"].map((v) => ({ value: v, label: w[v] })) } } },
    { type: "expandable", name: "", title: w.advanced, flatten: true, schema: [
      { name: "entry_id", selector: { config_entry: { integration: "nfc_story_box" } } },
      { name: "config_entry_id", selector: { config_entry: { integration: "music_assistant" } } },
      { name: "safe_bottom", selector: { number: { min: 0, max: 120, step: 4, mode: "box" } } },
    ] },
  ],
  "nfc-story-box-stats-card": (w) => [
    { name: "title", selector: { text: {} } },
    { name: "span", selector: { select: { mode: "box", options: [7, 30, 90].map((v) => ({ value: v, label: `${v} ${w.days}` })) } } },
    { name: "entry_id", selector: { config_entry: { integration: "nfc_story_box" } } },
  ],
};

function make(tag) {
  class Editor extends HTMLElement {
    setConfig(config) { this._config = config; this._render(); }
    set hass(hass) { this._hass = hass; if (this._form) this._form.hass = hass; else this._render(); }

    _words() { return WORDS[(this._hass && this._hass.language || "en").slice(0, 2)] || WORDS.en; }

    _render() {
      if (!this._config || !this._hass) return;
      const w = this._words();
      if (!this._form) {
        this._help = document.createElement("p");
        this._help.style.cssText = "margin:0 0 12px;color:var(--secondary-text-color);font-size:14px";
        this._form = document.createElement("ha-form");
        this._form.addEventListener("value-changed", (ev) => {
          ev.stopPropagation();
          const next = { ...this._config };
          for (const [k, v] of Object.entries(ev.detail.value)) {
            if (v === "" || v === undefined || v === null || (k === "safe_bottom" && !v)) delete next[k]; else next[k] = v;
          }
          this._config = next;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: next }, bubbles: true, composed: true }));
        });
        this.replaceChildren(this._help, this._form);
      }
      this._help.textContent = tag === "nfc-story-box-card" ? w.help_card : w.help_stats;
      this._form.hass = this._hass;
      this._form.schema = SCHEMAS[tag](w);
      this._form.data = this._config;
      this._form.computeLabel = (s) => w[s.name] || s.name;
    }
  }
  return Editor;
}

for (const tag of Object.keys(SCHEMAS)) {
  const name = tag + "-editor";
  if (!customElements.get(name)) customElements.define(name, make(tag));
}
