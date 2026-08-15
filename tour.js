/* Guided tour — vanilla JS spotlight walkthrough of the homepage.
   No dependencies. Esc closes, arrows navigate, works with keyboard only. */
(() => {
  const trigger = document.getElementById('tour-start');
  if (!trigger) return;

  const STEPS = [
    {
      sel: '.hero-text',
      title: 'Hi. This is a 90-second tour.',
      body: 'One person, an AI pair that never sleeps, and a pile of things that probably didn’t need to exist. The tour hits the good parts; the site rewards poking around after.',
    },
    {
      sel: '.project-card:has(.thumb-burpee)',
      title: 'Shipped this week.',
      body: 'A fullscreen rep counter for filming daily 100-burpee videos. It counts by voice, and it assumes the mic will mishear a gasping man — spoken numbers set the count, so mistakes heal themselves. It’s live. Open it after the tour and say a number at it.',
      activate: true,
    },
    {
      sel: '.project-card:has(.thumb-catplay)',
      title: 'No screenshots on this grid.',
      body: 'Every thumbnail is its own tiny hand-built animation. This one’s a ball that runs away from your cursor — try it. The 404 page is a playable game, too. Type any wrong URL later and see.',
      activate: true,
    },
    {
      sel: 'nav a[href="/ai.html"]',
      title: 'The show-and-tell.',
      body: 'How all of this actually gets built: the self-maintaining wiki running on a Mac Mini in a theatre, the tools that earned their seat, and the experiments that died so these could live. No resume energy, promise.',
      pad: 10,
    },
    {
      sel: '.cta',
      title: 'That’s the tour.',
      body: 'Everything here is real, running, and built to be poked. If any of it made you want to talk — that button emails me. That’s the whole funnel.',
    },
  ];

  let idx = -1;
  let hole = null;
  let card = null;
  let lastActive = null;

  function supportsHas() {
    try { document.querySelector(':has(*)'); return true; } catch { return false; }
  }
  // :has() fallback: resolve burpee/catplay cards by walking up from the thumb
  function resolve(sel) {
    const m = sel.match(/^\.project-card:has\((.+)\)$/);
    if (m && !supportsHas()) {
      const inner = document.querySelector(m[1]);
      return inner ? inner.closest('.project-card') : null;
    }
    return document.querySelector(sel);
  }

  function deactivate() {
    if (lastActive) {
      lastActive.classList.remove('card-active');
      lastActive.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      lastActive = null;
    }
  }

  function place() {
    const step = STEPS[idx];
    const el = resolve(step.sel);
    if (!el) { next(); return; }

    deactivate();
    if (step.activate) {
      el.classList.add('card-active');
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      lastActive = el;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait a beat for the scroll to settle before measuring
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      const pad = step.pad || 14;
      const top = r.top + window.scrollY - pad;
      const left = r.left + window.scrollX - pad;
      const w = r.width + pad * 2;
      const h = r.height + pad * 2;

      hole.style.top = top + 'px';
      hole.style.left = left + 'px';
      hole.style.width = w + 'px';
      hole.style.height = h + 'px';

      card.querySelector('h3').textContent = step.title;
      card.querySelector('p').textContent = step.body;
      card.querySelectorAll('.tour-dots span').forEach((d, i) => d.classList.toggle('on', i === idx));
      card.querySelector('.tour-back').style.visibility = idx === 0 ? 'hidden' : 'visible';
      card.querySelector('.tour-next').textContent = idx === STEPS.length - 1 ? 'Done →' : 'Next';

      // Position the card below the hole if there's room, otherwise above
      const ch = card.offsetHeight || 170;
      const below = r.bottom + pad + 16 + ch < window.innerHeight;
      const cardTop = below ? top + h + 16 : Math.max(window.scrollY + 16, top - ch - 16);
      const cardLeft = Math.max(
        window.scrollX + 20,
        Math.min(left + w / 2 - card.offsetWidth / 2, window.scrollX + document.documentElement.clientWidth - card.offsetWidth - 20)
      );
      card.style.top = cardTop + 'px';
      card.style.left = cardLeft + 'px';
    }, 380);
  }

  function next() { idx < STEPS.length - 1 ? (idx++, place()) : end(); }
  function back() { if (idx > 0) { idx--; place(); } }

  function onKey(e) {
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') back();
  }

  function start() {
    if (hole) return;
    idx = 0;
    hole = document.createElement('div');
    hole.className = 'tour-hole';
    card = document.createElement('div');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Site tour');
    card.innerHTML =
      '<button class="tour-close" aria-label="End tour">×</button>' +
      '<h3></h3><p></p>' +
      '<div class="tour-row">' +
      '<div class="tour-dots">' + STEPS.map(() => '<span></span>').join('') + '</div>' +
      '<div class="tour-btns"><button class="tour-back">Back</button><button class="tour-next">Next</button></div>' +
      '</div>';
    document.body.append(hole, card);
    card.querySelector('.tour-close').addEventListener('click', end);
    card.querySelector('.tour-back').addEventListener('click', back);
    card.querySelector('.tour-next').addEventListener('click', next);
    document.addEventListener('keydown', onKey);
    try { localStorage.setItem('ws_toured', '1'); } catch {}
    trigger.classList.remove('tour-fresh');
    place();
    card.querySelector('.tour-next').focus();
  }

  function end() {
    deactivate();
    if (hole) hole.remove();
    if (card) card.remove();
    hole = card = null;
    idx = -1;
    document.removeEventListener('keydown', onKey);
    trigger.focus();
  }

  trigger.hidden = false;
  try {
    if (!localStorage.getItem('ws_toured')) trigger.classList.add('tour-fresh');
  } catch {}
  trigger.addEventListener('click', start);
})();
