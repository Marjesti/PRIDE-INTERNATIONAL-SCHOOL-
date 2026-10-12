const DAYS = [
  { num: 1, label: 'Mon' }, { num: 2, label: 'Tue' }, { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' }, { num: 5, label: 'Fri' }, { num: 6, label: 'Sat' },
];

let currentSchoolId = null;
let ttPeriods = [];
let ttClasses = [];
let ttSubjects = [];
let ttTeachers = [];
let selectedTtClassId = null;
let ttSlots = []; // for the selected class
let selectedCell = null; // { periodId, day }
let editingPeriodId = null;

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

async function loadTimetablePage() {
  const { profile } = await requireSession();
  renderShell({ active: 'timetable', profile });
  currentSchoolId = profile.school_id;

  const [{ data: periods }, { data: classes }, { data: subjects }, { data: teachers }] = await Promise.all([
    supabaseClient.from('timetable_periods').select('id, label, start_time, end_time, sort_order, is_break').eq('school_id', currentSchoolId).order('sort_order'),
    supabaseClient.from('classes').select('id, name, section').eq('school_id', currentSchoolId).order('name'),
    supabaseClient.from('subjects').select('id, name, section').eq('school_id', currentSchoolId).order('name'),
    supabaseClient.from('teachers').select('id, name, employment_type, teacher_subjects ( subject_id )').eq('school_id', currentSchoolId).order('name'),
  ]);
  ttPeriods = periods || [];
  ttClasses = classes || [];
  ttSubjects = subjects || [];
  ttTeachers = teachers || [];

  renderTimetablePage();
}

function renderTimetablePage() {
  document.getElementById('page-body').innerHTML = `
    <p class="page-date">Weekly schedule</p>
    <h1 class="page-title">Timetable</h1>
    <p class="page-subtitle">Set up periods once, then build each class's weekly schedule using the subjects and teachers already assigned to them.</p>

    <div class="panel">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Step 1</p>
          <h3 class="panel-title">Periods</h3>
        </div>
        <button class="btn-gold" onclick="openPeriodForm()">+ Add period</button>
      </div>
      <div id="tt-period-list"></div>
      <div class="form-panel" id="tt-period-form">
        <div class="form-grid">
          <div class="field">
            <label for="tt-period-label">Label</label>
            <input type="text" id="tt-period-label" placeholder="e.g. Period 1, Break, Lunch">
          </div>
          <div class="field">
            <label for="tt-period-start">Start time</label>
            <input type="time" id="tt-period-start">
          </div>
          <div class="field">
            <label for="tt-period-end">End time</label>
            <input type="time" id="tt-period-end">
          </div>
          <div class="field" style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" id="tt-period-is-break" style="width:auto;">
            <label for="tt-period-is-break" style="margin:0;">This is a break/lunch period (no subject or teacher)</label>
          </div>
        </div>
        <button class="btn-gold" onclick="submitPeriodForm()">Save period</button>
        <button class="btn-outline" onclick="closePeriodForm()">Cancel</button>
        <div id="tt-period-error" class="error-banner"></div>
      </div>
    </div>

    <div class="panel">
      <p class="eyebrow">Step 2</p>
      <h3 class="panel-title">Class schedule</h3>
      <div class="field" style="max-width:320px;">
        <label for="tt-class-select">Class</label>
        <select id="tt-class-select" onchange="onTtClassChange()">
          <option value="">-- Choose a class --</option>
          ${ttClasses.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div id="tt-grid-area" style="margin-top:14px;"></div>
      <div id="tt-cell-editor"></div>
    </div>
  `;

  renderPeriodList();
}

function renderPeriodList() {
  const el = document.getElementById('tt-period-list');
  if (!ttPeriods.length) { el.innerHTML = '<div class="empty-state">No periods set up yet.</div>'; return; }

  el.innerHTML = `
    <div style="margin-top:10px;">
      ${ttPeriods.map((p) => `
        <div class="queue-row">
          <span>${p.label}${p.is_break ? ' <span class="text-muted">(break)</span>' : ''}</span>
          <span class="text-muted">${p.start_time?.slice(0, 5)} &ndash; ${p.end_time?.slice(0, 5)}</span>
          <span>
            <button class="icon-btn" style="color: var(--navy); margin-right:12px;" onclick="startEditPeriod(${p.id})">Edit</button>
            <button class="icon-btn" onclick="deletePeriod(${p.id})">Remove</button>
          </span>
        </div>
      `).join('')}
    </div>`;
}

function openPeriodForm() {
  editingPeriodId = null;
  document.getElementById('tt-period-label').value = '';
  document.getElementById('tt-period-start').value = '';
  document.getElementById('tt-period-end').value = '';
  document.getElementById('tt-period-is-break').checked = false;
  document.getElementById('tt-period-form').classList.add('open');
}

function closePeriodForm() {
  document.getElementById('tt-period-form').classList.remove('open');
}

function startEditPeriod(id) {
  const p = ttPeriods.find((x) => x.id === id);
  if (!p) return;
  editingPeriodId = id;
  document.getElementById('tt-period-label').value = p.label;
  document.getElementById('tt-period-start').value = p.start_time?.slice(0, 5) || '';
  document.getElementById('tt-period-end').value = p.end_time?.slice(0, 5) || '';
  document.getElementById('tt-period-is-break').checked = p.is_break;
  document.getElementById('tt-period-form').classList.add('open');
}

async function submitPeriodForm() {
  const errEl = document.getElementById('tt-period-error');
  errEl.classList.remove('visible');
  const label = document.getElementById('tt-period-label').value.trim();
  const start = document.getElementById('tt-period-start').value;
  const end = document.getElementById('tt-period-end').value;
  const isBreak = document.getElementById('tt-period-is-break').checked;

  if (!label || !start || !end) { errEl.textContent = 'Label, start time, and end time are all required.'; errEl.classList.add('visible'); return; }

  const payload = { label, start_time: start, end_time: end, is_break: isBreak, sort_order: editingPeriodId ? undefined : ttPeriods.length };
  const query = editingPeriodId
    ? supabaseClient.from('timetable_periods').update(payload).eq('id', editingPeriodId)
    : supabaseClient.from('timetable_periods').insert({ school_id: currentSchoolId, ...payload });

  const { error } = await query;
  if (error) { errEl.textContent = error.message; errEl.classList.add('visible'); return; }

  showToast(editingPeriodId ? 'Updated' : 'Saved');
  closePeriodForm();
  await loadTimetablePage();
  if (selectedTtClassId) { document.getElementById('tt-class-select').value = selectedTtClassId; await onTtClassChange(); }
}

async function deletePeriod(id) {
  if (!confirm('Remove this period? Any class slots using it will be cleared too.')) return;
  const { error } = await supabaseClient.from('timetable_periods').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  showToast('Deleted');
  await loadTimetablePage();
}

async function onTtClassChange() {
  selectedTtClassId = document.getElementById('tt-class-select').value;
  document.getElementById('tt-cell-editor').innerHTML = '';
  selectedCell = null;
  const gridArea = document.getElementById('tt-grid-area');
  if (!selectedTtClassId) { gridArea.innerHTML = ''; return; }

  gridArea.innerHTML = '<div class="empty-state">Loading...</div>';
  const { data: slots } = await supabaseClient
    .from('timetable_slots')
    .select('id, period_id, day_of_week, subject_id, teacher_id, subjects ( name ), teachers ( name )')
    .eq('class_id', selectedTtClassId);
  ttSlots = slots || [];

  renderTtGrid();
}

function findSlot(periodId, day) {
  return ttSlots.find((s) => s.period_id === periodId && s.day_of_week === day);
}

function renderTtGrid() {
  const gridArea = document.getElementById('tt-grid-area');
  if (!ttPeriods.length) { gridArea.innerHTML = '<div class="empty-state">Set up at least one period above first.</div>'; return; }

  const rows = ttPeriods.map((p) => {
    if (p.is_break) {
      return `<tr><td>${p.label}</td><td colspan="6" class="timetable-break-cell">${p.label} &middot; ${p.start_time?.slice(0, 5)}-${p.end_time?.slice(0, 5)}</td></tr>`;
    }
    const cells = DAYS.map((d) => {
      const slot = findSlot(p.id, d.num);
      const isSelected = selectedCell && selectedCell.periodId === p.id && selectedCell.day === d.num;
      const content = slot && slot.subject_id
        ? `<div class="timetable-cell-subject">${slot.subjects?.name || ''}</div><div class="timetable-cell-teacher">${slot.teachers?.name || ''}</div>`
        : `<div class="timetable-cell-empty">+ Add</div>`;
      return `<td class="timetable-cell ${isSelected ? 'timetable-cell-selected' : ''}" onclick="selectTtCell(${p.id}, ${d.num})">${content}</td>`;
    }).join('');
    return `<tr><td>${p.label}<br><span class="text-muted" style="font-size:11px;">${p.start_time?.slice(0, 5)}-${p.end_time?.slice(0, 5)}</span></td>${cells}</tr>`;
  }).join('');

  gridArea.innerHTML = `
    <div class="data-table-wrap"><table class="data-table timetable-grid">
      <thead><tr><th>Period</th>${DAYS.map((d) => `<th>${d.label}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function selectTtCell(periodId, day) {
  selectedCell = { periodId, day };
  renderTtGrid();
  renderCellEditor();
}

function renderCellEditor() {
  const el = document.getElementById('tt-cell-editor');
  if (!selectedCell) { el.innerHTML = ''; return; }

  const period = ttPeriods.find((p) => p.id === selectedCell.periodId);
  const cls = ttClasses.find((c) => String(c.id) === String(selectedTtClassId));
  const slot = findSlot(selectedCell.periodId, selectedCell.day);
  const dayLabel = DAYS.find((d) => d.num === selectedCell.day)?.label;

  const subjectsForSection = ttSubjects.filter((s) => !s.section || s.section === cls?.section);
  const subjectOptions = subjectsForSection.map((s) => `<option value="${s.id}" ${slot?.subject_id === s.id ? 'selected' : ''}>${s.name}</option>`).join('');

  el.innerHTML = `
    <div class="panel" style="margin-top:14px; background:#F8F5EE;">
      <p class="eyebrow">${dayLabel} &middot; ${period?.label}</p>
      <h3 class="panel-title">Assign this slot</h3>
      <div class="form-grid">
        <div class="field">
          <label for="tt-cell-subject">Subject</label>
          <select id="tt-cell-subject" onchange="onTtCellSubjectChange()">
            <option value="">-- No subject --</option>
            ${subjectOptions}
          </select>
        </div>
        <div class="field">
          <label for="tt-cell-teacher">Teacher</label>
          <select id="tt-cell-teacher">
            <option value="">-- Choose after selecting a subject --</option>
          </select>
        </div>
      </div>
      <button class="btn-gold" onclick="saveTtCell()">Save slot</button>
      ${slot ? `<button class="btn-outline" onclick="clearTtCell(${slot.id})">Clear slot</button>` : ''}
      <button class="btn-outline" onclick="selectedCell = null; document.getElementById('tt-cell-editor').innerHTML=''; renderTtGrid();">Close</button>
      <div id="tt-cell-error" class="error-banner"></div>
    </div>`;

  if (slot?.subject_id) { onTtCellSubjectChange(slot.teacher_id); }
}

function onTtCellSubjectChange(preselectTeacherId) {
  const subjectId = Number(document.getElementById('tt-cell-subject').value) || null;
  const teacherSelect = document.getElementById('tt-cell-teacher');
  if (!subjectId) { teacherSelect.innerHTML = '<option value="">-- Choose after selecting a subject --</option>'; return; }

  const matchingTeachers = ttTeachers.filter((t) => (t.teacher_subjects || []).some((ts) => ts.subject_id === subjectId));
  const pool = matchingTeachers.length ? matchingTeachers : ttTeachers; // fall back to all teachers if none are pre-assigned to this subject

  teacherSelect.innerHTML = `
    <option value="">-- No teacher yet --</option>
    ${pool.map((t) => `<option value="${t.id}" ${preselectTeacherId === t.id ? 'selected' : ''}>${t.name}${t.employment_type ? ` (${t.employment_type})` : ''}</option>`).join('')}
  `;
}

async function saveTtCell() {
  const errEl = document.getElementById('tt-cell-error');
  errEl.classList.remove('visible');

  const subjectId = document.getElementById('tt-cell-subject').value || null;
  const teacherId = document.getElementById('tt-cell-teacher').value || null;
  const existing = findSlot(selectedCell.periodId, selectedCell.day);

  const payload = {
    school_id: currentSchoolId,
    class_id: selectedTtClassId,
    period_id: selectedCell.periodId,
    day_of_week: selectedCell.day,
    subject_id: subjectId,
    teacher_id: teacherId,
  };

  const query = existing
    ? supabaseClient.from('timetable_slots').update(payload).eq('id', existing.id)
    : supabaseClient.from('timetable_slots').insert(payload);

  const { error } = await query;
  if (error) {
    if (error.code === '23505') {
      errEl.textContent = 'That teacher is already booked for another class at this exact day and period.';
    } else {
      errEl.textContent = error.message;
    }
    errEl.classList.add('visible');
    return;
  }

  showToast('Saved');
  selectedCell = null;
  document.getElementById('tt-cell-editor').innerHTML = '';
  await onTtClassChange();
}

async function clearTtCell(slotId) {
  const { error } = await supabaseClient.from('timetable_slots').delete().eq('id', slotId);
  if (error) { alert(error.message); return; }
  showToast('Deleted');
  selectedCell = null;
  document.getElementById('tt-cell-editor').innerHTML = '';
  await onTtClassChange();
}

loadTimetablePage();
