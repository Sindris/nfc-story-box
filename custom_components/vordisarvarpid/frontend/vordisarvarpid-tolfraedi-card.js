// Vordísarvarpið – statistics card for Home Assistant (served by the vordisarvarpid integration).
// How much the box is used: today and this week, a bar per day (music and stories), the cards played
// most, when it is used, stories in progress, speakers and the latest plays.
//
// Card config:
//   type: custom:vordisarvarpid-tolfraedi-card
//   entry_id: <config entry>      (only with more than one box)
//   span: 30                      (7, 30 or 90 days; the page can change it)
//   title: Tölfræði               (optional)

const _self = new URL(import.meta.url);
const { trHtml, setLang, locale, dayNames, monthNames } = await import(new URL("./vordisarvarpid-i18n.js" + _self.search, _self).href);

const MUSIC = "#E8407F";
const STORY = "#2EC4B6";
let DAYS = dayNames();      // Monday first
let MONTHS = monthNames();
const QUIET_DAYS = 30;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function dur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  if (sec < 30) return sec ? "<1 mín." : "0 mín.";
  const m = Math.round(sec / 60), h = Math.floor(m / 60);
  return h ? `${h} klst. ${m % 60} mín.` : `${m} mín.`;
}
const short = (sec) => { const m = Math.round((sec || 0) / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : `${m}`; };

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  const hm = d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  if (day === 0) return `í dag ${hm}`;
  if (day === 1) return `í gær ${hm}`;
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${hm}`;
}
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : Infinity);

const CSS = `
  :host { display:block; }
  .in { padding:16px; }
  .head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
  .head h2 { margin:0; font-size:20px; flex:1; min-width:120px; }
  .seg { display:inline-flex; border:1px solid var(--divider-color); border-radius:10px; overflow:hidden; }
  .seg button { border:0; background:none; color:var(--primary-text-color); padding:6px 12px; font:inherit; font-size:13px; cursor:pointer; }
  .seg button[aria-pressed="true"] { background:var(--primary-color); color:var(--text-primary-color,#fff); }
  .seg button:focus-visible, .btn:focus-visible { outline:2px solid var(--primary-color); outline-offset:2px; }
  .note { padding:10px 12px; border-radius:10px; background:var(--secondary-background-color); font-size:13px; margin-bottom:12px; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px; margin-bottom:18px; }
  .tile { background:var(--secondary-background-color); border-radius:14px; padding:12px 14px; }
  .tile .k { font-size:12px; color:var(--secondary-text-color); }
  .tile .v { font-size:24px; font-weight:700; margin:2px 0; line-height:1.15; }
  .tile .s { font-size:12px; color:var(--secondary-text-color); }
  .up { color:#2e9e5b; } .down { color:#d9534f; }
  .bar { height:6px; border-radius:3px; background:var(--divider-color); margin-top:6px; overflow:hidden; }
  .bar i { display:block; height:100%; background:var(--primary-color); }
  .bar i.full { background:#d9534f; }
  h3 { margin:20px 0 8px; font-size:15px; }
  .legend { display:flex; gap:14px; font-size:12px; color:var(--secondary-text-color); margin:-4px 0 6px; }
  .legend b { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:5px; vertical-align:-1px; }
  svg.chart { width:100%; height:auto; display:block; }
  svg text { fill:var(--secondary-text-color); font-size:9.5px; }
  .grid2 { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:4px 24px; }
  .row { display:flex; align-items:center; gap:10px; padding:6px 0; }
  .thumb { width:38px; height:38px; border-radius:9px; flex:none; background:var(--divider-color) center/cover; display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff; font-size:15px; }
  .grow { flex:1; min-width:0; }
  .name { font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .meta { font-size:12px; color:var(--secondary-text-color); }
  .meter { height:5px; border-radius:3px; background:var(--divider-color); margin-top:4px; overflow:hidden; }
  .meter i { display:block; height:100%; background:var(--primary-color); border-radius:3px; }
  .badge { font-size:11px; padding:1px 7px; border-radius:8px; background:var(--secondary-background-color); border:1px solid var(--divider-color); margin-left:6px; white-space:nowrap; }
  .num { font-size:13px; font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right; }
  .heat { display:grid; grid-template-columns:30px repeat(24,1fr); gap:2px; font-size:10px; color:var(--secondary-text-color); align-items:center; }
  .heat .c { height:14px; border-radius:3px; background:var(--primary-color); }
  .heat .h { text-align:center; }
  .split { display:flex; height:12px; border-radius:6px; overflow:hidden; background:var(--divider-color); margin:4px 0 6px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { font-size:12px; padding:4px 10px; border-radius:14px; background:var(--secondary-background-color); }
  .empty { color:var(--secondary-text-color); font-size:13px; padding:8px 0; }
  .foot { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:20px; font-size:12px; color:var(--secondary-text-color); }
  .btn { border:1px solid var(--divider-color); background:none; color:var(--primary-text-color); border-radius:8px; padding:5px 10px; font:inherit; font-size:12px; cursor:pointer; }
  .btn.warn { border-color:#d9534f; color:#d9534f; }
  .err { color:#d9534f; padding:8px 0; }
`;

class VordisarvarpidTolfraediCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._span = 30;
    this._data = null;
    this._info = null;
    this._confirm = false;
  }

  setConfig(config) {
    this._config = config || {};
    this._span = [7, 30, 90].includes(+this._config.span) ? +this._config.span : 30;
    this._render();
  }

  set hass(hass) {
    const first = !this._hass;
    const langChanged = setLang(hass);
    this._hass = hass;
    if (langChanged && !first) this._render();
    if (first) this._load();
  }

  getCardSize() { return 12; }
  static getStubConfig() { return {}; }

  connectedCallback() {
    this._timer = setInterval(() => this._hass && !document.hidden && this._load(true), 60000);
    if (this._hass && this._data) this._load(true);
  }
  disconnectedCallback() { clearInterval(this._timer); }

  get _entry() { return this._config && this._config.entry_id ? { entry_id: this._config.entry_id } : {}; }

  async _load(quiet) {
    if (!this._hass) return;
    try {
      const [stats, info] = await Promise.all([
        this._hass.callWS({ type: "vordisarvarpid/stats", span: this._span, ...this._entry }),
        this._info || this._hass.callWS({ type: "vordisarvarpid/get", ...this._entry }),
      ]);
      this._data = stats; this._info = info; this._error = "";
    } catch (e) {
      if (!quiet || !this._data) this._error = "Gat ekki sótt tölfræði: " + (e && e.message ? e.message : e);
    }
    this._render();
  }

  _name(entity) {
    const s = this._hass && this._hass.states[entity];
    return (s && s.attributes.friendly_name) || entity;
  }

  _thumb(id, name, story) {
    const img = this._info && this._info.labels && this._info.labels[id] && this._info.labels[id].image;
    const bg = story ? STORY : MUSIC;
    if (img) return `<div class="thumb" role="img" aria-label="${esc(name)}" style="background-image:url('${esc(img)}')"></div>`;
    return `<div class="thumb" aria-hidden="true" style="background:${bg}">${esc((name || "?").trim().charAt(0).toUpperCase())}</div>`;
  }

  _cardById(id) { return ((this._info && this._info.cards) || []).find((c) => c.id === id); }
  _isStory(card) { return card && ["audiobook", "podcast"].includes(card.media_type); }

  _chart(d) {
    const W = 600, H = 150, L = 28, B = 22, T = 6, n = d.series.length;
    const max = Math.max(60, ...d.series.map((x) => x.s));
    const step = max > 7200 ? 3600 : max > 3600 ? 1800 : max > 1800 ? 900 : 600;
    const top = Math.ceil(max / step) * step;
    const bw = (W - L) / n, gap = Math.min(4, bw * 0.25);
    let g = "";
    for (let v = 0; v <= top; v += step) {
      const y = T + (H - B - T) * (1 - v / top);
      g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--divider-color)" stroke-width="0.6"/><text x="${L - 4}" y="${y + 3}" text-anchor="end">${short(v)}</text>`;
    }
    d.series.forEach((x, i) => {
      const px = L + i * bw + gap / 2, w = bw - gap, hs = (H - B - T) / top;
      const hm = x.m * hs, ht = x.t * hs, base = H - B;
      const dt = new Date(x.d + "T12:00:00");
      const label = `${DAYS[(dt.getDay() + 6) % 7]} ${dt.getDate()}. ${MONTHS[dt.getMonth()]}: ${dur(x.s)} (tónlist ${dur(x.m)}, sögur ${dur(x.t)})`;
      g += `<g><title>${esc(label)}</title><rect x="${px}" y="${T}" width="${w}" height="${H - B - T}" fill="transparent"/>`;
      if (x.m) g += `<rect x="${px}" y="${base - hm}" width="${w}" height="${hm}" rx="2" fill="${MUSIC}"/>`;
      if (x.t) g += `<rect x="${px}" y="${base - hm - ht}" width="${w}" height="${ht}" rx="2" fill="${STORY}"/>`;
      g += `</g>`;
      const every = n <= 7 ? 1 : n <= 31 ? 5 : 10;
      if (i % every === 0 || i === n - 1) {
        g += `<text x="${px + w / 2}" y="${H - 7}" text-anchor="middle">${n <= 7 ? DAYS[(dt.getDay() + 6) % 7] : dt.getDate() + "." + (dt.getMonth() + 1)}</text>`;
      }
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Hlustun á dag, mínútur">${g}</svg>`;
  }

  _heat(d) {
    const max = Math.max(1, ...d.heat.flat());
    let h = `<div></div>`;
    for (let i = 0; i < 24; i++) h += `<div class="h">${i % 3 === 0 ? i : ""}</div>`;
    d.heat.forEach((row, wd) => {
      h += `<div>${DAYS[wd]}</div>`;
      row.forEach((v, i) => {
        h += `<div class="c" style="opacity:${v ? (0.18 + 0.82 * v / max).toFixed(2) : 0.06}" title="${DAYS[wd]} kl. ${i}:00 – ${dur(v)}"></div>`;
      });
    });
    return `<div class="heat" role="img" aria-label="Hvenær spilarinn er notaður, vikudagur og klukkustund">${h}</div>`;
  }

  _render() {
    DAYS = dayNames(); MONTHS = monthNames();
    const d = this._data, root = this.shadowRoot;
    const title = (this._config && this._config.title) || "Tölfræði";
    const seg = [7, 30, 90].map((n) => `<button data-span="${n}" aria-pressed="${n === this._span}">${n} d.</button>`).join("");
    let body = "";
    if (this._error && !d) body = `<div class="err">${esc(this._error)}</div>`;
    else if (!d) body = `<div class="empty">Sæki tölfræði …</div>`;
    else body = this._body(d);
    root.innerHTML = trHtml(`<style>${CSS}</style><ha-card><div class="in"><div class="head"><h2>${esc(title)}</h2><div class="seg" role="group" aria-label="Tímabil">${seg}</div></div>${this._error && d ? `<div class="err">${esc(this._error)}</div>` : ""}${body}</div></ha-card>`);
    root.querySelectorAll("[data-span]").forEach((b) => b.addEventListener("click", () => { this._span = +b.dataset.span; this._load(); }));
    const reset = root.querySelector("[data-reset]");
    if (reset) reset.addEventListener("click", async () => {
      if (!this._confirm) { this._confirm = true; this._render(); return; }
      this._confirm = false;
      try { await this._hass.callWS({ type: "vordisarvarpid/reset_stats", ...this._entry }); } catch (e) { this._error = e.message || String(e); }
      this._load();
    });
    const cancel = root.querySelector("[data-cancel]");
    if (cancel) cancel.addEventListener("click", () => { this._confirm = false; this._render(); });
  }

  _body(d) {
    const nothing = !d.total && !d.week && !d.today;
    let h = "";
    if (!d.recording) h += `<div class="note">Slökkt er á skráningu tölfræði (rofinn „Skrá tölfræði“). Ekkert nýtt bætist við.</div>`;
    else if (nothing && !d.since) h += `<div class="note">Hér birtist tölfræðin um leið og spilarinn hefur verið notaður. Skráning hófst núna.</div>`;

    // tiles
    const diff = d.prev_week ? Math.round(((d.week - d.prev_week) / d.prev_week) * 100) : null;
    const trend = diff === null ? (d.week ? "ný vika" : "") : `<span class="${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)}%</span> frá vikunni á undan`;
    const lim = d.daily_limit ? Math.min(100, Math.round((d.listened_today / d.daily_limit) * 100)) : 0;
    h += `<div class="tiles">
      <div class="tile"><div class="k">Í dag</div><div class="v">${dur(Math.max(d.today, d.listened_today))}</div>${d.daily_limit ? `<div class="s">af ${dur(d.daily_limit)}</div><div class="bar" role="img" aria-label="${lim}% af dagsmörkum"><i class="${lim >= 100 ? "full" : ""}" style="width:${lim}%"></i></div>` : `<div class="s">&nbsp;</div>`}</div>
      <div class="tile"><div class="k">Síðustu 7 dagar</div><div class="v">${dur(d.week)}</div><div class="s">${trend || "&nbsp;"}</div></div>
      <div class="tile"><div class="k">Meðaltal á dag</div><div class="v">${dur(d.average)}</div><div class="s">${d.listening_days} af ${d.span} dögum</div></div>
      <div class="tile"><div class="k">Spilanir</div><div class="v">${d.starts}</div><div class="s">${d.starts ? `~${dur(d.total / d.starts)} hver` : "&nbsp;"}</div></div>
    </div>`;

    // chart
    h += `<h3>Hlustun á dag</h3><div class="legend"><span><b style="background:${MUSIC}"></b>Tónlist ${dur(d.music)}</span><span><b style="background:${STORY}"></b>Sögur ${dur(d.stories)}</span></div>${this._chart(d)}`;

    // cards
    const top = d.cards.slice(0, 8), maxSec = Math.max(1, ...top.map((c) => c.sec));
    h += `<div class="grid2"><div><h3>Vinsælustu kortin</h3>`;
    h += top.length ? top.map((c) => {
      const card = this._cardById(c.id), story = this._isStory(card);
      const oft = c.short >= 2 ? `<span class="badge" title="Oft tekið strax af (undir 30 sek.)">tekið fljótt af ×${c.short}</span>` : "";
      return `<div class="row">${this._thumb(c.id, c.name, story)}<div class="grow"><div class="name">${esc(c.name)}${c.gone ? `<span class="badge">eytt</span>` : ""}${oft}</div><div class="meter"><i style="width:${Math.round((c.sec / maxSec) * 100)}%;background:${story ? STORY : MUSIC}"></i></div></div><div class="num">${dur(c.sec)}<div class="meta">${c.count} ×</div></div></div>`;
    }).join("") : `<div class="empty">Engin kort spiluð á tímabilinu.</div>`;
    h += `</div>`;

    // quiet cards
    const idle = d.unplayed.filter((c) => daysSince(c.last) >= QUIET_DAYS && !d.cards.some((x) => x.id === c.id));
    h += `<div><h3>Ekki spiluð í ${QUIET_DAYS}+ daga</h3>`;
    h += idle.length ? `<div class="chips">${idle.slice(0, 30).map((c) => `<span class="chip" title="${c.last ? "síðast " + esc(when(c.last)) : "aldrei spilað"}">${esc(c.name)}</span>`).join("")}</div>${idle.length > 30 ? `<div class="meta">… og ${idle.length - 30} til</div>` : ""}` : `<div class="empty">Öll kortin hafa verið spiluð nýlega. 🎉</div>`;
    h += `</div></div>`;

    // heat map
    h += `<h3>Hvenær er hlustað?</h3>${this._heat(d)}`;

    // stories
    const stories = Object.entries(d.positions || {}).map(([id, p]) => ({ id, p, card: this._cardById(id) })).filter((x) => x.card && this._isStory(x.card));
    if (stories.length) {
      h += `<h3>Sögur í gangi</h3>` + stories.map((s) => {
        const books = 1 + String(s.card.more_media || "").split("\n").filter((x) => x.trim()).length, el = Math.round(+s.p.elapsed || 0);
        const pos = `${Math.floor(el / 60)}:${String(el % 60).padStart(2, "0")}`;
        return `<div class="row">${this._thumb(s.id, s.card.name, true)}<div class="grow"><div class="name">${esc(s.card.name)}</div><div class="meta">${books > 1 ? `Bók ${(+s.p.index || 0) + 1} af ${books} · ` : ""}komin í ${pos} mín.</div></div></div>`;
      }).join("");
    }

    // speakers
    const tot = d.players.reduce((a, p) => a + p.sec, 0);
    if (d.players.length > 1 || (d.players.length && d.players[0].entity_id)) {
      h += `<h3>Hátalarar</h3>` + d.players.map((p) => `<div class="row"><div class="grow"><div class="name">${esc(this._name(p.entity_id))}</div><div class="meter"><i style="width:${tot ? Math.round((p.sec / tot) * 100) : 0}%"></i></div></div><div class="num">${dur(p.sec)}</div></div>`).join("");
    }

    // recent plays
    h += `<h3>Síðustu spilanir</h3>`;
    h += d.recent.length ? d.recent.map((r) => {
      const card = this._cardById(r.id);
      return `<div class="row">${this._thumb(r.id, r.name, this._isStory(card))}<div class="grow"><div class="name">${esc(r.name)}</div><div class="meta">${esc(when(r.t))} · ${esc(this._name(r.p))}</div></div><div class="num">${dur(r.sec)}</div></div>`;
    }).join("") : `<div class="empty">Engar spilanir skráðar enn.</div>`;

    // footer
    const admin = d.is_admin;
    h += `<div class="foot"><span>${d.since ? "Skráð frá " + esc(when(d.since)) + " · " : ""}geymt í 90 daga á þessum Home Assistant</span>${admin ? (this._confirm
      ? `<button class="btn warn" data-reset>Já, hreinsa alla tölfræði</button><button class="btn" data-cancel>Hætta við</button>`
      : `<button class="btn" data-reset>Hreinsa tölfræði</button>`) : ""}</div>`;
    return h;
  }
}

if (!customElements.get("vordisarvarpid-tolfraedi-card-impl")) {
  customElements.define("vordisarvarpid-tolfraedi-card-impl", VordisarvarpidTolfraediCard);
}
// loaded without the loader: define the card directly
if (!window.__VORDIS_LOADER && !customElements.get("vordisarvarpid-tolfraedi-card")) {
  customElements.define("vordisarvarpid-tolfraedi-card", class extends VordisarvarpidTolfraediCard {});
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "vordisarvarpid-tolfraedi-card", name: "Vordísarvarpið – tölfræði", description: "Hlustun, vinsælustu kortin og hvenær spilarinn er notaður." });
}
