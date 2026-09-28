let currentSchoolId = null;
let chartInstances = [];

async function loadAnalyticsPage() {
  const { profile } = await requireSession();
  renderShell({ active: 'analytics', profile });
  currentSchoolId = profile.school_id;

  const { data: sessions } = await supabaseClient
    .from('academic_sessions')
    .select('id, year_label, term, is_active, created_at')
    .eq('school_id', currentSchoolId)
    .order('created_at', { ascending: true });

  const activeSession = (sessions || []).find((s) => s.is_active);

  if (!activeSession) {
    document.getElementById('page-body').innerHTML = `
      <p class="page-date">Academic health</p>
      <h1 class="page-title">Analytics</h1>
      <div class="panel">
        <div class="empty-state">
          No active academic session is set. Go to <a href="academics.html">Academics</a>
          and mark a session as active to see analytics here.
        </div>
      </div>
    `;
    return;
  }

  const sessionIds = (sessions || []).map((s) => s.id);

  const [{ data: results }, { data: notes }] = await Promise.all([
    supabaseClient.from('results')
      .select('total_score, status, session_id, subjects ( name )')
      .eq('school_id', currentSchoolId).in('session_id', sessionIds),
    supabaseClient.from('student_term_notes')
      .select('session_id, days_opened, days_present')
      .eq('school_id', currentSchoolId).in('session_id', sessionIds),
  ]);

  renderAnalyticsBody(activeSession, sessions || [], results || [], notes || []);
}

function sessionLabel(s) {
  return `${s.term?.replace(' Term', '') || s.term} ${s.year_label || ''}`.trim();
}

function renderAnalyticsBody(session, sessions, allResults, allNotes) {
  const scored = allResults.filter((r) => r.session_id === session.id && r.total_score !== null && r.total_score !== undefined);
  const overallAverage = scored.length
    ? scored.reduce((sum, r) => sum + Number(r.total_score), 0) / scored.length
    : null;
  const passCount = scored.filter((r) => Number(r.total_score) >= 40).length;
  const passRate = scored.length ? Math.round((passCount / scored.length) * 100) : null;

  // Group current session by subject
  const bySubject = {};
  scored.forEach((r) => {
    const name = r.subjects?.name || 'Unassigned';
    if (!bySubject[name]) bySubject[name] = [];
    bySubject[name].push(Number(r.total_score));
  });
  const subjectAverages = Object.entries(bySubject).map(([name, scores]) => ({
    name,
    average: scores.reduce((a, b) => a + b, 0) / scores.length,
  })).sort((a, b) => b.average - a.average);

  let focusHtml = '<div class="empty-state">Add results to see insights here.</div>';
  if (subjectAverages.length && overallAverage !== null) {
    const strongest = subjectAverages[0];
    const belowAverage = subjectAverages.filter((s) => s.average < overallAverage - 5);
    const items = [];
    items.push(`
      <div class="queue-row">
        <span><span class="queue-dot" style="background:#3A7D44"></span>${strongest.name}</span>
        <span class="text-muted">Strongest subject &mdash; ${strongest.average.toFixed(1)}%</span>
      </div>`);
    belowAverage.forEach((s) => {
      items.push(`
        <div class="queue-row">
          <span><span class="queue-dot" style="background:#C97B3D"></span>${s.name}</span>
          <span class="text-muted">${(overallAverage - s.average).toFixed(1)} points below average</span>
        </div>`);
    });
    focusHtml = items.join('');
  }

  // ---- Cross-term trend: overall average per session, in order ----
  const trendSessions = sessions.filter((s) => allResults.some((r) => r.session_id === s.id));
  const trendAverages = trendSessions.map((s) => {
    const rows = allResults.filter((r) => r.session_id === s.id && r.total_score !== null && r.total_score !== undefined);
    return rows.length ? rows.reduce((sum, r) => sum + Number(r.total_score), 0) / rows.length : null;
  });

  // ---- Attendance trend: attendance rate (%) per session, from student_term_notes ----
  const attendanceSessions = sessions.filter((s) => allNotes.some((n) => n.session_id === s.id && n.days_opened));
  const attendanceRates = attendanceSessions.map((s) => {
    const rows = allNotes.filter((n) => n.session_id === s.id && n.days_opened);
    const totalOpened = rows.reduce((sum, n) => sum + Number(n.days_opened || 0), 0);
    const totalPresent = rows.reduce((sum, n) => sum + Number(n.days_present || 0), 0);
    return totalOpened ? (totalPresent / totalOpened) * 100 : null;
  });
  const currentAttendanceRows = allNotes.filter((n) => n.session_id === session.id && n.days_opened);
  const currentAttendanceRate = currentAttendanceRows.length
    ? (currentAttendanceRows.reduce((sum, n) => sum + Number(n.days_present || 0), 0) /
       currentAttendanceRows.reduce((sum, n) => sum + Number(n.days_opened || 0), 0)) * 100
    : null;

  document.getElementById('page-body').innerHTML = `
    <p class="page-date">${session.year_label} &middot; ${session.term}</p>
    <h1 class="page-title">Analytics</h1>
    <p class="page-subtitle">Patterns worth noticing across the current academic session &mdash; and how they compare over time.</p>

    <div class="stat-grid">
      <div class="stat-card">
        <p class="stat-label">Current session average</p>
        <div class="stat-value">${overallAverage !== null ? overallAverage.toFixed(1) + '%' : '&mdash;'}</div>
      </div>
      <div class="stat-card">
        <p class="stat-label">Pass rate</p>
        <div class="stat-value">${passRate !== null ? passRate + '%' : '&mdash;'}</div>
      </div>
      <div class="stat-card">
        <p class="stat-label">Attendance rate</p>
        <div class="stat-value">${currentAttendanceRate !== null ? currentAttendanceRate.toFixed(1) + '%' : '&mdash;'}</div>
        <p class="stat-sub">${currentAttendanceRows.length ? 'From attendance &amp; remarks records' : 'No attendance records yet this term'}</p>
      </div>
    </div>

    <div class="panel">
      <p class="eyebrow">By subject &mdash; current session</p>
      <h3 class="panel-title">Average score</h3>
      ${subjectAverages.length ? '<canvas id="subject-bar-chart" height="90"></canvas>' : '<div class="empty-state">No scored results yet for this session.</div>'}
    </div>

    <div class="panel">
      <p class="eyebrow">Across terms</p>
      <h3 class="panel-title">Performance trend</h3>
      ${trendAverages.filter((a) => a !== null).length >= 2
        ? '<canvas id="performance-trend-chart" height="90"></canvas>'
        : '<div class="empty-state">Add results across more than one term to see a trend line here.</div>'}
    </div>

    <div class="panel">
      <p class="eyebrow">Across terms</p>
      <h3 class="panel-title">Attendance trend</h3>
      ${attendanceRates.filter((a) => a !== null).length >= 1
        ? '<canvas id="attendance-trend-chart" height="90"></canvas>'
        : '<div class="empty-state">Add attendance figures on the Academics page (Attendance, behaviour &amp; remarks) to see this chart.</div>'}
    </div>

    <div class="panel">
      <p class="eyebrow">A closer look</p>
      <h3 class="panel-title">Where to focus next</h3>
      ${focusHtml}
    </div>
  `;

  renderCharts({
    subjectAverages,
    trendSessions, trendAverages,
    attendanceSessions, attendanceRates,
  });
}

function renderCharts({ subjectAverages, trendSessions, trendAverages, attendanceSessions, attendanceRates }) {
  // Destroy any existing chart instances before re-rendering (page can reload data)
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];

  const navy = getComputedStyle(document.documentElement).getPropertyValue('--navy').trim() || '#008B8B';
  const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#00F5FF';

  const subjectCanvas = document.getElementById('subject-bar-chart');
  if (subjectCanvas && subjectAverages.length) {
    chartInstances.push(new Chart(subjectCanvas, {
      type: 'bar',
      data: {
        labels: subjectAverages.map((s) => s.name),
        datasets: [{
          label: 'Average score (%)',
          data: subjectAverages.map((s) => Number(s.average.toFixed(1))),
          backgroundColor: navy,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    }));
  }

  const trendCanvas = document.getElementById('performance-trend-chart');
  if (trendCanvas) {
    chartInstances.push(new Chart(trendCanvas, {
      type: 'line',
      data: {
        labels: trendSessions.map(sessionLabel),
        datasets: [{
          label: 'Average score (%)',
          data: trendAverages.map((a) => a === null ? null : Number(a.toFixed(1))),
          borderColor: navy,
          backgroundColor: navy,
          tension: 0.3,
          spanGaps: true,
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    }));
  }

  const attendanceCanvas = document.getElementById('attendance-trend-chart');
  if (attendanceCanvas) {
    chartInstances.push(new Chart(attendanceCanvas, {
      type: 'bar',
      data: {
        labels: attendanceSessions.map(sessionLabel),
        datasets: [{
          label: 'Attendance rate (%)',
          data: attendanceRates.map((a) => a === null ? null : Number(a.toFixed(1))),
          backgroundColor: gold,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    }));
  }
}

loadAnalyticsPage();
