// ── ZIGZAG STITCH — right edge (homepage only) ──
const canvas = document.getElementById('needle-canvas');
const isProductPage = document.querySelector('.product-page') !== null;
const isCollectionPage = document.querySelector('.collection-page') !== null;
const isCustomOrderPage = document.getElementById('tbco') !== null;
if (canvas && !isProductPage && !isCollectionPage && !isCustomOrderPage) {
  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const STITCH_H = 6;
  const STITCH_W = 10;
  const LINE_W   = 1.2;
  const COLOR    = '155,89,212';

  let scrollY = 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  let pulseT = 0;

  function render(ts) {
    ctx.clearRect(0, 0, W, H);
    pulseT = ts * 0.003;

    const docH = document.documentElement.scrollHeight;
    const vpH  = window.innerHeight;
    const X_CENTER = W - 14;

    const maxScroll    = Math.max(1, docH - vpH);
    const progress     = Math.min(1, scrollY / maxScroll);
    const stitchedDocY = progress * docH;

    const totalSewn = Math.floor(stitchedDocY / STITCH_H);
    const firstIdx  = Math.max(0, Math.floor((scrollY - 40) / STITCH_H) - 1);

    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    for (let i = firstIdx; i <= totalSewn; i++) {
      const docY0 = i * STITCH_H;
      const sY0   = docY0 - scrollY;
      const sY1   = sY0 + STITCH_H;

      if (sY1 < -20 || sY0 > vpH + 20) continue;

      const xStart = (i % 2 === 0) ? X_CENTER - STITCH_W : X_CENTER;
      const xEnd   = (i % 2 === 0) ? X_CENTER            : X_CENTER - STITCH_W;

      if (i === totalSewn) {
        const frac  = (stitchedDocY - docY0) / STITCH_H;
        const drawX = xStart + (xEnd - xStart) * frac;
        const drawY = sY0 + frac * STITCH_H;
        ctx.beginPath();
        ctx.moveTo(xStart, sY0);
        ctx.lineTo(drawX, drawY);
        ctx.strokeStyle = `rgba(${COLOR},0.7)`;
        ctx.lineWidth   = LINE_W;
        ctx.stroke();
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(xStart, sY0);
      ctx.lineTo(xEnd,   sY1);
      ctx.strokeStyle = `rgba(${COLOR},0.7)`;
      ctx.lineWidth   = LINE_W;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(xStart, sY0, 1.0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COLOR},0.4)`;
      ctx.fill();
    }

    if (progress < 0.999) {
      const needleDocY = totalSewn * STITCH_H;
      const needleSY   = needleDocY - scrollY;
      const needleX    = (totalSewn % 2 === 0) ? X_CENTER - STITCH_W : X_CENTER;

      if (needleSY > -20 && needleSY < vpH + 20) {
        const pulse = 0.4 + 0.6 * Math.sin(pulseT * 3.2);
        const glow  = ctx.createRadialGradient(needleX, needleSY, 0, needleX, needleSY, 8);
        glow.addColorStop(0, `rgba(${COLOR},${0.45 * pulse})`);
        glow.addColorStop(1, `rgba(${COLOR},0)`);
        ctx.beginPath();
        ctx.arc(needleX, needleSY, 8, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(needleX, needleSY, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,170,255,${0.9 * pulse})`;
        ctx.fill();
      }
    }

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

// ── NAV ──
const nav = document.getElementById('main-nav');
if (nav) {
  // Always dark on product + collection pages
  if (document.querySelector('.product-page') || document.querySelector('.collection-page')) {
    nav.classList.add('scrolled');
  }
  window.addEventListener('scroll', () => {
    if (!document.querySelector('.product-page') && !document.querySelector('.collection-page')) {
      nav.classList.toggle('scrolled', window.scrollY > 60);
    }
  });
}

// ── PARALLAX on hero photo ──
const heroImg = document.getElementById('hero-img');
if (heroImg) {
  window.addEventListener('scroll', () => {
    heroImg.style.transform = `translateY(${window.scrollY * 0.12}px)`;
  });
}

// ── SCROLL REVEAL ──
const revs = document.querySelectorAll('.reveal,.step');
const ro = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) setTimeout(() => e.target.classList.add('visible'), Number(e.target.dataset.delay || 0));
  });
}, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
revs.forEach(el => ro.observe(el));

// ── STEP CIRCLE HIGHLIGHT ON SCROLL ──
const stepEls = document.querySelectorAll('.step');
const stepRo = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('active');
    } else {
      e.target.classList.remove('active');
    }
  });
}, {
  threshold: 0.5,
  rootMargin: '0px 0px -15% 0px'
});
stepEls.forEach(el => stepRo.observe(el));


// ── PRODUCT PAGE ──
(function() {
  // Thumbnail switching
  const mainImg = document.getElementById('product-main-img');
  const thumbs = document.querySelectorAll('.product-thumb');
  if (mainImg && thumbs.length) {
    thumbs.forEach(thumb => {
      thumb.addEventListener('click', () => {
        mainImg.style.opacity = '0';
        setTimeout(() => {
          mainImg.src = thumb.dataset.src;
          mainImg.style.opacity = '1';
        }, 200);
        thumbs.forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
      });
    });
  }

  // Variant swatch selection
  const swatches = document.querySelectorAll('.swatch');
  const variantInput = document.getElementById('variant-id');
  const atcBtn = document.getElementById('atc-btn');

  if (swatches.length && variantInput) {
    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const optionIndex = swatch.dataset.optionIndex;
        const value = swatch.dataset.value;
        const variantId = swatch.dataset.variantId;

        // Update active state within this option group
        document.querySelectorAll(`.swatch[data-option-index="${optionIndex}"]`).forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');

        // Update label
        const label = document.getElementById(`option-${optionIndex}-label`);
        if (label) label.textContent = value;

        // Update variant ID and button
        if (variantId) {
          variantInput.value = variantId;
          if (atcBtn) {
            atcBtn.textContent = swatch.disabled ? 'Sold Out' : 'Add to Cart';
          }
          // Swap main image to this variant's image if available
          const variantImg = swatch.dataset.variantImage;
          if (mainImg && variantImg) {
            mainImg.style.opacity = '0';
            setTimeout(() => {
              mainImg.src = variantImg;
              mainImg.style.opacity = '1';
            }, 200);
            // Also update active thumbnail
            document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.product-thumb').forEach(t => {
              if (t.dataset.src === variantImg) t.classList.add('active');
            });
          }
        }
      });
    });
  }

  // Quantity buttons
  const qtyInput = document.getElementById('qty-input');
  const qtyMinus = document.getElementById('qty-minus');
  const qtyPlus = document.getElementById('qty-plus');

  if (qtyInput && qtyMinus && qtyPlus) {
    qtyMinus.addEventListener('click', () => {
      const val = parseInt(qtyInput.value);
      if (val > 1) qtyInput.value = val - 1;
    });
    qtyPlus.addEventListener('click', () => {
      qtyInput.value = parseInt(qtyInput.value) + 1;
    });
  }
})();


// ── HAMBURGER MENU ──
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

function closeMobileMenu() {
  hamburger.classList.remove('open');
  mobileMenu.classList.remove('open');
  document.body.style.overflow = '';
}

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });
  // Close on escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMobileMenu();
  });
}


// ── QUOTE PAGE ──
(function() {
  // File upload label update
  const fileInput = document.getElementById('q-file');
  const fileLabelText = document.getElementById('file-label-text');
  if (fileInput && fileLabelText) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file) {
        fileLabelText.textContent = file.name;
      }
    });
  }
})();





// ── GLOBAL SPARKLES ──
(function() {
  const container = document.getElementById('about-sparkles');
  if (!container) return;

  const count = 55;

  const sparkleData = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    const isLarge = Math.random() > 0.65;
    el.className = 'sparkle' + (isLarge ? ' lg' : '');

    const x = Math.random() * 100;
    // pageY = where on the PAGE (not viewport) this star lives
    const pageY = Math.random() * Math.max(document.body.scrollHeight, 2000);
    const dur = 2.5 + Math.random() * 5;
    const delay = Math.random() * 10;
    const size = isLarge ? (6 + Math.random() * 6) : (3 + Math.random() * 4);

    el.style.cssText = `
      left: ${x}%;
      --dur: ${dur}s;
      --delay: ${delay}s;
      --size: ${size}px;
      animation-delay: ${delay}s;
    `;
    container.appendChild(el);
    sparkleData.push({ el, x, pageY });
  }

  // On scroll, position each sparkle relative to its page position
  function positionSparkles() {
    const scrollY = window.scrollY;
    const vpH = window.innerHeight;
    sparkleData.forEach(({ el, pageY }) => {
      // Convert page position to viewport position
      const viewportY = pageY - scrollY;
      const pct = (viewportY / vpH) * 100;
      el.style.top = pct + '%';
    });
  }

  positionSparkles();
  window.addEventListener('scroll', positionSparkles, { passive: true });
  window.addEventListener('resize', positionSparkles, { passive: true });
})();


// ── FAQ ACCORDION ──
(function() {
  const items = document.querySelectorAll('.faq-item');
  if (!items.length) return;

  items.forEach(item => {
    const btn = item.querySelector('.faq-q');
    const panel = item.querySelector('.faq-a');
    if (!btn || !panel) return;

    btn.addEventListener('click', () => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      // Close all others
      items.forEach(other => {
        const otherBtn = other.querySelector('.faq-q');
        const otherPanel = other.querySelector('.faq-a');
        if (otherBtn && otherPanel) {
          otherBtn.setAttribute('aria-expanded', 'false');
          otherPanel.classList.remove('open');
        }
      });

      // Toggle this one
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        panel.classList.add('open');
      }
    });
  });
})();


// ── CART PAGE QTY ──
(function() {
  document.querySelectorAll('.cart-qty-minus, .cart-qty-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const line = btn.dataset.line;
      const input = document.querySelector(`.cart-qty-input[data-line="${line}"]`);
      if (!input) return;
      let val = parseInt(input.value);
      if (btn.classList.contains('cart-qty-minus')) val = Math.max(0, val - 1);
      else val = val + 1;
      input.value = val;
      // Auto-submit after short delay
      clearTimeout(input._timer);
      input._timer = setTimeout(() => {
        document.getElementById('cart-form').submit();
      }, 600);
    });
  });
})();

// ── REVIEW STRIP (3 cards) ──
(function() {
  const reviews = [
    { text: "Seller was quick with response. Hat is amazing, great quality, really cool!", author: "Diane", source: "Etsy" },
    { text: "Nice quality and craftsmanship of the hat I ordered.", author: "Beth", source: "eBay" },
    { text: "Allowed me to change my order to a different hat before shipping with no issues!", author: "Max", source: "Etsy" },
    { text: "It came in as pictured. An absolute fun gift to give him.", author: "Marsha", source: "eBay" },
    { text: "Hat is great! Love the design and love to support local businesses. Go Canes!", author: "Matt", source: "Etsy" },
    { text: "This hat is awesome and my son loves it! Shipped quickly, perfect gift for a Hurricanes fan!", author: "Brad", source: "eBay" },
    { text: "Great looking ball cap, the logo is sweet. Probably gonna end up with a few of these in my wardrobe.", author: "Matt", source: "Etsy" },
  ];

  document.querySelectorAll('.review-strip').forEach(strip => {
    const cards = strip.querySelectorAll('.review-card');
    if (!cards.length) return;

    // Shuffle and pick starting reviews
    const shuffled = [...reviews].sort(() => Math.random() - 0.5);

    function fillCard(card, r) {
      const t = card.querySelector('.rc-text');
      const a = card.querySelector('.rc-author');
      const s = card.querySelector('.rc-source');
      if (t) t.textContent = '“' + r.text + '”';
      if (a) a.textContent = r.author;
      if (s) s.textContent = r.source;
      card.classList.add('rc-visible');
    }

    // Fill each card with a different review immediately
    cards.forEach((card, i) => {
      fillCard(card, shuffled[i % reviews.length]);
    });

    // Rotate each card on staggered intervals
    cards.forEach((card, i) => {
      let idx = (i + cards.length) % reviews.length;
      setInterval(() => {
        card.classList.remove('rc-visible');
        setTimeout(() => {
          fillCard(card, reviews[idx % reviews.length]);
          idx++;
        }, 450);
      }, 7000 + i * 2500);
    });
  });
})();
