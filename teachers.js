let currentSchoolId = null;
let currentSubjectsList = [];
let currentClassesList = [];
let editingTeacherId = null;
let selectedTeacherPhotoFile = null;
let removeTeacherPhotoFlag = false;

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Volunteer'];
const SECTIONS = ['Playgroup/Pre-Nursery', 'Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'];

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

async function loadTeachersPage() {
  const { profile } = await requireSession();
  renderShell({ active: 'teachers', profile });
  currentSchoolId = profile.school_id;

  const [{ data: subjects }, { data: classes }] = await Promise.all([
    supabaseClient.from('subjects').select('id, name, section').eq('school_id', currentSchoolId).order('name'),
    supabaseClient.from('classes').select('id, name, section').eq('school_id', currentSchoolId).order('name'),
  ]);
  currentSubjectsList = subjects || [];
  currentClassesList = classes || [];

  await refreshTeachersView();
}

async function refreshTeachersView() {
  const { data: teachers } = await supabaseClient
    .from('teachers')
    .select('id, name, email, photo_url, photo_path, employment_type, form_master_class_id, classes!teachers_form_master_class_id_fkey ( name ), teacher_subjects ( subject_id, subjects ( name, section ) ), teacher_classes ( class_id, classes ( name, section ) )')
    .eq('school_id', currentSchoolId)
    .order('name');

  renderTeachersBody(teachers || []);
}

function teacherRowHtml(t, sectionName) {
  // Only this section's slice of the teacher's assignments -- not their
  // total across every section, which was confusing when a teacher
  // handles different subjects/classes in different sections.
  const classesHere = (t.teacher_classes || []).filter((l) => (l.classes?.section || 'Unassigned section') === sectionName);
  const subjectsHere = (t.teacher_subjects || []).filter((l) => (l.subjects?.section || 'Unassigned section') === sectionName);

  const avatar = teacherPhotoUrl(t)
    ? `<img src="${teacherPhotoUrl(t)}" alt="${t.name}" class="row-avatar-img">`
    : `<span class="student-avatar">${initials(t.name)}</span>`;

  return `
    <tr>
      <td>
        <span class="row-name">
          ${avatar}
          ${t.name}
          ${t.form_master_class_id ? `<span style="margin-left:8px; font-size:11px; background:var(--gold-soft); color:var(--navy); padding:2px 8px; border-radius:999px; font-weight:700;">Form master &middot; ${t.classes?.name || ''}</span>` : ''}
        </span>
      </td>
      <td class="text-muted">${t.email || '&mdash;'}</td>
      <td class="text-muted">${t.employment_type || '&mdash;'}</td>
      <td class="text-muted">${subjectsHere.length}</td>
      <td class="text-muted">${classesHere.length}</td>
      <td>
        <button class="icon-btn" style="color: var(--navy); margin-right:14px;" onclick="startEditTeacher(${t.id})">Edit</button>
        <button class="icon-btn" onclick="deleteTeacher(${t.id})">Remove</button>
      </td>
    </tr>`;
}

function sectionGroupHtml(sectionName, teachersInSection) {
  if (!teachersInSection.length) return '';
  const rows = teachersInSection.map((t) => teacherRowHtml(t, sectionName)).join('');
  return `
    <div class="panel">
      <p class="eyebrow">${teachersInSection.length} teacher${teachersInSection.length === 1 ? '' : 's'}</p>
      <h3 class="panel-title">${sectionName}</h3>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Teacher</th><th>Email</th><th>Employment</th><th>Subjects</th><th>Classes</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function renderTeachersBody(teachers) {
  window.__teachersCache = teachers;

  const subjectChecks = currentSubjectsList.map((s) => `
    <label style="display:block; font-size:14px; margin-bottom:6px;">
      <input type="checkbox" class="teacher-subject-check" value="${s.id}"> ${s.name}
    </label>`).join('') || '<p class="text-muted" style="font-size:13.5px;">No subjects yet — add some on the Academics page.</p>';

  const classChecks = currentClassesList.map((c) => `
    <label style="display:block; font-size:14px; margin-bottom:6px;">
      <input type="checkbox" class="teacher-class-check" value="${c.id}"> ${c.name}${c.section ? ' (' + c.section + ')' : ''}
    </label>`).join('') || '<p class="text-muted" style="font-size:13.5px;">No classes yet — add some on the Classes page.</p>';

  const employmentOptions = EMPLOYMENT_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('');

  // A teacher can appear under more than one section if they teach across sections
  const sectionsUsed = [...SECTIONS, 'Unassigned section'];
  const groupsHtml = sectionsUsed.map((sectionName) => {
    const teachersHere = teachers.filter((t) =>
      (t.teacher_classes || []).some((link) => (link.classes?.section || 'Unassigned section') === sectionName)
    );
    return sectionGroupHtml(sectionName, teachersHere);
  }).join('');

  const noSectionTeachers = teachers.filter((t) => !(t.teacher_classes || []).length);
  const noSectionHtml = sectionGroupHtml('Not yet assigned to a class', noSectionTeachers);

  const noDataHtml = !teachers.length
    ? `<div class="panel"><div class="empty-state">No teachers yet. Add your first one below.</div></div>` : '';

  document.getElementById('page-body').innerHTML = `
    <p class="page-date">Faculty directory</p>
    <h1 class="page-title">Teachers</h1>
    <p class="page-subtitle">Grouped by section, based on the classes each teacher handles.</p>

    <div class="panel">
      <div class="panel-toolbar">
        <button class="btn-gold" onclick="openAddTeacherForm()">+ Add teacher</button>
      </div>

      <div id="teacher-form" class="form-panel">
        <div class="form-grid">
          <div class="field">
            <label for="teacher-name">Full name</label>
            <input type="text" id="teacher-name" placeholder="e.g. Mr. Chinedu Okoro">
          </div>
          <div class="field">
            <label for="teacher-email">Email</label>
            <input type="email" id="teacher-email" placeholder="Optional">
          </div>
          <div class="field">
            <label for="teacher-photo-file">Photo</label>
            <div style="display:flex; align-items:center; gap:12px;">
              <img id="teacher-photo-preview" src="" alt="" style="width:52px; height:52px; border-radius:50%; object-fit:cover; display:none; border:1px solid var(--border-soft);">
              <input type="file" id="teacher-photo-file" accept="image/jpeg,image/png,image/webp" onchange="onTeacherPhotoFileChange(event)">
            </div>
            <button type="button" class="icon-btn" id="teacher-photo-remove-btn" style="margin-top:6px; display:none;" onclick="removeTeacherPhoto()">Remove photo</button>
            <p class="text-muted" style="font-size:12px; margin-top:4px;">JPG, PNG, or WEBP. Automatically resized before upload.</p>
          </div>
          <div class="field">
            <label for="teacher-employment">Employment type</label>
            <select id="teacher-employment">
              <option value="">Not set</option>
              ${employmentOptions}
            </select>
          </div>
          <div class="field">
            <label for="teacher-form-master">Form master of</label>
            <select id="teacher-form-master">
              <option value="">Not a form master</option>
              ${currentClassesList.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Subjects taught</label>
            <div style="max-height:150px; overflow-y:auto; border:1px solid var(--border-soft); border-radius:var(--radius-sm); padding:10px; background:#fff;">
              ${subjectChecks}
            </div>
          </div>
          <div class="field">
            <label>Classes handled</label>
            <div style="max-height:150px; overflow-y:auto; border:1px solid var(--border-soft); border-radius:var(--radius-sm); padding:10px; background:#fff;">
              ${classChecks}
            </div>
          </div>
        </div>
        <button class="btn-gold" id="teacher-form-submit-btn" onclick="submitTeacherForm()">Save teacher</button>
        <button class="btn-outline" onclick="closeTeacherForm()">Cancel</button>
      </div>

      <div id="form-error" class="error-banner"></div>
    </div>

    ${noDataHtml}
    ${groupsHtml}
    ${noSectionHtml}
  `;
}

function showFormError(message) {
  const el = document.getElementById('form-error');
  el.textContent = message;
  el.classList.add('visible');
}

function resetTeacherPhotoField() {
  selectedTeacherPhotoFile = null;
  removeTeacherPhotoFlag = false;
  document.getElementById('teacher-photo-file').value = '';
  document.getElementById('teacher-photo-preview').style.display = 'none';
  document.getElementById('teacher-photo-remove-btn').style.display = 'none';
}

function onTeacherPhotoFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;
  selectedTeacherPhotoFile = file;
  removeTeacherPhotoFlag = false;

  const previewEl = document.getElementById('teacher-photo-preview');
  const reader = new FileReader();
  reader.onload = (e) => {
    previewEl.src = e.target.result;
    previewEl.style.display = 'block';
  };
  reader.readAsDataURL(file);
  document.getElementById('teacher-photo-remove-btn').style.display = 'inline-block';
}

function removeTeacherPhoto() {
  selectedTeacherPhotoFile = null;
  removeTeacherPhotoFlag = true;
  document.getElementById('teacher-photo-file').value = '';
  document.getElementById('teacher-photo-preview').style.display = 'none';
  document.getElementById('teacher-photo-remove-btn').style.display = 'none';
}

function openAddTeacherForm() {
  editingTeacherId = null;
  document.getElementById('teacher-name').value = '';
  document.getElementById('teacher-email').value = '';
  resetTeacherPhotoField();
  document.getElementById('teacher-employment').value = '';
  document.getElementById('teacher-form-master').value = '';
  document.querySelectorAll('.teacher-subject-check, .teacher-class-check').forEach((el) => el.checked = false);
  document.getElementById('teacher-form-submit-btn').textContent = 'Save teacher';
  document.getElementById('teacher-form').classList.add('open');
}

function startEditTeacher(id) {
  const teacher = (window.__teachersCache || []).find((t) => t.id === id);
  if (!teacher) return;

  editingTeacherId = id;
  document.getElementById('teacher-name').value = teacher.name || '';
  document.getElementById('teacher-email').value = teacher.email || '';
  resetTeacherPhotoField();
  const existingTeacherPhotoUrl = teacherPhotoUrl(teacher);
  if (existingTeacherPhotoUrl) {
    const previewEl = document.getElementById('teacher-photo-preview');
    previewEl.src = existingTeacherPhotoUrl;
    previewEl.style.display = 'block';
    document.getElementById('teacher-photo-remove-btn').style.display = 'inline-block';
  }
  document.getElementById('teacher-employment').value = teacher.employment_type || '';
  document.getElementById('teacher-form-master').value = teacher.form_master_class_id || '';

  const subjectIds = new Set((teacher.teacher_subjects || []).map((r) => r.subject_id));
  const classIds = new Set((teacher.teacher_classes || []).map((r) => r.class_id));
  document.querySelectorAll('.teacher-subject-check').forEach((el) => el.checked = subjectIds.has(Number(el.value)));
  document.querySelectorAll('.teacher-class-check').forEach((el) => el.checked = classIds.has(Number(el.value)));

  document.getElementById('teacher-form-submit-btn').textContent = 'Update teacher';
  document.getElementById('teacher-form').classList.add('open');
  document.getElementById('teacher-form').scrollIntoView({ behavior: 'smooth' });
}

function closeTeacherForm() {
  editingTeacherId = null;
  document.getElementById('teacher-form').classList.remove('open');
}

async function submitTeacherForm() {
  const name = document.getElementById('teacher-name').value.trim();
  const email = document.getElementById('teacher-email').value.trim();
  const employmentType = document.getElementById('teacher-employment').value || null;
  const formMasterClassId = document.getElementById('teacher-form-master').value || null;
  if (!name) { showFormError('Teacher name is required.'); return; }

  const selectedSubjects = [...document.querySelectorAll('.teacher-subject-check:checked')].map((el) => Number(el.value));
  const selectedClasses = [...document.querySelectorAll('.teacher-class-check:checked')].map((el) => Number(el.value));

  let teacherId = editingTeacherId;
  const existingTeacher = editingTeacherId ? (window.__teachersCache || []).find((t) => t.id === editingTeacherId) : null;

  if (teacherId) {
    const { error } = await supabaseClient.from('teachers').update({
      name, email: email || null, employment_type: employmentType, form_master_class_id: formMasterClassId,
    }).eq('id', teacherId);
    if (error) { showFormError(error.message); return; }
    // Clear old links, then re-insert the current selection
    await supabaseClient.from('teacher_subjects').delete().eq('teacher_id', teacherId);
    await supabaseClient.from('teacher_classes').delete().eq('teacher_id', teacherId);
  } else {
    const { data: newTeacher, error } = await supabaseClient
      .from('teachers').insert({
        school_id: currentSchoolId, name, email: email || null, employment_type: employmentType, form_master_class_id: formMasterClassId,
      }).select().single();
    if (error) { showFormError(error.message); return; }
    teacherId = newTeacher.id;
  }

  if (selectedSubjects.length) {
    await supabaseClient.from('teacher_subjects').insert(selectedSubjects.map((subject_id) => ({ teacher_id: teacherId, subject_id })));
  }
  if (selectedClasses.length) {
    await supabaseClient.from('teacher_classes').insert(selectedClasses.map((class_id) => ({ teacher_id: teacherId, class_id })));
  }

  // Photo handling happens after the row exists, since the Storage path is keyed by teacher id.
  if (selectedTeacherPhotoFile) {
    try {
      const newPath = await uploadTeacherPhoto(teacherId, selectedTeacherPhotoFile, existingTeacher?.photo_path);
      await supabaseClient.from('teachers').update({ photo_path: newPath }).eq('id', teacherId);
    } catch (photoErr) {
      showFormError(`Teacher saved, but the photo upload failed: ${photoErr.message}`);
      await refreshTeachersView();
      return;
    }
  } else if (removeTeacherPhotoFlag && existingTeacher?.photo_path) {
    await deleteTeacherPhotoFile(existingTeacher.photo_path);
    await supabaseClient.from('teachers').update({ photo_path: null, photo_url: null }).eq('id', teacherId);
  }

  showToast(existingTeacher ? 'Updated' : 'Saved');
  closeTeacherForm();
  await refreshTeachersView();
}

async function deleteTeacher(id) {
  if (!confirm('Are you sure you want to remove this teacher? This cannot be undone.')) return;
  const existing = (window.__teachersCache || []).find((t) => t.id === id);
  const { error } = await supabaseClient.from('teachers').delete().eq('id', id);
  if (error) { showFormError(error.message); return; }
  if (existing?.photo_path) await deleteTeacherPhotoFile(existing.photo_path);
  showToast('Deleted');
  await refreshTeachersView();
}

loadTeachersPage();
