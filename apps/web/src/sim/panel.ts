import { t } from '../i18n/ca';
import { el } from '../ui/dom';
import { simulation } from './index';

const MULTIPLIERS = [1, 4, 10];

/** Panell flotant de simulació. Es munta un sol cop a `document.body`. */
export function mountSimPanel(): void {
  if (!simulation.enabled) return;
  const sim = simulation.position;
  let open = false;

  const toggle = el('button', { className: 'sim-toggle', text: t.sim.toggle, onClick: () => setOpen(!open) });
  const panel = el('div', { className: 'sim-panel hidden' });

  const activeBtn = el('button', { text: t.sim.off, onClick: () => simulation.setActive(!simulation.isActive) });
  const followBtn = el('button', { text: t.sim.followRoute, onClick: () => { sim.setMode('follow'); render(); } });
  const clickBtn = el('button', { text: t.sim.clickMap, onClick: () => { sim.setMode('click'); render(); } });
  const playBtn = el('button', { text: t.sim.play, onClick: () => { if (sim.isPlaying) sim.pause(); else sim.play(); render(); } });
  const resetBtn = el('button', { text: t.sim.reset, onClick: () => { sim.reset(); render(); } });
  const progress = el('span', { className: 'hint' });
  const hint = el('p', { className: 'hint' });

  const speedBtns = MULTIPLIERS.map((m) =>
    el('button', { text: `×${m}`, onClick: () => { sim.setMultiplier(m); currentMultiplier = m; render(); } }),
  );
  let currentMultiplier = 1;

  const headingSlider = el('input', { type: 'range', min: '0', max: '359', step: '1', value: '0' });
  const headingValue = el('span', { text: '0°' });
  headingSlider.addEventListener('input', () => {
    simulation.orientation.setHeading(Number(headingSlider.value));
    headingValue.textContent = `${headingSlider.value}°`;
  });
  const pitchSlider = el('input', { type: 'range', min: '-60', max: '60', step: '1', value: '0' });
  const pitchValue = el('span', { text: '0°' });
  pitchSlider.addEventListener('input', () => {
    simulation.orientation.setPitch(Number(pitchSlider.value));
    pitchValue.textContent = `${pitchSlider.value}°`;
  });
  const accSlider = el('input', { type: 'range', min: '3', max: '60', step: '1', value: '8' });
  const accValue = el('span', { text: '8 m' });
  accSlider.addEventListener('input', () => {
    sim.setAccuracy(Number(accSlider.value));
    accValue.textContent = `${accSlider.value} m`;
  });

  panel.append(
    el('h4', { text: t.sim.title }),
    el('div', { className: 'row' }, activeBtn),
    el('div', { className: 'row' }, followBtn, clickBtn),
    el('div', { className: 'row' }, playBtn, resetBtn, progress),
    el('div', { className: 'row' }, el('label', { text: t.sim.speed }), ...speedBtns),
    el('div', { className: 'row' }, el('label', { text: t.sim.heading }), headingSlider, headingValue),
    el('div', { className: 'row' }, el('label', { text: t.sim.pitch }), pitchSlider, pitchValue),
    el('div', { className: 'row' }, el('label', { text: t.sim.accuracy }), accSlider, accValue),
    hint,
  );

  function setOpen(value: boolean): void {
    open = value;
    panel.classList.toggle('hidden', !open);
    if (open) render();
  }

  function render(): void {
    activeBtn.classList.toggle('is-active', simulation.isActive);
    activeBtn.textContent = simulation.isActive ? `${t.sim.title}: ON` : t.sim.off;
    followBtn.classList.toggle('is-active', sim.currentMode === 'follow');
    clickBtn.classList.toggle('is-active', sim.currentMode === 'click');
    playBtn.textContent = sim.isPlaying ? t.sim.pause : t.sim.play;
    playBtn.disabled = !sim.hasTrack;
    progress.textContent = t.sim.progress(Math.round(sim.progressFraction * 100));
    speedBtns.forEach((b, i) => b.classList.toggle('is-active', MULTIPLIERS[i] === currentMultiplier));
    hint.textContent = sim.currentMode === 'follow' ? (sim.hasTrack ? '' : t.sim.noRoute) : t.sim.clickHint;
  }

  sim.onProgress(() => {
    if (open) progress.textContent = t.sim.progress(Math.round(sim.progressFraction * 100));
    if (open && !sim.isPlaying) playBtn.textContent = t.sim.play;
  });
  simulation.onChange(() => render());

  document.body.append(toggle, panel);
  render();
}
