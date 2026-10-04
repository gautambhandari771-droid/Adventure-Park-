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
        if (!res.ok) throw new Error(data.error || 'Request failed.');
        return data;
      });
    });
  }

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
          el('small', { text: b.people + (b.people === 1 ? ' person' : ' people') })
        ]),
        el('td', { className: 'msg', text: b.message || '–' }),
        el('td', null, [select, notes, saved]),
        el('td', null, [el('div', { className: 'actions' }, [del])])
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
