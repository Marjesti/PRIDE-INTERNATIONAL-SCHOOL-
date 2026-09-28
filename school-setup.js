let currentSchoolId = null;

async function loadSchoolSetupPage() {
  const { profile } = await requireSession();
  renderShell({ active: 'school-setup', profile });
  currentSchoolId = profile.school_id;

  const { data: school } = await supabaseClient
    .from('schools').select('name, address, phone, logo_url').eq('id', currentSchoolId).single();

  renderSchoolSetupBody(school || {});
}

function renderSchoolSetupBody(school) {
  document.getElementById('page-body').innerHTML = `
    <p class="page-date">School profile</p>
    <h1 class="page-title">School setup</h1>
    <p class="page-subtitle">This information appears on printed report cards.</p>

    <div class="panel">
      <div class="form-grid">
        <div class="field">
          <label for="school-name">School name</label>
          <input type="text" id="school-name" value="${school.name || ''}">
        </div>
        <div class="field">
          <label for="school-phone">Phone</label>
          <input type="text" id="school-phone" value="${school.phone || ''}" placeholder="e.g. 0706 749 3313">
        </div>
      </div>
      <div class="field">
        <label for="school-address">Address</label>
        <input type="text" id="school-address" value="${school.address || ''}" placeholder="e.g. Darmanawa, Rayhaan Street, Behind AKTH, Kano State">
      </div>
      <div class="field">
        <label for="school-logo">Logo URL (optional)</label>
        <input type="text" id="school-logo" value="${school.logo_url || ''}" placeholder="https://...">
      </div>
      <button class="btn-gold" onclick="saveSchoolSetup()">Save</button>
      <div id="form-error" class="error-banner"></div>
      <div id="form-success" class="error-banner" style="background:#E8F3EA; color:#3A7D44;"></div>
    </div>
  `;
}

async function saveSchoolSetup() {
  const name = document.getElementById('school-name').value.trim();
  const address = document.getElementById('school-address').value.trim();
  const phone = document.getElementById('school-phone').value.trim();
  const logoUrl = document.getElementById('school-logo').value.trim();

  const { error } = await supabaseClient.from('schools').update({
    name, address: address || null, phone: phone || null, logo_url: logoUrl || null,
  }).eq('id', currentSchoolId);

  const errEl = document.getElementById('form-error');
  const okEl = document.getElementById('form-success');
  errEl.classList.remove('visible'); okEl.classList.remove('visible');

  if (error) { errEl.textContent = error.message; errEl.classList.add('visible'); return; }
  okEl.textContent = 'Saved.'; okEl.classList.add('visible');
  showToast('Saved');
}

loadSchoolSetupPage();
