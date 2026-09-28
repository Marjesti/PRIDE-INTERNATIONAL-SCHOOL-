let currentSchoolId = null;
let currentClasses = [];
let currentStudents = [];
let editingStudentId = null;
let selectedStudentPhotoFile = null;
let removeStudentPhotoFlag = false;

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

async function loadStudentsPage() {
  const { profile } = await requireSession();
  renderShell({ active: 'students', profile });
  currentSchoolId = profile.school_id;
  await refreshStudentsView();
}

async function refreshStudentsView() {
  const [{ data: classes }, { data: students }, { data: teacherLinks }] = await Promise.all([
    supabaseClient.from('classes').select('id, name').eq('school_id', currentSchoolId).order('name'),
    supabaseClient.from('students')
      .select('id, name, admission_no, guardian_email, guardian_phone, photo_url, photo_path, classes ( id, name )')
      .eq('school_id', currentSchoolId)
      .order('name'),
    supabaseClient.from('teachers').select('name, form_master_class_id').not('form_master_class_id', 'is', null),
  ]);

  currentClasses = classes || [];
  currentStudents = students || [];

  // Build a map of class_id -> form master name, for the group headers
  const formMasterByClass = {};
  (teacherLinks || []).forEach((t) => {
    if (t.form_master_class_id) formMasterByClass[t.form_master_class_id] = t.name;
  });

  renderStudentsBody(currentClasses, currentStudents, formMasterByClass);
}

function studentRowHtml(s) {
  const photoUrl = studentPhotoUrl(s);
  const avatar = photoUrl
    ? `<img src="${photoUrl}" alt="${s.name}" class="row-avatar-img">`
    : `<span class="student-avatar">${initials(s.name)}</span>`;
  return `
    <tr>
      <td>
        <span class="row-name">
          ${avatar}
          ${s.name}
        </span>
      </td>
      <td class="text-muted">${s.admission_no || '&mdash;'}</td>
      <td class="text-muted">${s.guardian_email || '&mdash;'}</td>
      <td class="text-muted">${s.guardian_phone || '&mdash;'}</td>
      <td>
        <button class="icon-btn" style="color: var(--navy); margin-right:14px;" onclick="startEditStudent(${s.id})">Edit</button>
        <button class="icon-btn" onclick="deleteStudent(${s.id})">Remove</button>
      </td>
    </tr>`;
}

function classGroupHtml(className, formMasterName, students) {
  const teacherLine = formMasterName
    ? formMasterName
    : '<span class="text-muted">No form master assigned</span>';

  const rows = students.length
    ? students.map(studentRowHtml).join('')
    : `<tr><td colspan="5"><div class="empty-state">No students in this class yet.</div></td></tr>`;

  return `
    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">${students.length} student${students.length === 1 ? '' : 's'}</p>
          <h3 class="panel-title">${className}</h3>
        </div>
        <span class="text-muted" style="font-size:13.5px;">Form master: ${teacherLine}</span>
      </div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Student</th><th>Admission no.</th><th>Guardian email</th><th>Guardian phone</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function renderStudentsBody(classes, students, formMasterByClass) {
  const classOptions = classes.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');

  // Group students by class, in class-name order; unassigned students go in their own group at the end.
  const groupsHtml = classes.map((c) => {
    const studentsInClass = students.filter((s) => s.classes?.id === c.id);
    const formMasterName = formMasterByClass[c.id] || null;
    return classGroupHtml(c.name, formMasterName, studentsInClass);
  }).join('');

  const unassigned = students.filter((s) => !s.classes?.id);
  const unassignedHtml = unassigned.length ? classGroupHtml('Unassigned', null, unassigned) : '';

  const noDataHtml = (!classes.length && !unassigned.length)
    ? `<div class="panel"><div class="empty-state">No students yet. Add your first one below.</div></div>` : '';

  document.getElementById('page-body').innerHTML = `
    <p class="page-date">Class list &amp; roster</p>
    <h1 class="page-title">Students</h1>
    <p class="page-subtitle">Students are grouped by class, with the assigned teacher shown for each.</p>

    <div class="panel">
      <div class="panel-toolbar">
        <button class="btn-gold" onclick="toggleForm('add-class-form')">+ Add class</button>
        <button class="btn-gold" onclick="toggleForm('add-student-form')">+ Add student</button>
        <button class="btn-outline" onclick="toggleForm('import-csv-form')">Import from CSV</button>
      </div>

      <div id="import-csv-form" class="form-panel">
        <p style="font-size:13.5px; margin-bottom:10px;">
          CSV with a header row: <code>name,admission_no,guardian_email,guardian_phone,class_name</code>.
          <code>class_name</code> must match an existing class name exactly (case-insensitive) or the student is added unassigned.
        </p>
        <input type="file" id="csv-file-input" accept=".csv">
        <button class="btn-gold" style="margin-top:10px;" onclick="handleCsvImport()">Import</button>
        <div id="csv-import-status" style="margin-top:10px; font-size:13.5px;"></div>
      </div>

      <div id="add-class-form" class="form-panel">
        <div class="form-grid">
          <div class="field">
            <label for="new-class-name">Class name</label>
            <input type="text" id="new-class-name" placeholder="e.g. JSS 1A">
          </div>
        </div>
        <button class="btn-gold" onclick="submitNewClass()">Save class</button>
      </div>

      <div id="add-student-form" class="form-panel">
        <div class="form-grid">
          <div class="field">
            <label for="new-student-name">Full name</label>
            <input type="text" id="new-student-name" placeholder="e.g. Amara Okafor">
          </div>
          <div class="field">
            <label for="new-student-admission">Admission no.</label>
            <input type="text" id="new-student-admission" placeholder="Optional">
          </div>
          <div class="field">
            <label for="new-student-class">Class</label>
            <select id="new-student-class">
              <option value="">Unassigned</option>
              ${classOptions}
            </select>
          </div>
          <div class="field">
            <label for="new-student-guardian">Guardian email</label>
            <input type="email" id="new-student-guardian" placeholder="Optional">
          </div>
          <div class="field">
            <label for="new-student-guardian-phone">Guardian WhatsApp number</label>
            <input type="text" id="new-student-guardian-phone" placeholder="e.g. 2348012345678">
          </div>
          <div class="field">
            <label for="new-student-photo-file">Photo</label>
            <div style="display:flex; align-items:center; gap:12px;">
              <img id="student-photo-preview" src="" alt="" style="width:52px; height:52px; border-radius:50%; object-fit:cover; display:none; border:1px solid var(--border-soft);">
              <input type="file" id="new-student-photo-file" accept="image/jpeg,image/png,image/webp" onchange="onStudentPhotoFileChange(event)">
            </div>
            <button type="button" class="icon-btn" id="student-photo-remove-btn" style="margin-top:6px; display:none;" onclick="removeStudentPhoto()">Remove photo</button>
            <p class="text-muted" style="font-size:12px; margin-top:4px;">JPG, PNG, or WEBP. Automatically resized before upload.</p>
          </div>
        </div>
        <button class="btn-gold" id="student-form-submit-btn" onclick="submitNewStudent()">Save student</button>
        <button class="btn-outline" onclick="closeStudentForm()">Cancel</button>
      </div>

      <div id="form-error" class="error-banner"></div>
    </div>

    ${noDataHtml}
    ${groupsHtml}
    ${unassignedHtml}
  `;
}

function toggleForm(id) {
  if (id === 'add-student-form') {
    editingStudentId = null;
    document.getElementById('new-student-name').value = '';
    document.getElementById('new-student-admission').value = '';
    document.getElementById('new-student-class').value = '';
    document.getElementById('new-student-guardian').value = '';
    document.getElementById('new-student-guardian-phone').value = '';
    resetStudentPhotoField();
    document.getElementById('student-form-submit-btn').textContent = 'Save student';
  }
  document.getElementById(id).classList.toggle('open');
}

function closeStudentForm() {
  editingStudentId = null;
  document.getElementById('add-student-form').classList.remove('open');
}

function startEditStudent(id) {
  const student = currentStudents.find((s) => s.id === id);
  if (!student) return;

  editingStudentId = id;
  document.getElementById('new-student-name').value = student.name || '';
  document.getElementById('new-student-admission').value = student.admission_no || '';
  document.getElementById('new-student-class').value = student.classes?.id || '';
  document.getElementById('new-student-guardian').value = student.guardian_email || '';
  document.getElementById('new-student-guardian-phone').value = student.guardian_phone || '';
  resetStudentPhotoField();
  const existingPhotoUrl = studentPhotoUrl(student);
  if (existingPhotoUrl) {
    const previewEl = document.getElementById('student-photo-preview');
    previewEl.src = existingPhotoUrl;
    previewEl.style.display = 'block';
    document.getElementById('student-photo-remove-btn').style.display = 'inline-block';
  }
  document.getElementById('student-form-submit-btn').textContent = 'Update student';
  document.getElementById('add-student-form').classList.add('open');
  document.getElementById('add-student-form').scrollIntoView({ behavior: 'smooth' });
}

function showFormError(message) {
  const el = document.getElementById('form-error');
  el.textContent = message;
  el.classList.add('visible');
}

function resetStudentPhotoField() {
  selectedStudentPhotoFile = null;
  removeStudentPhotoFlag = false;
  document.getElementById('new-student-photo-file').value = '';
  document.getElementById('student-photo-preview').style.display = 'none';
  document.getElementById('student-photo-remove-btn').style.display = 'none';
}

function onStudentPhotoFileChange(event) {
  const file = event.target.files[0];
  if (!file) return;
  selectedStudentPhotoFile = file;
  removeStudentPhotoFlag = false;

  const previewEl = document.getElementById('student-photo-preview');
  const reader = new FileReader();
  reader.onload = (e) => {
    previewEl.src = e.target.result;
    previewEl.style.display = 'block';
  };
  reader.readAsDataURL(file);
  document.getElementById('student-photo-remove-btn').style.display = 'inline-block';
}

function removeStudentPhoto() {
  selectedStudentPhotoFile = null;
  removeStudentPhotoFlag = true;
  document.getElementById('new-student-photo-file').value = '';
  document.getElementById('student-photo-preview').style.display = 'none';
  document.getElementById('student-photo-remove-btn').style.display = 'none';
}

async function submitNewClass() {
  const nameInput = document.getElementById('new-class-name');
  const name = nameInput.value.trim();
  if (!name) return;

  const { error } = await supabaseClient.from('classes').insert({ school_id: currentSchoolId, name });
  if (error) { showFormError(error.message); return; }

  nameInput.value = '';
  await refreshStudentsView();
}

async function submitNewStudent() {
  const name = document.getElementById('new-student-name').value.trim();
  const admissionNo = document.getElementById('new-student-admission').value.trim();
  const classId = document.getElementById('new-student-class').value || null;
  const guardianEmail = document.getElementById('new-student-guardian').value.trim();
  const guardianPhone = document.getElementById('new-student-guardian-phone').value.trim();

  if (!name) { showFormError('Student name is required.'); return; }

  const payload = {
    name,
    admission_no: admissionNo || null,
    class_id: classId,
    guardian_email: guardianEmail || null,
    guardian_phone: guardianPhone || null,
  };

  let studentId = editingStudentId;
  const existingStudent = editingStudentId ? currentStudents.find((s) => s.id === editingStudentId) : null;

  if (studentId) {
    const { error } = await supabaseClient.from('students').update(payload).eq('id', studentId);
    if (error) { showFormError(error.message); return; }
  } else {
    const { data: newStudent, error } = await supabaseClient
      .from('students').insert({ school_id: currentSchoolId, ...payload }).select().single();
    if (error) { showFormError(error.message); return; }
    studentId = newStudent.id;
  }

  // Photo handling happens after the row exists, since the Storage path is keyed by student id.
  if (selectedStudentPhotoFile) {
    try {
      const newPath = await uploadStudentPhoto(studentId, selectedStudentPhotoFile, existingStudent?.photo_path);
      await supabaseClient.from('students').update({ photo_path: newPath }).eq('id', studentId);
    } catch (photoErr) {
      showFormError(`Student saved, but the photo upload failed: ${photoErr.message}`);
      await refreshStudentsView();
      return;
    }
  } else if (removeStudentPhotoFlag && existingStudent?.photo_path) {
    await deleteStudentPhotoFile(existingStudent.photo_path);
    await supabaseClient.from('students').update({ photo_path: null, photo_url: null }).eq('id', studentId);
  }

  showToast(existingStudent ? 'Updated' : 'Saved');
  closeStudentForm();
  await refreshStudentsView();
}

async function deleteStudent(id) {
  if (!confirm('Are you sure you want to remove this student? This cannot be undone.')) return;
  const existing = currentStudents.find((s) => s.id === id);
  const { error } = await supabaseClient.from('students').delete().eq('id', id);
  if (error) { showFormError(error.message); return; }
  if (existing?.photo_path) await deleteStudentPhotoFile(existing.photo_path);
  showToast('Deleted');
  await refreshStudentsView();
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] || ''; });
    return row;
  });
}

async function handleCsvImport() {
  const statusEl = document.getElementById('csv-import-status');
  const fileInput = document.getElementById('csv-file-input');
  const file = fileInput.files[0];
  if (!file) { statusEl.textContent = 'Choose a CSV file first.'; return; }

  statusEl.textContent = 'Reading file...';
  const text = await file.text();
  const rows = parseCsv(text);

  if (!rows.length) { statusEl.textContent = 'No rows found in that file.'; return; }

  const classByName = {};
  currentClasses.forEach((c) => { classByName[c.name.toLowerCase()] = c.id; });

  const toInsert = [];
  let skipped = 0;
  let unmatchedClasses = new Set();

  rows.forEach((row) => {
    const name = row.name;
    if (!name) { skipped++; return; }
    const classId = row.class_name ? classByName[row.class_name.toLowerCase()] || null : null;
    if (row.class_name && !classId) unmatchedClasses.add(row.class_name);

    toInsert.push({
      school_id: currentSchoolId,
      name,
      admission_no: row.admission_no || null,
      guardian_email: row.guardian_email || null,
      guardian_phone: row.guardian_phone || null,
      class_id: classId,
    });
  });

  if (!toInsert.length) { statusEl.textContent = 'No valid rows to import (each row needs at least a name).'; return; }

  statusEl.textContent = `Importing ${toInsert.length} student(s)...`;
  const { error } = await supabaseClient.from('students').insert(toInsert);

  if (error) { statusEl.textContent = 'Import failed: ' + error.message; return; }

  let summary = `Imported ${toInsert.length} student(s).`;
  if (skipped) summary += ` Skipped ${skipped} row(s) with no name.`;
  if (unmatchedClasses.size) summary += ` Class name(s) not found (left unassigned): ${[...unmatchedClasses].join(', ')}.`;
  statusEl.textContent = summary;

  fileInput.value = '';
  await refreshStudentsView();
}

loadStudentsPage();
