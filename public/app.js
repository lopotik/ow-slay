function linkify(text) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s]+|twitch\.tv\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--cyan); text-decoration:none;">${url}</a>`;
  });
}

document.querySelectorAll('.filter').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.f;
    document.querySelectorAll('#grid .card').forEach(card=>{
      card.style.display = (f==='all' || card.dataset.cat===f) ? '' : 'none';
    });
  });
});

window.showToast = function(msg){
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm = setTimeout(()=>t.classList.remove('show'), 2600);
}

async function loadMe(){
  try { const r = await fetch('/api/me'); return await r.json(); } catch(e) { return { user: null }; }
}

async function renderAuth(){
  const { user } = await loadMe();
  const box = document.getElementById('authBox');
  if (!box) return;
  if (!user){
    box.innerHTML = `<a href="/auth/twitch" class="btn btn-primary">Войти через Twitch</a>`;
    return;
  }
  const isLocalhost = window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1');
  box.innerHTML = `
    <div class="user-chip" style="position:relative; padding-right: 35px;">
      <a href="/profile.html" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:inherit;">
        <img src="${user.avatar}" alt=""><span>${user.display_name}</span>
      </a>
      ${isLocalhost ? '<a href="/admin.html" style="color:var(--gold);text-decoration:none;font-size:12px; margin-left:8px; margin-right:8px;">админ</a>' : ''}
      <button id="logoutBtn" title="Выйти" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--muted); cursor:pointer; font-size:16px;">✕</button>
    </div>`;
  document.getElementById('logoutBtn').onclick = async (e)=>{
    e.preventDefault(); await fetch('/auth/logout', {method:'POST'}); location.reload();
  };
}

async function loadCategories() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  try {
    const r = await fetch('/api/categories');
    const { categories } = await r.json();
    grid.innerHTML = '';
    categories.forEach(c => {
      const div = document.createElement('div');
      div.className = 'card'; div.dataset.cat = c.filter; div.dataset.nom = c.id; div.style.cursor = 'pointer';
      const iconHtml = c.image_url ? `<img src="${c.image_url}" style="width:40px; height:40px; object-fit:contain; margin-bottom:12px; display:block;">` : `<span class="emoji">${c.icon}</span>`;
      div.innerHTML = `${iconHtml}<h3>${c.title}</h3><p>${c.description}</p><span class="tag">${c.filter === 'game' ? 'Игровые' : c.filter === 'fun' ? 'Юмор' : c.filter === 'comm' ? 'Комьюнити' : 'Спец'}</span>`;
      div.addEventListener('click', () => window.openVoteModal(c.id, c.title));
      grid.appendChild(div);
    });
  } catch(e) { console.error(e); }
}

window.openVoteModal = async function(nomId, title) {
  const modal = document.getElementById('voteModal');
  const list = document.getElementById('modalList');
  const suggestBtn = document.getElementById('suggestBtnTrigger');
  if (!modal || !list) return;

  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalTitle').dataset.nomid = nomId;
  modal.style.display = 'flex';
  list.innerHTML = '<p style="color:var(--muted)">Загрузка...</p>';

  const { user } = await loadMe();
  
  try {
    const r = await fetch('/api/nominees');
    const data = await r.json();
    const nominees = data.nominees || [];
    const myVotes = data.myVotes || [];
    const catNominees = nominees.filter(n => n.category === nomId);
    
    if (!catNominees.length) {
      list.innerHTML = `<p style="color:var(--muted)">В этой номинации пока нет кандидатов.</p>`;
      return;
    }

    const myVoteInCat = myVotes.find(v => v.category === nomId);
    const votedNomineeId = myVoteInCat ? myVoteInCat.nominee_id : null;
    const hasSuggested = catNominees.some(n => n.created_by && n.created_by.split(',').includes(String(user?.id)));

    if ((votedNomineeId !== null || hasSuggested) && suggestBtn) {
      suggestBtn.style.display = 'none';
    } else if (suggestBtn) {
      suggestBtn.style.display = 'block';
    }

    list.innerHTML = '';

    catNominees.forEach(n=>{
      const isVotedForThis = votedNomineeId === n.id;
      const isDisabled = votedNomineeId !== null && !isVotedForThis;
      const div = document.createElement('div');
      div.className = 'vote-item'; div.style.opacity = isDisabled ? '0.4' : '1';
      const avatarHtml = n.avatar ? `<img src="${n.avatar}">` : n.name[0].toUpperCase();
      
      const descHtml = linkify(n.description || '');

      let btnHTML = '';
      if (isVotedForThis) btnHTML = `<button class="vote-btn voted" disabled>Твой голос</button>`;
      else if (isDisabled) btnHTML = `<button class="vote-btn" disabled>Недоступно</button>`;
      else btnHTML = `<button class="vote-btn" data-id="${n.id}" data-name="${n.name}" data-avatar="${n.avatar || ''}">${user ? 'Голосовать' : 'Войти'}</button>`;
      
      div.innerHTML = `
        <div class="avatar">${avatarHtml}</div>
        <div class="vote-info">
          <h4>${n.name} ${isVotedForThis ? '✅' : ''}</h4>
          <span>${descHtml}</span>
        </div>
        ${btnHTML}`;
      
      list.appendChild(div);
    });

    list.querySelectorAll('.vote-btn:not(:disabled)').forEach(b=>{
      b.onclick = () => {
        if (!user){ location.href = '/auth/twitch'; return; }
        const id = b.dataset.id; const name = b.dataset.name; const avatar = b.dataset.avatar;
        document.getElementById('confirmName').textContent = name;
        const avDiv = document.getElementById('confirmAvatar');
        if (avatar) avDiv.innerHTML = `<img src="${avatar}" style="width:100%; height:100%; object-fit:cover;">`;
        else avDiv.innerHTML = name[0].toUpperCase();
        document.getElementById('confirmModal').style.display = 'flex';
        
        const confirmBtn = document.getElementById('confirmVoteBtn');
        confirmBtn.onclick = async () => {
          confirmBtn.textContent = 'Загрузка...'; confirmBtn.disabled = true;
          const res = await fetch(`/api/vote/${id}`, { method: 'POST' });
          if (res.ok){ window.showToast('Голос принят! 🔥'); window.closeConfirmModal(); window.openVoteModal(nomId, title); }
          else if (res.status === 409) { window.showToast('Вы уже голосовали'); window.closeConfirmModal(); window.openVoteModal(nomId, title); }
          else { window.showToast('Ошибка сервера'); confirmBtn.textContent = 'Голосовать'; confirmBtn.disabled = false; }
        };
      };
    });
  } catch (e) { list.innerHTML = `<p style="color:#ef4444">Ошибка: ${e.message}</p>`; }
};

window.openSuggestModal = async function(nomId) {
  const { user } = await loadMe();
  if (!user) { window.showToast('Войдите через Twitch'); return; }
  document.getElementById('suggestCategoryId').value = nomId; 
  document.getElementById('suggestModal').style.display = 'flex';
};

window.closeSuggestModal = function() { document.getElementById('suggestModal').style.display = 'none'; };
window.closeVoteModal = function() { document.getElementById('voteModal').style.display = 'none'; };
window.closeConfirmModal = function() { 
  document.getElementById('confirmModal').style.display = 'none'; 
  document.getElementById('confirmVoteBtn').textContent = 'Голосовать'; 
  document.getElementById('confirmVoteBtn').disabled = false; 
};

window.submitSuggest = async function() {
  const btn = document.getElementById('suggestBtn');
  btn.textContent = 'Проверка...'; btn.disabled = true;
  
  const body = {
    twitch_login: document.getElementById('s-login').value.trim(),
    category: document.getElementById('suggestCategoryId').value
  };
  if (!body.twitch_login) { window.showToast('Введите ник на Twitch'); btn.textContent = 'Отправить'; btn.disabled = false; return; }

  const res = await fetch('/api/suggest', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body) });
  if (res.ok) {
    window.showToast('Кандидат добавлен! Теперь он доступен только вам.');
    window.closeSuggestModal();
    window.openVoteModal(body.category, document.getElementById('modalTitle').textContent); 
  } else if (res.status === 404) {
    window.showToast('Ошибка: Канал с таким ником не найден на Twitch');
    btn.textContent = 'Отправить'; btn.disabled = false;
  } else {
    window.showToast('Ошибка'); btn.textContent = 'Отправить'; btn.disabled = false;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadCategories();
  await renderAuth();
  
  const vModal = document.getElementById('voteModal');
  if (vModal) vModal.addEventListener('click', function(e) { if (e.target === this) window.closeVoteModal(); });
  const cModal = document.getElementById('confirmModal');
  if (cModal) cModal.addEventListener('click', function(e) { if (e.target === this) window.closeConfirmModal(); });
  const sModal = document.getElementById('suggestModal');
  if (sModal) sModal.addEventListener('click', function(e) { if (e.target === this) window.closeSuggestModal(); });
});