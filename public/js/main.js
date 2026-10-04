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
      if (month === 7 || month === 8) errors.date = 'We are closed in July and August (monsoon). Our season runs September to June.';
      else if (data.date < todayInIndia()) errors.date = 'The date cannot be in the past.';
    }
    if (!(data.people >= 1 && data.people <= 60)) errors.people = 'Group size must be between 1 and 60.';
    if (!data.consent) errors.consent = 'Please agree so we can contact you about this booking.';
    return errors;
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

    fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (result) {
        if (result.status === 201 && result.body.ok) {
          var ref = document.createElement('span');
          ref.className = 'ref';
          ref.textContent = result.body.reference;
          var p1 = document.createElement('p');
          p1.append('Thank you! Your request ', ref, ' has been received. We will call or WhatsApp you soon to confirm.');
          var nodes = [p1];
          if (result.body.whatsappUrl && /^https:\/\/wa\.me\//.test(result.body.whatsappUrl)) {
            var a = document.createElement('a');
            a.className = 'btn btn-water btn-sm';
            a.href = result.body.whatsappUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'Send details on WhatsApp for a faster reply';
            var p2 = document.createElement('p');
            p2.appendChild(a);
            nodes.push(p2);
          }
          showStatus('success', nodes);
          form.reset();
          return;
        }
        if (result.status === 422 && result.body.fields) {
          Object.keys(result.body.fields).forEach(function (n) { setFieldError(n, result.body.fields[n]); });
        }
        showStatus('error', [para(result.body.error || 'Sorry, something went wrong. Please call or WhatsApp us at +91 87555 42743.')]);
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
