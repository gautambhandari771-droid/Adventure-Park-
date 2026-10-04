(function () {
  'use strict';

  // ---- Mobile navigation -------------------------------------------------
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---- Footer year ---------------------------------------------------------
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  // ---- Booking form --------------------------------------------------------
  var form = document.getElementById('booking-form');
  if (!form) return;

  // Website price list (kept in step with the server by a test).
  var PRICES = /* prices:start */{"rafting-12km":{"rate":500,"weekendRate":600},"rafting-16km":{"rate":800,"weekendRate":960},"rafting-26km":{"rate":1500,"weekendRate":1800},"rafting-36km":{"rate":2500,"weekendRate":3000},"luxury-camping":{"rate":1500},"guest-house":{"seasonalRate":{"1":1500,"2":2200,"3":2200,"4":2200,"5":2200,"6":2200,"7":1200,"8":1200,"9":1200,"10":1500,"11":1500,"12":1500}}}/* prices:end */;
  var inrFmt = new Intl.NumberFormat('en-IN');
  function inr(n) { return '₹' + inrFmt.format(n); }

  function estimateText(activity, date, people) {
    var p = PRICES[activity];
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
    var n = Math.max(1, Number(people) || 1);
    if (p.weekendRate) {
      var day = new Date(date + 'T00:00:00Z').getUTCDay();
      var weekend = day === 0 || day === 6;
      var rate = weekend ? p.weekendRate : p.rate;
      return inr(rate * n) + ' (' + n + ' × ' + inr(rate) + ' per person, ' + (weekend ? 'weekend' : 'weekday') + ' price)';
    }
    if (p.seasonalRate) return 'from ' + inr(p.seasonalRate[Number(date.slice(5, 7))]) + ' per room per night for that season';
    return 'from ' + inr(p.rate * n) + ' per night (' + n + ' × ' + inr(p.rate) + ' per person)';
  }

  var estimateBox = document.getElementById('price-estimate');
  function updateEstimate() {
    if (!estimateBox) return;
    var text = estimateText(form.elements.activity.value, form.elements.date.value, form.elements.people.value);
    estimateBox.hidden = !text;
    estimateBox.textContent = text ? 'Estimated price: ' + text + '. We confirm the final price when we call you.' : '';
  }
  ['change', 'input'].forEach(function (evt) {
    ['activity', 'date', 'people'].forEach(function (name) {
      if (form.elements[name]) form.elements[name].addEventListener(evt, updateEstimate);
    });
  });

  var statusBox = document.getElementById('form-status');
  var submitBtn = form.querySelector('button[type="submit"]');
  var dateInput = document.getElementById('f-date');
  var activitySelect = document.getElementById('f-activity');

  function todayInIndia() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  if (dateInput) {
    var today = todayInIndia();
    dateInput.min = today;
    var max = new Date(today + 'T00:00:00Z');
    max.setUTCDate(max.getUTCDate() + 365);
    dateInput.max = max.toISOString().slice(0, 10);
  }

  // "Book" buttons on activity cards pre-select the activity.
  document.querySelectorAll('[data-activity]').forEach(function (link) {
    link.addEventListener('click', function () {
      if (activitySelect) activitySelect.value = link.getAttribute('data-activity');
      updateEstimate();
    });
  });

  function setFieldError(name, message) {
    var errorEl = document.getElementById('e-' + name);
    var input = form.elements[name];
    if (errorEl) errorEl.textContent = message || '';
    if (input) {
      var field = input.closest('.field');
      if (field) field.classList.toggle('has-error', Boolean(message));
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function clearErrors() {
    ['name', 'phone', 'email', 'activity', 'date', 'people', 'message', 'consent'].forEach(function (n) {
      setFieldError(n, '');
    });
  }

  function showStatus(type, nodes) {
    statusBox.hidden = false;
    statusBox.className = 'form-status ' + type;
    statusBox.replaceChildren.apply(statusBox, nodes);
  }

  function para(text) {
    var p = document.createElement('p');
    p.textContent = text;
    return p;
  }

  function clientChecks(data) {
    var errors = {};
    if (!data.name || data.name.trim().length < 2) errors.name = 'Please enter your name.';
    if (!/^[+\d][\d\s\-()]{6,18}$/.test(data.phone || '')) errors.phone = 'Please enter a valid mobile number.';
    if (!data.activity) errors.activity = 'Please choose an activity.';
    if (!data.date) {
      errors.date = 'Please choose a date.';
    } else {
      var month = Number(data.date.slice(5, 7));
      if ((month === 7 || month === 8) && data.activity.indexOf('rafting-') === 0) errors.date = 'Rafting is closed in July and August (monsoon). Camping and the guest house are open all year.';
      else if (data.date < todayInIndia()) errors.date = 'The date cannot be in the past.';
    }
    if (!(data.people >= 1 && data.people <= 60)) errors.people = 'Group size must be between 1 and 60.';
    if (!data.consent) errors.consent = 'Please agree so we can contact you about this booking.';
    return errors;
  }

  // ---- Sending ---------------------------------------------------------------
  // 1. The website's own server saves the booking (admin panel) when it is running.
  // 2. FormSubmit (formsubmit.co) emails it to us when there is no server or no email set up.
  var FORMSUBMIT_URL = form.getAttribute('data-formsubmit') || '';

  function postJson(url, body, timeoutMs) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: url.charAt(0) === '/' ? 'same-origin' : 'omit',
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, body: b }; });
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  /* BOOKING-SAVE-START */
  function saveBooking(data) {
    // On free static hosting there is no server to save to.
    if (form.getAttribute('data-static-site') === 'true') return Promise.resolve({ status: 0, body: {} });
    return postJson('/api/bookings', data, 10000).catch(function () { return { status: 0, body: {} }; });
  }
  /* BOOKING-SAVE-END */

  function makeReference() {
    var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var bytes = new Uint8Array(6);
    window.crypto.getRandomValues(bytes);
    var out = 'AP-';
    for (var i = 0; i < bytes.length; i += 1) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function activityName(value) {
    var opt = activitySelect ? activitySelect.querySelector('option[value="' + value + '"]') : null;
    return opt ? opt.textContent : value;
  }

  function whatsappLink(data, reference, estimate) {
    var text = [
      'Hello Adventure Park, I sent booking request ' + reference + '.',
      'Activity: ' + activityName(data.activity),
      'Date: ' + data.date + ', People: ' + data.people,
      estimate ? 'Estimate: ' + estimate : null,
      'Name: ' + data.name
    ].filter(Boolean).join('\n');
    return 'https://wa.me/918755542743?text=' + encodeURIComponent(text);
  }

  function sendToFormSubmit(data, reference, estimate) {
    if (!/^https:\/\/formsubmit\.co\/ajax\//.test(FORMSUBMIT_URL)) return Promise.resolve(false);
    var activity = activityName(data.activity);
    var payload = {
      _subject: 'New booking ' + reference + ': ' + data.date + ', ' + data.people + ' people',
      _template: 'table',
      _captcha: 'false',
      _honey: data.website,
      'Booking reference': reference,
      Name: data.name,
      Phone: data.phone,
      'WhatsApp chat': 'https://wa.me/' + data.phone.replace(/\D/g, '').replace(/^0?(\d{10})$/, '91$1'),
      Activity: activity,
      Date: data.date,
      People: String(data.people),
      'Estimated price': estimate || 'Price on request',
      Message: data.message || '-'
    };
    if (data.email) {
      payload.email = data.email;
      payload._autoresponse = 'Thank you for choosing Adventure Park, Shivpuri. We have received your booking request ' + reference +
        ' for ' + activity + ' on ' + data.date + ' (' + data.people + (data.people === 1 ? ' person' : ' people') + '). ' +
        (estimate ? 'Estimated price: ' + estimate + '. ' : '') +
        'We will call or WhatsApp you from +91 87555 42743 to confirm your slot and the final price. ' +
        'We only confirm bookings from our official number and email, and we never ask for your card PIN, OTP or passwords.';
    }
    return postJson(FORMSUBMIT_URL, payload, 15000)
      .then(function (r) { return r.status === 200 && String(r.body.success) === 'true'; })
      .catch(function () { return false; });
  }

  var busy = false;
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (busy) return;
    clearErrors();
    statusBox.hidden = true;

    var data = {
      name: form.elements.name.value.trim(),
      phone: form.elements.phone.value.trim(),
      email: form.elements.email.value.trim(),
      activity: form.elements.activity.value,
      date: form.elements.date.value,
      people: Number(form.elements.people.value),
      message: form.elements.message.value.trim(),
      consent: form.elements.consent.checked,
      website: form.elements.website.value
    };

    var errors = clientChecks(data);
    var names = Object.keys(errors);
    if (names.length) {
      names.forEach(function (n) { setFieldError(n, errors[n]); });
      var first = form.elements[names[0]];
      if (first && first.focus) first.focus();
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    saveBooking(data)
      .then(function (server) {
        if (server.status === 422 && server.body.fields) {
          Object.keys(server.body.fields).forEach(function (n) { setFieldError(n, server.body.fields[n]); });
          showStatus('error', [para(server.body.error || 'Please check the highlighted fields.')]);
          return null;
        }
        if (server.status === 429 || server.status === 403) {
          showStatus('error', [para(server.body.error || 'Please call or WhatsApp us at +91 87555 42743.')]);
          return null;
        }
        var saved = server.status === 201 && server.body.ok;
        var reference = saved ? server.body.reference : makeReference();
        var estimate = saved ? server.body.estimate : estimateText(data.activity, data.date, data.people);
        // FormSubmit emails the booking to us (and a confirmation to the customer)
        // whenever the website's own server is not running or cannot send email.
        var useFormSubmit = !saved || !server.body.ownerNotified;
        var forward = useFormSubmit ? sendToFormSubmit(data, reference, estimate) : Promise.resolve(false);
        return forward.then(function (forwarded) {
          if (!saved && !forwarded) {
            var wa = document.createElement('a');
            wa.className = 'btn btn-water btn-sm';
            wa.href = whatsappLink(data, reference, estimate);
            wa.target = '_blank';
            wa.rel = 'noopener noreferrer';
            wa.textContent = 'Send your booking on WhatsApp';
            var pw = document.createElement('p');
            pw.appendChild(wa);
            showStatus('error', [para('Sorry, your request could not be sent online. Please send it on WhatsApp instead, or call +91 87555 42743.'), pw]);
            return null;
          }
          var ref = document.createElement('span');
          ref.className = 'ref';
          ref.textContent = reference;
          var p1 = document.createElement('p');
          p1.append('Thank you! Your request ', ref, ' has been received. We will call or WhatsApp you soon to confirm.');
          var nodes = [p1];
          if (estimate) nodes.push(para('Estimated price: ' + estimate + '.'));
          if ((saved && server.body.confirmationEmail) || (forwarded && data.email)) {
            nodes.push(para('A confirmation email is on its way to ' + data.email + '. Please check your spam folder if you do not see it.'));
          }
          var waUrl = saved && server.body.whatsappUrl ? server.body.whatsappUrl : whatsappLink(data, reference, estimate);
          if (/^https:\/\/wa\.me\//.test(waUrl)) {
            var a = document.createElement('a');
            a.className = 'btn btn-water btn-sm';
            a.href = waUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'Send details on WhatsApp for a faster reply';
            var p2 = document.createElement('p');
            p2.appendChild(a);
            nodes.push(p2);
          }
          showStatus('success', nodes);
          form.reset();
          updateEstimate();
          return null;
        });
      })
      .catch(function () {
        showStatus('error', [para('Could not connect. Please check your internet, or call or WhatsApp us at +91 87555 42743.')]);
      })
      .finally(function () {
        busy = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send booking request';
      });
  });
})();
