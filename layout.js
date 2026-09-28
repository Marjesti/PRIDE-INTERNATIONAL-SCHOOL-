// ============================================================
// Shared dashboard shell: sidebar + topbar.
// Every dashboard page includes this after config.js, then calls
// renderShell({ active: 'overview', pendingCount: 0 }).
// ============================================================

const NAV_ITEMS = [
  { key: 'overview',        label: 'Overview',        href: 'overview.html',        icon: '&#9635;' },
  { key: 'results-queue',   label: 'Results queue',   href: 'results-queue.html',   icon: '&#9745;' },
  { key: 'result-template', label: 'Result template', href: 'result-template.html', icon: '&#128196;' },
  { key: 'students',        label: 'Students',        href: 'students.html',        icon: '&#128101;' },
  { key: 'classes',         label: 'Classes',         href: 'classes.html',         icon: '&#127979;' },
  { key: 'subjects',        label: 'Subjects',        href: 'subjects.html',        icon: '&#128218;' },
  { key: 'academics',       label: 'Academics',       href: 'academics.html',       icon: '&#128214;' },
  { key: 'teachers',        label: 'Teachers',        href: 'teachers.html',        icon: '&#127891;' },
  { key: 'id-cards',        label: 'ID Cards',        href: 'id-cards.html',        icon: '&#128100;' },
  { key: 'analytics',       label: 'Analytics',       href: 'analytics.html',       icon: '&#128200;' },
  { key: 'notifications',   label: 'Notifications',   href: 'notifications.html',   icon: '&#128276;' },
  { key: 'logins',          label: 'Logins',          href: 'logins.html',          icon: '&#128273;' },
  { key: 'school-setup',    label: 'School setup',    href: 'school-setup.html',    icon: '&#9881;' },
  { key: 'activity-log',    label: 'Activity log',    href: 'activity-log.html',    icon: '&#128203;' },
];

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

// Redirects to login.html if there is no active session.
// Returns { session, profile } on success.
async function requireSession() {
  if (typeof DEV_MODE !== 'undefined' && DEV_MODE) {
    return {
      session: { user: { id: 'dev-user' } },
      profile: {
        name: 'Amina Bello',
        role: 'admin',
        school_id: 0,
        schools: { name: 'S.A. Kiddies Academy (dev mode)' },
      },
    };
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    throw new Error('No session');
  }

  const { data: profile, error } = await supabaseClient
    .from('profiles')
    .select('name, role, school_id, schools ( name, logo_url, phone )')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) {
    console.error('Could not load profile', error);
    document.body.innerHTML = `
      <div style="max-width:480px;margin:60px auto;padding:24px;font-family:sans-serif;">
        <h2>Could not load your profile</h2>
        <p>You're signed in, but no profile record was found for this account.</p>
        <p style="color:#A33A3A;">${error ? error.message : 'No profile row for this user.'}</p>
        <p><a href="login.html">Back to sign in</a></p>
      </div>
    `;
    throw new Error('No profile');
  }

  return { session, profile };
}

function renderShell({ active, profile, pendingCount = 0 }) {
  const navHtml = NAV_ITEMS.map((item) => {
    const isActive = item.key === active;
    const badge = item.key === 'results-queue' && pendingCount > 0
      ? `<span class="badge">${pendingCount}</span>` : '';
    return `
      <li>
        <a href="${item.href}" class="${isActive ? 'active' : ''}">
          <span>${item.label}</span>${badge}
        </a>
      </li>`;
  }).join('');

  const schoolName = profile.schools?.name || 'Your school';
  const schoolLogoUrl = profile.schools?.logo_url || 'assets/logo.png';
  const sidebarLogoHtml = `<img src="${schoolLogoUrl}" alt="${schoolName}" class="sidebar-logo-img">`;

  document.body.insertAdjacentHTML('afterbegin', `
    <div class="app-shell">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <aside class="sidebar">
        <div class="sidebar-header">
          ${sidebarLogoHtml}
          <div>
            <div class="school-name">${schoolName}</div>
            <div class="school-sub">Academy results</div>
          </div>
        </div>

        <div class="sidebar-section-label">Workspace</div>
        <ul class="nav-list">${navHtml}</ul>

        <div class="sidebar-footer">
          <button id="shell-signout-btn">Sign out</button>
        </div>
      </aside>

      <main class="main-content">
        <div class="topbar">
          <div class="topbar-left">
            <button id="sidebar-toggle" class="hamburger-btn" aria-label="Toggle menu">
              <span></span><span></span><span></span>
            </button>
            <h2 id="shell-page-heading"></h2>
          </div>
          <div class="avatar-badge">${initials(profile.name)}</div>
        </div>
        <div id="page-body" class="page-fade-in"></div>
      </main>
    </div>
  `);

  const activeItem = NAV_ITEMS.find((i) => i.key === active);
  document.getElementById('shell-page-heading').textContent = activeItem ? activeItem.label : '';

  document.getElementById('shell-signout-btn').addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  });

  // ---- Hamburger menu: sidebar is an off-canvas drawer, closed by default ----
  const sidebarEl = document.querySelector('.sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const backdropEl = document.getElementById('sidebar-backdrop');

  function closeSidebar() {
    sidebarEl.classList.remove('open');
    backdropEl.classList.remove('show');
    toggleBtn.classList.remove('active');
  }
  function openSidebar() {
    sidebarEl.classList.add('open');
    backdropEl.classList.add('show');
    toggleBtn.classList.add('active');
  }
  toggleBtn.addEventListener('click', () => {
    sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  backdropEl.addEventListener('click', closeSidebar);
  document.querySelectorAll('.nav-list a').forEach((a) => a.addEventListener('click', closeSidebar));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
}
