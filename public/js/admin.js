(function () {
  'use strict';

  var csrfToken = null;
  var state = { page: 1, total: 0, pageSize: 50, activities: {} };
  var STATUSES = ['new', 'contacted', 'confirmed', 'completed', 'cancelled'];

  var $ = function (id) { return document.getElementById(id); };
  var loginView = $('login-view');
  var dashView = $('dash-view');

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'className') node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      node.append(c && c.nodeType ? c : document.createTextNode(c == null ? '' : String(c)));
    });
    return node;
  }

  function api(method, url, body) {
    var headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken;
    return fetch(url, {
      method: method,
      headers: headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (res.status === 401 && url !== '/api/admin/login') {
          showLogin();
          throw new Error('Your session has ended. Please log in again.');
        }
        if (!res.ok) {
          var error = new Error(data.error || 'Request failed.');
          error.fields = data.fields;
          throw error;
        }
        return data;
      });
    });
  }

  /* PLATFORM-START: how PDFs, CSV files and the stamp are handled. */
  var platform = {
    openPdf: function (r, download) {
      var url = '/api/admin/receipts/' + r.id + '/pdf' + (download ? '?download=1' : '');
      if (!download) { window.open(url, '_blank', 'noopener'); return; }
      var a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    uploadStamp: function (file) {
      return fetch('/api/admin/receipts/stamp/image', {
        method: 'PUT',
        headers: { 'Content-Type': file.type, 'X-CSRF-Token': csrfToken || '', Accept: 'application/json' },
        credentials: 'same-origin',
        body: file
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          if (!res.ok) throw new Error(d.error || 'Upload failed.');
          return d;
        });
      });
    },
    stampUrl: function () { return '/api/admin/receipts/stamp/image?t=' + Date.now(); },
    exportReceipts: function (params) { window.location.href = '/api/admin/receipts/export.csv?' + params; }
  };
  /* PLATFORM-END */

  function showError(id, message) {
    var box = $(id);
    box.textContent = message;
    box.hidden = !message;
  }

  function showLogin() {
    csrfToken = null;
    dashView.hidden = true;
    $('admin-user').hidden = true;
    loginView.hidden = false;
    $('l-user').focus();
  }

  function showDashboard(username) {
    loginView.hidden = true;
    dashView.hidden = false;
    $('admin-user').hidden = false;
    $('admin-username').textContent = username;
    load();
  }

  function filters() {
    var params = new URLSearchParams();
    var q = $('q').value.trim();
    var status = $('status-filter').value;
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if ($('upcoming').checked) params.set('upcoming', '1');
    return params;
  }

  function load() {
    showError('dash-error', '');
    var params = filters();
    params.set('page', String(state.page));
    api('GET', '/api/admin/bookings?' + params.toString())
      .then(function (data) {
        state.total = data.total;
        state.pageSize = data.pageSize;
        state.activities = data.activities || {};
        renderStats(data.counts);
        renderRows(data.bookings);
        var pages = Math.max(1, Math.ceil(data.total / data.pageSize));
        $('page-info').textContent = 'Page ' + data.page + ' of ' + pages + ' (' + data.total + ' bookings)';
        $('prev-btn').disabled = data.page <= 1;
        $('next-btn').disabled = data.page >= pages;
      })
      .catch(function (err) { showError('dash-error', err.message); });
  }

  function renderStats(counts) {
    var box = $('stats');
    box.replaceChildren();
    STATUSES.forEach(function (s) {
      box.append(el('div', { className: 'stat s-' + s }, [
        el('strong', { text: String(counts[s] || 0) }),
        el('span', { text: s })
      ]));
    });
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderRows(bookings) {
    var tbody = $('rows');
    tbody.replaceChildren();
    $('empty').hidden = bookings.length > 0;

    bookings.forEach(function (b) {
      var digits = b.phone.replace(/\D/g, '');
      var phoneLink = el('a', { href: 'tel:' + b.phone, text: b.phone });
      var waLink = el('a', { href: 'https://wa.me/' + digits, target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' });
      var customer = el('td', null, [
        el('strong', { text: b.name }),
        el('small', null, [phoneLink, ' · ', waLink]),
        b.email ? el('small', null, [el('a', { href: 'mailto:' + b.email, text: b.email })]) : ''
      ]);

      var select = el('select', { 'aria-label': 'Status for ' + b.reference });
      STATUSES.forEach(function (s) {
        var opt = el('option', { value: s, text: s.charAt(0).toUpperCase() + s.slice(1) });
        if (s === b.status) opt.selected = true;
        select.append(opt);
      });
      var notes = el('textarea', { 'aria-label': 'Notes for ' + b.reference, maxlength: '2000', placeholder: 'Private notes' });
      notes.value = b.notes || '';
      var saved = el('span', { className: 'saved', 'aria-live': 'polite' });

      function save(payload) {
        saved.textContent = '';
        api('PATCH', '/api/admin/bookings/' + b.id, payload)
          .then(function () {
            saved.textContent = 'Saved';
            if (payload.status) load();
          })
          .catch(function (err) { showError('dash-error', err.message); });
      }
      select.addEventListener('change', function () { save({ status: select.value }); });
      notes.addEventListener('change', function () { save({ notes: notes.value }); });

      var del = el('button', { type: 'button', className: 'btn btn-danger btn-sm', text: 'Delete' });
      del.addEventListener('click', function () {
        if (!window.confirm('Delete booking ' + b.reference + ' for ' + b.name + '? This cannot be undone.')) return;
        api('DELETE', '/api/admin/bookings/' + b.id)
          .then(load)
          .catch(function (err) { showError('dash-error', err.message); });
      });

      var mk = el('button', { type: 'button', className: 'btn btn-water btn-sm', text: 'Create receipt' });
      mk.addEventListener('click', function () { openReceiptForm(b); });

      tbody.append(el('tr', null, [
        el('td', null, [
          el('strong', { text: b.reference }),
          el('small', { text: formatDate(b.created_at) }),
          el('span', { className: 'badge badge-' + b.status, text: b.status })
        ]),
        customer,
        el('td', null, [
          el('strong', { text: b.date }),
          el('small', { text: state.activities[b.activity] || b.activity }),
          el('small', { text: b.people + (b.people === 1 ? ' person' : ' people') }),
          b.receipts ? el('small', { className: 'receipt-link', text: 'Receipt: ' + b.receipts }) : ''
        ]),
        el('td', { className: 'msg', text: b.message || '–' }),
        el('td', null, [select, notes, saved]),
        el('td', null, [el('div', { className: 'actions' }, [mk, del])])
      ]));
    });
  }

  $('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    showError('login-error', '');
    var btn = e.target.querySelector('button');
    btn.disabled = true;
    api('POST', '/api/admin/login', { username: $('l-user').value, password: $('l-pass').value })
      .then(function (data) {
        csrfToken = data.csrfToken;
        $('l-pass').value = '';
        showDashboard(data.username);
      })
      .catch(function (err) { showError('login-error', err.message); })
      .finally(function () { btn.disabled = false; });
  });

  $('logout-btn').addEventListener('click', function () {
    api('POST', '/api/admin/logout', {}).catch(function () {}).then(showLogin);
  });

  $('filters').addEventListener('submit', function (e) {
    e.preventDefault();
    state.page = 1;
    load();
  });
  $('refresh-btn').addEventListener('click', load);
  $('prev-btn').addEventListener('click', function () { state.page -= 1; load(); });
  $('next-btn').addEventListener('click', function () { state.page += 1; load(); });
  $('export-btn').addEventListener('click', function () {
    window.location.href = '/api/admin/bookings.csv?' + filters().toString();
  });


  // ======================= Receipts & billing =======================
  var R = { settings: null, items: [], autoRate: '', q: '' };
  var inrFmt = new Intl.NumberFormat('en-IN');
  function inr(n) { return '₹' + inrFmt.format(Number(n) || 0); }

  function showReceiptError(err) { showError('receipt-error', err && err.message ? err.message : String(err || '')); }

  function setTab(name) {
    var bookings = name === 'bookings';
    $('tab-bookings').setAttribute('aria-selected', String(bookings));
    $('tab-receipts').setAttribute('aria-selected', String(!bookings));
    $('tab-bookings').tabIndex = bookings ? 0 : -1;
    $('tab-receipts').tabIndex = bookings ? -1 : 0;
    $('panel-bookings').hidden = !bookings;
    $('panel-receipts').hidden = bookings;
    if (bookings) { load(); return Promise.resolve(); }
    return ensureSettings().then(loadReceipts).catch(showReceiptError);
  }
  $('tab-bookings').addEventListener('click', function () { setTab('bookings'); });
  $('tab-receipts').addEventListener('click', function () { setTab('receipts'); });
  [$('tab-bookings'), $('tab-receipts')].forEach(function (t) {
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var other = t.id === 'tab-bookings' ? $('tab-receipts') : $('tab-bookings');
      other.focus();
      other.click();
    });
  });

  function ensureSettings() {
    if (R.settings) return Promise.resolve(R.settings);
    return api('GET', '/api/admin/receipts/settings').then(function (s) {
      R.settings = s;
      var sel = $('r-activity');
      sel.replaceChildren();
      Object.keys(s.activities).forEach(function (k) { sel.append(el('option', { value: k, text: s.activities[k] })); });
      renderStamp();
      return s;
    });
  }

  // ---- Automatic prices from the price list ----
  function suggestRate(activity, dateStr) {
    var p = R.settings && R.settings.priceList[activity];
    if (!p) return { rate: '', hint: 'Enter the rate for this service.' };
    if (p.seasonalRate) {
      if (!dateStr) return { rate: '', hint: 'Choose the arrival date to fill in the season price.' };
      return { rate: p.seasonalRate[Number(dateStr.slice(5, 7))], hint: 'Season price for that month from your price list. Change it if needed.' };
    }
    if (p.weekendRate && dateStr) {
      var day = new Date(dateStr + 'T00:00:00Z').getUTCDay();
      if (day === 0 || day === 6) return { rate: p.weekendRate, hint: 'Weekend price (Saturday or Sunday, 20% more). Change it if needed.' };
    }
    return { rate: p.rate, hint: p.weekendRate ? 'Weekday price from your price list. Change it if needed.' : 'Starting price from your price list. Change it if needed.' };
  }

  function applyActivity() {
    var a = $('r-activity').value;
    var p = R.settings.priceList[a];
    $('r-service').value = p ? p.service : (a === 'other' ? '' : (R.settings.activities[a] || ''));
    var s = suggestRate(a, $('r-arrival').value);
    R.items[0].description = p ? p.description : $('r-service').value;
    R.items[0].rate = s.rate;
    R.autoRate = s.rate;
    $('rate-hint').setAttribute('data-hint', s.hint);
    $('rate-hint').textContent = s.hint;
    renderItems();
    update();
  }

  // Warn when the first line's rate is not the website price (for example a discount).
  function priceCheck() {
    var box = $('rate-hint');
    var s = suggestRate($('r-activity').value, $('r-arrival').value);
    var base = box.getAttribute('data-hint') || '';
    var rate = R.items[0] ? R.items[0].rate : '';
    if (s.rate !== '' && rate !== '' && Number(rate) !== Number(s.rate)) {
      box.textContent = 'Note: line 1 rate ' + inr(rate) + ' is different from the website price ' + inr(s.rate) + '.';
      box.classList.add('rate-warn');
    } else {
      box.textContent = base;
      box.classList.remove('rate-warn');
    }
  }

  function applyArrival() {
    var s = suggestRate($('r-activity').value, $('r-arrival').value);
    if (String(R.items[0].rate) === String(R.autoRate)) R.items[0].rate = s.rate;
    R.autoRate = s.rate;
    $('rate-hint').setAttribute('data-hint', s.hint);
    $('rate-hint').textContent = s.hint;
    renderItems();
    update();
  }

  function renderItems() {
    var box = $('items');
    box.replaceChildren();
    R.items.forEach(function (it, i) {
      var desc = el('input', { type: 'text', maxlength: '120', 'aria-label': 'Description, line ' + (i + 1), placeholder: 'Description' });
      desc.value = it.description;
      var pax = el('input', { type: 'number', min: '1', max: '500', step: '1', inputmode: 'numeric', 'aria-label': 'Pax, line ' + (i + 1) });
      pax.value = it.pax;
      var rate = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', 'aria-label': 'Rate in rupees, line ' + (i + 1) });
      rate.value = it.rate;
      var amount = el('span', { className: 'item-amount', text: inr((Number(it.pax) || 0) * (Number(it.rate) || 0)) });
      function sync() {
        it.description = desc.value;
        it.pax = pax.value;
        it.rate = rate.value;
        amount.textContent = inr((Number(it.pax) || 0) * (Number(it.rate) || 0));
        update();
      }
      desc.addEventListener('input', sync);
      pax.addEventListener('input', sync);
      rate.addEventListener('input', sync);
      var remove = el('button', { type: 'button', className: 'btn btn-danger btn-sm', text: 'Remove', 'aria-label': 'Remove line ' + (i + 1) });
      remove.hidden = R.items.length < 2;
      remove.addEventListener('click', function () { R.items.splice(i, 1); renderItems(); update(); });
      box.append(el('div', { className: 'item-row' }, [
        el('label', { className: 'item-desc' }, [el('span', { text: 'Description' }), desc]),
        el('label', null, [el('span', { text: 'Pax' }), pax]),
        el('label', null, [el('span', { text: 'Rate ₹' }), rate]),
        el('div', { className: 'item-amount-wrap' }, [el('span', { text: 'Amount' }), amount]),
        remove
      ]));
    });
  }

  $('add-item-btn').addEventListener('click', function () {
    if (R.items.length >= 10) return;
    R.items.push({ description: '', pax: 1, rate: '' });
    renderItems();
    update();
  });
  $('r-activity').addEventListener('change', applyActivity);
  $('r-arrival').addEventListener('change', applyArrival);
  ['r-name', 'r-service', 'r-advance', 'r-booked-at'].forEach(function (id) { $(id).addEventListener('input', update); });

  function totals() {
    var total = R.items.reduce(function (sum, it) { return sum + (Number(it.pax) || 0) * (Number(it.rate) || 0); }, 0);
    var advance = Number($('r-advance').value) || 0;
    return { total: total, advance: advance, balance: Math.max(0, total - advance) };
  }

  function update() {
    priceCheck();
    var t = totals();
    $('t-total').textContent = inr(t.total);
    $('t-advance').textContent = inr(t.advance);
    $('t-balance').textContent = inr(t.balance);
    var bookedAt = $('r-booked-at').value ? new Date($('r-booked-at').value) : new Date();
    renderPreview($('receipt-preview'), {
      receipt_no: 'Given when saved',
      client_name: $('r-name').value || 'Client name',
      booking_at: isNaN(bookedAt) ? new Date().toISOString() : bookedAt.toISOString(),
      arrival_date: $('r-arrival').value,
      service: $('r-service').value || 'Service',
      items: R.items.map(function (it) {
        var pax = Number(it.pax) || 0;
        var rate = Number(it.rate) || 0;
        return { description: it.description || 'Description', pax: pax, rate: rate, amount: pax * rate };
      }),
      total: t.total, advance: t.advance, balance: t.balance
    });
  }

  // ---- Receipt preview (same layout as the PDF) ----
  function fmtDateTime(iso) {
    var d = new Date(iso);
    var date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    var time = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
    return date + ', ' + time;
  }
  function fmtDate(isoDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || '')) return '—';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(isoDate + 'T00:00:00Z'));
  }

  function renderPreview(box, r) {
    var b = R.settings.business;
    var rows = [['Receipt no.', r.receipt_no], ['Client name', String(r.client_name).toUpperCase()], ['Booking date', fmtDateTime(r.booking_at)], ['Arrival date', fmtDate(r.arrival_date)], ['Service', r.service]];
    var auth = [];
    if (R.settings.hasStamp) auth.push(el('img', { className: 'rp-stamp', src: R.stampSrc || (R.stampSrc = platform.stampUrl()), alt: '' }));
    auth.push(el('div', { className: 'rp-line' }), el('strong', { text: 'Proprietor / Authorised Signatory' }));
    box.replaceChildren(el('div', { className: 'rp' }, [
      el('div', { className: 'rp-head' }, [
        el('div', null, [el('div', { className: 'rp-name', text: b.name }), el('div', { className: 'rp-sub', text: b.address }),
          el('div', { className: 'rp-sub', text: 'Phone / WhatsApp: ' + b.phone + '  |  ' + b.email })]),
        el('div', { className: 'rp-title' }, [el('strong', { text: 'BOOKING RECEIPT' }), el('span', { text: b.tagline })])
      ]),
      el('div', { className: 'rp-body' }, [
        el('div', { className: 'rp-info' }, rows.map(function (row) {
          return el('div', null, [el('span', { text: row[0] }), el('strong', { text: row[1] })]);
        })),
        el('table', { className: 'rp-items' }, [
          el('thead', null, [el('tr', null, [el('th', { text: 'Description' }), el('th', { text: 'Pax' }), el('th', { text: 'Rate' }), el('th', { text: 'Amount' })])]),
          el('tbody', null, r.items.map(function (it) {
            return el('tr', null, [el('td', { text: it.description }), el('td', { text: String(it.pax) }), el('td', { text: inr(it.rate) }), el('td', { text: inr(it.amount) })]);
          }))
        ]),
        el('div', { className: 'rp-totals' }, [
          el('div', null, [el('span', { text: 'Total amount' }), el('span', { text: inr(r.total) })]),
          el('div', null, [el('span', { text: 'Advance received' }), el('span', { text: inr(r.advance) })]),
          el('div', { className: 'rp-balance' }, [el('span', { text: 'Balance amount' }), el('span', { text: inr(r.balance) })])
        ]),
        el('p', { className: 'rp-note', text: b.thanks + ' ' + (r.balance > 0 ? b.balanceNote : 'Paid in full. No balance is due.') }),
        el('div', { className: 'rp-sign' }, [el('span', { text: 'Client signature: ________________' }), el('div', { className: 'rp-auth' }, auth)])
      ]),
      el('div', { className: 'rp-foot', text: b.footer })
    ]));
  }

  function updateSendEmail() {
    var box = $('r-send-email');
    var hint = $('send-email-hint');
    var hasEmail = /@/.test($('r-email').value);
    if (!R.settings.mailEnabled) {
      box.checked = false;
      box.disabled = true;
      hint.textContent = 'Email is not set up yet, so receipts cannot be emailed. You can still send them on WhatsApp.';
    } else if (!hasEmail) {
      box.disabled = true;
      hint.textContent = 'Add the client\'s email address to send the receipt by email.';
    } else {
      if (box.disabled) box.checked = true;
      box.disabled = false;
      hint.textContent = '';
    }
  }
  $('r-email').addEventListener('input', updateSendEmail);

  function clearReceiptErrors() {
    ['clientName', 'clientPhone', 'clientEmail', 'arrivalDate', 'service', 'items', 'advance', 'bookingAt'].forEach(function (k) {
      var e = $('re-' + k);
      if (e) e.textContent = '';
    });
    showError('receipt-error', '');
  }

  function openReceiptForm(booking) {
    var go = $('panel-receipts').hidden ? setTab('receipts') : Promise.resolve();
    go.then(ensureSettings).then(function () {
      clearReceiptErrors();
      $('receipt-result').hidden = true;
      $('receipt-form').hidden = false;
      $('r-booking-id').value = booking ? booking.id : '';
      $('receipt-form-title').textContent = booking ? 'Receipt for booking ' + booking.reference : 'New receipt';
      $('receipt-booking-note').hidden = !booking;
      $('receipt-booking-note').textContent = booking ? 'Saving a receipt with an advance marks this booking as confirmed.' : '';
      $('r-name').value = booking ? booking.name : '';
      $('r-phone').value = booking ? booking.phone : '';
      $('r-email').value = booking && booking.email ? booking.email : '';
      $('r-arrival').value = booking ? booking.date : '';
      $('r-activity').value = booking && R.settings.activities[booking.activity] ? booking.activity : Object.keys(R.settings.activities)[0];
      $('r-advance').value = '0';
      $('r-booked-at').value = '';
      R.items = [{ description: '', pax: booking ? booking.people : 1, rate: '' }];
      $('r-send-email').checked = true;
      $('r-send-email').disabled = false;
      updateSendEmail();
      applyActivity();
      $('receipt-form').scrollIntoView({ block: 'start' });
      $('r-name').focus({ preventScroll: true });
    }).catch(showReceiptError);
  }
  $('new-receipt-btn').addEventListener('click', function () { openReceiptForm(null); });
  $('cancel-receipt-btn').addEventListener('click', function () { $('receipt-form').hidden = true; });

  $('receipt-form').addEventListener('submit', function (e) {
    e.preventDefault();
    clearReceiptErrors();
    var bookedAt = $('r-booked-at').value;
    var payload = {
      bookingId: $('r-booking-id').value || null,
      clientName: $('r-name').value,
      clientPhone: $('r-phone').value,
      clientEmail: $('r-email').value,
      arrivalDate: $('r-arrival').value,
      service: $('r-service').value,
      items: R.items.map(function (it) { return { description: it.description, pax: Number(it.pax), rate: Number(it.rate) }; }),
      advance: Number($('r-advance').value || 0),
      sendEmail: $('r-send-email').checked && !$('r-send-email').disabled
    };
    if (bookedAt) payload.bookingAt = new Date(bookedAt).toISOString();
    var btn = $('save-receipt-btn');
    btn.disabled = true;
    api('POST', '/api/admin/receipts', payload)
      .then(function (data) {
        $('receipt-form').hidden = true;
        showResult(data.receipt, data);
        loadReceipts();
      })
      .catch(function (err) {
        if (err.fields) {
          Object.keys(err.fields).forEach(function (k) {
            var target = $('re-' + (k.indexOf('items.') === 0 ? 'items' : k));
            if (target) target.textContent = err.fields[k];
          });
        }
        showReceiptError(err);
      })
      .finally(function () { btn.disabled = false; });
  });

  function whatsappText(r) {
    return [
      'Hello ' + r.client_name + ', thank you for booking with Adventure Park, Shivpuri.',
      'Receipt: ' + r.receipt_no,
      'Service: ' + r.service,
      'Arrival: ' + fmtDate(r.arrival_date),
      'Total: ' + inr(r.total),
      'Advance received: ' + inr(r.advance),
      'Balance (payable at the venue): ' + inr(r.balance),
      r.share_url ? 'Your receipt (PDF): ' + r.share_url : null,
      'Please carry this receipt and a valid photo ID. See you at the river!'
    ].filter(Boolean).join('\n');
  }

  function receiptActions(r, withDelete) {
    var status = el('span', { className: 'saved', 'aria-live': 'polite' });
    var view = el('button', { type: 'button', className: 'btn btn-water btn-sm', text: 'View PDF' });
    view.addEventListener('click', function () { platform.openPdf(r, false); });
    var dl = el('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Download PDF' });
    dl.addEventListener('click', function () { platform.openPdf(r, true); });
    var list = [];
    if (r.client_phone) {
      list.push(el('a', {
        className: 'btn btn-wa btn-sm', target: '_blank', rel: 'noopener noreferrer', text: 'Send receipt on WhatsApp',
        href: 'https://wa.me/' + r.client_phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(whatsappText(r))
      }));
    }
    list.push(view, dl);
    if (r.share_url) {
      var copy = el('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Copy receipt link' });
      copy.addEventListener('click', function () {
        var done = function () { status.textContent = 'Link copied. Paste it into any chat.'; };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(r.share_url).then(done, function () { status.textContent = r.share_url; });
        } else {
          status.textContent = r.share_url;
        }
      });
      list.push(copy);
    }
    if (r.client_email && R.settings.mailEnabled) {
      var mail = el('button', { type: 'button', className: 'btn btn-outline btn-sm', text: 'Email receipt' });
      mail.addEventListener('click', function () {
        mail.disabled = true;
        status.textContent = '';
        api('POST', '/api/admin/receipts/' + r.id + '/email', {})
          .then(function () { status.textContent = 'Emailed to ' + r.client_email; })
          .catch(showReceiptError)
          .finally(function () { mail.disabled = false; });
      });
      list.push(mail);
    }
    if (withDelete) {
      var del = el('button', { type: 'button', className: 'btn btn-danger btn-sm', text: 'Delete' });
      var armed = null;
      del.addEventListener('click', function () {
        if (!armed) {
          del.textContent = 'Tap again to delete';
          armed = setTimeout(function () { armed = null; del.textContent = 'Delete'; }, 4000);
          return;
        }
        clearTimeout(armed);
        api('DELETE', '/api/admin/receipts/' + r.id).then(loadReceipts).catch(showReceiptError);
      });
      list.push(del);
    }
    list.push(status);
    return list;
  }

  function showResult(r, info) {
    info = info || {};
    var box = $('receipt-result');
    var lines = [el('p', null, [el('strong', { text: 'Receipt ' + r.receipt_no + ' saved.' }), ' ' + r.client_name + ', balance ' + inr(r.balance) + '.'])];
    if (info.emailed) lines.push(el('p', { className: 'small', text: 'The receipt PDF was emailed to ' + r.client_email + '.' }));
    if (info.emailError) lines.push(el('p', { className: 'small warn-text', text: info.emailError }));
    if (r.client_phone) lines.push(el('p', { className: 'small', text: 'Tap "Send receipt on WhatsApp" to send the customer the receipt link and summary.' }));
    if (info.bookingConfirmed) lines.push(el('p', { className: 'small', text: 'The linked booking is now marked as confirmed.' }));
    lines.push(el('div', { className: 'actions-row' }, receiptActions(r, false)));
    box.replaceChildren.apply(box, lines);
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest' });
  }

  function loadReceipts() {
    showError('receipt-error', '');
    var params = new URLSearchParams();
    if (R.q) params.set('q', R.q);
    return api('GET', '/api/admin/receipts?' + params.toString()).then(function (data) {
      var tbody = $('receipt-rows');
      tbody.replaceChildren();
      $('receipt-empty').hidden = data.receipts.length > 0;
      data.receipts.forEach(function (r) {
        tbody.append(el('tr', null, [
          el('td', null, [el('strong', { text: r.receipt_no }), el('small', { text: fmtDateTime(r.booking_at) })]),
          el('td', null, [el('strong', { text: r.client_name }), r.client_phone ? el('small', { text: r.client_phone }) : '']),
          el('td', null, [el('strong', { text: fmtDate(r.arrival_date) }), el('small', { text: r.service })]),
          el('td', { className: 'amounts' }, [
            el('small', { text: 'Total ' + inr(r.total) }),
            el('small', { text: 'Advance ' + inr(r.advance) }),
            el('strong', { text: 'Balance ' + inr(r.balance) })
          ]),
          el('td', null, [el('div', { className: 'actions actions-wrap' }, receiptActions(r, true))])
        ]));
      });
      $('receipt-sums').textContent = data.total
        ? data.total + (data.total === 1 ? ' receipt' : ' receipts') + '. Total ' + inr(data.sums.total) + ', advance received ' + inr(data.sums.advance) + ', balance due ' + inr(data.sums.balance) + '.'
        : '';
    }).catch(showReceiptError);
  }
  $('r-search-btn').addEventListener('click', function () { R.q = $('rq').value.trim(); loadReceipts(); });
  $('rq').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); R.q = $('rq').value.trim(); loadReceipts(); } });
  $('r-export-btn').addEventListener('click', function () {
    var params = new URLSearchParams();
    if (R.q) params.set('q', R.q);
    platform.exportReceipts(params.toString());
  });

  // ---- Official stamp ----
  function renderStamp() {
    var has = Boolean(R.settings && R.settings.hasStamp);
    $('stamp-img').hidden = !has;
    $('stamp-empty').hidden = has;
    $('stamp-remove-btn').hidden = !has;
    if (has) {
      R.stampSrc = platform.stampUrl();
      $('stamp-img').src = R.stampSrc;
    }
  }
  $('stamp-upload-btn').addEventListener('click', function () {
    var file = $('stamp-file').files[0];
    var status = $('stamp-status');
    if (!file) { status.textContent = 'Choose a PNG or JPEG image first.'; return; }
    if (['image/png', 'image/jpeg'].indexOf(file.type) === -1) { status.textContent = 'Only PNG or JPEG images can be used.'; return; }
    if (file.size > 1024 * 1024) { status.textContent = 'The image is larger than 1 MB. Please use a smaller photo.'; return; }
    status.textContent = 'Uploading…';
    platform.uploadStamp(file)
      .then(function () {
        R.settings.hasStamp = true;
        renderStamp();
        status.textContent = 'Stamp uploaded. It now appears on every receipt.';
        $('stamp-file').value = '';
        if (!$('receipt-form').hidden) update();
      })
      .catch(function (err) { status.textContent = err.message; });
  });
  $('stamp-remove-btn').addEventListener('click', function () {
    api('DELETE', '/api/admin/receipts/stamp/image')
      .then(function () {
        R.settings.hasStamp = false;
        renderStamp();
        $('stamp-status').textContent = 'Stamp removed.';
        if (!$('receipt-form').hidden) update();
      })
      .catch(function (err) { $('stamp-status').textContent = err.message; });
  });

  api('GET', '/api/admin/session')
    .then(function (data) {
      if (data.authenticated) {
        csrfToken = data.csrfToken;
        showDashboard(data.username);
      } else {
        showLogin();
      }
    })
    .catch(showLogin);
})();
