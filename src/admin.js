import { supabase } from './lib/supabaseClient.js';
import { saveBench, saveBlockedPeriod, updateSettings, verifyAdminPin } from './lib/api.js';
import { escapeHtml } from './lib/format.js';
import { createBenchPayload, normalizeBenches } from './lib/benches.js';
import { normalizeBlockedPeriod, normalizeBlockedPeriods } from './lib/blockedPeriods.js';

const el = {
  message: document.getElementById('adminMessage'),
  pinSection: document.getElementById('pinSection'),
  pinForm: document.getElementById('pinForm'),
  pinInput: document.getElementById('pinInput'),
  main: document.getElementById('adminMain'),
  settingsForm: document.getElementById('settingsForm'),
  benchesList: document.getElementById('benchesList'),
  blockedList: document.getElementById('blockedList'),
  addBench: document.getElementById('addBench'),
  addBlocked: document.getElementById('addBlocked')
};

const state = {
  settings: null,
  benches: [],
  blockedPeriods: []
};

function parseId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

function flash(text, type = 'info') {
  el.message.className = `message ${type}`;
  el.message.textContent = text;
  el.message.classList.remove('hidden');
}

async function loadAdminData() {
  const [settingsRes, benchesRes, blockedRes] = await Promise.all([
    supabase.from('app_settings').select('*').limit(1).single(),
    supabase.from('benches').select('*').order('display_order', { ascending: true }),
    supabase.from('blocked_periods').select('*').order('start_time', { ascending: true })
  ]);

  if (settingsRes.error) throw settingsRes.error;
  if (benchesRes.error) throw benchesRes.error;
  if (blockedRes.error) throw blockedRes.error;

  state.settings = settingsRes.data;
  state.benches = normalizeBenches(benchesRes.data);
  state.blockedPeriods = normalizeBlockedPeriods(blockedRes.data);
  renderAll();
}

function renderAll() {
  renderSettings();
  renderBenches();
  renderBlocked();
}

function renderSettings() {
  const s = state.settings;
  const fields = [
    ['booking_days_ahead', 'number'],
    ['default_start_time', 'time'],
    ['default_end_time', 'time'],
    ['slot_interval_minutes', 'number'],
    ['allow_30', 'checkbox'],
    ['allow_60', 'checkbox'],
    ['allow_90', 'checkbox'],
    ['allow_120', 'checkbox'],
    ['weekends_enabled', 'checkbox']
  ];

  el.settingsForm.innerHTML = fields.map(([name, type]) => {
    if (type === 'checkbox') {
      return `<label class="checkbox"><input type="checkbox" name="${name}" ${s[name] ? 'checked' : ''} />${name}</label>`;
    }

    return `<label>${name}<input type="${type}" name="${name}" value="${escapeHtml(String(s[name] ?? ''))}" required /></label>`;
  }).join('') + '<button class="btn primary" type="submit">Save settings</button>';
}

function benchRow(bench) {
  return `
    <form class="row" data-bench-id="${bench.id}">
      <input name="name" value="${escapeHtml(bench.name)}" required />
      <input name="display_order" type="number" value="${bench.display_order ?? 0}" />
      <label class="checkbox"><input type="checkbox" name="active" ${bench.active ? 'checked' : ''} />active</label>
      <button class="btn" type="submit">Save</button>
      <button class="btn danger" type="button" data-delete-bench="${bench.id}">Delete</button>
    </form>
  `;
}

function renderBenches() {
  el.benchesList.innerHTML = state.benches.map(benchRow).join('') || '<p class="muted">No benches.</p>';

  el.benchesList.querySelectorAll('form[data-bench-id]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = parseId(form.dataset.benchId);
      const data = new FormData(form);
      try {
        await saveBench({
          action: 'upsert',
          bench: createBenchPayload({
            id,
            name: data.get('name'),
            display_order: Number(data.get('display_order') || 0),
            _activeKey: state.benches.find((b) => String(b.id) === String(id))?._activeKey || 'active'
          }, data.get('active') === 'on')
        });
        flash('Bench updated.', 'success');
        await loadAdminData();
      } catch (err) {
        flash(`Bench save failed: ${err.message}`, 'error');
      }
    });
  });

  el.benchesList.querySelectorAll('[data-delete-bench]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete this bench?')) return;
      await saveBench({ action: 'delete', id: parseId(button.dataset.deleteBench) });
      flash('Bench deleted.', 'success');
      await loadAdminData();
    });
  });
}

function blockedRow(block) {
  return `
    <form class="row" data-block-id="${block.id}">
      <select name="block_type">
        <option value="date" ${block.block_type === 'date' ? 'selected' : ''}>One-off date</option>
        <option value="weekday" ${block.block_type === 'weekday' ? 'selected' : ''}>Recurring weekday</option>
      </select>
      <input type="date" name="block_date" value="${escapeHtml(block.block_date || '')}" />
      <select name="weekday">
        ${[0,1,2,3,4,5,6].map((d) => `<option value="${d}" ${Number(block.weekday) === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
      <select name="bench_id">
        <option value="">All benches</option>
        ${state.benches.map((b) => `<option value="${b.id}" ${String(block.bench_id) === String(b.id) ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
      </select>
      <input name="start_time" type="time" value="${block.start_time}" required />
      <input name="end_time" type="time" value="${block.end_time}" required />
      <input name="reason" placeholder="Reason" value="${escapeHtml(block.reason || '')}" />
      <button class="btn" type="submit">Save</button>
      <button class="btn danger" type="button" data-delete-block="${block.id}">Delete</button>
    </form>
  `;
}

function renderBlocked() {
  el.blockedList.innerHTML = state.blockedPeriods.map(blockedRow).join('') || '<p class="muted">No blocked periods.</p>';

  el.blockedList.querySelectorAll('form[data-block-id]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = parseId(form.dataset.blockId);
      const data = new FormData(form);
      await saveBlockedPeriod({
        action: 'upsert',
        blocked: normalizeBlockedPeriod({
          id,
          block_type: data.get('block_type'),
          block_date: data.get('block_date') || null,
          weekday: data.get('weekday') === '' ? null : Number(data.get('weekday')),
          bench_id: parseId(data.get('bench_id')),
          start_time: data.get('start_time'),
          end_time: data.get('end_time'),
          reason: data.get('reason') || null
        })
      });
      flash('Blocked period updated.', 'success');
      await loadAdminData();
    });
  });

  el.blockedList.querySelectorAll('[data-delete-block]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!confirm('Delete blocked period?')) return;
      await saveBlockedPeriod({ action: 'delete', id: parseId(button.dataset.deleteBlock) });
      flash('Blocked period deleted.', 'success');
      await loadAdminData();
    });
  });
}

el.pinForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await verifyAdminPin(el.pinInput.value);
    el.pinSection.classList.add('hidden');
    el.main.classList.remove('hidden');
    await loadAdminData();
    flash('Admin access granted.', 'success');
  } catch (err) {
    flash(`PIN check failed: ${err.message}`, 'error');
  }
});

el.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(el.settingsForm);
  const payload = {
    booking_days_ahead: Number(data.get('booking_days_ahead')),
    default_start_time: data.get('default_start_time'),
    default_end_time: data.get('default_end_time'),
    slot_interval_minutes: Number(data.get('slot_interval_minutes')),
    allow_30: data.get('allow_30') === 'on',
    allow_60: data.get('allow_60') === 'on',
    allow_90: data.get('allow_90') === 'on',
    allow_120: data.get('allow_120') === 'on',
    weekends_enabled: data.get('weekends_enabled') === 'on'
  };

  try {
    await updateSettings(payload);
    flash('Settings saved.', 'success');
    await loadAdminData();
  } catch (err) {
    flash(`Settings save failed: ${err.message}`, 'error');
  }
});

el.addBench.addEventListener('click', async () => {
  try {
    await saveBench({
      action: 'upsert',
      bench: createBenchPayload({
        name: `Bench ${state.benches.length + 1}`,
        display_order: state.benches.length + 1,
        _activeKey: state.benches[0]?._activeKey || 'active'
      }, true)
    });
    flash('Bench added.', 'success');
    await loadAdminData();
  } catch (err) {
    flash(`Add bench failed: ${err.message}`, 'error');
  }
});

el.addBlocked.addEventListener('click', async () => {
  try {
    await saveBlockedPeriod({
      action: 'upsert',
      blocked: normalizeBlockedPeriod({
        block_type: 'weekday',
        weekday: 1,
        block_date: null,
        bench_id: null,
        start_time: '12:00',
        end_time: '13:00',
        reason: 'Lunch break'
      })
    });
    flash('Blocked period added.', 'success');
    await loadAdminData();
  } catch (err) {
    flash(`Add blocked period failed: ${err.message}`, 'error');
  }
});
