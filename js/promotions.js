const PROMOTION_THRESHOLD = 35;

let currentSchoolId = null;
let promoClasses = [];
let promoSessions = [];
let selectedPromoClassId = null;
let selectedPromoSessionId = null;
let promoCheckResult = null; // { blocked, blockedDetail, eligible: [], review: [], alreadyDecided: {} }
let promoTargetClassId = null;

async function loadPromotionsPage() {
  const { profile } = await requireSession();
  renderShell({ active: 'promotions', profile });
  currentSchoolId = profile.school_id;

  const [{ data: classes }, { data: sessions }] = await Promise.all([
    supabaseClient.from('classes').select('id, name, section, next_class_id').eq('school_id', currentSchoolId).order('promotion_order', { ascending: true, nullsFirst: false }),
    supabaseClient.from('academic_sessions').select('id, year_label, term, is_active').eq('school_id', currentSchoolId).order('created_at', { ascending: false }),
  ]);
  promoClasses = classes || [];
  promoSessions = sessions || [];
  const active = promoSessions.find((s) => s.is_active);
  selectedPromoSessionId = active ? active.id : (promoSessions[0]?.id || null);

  renderPromotionsPage();
  await loadPromotionHistory();
}

function renderPromotionsPage() {
  document.getElementById('page-body').innerHTML = `
    <p class="page-date">End of term</p>
    <h1 class="page-title">Promotions</h1>
    <p class="page-subtitle">Promote a class to the next level once every result for the term is published. Students averaging ${PROMOTION_THRESHOLD}% or above are promoted automatically; anything below needs your decision.</p>

    <div class="panel">
      <p class="eyebrow">Step 1</p>
      <h3 class="panel-title">Choose a class and session</h3>
      <div class="form-grid">
        <div class="field">
          <label for="promo-class-select">Class</label>
          <select id="promo-class-select" onchange="onPromoSelectionChange()">
            <option value="">-- Choose a class --</option>
            ${promoClasses.map((c) => `<option value="${c.id}">${c.name}${c.section ? ` (${c.section})` : ''}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="promo-session-select">Session (promoting FROM)</label>
          <select id="promo-session-select" onchange="onPromoSelectionChange()">
            ${promoSessions.map((s) => `<option value="${s.id}" ${s.id === selectedPromoSessionId ? 'selected' : ''}>${s.year_label} &middot; ${s.term}${s.is_active ? ' (active)' : ''}</option>`).join('')}
          </select>
        </div>
      </div>
      <button class="btn-gold" onclick="checkClassForPromotion()">Check class</button>
    </div>

    <div id="promo-results-area"></div>

    <div class="panel">
      <p class="eyebrow">Audit trail</p>
      <h3 class="panel-title">Promotion history</h3>
      <div id="promo-history-area"><div class="empty-state">Loading...</div></div>
    </div>
  `;
}

function onPromoSelectionChange() {
  selectedPromoClassId = document.getElementById('promo-class-select').value || null;
  selectedPromoSessionId = document.getElementById('promo-session-select').value || null;
  document.getElementById('promo-results-area').innerHTML = '';
  promoCheckResult = null;
}

async function checkClassForPromotion() {
  selectedPromoClassId = document.getElementById('promo-class-select').value;
  selectedPromoSessionId = document.getElementById('promo-session-select').value;
  const areaEl = document.getElementById('promo-results-area');

  if (!selectedPromoClassId || !selectedPromoSessionId) {
    areaEl.innerHTML = `<div class="panel"><div class="empty-state">Choose a class and a session first.</div></div>`;
    return;
  }

  areaEl.innerHTML = `<div class="panel"><div class="empty-state">Checking...</div></div>`;

  const { data: students } = await supabaseClient
    .from('students').select('id, name, admission_no')
    .eq('class_id', selectedPromoClassId).order('name');
  const classStudents = students || [];

  if (!classStudents.length) {
    areaEl.innerHTML = `<div class="panel"><div class="empty-state">This class has no students.</div></div>`;
    return;
  }

  const studentIds = classStudents.map((s) => s.id);
  const { data: results } = await supabaseClient
    .from('results').select('student_id, total_score, status')
    .eq('session_id', selectedPromoSessionId).in('student_id', studentIds);
  const allResults = results || [];

  const unpublished = allResults.filter((r) => r.status !== 'published');
  if (unpublished.length) {
    const affectedStudents = new Set(unpublished.map((r) => r.student_id)).size;
    promoCheckResult = { blocked: true };
    areaEl.innerHTML = `
      <div class="panel">
        <div class="error-banner visible" style="background:#FBEAEA; color:#A33A3A;">
          Promotion is blocked: ${unpublished.length} result(s) across ${affectedStudents} student(s) in this class are not yet published for this session.
          Publish every result in <a href="results-queue.html">Results Queue</a> first, then come back and check this class again.
        </div>
      </div>`;
    return;
  }

  // Already-decided students for this session (promotions is append-only, unique per student+session)
  const { data: existingDecisions } = await supabaseClient
    .from('promotions').select('student_id, decision, to_class_id')
    .eq('session_id', selectedPromoSessionId).in('student_id', studentIds);
  const decidedById = {};
  (existingDecisions || []).forEach((d) => { decidedById[d.student_id] = d; });

  const bySubject = {};
  allResults.forEach((r) => {
    if (r.total_score === null || r.total_score === undefined) return;
    if (!bySubject[r.student_id]) bySubject[r.student_id] = [];
    bySubject[r.student_id].push(Number(r.total_score));
  });

  const eligible = [];
  const review = [];
  classStudents.forEach((s) => {
    const scores = bySubject[s.id] || [];
    const average = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const entry = { ...s, average, decided: decidedById[s.id] || null };
    if (average !== null && average >= PROMOTION_THRESHOLD) eligible.push(entry);
    else review.push(entry);
  });

  promoCheckResult = { blocked: false, eligible, review };

  const cls = promoClasses.find((c) => String(c.id) === String(selectedPromoClassId));
  promoTargetClassId = cls?.next_class_id || null;

  renderPromoCheckResult(cls);
}

function renderPromoCheckResult(cls) {
  const areaEl = document.getElementById('promo-results-area');
  const { eligible, review } = promoCheckResult;

  const targetOptions = promoClasses
    .filter((c) => String(c.id) !== String(selectedPromoClassId))
    .map((c) => `<option value="${c.id}" ${String(c.id) === String(promoTargetClassId) ? 'selected' : ''}>${c.name}${c.section ? ` (${c.section})` : ''}</option>`).join('');

  const eligibleRows = eligible.map((s) => `
    <div class="queue-row">
      <span>${s.name}${s.decided ? ` <span class="text-muted">&mdash; already ${s.decided.decision}</span>` : ''}</span>
      <span class="text-muted">Avg ${s.average.toFixed(1)}%</span>
    </div>`).join('') || '<div class="empty-state">No students meet the automatic threshold.</div>';

  const reviewRows = review.map((s) => `
    <div class="queue-row">
      <span>${s.name}</span>
      <span class="text-muted">${s.average !== null ? `Avg ${s.average.toFixed(1)}%` : 'No scored results'}</span>
      ${s.decided
        ? `<span class="text-muted">Already ${s.decided.decision}</span>`
        : `<span>
             <button class="icon-btn" style="color: var(--navy); margin-right:12px;" onclick="decideManualStudent(${s.id}, 'promoted')">Promote</button>
             <button class="icon-btn" onclick="decideManualStudent(${s.id}, 'retained')">Retain</button>
           </span>`}
    </div>`).join('') || '<div class="empty-state">No students need manual review.</div>';

  areaEl.innerHTML = `
    <div class="panel">
      <p class="eyebrow">Step 2</p>
      <h3 class="panel-title">Promote to</h3>
      <div class="field" style="max-width:320px;">
        <label for="promo-target-class">Target class</label>
        <select id="promo-target-class" onchange="promoTargetClassId = this.value">
          <option value="">-- Choose target class --</option>
          ${targetOptions}
        </select>
      </div>
    </div>

    <div class="panel">
      <p class="eyebrow">${eligible.length} student(s) &middot; average &ge; ${PROMOTION_THRESHOLD}%</p>
      <h3 class="panel-title">Will be promoted automatically</h3>
      <div style="margin:10px 0;">${eligibleRows}</div>
      <button class="btn-gold" onclick="confirmAutoPromotions()">Confirm automatic promotions</button>
    </div>

    <div class="panel">
      <p class="eyebrow">${review.length} student(s) &middot; average below ${PROMOTION_THRESHOLD}%</p>
      <h3 class="panel-title">Needs your decision</h3>
      <div>${reviewRows}</div>
    </div>
  `;
}

async function confirmAutoPromotions() {
  const targetSelect = document.getElementById('promo-target-class');
  const targetClassId = targetSelect.value;
  if (!targetClassId) { alert('Choose a target class first.'); return; }

  const { eligible } = promoCheckResult;
  const toPromote = eligible.filter((s) => !s.decided);
  if (!toPromote.length) { alert('Nothing left to promote in this group.'); return; }

  const { data: { session } } = await supabaseClient.auth.getSession();
  const rows = toPromote.map((s) => ({
    school_id: currentSchoolId,
    student_id: s.id,
    from_class_id: selectedPromoClassId,
    to_class_id: targetClassId,
    session_id: selectedPromoSessionId,
    average: s.average,
    decision: 'promoted',
    decision_type: 'automatic',
    decided_by: session.user.id,
  }));

  const { error: logError } = await supabaseClient.from('promotions').insert(rows);
  if (logError) { alert('Could not record the promotion: ' + logError.message); return; }

  await supabaseClient.from('students').update({ class_id: targetClassId }).in('id', toPromote.map((s) => s.id));

  showToast('Promoted');
  await checkClassForPromotion();
  await loadPromotionHistory();
}

async function decideManualStudent(studentId, decision) {
  const targetSelect = document.getElementById('promo-target-class');
  const targetClassId = targetSelect.value;
  if (decision === 'promoted' && !targetClassId) { alert('Choose a target class first.'); return; }

  const student = promoCheckResult.review.find((s) => s.id === studentId);
  const { data: { session } } = await supabaseClient.auth.getSession();

  const { error: logError } = await supabaseClient.from('promotions').insert({
    school_id: currentSchoolId,
    student_id: studentId,
    from_class_id: selectedPromoClassId,
    to_class_id: decision === 'promoted' ? targetClassId : selectedPromoClassId,
    session_id: selectedPromoSessionId,
    average: student?.average ?? null,
    decision,
    decision_type: 'manual',
    decided_by: session.user.id,
  });
  if (logError) { alert('Could not record the decision: ' + logError.message); return; }

  if (decision === 'promoted') {
    await supabaseClient.from('students').update({ class_id: targetClassId }).eq('id', studentId);
  }

  showToast(decision === 'promoted' ? 'Promoted' : 'Retained');
  await checkClassForPromotion();
  await loadPromotionHistory();
}

async function loadPromotionHistory() {
  const areaEl = document.getElementById('promo-history-area');
  if (!areaEl) return;

  const { data } = await supabaseClient
    .from('promotions')
    .select('id, average, decision, decision_type, decided_at, students ( name ), from_class:classes!promotions_from_class_id_fkey ( name ), to_class:classes!promotions_to_class_id_fkey ( name ), academic_sessions ( year_label, term )')
    .order('decided_at', { ascending: false })
    .limit(100);

  const rows = (data || []).map((p) => `
    <tr>
      <td>${p.students?.name || 'Unknown'}</td>
      <td class="text-muted">${p.from_class?.name || '--'} &rarr; ${p.to_class?.name || '--'}</td>
      <td class="text-muted">${p.academic_sessions ? `${p.academic_sessions.year_label} ${p.academic_sessions.term}` : '--'}</td>
      <td>${p.average !== null ? p.average.toFixed(1) + '%' : '--'}</td>
      <td>${p.decision === 'promoted' ? '<span style="color:#3A7D44; font-weight:600;">Promoted</span>' : '<span style="color:#8A6D1D; font-weight:600;">Retained</span>'}</td>
      <td class="text-muted">${p.decision_type}</td>
    </tr>`).join('');

  areaEl.innerHTML = data && data.length
    ? `<div class="data-table-wrap"><table class="data-table">
        <thead><tr><th>Student</th><th>Class change</th><th>Session</th><th>Average</th><th>Decision</th><th>Type</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`
    : '<div class="empty-state">No promotion decisions recorded yet.</div>';
}

loadPromotionsPage();
