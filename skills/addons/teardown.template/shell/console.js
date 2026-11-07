// The overlay: a panel of live numbers, small charts synced to the input, one button per part, a cut slider, a glass
// toggle, the tour state and a callout with a leader line for the isolated part. update(rows, state) redraws from the
// frame's state only, so nothing here can disagree with the pose.
import { SPEC } from './params.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const css = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const CURVE_POINTS = 120;

/** charts: [{label, unit, period (deg, default 360), f(thetaDeg) -> number}] from kin.js; may be empty. */
export function createConsole(root, parts, charts, { onFocus, onCut, onGlass, onTour }) {
  root.innerHTML = `
    <div class="side">
      <header><h1>${esc(SPEC.title)}</h1><p>${esc(SPEC.description)}</p></header>
      <section class="panel" id="nums" aria-live="off"></section>
      ${charts.length ? `<section class="panel" id="charts">${charts.map((c, i) => `<figure><figcaption>${esc(c.label)}${c.unit ? ` <small>${esc(c.unit)}</small>` : ''}</figcaption><canvas data-chart="${i}" width="300" height="40" role="img" aria-label="${esc(c.label)} against input angle"></canvas></figure>`).join('')}</section>` : ''}
    </div>
    <section class="panel bar">
      <h2>Parts</h2>
      <div class="btns">
        <button data-focus="-1" class="on">All</button>
        ${parts.map((p, i) => `<button data-focus="${i}">${esc(p.label)}</button>`).join('')}
      </div>
      <label class="cut">Cut <input id="cut" type="range" min="0" max="1" step="0.01" value="0" aria-label="Cutaway depth"></label>
      <button id="glass" aria-pressed="false">Glass</button>
      <button id="tour" class="tour">Tour</button>
    </section>
    <svg id="callout" aria-hidden="true"><line/><rect/><text class="t"/><text class="s"/></svg>`;
  const nums = root.querySelector('#nums');
  const btns = [...root.querySelectorAll('[data-focus]')];
  btns.forEach((b) => b.addEventListener('click', () => onFocus(Number(b.dataset.focus))));
  root.querySelector('#cut').addEventListener('input', (e) => onCut(Number(e.target.value)));
  const glass = root.querySelector('#glass');
  glass.addEventListener('click', () => onGlass(glass.getAttribute('aria-pressed') !== 'true'));
  const tour = root.querySelector('#tour');
  tour.addEventListener('click', () => onTour());
  const cutEl = root.querySelector('#cut');

  // charts: the curve is drawn once per size, the marker every frame
  const cv = [...root.querySelectorAll('[data-chart]')].map((el, i) => {
    const c = charts[i];
    const period = c.period || 360;
    const ys = Array.from({ length: CURVE_POINTS + 1 }, (_, k) => c.f((k / CURVE_POINTS) * period));
    const lo = Math.min(...ys), hi = Math.max(...ys);
    return { el, g: el.getContext('2d'), c, period, ys, lo, hi: hi === lo ? lo + 1 : hi };
  });
  const drawChart = ({ el, g, c, period, ys, lo, hi }, theta) => {
    const w = el.width, h = el.height, pad = 4;
    const X = (a) => pad + (a / period) * (w - 2 * pad);
    const Y = (v) => h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = css('--line', 'rgba(128,128,128,.3)');
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, w - 1, h - 1);
    g.strokeStyle = css('--ink', '#222');
    g.lineWidth = 1.5;
    g.beginPath();
    ys.forEach((v, k) => (k ? g.lineTo(X((k / CURVE_POINTS) * period), Y(v)) : g.moveTo(X(0), Y(v))));
    g.stroke();
    const a = ((theta % period) + period) % period;
    const v = c.f(a);
    g.strokeStyle = g.fillStyle = css('--accent', '#e8a33d');
    g.beginPath(); g.moveTo(X(a), 1); g.lineTo(X(a), h - 1); g.stroke();
    g.beginPath(); g.arc(X(a), Y(v), 3.5, 0, Math.PI * 2); g.fill();
  };

  const svg = root.querySelector('#callout');
  const [line, box, title, sub] = [...svg.children];
  let last = '';
  let size = { w: innerWidth, h: innerHeight };
  return {
    resize(w, h) { size = { w, h }; svg.setAttribute('viewBox', `0 0 ${w} ${h}`); },
    update(rows, { focus, cut, glass: g, touring, theta, callout }) {
      const html = rows.length ? `<h2>Readout</h2><dl>${rows.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('')}</dl>` : '';
      if (html !== last) { nums.innerHTML = html; nums.hidden = !html; last = html; }
      btns.forEach((b) => b.classList.toggle('on', Number(b.dataset.focus) === focus));
      if (document.activeElement !== cutEl) cutEl.value = String(cut);
      glass.setAttribute('aria-pressed', String(g));
      glass.classList.toggle('on', g);
      tour.classList.toggle('on', touring);
      tour.textContent = touring ? 'Touring' : 'Tour';
      cv.forEach((c) => drawChart(c, theta));
      if (!callout) { svg.style.display = 'none'; return; }
      svg.style.display = 'block';
      const bx = size.w - 230, by = 28, bh = 20 + callout.lines.length * 16 + 12;
      line.setAttribute('x1', callout.x); line.setAttribute('y1', callout.y); line.setAttribute('x2', bx); line.setAttribute('y2', by + bh / 2);
      box.setAttribute('x', bx); box.setAttribute('y', by); box.setAttribute('width', 214); box.setAttribute('height', bh); box.setAttribute('rx', 8);
      title.setAttribute('x', bx + 12); title.setAttribute('y', by + 22); title.textContent = callout.title;
      sub.setAttribute('x', bx + 12); sub.setAttribute('y', by + 40);
      sub.innerHTML = callout.lines.map((l, i) => `<tspan x="${bx + 12}" dy="${i ? 16 : 0}">${esc(l)}</tspan>`).join('');
    },
  };
}
