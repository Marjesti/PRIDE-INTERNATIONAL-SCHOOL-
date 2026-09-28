let teacherRecord = null;
let mySubjects = [];
let myClasses = [];
let activeSession = null;
let myStudents = [];
let myOwnResults = [];
let formMasterPendingResults = [];
let editingResultId = null;
let currentUserId = null;
let currentSchoolId = null;

// Class Mark Book (form master only)
let markbookSubjects = [];
let markbookSubjectIndex = 0;
let markbookResultsBySubject = {};
let markbookStudents = [];
let markbookSlideDirection = 'next';

function gradeFor(total) {
  if (total === null || total === undefined) return '';
  if (total >= 90) return 'A+';
  if (total >= 80) return 'A';
  if (total >= 75) return 'B2';
  if (total >= 70) return 'B3';
  if (total >= 65) return 'C4';
  if (total >= 60) return 'C5';
  if (total >= 50) return 'C6';
  if (total >= 40) return 'D7';
  if (total >= 30) return 'E8';
  return 'F9';
}

async function loadTeacherDashboard() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  currentUserId = session.user.id;

  const { data: profile } = await supabaseClient
    .from('profiles').select('name, role, school_id, schools ( name )').eq('id', session.user.id).single();

  if (!profile || profile.role !== 'teacher') {
    window.location.href = profile?.role === 'admin' ? 'overview.html' : 'login.html';
    return;
  }
  currentSchoolId = profile.school_id;

  document.getElementById('teacher-name').textContent = profile.name;
  document.getElementById('school-name').textContent = profile.schools?.name || '';

  const { data: teacher } = await supabaseClient
    .from('teachers')
    .select('id, name, form_master_class_id, classes!teachers_form_master_class_id_fkey ( id, name, section ), teacher_subjects ( subjects ( id, name, section ) ), teacher_classes ( classes ( id, name, section ) )')
    .eq('profile_id', session.user.id)
    .maybeSingle();

  if (!teacher) {
    document.getElementById('page-body').innerHTML = `
      <div class="panel"><div class="empty-state">Your login isn't linked to a teacher record yet. Ask your admin to check the Teachers page.</div></div>
    `;
    return;
  }

  teacherRecord = teacher;
  // "Handled" classes -- used ONLY for subject-teaching + the result-submission filter.
  mySubjects = (teacher.teacher_subjects || []).map((r) => r.subjects).filter(Boolean);
  myClasses = (teacher.teacher_classes || []).map((r) => r.classes).filter(Boolean);

  const { data: session_ } = await supabaseClient
    .from('academic_sessions').select('id, year_label, term')
    .eq('school_id', profile.school_id).eq('is_active', true).maybeSingle();
  activeSession = session_;

  const { data: students } = await supabaseClient
    .from('students').select('id, name, admission_no, classes ( id, name )')
    .eq('school_id', profile.school_id).order('name');
  myStudents = students || [];

  await refreshMyResults();
}

async function refreshMyResults() {
  if (!activeSession) { renderDashboard(); return; }

  const { data: mine } = await supabaseClient
    .from('results')
    .select('id, student_id, subject_id, ca1_score, ca2_score, ca_score, exam_score, total_score, grade, status, students ( name, classes ( id, name ) ), subjects ( name )')
    .eq('session_id', activeSession.id)
    .eq('submitted_by', currentUserId)
    .order('id', { ascending: false });
  myOwnResults = mine || [];

  // Only relevant if this teacher is a form master: pending results across
  // the WHOLE class, for them to approve before admin publishes.
  formMasterPendingResults = [];
  if (teacherRecord.form_master_class_id) {
    const { data: pending } = await supabaseClient
      .from('results')
      .select('id, ca1_score, ca2_score, ca_score, exam_score, total_score, grade, status, students ( name ), subjects ( name )')
      .eq('session_id', activeSession.id)
      .eq('status', 'pending');
    // RLS already scopes this to the form master's class for us.
    formMasterPendingResults = pending || [];

    await loadClassMarkBook();
  }

  renderDashboard();
}

async function loadClassMarkBook() {
  const classId = teacherRecord.form_master_class_id;
  const classSection = teacherRecord.classes?.section || null;

  markbookStudents = myStudents.filter((s) => s.classes?.id === classId);

  const { data: subjects } = await supabaseClient
    .from('subjects').select('id, name, section')
    .eq('school_id', currentSchoolId);
  markbookSubjects = (subjects || [])
    .filter((s) => !s.section || s.section === classSection)
    .sort((a, b) => a.name.localeCompare(b.name));

  const studentIds = markbookStudents.map((s) => s.id);
  markbookResultsBySubject = {};
  if (studentIds.length) {
    const { data: allResults } = await supabaseClient
      .from('results')
      .select('id, student_id, subject_id, ca1_score, ca2_score, ca_score, exam_score, total_score, grade, status')
      .eq('session_id', activeSession.id)
      .in('student_id', studentIds);

    (allResults || []).forEach((r) => {
      if (!markbookResultsBySubject[r.subject_id]) markbookResultsBySubject[r.subject_id] = {};
      markbookResultsBySubject[r.subject_id][r.student_id] = r;
    });
  }

  if (markbookSubjectIndex >= markbookSubjects.length) markbookSubjectIndex = 0;
}

function renderDashboard() {
  const subjectTags = mySubjects.length
    ? mySubjects.map((s) => `<span style="display:inline-block; background:var(--gold-soft); color:var(--navy); padding:4px 10px; border-radius:999px; font-size:12.5px; margin:2px;">${s.name}</span>`).join('')
    : '<span class="text-muted">None assigned yet</span>';

  const classTags = myClasses.length
    ? myClasses.map((c) => `<span style="display:inline-block; background:var(--gold-soft); color:var(--navy); padding:4px 10px; border-radius:999px; font-size:12.5px; margin:2px;">${c.name}</span>`).join('')
    : '<span class="text-muted">None assigned yet</span>';

  const formMasterLine = teacherRecord.form_master_class_id
    ? `<div class="panel" style="border-left:4px solid var(--gold);">
        <p class="eyebrow">Form master</p>
        <h3 class="panel-title">${teacherRecord.classes?.name || 'Your class'}</h3>
        <p class="text-muted" style="font-size:13.5px;">You have full access to every student and subject in this class, and can approve their pending results before the admin publishes them.</p>
      </div>`
    : '';

  const classFilterOptions = myClasses.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');

  document.getElementById('page-body').innerHTML = `
    <div class="panel">
      <p class="eyebrow">Your assignments</p>
      <h3 class="panel-title">Subjects &amp; classes</h3>
      <p><strong>Subjects:</strong> ${subjectTags}</p>
      <p style="margin-top:10px;"><strong>Classes handled:</strong> ${classTags}</p>
    </div>

    ${formMasterLine}
    ${teacherRecord.form_master_class_id ? renderClassMarkBookPanel() : ''}
    ${teacherRecord.form_master_class_id ? renderFormMasterApprovalPanel() : ''}
    ${teacherRecord.form_master_class_id ? renderFormMasterNotesPanel() : ''}

    ${activeSession ? `
    <div class="panel">
      <p class="eyebrow">${activeSession.year_label} &middot; ${activeSession.term}</p>
      <h3 class="panel-title">${editingResultId ? 'Update result' : 'Submit a result'}</h3>
      ${mySubjects.length && myClasses.length ? `
        <div class="form-grid">
          <div class="field">
            <label for="result-class">Class</label>
            <select id="result-class" onchange="onResultClassChange()">
              <option value="">Select a class first</option>
              ${classFilterOptions}
            </select>
          </div>
          <div class="field">
            <label for="result-student">Student</label>
            <select id="result-student"><option value="">Select a class first</option></select>
          </div>
          <div class="field">
            <label for="result-subject">Subject</label>
            <select id="result-subject"><option value="">Select a class first</option></select>
          </div>
          <div class="field">
            <label for="result-ca1">CA1 score</label>
            <input type="number" id="result-ca1" min="0" max="30" placeholder="e.g. 12">
          </div>
          <div class="field">
            <label for="result-ca2">CA2 score</label>
            <input type="number" id="result-ca2" min="0" max="30" placeholder="e.g. 15">
          </div>
          <div class="field">
            <label for="result-exam">Exam score (out of 70)</label>
            <input type="number" id="result-exam" min="0" max="70">
          </div>
        </div>
        <p class="text-muted" style="font-size:12px;">CA1 + CA2 together must not exceed 30. Enter one now and add the other later &mdash; both save independently, and you can keep editing until an admin publishes the result.</p>
        <button class="btn-gold" onclick="submitResult()">${editingResultId ? 'Save changes' : 'Submit for approval'}</button>
        ${editingResultId ? `<button class="btn-outline" onclick="cancelEditResult()">Cancel</button>` : ''}
        <div id="form-error" class="error-banner"></div>
        <div id="form-success" class="error-banner" style="background:#E8F3EA; color:#3A7D44;"></div>
      ` : `<p class="text-muted" style="font-size:14px;">You need at least one subject and one class assigned before you can submit results.</p>`}
    </div>

    <div class="panel">
      <p class="eyebrow">Your submissions</p>
      <h3 class="panel-title">Results you've entered</h3>
      ${renderMyResultsTable()}
    </div>
    ` : `<div class="panel"><div class="empty-state">No active academic session right now.</div></div>`}
  `;
}

function renderMyResultsTable() {
  if (!myOwnResults.length) return `<div class="empty-state">You haven't submitted any results yet.</div>`;

  const rows = myOwnResults.map((r) => {
    const isOwnFormMasterClass = teacherRecord.form_master_class_id
      && r.students?.classes?.id === teacherRecord.form_master_class_id;

    const actions = r.status !== 'published'
      ? `<button class="icon-btn" style="color: var(--navy); margin-right:10px;" onclick="startEditResult(${r.id})">Edit</button>${
          isOwnFormMasterClass && r.status === 'pending' ? `<button class="icon-btn" style="color: var(--navy);" onclick="approveAsFormMaster(${r.id})">Approve</button>` : ''
        }`
      : '';

    return `
    <tr>
      <td>${r.students?.name || ''}</td>
      <td class="text-muted">${r.students?.classes?.name || ''}</td>
      <td>${r.subjects?.name || ''}</td>
      <td class="text-muted">CA1: ${r.ca1_score ?? '--'} &middot; CA2: ${r.ca2_score ?? '--'} &middot; Exam: ${r.exam_score ?? '--'}</td>
      <td>${r.total_score ?? '--'} (${r.grade || '--'})</td>
      <td>${r.status === 'pending' ? '<span class="text-muted">Pending</span>' : r.status === 'approved' ? '<span style="color:#8A6D1D; font-weight:600;">Approved</span>' : '<span style="color:#3A7D44; font-weight:600;">Published</span>'}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');

  return `
    <div class="data-table-wrap"><table class="data-table">
      <thead><tr><th>Student</th><th>Class</th><th>Subject</th><th>CA1/CA2/Exam</th><th>Total</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function renderFormMasterApprovalPanel() {
  if (!formMasterPendingResults.length) {
    return `<div class="panel"><p class="eyebrow">Awaiting your approval</p><h3 class="panel-title">Pending results in your class</h3><div class="empty-state">Nothing pending right now.</div></div>`;
  }
  const rows = formMasterPendingResults.map((r) => `
    <tr>
      <td>${r.students?.name || ''}</td>
      <td>${r.subjects?.name || ''}</td>
      <td class="text-muted">CA1: ${r.ca1_score ?? '--'} &middot; CA2: ${r.ca2_score ?? '--'} &middot; Exam: ${r.exam_score ?? '--'}</td>
      <td>${r.total_score ?? '--'} (${r.grade || '--'})</td>
      <td><button class="icon-btn" style="color: var(--navy);" onclick="approveAsFormMaster(${r.id})">Approve</button></td>
    </tr>
  `).join('');
  return `
    <div class="panel">
      <p class="eyebrow">Awaiting your approval</p>
      <h3 class="panel-title">Pending results in your class</h3>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Student</th><th>Subject</th><th>CA/Exam</th><th>Total</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function renderClassMarkBookPanel() {
  if (!markbookSubjects.length) {
    return `<div class="panel"><p class="eyebrow">Class mark book</p><h3 class="panel-title">${teacherRecord.classes?.name || 'Your class'}</h3><div class="empty-state">No subjects are set up for this class's section yet.</div></div>`;
  }

  const subject = markbookSubjects[markbookSubjectIndex];
  const resultsForSubject = markbookResultsBySubject[subject.id] || {};

  const rows = markbookStudents.map((s) => {
    const r = resultsForSubject[s.id];
    const ca1 = r?.ca1_score;
    const ca2 = r?.ca2_score;
    const exam = r?.exam_score;
    const missing = ca1 === undefined || ca1 === null || ca2 === undefined || ca2 === null || exam === undefined || exam === null;
    const cell = (v) => v === undefined || v === null
      ? '<span class="markbook-missing">&mdash;</span>'
      : v;
    return `
      <tr class="${missing ? 'markbook-row-missing' : ''}">
        <td class="markbook-student-col">${s.name}</td>
        <td>${cell(ca1)}</td>
        <td>${cell(ca2)}</td>
        <td>${r?.ca_score ?? '<span class="markbook-missing">&mdash;</span>'}</td>
        <td>${cell(exam)}</td>
        <td><strong>${r?.total_score ?? '<span class="markbook-missing">&mdash;</span>'}</strong>${r?.grade ? ` (${r.grade})` : ''}</td>
        <td>${r ? statusPill(r.status) : '<span class="markbook-missing">Not entered</span>'}</td>
      </tr>`;
  }).join('');

  return `
    <div class="panel">
      <p class="eyebrow">Class mark book &mdash; ${teacherRecord.classes?.name || ''}</p>
      <div class="markbook-nav">
        <h3 class="panel-title markbook-subject-title">${subject.name}</h3>
      </div>
      <p class="text-muted" style="font-size:12.5px; text-align:center; margin:-4px 0 10px;">Subject ${markbookSubjectIndex + 1} of ${markbookSubjects.length} &middot; swipe left or right to change subject</p>

      <div class="markbook-viewport" id="markbook-viewport" ontouchstart="markbookTouchStart(event)" ontouchend="markbookTouchEnd(event)">
        <div class="markbook-slide markbook-slide-${markbookSlideDirection}" id="markbook-slide">
          <div class="markbook-scroll">
            <table class="data-table markbook-table">
              <thead><tr><th>Student</th><th>CA1</th><th>CA2</th><th>CA Total</th><th>Exam</th><th>Final</th><th>Status</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

function statusPill(status) {
  if (status === 'published') return '<span style="color:#3A7D44; font-weight:600;">Published</span>';
  if (status === 'approved') return '<span style="color:#8A6D1D; font-weight:600;">Approved</span>';
  return '<span class="text-muted">Pending</span>';
}

function markbookGo(delta) {
  const nextIndex = markbookSubjectIndex + delta;
  if (nextIndex < 0 || nextIndex >= markbookSubjects.length) return;
  markbookSlideDirection = delta > 0 ? 'next' : 'prev';
  markbookSubjectIndex = nextIndex;
  renderDashboard();

  // Re-trigger the slide-in animation on the freshly-rendered element
  requestAnimationFrame(() => {
    const el = document.getElementById('markbook-slide');
    if (el) { el.classList.add('markbook-animate'); setTimeout(() => el.classList.remove('markbook-animate'), 260); }
  });
}

let markbookTouchStartX = null;
function markbookTouchStart(event) {
  markbookTouchStartX = event.changedTouches[0].clientX;
}
function markbookTouchEnd(event) {
  if (markbookTouchStartX === null) return;
  const deltaX = event.changedTouches[0].clientX - markbookTouchStartX;
  markbookTouchStartX = null;
  if (Math.abs(deltaX) < 40) return; // not a deliberate swipe
  markbookGo(deltaX < 0 ? 1 : -1); // swipe left -> next, swipe right -> prev
}

function onResultClassChange() {
  const classId = document.getElementById('result-class').value;
  const studentSelect = document.getElementById('result-student');
  const subjectSelect = document.getElementById('result-subject');

  if (!classId) {
    studentSelect.innerHTML = '<option value="">Select a class first</option>';
    subjectSelect.innerHTML = '<option value="">Select a class first</option>';
    return;
  }

  const inClass = myStudents.filter((s) => String(s.classes?.id) === String(classId));
  studentSelect.innerHTML = inClass.length
    ? inClass.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')
    : '<option value="">No students in this class</option>';

  // Only show subjects that belong to this class's section (or have no
  // section set), so a teacher who takes different subjects in different
  // sections isn't shown subjects that don't apply to this class.
  const selectedClass = myClasses.find((c) => String(c.id) === String(classId));
  const classSection = selectedClass?.section || null;
  const subjectsForSection = mySubjects.filter((s) => !s.section || s.section === classSection);
  subjectSelect.innerHTML = subjectsForSection.length
    ? subjectsForSection.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')
    : '<option value="">No matching subjects assigned</option>';
}

function startEditResult(id) {
  const r = myOwnResults.find((x) => x.id === id);
  if (!r) return;
  editingResultId = id;
  renderDashboard();

  // Pre-fill after the form renders
  setTimeout(() => {
    const classId = r.students?.classes?.id;
    if (classId) {
      document.getElementById('result-class').value = classId;
      onResultClassChange();
      document.getElementById('result-student').value = r.student_id;
    }
    document.getElementById('result-subject').value = r.subject_id;
    document.getElementById('result-ca1').value = r.ca1_score ?? '';
    document.getElementById('result-ca2').value = r.ca2_score ?? '';
    document.getElementById('result-exam').value = r.exam_score ?? '';
  }, 0);
}

function cancelEditResult() {
  editingResultId = null;
  renderDashboard();
}

async function submitResult() {
  const studentId = document.getElementById('result-student').value;
  const subjectId = document.getElementById('result-subject').value;
  const ca1 = document.getElementById('result-ca1').value;
  const ca2 = document.getElementById('result-ca2').value;
  const exam = document.getElementById('result-exam').value;

  const errEl = document.getElementById('form-error');
  const okEl = document.getElementById('form-success');
  errEl.classList.remove('visible'); okEl.classList.remove('visible');

  if (!studentId || !subjectId) { errEl.textContent = 'Choose a class, a student, and a subject.'; errEl.classList.add('visible'); return; }

  const ca1Score = ca1 === '' ? null : Number(ca1);
  const ca2Score = ca2 === '' ? null : Number(ca2);
  const examScore = exam === '' ? null : Number(exam);
  if (ca1Score !== null && (ca1Score < 0 || ca1Score > 30)) { errEl.textContent = 'CA1 score must be 0-30.'; errEl.classList.add('visible'); return; }
  if (ca2Score !== null && (ca2Score < 0 || ca2Score > 30)) { errEl.textContent = 'CA2 score must be 0-30.'; errEl.classList.add('visible'); return; }
  if ((ca1Score ?? 0) + (ca2Score ?? 0) > 30) { errEl.textContent = 'CA1 + CA2 together cannot exceed 30.'; errEl.classList.add('visible'); return; }
  if (examScore !== null && (examScore < 0 || examScore > 70)) { errEl.textContent = 'Exam score must be 0-70.'; errEl.classList.add('visible'); return; }

  const caTotal = (ca1Score !== null || ca2Score !== null) ? (ca1Score ?? 0) + (ca2Score ?? 0) : null;
  const total = (caTotal !== null && examScore !== null) ? caTotal + examScore : null;

  const payload = {
    ca1_score: ca1Score, ca2_score: ca2Score, ca_score: caTotal,
    exam_score: examScore, total_score: total, grade: gradeFor(total),
  };

  const query = editingResultId
    ? supabaseClient.from('results').update(payload).eq('id', editingResultId)
    : supabaseClient.from('results').insert({
        school_id: currentSchoolId, student_id: studentId, subject_id: subjectId,
        session_id: activeSession.id, status: 'pending', submitted_by: currentUserId, ...payload,
      });

  const { error } = await query;

  if (error) {
    errEl.textContent = error.code === '23505'
      ? 'This student already has a result for this subject in this term.'
      : error.message;
    errEl.classList.add('visible');
    return;
  }

  okEl.textContent = editingResultId ? 'Updated.' : 'Submitted for approval.';
  okEl.classList.add('visible');
  showToast(editingResultId ? 'Updated' : 'Saved');
  editingResultId = null;
  await refreshMyResults();
}

async function approveAsFormMaster(id) {
  const { error } = await supabaseClient.from('results').update({ status: 'approved' }).eq('id', id);
  if (error) {
    alert('Could not approve: ' + error.message);
    return;
  }

  const { data: profile } = await supabaseClient.from('profiles').select('name').eq('id', currentUserId).single();
  await supabaseClient.from('activity_log').insert({
    school_id: currentSchoolId,
    actor_id: currentUserId,
    actor_name: profile?.name || 'Unknown',
    action: 'Approved a result (form master)',
    details: `Result #${id} marked as approved`,
  });

  showToast('Approved');
  await refreshMyResults();
}

function renderFormMasterNotesPanel() {
  const classId = teacherRecord.form_master_class_id;
  const inClass = myStudents.filter((s) => s.classes?.id === classId);
  const options = inClass.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');

  return `
    <div class="panel">
      <p class="eyebrow">Report cards</p>
      <h3 class="panel-title">Attendance, behaviour &amp; remarks</h3>
      <p class="text-muted" style="font-size:13.5px;">For students in ${teacherRecord.classes?.name || 'your class'}.</p>
      <div class="field">
        <label for="fm-notes-student">Student</label>
        <select id="fm-notes-student" onchange="loadFormMasterNotesForm()">
          <option value="">Select a student</option>
          ${options}
        </select>
      </div>
      <div id="fm-notes-form-container"></div>
    </div>`;
}

async function loadFormMasterNotesForm() {
  const studentId = document.getElementById('fm-notes-student').value;
  const container = document.getElementById('fm-notes-form-container');
  if (!studentId) { container.innerHTML = ''; return; }

  const { data: notes } = await supabaseClient
    .from('student_term_notes').select('*')
    .eq('student_id', studentId).eq('session_id', activeSession.id).maybeSingle();

  const n = notes || {};
  const ratingOptions = (current) => [1, 2, 3, 4, 5].map((v) =>
    `<option value="${v}" ${current === v ? 'selected' : ''}>${v}</option>`).join('');

  container.innerHTML = `
    <div class="form-panel open">
      <div class="form-grid">
        <div class="field"><label>Days school opened</label><input type="number" id="fm-days-opened" value="${n.days_opened ?? ''}"></div>
        <div class="field"><label>Days present</label><input type="number" id="fm-days-present" value="${n.days_present ?? ''}"></div>
        <div class="field"><label>Days absent</label><input type="number" id="fm-days-absent" value="${n.days_absent ?? ''}"></div>
        <div class="field"><label>Next term begins</label><input type="date" id="fm-next-term" value="${n.next_term_date || ''}"></div>
      </div>
      <div class="form-grid">
        <div class="field"><label>Punctuality</label><select id="fm-punctuality"><option value="">--</option>${ratingOptions(n.punctuality)}</select></div>
        <div class="field"><label>Attendance</label><select id="fm-attendance"><option value="">--</option>${ratingOptions(n.attendance_rating)}</select></div>
        <div class="field"><label>Neatness</label><select id="fm-neatness"><option value="">--</option>${ratingOptions(n.neatness)}</select></div>
        <div class="field"><label>Handwriting</label><select id="fm-handwriting"><option value="">--</option>${ratingOptions(n.handwriting)}</select></div>
        <div class="field"><label>Politeness</label><select id="fm-politeness"><option value="">--</option>${ratingOptions(n.politeness)}</select></div>
        <div class="field"><label>Initiative</label><select id="fm-initiative"><option value="">--</option>${ratingOptions(n.initiative)}</select></div>
        <div class="field"><label>Attitude to school</label><select id="fm-attitude"><option value="">--</option>${ratingOptions(n.attitude_to_school)}</select></div>
      </div>
      <div class="field"><label>Headteacher/Principal's remarks</label><input type="text" id="fm-headteacher-remark" value="${n.headteacher_remark || ''}"></div>
      <div class="field"><label>Teacher's remark</label><input type="text" id="fm-teacher-remark" value="${n.teacher_remark || ''}"></div>
      <button class="btn-gold" onclick="saveFormMasterNotes(${studentId})">Save</button>
      <div id="fm-notes-error" class="error-banner"></div>
      <div id="fm-notes-success" class="error-banner" style="background:#E8F3EA; color:#3A7D44;"></div>
    </div>`;
}

async function saveFormMasterNotes(studentId) {
  const val = (id) => document.getElementById(id).value;
  const numOrNull = (v) => v === '' ? null : Number(v);

  const payload = {
    school_id: currentSchoolId,
    student_id: studentId,
    session_id: activeSession.id,
    days_opened: numOrNull(val('fm-days-opened')),
    days_present: numOrNull(val('fm-days-present')),
    days_absent: numOrNull(val('fm-days-absent')),
    next_term_date: val('fm-next-term') || null,
    punctuality: numOrNull(val('fm-punctuality')),
    attendance_rating: numOrNull(val('fm-attendance')),
    neatness: numOrNull(val('fm-neatness')),
    handwriting: numOrNull(val('fm-handwriting')),
    politeness: numOrNull(val('fm-politeness')),
    initiative: numOrNull(val('fm-initiative')),
    attitude_to_school: numOrNull(val('fm-attitude')),
    headteacher_remark: val('fm-headteacher-remark').trim() || null,
    teacher_remark: val('fm-teacher-remark').trim() || null,
  };

  const { error } = await supabaseClient
    .from('student_term_notes').upsert(payload, { onConflict: 'student_id,session_id' });

  const errEl = document.getElementById('fm-notes-error');
  const okEl = document.getElementById('fm-notes-success');
  errEl.classList.remove('visible'); okEl.classList.remove('visible');
  if (error) { errEl.textContent = error.message; errEl.classList.add('visible'); return; }
  okEl.textContent = 'Saved.'; okEl.classList.add('visible');
  showToast('Saved');
}

async function signOutTeacher() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

loadTeacherDashboard();
