// =====================================================================
// Folio — Shared Sidebar
// ---------------------------------------------------------------------
// Injected on every screen page (dashboard.html, properties.html, …).
// Single source of truth for the sidebar markup so iterating on one
// screen never touches another.
//
// Next.js port:  this becomes a layout component (e.g. <AppSidebar />
//                rendered by app/(app)/layout.tsx) with the active item
//                resolved from the route segment rather than body[data-page].
// =====================================================================

(function () {
  const SIDEBAR_HTML = `
  <aside class="sidebar" data-screen-label="Sidebar">
    <div class="brand">Folio<em>· beta</em></div>

    <button class="nav-item" data-goto="dashboard">
      <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>
      Portfolio pulse
    </button>
    <button class="nav-item" data-goto="upload">
      <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 11v2h10v-2"/><path d="M8 3v8M5 6l3-3 3 3"/></svg>
      Upload <span class="count urgent">2</span>
    </button>
    <button class="nav-item" data-goto="household">
      <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="6" r="2.5"/><path d="M2.5 14a5.5 5.5 0 0 1 11 0"/></svg>
      Household
    </button>

    <div class="nav-section">
      <button class="nav-item nav-section-link" data-goto="properties">
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 13V7l6-4 6 4v6"/><path d="M6 13V9h4v4"/></svg>
        Properties
      </button>
      <button class="nav-section-toggle" data-collapse="properties" aria-label="Toggle Properties section" title="Collapse">
        <span class="twist"></span>
      </button>
    </div>
    <div class="nav-children" data-key="properties">
      <button class="nav-item" data-goto="property">14 Elm St</button>
      <button class="nav-item">8 Daley St</button>
      <button class="nav-item">Sutherland Ct</button>
      <button class="nav-item is-add" data-goto="add-property">+ Add property</button>
    </div>

    <div class="nav-section">
      <button class="nav-item nav-section-link" data-goto="loans">
        <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 4h12v8H2z"/><path d="M2 8h12"/><circle cx="5" cy="10.5" r="0.8" fill="currentColor"/></svg>
        Loans
      </button>
      <button class="nav-section-toggle" data-collapse="loans" aria-label="Toggle Loans section" title="Collapse">
        <span class="twist"></span>
      </button>
    </div>
    <div class="nav-children" data-key="loans">
      <button class="nav-item" data-goto="loan">CBA · Elm St</button>
      <button class="nav-item" data-goto="loan">CBA · Daley St</button>
      <button class="nav-item" data-goto="loan">Westpac · LOC</button>
      <button class="nav-item is-add" data-goto="add-loan">+ Add loan</button>
    </div>

    <button class="nav-item" data-goto="plan" style="margin-top: var(--space-3);">
      <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 13l3-4 3 2 4-6 2 3"/></svg>
      Plan
    </button>
    <button class="nav-item" data-goto="settings">
      <svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3"/></svg>
      Settings
    </button>

    <div class="sidebar-foot">
      <div class="avatar">TO</div>
      <div class="who">
        <div class="name">Theo Okafor</div>
        <div class="role">Okafor Family Trust</div>
      </div>
    </div>
  </aside>
`;

  // Each page declares which sidebar item is "current" via
  // <body data-page="dashboard">. sidebar.js mirrors that onto the
  // matching .nav-item with class .is-active.
  function mountSidebar() {
    const app = document.querySelector('.app');
    if (!app) return;
    // Insert sidebar as the first child of .app
    const tpl = document.createElement('template');
    tpl.innerHTML = SIDEBAR_HTML.trim();
    app.insertBefore(tpl.content, app.firstChild);

    const page = document.body.dataset.page;
    if (!page) return;
    document.querySelectorAll('.sidebar .nav-item[data-goto]').forEach(n => {
      n.classList.toggle('is-active', n.dataset.goto === page);
    });

    // If the active nav lives inside a collapsed section, expand it
    // so the user can see where they are.
    const activeChild = document.querySelector(
      '.sidebar .nav-children .nav-item.is-active'
    );
    if (activeChild) {
      const children = activeChild.closest('.nav-children');
      if (children) {
        const key = children.dataset.key;
        const section = document.querySelector(
          `.sidebar .nav-section [data-collapse="${key}"]`
        );
        if (section) section.closest('.nav-section').classList.remove('collapsed');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSidebar);
  } else {
    mountSidebar();
  }
})();
