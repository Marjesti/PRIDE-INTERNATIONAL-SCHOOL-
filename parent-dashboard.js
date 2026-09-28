let currentUserId = null;
let currentSchoolId = null;
let myChildren = [];
let selectedChildId = null;

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

async function signOutParent() {
  await supabaseClient.auth.signOut();
  window.location.href = 'parent-login.html';
}

async function loadParentDashboard() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'parent-login.html'; return; }
  currentUserId = session.user.id;

  const { data: profile } = await supabaseClient
    .from('profiles').select('name, role, school_id, schools ( name, address, phone, logo_url )')
    .eq('id', session.user.id).single();

  if (!profile || profile.role !== 'guardian') {
    window.location.href = profile?.role === 'teacher' ? 'teacher-dashboard.html'
      : profile?.role === 'admin' ? 'overview.html' : 'parent-login.html';
    return;
  }

  document.getElementById('parent-name').textContent = profile.name;
  document.getElementById('school-name').textContent = profile.schools?.name || '';
  currentSchoolId = profile.school_id;

  const { data: links } = await supabaseClient
    .from('guardian_students').select('student_id, students ( id, name, admission_no, class_id, classes ( name ) )')
    .eq('profile_id', currentUserId);

  myChildren = (links || []).map((l) => l.students).filter(Boolean);
  schoolInfo = profile.schools || {};

  if (!myChildren.length) {
    document.getElementById('page-body').innerHTML = `
      <div class="panel"><div class="empty-state">No children are linked to your account yet. Contact the school to have this set up.</div></div>
    `;
    return;
  }

  selectedChildId = myChildren[0].id;
  renderParentShell();
  await loadChildResult();
}

let schoolInfo = {};

function renderParentShell() {
  document.getElementById('page-body').innerHTML = `
    <p class="page-date">Your child's results</p>
    <h1 class="page-title">Results</h1>
    ${myChildren.length > 1 ? `
      <div class="field" style="max-width:320px;">
        <label for="child-select">Child</label>
        <select id="child-select" onchange="onChildChange()">
          ${myChildren.map((c) => `<option value="${c.id}">${c.name}${c.classes?.name ? ` — ${c.classes.name}` : ''}</option>`).join('')}
        </select>
      </div>
    ` : ''}
    <div id="child-result-container" style="margin-top:16px;"></div>
  `;
}

function onChildChange() {
  selectedChildId = document.getElementById('child-select').value;
  loadChildResult();
}

async function loadChildResult() {
  const container = document.getElementById('child-result-container');
  container.innerHTML = `<div class="panel"><div class="empty-state">Loading...</div></div>`;

  const child = myChildren.find((c) => String(c.id) === String(selectedChildId));

  const { data: sessions } = await supabaseClient
    .from('academic_sessions').select('id, year_label, term, is_active')
    .eq('school_id', currentSchoolId)
    .order('created_at', { ascending: false });

  const activeSession = (sessions || []).find((s) => s.is_active);
  if (!activeSession) {
    container.innerHTML = `<div class="panel"><div class="empty-state">No active academic session yet — check back once the school opens the new term.</div></div>`;
    return;
  }

  const [{ data: results }, { data: notesRow }] = await Promise.all([
    supabaseClient.from('results')
      .select('subject_id, ca_score, exam_score, total_score, grade, status, subjects ( name )')
      .eq('student_id', child.id).eq('session_id', activeSession.id).eq('status', 'published'),
    supabaseClient.from('student_term_notes').select('*')
      .eq('student_id', child.id).eq('session_id', activeSession.id).maybeSingle(),
  ]);

  const notes = notesRow || {};
  const rows = results || [];
  const scored = rows.filter((r) => r.total_score !== null && r.total_score !== undefined);
  const total = scored.reduce((sum, r) => sum + Number(r.total_score), 0);
  const average = scored.length ? total / scored.length : null;

  container.innerHTML = `
    ${resultViewHtml(child, activeSession, rows, notes, total, average)}
    <div class="panel-toolbar" style="margin-top:12px;">
      <button class="btn-outline" onclick="window.print()">Download as PDF</button>
    </div>
    <p class="text-muted" style="font-size:12.5px; margin-top:6px;">In the print dialog, choose "Save as PDF" as the destination to download a copy.</p>
  `;
}

function resultViewHtml(student, session, rows, notes, total, average) {
  const rowsHtml = rows.length ? rows.map((r) => `
    <tr>
      <td>${r.subjects?.name || ''}</td>
      <td>${r.ca_score ?? '--'}</td>
      <td>${r.exam_score ?? '--'}</td>
      <td>${r.total_score ?? '--'}</td>
      <td>${r.grade || gradeFor(r.total_score)}</td>
    </tr>`).join('') : `<tr><td colspan="5" style="text-align:center; padding:20px;">No published results yet for this term.</td></tr>`;

  const behaviorRow = (label, field) => `
    <tr><td>${label}</td><td style="text-align:center;">${notes[field] ?? '--'}</td></tr>`;

  return `
    <div class="report-card" data-student-id="${student.id}">
      <div class="report-header">
        <div class="report-logo"><img src="${schoolInfo.logo_url || 'assets/logo.png'}" alt="logo"></div>
        <div class="report-header-text">
          <h1>${schoolInfo.name || 'School Name'}</h1>
          ${schoolInfo.address ? `<p class="report-address">ADDRESS: ${schoolInfo.address}</p>` : ''}
          ${schoolInfo.phone ? `<p class="report-phone">Tel.: ${schoolInfo.phone}</p>` : ''}
        </div>
      </div>
      <h2 class="report-title">REPORT SHEET</h2>
      <div class="report-meta">
        <span><strong>NAME:</strong> ${student.name}</span>
        <span><strong>CLASS:</strong> ${student.classes?.name || ''}</span>
        <span><strong>TERM:</strong> ${session.term}</span>
        <span><strong>SESSION:</strong> ${session.year_label}</span>
      </div>

      <table class="report-table">
        <thead><tr><th>SUBJECT</th><th>C.A</th><th>EXAM</th><th>TOTAL</th><th>GRADE</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div class="report-footer-grid">
        <div class="report-panel">
          <p class="report-panel-title">BEHAVIOUR</p>
          <table class="behavior-table">
            ${behaviorRow('Punctuality', 'punctuality')}
            ${behaviorRow('Attendance', 'attendance_rating')}
            ${behaviorRow('Neatness', 'neatness')}
            ${behaviorRow('Handwriting', 'handwriting')}
            ${behaviorRow('Politeness', 'politeness')}
            ${behaviorRow('Initiative', 'initiative')}
            ${behaviorRow('Attitude to school', 'attitude_to_school')}
          </table>
          <p class="report-keys">Keys: Excellent = 5, V.Good = 4, Good = 3, Average = 2, Poor = 1</p>
        </div>

        <div class="report-panel">
          <p class="report-panel-title">SUMMARY</p>
          <table class="behavior-table">
            <tr><td>G. Total</td><td>${total || '--'}</td></tr>
            <tr><td>Average</td><td>${average !== null ? average.toFixed(1) + '%' : '--'}</td></tr>
          </table>
          <p class="report-panel-title" style="margin-top:12px;">ATTENDANCE</p>
          <table class="behavior-table">
            <tr><td>Days opened</td><td>${notes.days_opened ?? '--'}</td></tr>
            <tr><td>Days present</td><td>${notes.days_present ?? '--'}</td></tr>
            <tr><td>Days absent</td><td>${notes.days_absent ?? '--'}</td></tr>
          </table>
        </div>
      </div>

      <div class="report-remarks">
        <p><strong>Headteacher/Principal's remarks:</strong> ${notes.headteacher_remark || '_______________________________________________'}</p>
        <p><strong>Teacher's remark:</strong> ${notes.teacher_remark || '_______________________________________________'}</p>
        ${notes.next_term_date ? `<p style="margin-top:10px;"><strong>Next term begins:</strong> ${notes.next_term_date}</p>` : ''}
      </div>
    </div>
  `;
}

loadParentDashboard();
