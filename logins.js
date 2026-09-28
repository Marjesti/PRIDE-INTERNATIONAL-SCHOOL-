let currentSchoolId = null;
let currentTeachersList = [];
let allStudentsForParent = [];
let selectedChildren = []; // [{id, name, className}]

// A separate, non-persisting Supabase client used ONLY to create new
// login accounts. Using signUp() on the normal supabaseClient would
// log the admin out and log in as the new account instead -- this
// temporary client keeps that from ever touching the admin's session.
const tempAuthClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storageKey: 'rms-temp-account-creation',
  },
});

async function loadLoginsPage() {
  const { profile } = await requireSession();
  renderShell({ active: 'logins', profile });
  currentSchoolId = profile.school_id;

  const { data: teachers } = await supabaseClient
    .from('teachers').select('id, name, profile_id').eq('school_id', currentSchoolId).order('name');
  currentTeachersList = teachers || [];

  const { data: students } = await supabaseClient
    .from('students').select('id, name, classes ( name )').eq('school_id', currentSchoolId).order('name');
  allStudentsForParent = students || [];

  renderLoginsBody();
}

function renderLoginsBody() {
  const unlinkedTeachers = currentTeachersList.filter((t) => !t.profile_id);
  const teacherOptions = unlinkedTeachers.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');

  document.getElementById('page-body').innerHTML = `
    <p class="page-date">Access management</p>
    <h1 class="page-title">Logins</h1>
    <p class="page-subtitle">Give teachers, other admins, and parents login access.</p>

    <div class="panel">
      <p class="eyebrow">Staff</p>
      <h3 class="panel-title">Give a teacher login access</h3>
      <p class="text-muted" style="font-size:13.5px;">A teacher only sees the subjects and classes assigned to them on the Teachers page — set those up first if you haven't already.</p>
      ${unlinkedTeachers.length ? `
        <div class="form-grid">
          <div class="field">
            <label for="teacher-account-select">Teacher</label>
            <select id="teacher-account-select">${teacherOptions}</select>
          </div>
          <div class="field">
            <label for="teacher-account-email">Login email</label>
            <input type="email" id="teacher-account-email" placeholder="teacher@school.edu.ng">
          </div>
          <div class="field">
            <label for="teacher-account-password">Temporary password</label>
            <input type="text" id="teacher-account-password" placeholder="At least 8 characters">
          </div>
        </div>
        <button class="btn-gold" onclick="createTeacherAccount()">Create teacher login</button>
      ` : `<p class="text-muted" style="font-size:14px;">Every teacher already has a login, or none exist yet — add teachers on the Teachers page first.</p>`}
      <div id="teacher-account-error" class="error-banner"></div>
      <div id="teacher-account-success" class="error-banner" style="background:#E8F3EA; color:#3A7D44;"></div>
    </div>

    <div class="panel">
      <p class="eyebrow">Admins</p>
      <h3 class="panel-title">Give another admin login access</h3>
      <p class="text-muted" style="font-size:13.5px;">An admin has full access to everything — only add people you fully trust with the whole school's data.</p>
      <div class="form-grid">
        <div class="field">
          <label for="admin-account-name">Full name</label>
          <input type="text" id="admin-account-name" placeholder="e.g. Mrs. Adaeze Nwosu">
        </div>
        <div class="field">
          <label for="admin-account-email">Login email</label>
          <input type="email" id="admin-account-email" placeholder="admin@school.edu.ng">
        </div>
        <div class="field">
          <label for="admin-account-password">Temporary password</label>
          <input type="text" id="admin-account-password" placeholder="At least 8 characters">
        </div>
      </div>
      <button class="btn-gold" onclick="createAdminAccount()">Create admin login</button>
      <div id="admin-account-error" class="error-banner"></div>
      <div id="admin-account-success" class="error-banner" style="background:#E8F3EA; color:#3A7D44;"></div>
    </div>

    <div class="panel">
      <p class="eyebrow">Parents</p>
      <h3 class="panel-title">Give a parent login access</h3>
      <p class="text-muted" style="font-size:13.5px;">Parents log in with a username and a 6-digit PIN instead of an email — simpler on a phone. They'll see their child's full result, including attendance, behaviour and remarks, and can download it as a PDF.</p>

      <div class="field" style="margin-top:10px;">
        <label for="parent-child-search">Search for a child to link</label>
        <input type="text" id="parent-child-search" placeholder="Type a student's name..." oninput="filterParentChildSearch()">
      </div>
      <div id="parent-child-results" style="max-height:180px; overflow-y:auto; margin-top:6px;"></div>
      <div id="parent-selected-children" style="margin-top:10px;"></div>

      <div class="form-grid" style="margin-top:14px;">
        <div class="field">
          <label for="parent-account-name">Parent's full name</label>
          <input type="text" id="parent-account-name" placeholder="e.g. Mr. Chinedu Okafor">
        </div>
        <div class="field">
          <label for="parent-account-username">Username</label>
          <input type="text" id="parent-account-username" placeholder="e.g. chinedu.okafor">
        </div>
        <div class="field">
          <label for="parent-account-pin">6-digit PIN</label>
          <input type="text" id="parent-account-pin" placeholder="123456" maxlength="6" inputmode="numeric">
        </div>
      </div>
      <button class="btn-gold" onclick="createParentAccount()">Create parent login</button>
      <div id="parent-account-error" class="error-banner"></div>
      <div id="parent-account-success" class="error-banner" style="background:#E8F3EA; color:#3A7D44;"></div>
    </div>
  `;
}

function showError(elId, message) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.classList.add('visible');
}
function showSuccess(elId, message) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.classList.add('visible');
}

async function createTeacherAccount() {
  const teacherId = document.getElementById('teacher-account-select').value;
  const email = document.getElementById('teacher-account-email').value.trim();
  const password = document.getElementById('teacher-account-password').value;

  if (!teacherId || !email || !password) { showError('teacher-account-error', 'All fields are required.'); return; }
  if (password.length < 8) { showError('teacher-account-error', 'Password must be at least 8 characters.'); return; }

  const teacher = currentTeachersList.find((t) => String(t.id) === String(teacherId));

  const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({ email, password });
  if (signUpError) { showError('teacher-account-error', signUpError.message); return; }
  if (!signUpData.user) { showError('teacher-account-error', 'Could not create the login. Check that email confirmation is off in Supabase.'); return; }

  const { error: profileError } = await supabaseClient.from('profiles').insert({
    id: signUpData.user.id, school_id: currentSchoolId, name: teacher.name, role: 'teacher',
  });
  if (profileError) { showError('teacher-account-error', profileError.message); return; }

  const { error: linkError } = await supabaseClient.from('teachers').update({ profile_id: signUpData.user.id }).eq('id', teacherId);
  if (linkError) { showError('teacher-account-error', linkError.message); return; }

  showSuccess('teacher-account-success', `Login created for ${teacher.name}. Share the email and password with them directly.`);
  showToast('Saved');
  await loadLoginsPage();
}

async function createAdminAccount() {
  const name = document.getElementById('admin-account-name').value.trim();
  const email = document.getElementById('admin-account-email').value.trim();
  const password = document.getElementById('admin-account-password').value;

  if (!name || !email || !password) { showError('admin-account-error', 'All fields are required.'); return; }
  if (password.length < 8) { showError('admin-account-error', 'Password must be at least 8 characters.'); return; }

  const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({ email, password });
  if (signUpError) { showError('admin-account-error', signUpError.message); return; }
  if (!signUpData.user) { showError('admin-account-error', 'Could not create the login. Check that email confirmation is off in Supabase.'); return; }

  const { error: profileError } = await supabaseClient.from('profiles').insert({
    id: signUpData.user.id, school_id: currentSchoolId, name, role: 'admin',
  });
  if (profileError) { showError('admin-account-error', profileError.message); return; }

  showSuccess('admin-account-success', `Admin login created for ${name}. Share the email and password with them directly.`);
  showToast('Saved');
  document.getElementById('admin-account-name').value = '';
  document.getElementById('admin-account-email').value = '';
  document.getElementById('admin-account-password').value = '';
}
function filterParentChildSearch() {
  const term = document.getElementById('parent-child-search').value.trim().toLowerCase();
  const resultsEl = document.getElementById('parent-child-results');
  if (!term) { resultsEl.innerHTML = ''; return; }

  const selectedIds = new Set(selectedChildren.map((c) => c.id));
  const matches = allStudentsForParent
    .filter((s) => s.name.toLowerCase().includes(term) && !selectedIds.has(s.id))
    .slice(0, 8);

  resultsEl.innerHTML = matches.length ? matches.map((s) => `
    <div class="queue-row" style="cursor:pointer;" onclick="addChildToSelection(${s.id}, '${s.name.replace(/'/g, "\\'")}', '${(s.classes?.name || '').replace(/'/g, "\\'")}')">
      <span>${s.name}</span>
      <span class="text-muted">${s.classes?.name || 'Unassigned'}</span>
    </div>
  `).join('') : `<p class="text-muted" style="font-size:13.5px; padding:8px 0;">No matches.</p>`;
}

function addChildToSelection(id, name, className) {
  if (!selectedChildren.some((c) => c.id === id)) selectedChildren.push({ id, name, className });
  document.getElementById('parent-child-search').value = '';
  document.getElementById('parent-child-results').innerHTML = '';
  renderSelectedChildren();
}

function removeChildFromSelection(id) {
  selectedChildren = selectedChildren.filter((c) => c.id !== id);
  renderSelectedChildren();
}

function renderSelectedChildren() {
  const el = document.getElementById('parent-selected-children');
  if (!selectedChildren.length) { el.innerHTML = `<p class="text-muted" style="font-size:13px;">No children linked yet.</p>`; return; }
  el.innerHTML = selectedChildren.map((c) => `
    <span style="display:inline-flex; align-items:center; gap:6px; background:var(--gold-soft); color:var(--navy); padding:5px 10px; border-radius:20px; font-size:13px; font-weight:600; margin:0 6px 6px 0;">
      ${c.name}${c.className ? ` &middot; ${c.className}` : ''}
      <button onclick="removeChildFromSelection(${c.id})" style="border:none; background:none; cursor:pointer; color:var(--navy); font-weight:800;">&times;</button>
    </span>
  `).join('');
}

async function createParentAccount() {
  const name = document.getElementById('parent-account-name').value.trim();
  const usernameRaw = document.getElementById('parent-account-username').value.trim();
  const pin = document.getElementById('parent-account-pin').value.trim();

  if (!name || !usernameRaw || !pin || !selectedChildren.length) {
    showError('parent-account-error', 'Full name, username, PIN, and at least one linked child are all required.');
    return;
  }
  if (!/^\d{6}$/.test(pin)) {
    showError('parent-account-error', 'PIN must be exactly 6 digits.');
    return;
  }

  const username = usernameRaw.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  if (!username) { showError('parent-account-error', 'Username must contain at least one letter or number.'); return; }
  const syntheticEmail = `${username}@parent.local`;

  const { data: signUpData, error: signUpError } = await tempAuthClient.auth.signUp({ email: syntheticEmail, password: pin });
  if (signUpError) { showError('parent-account-error', signUpError.message); return; }
  if (!signUpData.user) { showError('parent-account-error', 'Could not create the login. Check that email confirmation is off in Supabase.'); return; }

  const { error: profileError } = await supabaseClient.from('profiles').insert({
    id: signUpData.user.id, school_id: currentSchoolId, name, role: 'guardian', username,
  });
  if (profileError) { showError('parent-account-error', profileError.message); return; }

  const links = selectedChildren.map((c) => ({ profile_id: signUpData.user.id, student_id: c.id }));
  const { error: linkError } = await supabaseClient.from('guardian_students').insert(links);
  if (linkError) { showError('parent-account-error', linkError.message); return; }

  showSuccess('parent-account-success', `Parent login created for ${name}. Share these with them — Username: ${username} · PIN: ${pin}`);
  showToast('Saved');
  document.getElementById('parent-account-name').value = '';
  document.getElementById('parent-account-username').value = '';
  document.getElementById('parent-account-pin').value = '';
  selectedChildren = [];
  renderSelectedChildren();
}

// ---- Page bootstrap ----
loadLoginsPage();
