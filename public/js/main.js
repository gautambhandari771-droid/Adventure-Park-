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

  // Messages in the page's language (English, or Hindi on /hi/).
  var HINDI = /^hi\b/i.test(document.documentElement.lang || '');
  var T = HINDI ? {
    perPersonPrice: function (n, rate, weekend) { return n + ' × ' + inr(rate) + ' प्रति व्यक्ति, ' + (weekend ? 'वीकेंड' : 'सामान्य दिन') + ' का रेट'; },
    perRoom: function (rate) { return inr(rate) + ' प्रति कमरा प्रति रात से (उस सीज़न का रेट)'; },
    perNight: function (total, n, rate) { return inr(total) + ' प्रति रात से (' + n + ' × ' + inr(rate) + ' प्रति व्यक्ति)'; },
    estimateLine: function (text) { return 'अनुमानित कीमत: ' + text + '। सही कीमत हम कॉल पर कन्फ़र्म करेंगे।'; },
    estimate: 'अनुमानित कीमत: ',
    name: 'कृपया अपना नाम लिखें।',
    phone: 'कृपया सही मोबाइल नंबर लिखें।',
    activity: 'कृपया एक्टिविटी चुनें।',
    date: 'कृपया तारीख़ चुनें।',
    monsoon: 'जुलाई और अगस्त में (मानसून) राफ्टिंग बंद रहती है। कैंपिंग और गेस्ट हाउस पूरे साल खुले हैं।',
    past: 'बीती हुई तारीख़ नहीं चुन सकते।',
    people: 'लोगों की संख्या 1 से 60 के बीच होनी चाहिए।',
    consent: 'कृपया सहमति दें ताकि हम इस बुकिंग के बारे में आपसे संपर्क कर सकें।',
    serverField: 'कृपया यह जानकारी जाँचें।',
    checkFields: 'कृपया लाल रंग में दिखाई गई जानकारी जाँचें।',
    callUs: 'कृपया हमें +91 87555 42743 पर कॉल या WhatsApp करें।',
    sending: 'भेजा जा रहा है…',
    submit: 'बुकिंग अनुरोध भेजें',
    waFallbackBtn: 'अपनी बुकिंग WhatsApp पर भेजें',
    notSent: 'माफ़ कीजिए, आपका अनुरोध ऑनलाइन नहीं भेजा जा सका। कृपया इसे WhatsApp पर भेजें या +91 87555 42743 पर कॉल करें।',
    thanks: ['धन्यवाद! आपका अनुरोध ', ' हमें मिल गया है। हम जल्द ही आपको कॉल या WhatsApp करके कन्फ़र्म करेंगे।'],
    emailOnWay: function (email) { return 'कन्फ़र्मेशन ईमेल ' + email + ' पर भेजा जा रहा है। अगर न दिखे तो स्पैम फ़ोल्डर देखें।'; },
    waFaster: 'जल्दी जवाब के लिए जानकारी WhatsApp पर भेजें',
    offline: 'कनेक्ट नहीं हो सका। कृपया अपना इंटरनेट जाँचें, या +91 87555 42743 पर कॉल या WhatsApp करें।',
    waText: function (data, reference, activity, estimate) {
      return ['नमस्ते Adventure Park, मैंने बुकिंग अनुरोध ' + reference + ' भेजा है।', 'एक्टिविटी: ' + activity,
        'तारीख़: ' + data.date + ', लोग: ' + data.people, estimate ? 'अनुमानित कीमत: ' + estimate : null, 'नाम: ' + data.name];
    },
    autoresponse: function (reference, activity, data, estimate) {
      return 'Adventure Park, शिवपुरी चुनने के लिए धन्यवाद। हमें ' + data.date + ' के लिए ' + activity + ' (' + data.people + ' लोग) का आपका बुकिंग अनुरोध ' +
        reference + ' मिल गया है। ' + (estimate ? 'अनुमानित कीमत: ' + estimate + '। ' : '') +
        'हम +91 87555 42743 से कॉल या WhatsApp करके आपका स्लॉट और सही कीमत कन्फ़र्म करेंगे। ' +
        'हम बुकिंग सिर्फ़ अपने आधिकारिक नंबर और ईमेल से कन्फ़र्म करते हैं, और कभी भी आपका कार्ड PIN, OTP या पासवर्ड नहीं माँगते।';
    }
  } : {
    perPersonPrice: function (n, rate, weekend) { return n + ' × ' + inr(rate) + ' per person, ' + (weekend ? 'weekend' : 'weekday') + ' price'; },
    perRoom: function (rate) { return 'from ' + inr(rate) + ' per room per night for that season'; },
    perNight: function (total, n, rate) { return 'from ' + inr(total) + ' per night (' + n + ' × ' + inr(rate) + ' per person)'; },
    estimateLine: function (text) { return 'Estimated price: ' + text + '. We confirm the final price when we call you.'; },
    estimate: 'Estimated price: ',
    name: 'Please enter your name.',
    phone: 'Please enter a valid mobile number.',
    activity: 'Please choose an activity.',
    date: 'Please choose a date.',
    monsoon: 'Rafting is closed in July and August (monsoon). Camping and the guest house are open all year.',
    past: 'The date cannot be in the past.',
    people: 'Group size must be between 1 and 60.',
    consent: 'Please agree so we can contact you about this booking.',
    serverField: null,
    checkFields: 'Please check the highlighted fields.',
    callUs: 'Please call or WhatsApp us at +91 87555 42743.',
    sending: 'Sending…',
    submit: 'Send booking request',
    waFallbackBtn: 'Send your booking on WhatsApp',
    notSent: 'Sorry, your request could not be sent online. Please send it on WhatsApp instead, or call +91 87555 42743.',
    thanks: ['Thank you! Your request ', ' has been received. We will call or WhatsApp you soon to confirm.'],
    emailOnWay: function (email) { return 'A confirmation email is on its way to ' + email + '. Please check your spam folder if you do not see it.'; },
    waFaster: 'Send details on WhatsApp for a faster reply',
    offline: 'Could not connect. Please check your internet, or call or WhatsApp us at +91 87555 42743.',
    waText: function (data, reference, activity, estimate) {
      return ['Hello Adventure Park, I sent booking request ' + reference + '.', 'Activity: ' + activity,
        'Date: ' + data.date + ', People: ' + data.people, estimate ? 'Estimate: ' + estimate : null, 'Name: ' + data.name];
    },
    autoresponse: function (reference, activity, data, estimate) {
      return 'Thank you for choosing Adventure Park, Shivpuri. We have received your booking request ' + reference +
        ' for ' + activity + ' on ' + data.date + ' (' + data.people + (data.people === 1 ? ' person' : ' people') + '). ' +
        (estimate ? 'Estimated price: ' + estimate + '. ' : '') +
        'We will call or WhatsApp you from +91 87555 42743 to confirm your slot and the final price. ' +
        'We only confirm bookings from our official number and email, and we never ask for your card PIN, OTP or passwords.';
    }
  };

  function estimateText(activity, date, people) {
    var p = PRICES[activity];
    if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
    var n = Math.max(1, Number(people) || 1);
    if (p.weekendRate) {
      var day = new Date(date + 'T00:00:00Z').getUTCDay();
      var weekend = day === 0 || day === 6;
      var rate = weekend ? p.weekendRate : p.rate;
      return inr(rate * n) + ' (' + T.perPersonPrice(n, rate, weekend) + ')';
    }
    if (p.seasonalRate) return T.perRoom(p.seasonalRate[Number(date.slice(5, 7))]);
    return T.perNight(p.rate * n, n, p.rate);
  }

  var estimateBox = document.getElementById('price-estimate');
  function updateEstimate() {
    if (!estimateBox) return;
    var text = estimateText(form.elements.activity.value, form.elements.date.value, form.elements.people.value);
    estimateBox.hidden = !text;
    estimateBox.textContent = text ? T.estimateLine(text) : '';
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
    if (!data.name || data.name.trim().length < 2) errors.name = T.name;
    if (!/^[+\d][\d\s\-()]{6,18}$/.test(data.phone || '')) errors.phone = T.phone;
    if (!data.activity) errors.activity = T.activity;
    if (!data.date) {
      errors.date = T.date;
    } else {
      var month = Number(data.date.slice(5, 7));
      if ((month === 7 || month === 8) && data.activity.indexOf('rafting-') === 0) errors.date = T.monsoon;
      else if (data.date < todayInIndia()) errors.date = T.past;
    }
    if (!(data.people >= 1 && data.people <= 60)) errors.people = T.people;
    if (!data.consent) errors.consent = T.consent;
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
    var text = T.waText(data, reference, activityName(data.activity), estimate).filter(Boolean).join('\n');
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
    if (HINDI) payload.Language = 'Hindi (booked on the Hindi page)';
    if (data.email) {
      payload.email = data.email;
      payload._autoresponse = T.autoresponse(reference, activity, data, estimate);
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
    submitBtn.textContent = T.sending;

    saveBooking(data)
      .then(function (server) {
        if (server.status === 422 && server.body.fields) {
          Object.keys(server.body.fields).forEach(function (n) { setFieldError(n, T.serverField || server.body.fields[n]); });
          showStatus('error', [para(HINDI ? T.checkFields : server.body.error || T.checkFields)]);
          return null;
        }
        if (server.status === 429 || server.status === 403) {
          showStatus('error', [para(HINDI ? T.callUs : server.body.error || T.callUs)]);
          return null;
        }
        var saved = server.status === 201 && server.body.ok;
        var reference = saved ? server.body.reference : makeReference();
        // The server writes its estimate in English, so the Hindi page uses its own (same price list).
        var estimate = saved && !HINDI ? server.body.estimate : estimateText(data.activity, data.date, data.people);
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
            wa.textContent = T.waFallbackBtn;
            var pw = document.createElement('p');
            pw.appendChild(wa);
            showStatus('error', [para(T.notSent), pw]);
            return null;
          }
          var ref = document.createElement('span');
          ref.className = 'ref';
          ref.textContent = reference;
          var p1 = document.createElement('p');
          p1.append(T.thanks[0], ref, T.thanks[1]);
          var nodes = [p1];
          if (estimate) nodes.push(para(T.estimate + estimate + (HINDI ? '।' : '.')));
          if ((saved && server.body.confirmationEmail) || (forwarded && data.email)) {
            nodes.push(para(T.emailOnWay(data.email)));
          }
          var waUrl = saved && server.body.whatsappUrl && !HINDI ? server.body.whatsappUrl : whatsappLink(data, reference, estimate);
          if (/^https:\/\/wa\.me\//.test(waUrl)) {
            var a = document.createElement('a');
            a.className = 'btn btn-water btn-sm';
            a.href = waUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = T.waFaster;
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
        showStatus('error', [para(T.offline)]);
      })
      .finally(function () {
        busy = false;
        submitBtn.disabled = false;
        submitBtn.textContent = T.submit;
      });
  });
})();
