let currentSchoolId = null;
let activeSession = null;
let currentStudents = [];
let currentSubjects = [];
let currentClasses = [];
let currentFilter = 'all';
let currentResults = [];
let editingResultId = null;

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

async function loadResultsQueuePage() {
  const { profile } = await requireSession();
  renderShell({ active: 'results-queue', profile });
  currentSchoolId = profile.school_id;

  const { data: session } = await supabaseClient
    .from('academic_sessions')
    .select('id, year_label, term')
    .eq('school_id', currentSchoolId)
    .eq('is_active', true)
    .maybeSingle();
  activeSession = session;

  if (!activeSession) {
    document.getElementById('page-body').innerHTML = `
      <p class="page-date">Results management</p>
      <h1 class="page-title">Results queue</h1>
      <div class="panel">
        <div class="empty-state">
          No active academic session is set. Go to <a href="academics.html">Academics</a>
          and mark a session as active before recording results.
        </div>
      </div>
    `;
    return;
  }

  const [{ data: students }, { data: subjects }, { data: classes }] = await Promise.all([
    supabaseClient.from('students').select('id, name, classes ( id, name, section )').eq('school_id', currentSchoolId).order('name'),
    supabaseClient.from('subjects').select('id, name, section').eq('school_id', currentSchoolId).order('name'),
    supabaseClient.from('classes').select('id, name, section').eq('school_id', currentSchoolId).order('name'),
  ]);
  currentStudents = students || [];
  currentSubjects = subjects || [];
  currentClasses = classes || [];

  await refreshResultsView();
}

async function refreshResultsView() {
  let query = supabaseClient
    .from('results')
    .select('id, ca1_score, ca2_score, ca_score, exam_score, total_score, grade, status, subject_id, students ( id, name, classes ( id, name ) ), subjects ( name )')
    .eq('school_id', currentSchoolId)
    .eq('session_id', activeSession.id)
    .order('id', { ascending: false });

  if (currentFilter !== 'all') query = query.eq('status', currentFilter);

  const { data: results } = await query;
  currentResults = results || [];
  renderResultsBody(currentResults);
}

function statusBadge(status) {
  if (status === 'published') return '<span style="color:#3A7D44; font-weight:600;">Published</span>';
  if (status === 'approved') return '<span style="color:#8A6D1D; font-weight:600;">Approved</span>';
  return '<span class="text-muted">Pending</span>';
}

function actionButtons(r) {
  const btns = [];
  if (r.status !== 'published') btns.push(`<button class="icon-btn" style="color: var(--navy);" onclick="startEditResult(${r.id})">Edit</button>`);
  if (r.status === 'pending') btns.push(`<button class="icon-btn" style="color: var(--navy);" onclick="setResultStatus(${r.id}, 'approved')">Approve</button>`);
  if (r.status === 'approved') btns.push(`<button class="icon-btn" style="color: var(--navy);" onclick="setResultStatus(${r.id}, 'published')">Publish</button>`);
  btns.push(`<button class="icon-btn" onclick="deleteResult(${r.id})">Remove</button>`);
  return btns.join(' &middot; ');
}

function resultRowHtml(r) {
  return `
    <tr>
      <td>${r.students?.name || 'Unknown'}</td>
      <td>${r.ca1_score ?? '&mdash;'}</td>
      <td>${r.ca2_score ?? '&mdash;'}</td>
      <td>${r.ca_score ?? '&mdash;'}</td>
      <td>${r.exam_score ?? '&mdash;'}</td>
      <td><strong>${r.total_score ?? '&mdash;'}</strong>${r.grade ? ` (${r.grade})` : ''}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${actionButtons(r)}</td>
    </tr>`;
}

function subjectSubsectionHtml(subjectName, results) {
  const rows = results.length
    ? results.map(resultRowHtml).join('')
    : '';
  if (!results.length) return '';

  return `
    <div style="margin-bottom: 20px;">
      <p style="font-weight:600; font-size:14.5px; margin: 0 0 8px;">${subjectName}</p>
      <div class="data-table-wrap"><table class="data-table markbook-table">
        <thead><tr><th>Student</th><th>CA1</th><th>CA2</th><th>CA Total</th><th>Exam</th><th>Final</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </div>`;
}

function classGroupHtml(className, resultsInClass) {
  if (!resultsInClass.length) return '';

  // Group this class's results by subject
  const bySubject = {};
  resultsInClass.forEach((r) => {
    const name = r.subjects?.name || 'Unassigned subject';
    if (!bySubject[name]) bySubject[name] = [];
    bySubject[name].push(r);
  });

  const subjectsHtml = Object.keys(bySubject).sort().map((name) => subjectSubsectionHtml(name, bySubject[name])).join('');

  return `
    <div class="panel">
      <p class="eyebrow">${resultsInClass.length} result${resultsInClass.length === 1 ? '' : 's'}</p>
      <h3 class="panel-title">${className}</h3>
      ${subjectsHtml}
    </div>`;
}

function renderResultsBody(results) {
  const studentOptions = currentStudents.map((s) => `<option value="${s.id}">${s.name}${s.classes?.name ? ' (' + s.classes.name + ')' : ''}</option>`).join('');

  // Group results by class, in class-name order; results with no class go in "Unassigned" at the end.
  const groupsHtml = currentClasses.map((c) => {
    const resultsInClass = results.filter((r) => r.students?.classes?.id === c.id);
    return classGroupHtml(c.name, resultsInClass);
  }).join('');

  const unassignedResults = results.filter((r) => !r.students?.classes?.id);
  const unassignedHtml = classGroupHtml('Unassigned', unassignedResults);

  const noDataHtml = !results.length
    ? `<div class="panel"><div class="empty-state">No results here yet.</div></div>` : '';

  const filterTab = (key, label) => `
    <button class="btn-outline" style="${currentFilter === key ? 'background: var(--navy); color:#fff; border-color: var(--navy);' : ''}"
      onclick="setFilter('${key}')">${label}</button>`;

  document.getElementById('page-body').innerHTML = `
    <p class="page-date">${activeSession.year_label} &middot; ${activeSession.term}</p>
    <h1 class="page-title">Results queue</h1>
    <p class="page-subtitle">Results are grouped by class, then by subject.</p>

    <div class="panel">
      <div class="panel-toolbar">
        <button class="btn-gold" onclick="openRecordResultForm()">+ Record result</button>
      </div>

      <div id="result-form" class="form-panel">
        <div class="form-grid">
          <div class="field">
            <label for="result-student">Student</label>
            <select id="result-student" onchange="onResultStudentChange()">
              <option value="">-- Choose a student --</option>
              ${studentOptions}
            </select>
          </div>
          <div class="field">
            <label for="result-subject">Subject</label>
            <select id="result-subject"><option value="">Select a student first</option></select>
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
            <input type="number" id="result-exam" min="0" max="70" placeholder="e.g. 60">
          </div>
        </div>
        <p class="text-muted" style="font-size:12px; margin-top:-8px;">CA1 + CA2 together must not exceed 30. Enter one now and add the other later &mdash; both save independently.</p>
        <button class="btn-gold" id="result-form-submit-btn" onclick="submitNewResult()">${editingResultId ? 'Save changes' : 'Save result'}</button>
        ${editingResultId ? `<button class="btn-outline" onclick="cancelEditResult()">Cancel</button>` : ''}
      </div>

      <div id="form-error" class="error-banner"></div>

      <div class="panel-toolbar">
        ${filterTab('all', 'All')}
        ${filterTab('pending', 'Pending')}
        ${filterTab('approved', 'Approved')}
        ${filterTab('published', 'Published')}
      </div>
    </div>

    ${noDataHtml}
    ${groupsHtml}
    ${unassignedHtml}
  `;
}

function onResultStudentChange() {
  const studentId = document.getElementById('result-student').value;
  const subjectSelect = document.getElementById('result-subject');
  if (!studentId) { subjectSelect.innerHTML = '<option value="">Select a student first</option>'; return; }

  const student = currentStudents.find((s) => String(s.id) === String(studentId));
  const classSection = student?.classes?.section || null;

  // Only show subjects that belong to this student's section (or have no
  // section set at all), so pre-nursery/primary students aren't offered
  // subjects that only apply to older sections, and vice versa.
  const subjectsForSection = currentSubjects.filter((s) => !s.section || s.section === classSection);
  subjectSelect.innerHTML = subjectsForSection.length
    ? subjectsForSection.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')
    : '<option value="">No matching subjects for this section</option>';
}

function openRecordResultForm() {
  editingResultId = null;
  document.getElementById('result-student').value = '';
  document.getElementById('result-subject').innerHTML = '<option value="">Select a student first</option>';
  document.getElementById('result-ca1').value = '';
  document.getElementById('result-ca2').value = '';
  document.getElementById('result-exam').value = '';
  document.getElementById('result-form').classList.add('open');
}

function startEditResult(id) {
  const r = currentResults.find((x) => x.id === id);
  if (!r) return;
  editingResultId = id;
  renderResultsBody(currentResults);

  setTimeout(() => {
    document.getElementById('result-student').value = r.students?.id ?? '';
    onResultStudentChange();
    document.getElementById('result-subject').value = r.subject_id;
    document.getElementById('result-ca1').value = r.ca1_score ?? '';
    document.getElementById('result-ca2').value = r.ca2_score ?? '';
    document.getElementById('result-exam').value = r.exam_score ?? '';
    document.getElementById('result-form').classList.add('open');
    document.getElementById('result-form').scrollIntoView({ behavior: 'smooth' });
  }, 0);
}

function cancelEditResult() {
  editingResultId = null;
  renderResultsBody(currentResults);
}

function showFormError(message) {
  const el = document.getElementById('form-error');
  el.textContent = message;
  el.classList.add('visible');
}

function setFilter(key) {
  currentFilter = key;
  refreshResultsView();
}

async function submitNewResult() {
  const studentId = document.getElementById('result-student').value;
  const subjectId = document.getElementById('result-subject').value;
  const ca1 = document.getElementById('result-ca1').value;
  const ca2 = document.getElementById('result-ca2').value;
  const exam = document.getElementById('result-exam').value;

  if (!studentId || !subjectId) { showFormError('Please choose a student and a subject.'); return; }

  const ca1Score = ca1 === '' ? null : Number(ca1);
  const ca2Score = ca2 === '' ? null : Number(ca2);
  const examScore = exam === '' ? null : Number(exam);

  if (ca1Score !== null && (ca1Score < 0 || ca1Score > 30)) { showFormError('CA1 score must be between 0 and 30.'); return; }
  if (ca2Score !== null && (ca2Score < 0 || ca2Score > 30)) { showFormError('CA2 score must be between 0 and 30.'); return; }
  if ((ca1Score ?? 0) + (ca2Score ?? 0) > 30) { showFormError('CA1 + CA2 together cannot exceed 30.'); return; }
  if (examScore !== null && (examScore < 0 || examScore > 70)) { showFormError('Exam score must be between 0 and 70.'); return; }

  const caTotal = (ca1Score !== null || ca2Score !== null) ? (ca1Score ?? 0) + (ca2Score ?? 0) : null;
  const total = (caTotal !== null && examScore !== null) ? caTotal + examScore : null;
  const payload = {
    ca1_score: ca1Score, ca2_score: ca2Score, ca_score: caTotal,
    exam_score: examScore, total_score: total, grade: gradeFor(total),
  };

  let error;
  if (editingResultId) {
    ({ error } = await supabaseClient.from('results').update(payload).eq('id', editingResultId));
  } else {
    ({ error } = await supabaseClient.from('results').insert({
      school_id: currentSchoolId,
      student_id: studentId,
      subject_id: subjectId,
      session_id: activeSession.id,
      status: 'pending',
      submitted_by: (await supabaseClient.auth.getSession()).data.session?.user.id,
      ...payload,
    }));
  }

  if (error) {
    if (error.code === '23505') {
      showFormError('This student already has a result for this subject in this term. Edit the existing one instead of adding a new one.');
    } else {
      showFormError(error.message);
    }
    return;
  }

  if (!editingResultId) {
    const student = currentStudents.find((s) => String(s.id) === String(studentId));
    const subject = currentSubjects.find((s) => String(s.id) === String(subjectId));
    await supabaseClient.from('notifications').insert({
      school_id: currentSchoolId,
      title: 'Result submitted for review',
      body: `${subject?.name || 'A subject'} result for ${student?.name || 'a student'} is awaiting approval.`,
    });
  }

  const wasEditing = !!editingResultId;
  editingResultId = null;
  document.getElementById('result-form').classList.remove('open');
  showToast(wasEditing ? 'Updated' : 'Saved');
  await refreshResultsView();
}

async function setResultStatus(id, status) {
  const { error } = await supabaseClient.from('results').update({ status }).eq('id', id);
  if (error) { showFormError(error.message); return; }

  const { data: { session } } = await supabaseClient.auth.getSession();
  const { data: profile } = await supabaseClient.from('profiles').select('name').eq('id', session.user.id).single();
  await supabaseClient.from('activity_log').insert({
    school_id: currentSchoolId,
    actor_id: session.user.id,
    actor_name: profile?.name || 'Unknown',
    action: status === 'approved' ? 'Approved a result' : 'Published a result',
    details: `Result #${id} marked as ${status}`,
  });

  if (status === 'published') {
    await supabaseClient.from('notifications').insert({
      school_id: currentSchoolId,
      title: 'Result published',
      body: 'A result was published and is now visible to guardians.',
    });
  }

  showToast(status === 'approved' ? 'Approved' : 'Published');
  await refreshResultsView();
}

async function deleteResult(id) {
  if (!confirm('Are you sure you want to remove this result? This cannot be undone.')) return;
  const { error } = await supabaseClient.from('results').delete().eq('id', id);
  if (error) { showFormError(error.message); return; }
  showToast('Deleted');
  await refreshResultsView();
}

loadResultsQueuePage();
