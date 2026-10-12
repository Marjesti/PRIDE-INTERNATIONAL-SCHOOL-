let currentSchoolId = null;

async function loadSchoolSetupPage() {
  const { profile } = await requireSession();
  renderShell({ active: 'school-setup', profile });
  currentSchoolId = profile.school_id;

  const { data: school } = await supabaseClient
    .from('schools').select('name, address, phone, logo_url, stamp_url, form_masters_can_edit_students, admission_number_prefix').eq('id', currentSchoolId).single();

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
      <div class="field">
        <label for="school-stamp">Official stamp URL (optional)</label>
        <input type="text" id="school-stamp" value="${school.stamp_url || ''}" placeholder="https://...">
        <div class="text-muted" style="font-size:12.5px; margin-top:2px;">Appears over the signatures on printed report cards. Leave blank until you have your own school's stamp image to link to.</div>
      </div>
      <div class="field">
        <label for="school-admission-prefix">Admission number prefix</label>
        <input type="text" id="school-admission-prefix" value="${school.admission_number_prefix || 'ADM'}" placeholder="e.g. PIS">
        <div class="text-muted" style="font-size:12.5px; margin-top:2px;">New students get the next number automatically, e.g. ${(school.admission_number_prefix || 'ADM')}0001, ${(school.admission_number_prefix || 'ADM')}0002...</div>
      </div>

      <div class="field" style="display:flex; align-items:flex-start; gap:10px; margin-top:4px;">
        <input type="checkbox" id="school-fm-edit-students" ${school.form_masters_can_edit_students ? 'checked' : ''} style="margin-top:3px; width:auto;">
        <label for="school-fm-edit-students" style="margin:0; font-weight:500;">
          Allow form masters to add and edit students in their own class
          <div class="text-muted" style="font-size:12.5px; font-weight:400; margin-top:2px;">They can never remove a student &mdash; that stays admin-only regardless of this setting. Turn off anytime to revoke it immediately.</div>
        </label>
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
  const stampUrl = document.getElementById('school-stamp').value.trim();
  const fmCanEditStudents = document.getElementById('school-fm-edit-students').checked;
  const admissionPrefix = document.getElementById('school-admission-prefix').value.trim() || 'ADM';

  const { error } = await supabaseClient.from('schools').update({
    name, address: address || null, phone: phone || null, logo_url: logoUrl || null,
    stamp_url: stampUrl || null,
    form_masters_can_edit_students: fmCanEditStudents,
    admission_number_prefix: admissionPrefix,
  }).eq('id', currentSchoolId);

  const errEl = document.getElementById('form-error');
  const okEl = document.getElementById('form-success');
  errEl.classList.remove('visible'); okEl.classList.remove('visible');

  if (error) { errEl.textContent = error.message; errEl.classList.add('visible'); return; }
  okEl.textContent = 'Saved.'; okEl.classList.add('visible');
  showToast('Saved');
}

loadSchoolSetupPage();
