/* ════════════════════════════════════════════════════════
   WOLF．DIARY  ·  app.js  (v8)
   ════════════════════════════════════════════════════════ */
'use strict';

const SUPABASE_URL      = 'https://ejilflhournpzniqdxtn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqaWxmbGhvdXJucHpuaXFkeHRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzEyMTIsImV4cCI6MjA5MzQwNzIxMn0.xsCAVdoXR6r6X2LMpqFAfAKhEHF_t4Aaa-SicytQuL4';
const db    = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TABLE = 'Entries';
const SETTINGS_TABLE = 'user_settings';

document.addEventListener('DOMContentLoaded', () => {

  /* ── CONSTANTS ── */
  const LS_KEY       = 'wolf_diary_settings';
  const LS_DRAFT_KEY = 'wolf_diary_draft';
  const MILESTONES   = [1, 5, 10, 20, 50, 100, 200, 365, 500];

  const DEFAULT_SETTINGS = {
    apiBaseUrl: 'https://api.openai.com/v1',
    apiKey: '', apiModel: 'gpt-4o',
    moodMap: { '平靜':'😌','焦慮':'🤯','疲憊':'😫','開心':'😊','感恩':'🙏','低落':'😔' },
    promptA: '你是一個日記書寫的引導者。\n請生成一個繁體中文的引導問題，幫助使用者開始書寫日記。\n\n規則：\n- 問題聚焦在一個具體的細節、場景或感官經驗\n- 語氣平靜，不帶評價、建議或鼓勵\n- 不要問「為什麼」\n- 不要預設使用者的狀態是正面或負面的\n- 避免以「今天」開頭\n- 20 字以內\n\n風格範例：\n・最近有沒有一個瞬間，你突然不知道自己在想什麼？\n・你注意到的最近一個陌生人長什麼樣子？\n・有沒有什麼事情你做了但不確定為什麼要做？\n・最近哪個時刻你覺得最清醒？\n・你上一次獨處是在什麼情況下？',
    promptB: '你是一個日記書寫的引導者。\n使用者目前的心情為：[心情]，觸發事件或關鍵字為：[事件]。\n\n請根據以上資訊，生成一個繁體中文的引導問題。\n\n規則：\n- 問題與使用者的心情或事件有隱性關聯，但不要直接點名它\n- 聚焦在一個具體的細節、場景或感官經驗\n- 語氣平靜，不帶評價、安慰或建議\n- 不要問「為什麼」\n- 避免以「今天」開頭\n- 20 字以內',
  };

  let allEntries     = [];
  let lastRandomIdx  = -1;
  let currentEntryId = null;
  let viewingEntry   = null;
  let currentRoot    = 'home';
  let currentUser    = null; // supabase user object
  let currentNickname = '';

  /* ════════════════════════════════════════════════════
     UTILITIES
  ════════════════════════════════════════════════════ */
  const getTodayStr = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; };
  const showFeedback = (id, msg, type) => { const el = document.getElementById(id); if (!el) return; el.textContent = msg; el.className = `save-feedback ${type}`; setTimeout(() => { el.textContent = ''; el.className = 'save-feedback'; }, 3500); };
  const makePreview  = t => t.trimStart().slice(0,150).replace(/#{1,6}\s/g,'').replace(/[*`>_~]/g,'').replace(/\n+/g,' ').trim();
  const updateWordCount = (content, el) => { const c = content.replace(/\s/g,'').length, l = content ? content.split('\n').length : 0; el.textContent = c > 0 ? `${c} 字 · ${l} 行` : '0 字'; };

  /* ════════════════════════════════════════════════════
     AUTH
  ════════════════════════════════════════════════════ */
  const authOverlay = document.getElementById('authOverlay');

  // Tab switching
  document.getElementById('tabLogin').addEventListener('click', () => {
    document.getElementById('tabLogin').classList.add('active');
    document.getElementById('tabSignup').classList.remove('active');
    document.getElementById('authLogin').style.display = '';
    document.getElementById('authSignup').style.display = 'none';
  });
  document.getElementById('tabSignup').addEventListener('click', () => {
    document.getElementById('tabSignup').classList.add('active');
    document.getElementById('tabLogin').classList.remove('active');
    document.getElementById('authSignup').style.display = '';
    document.getElementById('authLogin').style.display = 'none';
  });

  // Login
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showFeedback('loginFeedback','請填寫 Email 和密碼','err'); return; }
    document.getElementById('loginBtn').disabled = true;
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    document.getElementById('loginBtn').disabled = false;
    if (error) { showFeedback('loginFeedback', error.message, 'err'); return; }
    await onSignedIn(data.user);
  });
  document.getElementById('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });
  document.getElementById('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('loginBtn').click(); });

  // Signup
  document.getElementById('signupBtn').addEventListener('click', async () => {
    const nickname = document.getElementById('signupNickname').value.trim();
    const email    = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    if (!nickname) { showFeedback('signupFeedback','請填寫名字','err'); return; }
    if (!email || !password) { showFeedback('signupFeedback','請填寫 Email 和密碼','err'); return; }
    if (password.length < 6) { showFeedback('signupFeedback','密碼至少 6 個字元','err'); return; }
    document.getElementById('signupBtn').disabled = true;
    const { data, error } = await db.auth.signUp({ email, password, options: { data: { nickname } } });
    document.getElementById('signupBtn').disabled = false;
    if (error) { showFeedback('signupFeedback', error.message, 'err'); return; }
    if (data.user && !data.session) {
      showFeedback('signupFeedback','✓ 請至信箱確認後再登入','ok');
      return;
    }
    await onSignedIn(data.user);
  });

  const onSignedIn = async (user) => {
    currentUser = user;
    currentNickname = user.user_metadata?.nickname || user.email || '使用者';
    authOverlay.style.display = 'none';
    updateUserUI();
    await loadCloudSettings();
    await loadAllEntries();
  };

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (!confirm('確定要登出嗎？')) return;
    await db.auth.signOut();
    currentUser = null; allEntries = []; lastRandomIdx = -1;
    authOverlay.style.display = 'flex';
    document.getElementById('tabLogin').click();
  });

  // Delete account
  const deleteAccountInput  = document.getElementById('deleteAccountInput');
  const deleteAccountConfirmBtn = document.getElementById('deleteAccountConfirmBtn');
  document.getElementById('deleteAccountBtn').addEventListener('click', () => {
    deleteAccountInput.value = ''; deleteAccountConfirmBtn.disabled = true;
    document.getElementById('deleteAccountDialog').classList.add('open');
  });
  document.getElementById('deleteAccountCancelBtn').addEventListener('click', () => document.getElementById('deleteAccountDialog').classList.remove('open'));
  deleteAccountInput.addEventListener('input', () => { deleteAccountConfirmBtn.disabled = deleteAccountInput.value.trim() !== '確認刪除'; });
  deleteAccountConfirmBtn.addEventListener('click', async () => {
    if (!currentUser) return;
    deleteAccountConfirmBtn.disabled = true;
    try {
      // 刪除所有日記和設定
      await db.from(TABLE).delete().eq('user_id', currentUser.id);
      await db.from(SETTINGS_TABLE).delete().eq('user_id', currentUser.id);
      // 刪除 auth 帳號（需要 Supabase Edge Function，這裡先登出）
      await db.auth.signOut();
      document.getElementById('deleteAccountDialog').classList.remove('open');
      currentUser = null; allEntries = [];
      authOverlay.style.display = 'flex';
      alert('帳號資料已刪除。');
    } catch (err) { alert(`刪除失敗：${err.message}`); deleteAccountConfirmBtn.disabled = false; }
  });

  const updateUserUI = () => {
    const el = document.getElementById('sidebarUser');
    el.innerHTML = `<span class="sidebar-user-name">${currentNickname}</span>`;
    document.getElementById('settingsUserDisplay').textContent = `${currentNickname} (${currentUser?.email || ''})`;
  };

  /* ════════════════════════════════════════════════════
     SETTINGS — local (apiKey only) + cloud (rest)
  ════════════════════════════════════════════════════ */
  const loadSettings = () => { try { const r = localStorage.getItem(LS_KEY); return r ? Object.assign({}, DEFAULT_SETTINGS, JSON.parse(r)) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); } catch { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); } };
  const saveLocalSettings = s => localStorage.setItem(LS_KEY, JSON.stringify(s));

  const loadCloudSettings = async () => {
    if (!currentUser) return;
    const { data } = await db.from(SETTINGS_TABLE).select('*').eq('user_id', currentUser.id).maybeSingle();
    if (!data) return;
    const local = loadSettings();
    if (data.mood_map) local.moodMap = data.mood_map;
    if (data.prompt_a) local.promptA = data.prompt_a;
    if (data.prompt_b) local.promptB = data.prompt_b;
    saveLocalSettings(local);
    populateSettingsForm(); populateMoodSelects();
  };

  const saveCloudSettings = async (s) => {
    if (!currentUser) return;
    await db.from(SETTINGS_TABLE).upsert({ user_id: currentUser.id, mood_map: s.moodMap, prompt_a: s.promptA, prompt_b: s.promptB }, { onConflict: 'user_id' });
  };

  const populateSettingsForm = () => {
    const s = loadSettings();
    ['apiBaseUrl','apiKey','apiModel','promptA','promptB'].forEach(id => { const el = document.getElementById(id); if (el) el.value = s[id] || ''; });
    document.getElementById('moodMap').value = JSON.stringify(s.moodMap, null, 2);
  };

  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const s = loadSettings();
    ['apiBaseUrl','apiKey','apiModel','promptA','promptB'].forEach(id => s[id] = document.getElementById(id).value.trim());
    try { s.moodMap = JSON.parse(document.getElementById('moodMap').value); }
    catch { showFeedback('settingsFeedback','⚠ 心情對應表 JSON 格式有誤','err'); return; }
    saveLocalSettings(s);
    await saveCloudSettings(s);
    populateMoodSelects();
    showFeedback('settingsFeedback','✓ 設定已儲存','ok');
  });

  /* ════════════════════════════════════════════════════
     MOOD
  ════════════════════════════════════════════════════ */
  const getMoodEmoji = name => { const { moodMap } = loadSettings(); return moodMap[name] || ''; };
  const getMoodName  = val  => { const { moodMap } = loadSettings(); return moodMap[val] !== undefined ? val : Object.keys(moodMap).find(k => moodMap[k] === val) || val; };
  const populateMoodSelect = (sel, emojiEl, val) => {
    const { moodMap } = loadSettings(); sel.innerHTML = '';
    Object.keys(moodMap).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = k; sel.appendChild(o); });
    if (val) sel.value = getMoodName(val);
    refreshEmoji(sel, emojiEl);
  };
  const refreshEmoji = (sel, emojiEl) => { emojiEl.textContent = getMoodEmoji(sel.value) || '—'; emojiEl.classList.remove('pop'); void emojiEl.offsetWidth; emojiEl.classList.add('pop'); setTimeout(() => emojiEl.classList.remove('pop'), 200); };
  const populateMoodSelects = () => {
    populateMoodSelect(document.getElementById('entryMood'), document.getElementById('moodEmoji'));
    populateMoodSelect(document.getElementById('editMood'),  document.getElementById('editMoodEmoji'));
  };
  document.getElementById('entryMood').addEventListener('change', () => refreshEmoji(document.getElementById('entryMood'), document.getElementById('moodEmoji')));
  document.getElementById('editMood').addEventListener('change',  () => refreshEmoji(document.getElementById('editMood'),  document.getElementById('editMoodEmoji')));

  /* ════════════════════════════════════════════════════
     TRIGGER EVENT
  ════════════════════════════════════════════════════ */
  const trigGroup = document.getElementById('triggerEventGroup'), trigInput = document.getElementById('triggerEvent');
  document.querySelectorAll('input[name="promptMode"]').forEach(r => r.addEventListener('change', () => {
    const b = document.querySelector('input[name="promptMode"]:checked')?.value === 'B';
    if (b) { trigGroup.style.display = 'flex'; requestAnimationFrame(() => trigGroup.classList.add('visible')); }
    else   { trigGroup.classList.remove('visible'); trigInput.value = ''; setTimeout(() => { if (!trigGroup.classList.contains('visible')) trigGroup.style.display = 'none'; }, 360); }
  }));

  /* ════════════════════════════════════════════════════
     EDITOR
  ════════════════════════════════════════════════════ */
  if (typeof marked !== 'undefined') marked.setOptions({ breaks: true, gfm: true });
  const renderMD = (src, el) => { if (typeof marked !== 'undefined') el.innerHTML = marked.parse(src || ''); };
  const entryContent    = document.getElementById('entryContent');
  const markdownPreview = document.getElementById('markdownPreview');
  const btnEdit = document.getElementById('btnEdit'), btnPreview = document.getElementById('btnPreview');
  const wordCountEl = document.getElementById('wordCount');
  const switchToEdit    = () => { btnEdit.classList.add('active'); btnPreview.classList.remove('active'); entryContent.style.display = ''; markdownPreview.style.display = 'none'; };
  const switchToPreview = () => { btnPreview.classList.add('active'); btnEdit.classList.remove('active'); renderMD(entryContent.value, markdownPreview); entryContent.style.display = 'none'; markdownPreview.style.display = ''; };
  btnEdit.addEventListener('click', switchToEdit); btnPreview.addEventListener('click', switchToPreview);
  entryContent.addEventListener('input', () => { updateWordCount(entryContent.value, wordCountEl); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 3000); });
  document.getElementById('editContent').addEventListener('input', () => updateWordCount(document.getElementById('editContent').value, document.getElementById('editWordCount')));

  /* ════════════════════════════════════════════════════
     DRAFT
  ════════════════════════════════════════════════════ */
  let draftTimer = null;
  const saveDraft  = () => { if (!entryContent.value.trim()) return; try { localStorage.setItem(LS_DRAFT_KEY, JSON.stringify({ date: document.getElementById('entryDate').value, title: document.getElementById('entryTitle').value, content: entryContent.value, moodName: document.getElementById('entryMood').value })); } catch {} };
  const clearDraft = () => { try { localStorage.removeItem(LS_DRAFT_KEY); } catch {} };
  const loadDraftIfExists = () => {
    try {
      const raw = localStorage.getItem(LS_DRAFT_KEY); if (!raw) return;
      const d = JSON.parse(raw); if (!d.content) return;
      const banner = document.getElementById('draftBanner'); banner.style.display = 'flex';
      document.getElementById('draftRestoreBtn').addEventListener('click', () => {
        document.getElementById('entryDate').value  = d.date || getTodayStr();
        document.getElementById('entryTitle').value = d.title || '';
        entryContent.value = d.content;
        const mn = getMoodName(d.moodName || '');
        if (mn && loadSettings().moodMap[mn]) { document.getElementById('entryMood').value = mn; refreshEmoji(document.getElementById('entryMood'), document.getElementById('moodEmoji')); }
        updateWordCount(entryContent.value, wordCountEl); clearDraft(); banner.style.display = 'none';
        showFeedback('saveFeedback','✓ 草稿已還原','ok');
      }, { once: true });
      document.getElementById('draftDiscardBtn').addEventListener('click', () => { clearDraft(); banner.style.display = 'none'; }, { once: true });
    } catch {}
  };
  window.addEventListener('beforeunload', e => { if (entryContent.value.trim()) { e.preventDefault(); e.returnValue = ''; } });

  /* ════════════════════════════════════════════════════
     AI API
  ════════════════════════════════════════════════════ */
  const promptStatus   = document.getElementById('promptStatus');
  const aiQuestionBox  = document.getElementById('aiQuestionBox');
  const aiQuestionText = document.getElementById('aiQuestionText');
  let   currentAiQ = '';

  document.getElementById('generatePromptBtn').addEventListener('click', async () => {
    const s = loadSettings();
    if (!s.apiKey) { promptStatus.textContent = '請先至設定填入 API Key'; promptStatus.style.color = 'var(--danger)'; return; }
    const mode = document.querySelector('input[name="promptMode"]:checked')?.value || 'A';
    const { moodMap } = s, moodName = document.getElementById('entryMood').value;
    const prompt = mode === 'A' ? s.promptA : s.promptB.replace('[心情]',`${moodName} ${moodMap[moodName]||''}`.trim()).replace('[事件]', trigInput.value.trim() || '未提供');
    document.getElementById('generatePromptBtn').disabled = true;
    promptStatus.textContent = '正在思考中…'; promptStatus.style.color = 'var(--text-hint)';
    aiQuestionBox.style.display = 'none'; currentAiQ = '';
    try {
      const res = await fetch(s.apiBaseUrl.replace(/\/$/,'')+'/chat/completions', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${s.apiKey}`}, body: JSON.stringify({ model: s.apiModel||'gpt-4o', max_tokens:150, temperature:0.9, messages:[{role:'system',content:'請以繁體中文回應。只輸出問題本身，不加任何前言或說明。'},{role:'user',content:prompt}] }) });
      if (!res.ok) { const e = await res.json().catch(()=>{}); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
      const q = (await res.json())?.choices?.[0]?.message?.content?.trim();
      if (!q) throw new Error('API 回傳內容為空');
      currentAiQ = q; aiQuestionText.textContent = q; aiQuestionBox.style.display = 'block';
      promptStatus.textContent = '✓ 問題生成完畢'; promptStatus.style.color = 'var(--text-hint)';
    } catch (err) { promptStatus.textContent = `⚠ ${err.message}`; promptStatus.style.color = 'var(--danger)'; }
    finally { document.getElementById('generatePromptBtn').disabled = false; }
  });

  /* ════════════════════════════════════════════════════
     SUPABASE CRUD
  ════════════════════════════════════════════════════ */
  const rowToEntry = row => ({
    id: row.id, date: row.date, title: row.title,
    moodName: getMoodName(row.mood_name || ''),
    mood: getMoodEmoji(getMoodName(row.mood_name || '')) || row.mood_name || '',
    aiQuestion: row.ai_question || '',
    preview: makePreview(row.content || ''),
    content: row.content || '',
  });

  const loadAllEntries = async () => {
    if (!currentUser) return;
    document.getElementById('homeLoading').style.display = 'block';
    const { data, error } = await db.from(TABLE).select('*').eq('user_id', currentUser.id).order('date', { ascending: false });
    document.getElementById('homeLoading').style.display = 'none';
    if (error) { console.error(error); return; }
    allEntries = (data || []).map(rowToEntry);
    refreshHome(); renderHistoryList(allEntries); renderCalendar(); updateSidebarStreak(); renderStats();
  };

  /* ════════════════════════════════════════════════════
     SAVE NEW ENTRY
  ════════════════════════════════════════════════════ */
  const resetNewForm = () => {
    document.getElementById('entryDate').value  = getTodayStr();
    document.getElementById('entryTitle').value = '';
    entryContent.value = ''; currentAiQ = ''; trigInput.value = '';
    aiQuestionBox.style.display = 'none'; promptStatus.textContent = '';
    document.getElementById('entryMood').selectedIndex = 0;
    refreshEmoji(document.getElementById('entryMood'), document.getElementById('moodEmoji'));
    updateWordCount('', wordCountEl); markdownPreview.innerHTML = '';
    clearDraft(); switchToEdit(); currentEntryId = null;
    document.getElementById('draftBanner').style.display = 'none';
    document.getElementById('saveFeedback').textContent = '';
  };

  const saveNewEntry = async () => {
    if (!currentUser) return;
    const date     = document.getElementById('entryDate').value || getTodayStr();
    const title    = document.getElementById('entryTitle').value.trim() || '日記';
    const content  = entryContent.value;
    const moodName = document.getElementById('entryMood').value;
    const btn = document.getElementById('saveEntryBtn'); btn.disabled = true;
    try {
      let savedRow;
      if (currentEntryId) {
        const { data, error } = await db.from(TABLE).update({ date, title, mood_name: moodName, ai_question: currentAiQ, content }).eq('id', currentEntryId).eq('user_id', currentUser.id).select().single();
        if (error) throw error; savedRow = data;
      } else {
        const { data, error } = await db.from(TABLE).insert({ user_id: currentUser.id, date, title, mood_name: moodName, ai_question: currentAiQ, content }).select().single();
        if (error) throw error; savedRow = data; currentEntryId = savedRow.id;
      }
      clearDraft();
      const newE = rowToEntry(savedRow);
      const idx  = allEntries.findIndex(e => e.id === newE.id);
      if (idx !== -1) allEntries[idx] = newE; else allEntries.unshift(newE);
      allEntries.sort((a, b) => b.date.localeCompare(a.date));
      updateSidebarStreak(); refreshHome();
      showFeedback('saveFeedback', `✓ 第 ${allEntries.length} 篇日記已封存`, 'ok');
      pushEntryPage(newE);
    } catch (err) { showFeedback('saveFeedback', `⚠ 儲存失敗：${err.message}`, 'err'); }
    finally { btn.disabled = false; }
  };

  document.getElementById('saveEntryBtn').addEventListener('click', saveNewEntry);
  document.getElementById('cancelNewBtn').addEventListener('click', () => { if (entryContent.value.trim()) { if (!confirm('確定要放棄目前的內容嗎？')) return; } popToRoot(); });

  /* ════════════════════════════════════════════════════
     SEARCH
  ════════════════════════════════════════════════════ */
  const historyList    = document.getElementById('historyList');
  const searchKeyword  = document.getElementById('searchKeyword');
  const searchDate     = document.getElementById('searchDate');
  const searchContent  = document.getElementById('searchContent');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  let advOpen = false;

  document.getElementById('advancedToggleBtn').addEventListener('click', () => { advOpen = !advOpen; document.getElementById('advancedBlock').style.display = advOpen ? 'block' : 'none'; document.getElementById('advancedToggleBtn').textContent = advOpen ? '進階搜尋 ▴' : '進階搜尋 ▾'; });

  const executeSearch = () => {
    const kw = searchKeyword.value.trim().toLowerCase(), dt = searchDate.value, ct = searchContent.value.trim().toLowerCase();
    clearSearchBtn.style.display = (kw || dt || ct) ? 'inline-flex' : 'none';
    renderHistoryList(allEntries.filter(e => {
      if (kw && !e.title.toLowerCase().includes(kw)) return false;
      if (dt && e.date !== dt) return false;
      if (ct && !(e.content || e.preview || '').toLowerCase().includes(ct)) return false;
      return true;
    }));
  };
  const filterCurrent = () => {
    const kw = searchKeyword.value.trim().toLowerCase(), dt = searchDate.value, ct = searchContent.value.trim().toLowerCase();
    return allEntries.filter(e => { if (kw && !e.title.toLowerCase().includes(kw)) return false; if (dt && e.date !== dt) return false; if (ct && !(e.content||e.preview||'').toLowerCase().includes(ct)) return false; return true; });
  };
  clearSearchBtn.addEventListener('click', () => { searchKeyword.value = ''; searchDate.value = ''; searchContent.value = ''; clearSearchBtn.style.display = 'none'; renderHistoryList(allEntries); });
  document.getElementById('searchBtn').addEventListener('click', executeSearch);
  [searchKeyword, searchDate, searchContent].forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') executeSearch(); }));
  searchDate.addEventListener('change', () => { if (searchDate.value) { const d = new Date(searchDate.value+'T00:00:00'); calYear = d.getFullYear(); calMonth = d.getMonth(); renderCalendar(); } });

  /* ════════════════════════════════════════════════════
     HISTORY LIST
  ════════════════════════════════════════════════════ */
  const renderHistoryList = entries => {
    historyList.innerHTML = '';
    if (!entries.length) { historyList.innerHTML = '<p class="empty-hint">沒有符合的日記。</p>'; return; }
    entries.forEach(e => {
      const item = document.createElement('div'); item.className = 'history-item';
      item.innerHTML = `<span class="history-item-date">${e.date}</span><span class="history-item-mood">${e.mood}</span><span class="history-item-title">${e.title}</span><span class="history-item-arrow">›</span>`;
      item.addEventListener('click', () => pushEntryPage(e));
      historyList.appendChild(item);
    });
  };

  /* ════════════════════════════════════════════════════
     CALENDAR
  ════════════════════════════════════════════════════ */
  let calYear = new Date().getFullYear(), calMonth = new Date().getMonth();
  const calGrid = document.getElementById('calendarGrid'), calTitle = document.getElementById('calTitle');
  const renderCalendar = () => {
    calTitle.textContent = `${calYear} 年 ${calMonth+1} 月`;
    const map = new Map(); allEntries.forEach(e => { if (!map.has(e.date)) map.set(e.date,[]); map.get(e.date).push(e); });
    const today = getTodayStr(), first = new Date(calYear, calMonth, 1).getDay(), days = new Date(calYear, calMonth+1, 0).getDate();
    calGrid.innerHTML = '';
    ['日','一','二','三','四','五','六'].forEach(d => { const el = document.createElement('div'); el.className = 'cal-weekday-header'; el.textContent = d; calGrid.appendChild(el); });
    for (let i = 0; i < first; i++) calGrid.appendChild(document.createElement('div'));
    for (let d = 1; d <= days; d++) {
      const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const ens = map.get(ds) || [];
      const cell = document.createElement('div'); cell.className = 'cal-day';
      if (ds === today) cell.classList.add('cal-day-today');
      if (ens.length)   cell.classList.add('cal-has-entry');
      if (searchDate.value === ds) cell.classList.add('cal-day-selected');
      const num = document.createElement('span'); num.className = 'cal-day-num'; num.textContent = d; cell.appendChild(num);
      if (ens.length) {
        const dot = document.createElement('span'); dot.className = 'cal-mood-dot'; dot.textContent = ens.slice(0,2).map(e=>e.mood).join(''); cell.appendChild(dot);
        cell.addEventListener('click', () => { searchDate.value = ds; executeSearch(); renderCalendar(); historyList.scrollIntoView({behavior:'smooth',block:'start'}); });
      }
      calGrid.appendChild(cell);
    }
  };
  document.getElementById('calPrevBtn').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  document.getElementById('calNextBtn').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });

  /* ════════════════════════════════════════════════════
     SIDEBAR — hamburger drawer
  ════════════════════════════════════════════════════ */
  const sidebar         = document.getElementById('sidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const globalTopbar    = document.getElementById('globalTopbar');

  const openSidebar  = () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('visible'); };
  const closeSidebar = () => { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('visible'); };

  document.getElementById('hamburgerBtn').addEventListener('click', openSidebar);
  sidebarBackdrop.addEventListener('click', closeSidebar);

  const ROOT_TITLES = { home:'主畫面', search:'搜尋', stats:'統計', settings:'系統設定' };

  const navBtns      = document.querySelectorAll('.nav-btn[data-root]');
  const rootPages    = document.querySelectorAll('.page-root');
  const stackedPages = document.querySelectorAll('.page-stacked');

  const switchRoot = id => {
    // 如果有堆疊頁在上面，先關掉再切換
    if ([...stackedPages].some(p => p.classList.contains('pushed'))) {
      stackedPages.forEach(p => { p.classList.remove('visible','pushed'); });
      document.querySelector('.page-root.active')?.classList.remove('dimmed');
    }
    currentRoot = id;
    navBtns.forEach(b => b.classList.toggle('active', b.dataset.root === id));
    rootPages.forEach(p => { p.classList.remove('active'); if (p.id === `page-${id}`) requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('active'))); });
    document.getElementById('globalTopbarTitle').textContent = ROOT_TITLES[id] || '';
    document.getElementById('btnNewEntryTopbar').style.display = id === 'home' ? '' : 'none';
    closeSidebar();
    if (id === 'stats') renderStats();
  };
  navBtns.forEach(b => b.addEventListener('click', () => switchRoot(b.dataset.root)));

  const pushPage = id => {
    document.querySelector('.page-root.active')?.classList.add('dimmed');
    stackedPages.forEach(p => p.classList.remove('pushed','visible'));
    const page = document.getElementById(`page-${id}`);
    page.classList.add('pushed');
    requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('visible')));
    // 手機上隱藏 global topbar，讓堆疊頁自己的 topbar 主導
    globalTopbar.classList.add('hidden-for-stack');
  };
  const popToRoot = () => {
    stackedPages.forEach(p => { p.classList.remove('visible'); setTimeout(() => p.classList.remove('pushed'), 320); });
    document.querySelector('.page-root.active')?.classList.remove('dimmed');
    globalTopbar.classList.remove('hidden-for-stack');
  };

  /* ════════════════════════════════════════════════════
     NEW ENTRY PAGE
  ════════════════════════════════════════════════════ */
  const openNewEntry = () => { resetNewForm(); loadDraftIfExists(); pushPage('new'); };
  document.getElementById('btnNewEntry').addEventListener('click', openNewEntry);
  document.getElementById('btnNewEntryTopbar').addEventListener('click', openNewEntry);
  document.getElementById('btnBackFromNew').addEventListener('click', () => { if (entryContent.value.trim()) { if (!confirm('確定要放棄目前的內容嗎？')) return; } popToRoot(); });

  /* ════════════════════════════════════════════════════
     ENTRY READ/EDIT PAGE
  ════════════════════════════════════════════════════ */
  const pushEntryPage = entry => {
    viewingEntry = entry;
    document.getElementById('entryDateBadge').textContent = entry.date;
    document.getElementById('entryMoodBadge').textContent = entry.mood;
    document.getElementById('entryReadTitle').textContent = entry.title;
    if (entry.aiQuestion) { document.getElementById('entryAiText').textContent = entry.aiQuestion; document.getElementById('entryAiQ').style.display = 'block'; }
    else document.getElementById('entryAiQ').style.display = 'none';
    renderMD((entry.content || '').trimStart(), document.getElementById('entryReadBody'));
    // 編輯模式預填
    document.getElementById('editDate').value    = entry.date;
    document.getElementById('editTitle').value   = entry.title;
    document.getElementById('editContent').value = (entry.content || '').trimStart();
    updateWordCount((entry.content || '').trimStart(), document.getElementById('editWordCount'));
    populateMoodSelect(document.getElementById('editMood'), document.getElementById('editMoodEmoji'), entry.moodName);
    if (entry.aiQuestion) { document.getElementById('editModeAiText').textContent = entry.aiQuestion; document.getElementById('editModeAiQ').style.display = 'block'; }
    else document.getElementById('editModeAiQ').style.display = 'none';
    showEntryReadMode();
    pushPage('entry');
  };

  const showEntryReadMode = () => { document.getElementById('entryReadMode').style.display = ''; document.getElementById('entryEditMode').style.display = 'none'; };
  const showEntryEditMode = () => { document.getElementById('entryReadMode').style.display = 'none'; document.getElementById('entryEditMode').style.display = ''; document.getElementById('editContent').focus(); };

  document.getElementById('btnBackFromEntry').addEventListener('click',   popToRoot);
  document.getElementById('entryEditBtn').addEventListener('click',        showEntryEditMode);
  document.getElementById('btnCancelEntryEdit').addEventListener('click',  showEntryReadMode);
  document.getElementById('cancelEditBtn').addEventListener('click',       showEntryReadMode);

  document.getElementById('saveEditBtn').addEventListener('click', async () => {
    if (!viewingEntry?.id) return;
    const date     = document.getElementById('editDate').value || viewingEntry.date;
    const title    = document.getElementById('editTitle').value.trim() || '日記';
    const content  = document.getElementById('editContent').value;
    const moodName = document.getElementById('editMood').value;
    const btn = document.getElementById('saveEditBtn'); btn.disabled = true;
    try {
      const { data, error } = await db.from(TABLE).update({ date, title, mood_name: moodName, content }).eq('id', viewingEntry.id).eq('user_id', currentUser.id).select().single();
      if (error) throw error;
      const updated = rowToEntry(data);
      const idx = allEntries.findIndex(e => e.id === updated.id);
      if (idx !== -1) { allEntries[idx] = updated; allEntries.sort((a,b) => b.date.localeCompare(a.date)); }
      renderHistoryList(filterCurrent()); renderCalendar(); refreshHome(); renderStats();
      viewingEntry = updated;
      document.getElementById('entryDateBadge').textContent = updated.date;
      document.getElementById('entryMoodBadge').textContent = updated.mood;
      document.getElementById('entryReadTitle').textContent  = updated.title;
      renderMD((updated.content || '').trimStart(), document.getElementById('entryReadBody'));
      showFeedback('editFeedback','✓ 已儲存','ok');
      setTimeout(showEntryReadMode, 600);
    } catch (err) { showFeedback('editFeedback', `⚠ ${err.message}`, 'err'); }
    finally { btn.disabled = false; }
  });

  /* ════════════════════════════════════════════════════
     DELETE ENTRY — bug fix: 先記標題再關 dialog
  ════════════════════════════════════════════════════ */
  const deleteDialog  = document.getElementById('deleteDialog');
  const delInput      = document.getElementById('deleteConfirmInput');
  const delConfirmBtn = document.getElementById('deleteConfirmBtn');
  let deleteTarget = null;

  const openDeleteDialog  = e => { deleteTarget = e; document.getElementById('deleteTargetTitle').textContent = e.title; delInput.value = ''; delConfirmBtn.disabled = true; deleteDialog.classList.add('open'); };
  const closeDeleteDialog = () => { deleteDialog.classList.remove('open'); deleteTarget = null; };

  delInput.addEventListener('input', () => { delConfirmBtn.disabled = delInput.value.trim() !== deleteTarget?.title?.trim(); });
  document.getElementById('deleteCancelBtn').addEventListener('click', closeDeleteDialog);
  document.getElementById('entryDeleteBtn').addEventListener('click',  () => openDeleteDialog(viewingEntry));

  delConfirmBtn.addEventListener('click', async () => {
    if (!deleteTarget?.id) return;
    const deletedTitle = deleteTarget.title; // 先存起來
    const deletedId    = deleteTarget.id;
    closeDeleteDialog(); // 關閉 dialog（此時 deleteTarget 變 null，但已存好）
    try {
      const { error } = await db.from(TABLE).delete().eq('id', deletedId).eq('user_id', currentUser.id);
      if (error) throw error;
      allEntries = allEntries.filter(e => e.id !== deletedId);
      renderHistoryList(filterCurrent()); renderCalendar(); updateSidebarStreak(); refreshHome(); renderStats();
      popToRoot();
      showFeedback('saveFeedback', `✓ 已刪除：${deletedTitle}`, 'ok');
    } catch (err) { alert(`刪除失敗：${err.message}`); }
  });

  /* ════════════════════════════════════════════════════
     STREAK
  ════════════════════════════════════════════════════ */
  const calcStreak = entries => {
    const dates = [...new Set(entries.map(e => e.date))].sort().reverse(); if (!dates.length) return 0;
    const today = getTodayStr(), check = new Date(today+'T00:00:00');
    if (dates[0] !== today) check.setDate(check.getDate()-1);
    let s = 0;
    for (const d of dates) { const cs = check.toISOString().slice(0,10); if (d===cs) { s++; check.setDate(check.getDate()-1); } else if (d<cs) break; }
    return s;
  };
  const calcMaxStreak = entries => {
    const dates = [...new Set(entries.map(e=>e.date))].sort(); if (!dates.length) return 0;
    let max=1,cur=1;
    for (let i=1;i<dates.length;i++) { const diff=(new Date(dates[i]+'T00:00:00')-new Date(dates[i-1]+'T00:00:00'))/86400000; if(diff===1){cur++;max=Math.max(max,cur);}else cur=1; }
    return max;
  };
  const updateSidebarStreak = () => {
    const s = calcStreak(allEntries);
    let el = document.getElementById('sidebarStreak');
    if (!el) { el=document.createElement('div'); el.id='sidebarStreak'; el.className='sidebar-streak'; document.querySelector('.sidebar-footer').parentNode.insertBefore(el,document.querySelector('.sidebar-footer')); }
    if (s>=2)      { el.innerHTML=`<span class="streak-fire">🔥</span><span class="streak-count">連續 ${s} 天</span>`; el.style.display='flex'; }
    else if (s===1){ el.innerHTML=`<span class="streak-fire">✦</span><span class="streak-count">今天已記錄</span>`;         el.style.display='flex'; }
    else           { el.style.display='none'; }
  };

  /* ════════════════════════════════════════════════════
     HOME
  ════════════════════════════════════════════════════ */
  const buildCard = (entry, label) => {
    const card = document.createElement('div');
    card.className = `home-card${entry.date===getTodayStr()?' home-card-today':''}`;
    card.innerHTML = `
      <div class="home-card-header">
        ${label?`<span class="home-card-ago">${label}</span>`:''}
        <span class="home-card-date">${entry.date}</span>
        <span class="home-card-mood">${entry.mood}</span>
      </div>
      <div class="home-card-title">${entry.title}</div>
      ${entry.preview?`<div class="home-card-preview">${entry.preview}${entry.preview.length>=148?'…':''}</div>`:''}`;
    card.addEventListener('click', () => pushEntryPage(entry));
    return card;
  };

  const pickRandom = (force=false) => {
    if (!allEntries.length) return;
    if (force||lastRandomIdx<0||lastRandomIdx>=allEntries.length) {
      let i; do { i=Math.floor(Math.random()*allEntries.length); } while(allEntries.length>1&&i===lastRandomIdx);
      lastRandomIdx=i;
    }
    const e=allEntries[lastRandomIdx];
    const y=new Date().getFullYear(),ey=parseInt(e.date.slice(0,4),10);
    const label=e.date===getTodayStr()?'今天':ey===y?'今年':`${y-ey} 年前`;
    document.getElementById('homeRandomCard').innerHTML='';
    document.getElementById('homeRandomCard').appendChild(buildCard(e,label));
  };
  document.getElementById('reshuffleBtn').addEventListener('click', ()=>pickRandom(true));

  const refreshHome = () => {
    const today=getTodayStr(),thisYear=new Date().getFullYear(),thisMonth=today.slice(0,7);
    const[y,m,d]=today.split('-');
    document.getElementById('homeDateLine').textContent=`${y} 年 ${parseInt(m)} 月 ${parseInt(d)} 日`;
    const todayCards=document.getElementById('homeTodayCards'),unwritten=document.getElementById('homeUnwritten');
    const todayEs=allEntries.filter(e=>e.date===today);
    Array.from(todayCards.children).forEach(c=>{if(c!==unwritten)c.remove();});
    if(todayEs.length){unwritten.style.display='none';todayEs.forEach(e=>todayCards.appendChild(buildCard(e,'')));}
    else unwritten.style.display='flex';
    if(allEntries.length>0){
      const streak=calcStreak(allEntries);
      document.getElementById('statStreak').textContent=streak>0?`🔥 ${streak}`:'—';
      document.getElementById('statTotal').textContent=allEntries.length;
      document.getElementById('statMonth').textContent=allEntries.filter(e=>e.date.startsWith(thisMonth)).length;
      document.getElementById('homeStatsRow').style.display='flex';
    }
    const todayMMDD=today.slice(5);
    const onThisDay=allEntries.filter(e=>e.date.slice(5)===todayMMDD&&parseInt(e.date.slice(0,4),10)<thisYear);
    const otdSec=document.getElementById('homeOnThisDaySection');
    if(onThisDay.length){otdSec.style.display='block';const cards=document.getElementById('homeOnThisDayCards');cards.innerHTML='';onThisDay.forEach(e=>{const ya=thisYear-parseInt(e.date.slice(0,4),10);cards.appendChild(buildCard(e,`${ya} 年前`));});}
    else otdSec.style.display='none';
    if(allEntries.length>0){document.getElementById('homeRandomSection').style.display='block';document.getElementById('reshuffleBtn').style.display=allEntries.length>1?'':'none';pickRandom(false);}
    else document.getElementById('homeRandomSection').style.display='none';
  };

  /* ════════════════════════════════════════════════════
     STATS
  ════════════════════════════════════════════════════ */
  const renderStats = () => {
    const container=document.getElementById('statsContent');
    if(!allEntries.length){container.innerHTML='<p class="empty-hint">還沒有日記，開始書寫後這裡會出現統計。</p>';return;}
    const{moodMap}=loadSettings();
    const total=allEntries.length,streak=calcStreak(allEntries),maxStreak=calcMaxStreak(allEntries);
    const monthMap=new Map();allEntries.forEach(e=>{const m=e.date.slice(0,7);monthMap.set(m,(monthMap.get(m)||0)+1);});
    const months=[...monthMap.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const maxMC=Math.max(...months.map(m=>m[1]),1);
    const bestM=months.reduce((a,b)=>b[1]>a[1]?b:a,months[0]);
    const weekMap=[0,0,0,0,0,0,0];allEntries.forEach(e=>{weekMap[new Date(e.date+'T00:00:00').getDay()]++;});
    const maxW=Math.max(...weekMap,1);
    const moodCount=new Map();allEntries.forEach(e=>{const k=e.moodName||e.mood;moodCount.set(k,(moodCount.get(k)||0)+1);});
    const moodEntries=[...moodCount.entries()].sort((a,b)=>b[1]-a[1]);
    const sortedAsc=[...allEntries].sort((a,b)=>a.date.localeCompare(b.date));
    const milestoneDate=n=>sortedAsc[n-1]?.date||'';
    container.innerHTML=`
      <div class="stats-section"><div class="stats-section-label">書寫概覽</div><div class="stats-grid">
        <div class="stats-card"><span class="stats-card-value">${total}</span><span class="stats-card-label">總篇數</span></div>
        <div class="stats-card"><span class="stats-card-value">${streak>0?`🔥 ${streak}`:'—'}</span><span class="stats-card-label">目前連續天數</span></div>
        <div class="stats-card"><span class="stats-card-value">${maxStreak}</span><span class="stats-card-label">歷史最高連續</span></div>
        <div class="stats-card"><span class="stats-card-value">${bestM?bestM[0].replace('-','/'):'—'}</span><span class="stats-card-label">最活躍月份</span></div>
      </div></div>
      <div class="stats-section"><div class="stats-section-label">每月篇數</div><div class="stats-bar-chart">
        ${months.map(([m,c])=>`<div class="stats-bar-col"><div class="stats-bar-wrap"><div class="stats-bar" style="height:${Math.round((c/maxMC)*100)}%"></div></div><span class="stats-bar-label">${m.slice(5)}</span><span class="stats-bar-count">${c}</span></div>`).join('')}
      </div></div>
      <div class="stats-section"><div class="stats-section-label">最常在哪天寫</div><div class="stats-week-chart">
        ${weekMap.map((c,i)=>`<div class="stats-bar-col"><div class="stats-bar-wrap"><div class="stats-bar stats-bar-week" style="height:${Math.round((c/maxW)*100)}%"></div></div><span class="stats-bar-label">${['日','一','二','三','四','五','六'][i]}</span><span class="stats-bar-count">${c}</span></div>`).join('')}
      </div></div>
      <div class="stats-section"><div class="stats-section-label">心情分佈</div><div class="stats-mood-list">
        ${moodEntries.map(([name,count])=>`<div class="stats-mood-row"><span class="stats-mood-emoji">${moodMap[name]||name}</span><span class="stats-mood-name">${moodMap[name]?name:''}</span><div class="stats-mood-bar-wrap"><div class="stats-mood-bar" style="width:${Math.round((count/total)*100)}%"></div></div><span class="stats-mood-count">${count} 篇</span></div>`).join('')}
      </div></div>
      <div class="stats-section"><div class="stats-section-label">里程碑</div><div class="stats-milestones">
        ${MILESTONES.map(m=>{const done=total>=m;return`<div class="stats-milestone ${done?'achieved':'locked'}"><span class="milestone-icon">${done?'✦':'○'}</span><span class="milestone-num">第 ${m} 篇</span><span class="milestone-date">${done?milestoneDate(m):'—'}</span></div>`;}).join('')}
        ${MILESTONES.find(m=>total<m)?`<div class="stats-next-milestone">距離第 ${MILESTONES.find(m=>total<m)} 篇還有 ${MILESTONES.find(m=>total<m)-total} 篇</div>`:'<div class="stats-next-milestone">🎉 所有里程碑已達成！</div>'}
      </div></div>`;
  };

  /* ════════════════════════════════════════════════════
     EXPORT — wolf-diary / 年 / 年月 / 檔案
  ════════════════════════════════════════════════════ */
  document.getElementById('exportBtn').addEventListener('click', async () => {
    if (!allEntries.length) { alert('目前沒有日記可以匯出。'); return; }
    const btn = document.getElementById('exportBtn'); btn.disabled = true; btn.textContent = '打包中…';
    try {
      const zip = new JSZip();
      const root = zip.folder('wolf-diary');
      allEntries.forEach(e => {
        const year    = e.date.slice(0, 4);
        const yearMonth = e.date.slice(0, 7);
        const fileName  = `${e.date}.md`;
        const md = ['---',`標題: ${e.title}`,`日期: ${e.date}`,`心情: ${e.moodName||''}`,`AI 題目: ${e.aiQuestion||''}`,'---','',e.content||''].join('\n');
        root.folder(year).folder(yearMonth).file(fileName, md);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href=url; a.download=`wolf-diary-export-${getTodayStr()}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { alert(`匯出失敗：${err.message}`); }
    finally { btn.disabled=false; btn.innerHTML='<span class="btn-icon">↓</span> 下載 ZIP（wolf-diary / 年 / 年月）'; }
  });

  /* ════════════════════════════════════════════════════
     IMPORT — ZIP → Supabase
  ════════════════════════════════════════════════════ */
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file || !currentUser) return;
    const status = document.getElementById('importStatus');
    status.textContent = '讀取中…'; status.style.color = 'var(--text-hint)';
    try {
      const zip = await JSZip.loadAsync(file);
      const mdFiles = [];
      zip.forEach((path, entry) => { if (!entry.dir && path.endsWith('.md')) mdFiles.push(entry); });

      // 建立現有日記的 key set（date+title）避免重複
      const existingKeys = new Set(allEntries.map(e => `${e.date}|${e.title}`));
      let imported = 0, skipped = 0;

      for (const entry of mdFiles) {
        const raw  = await entry.async('string');
        const m    = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        let date = '', title = '', moodName = '', aiQuestion = '', content = raw;
        if (m) {
          const meta = {};
          m[1].split('\n').forEach(l => { const i=l.indexOf(':'); if(i!==-1) meta[l.slice(0,i).trim()]=l.slice(i+1).trim(); });
          date       = meta['日期'] || '';
          title      = meta['標題'] || '';
          moodName   = getMoodName(meta['心情'] || '');
          aiQuestion = meta['AI 題目'] || '';
          content    = m[2].trimStart();
        }
        // 從路徑猜日期
        if (!date) { const match = entry.name.match(/(\d{4}-\d{2}-\d{2})/); if (match) date = match[1]; }
        if (!title) title = entry.name.replace(/\.md$/,'').split('/').pop();
        if (!date) { skipped++; continue; }
        const key = `${date}|${title}`;
        if (existingKeys.has(key)) { skipped++; continue; }
        const { data, error } = await db.from(TABLE).insert({ user_id: currentUser.id, date, title, mood_name: moodName, ai_question: aiQuestion, content }).select().single();
        if (!error && data) { allEntries.push(rowToEntry(data)); existingKeys.add(key); imported++; }
        else skipped++;
      }
      allEntries.sort((a,b) => b.date.localeCompare(a.date));
      refreshHome(); renderHistoryList(allEntries); renderCalendar(); updateSidebarStreak(); renderStats();
      status.textContent = `✓ 匯入 ${imported} 篇，略過 ${skipped} 篇`; status.style.color = 'var(--success)';
    } catch (err) { status.textContent = `⚠ ${err.message}`; status.style.color = 'var(--danger)'; }
    e.target.value = '';
  });

  /* ════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════ */
  const now = new Date();
  document.getElementById('sidebarDate').textContent = `${now.getFullYear()} · ${String(now.getMonth()+1).padStart(2,'0')} · ${String(now.getDate()).padStart(2,'0')}`;
  trigGroup.style.display = 'none'; trigGroup.classList.remove('visible');
  populateSettingsForm(); populateMoodSelects();
  switchToEdit(); markdownPreview.style.display = 'none';
  renderCalendar();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

  // 檢查現有 session
  db.auth.getSession().then(async ({ data: { session } }) => {
    if (session?.user) {
      await onSignedIn(session.user);
    } else {
      authOverlay.style.display = 'flex';
    }
  });

}); // DOMContentLoaded
