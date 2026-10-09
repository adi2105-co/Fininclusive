const view=$('#view');let charts=[],ME;
const riskPill=r=>`<span class="pill ${r==='Low'?'ok':r==='Medium'?'warn':'bad'}">${r}</span>`;
const statusPill=s=>`<span class="pill ${s==='approved'?'ok':s==='rejected'?'bad':'warn'}">${s}</span>`;
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function modal(html,after){const o=document.createElement('div');o.className='overlay';o.innerHTML=`<div class="modal" style="max-width:640px">${html}</div>`;document.body.appendChild(o);const close=()=>o.remove();o.onclick=e=>{if(e.target===o)close();};$$('[data-close]',o).forEach(b=>b.onclick=close);after&&after(o,close);}
const pages={
async overview(){
  const s=await api('/admin/stats');const g=k=>s.applications.find(a=>a.status===k)||{c:0,amt:0};
  view.innerHTML=`<div class="top"><div><h1>Banker overview</h1><p>Platform health at a glance.</p></div></div>
  <div class="grid g4" style="margin-bottom:18px"><div class="card kpi"><div class="l">Registered workers</div><div class="v">${s.workers}</div></div><div class="card kpi"><div class="l">Average score</div><div class="v">${s.avgScore||'—'}</div></div>
  <div class="card kpi"><div class="l">Pending reviews</div><div class="v" style="color:var(--warn)">${g('pending').c}</div><div class="s">${inr(g('pending').amt)}</div></div><div class="card kpi"><div class="l">Approved</div><div class="v" style="color:var(--ok)">${g('approved').c}</div><div class="s">${inr(g('approved').amt)}</div></div></div>
  <div class="grid g2"><div class="card"><h3 style="margin-bottom:10px">Risk distribution</h3><div style="height:230px"><canvas id="rc"></canvas></div></div>
  <div class="card"><h3 style="margin-bottom:8px">Latest applications</h3>${s.recent.length?s.recent.map(r=>`<div class="tip"><div style="flex:1"><b>${esc(r.name)}</b><div class="hint">${esc(r.product)} · ${inr(r.amount)}</div></div>${statusPill(r.status)}</div>`).join(''):'<div class="empty">No applications yet.</div>'}<a href="#/loans" style="font-weight:700;font-size:13.5px">Open review queue →</a></div></div>`;
  charts.push(new Chart($('#rc'),{type:'doughnut',data:{labels:['Low risk','Medium risk','High risk'],datasets:[{data:[s.bands.Low,s.bands.Medium,s.bands.High],backgroundColor:['#22c55e','#f59e0b','#ef4444'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{color:css('--ink')}}}}}));
},
async workers(){
  view.innerHTML=`<div class="top"><div><h1>Workers</h1><p>Search and review credit profiles.</p></div><input id="q" placeholder="Search name or email…" style="max-width:300px"></div><div class="card tw" id="wt"></div>`;
  const load=async()=>{const w=await api('/admin/workers?q='+encodeURIComponent($('#q').value));
    $('#wt').innerHTML=w.length?`<table><thead><tr><th>Name</th><th>Work</th><th>City</th><th>Income/mo</th><th>Score</th><th>Risk</th><th></th></tr></thead><tbody>${w.map(x=>`<tr><td><b>${esc(x.name)}</b><div class="hint">${esc(x.email)}</div></td><td>${esc(x.occupation.replace('_',' '))}</td><td>${esc(x.city||'—')}</td><td>${inr(x.income)}</td><td><b>${x.score}</b></td><td>${riskPill(x.risk)}</td><td><button class="btn ghost sm" data-w="${x.id}">View</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No workers found.</div>';
    $$('[data-w]').forEach(b=>b.onclick=()=>detail(b.dataset.w));};
  let t;$('#q').oninput=()=>{clearTimeout(t);t=setTimeout(load,250);};load();
},
async loans(){
  let st='';view.innerHTML=`<div class="top"><div><h1>Loan review queue</h1><p>Approve or reject worker applications.</p></div><select id="st" style="width:auto"><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div><div class="card tw" id="lt"></div>`;
  const load=async()=>{const a=await api('/admin/loans'+(st?'?status='+st:''));
    $('#lt').innerHTML=a.length?`<table><thead><tr><th>Applicant</th><th>Product</th><th>Amount</th><th>Score</th><th>Applied</th><th>Status</th><th></th></tr></thead><tbody>${a.map(x=>`<tr><td><b>${esc(x.name)}</b><div class="hint">${esc(x.email)}</div></td><td>${esc(x.product)}<div class="hint">${x.tenure_months} mo · ${esc(x.purpose||'')}</div></td><td><b>${inr(x.amount)}</b></td><td>${x.score_at_apply}</td><td>${fdate(x.created_at)}</td><td>${statusPill(x.status)}${x.reviewer_note?`<div class="hint">${esc(x.reviewer_note)}</div>`:''}</td><td style="white-space:nowrap">${x.status==='pending'?`<button class="btn sm" data-a="${x.id}" data-s="approved">Approve</button> <button class="btn danger sm" data-a="${x.id}" data-s="rejected">Reject</button>`:''}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Nothing here.</div>';
    $$('[data-a]').forEach(b=>b.onclick=()=>modal(`<h2 style="margin-bottom:12px">${b.dataset.s==='approved'?'Approve':'Reject'} application #${b.dataset.a}</h2><div class="field"><label>Note to applicant (optional)</label><textarea id="nt" rows="3" maxlength="300" placeholder="Reason or next steps"></textarea></div><div style="display:flex;gap:10px"><button class="btn ${b.dataset.s==='rejected'?'danger':''}" id="ok" style="flex:1">Confirm</button><button class="btn ghost" data-close>Cancel</button></div>`,(m,close)=>{$('#ok',m).onclick=async()=>{try{await api('/admin/loans/'+b.dataset.a,{method:'PATCH',body:{status:b.dataset.s,note:$('#nt',m).value}});close();toast('Updated ✓');load();}catch(e){toast(e.message,1);}};}));};
  $('#st').onchange=e=>{st=e.target.value;load();};load();
}};
async function detail(id){
  const d=await api('/admin/workers/'+id),s=d.score;
  modal(`<div style="display:flex;justify-content:space-between;align-items:start"><div><h2>${esc(d.profile.name)}</h2><p class="hint">${esc(d.profile.email)} · ${esc(d.profile.phone||'no phone')} · ${esc(d.profile.city||'')}</p></div><div style="text-align:right"><div style="font-size:38px;font-weight:800;line-height:1">${s.score}</div>${riskPill(s.risk)}</div></div>
  <div class="grid g3" style="margin:16px 0"><div class="card kpi" style="padding:12px"><div class="l">Income</div><div class="v" style="font-size:19px">${inr(s.metrics.income)}</div></div><div class="card kpi" style="padding:12px"><div class="l">DTI</div><div class="v" style="font-size:19px">${Math.round(s.metrics.dti*100)}%</div></div><div class="card kpi" style="padding:12px"><div class="l">Max loan</div><div class="v" style="font-size:19px">${inr(s.eligibility.maxLoan)}</div></div></div>
  ${s.factors.map(f=>`<div class="frow"><span>${esc(f.label)}</span><div class="bar"><i style="width:${f.max?f.points/f.max*100:0}%"></i></div><span>${f.points}/${f.max}</span></div>`).join('')}
  <h3 style="margin:16px 0 6px">Applications</h3>${d.applications.length?d.applications.map(a=>`<div class="tip"><div style="flex:1"><b>${esc(a.product)}</b><div class="hint">${inr(a.amount)} · ${fdate(a.created_at)}</div></div>${statusPill(a.status)}</div>`).join(''):'<p class="hint">None yet.</p>'}
  <button class="btn ghost block" data-close style="margin-top:14px">Close</button>`);
}
async function route(){charts.forEach(c=>c.destroy());charts=[];const n=location.hash.replace('#/','')||'overview';const k=pages[n]?n:'overview';
  $$('#nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#/'+k));
  try{await pages[k]();}catch(e){if(e.status===401||e.status===403)location.href='/login.html';else view.innerHTML=`<div class="card empty">${esc(e.message)}</div>`;}}
(async()=>{try{ME=await api('/auth/me');}catch{location.href='/login.html';return;}
  if(ME.role!=='admin'){location.href='/app.html';return;}
  $('#uname').textContent=ME.name;$('#logout').onclick=logout;window.addEventListener('hashchange',route);document.addEventListener('themechange',route);route();})();
