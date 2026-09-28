let currentSchoolId = null;
let schoolName = '';
let schoolLogoUrl = '';
let schoolInfoPhone = '';
let activeSessionId = null;
let activeSessionLabel = '';

let cardKind = 'student'; // 'student' | 'teacher'
let generateFor = 'one'; // 'one' | 'class'
let allClassesForCards = [];
let cardStudents = [];   // people in the currently selected class (student mode, "whole class")
let cardTeachers = [];   // all teachers (teacher mode)
let selectedCardClassId = null;
let lastPreviewPeople = []; // whoever is currently shown in the preview, for the Print button

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

async function loadIdCardsPage() {
  const { profile } = await requireSession();
  renderShell({ active: 'id-cards', profile });
  currentSchoolId = profile.school_id;
  schoolName = profile.schools?.name || 'Your school';
  schoolLogoUrl = profile.schools?.logo_url || 'assets/logo.png';
  schoolInfoPhone = profile.schools?.phone || '';

  const [{ data: classes }, { data: sessions }] = await Promise.all([
    supabaseClient.from('classes').select('id, name').eq('school_id', currentSchoolId).order('name'),
    supabaseClient.from('academic_sessions').select('id, year_label, term, is_active').eq('school_id', currentSchoolId),
  ]);
  allClassesForCards = classes || [];
  const active = (sessions || []).find((s) => s.is_active);
  activeSessionId = active ? active.id : null;
  activeSessionLabel = active ? `${active.year_label} \u00b7 ${active.term}` : '';

  renderIdCardsPage();
}

function renderIdCardsPage() {
  document.getElementById('page-body').innerHTML = `
    <p class="page-date">Print &amp; go</p>
    <h1 class="page-title">ID Cards</h1>
    <p class="page-subtitle">Generate a student ID card individually, or a whole class at once.</p>

    <div class="panel">
      <div class="panel-toolbar" style="gap:10px;">
        <button class="${cardKind === 'student' ? 'btn-gold' : 'btn-outline'}" onclick="switchCardKind('student')">Students</button>
        <button class="${cardKind === 'teacher' ? 'btn-gold' : 'btn-outline'}" onclick="switchCardKind('teacher')">Teachers</button>
      </div>

      <div class="field" style="margin-top:14px;">
        <label for="generate-for-select">Generate for</label>
        <select id="generate-for-select" onchange="onGenerateForChange()">
          <option value="one" ${generateFor === 'one' ? 'selected' : ''}>${cardKind === 'student' ? 'One student' : 'One teacher'}</option>
          <option value="class" ${generateFor === 'class' ? 'selected' : ''}>${cardKind === 'student' ? 'Whole class' : 'All teachers'}</option>
        </select>
      </div>

      <div id="card-selection-body" style="margin-top:14px;"></div>
    </div>

    <div class="panel" id="id-card-preview-panel" style="display:none;">
      <div class="panel-header">
        <div>
          <p class="eyebrow">Preview</p>
          <h3 class="panel-title">How it will print</h3>
        </div>
        <button class="btn-gold" onclick="window.print()">Print</button>
      </div>
      <div id="id-card-preview-area"></div>
    </div>
  `;

  renderCardSelectionUi();
}

function switchCardKind(kind) {
  cardKind = kind;
  selectedCardClassId = null;
  lastPreviewPeople = [];
  renderIdCardsPage();
}

function onGenerateForChange() {
  generateFor = document.getElementById('generate-for-select').value;
  selectedCardClassId = null;
  lastPreviewPeople = [];
  document.getElementById('id-card-preview-panel').style.display = 'none';
  renderCardSelectionUi();
}

function renderCardSelectionUi() {
  const bodyEl = document.getElementById('card-selection-body');

  if (generateFor === 'one') {
    bodyEl.innerHTML = `
      <div class="field">
        <label for="card-search-input">Search ${cardKind === 'student' ? 'student' : 'teacher'}</label>
        <input type="text" id="card-search-input" placeholder="Type a name..." oninput="filterCardSearch()">
      </div>
      <div id="card-search-results" style="max-height:220px; overflow-y:auto; margin-top:6px;"></div>
    `;
    return;
  }

  // "Whole class" / "All teachers"
  if (cardKind === 'student') {
    bodyEl.innerHTML = `
      <div class="field">
        <label for="card-class-select">Class</label>
        <select id="card-class-select" onchange="onCardClassChange()">
          <option value="">-- Choose a class --</option>
          ${allClassesForCards.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div id="card-checklist-body"></div>
    `;
  } else {
    bodyEl.innerHTML = `<div id="card-checklist-body"></div>`;
    loadAllTeachersChecklist();
  }
}

// ---- "One" mode: live search ----
async function filterCardSearch() {
  const term = document.getElementById('card-search-input').value.trim().toLowerCase();
  const resultsEl = document.getElementById('card-search-results');
  if (!term) { resultsEl.innerHTML = ''; return; }

  let matches;
  if (cardKind === 'student') {
    const { data } = await supabaseClient
      .from('students').select('id, name, admission_no, photo_url, photo_path, guardian_phone, classes ( id, name )')
      .eq('school_id', currentSchoolId).ilike('name', `%${term}%`).limit(8);
    matches = data || [];
  } else {
    const { data } = await supabaseClient
      .from('teachers').select('id, name, email, photo_url, photo_path')
      .eq('school_id', currentSchoolId).ilike('name', `%${term}%`).limit(8);
    matches = data || [];
  }

  resultsEl.innerHTML = matches.length ? matches.map((p) => `
    <div class="queue-row" style="cursor:pointer;" onclick='selectOneCardPerson(${p.id})'>
      <span>${p.name}</span>
      <span class="text-muted">${cardKind === 'student' ? (p.classes?.name || 'Unassigned') : (p.email || '')}</span>
    </div>
  `).join('') : `<p class="text-muted" style="font-size:13.5px; padding:8px 0;">No matches.</p>`;

  // Stash the matched records so the click handler can find them without another query
  window.__cardSearchMatches = matches;
}

function selectOneCardPerson(id) {
  const person = (window.__cardSearchMatches || []).find((p) => p.id === id);
  if (!person) return;
  document.getElementById('card-search-results').innerHTML = '';
  document.getElementById('card-search-input').value = person.name;
  renderCardPreview([person]);
}

// ---- "Whole class" mode ----
async function onCardClassChange() {
  selectedCardClassId = document.getElementById('card-class-select').value;
  const bodyEl = document.getElementById('card-checklist-body');
  if (!selectedCardClassId) { bodyEl.innerHTML = ''; document.getElementById('id-card-preview-panel').style.display = 'none'; return; }

  bodyEl.innerHTML = `<div class="empty-state">Loading class...</div>`;
  const { data: students } = await supabaseClient
    .from('students').select('id, name, admission_no, photo_url, photo_path, guardian_phone, classes ( id, name )')
    .eq('class_id', selectedCardClassId).order('name');
  cardStudents = students || [];
  renderCardChecklist(cardStudents);
}

async function loadAllTeachersChecklist() {
  const bodyEl = document.getElementById('card-checklist-body');
  bodyEl.innerHTML = `<div class="empty-state">Loading staff...</div>`;
  const { data: teachers } = await supabaseClient
    .from('teachers').select('id, name, email, photo_url, photo_path').eq('school_id', currentSchoolId).order('name');
  cardTeachers = teachers || [];
  renderCardChecklist(cardTeachers);
}

function renderCardChecklist(list) {
  const bodyEl = document.getElementById('card-checklist-body');
  if (!list.length) {
    bodyEl.innerHTML = `<div class="empty-state">No ${cardKind === 'student' ? 'students in this class' : 'teachers'} yet.</div>`;
    document.getElementById('id-card-preview-panel').style.display = 'none';
    return;
  }

  const rows = list.map((p) => `
    <label class="queue-row" style="cursor:pointer;">
      <span><input type="checkbox" class="card-check" data-id="${p.id}" checked onchange="onCardChecklistChange()" style="margin-right:10px;">${p.name}</span>
      <span class="text-muted">${cardKind === 'student' ? (p.admission_no || 'No admission no.') : (p.email || '')}</span>
    </label>
  `).join('');

  bodyEl.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin:14px 0 6px;">
      <span class="text-muted" style="font-size:13.5px;">${list.length} ${cardKind === 'student' ? 'student(s)' : 'teacher(s)'}</span>
      <span>
        <button class="icon-btn" style="margin-right:14px;" onclick="toggleAllCardChecks(true)">Select all</button>
        <button class="icon-btn" onclick="toggleAllCardChecks(false)">Select none</button>
      </span>
    </div>
    <div style="max-height:280px; overflow-y:auto;">${rows}</div>
  `;

  onCardChecklistChange();
}

function toggleAllCardChecks(checked) {
  document.querySelectorAll('.card-check').forEach((el) => { el.checked = checked; });
  onCardChecklistChange();
}

function onCardChecklistChange() {
  const checkedIds = Array.from(document.querySelectorAll('.card-check:checked')).map((el) => Number(el.dataset.id));
  const source = cardKind === 'student' ? cardStudents : cardTeachers;
  const selected = source.filter((p) => checkedIds.includes(p.id));
  renderCardPreview(selected);
}

// ---- Preview + QR ----
function waitForQRCodeLib(timeoutMs = 1000) {
  return new Promise((resolve) => {
    if (window.QRCode && window.QRCode.Model) { resolve(true); return; }
    const start = Date.now();
    const check = () => {
      if (window.QRCode && window.QRCode.Model) { resolve(true); return; }
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      setTimeout(check, 30);
    };
    check();
  });
}

async function getOrCreateCardToken(studentId) {
  if (!activeSessionId) return null;
  const { data: existing } = await supabaseClient
    .from('report_verifications').select('token')
    .eq('student_id', studentId).eq('session_id', activeSessionId).maybeSingle();
  if (existing) return existing.token;

  const { data: created, error } = await supabaseClient
    .from('report_verifications').insert({ student_id: studentId, session_id: activeSessionId })
    .select('token').single();
  return error ? null : created.token;
}

async function renderCardPreview(people) {
  lastPreviewPeople = people;
  const previewPanel = document.getElementById('id-card-preview-panel');
  const previewArea = document.getElementById('id-card-preview-area');

  if (!people.length) { previewPanel.style.display = 'none'; return; }
  previewPanel.style.display = 'block';
  previewArea.innerHTML = `<div class="empty-state">Building preview...</div>`;

  const className = (cardKind === 'student' && selectedCardClassId)
    ? (allClassesForCards.find((c) => String(c.id) === String(selectedCardClassId))?.name || '')
    : '';

  const pairsHtml = people.map((p, idx) => cardPairHtml(p, idx, className)).join('');
  previewArea.innerHTML = `<div class="id-card-sheet">${pairsHtml}</div>`;

  // QR codes are added after the DOM exists, one per person (each may need
  // a fresh verification token created on first use). Wait once for the
  // QR library itself, since on a slow connection it can still be
  // downloading when we reach this point.
  await waitForQRCodeLib();

  for (let i = 0; i < people.length; i++) {
    const holder = document.getElementById(`id-card-qr-${i}`);
    if (!holder) continue;

    let qrText = `${people[i]?.name || ''} \u00b7 ${schoolName}`;
    if (cardKind === 'student') {
      const token = await getOrCreateCardToken(people[i].id);
      qrText = token
        ? `${window.location.origin}${window.location.pathname.replace('id-cards.html', '')}verify.html?token=${token}`
        : `${people[i].name} \u00b7 ${schoolName}`;
    } else {
      qrText = `${people[i].name} \u00b7 STAFF-${people[i].id} \u00b7 ${schoolName}`;
    }

    try {
      const drawn = window.renderQrCode ? renderQrCode(holder, qrText, 96) : false;
      if (!drawn) throw new Error('QR rendering unavailable');
    } catch (qrErr) {
      // Never leave the box visibly empty -- show the encoded info as text instead.
      holder.innerHTML = `<span style="font-size:6px; line-height:1.2; padding:2px; display:block; word-break:break-word; color:#000;">${qrText}</span>`;
    }
  }
}

function cardPairHtml(p, idx, className) {
  const photoUrl = cardKind === 'student' ? studentPhotoUrl(p) : teacherPhotoUrl(p);
  const photoHtml = photoUrl
    ? `<img src="${photoUrl}" alt="${p.name}" class="id-card-photo-img">`
    : `<div class="id-card-photo-fallback">${initials(p.name)}</div>`;
  const watermarkHtml = `<div class="id-card-watermark" style="background-image:url('${schoolLogoUrl}');"></div>`;

  const roleLine = cardKind === 'student' ? (className || p.classes?.name || 'Student') : 'Teacher';
  const idLine = cardKind === 'student' ? (p.admission_no || `ID-${p.id}`) : `STAFF-${p.id}`;

  const front = `
    <div class="id-card">
      ${watermarkHtml}
      <div class="id-card-content">
        <div class="id-card-band">
          <span class="id-card-band-logo"><img src="${schoolLogoUrl}" alt=""></span>
          <span class="id-card-school">${schoolName}</span>
        </div>
        <p class="id-card-doctype">${cardKind === 'student' ? 'STUDENT ID' : 'STAFF ID'}</p>
        <div class="id-card-center">
          <div class="id-card-photo-ring">${photoHtml}</div>
          <div class="id-card-name">${p.name}</div>
          <div class="id-card-role">${roleLine}</div>
          <div class="id-card-id">${idLine}</div>
        </div>
        <div class="id-card-footer">${schoolName}</div>
      </div>
    </div>`;

  const back = `
    <div class="id-card id-card-back">
      ${watermarkHtml}
      <div class="id-card-content id-card-back-content">
        <div class="id-card-back-left">
          <div class="id-card-band id-card-band-sm">
            <span class="id-card-band-logo"><img src="${schoolLogoUrl}" alt=""></span>
            <span class="id-card-school">Terms &amp; Conditions</span>
          </div>
          <ul class="id-card-terms">
            <li>This card is the property of the school and must be surrendered on request.</li>
            <li>If found, please return it to the school office${schoolInfoPhone ? ` &mdash; ${schoolInfoPhone}` : ''}.</li>
            <li>Report loss of this card to the school immediately.</li>
          </ul>
          <div class="id-card-signature">${cardKind === 'student' ? 'Class Teacher / Principal signature' : 'Principal signature'}</div>
        </div>
        <div class="id-card-back-right">
          <span id="id-card-qr-${idx}" class="id-card-qr"></span>
          <span class="id-card-qr-caption">${cardKind === 'student' ? 'Scan to verify' : 'Scan for staff info'}</span>
          <span class="id-card-qr-caption">Valid ${activeSessionLabel || '&mdash;'}</span>
        </div>
      </div>
    </div>`;

  return `<div class="id-card-pair">${front}${back}</div>`;
}

loadIdCardsPage();
