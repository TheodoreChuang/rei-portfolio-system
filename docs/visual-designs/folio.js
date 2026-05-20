// =====================================================================
// Folio — page behaviour
// ---------------------------------------------------------------------
// This is the small JS layer for the static design mockups. Each
// screen lives in its own HTML file (dashboard.html, upload.html, …)
// and shares this script.
//
// Cross-page navigation:
//   Any element with [data-goto="X"] navigates to X.html on click.
//   The sidebar uses this; so do table rows, breadcrumb-backs, and
//   prompt CTAs. In the Next.js port these become <Link href="/X">.
//
// In-page behaviour:
//   - Tabs (Property detail / Loan detail)
//   - Upload idle ↔ review state toggle
//   - Collapsible sidebar nav sections + collapsible household groups
//   - Plan: jump-to-calculator from the lede
// =====================================================================

(function () {

  // --- Cross-page navigation ----------------------------------------
  // sidebar.js injects the sidebar after DOMContentLoaded, so we
  // delegate from the document instead of binding per-element.
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-goto]');
    if (!el) return;
    // Ignore [data-goto] inside the upload state toggle etc.
    e.preventDefault();
    const target = el.dataset.goto;
    if (!target) return;
    window.location.href = target + '.html';
  });

  // --- Collapsible nav sections (sidebar) ---------------------------
  // Delegate, because sidebar is injected after this script runs in
  // older browsers — and it's just cleaner.
  document.addEventListener('click', e => {
    const toggle = e.target.closest('[data-collapse]');
    if (!toggle) return;
    e.stopPropagation();
    const section = toggle.closest('.nav-section') || toggle;
    section.classList.toggle('collapsed');
  });

  // --- Collapsible household sections -------------------------------
  document.querySelectorAll('.collapsible-section .head').forEach(h => {
    h.addEventListener('click', () => h.parentElement.classList.toggle('is-open'));
  });

  // --- Tab switching (Property Detail, Loan Detail) -----------------
  document.querySelectorAll('[data-tabs]').forEach(group => {
    const tabs = group.querySelectorAll('.tab');
    tabs.forEach(t => {
      t.addEventListener('click', () => {
        const screen = group.closest('.screen');
        tabs.forEach(x => x.classList.toggle('is-active', x === t));
        screen.querySelectorAll('.tab-panel').forEach(p => {
          p.classList.toggle('is-active', p.dataset.tab === t.dataset.tab);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  });

  // Links that jump to a specific tab within the current screen
  document.querySelectorAll('[data-tab-goto]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = a.dataset.tabGoto;
      const screen = a.closest('.screen');
      if (!screen) return;
      const tab = screen.querySelector(`.tab[data-tab="${target}"]`);
      if (tab) tab.click();
    });
  });

  // --- Upload state toggle (idle ↔ review) --------------------------
  // Lives only on upload.html. Two buttons in the page-head controls
  // strip, plus inline [data-state-goto] anchors inside the page.
  function setUploadState(state) {
    const screen = document.querySelector('[data-screen="upload"]');
    if (!screen) return;
    screen.querySelectorAll('.upload-state').forEach(s =>
      s.classList.toggle('is-active', s.dataset.state === state)
    );
    screen.querySelectorAll('.upload-state-toggle button').forEach(b =>
      b.classList.toggle('is-on', b.dataset.state === state)
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('.upload-state-toggle button').forEach(b => {
    b.addEventListener('click', () => setUploadState(b.dataset.state));
  });
  document.querySelectorAll('[data-state-goto]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      setUploadState(a.dataset.stateGoto);
    });
  });

  // --- Property table row → property detail -------------------------
  document.querySelectorAll('.table.properties tbody tr').forEach(tr => {
    tr.addEventListener('click', () => { window.location.href = 'property.html'; });
  });

  // --- Loan row expand toggle ---------------------------------------
  document.querySelectorAll('.loan-row:not(.header)').forEach(r => {
    r.addEventListener('click', () => {
      const next = r.nextElementSibling;
      if (next && next.classList.contains('loan-expand')) {
        r.classList.toggle('expanded');
        next.style.display = r.classList.contains('expanded') ? '' : 'none';
      }
    });
  });

  // --- Plan: scroll to a calculator from the lede CTA ---------------
  document.querySelectorAll('[data-jump]').forEach(b => {
    b.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(b.dataset.jump);
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 24;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();
