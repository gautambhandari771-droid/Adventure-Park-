'use strict';

/**
 * Structured data (schema.org JSON-LD) for search engines and AI assistants.
 * Built from the same price list the website and receipts use, and from the
 * visible FAQ, so the markup always matches what visitors see.
 * Regenerate after changing prices or FAQs:  npm run schema
 */
const { BUSINESS } = require('./business');
const { PRICE_LIST } = require('./receipts');

const SITE = '%SITE_URL%';
const id = (frag) => `${SITE}/#${frag}`;

const RAFTING = [
  { key: 'rafting-12km', km: 12, from: 'Marine Drive', to: 'Shivpuri', hours: 'PT1H30M', grade: 'Grade II – III', audience: ['Beginners', 'Families', 'Groups'] },
  { key: 'rafting-16km', km: 16, from: 'Shivpuri', to: 'NIM Beach', hours: 'PT2H', grade: 'Grade II – III', audience: ['Beginners', 'Groups', 'Adventure seekers'] },
  { key: 'rafting-26km', km: 26, from: 'Marine Drive', to: 'NIM Beach', hours: 'PT3H', grade: 'Grade III', audience: ['Fit groups', 'Adventure seekers'] },
  { key: 'rafting-36km', km: 36, from: 'Kaudiyala', to: 'NIM Beach', hours: 'PT4H', grade: 'Grade III – IV', audience: ['Experienced rafters', 'Adventure seekers'] },
];

function perPerson(price, name) {
  return {
    '@type': 'UnitPriceSpecification',
    name,
    price,
    priceCurrency: 'INR',
    referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitText: 'person' },
  };
}

function rangePrice(minPrice, maxPrice, name, unitText) {
  return { '@type': 'UnitPriceSpecification', name, minPrice, maxPrice, priceCurrency: 'INR', unitText };
}

/** Read the visible FAQ (<details><summary>Q</summary><p>A</p></details>) from the page. */
function faqFromHtml(html) {
  const section = html.slice(html.indexOf('id="faq"'), html.indexOf('id="contact"'));
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  return [...section.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)]
    .map((m) => ({ question: strip(m[1]), answer: strip(m[2]) }));
}

function buildSchema(faq) {
  const business = {
    '@type': ['LocalBusiness', 'TouristAttraction', 'SportsActivityLocation', 'LodgingBusiness'],
    '@id': id('business'),
    name: BUSINESS.name,
    alternateName: ['Adventure Park Shivpuri', 'Adventure Park Rishikesh'],
    slogan: 'Where Rishikesh Gets Wild.',
    description: 'River rafting on the Ganga, luxury camping and an 8-room AC guest house on the Badrinath Highway, near Shiv Mandir in Shivpuri, about 16 km from Rishikesh, Uttarakhand.',
    url: `${SITE}/`,
    logo: { '@type': 'ImageObject', url: `${SITE}/images/icon-512.png`, width: 512, height: 512 },
    image: { '@id': id('ogimage') },
    telephone: '+91-8755542743',
    email: BUSINESS.email,
    priceRange: '₹500 – ₹3,000',
    currenciesAccepted: 'INR',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Badrinath Highway, near Shiv Mandir',
      addressLocality: 'Shivpuri',
      addressRegion: 'Uttarakhand',
      addressCountry: 'IN',
    },
    containedInPlace: { '@type': 'City', name: 'Rishikesh' },
    areaServed: [{ '@type': 'City', name: 'Rishikesh' }, { '@type': 'State', name: 'Uttarakhand' }],
    hasMap: 'https://maps.app.goo.gl/6zFx98TaJ3paao2v8',
    sameAs: ['https://www.instagram.com/adventure_park771/', 'https://maps.app.goo.gl/6zFx98TaJ3paao2v8'],
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '07:00',
      closes: '22:00',
    }],
    numberOfRooms: 8,
    amenityFeature: [
      { '@type': 'LocationFeatureSpecification', name: 'Air-conditioned rooms', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Luxury camping', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'White-water rafting', value: true },
    ],
    knowsAbout: ['White-water rafting', 'River Ganga', 'Rishikesh', 'Camping', 'Adventure sports'],
    contactPoint: [{
      '@type': 'ContactPoint',
      telephone: '+91-8755542743',
      contactType: 'reservations',
      availableLanguage: ['English', 'Hindi'],
      hoursAvailable: { '@type': 'OpeningHoursSpecification', opens: '07:00', closes: '22:00' },
    }],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Rafting, camping and rooms',
      itemListElement: [
        ...RAFTING.map((r) => ({ '@type': 'Offer', itemOffered: { '@id': id(r.key) } })),
        { '@type': 'Offer', itemOffered: { '@id': id('luxury-camping') } },
        { '@type': 'Offer', itemOffered: { '@id': id('guest-house-room') } },
      ],
    },
    potentialAction: {
      '@type': 'ReserveAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/#book`, actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] },
      result: { '@type': 'Reservation', name: 'Booking request' },
    },
  };

  const trips = RAFTING.map((r) => {
    const p = PRICE_LIST[r.key];
    return {
      '@type': 'TouristTrip',
      '@id': id(r.key),
      name: `${r.km} km River Rafting: ${r.from} to ${r.to}`,
      description: `${r.km} km white-water rafting on the Ganga from ${r.from} to ${r.to}, rapids ${r.grade}. ₹${p.rate} per person on weekdays, ₹${p.weekendRate} on Saturday and Sunday. Season September to June.`,
      touristType: r.audience,
      provider: { '@id': id('business') },
      itinerary: { '@type': 'ItemList', itemListElement: [
        { '@type': 'ListItem', position: 1, item: { '@type': 'Place', name: r.from } },
        { '@type': 'ListItem', position: 2, item: { '@type': 'Place', name: r.to } },
      ] },
      offers: {
        '@type': 'Offer',
        price: p.rate,
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
        url: `${SITE}/#book`,
        priceSpecification: [perPerson(p.rate, 'Monday to Friday'), perPerson(p.weekendRate, 'Saturday and Sunday')],
      },
    };
  });

  const camping = {
    '@type': 'Service',
    '@id': id('luxury-camping'),
    name: 'Luxury Camping',
    serviceType: 'Luxury camping',
    description: 'Luxury camping near the Ganga in Shivpuri, open all year. Quad or triple sharing ₹1,500 – ₹1,800 and double sharing ₹1,800 – ₹2,200 per person per night. Children aged 6 to 11 pay 50% of the adult price.',
    provider: { '@id': id('business') },
    areaServed: { '@type': 'City', name: 'Rishikesh' },
    offers: [
      { '@type': 'Offer', name: 'Quad or triple sharing', priceCurrency: 'INR', price: 1500, priceSpecification: rangePrice(1500, 1800, 'Quad or triple sharing', 'per person per night') },
      { '@type': 'Offer', name: 'Double sharing', priceCurrency: 'INR', price: 1800, priceSpecification: rangePrice(1800, 2200, 'Double sharing', 'per person per night') },
    ],
  };

  const gh = PRICE_LIST['guest-house'].seasonalRate;
  const room = {
    '@type': 'HotelRoom',
    '@id': id('guest-house-room'),
    name: 'Guest House AC Room',
    description: '8 air-conditioned guest house rooms in Shivpuri, open all year. ₹1,200 per night from July to September, ₹1,500 – ₹1,600 from October to January, and ₹2,200 – ₹2,500 from February to June.',
    containedInPlace: { '@id': id('business') },
    amenityFeature: [{ '@type': 'LocationFeatureSpecification', name: 'Air conditioning', value: true }],
    offers: [
      { '@type': 'Offer', name: 'July to September', priceCurrency: 'INR', price: gh[7], priceSpecification: rangePrice(gh[7], 1200, 'July to September', 'per room per night') },
      { '@type': 'Offer', name: 'October to January', priceCurrency: 'INR', price: gh[10], priceSpecification: rangePrice(gh[10], 1600, 'October to January', 'per room per night') },
      { '@type': 'Offer', name: 'February to June', priceCurrency: 'INR', price: gh[2], priceSpecification: rangePrice(gh[2], 2500, 'February to June', 'per room per night') },
    ],
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': id('website'),
        url: `${SITE}/`,
        name: 'Adventure Park Shivpuri',
        inLanguage: 'en-IN',
        publisher: { '@id': id('business') },
      },
      {
        '@type': 'WebPage',
        '@id': id('webpage'),
        url: `${SITE}/`,
        name: 'Adventure Park Shivpuri | River Rafting, Camping & Stay in Rishikesh',
        description: 'White-water rafting on the Ganga from ₹500 per person, luxury camping and AC guest house rooms in Shivpuri, Rishikesh.',
        inLanguage: 'en-IN',
        isPartOf: { '@id': id('website') },
        about: { '@id': id('business') },
        primaryImageOfPage: { '@id': id('ogimage') },
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['#about-summary', '#faq'] },
      },
      { '@type': 'ImageObject', '@id': id('ogimage'), url: `${SITE}/images/og-image.png`, width: 1200, height: 630, caption: 'Adventure Park, Shivpuri: river rafting on the Ganga' },
      business,
      ...trips,
      camping,
      room,
      {
        '@type': 'FAQPage',
        '@id': id('faq'),
        isPartOf: { '@id': id('webpage') },
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      },
    ],
  };
}

function schemaBlock(html) {
  const json = JSON.stringify(buildSchema(faqFromHtml(html)), null, 2)
    .replace(/</g, '\\u003c'); // never allow "</script>" inside the block
  return `<!-- schema:start (generated by "npm run schema", do not edit by hand) -->\n  <script type="application/ld+json">\n${json}\n  </script>\n  <!-- schema:end -->`;
}

module.exports = { buildSchema, faqFromHtml, schemaBlock, RAFTING };
