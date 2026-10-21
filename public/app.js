/* ---------- фильтр категорий ---------- */
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

/* ---------- toast ---------- */
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tm);
  t._tm = setTimeout(()=>t.classList.remove('show'), 2600);
}

/* ---------- auth ---------- */
async function loadMe(){
  const r = await fetch('/api/me');
  return r.json();
}
async function renderAuth(){
  const { user, isAdmin } = await loadMe();
  const box = document.getElementById('authBox');
  if (!user){
    box.innerHTML = `<a href="/auth/twitch" class="btn btn-primary">Войти через Twitch</a>`;
    return;
  }
  box.innerHTML = `
    <div class="user-chip">
      <img src="${user.avatar}" alt="">
      <span>${user.display_name}</span>
      ${isAdmin ? '<a href="/admin.html" style="color:var(--gold);text-decoration:none;font-size:12px">админ</a>' : ''}
      <button id="logoutBtn" title="Выйти">✕</button>
    </div>`;
  document.getElementById('logoutBtn').onclick = async ()=>{
    await fetch('/auth/logout', {method:'POST'});
    location.reload();
  };
}

/* ---------- голосование ---------- */
async function loadVotes(){
  const { user } = await loadMe();
  const r = await fetch('/api/nominees');
  const { nominees, myVotes } = await r.json();
  const total = nominees.reduce((s,n)=>s+n.votes,0);
  const list = document.getElementById('voteList');
  list.innerHTML = '';

  if (!nominees.length){
    list.innerHTML = '<p style="color:var(--muted)">Пока нет номинантов.</p>';
    return;
  }

  nominees.forEach(n=>{
    const pct = total ? Math.round(n.votes/total*100) : 0;
    const voted = myVotes.includes(n.id);
    const div = document.createElement('div');
    div.className = 'vote-item';
    div.innerHTML = `
      <div class="avatar">${n.avatar ? `<img src="${n.avatar}">` : n.name[0]}</div>
      <div class="vote-info">
        <h4>${n.name} ${voted ? '✅' : ''}</h4>
        <span>${n.description || ''}</span>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span style="font-size:12px;color:var(--gold)">${n.votes} голосов · ${pct}%</span>
      </div>
      <button class="vote-btn ${voted?'voted':''}" data-id="${n.id}" ${voted?'disabled':''}>
        ${voted ? 'Твой голос' : (user ? 'Голосовать' : 'Войти, чтобы голосовать')}
      </button>`;
    list.appendChild(div);
  });

  list.querySelectorAll('.vote-btn').forEach(b=>{
    b.onclick = async ()=>{
      if (!user){ location.href = '/auth/twitch'; return; }
      const id = b.dataset.id;
      const res = await fetch(`/api/vote/${id}`, {method:'POST'});
      if (res.ok){ showToast('Голос принят! 🔥'); loadVotes(); }
      else if (res.status === 409) showToast('Ты уже голосовал за этого номинанта');
      else showToast('Ошибка голосования');
    };
  });
}

/* ---------- countdown ---------- */
const deadline = new Date();
deadline.setDate(deadline.getDate() + 14);
deadline.setHours(23,59,59,0);
function tick(){
  const diff = deadline - new Date();
  if (diff <= 0){
    ['cd-d','cd-h','cd-m','cd-s'].forEach(id=>document.getElementById(id).textContent = '00');
    return;
  }
  const pad = v => String(v).padStart(2,'0');
  document.getElementById('cd-d').textContent = pad(Math.floor(diff/864e5));
  document.getElementById('cd-h').textContent = pad(Math.floor(diff%864e5/36e5));
  document.getElementById('cd-m').textContent = pad(Math.floor(diff%36e5/6e4));
  document.getElementById('cd-s').textContent = pad(Math.floor(diff%6e4/1e3));
}

/* ---------- init ---------- */
(async ()=>{
  await renderAuth();
  await loadVotes();
  tick();
  setInterval(tick, 1000);
})();