/* Event Invite — client-side behaviour (no inline scripts, CSP-friendly) */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  function toast(message, type = 'success') {
    const host = $('#toastHost');
    if (!host || !window.bootstrap) return;
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    host.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 4500 });
    el.addEventListener('hidden.bs.toast', () => el.remove());
    t.show();
  }

  /** fetch wrapper: JSON in/out, throws Error(message) on failure, redirects to /login on 401 */
  async function api(url, { method = 'GET', body, form } = {}) {
    const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (form) {
      init.body = form;
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, init);
    } catch (_) {
      throw new Error('Network error — check your connection and try again.');
    }
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Session expired.');
    }
    let data = {};
    try {
      data = await res.json();
    } catch (_) {
      /* non-JSON response */
    }
    if (!res.ok || data.ok === false) {
      const err = new Error(data.message || `Request failed (${res.status})`);
      err.data = data;
      throw err;
    }
    return data;
  }

  function setBusy(form, busy) {
    const btn = $('button[type="submit"]', form);
    if (!btn) return;
    btn.disabled = busy;
    const spinner = $('.spinner-border', btn);
    if (spinner) spinner.classList.toggle('d-none', !busy);
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('d-none', !message);
  }

  /* ------------------------------------------------------------------ */
  /* DASHBOARD: category cards -> create-event modal                     */
  /* ------------------------------------------------------------------ */
  function initDashboard() {
    const modalEl = $('#eventModal');
    const modal = new bootstrap.Modal(modalEl);
    const form = $('#eventForm');
    const errBox = $('#eventFormError');
    const grid = $('#templateGrid');
    const fileInput = $('#customBackground');
    const previewWrap = $('#customPreviewWrap');
    const previewImg = $('#customPreview');
    const templateCache = {};
    const colourInput = $('#accentColor');
    const colourReadout = $('#colorReadout');
    const colourBlock = $('#colourBlock');
    const swatches = $$('.swatch', colourBlock);
    let previewFrame = 0;

    function previewSrc(img) {
      return `${img.dataset.base}?color=${encodeURIComponent(colourInput.value)}`;
    }
    function refreshPreviews() {
      cancelAnimationFrame(previewFrame);
      previewFrame = requestAnimationFrame(() => {
        $$('#templateGrid img[data-dynamic="1"]').forEach((img) => (img.src = previewSrc(img)));
      });
    }
    function setColour(hex) {
      colourInput.value = hex;
      colourReadout.textContent = hex;
      swatches.forEach((s) => s.classList.toggle('selected', s.dataset.color.toLowerCase() === hex.toLowerCase()));
      refreshPreviews();
    }
    swatches.forEach((s) => s.addEventListener('click', () => setColour(s.dataset.color)));
    colourInput.addEventListener('input', () => setColour(colourInput.value));

    async function loadTemplates(category) {
      grid.innerHTML = '<div class="text-muted small">Loading designs…</div>';
      try {
        if (!templateCache[category]) {
          templateCache[category] = (await api(`/api/templates?category=${encodeURIComponent(category)}`)).templates;
        }
        const list = templateCache[category];
        if (!list.length) {
          grid.innerHTML = '<div class="text-muted small">No ready-made designs yet — upload your own background below.</div>';
          return;
        }
        grid.innerHTML = list
          .map(
            (t, i) => `<div class="template-option">
              <input type="radio" name="templateId" id="tpl-${t.id}" value="${t.id}" ${i === 0 ? 'checked' : ''}>
              <label for="tpl-${t.id}"><img src="${esc(t.dynamic ? `${t.previewUrl}?color=${encodeURIComponent(colourInput.value)}` : t.previewUrl)}" data-base="${esc(t.previewUrl)}" data-dynamic="${t.dynamic ? 1 : 0}" alt="${esc(t.name)} design" loading="lazy"><span>${esc(t.name)}</span></label>
            </div>`
          )
          .join('');
      } catch (e) {
        grid.innerHTML = `<div class="text-danger small">${esc(e.message)}</div>`;
      }
    }

    function clearCustom() {
      fileInput.value = '';
      previewWrap.classList.add('d-none');
      grid.classList.remove('dimmed');
      colourBlock.classList.remove('dimmed');
      if (previewImg.src.startsWith('blob:')) URL.revokeObjectURL(previewImg.src);
    }

    $$('.category-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        form.reset();
        clearCustom();
        showError(errBox, '');
        $('#category').value = category;
        setColour(btn.dataset.color || '#e4572e');
        $('#modalCategoryLabel').textContent = `${btn.dataset.label} event`;
        loadTemplates(category);
        modal.show();
      });
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return clearCustom();
      if (file.size > 8 * 1024 * 1024) {
        clearCustom();
        return showError(errBox, 'That image is larger than 8 MB.');
      }
      showError(errBox, '');
      previewImg.src = URL.createObjectURL(file);
      previewWrap.classList.remove('d-none');
      grid.classList.add('dimmed');
      colourBlock.classList.add('dimmed');
    });
    $('#clearCustom').addEventListener('click', clearCustom);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      showError(errBox, '');
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      setBusy(form, true);
      try {
        const data = await api('/api/events', { method: 'POST', form: new FormData(form) });
        window.location.href = data.redirect;
      } catch (e) {
        showError(errBox, e.message);
        setBusy(form, false);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* EVENT PAGE: guests, cards, delivery                                 */
  /* ------------------------------------------------------------------ */
  function initEventPage() {
    const root = $('#eventPage');
    const eventId = root.dataset.eventId;
    const base = `/api/events/${eventId}`;
    const PAGE_SIZE = 50;

    const state = { guests: [], busy: {}, page: 1, query: '', selected: new Set(), timer: null };

    const rowsEl = $('#guestRows');
    const countEl = $('#guestCount');
    const rangeEl = $('#guestRange');
    const pagerEl = $('#pager');

    const pill = (status, label) => `<span class="status-pill st-${esc(status)}">${esc(label || status.replace('_', ' '))}</span>`;
    const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Dar_es_Salaam' }) : '');

    function filtered() {
      const q = state.query.trim().toLowerCase();
      if (!q) return state.guests;
      return state.guests.filter((g) => g.guestName.toLowerCase().includes(q) || g.phoneNumber.includes(q.replace(/\D/g, '') || '\u0000'));
    }

    function render() {
      const list = filtered();
      const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      state.page = Math.min(state.page, pages);
      const slice = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

      if (!state.guests.length) {
        rowsEl.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-5"><i class="bi bi-people fs-1 d-block mb-2"></i>No guests yet. Add one or upload a CSV/Excel list.</td></tr>';
      } else if (!slice.length) {
        rowsEl.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No guests match your search.</td></tr>';
      } else {
        rowsEl.innerHTML = slice
          .map(
            (g) => `<tr data-id="${g.id}">
              <td><input class="form-check-input row-check" type="checkbox" value="${g.id}" ${state.selected.has(g.id) ? 'checked' : ''} aria-label="Select ${esc(g.guestName)}"></td>
              <td class="fw-semibold">${esc(g.guestName)}</td>
              <td class="text-nowrap">+${esc(g.phoneNumber)}</td>
              <td>${g.cardUrl ? `<img class="card-thumb" src="${esc(g.cardUrl)}" alt="Card for ${esc(g.guestName)}" data-card="${esc(g.cardUrl)}" data-name="${esc(g.guestName)}" loading="lazy">` : '<span class="status-pill st-PENDING"><span class="spinner-border spinner-border-sm"></span> Pending</span>'}
                <span class="badge text-bg-light border ms-1">${esc(g.cardType)}</span></td>
              <td>${pill(g.smsStatus)}</td>
              <td>${pill(g.whatsappStatus)}</td>
              <td>${g.attendanceStatus === 'ATTENDED' ? pill('ATTENDED', `Attended ${fmtTime(g.checkedInAt)}`) : pill('INVITED', 'Invited')}</td>
              <td class="text-end text-nowrap">
                ${g.cardUrl ? `<a class="btn btn-sm btn-outline-secondary" href="${esc(g.cardUrl)}" download title="Download card"><i class="bi bi-download"></i></a>` : ''}
                <button class="btn btn-sm btn-outline-danger btn-del" data-id="${g.id}" data-name="${esc(g.guestName)}" title="Remove guest"><i class="bi bi-trash"></i></button>
              </td>
            </tr>`
          )
          .join('');
      }

      countEl.textContent = `${list.length} guest${list.length === 1 ? '' : 's'}${state.query ? ' (filtered)' : ''}`;
      const firstVisible = list.length ? (state.page - 1) * PAGE_SIZE + 1 : 0;
      const lastVisible = Math.min(state.page * PAGE_SIZE, list.length);
      rangeEl.textContent = `Showing ${firstVisible}–${lastVisible} of ${list.length} guest${list.length === 1 ? '' : 's'}`;
      pagerEl.innerHTML =
        pages > 1
          ? `<button class="btn btn-outline-secondary" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>‹</button>
             <button class="btn btn-outline-secondary disabled">${state.page} / ${pages}</button>
             <button class="btn btn-outline-secondary" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>›</button>`
          : '';
      $('#selectAll').checked = slice.length > 0 && slice.every((g) => state.selected.has(g.id));
    }

    async function loadStats() {
      try {
        const { stats } = await api(`${base}/stats`);
        $$('[data-stat]').forEach((el) => {
          const k = el.dataset.stat;
          el.textContent = k === 'attended' ? `${stats.attended}/${stats.total}` : stats[k] ?? 0;
        });
        $('#thankYouAttendeeCount').textContent = stats.attended;
        $('#btnOpenThankYou').disabled = stats.attended === 0;
      } catch (_) {
        /* non-critical */
      }
    }

    async function refresh() {
      clearTimeout(state.timer);
      try {
        const data = await api(`${base}/guests`);
        state.guests = data.guests;
        state.busy = data.busy;
        render();
        loadStats();
      } catch (e) {
        if (e.message !== 'Session expired.') toast(e.message, 'danger');
      }
      const active =
        state.busy.cards || state.busy.sending ||
        state.guests.some((g) => !g.cardUrl || g.smsStatus === 'PENDING' || g.whatsappStatus === 'PENDING');
      state.timer = setTimeout(refresh, active ? 2500 : 20000);
    }

    /* ---- table interactions ---- */
    $('#guestSearch').addEventListener('input', (e) => {
      state.query = e.target.value;
      state.page = 1;
      render();
    });
    pagerEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      state.page = Number(b.dataset.page);
      render();
    });
    $('#selectAll').addEventListener('change', (e) => {
      const list = filtered().slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
      list.forEach((g) => (e.target.checked ? state.selected.add(g.id) : state.selected.delete(g.id)));
      render();
    });
    rowsEl.addEventListener('change', (e) => {
      if (!e.target.classList.contains('row-check')) return;
      const id = Number(e.target.value);
      e.target.checked ? state.selected.add(id) : state.selected.delete(id);
      $('#selectAll').checked = false;
    });
    rowsEl.addEventListener('click', async (e) => {
      const thumb = e.target.closest('.card-thumb');
      if (thumb) {
        $('#cardModalTitle').textContent = thumb.dataset.name;
        $('#cardModalImg').src = thumb.dataset.card;
        $('#cardModalDownload').href = thumb.dataset.card;
        bootstrap.Modal.getOrCreateInstance($('#cardModal')).show();
        return;
      }
      const del = e.target.closest('.btn-del');
      if (del && window.confirm(`Remove ${del.dataset.name} from this event? Their QR card will stop working.`)) {
        try {
          await api(`${base}/guests/${del.dataset.id}`, { method: 'DELETE' });
          state.selected.delete(Number(del.dataset.id));
          toast('Guest removed.');
          refresh();
        } catch (err) {
          toast(err.message, 'danger');
        }
      }
    });

    /* ---- add guest ---- */
    const guestForm = $('#guestForm');
    guestForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('#guestFormError');
      showError(err, '');
      const fd = new FormData(guestForm);
      setBusy(guestForm, true);
      try {
        await api(`${base}/guests`, {
          method: 'POST',
          body: { guestName: fd.get('guestName'), phoneNumber: fd.get('phoneNumber'), cardType: fd.get('cardType') },
        });
        toast('Guest added and card created.');
        guestForm.reset();
        $('#guestName').focus();
        refresh();
      } catch (e) {
        showError(err, e.message);
      } finally {
        setBusy(guestForm, false);
      }
    });
    $('#guestModal').addEventListener('shown.bs.modal', () => $('#guestName').focus());

    /* ---- bulk upload ---- */
    const bulkForm = $('#bulkForm');
    bulkForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('#bulkError');
      const report = $('#bulkReport');
      showError(err, '');
      report.classList.add('d-none');
      const file = $('#bulkFile').files[0];
      if (!file) return showError(err, 'Please choose a file first.');
      const fd = new FormData();
      fd.append('file', file);
      setBusy(bulkForm, true);
      try {
        const r = await api(`${base}/guests/bulk`, { method: 'POST', form: fd });
        const problems = r.errors.map((x) => `<li>Row ${x.line}: ${esc(x.reason)}</li>`).join('');
        report.innerHTML = `<div class="alert alert-${r.imported ? 'success' : 'warning'} mb-2">Imported <strong>${r.imported}</strong> guest(s)${r.skipped ? `, skipped <strong>${r.skipped}</strong>` : ''}. Cards are being generated…</div>
          ${problems ? `<ul class="text-danger ps-3 mb-0">${problems}</ul>` : ''}`;
        report.classList.remove('d-none');
        bulkForm.reset();
        refresh();
      } catch (e) {
        showError(err, e.message);
      } finally {
        setBusy(bulkForm, false);
      }
    });

    /* ---- generate cards ---- */
    $('#btnGenerate').addEventListener('click', async () => {
      const regenerate = state.guests.length > 0 && state.guests.every((g) => g.cardUrl);
      if (regenerate && !window.confirm('All cards already exist. Regenerate every card (e.g. after changing event details)?')) return;
      try {
        const r = await api(`${base}/generate-cards`, { method: 'POST', body: { force: regenerate } });
        toast(r.message, r.started ? 'success' : 'warning');
        refresh();
      } catch (e) {
        toast(e.message, 'danger');
      }
    });

    /* ---- send invitations ---- */
    const sendForm = $('#sendForm');
    const sendModalEl = $('#sendModal');
    sendModalEl.addEventListener('show.bs.modal', async () => {
      showError($('#sendError'), '');
      const n = state.selected.size;
      $('#selectedOnlyWrap').classList.toggle('d-none', n === 0);
      $('#selectedCount').textContent = n;
      $('#selectedOnly').checked = n > 0;
      try {
        const c = await api(`${base}/credits`);
        $('#creditsInfo').innerHTML = `Your balance: <strong>${c.smsCredits}</strong> SMS credits · <strong>${c.whatsappCredits}</strong> WhatsApp credits. One credit is used per message delivered.`;
      } catch (_) {
        $('#creditsInfo').textContent = '';
      }
    });
    sendForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('#sendError');
      showError(err, '');
      const fd = new FormData(sendForm);
      const payload = { channel: fd.get('channel'), scope: fd.get('scope') };
      if ($('#selectedOnly').checked && state.selected.size) payload.guestIds = Array.from(state.selected);
      setBusy(sendForm, true);
      try {
        const r = await api(`${base}/send`, { method: 'POST', body: payload });
        toast(r.message, r.queued ? 'success' : 'info');
        bootstrap.Modal.getInstance(sendModalEl).hide();
        refresh();
      } catch (e) {
        showError(err, e.message);
      } finally {
        setBusy(sendForm, false);
      }
    });

    /* ---- thank attendees ---- */
    const thankYouForm = $('#thankYouForm');
    const thankYouModalEl = $('#thankYouModal');
    thankYouModalEl.addEventListener('show.bs.modal', async () => {
      showError($('#thankYouError'), '');
      try {
        const c = await api(`${base}/credits`);
        $('#thankYouCreditsInfo').innerHTML = `Your balance: <strong>${c.smsCredits}</strong> SMS credits · <strong>${c.whatsappCredits}</strong> WhatsApp credits. One credit is used per message delivered.`;
      } catch (_) {
        $('#thankYouCreditsInfo').textContent = '';
      }
    });
    thankYouForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const err = $('#thankYouError');
      showError(err, '');
      if (!thankYouForm.checkValidity()) {
        thankYouForm.reportValidity();
        return;
      }
      const fd = new FormData(thankYouForm);
      const channel = fd.get('channel');
      const channelLabel = channel === 'BOTH' ? 'SMS and WhatsApp' : channel;
      const attendeeCount = Number($('#thankYouAttendeeCount').textContent);
      if (!window.confirm(`Send this thank-you message through ${channelLabel} to ${attendeeCount} checked-in guest${attendeeCount === 1 ? '' : 's'}?`)) return;
      setBusy(thankYouForm, true);
      try {
        const r = await api(`${base}/thank-you`, { method: 'POST', body: { channel, message: fd.get('message') } });
        toast(r.message, r.queued ? 'success' : 'info');
        bootstrap.Modal.getInstance(thankYouModalEl).hide();
        refresh();
      } catch (e) {
        showError(err, e.message);
      } finally {
        setBusy(thankYouForm, false);
      }
    });

    /* ---- edit and delete event ---- */
    const editEventForm = $('#editEventForm');
    editEventForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const error = $('#editEventError');
      showError(error, '');
      if (!editEventForm.checkValidity()) {
        editEventForm.reportValidity();
        return;
      }
      const formData = new FormData(editEventForm);
      setBusy(editEventForm, true);
      try {
        const result = await api(base, {
          method: 'PATCH',
          body: {
            eventName: formData.get('eventName'),
            eventDate: formData.get('eventDate'),
            venue: formData.get('venue'),
            mapsLink: formData.get('mapsLink'),
            templateId: formData.get('templateId'),
          },
        });
        toast(result.message);
        window.location.reload();
      } catch (e) {
        showError(error, e.message);
        setBusy(editEventForm, false);
      }
    });

    const deleteEventButton = $('#btnDeleteEvent');
    if (deleteEventButton) {
      deleteEventButton.addEventListener('click', async () => {
        if (!window.confirm('Delete this event, all guest records, delivery history and generated cards? This cannot be undone.')) return;
        deleteEventButton.disabled = true;
        try {
          const result = await api(base, { method: 'DELETE' });
          window.location.href = result.redirect;
        } catch (e) {
          deleteEventButton.disabled = false;
          toast(e.message, 'danger');
        }
      });
    }

    /* ---- card colour (re-creates every card) ---- */
    const colourBar = $('#colourBar');
    if (colourBar) {
      const input = $('#eventColor');
      const apply = $('#btnApplyColor');
      let current = root.dataset.accent || input.value;
      const mark = () => {
        $$('.swatch', colourBar).forEach((sw) => sw.classList.toggle('selected', sw.dataset.color.toLowerCase() === input.value.toLowerCase()));
        apply.disabled = input.value.toLowerCase() === current.toLowerCase();
      };
      $$('.swatch', colourBar).forEach((sw) =>
        sw.addEventListener('click', () => {
          input.value = sw.dataset.color;
          mark();
        })
      );
      input.addEventListener('input', mark);
      apply.addEventListener('click', async () => {
        if (!window.confirm('Re-create every guest card in this colour? Cards you already sent will not change on guests\' phones.')) return;
        apply.disabled = true;
        try {
          const r = await api(`${base}/appearance`, { method: 'PATCH', body: { accentColor: input.value } });
          current = input.value;
          toast(r.message);
          refresh();
        } catch (e) {
          toast(e.message, 'danger');
        }
        mark();
      });
      mark();
    }

    refresh();
  }

  /* ------------------------------------------------------------------ */
  /* SCANNER                                                             */
  /* ------------------------------------------------------------------ */
  function initScanner() {
    const root = $('#scannerPage');
    const eventId = Number(root.dataset.eventId);
    const overlay = $('#resultOverlay');
    const hint = $('#scannerHint');

    let scanner = null;
    let cameras = [];
    let cameraIdx = 0;
    let busy = false;
    let dismissTimer = null;
    let lastToken = { value: '', at: 0 };
    let lastScanned = null;
    let audioCtx = null;

    function beep(ok) {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = ok ? 880 : 220;
        g.gain.value = 0.15;
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        o.stop(audioCtx.currentTime + (ok ? 0.15 : 0.45));
      } catch (_) {
        /* audio is optional */
      }
      if (navigator.vibrate) navigator.vibrate(ok ? 80 : [120, 80, 120]);
    }

    async function refreshCounts() {
      try {
        const { stats } = await api(`/api/events/${eventId}/stats`);
        $('#cntAttended').textContent = stats.attended;
        $('#cntTotal').textContent = stats.total;
      } catch (_) {
        /* ignore */
      }
    }

    function show(result) {
      const view = {
        VALID: { cls: 'ok', icon: 'bi-check-circle-fill', title: 'VALID — ADMIT', ms: 3000 },
        ALREADY_SCANNED: { cls: 'warn', icon: 'bi-exclamation-triangle-fill', title: 'ALREADY SCANNED', ms: 0 },
        WRONG_EVENT: { cls: 'bad', icon: 'bi-x-octagon-fill', title: 'WRONG EVENT', ms: 0 },
        INVALID: { cls: 'bad', icon: 'bi-x-octagon-fill', title: 'INVALID TICKET', ms: 0 },
        ERROR: { cls: 'bad', icon: 'bi-wifi-off', title: 'COULD NOT CHECK', ms: 0 },
      }[result.result] || { cls: 'bad', icon: 'bi-x-octagon-fill', title: 'ERROR', ms: 0 };

      overlay.className = `result-overlay ${view.cls}`;
      $('#resultIcon').className = `bi ${view.icon}`;
      $('#resultTitle').textContent = view.title;

      const guestEl = $('#resultGuest');
      const metaEl = $('#resultMeta');
      guestEl.textContent = result.guest ? result.guest.guestName : '';
      let meta = '';
      if (result.guest) {
        meta += `<span class="result-badge">${esc(result.guest.cardType)} · admits ${result.guest.admits}</span>`;
      }
      if (result.result === 'ALREADY_SCANNED') {
        meta += `<div class="mt-3 fs-5">First scanned at<br><strong>${esc(result.checkedInAtText)}</strong></div>`;
      } else if (result.result === 'VALID') {
        meta += `<div class="mt-2">Checked in at ${esc(result.checkedInAtText)}</div>`;
      } else {
        meta += `<div>${esc(result.message || '')}</div>`;
      }
      metaEl.innerHTML = meta;

      $('#btnUndo').classList.toggle('d-none', result.result !== 'VALID');
      overlay.classList.remove('d-none');
      beep(result.result === 'VALID');

      clearTimeout(dismissTimer);
      if (view.ms) dismissTimer = setTimeout(dismiss, view.ms);
    }

    function dismiss() {
      clearTimeout(dismissTimer);
      overlay.classList.add('d-none');
      busy = false;
      try {
        if (scanner && scanner.getState && scanner.getState() === 3) scanner.resume(); // 3 = PAUSED
      } catch (_) {
        /* ignore */
      }
    }

    async function verify(raw) {
      busy = true;
      try {
        if (scanner && scanner.getState && scanner.getState() === 2) scanner.pause(true); // 2 = SCANNING
      } catch (_) {
        /* ignore */
      }
      try {
        const res = await api('/api/checkin/verify', { method: 'POST', body: { token: raw, eventId } });
        lastScanned = res.result === 'VALID' ? raw : null;
        show(res);
        refreshCounts();
      } catch (e) {
        show({ result: 'ERROR', message: e.message });
      }
    }

    function onScan(text) {
      if (busy) return;
      const now = Date.now();
      if (text === lastToken.value && now - lastToken.at < 4000) return; // same card still in view
      lastToken = { value: text, at: now };
      verify(text);
    }

    async function startCamera() {
      try {
        if (!scanner) scanner = new Html5Qrcode('reader', { verbose: false });
        const config = {
          fps: 10,
          qrbox: (w, h) => {
            const s = Math.floor(Math.min(w, h) * 0.72);
            return { width: s, height: s };
          },
          aspectRatio: 1,
        };
        const source = cameras.length ? { deviceId: { exact: cameras[cameraIdx].id } } : { facingMode: 'environment' };
        await scanner.start(source, config, onScan, () => {});
        hint.textContent = "Point the camera at a guest's QR code";
      } catch (e) {
        hint.innerHTML =
          'Camera unavailable. Allow camera access in your browser (the page must be opened over <strong>https</strong>), or use “Enter code”.';
        $('#manualBox').classList.remove('d-none');
      }
    }

    async function flipCamera() {
      try {
        if (!cameras.length) cameras = await Html5Qrcode.getCameras();
        if (cameras.length < 2) return toast('Only one camera found.', 'info');
        if (scanner && scanner.isScanning) await scanner.stop();
        cameraIdx = (cameraIdx + 1) % cameras.length;
        await startCamera();
      } catch (e) {
        toast('Could not switch camera.', 'danger');
      }
    }

    $('#btnNext').addEventListener('click', dismiss);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });
    $('#btnFlip').addEventListener('click', flipCamera);
    $('#btnManual').addEventListener('click', () => {
      $('#manualBox').classList.toggle('d-none');
      $('#manualToken').focus();
    });
    $('#manualForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#manualToken').value.trim();
      if (!v) return;
      $('#manualToken').value = '';
      verify(v);
    });
    $('#btnUndo').addEventListener('click', async () => {
      if (!lastScanned) return;
      try {
        await api('/api/checkin/undo', { method: 'POST', body: { token: lastScanned, eventId } });
        toast('Check-in undone.', 'warning');
        lastScanned = null;
        lastToken = { value: '', at: 0 };
        refreshCounts();
        dismiss();
      } catch (e) {
        toast(e.message, 'danger');
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshCounts();
    });

    refreshCounts();
    setInterval(refreshCounts, 15000);
    if (window.Html5Qrcode) {
      startCamera();
    } else {
      hint.textContent = 'Scanner library failed to load — use “Enter code” or check your connection.';
      $('#manualBox').classList.remove('d-none');
    }
  }

  /* ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-password-toggle]').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const input = toggle.parentElement.querySelector('input');
        if (!input) return;
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        toggle.setAttribute('aria-pressed', String(visible));
        toggle.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        const icon = $('i', toggle);
        if (icon) icon.className = `bi ${visible ? 'bi-eye-slash' : 'bi-eye'}`;
      });
    });

    const revealItems = $$('[data-reveal]');
    if (revealItems.length && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const revealObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -35px 0px' }
      );
      document.body.classList.add('reveal-ready');
      revealItems.forEach((item) => revealObserver.observe(item));
    }

    const nav = $('#siteNav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    if ($('#eventModal')) initDashboard();
    if ($('#eventPage')) initEventPage();
    if ($('#scannerPage')) initScanner();
  });
})();
