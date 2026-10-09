const view=$('#view');let charts=[];let ME=null;
const OCC={delivery_partner:'Delivery partner (Swiggy, Zomato…)',ride_driver:'Ride driver (Uber, Ola, Rapido…)',street_vendor:'Street vendor',freelancer:'Freelancer / service professional',daily_wage:'Daily-wage worker',other:'Other'};
const PLATFORMS=['Swiggy','Zomato','Zepto','Blinkit','Uber','Ola','Rapido','Porter','Urban Company','Street vending','Freelance','Daily wage','Other'];
const riskPill=r=>`<span class="pill ${r==='Low'?'ok':r==='Medium'?'warn':'bad'}">${r} risk</span>`;
const statusPill=s=>`<span class="pill ${s==='approved'?'ok':s==='rejected'?'bad':'warn'}">${s}</span>`;
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const emi=(p,r,n)=>{const m=r/1200;return m?p*m*Math.pow(1+m,n)/(Math.pow(1+m,n)-1):p/n;};
const mk=(el,cfg)=>{const c=new Chart(el,cfg);charts.push(c);return c;};
const chartBase=()=>({responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:css('--mut')}},y:{grid:{color:css('--line')},ticks:{color:css('--mut')},beginAtZero:true}}});
const loading=()=>{view.innerHTML='<div class="grid g3"><div class="card"><div class="skel" style="height:160px"></div></div><div class="card"><div class="skel" style="height:160px"></div></div><div class="card"><div class="skel" style="height:160px"></div></div></div>';};

function gauge(score,band){
  const len=Math.PI*100,p=(score-300)/550;
  setTimeout(()=>{const g=$('.gp');if(g)g.setAttribute('stroke-dasharray',`${len*p} ${len}`);},60);
  return `<svg viewBox="0 0 240 150"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#ef4444"/><stop offset=".5" stop-color="#f59e0b"/><stop offset="1" stop-color="#22c55e"/></linearGradient></defs>
  <path d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="${css('--line')}" stroke-width="16" stroke-linecap="round"/>
  <path class="gp" d="M20 120 A100 100 0 0 1 220 120" fill="none" stroke="url(#gg)" stroke-width="16" stroke-linecap="round" stroke-dasharray="0 ${len}" style="transition:stroke-dasharray 1.3s cubic-bezier(.2,.8,.2,1)"/>
  <text x="120" y="104" text-anchor="middle" font-size="44" font-weight="800" fill="${css('--ink')}">${score}</text>
  <text x="120" y="125" text-anchor="middle" font-size="13" font-weight="700" fill="${css('--mut')}">${esc(band)}</text>
  <text x="20" y="144" text-anchor="middle" font-size="10" fill="${css('--mut')}">300</text><text x="220" y="144" text-anchor="middle" font-size="10" fill="${css('--mut')}">850</text></svg>`;
}
const factorRows=f=>f.map(x=>`<div class="frow"><span>${esc(x.label)}</span><div class="bar"><i style="width:${x.max?x.points/x.max*100:0}%"></i></div><span>${x.points}/${x.max}</span></div>`).join('');

const pages={
async dashboard(){
  loading();const [s,l]=await Promise.all([api('/me/score'),api('/me/lenders')]);const m=s.metrics,e=s.eligibility;
  const top=l.lenders.filter(x=>x.eligible).slice(0,3);
  view.innerHTML=`<div class="top"><div><h1>Hello, ${esc(ME.name.split(' ')[0])} 👋</h1><p><span class="live"><i></i>Live scoring</span>&nbsp; Here's where your credit stands today.</p></div><a class="btn" href="#/earnings">+ Log today's earnings</a></div>
  ${!m.hasData?`<div class="alert dev">You haven't logged any earnings in the last 90 days. <a href="#/earnings"><b>Add some</b></a> to build an accurate score.</div>`:''}
  <div data-ad-slot></div>
  <div class="grid g3" style="margin-bottom:18px"><div class="card gauge"><div class="kpi"><div class="l">Your credit score</div></div>${gauge(s.score,s.band)}<div>${riskPill(s.risk)}</div><p class="hint">Updated just now · range 300-850</p></div>
  <div style="grid-column:span 2" class="grid g2"><div class="card kpi"><div class="l">Avg monthly income</div><div class="v">${inr(m.income)}</div><div class="s">${m.jobs} jobs/month · ${m.hours} hrs/week</div>${typeof spark==='function'?`<div class="kspark">${spark(s.weekly)}</div>`:''}</div>
  <div class="card kpi"><div class="l">Max eligible loan</div><div class="v" style="color:var(--pri)">${inr(e.maxLoan)}</div><div class="s">at ~${e.rate}% · EMI up to ${inr(e.maxEmi)}</div></div>
  <div class="card kpi"><div class="l">Debt-to-income</div><div class="v">${Math.round(m.dti*100)}%</div><div class="s">${m.dti<.2?'Healthy':m.dti<.4?'Manageable':'High - try reducing'}</div></div>
  <div class="card kpi"><div class="l">Avg platform rating</div><div class="v">${m.rating?m.rating+' ★':'—'}</div><div class="s">${m.weeks} weeks of data</div></div></div></div>
  <div class="grid g2" style="margin-bottom:18px"><div class="card"><h3 style="margin-bottom:14px">Weekly income (last 12 weeks)</h3><div style="height:230px"><canvas id="c1"></canvas></div></div>
  <div class="card"><h3 style="margin-bottom:6px">What's driving your score</h3>${factorRows(s.factors)}<a href="#/score" style="font-size:13.5px;font-weight:700">See full breakdown →</a></div></div>
  <div class="grid g2"><div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><h3>Best loan matches</h3><a href="#/loans" style="font-weight:700;font-size:13.5px">View all →</a></div>
  ${top.length?top.map(x=>`<div class="tip"><div style="flex:1"><b>${esc(x.name)}</b><div class="hint">${esc(x.provider)} · up to ${inr(x.limit)} · from ${x.rate_min}%</div></div><span class="pill info">${x.match}% match</span></div>`).join(''):'<div class="empty">No matches yet - improve your score or add earnings.</div>'}</div>
  <div class="card"><h3 style="margin-bottom:8px">Fastest ways to improve</h3>${s.tips.map(t=>`<div class="tip"><em>+${t.gain} pts</em><div><b>${esc(t.label)}</b><div class="hint">${esc(t.tip)}</div></div></div>`).join('')}</div></div>`;
  mk($('#c1'),{type:'bar',data:{labels:s.weekly.map((_,i)=>i===11?'This wk':`-${11-i}w`),datasets:[{data:s.weekly,backgroundColor:'#14b8a6',borderRadius:6}]},options:chartBase()});
},
async earnings(){
  loading();const rows=await api('/me/earnings');const today=new Date().toISOString().slice(0,10);
  const last30=rows.filter(r=>Date.now()-new Date(r.date)<=30*864e5);const tot=last30.reduce((a,r)=>a+r.income,0);
  const plat={};last30.forEach(r=>{const o=plat[r.platform]=plat[r.platform]||{t:0,d:0};o.t+=r.income;o.d++;});
  const day7=p=>{const out=[];for(let i=6;i>=0;i--){const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10);out.push(rows.filter(r=>r.platform===p&&r.date===d).reduce((a,r)=>a+r.income,0));}return out;};
  const platRows=Object.entries(plat).sort((a,b)=>b[1].t-a[1].t);
  view.innerHTML=`<div class="top"><div><h1>Earnings tracker</h1><p>Every logged day makes your score more accurate.</p></div></div>
  <div class="grid g3" style="margin-bottom:18px"><div class="card kpi"><div class="l">Last 30 days</div><div class="v">${inr(tot)}</div><div class="s">${last30.length} days worked</div></div>
  <div class="card kpi"><div class="l">Daily average</div><div class="v">${inr(last30.length?tot/last30.length:0)}</div><div class="s">on working days</div></div>
  <div class="card kpi"><div class="l">Total records</div><div class="v">${rows.length}</div><div class="s">all time</div></div></div>
  ${platRows.length?`<div class="card tw" style="margin-bottom:18px"><h3 style="margin-bottom:6px">Where your income comes from <span class="hint">· last 30 days</span></h3><table><thead><tr><th>Platform / work</th><th>Income</th><th>Days</th><th>Avg / day</th><th>7-day trend</th></tr></thead><tbody>${platRows.map(([k,v])=>`<tr><td><b style="font-family:inherit">${esc(k)}</b></td><td><b>${inr(v.t)}</b></td><td>${v.d}</td><td>${inr(v.t/v.d)}</td><td class="sparkcell">${typeof spark==='function'?spark(day7(k)):''}</td></tr>`).join('')}</tbody></table></div>`:''}
  <div class="grid" style="grid-template-columns:minmax(280px,380px) 1fr;align-items:start"><form class="card" id="ef"><h3 style="margin-bottom:16px">Add a day</h3>
  <div class="field"><label>Date</label><input type="date" id="d" value="${today}" max="${today}" required></div>
  <div class="field"><label>Platform / work</label><select id="p">${PLATFORMS.map(p=>`<option>${p}</option>`).join('')}</select></div>
  <div class="row"><div class="field"><label>Income (₹)</label><input type="number" id="i" min="1" required placeholder="1200"></div><div class="field"><label>Hours</label><input type="number" id="h" step="0.5" min="0.5" max="24" required placeholder="8"></div></div>
  <div class="row"><div class="field"><label>Jobs done</label><input type="number" id="j" min="0" required placeholder="14"></div><div class="field"><label>Rating (opt.)</label><input type="number" id="r" min="1" max="5" step="0.1" placeholder="4.7"></div></div>
  <button class="btn block">Save entry</button></form>
  <div class="card tw"><h3 style="margin-bottom:10px">Recent entries</h3>${rows.length?`<table><thead><tr><th>Date</th><th>Work</th><th>Income</th><th>Hrs</th><th>Jobs</th><th>★</th><th></th></tr></thead><tbody>${rows.slice(0,40).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.platform)}</td><td><b>${inr(r.income)}</b></td><td>${r.hours}</td><td>${r.jobs}</td><td>${r.rating||'—'}</td><td><button class="btn ghost sm" data-del="${r.id}" aria-label="Delete">🗑</button></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No entries yet. Add your first day →</div>'}</div></div>`;
  $('#ef').onsubmit=async ev=>{ev.preventDefault();try{await api('/me/earnings',{method:'POST',body:{date:$('#d').value,platform:$('#p').value,income:$('#i').value,hours:$('#h').value,jobs:$('#j').value,rating:$('#r').value}});toast('Saved ✓ Score updated');pages.earnings();}catch(e){toast(e.message,1);}};
  $$('[data-del]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this entry?'))return;await api('/me/earnings/'+b.dataset.del,{method:'DELETE',body:{}});pages.earnings();});
},
async score(){
  loading();const s=await api('/me/score');
  view.innerHTML=`<div class="top"><div><h1>Credit score & explanation</h1><p>Every point is explained - no black box.</p></div></div>
  <div class="grid g2" style="margin-bottom:18px"><div class="card gauge">${gauge(s.score,s.band)}<div>${riskPill(s.risk)}</div>
  <div style="display:flex;justify-content:space-between;margin-top:18px;font-size:12px;color:var(--mut)"><span>300-599<br><b style="color:var(--bad)">High risk</b></span><span>600-699<br><b style="color:var(--warn)">Medium</b></span><span>700-850<br><b style="color:var(--ok)">Low risk</b></span></div>
  <hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><p style="text-align:left"><b>Loan capacity:</b> up to <b style="color:var(--pri)">${inr(s.eligibility.maxLoan)}</b> at about ${s.eligibility.rate}% p.a.</p></div>
  <div class="card"><h3 style="margin-bottom:8px">Score history</h3><div style="height:250px"><canvas id="hc"></canvas></div></div></div>
  <div class="card tw" style="margin-bottom:18px"><h3 style="margin-bottom:6px">Factor-by-factor breakdown</h3><table><thead><tr><th>Factor</th><th>Weight</th><th style="min-width:160px">Contribution</th><th>Points</th><th>How to improve</th></tr></thead><tbody>
  ${s.factors.map(f=>`<tr><td><b>${esc(f.label)}</b></td><td>${f.weight}%</td><td><div class="bar"><i style="width:${f.max?f.points/f.max*100:0}%"></i></div></td><td><b>${f.points}</b>/${f.max}</td><td style="color:var(--mut);font-size:13px;min-width:240px">${esc(f.tip)}</td></tr>`).join('')}</tbody></table></div>
  <div class="card sim"><h3>🎛️ What-if simulator</h3><p class="hint" style="margin-bottom:18px">Drag the sliders to see how changes would affect your score (nothing is saved).</p>
  <div class="grid g2"><div>
  ${[['income','Monthly income',0,100000,1000,s.metrics.income,v=>inr(v)],['debt','Monthly debt EMIs',0,40000,500,s.metrics.debt,v=>inr(v)],['upi','UPI transactions / month',0,150,1,s.metrics.upi,v=>v],['bills','Bills paid on time',0,100,5,s.metrics.bills,v=>v+'%'],['rating','Platform rating',1,5,.1,s.metrics.rating||4,v=>(+v).toFixed(1)+' ★']].map(([k,l,mn,mx,st,v,f])=>`<div class="si"><div><span>${l}</span><span id="v_${k}">${f(v)}</span></div><input type="range" data-k="${k}" min="${mn}" max="${mx}" step="${st}" value="${v}"></div>`).join('')}</div>
  <div style="text-align:center;align-self:center"><div class="hint">Projected score</div><div id="sim" style="font-size:64px;font-weight:800;letter-spacing:-.04em">${s.score}</div><div id="simd" class="pill mut">no change</div><p id="simn" class="hint" style="margin-top:12px">Loan capacity: ${inr(s.eligibility.maxLoan)}</p></div></div></div>`;
  const fm={income:inr,debt:inr,upi:v=>v,bills:v=>v+'%',rating:v=>(+v).toFixed(1)+' ★'};let tm;
  $$('[data-k]').forEach(r=>r.oninput=()=>{$('#v_'+r.dataset.k).textContent=fm[r.dataset.k](r.value);clearTimeout(tm);tm=setTimeout(async()=>{
    const body={};$$('[data-k]').forEach(x=>body[x.dataset.k]=x.value);const o=await api('/me/simulate',{method:'POST',body});const d=o.score-s.score;
    $('#sim').textContent=o.score;const p=$('#simd');p.textContent=d===0?'no change':(d>0?'▲ +':'▼ ')+d+' pts';p.className='pill '+(d>0?'ok':d<0?'bad':'mut');$('#simn').textContent='Loan capacity: '+inr(o.eligibility.maxLoan)+' · '+o.risk+' risk';},120);});
  const h=s.history.length>1?s.history:[...s.history,...s.history];
  mk($('#hc'),{type:'line',data:{labels:h.map(x=>fdate(x.created_at)),datasets:[{data:h.map(x=>x.score),borderColor:'#14b8a6',backgroundColor:'rgba(20,184,166,.15)',fill:true,tension:.35,pointRadius:4}]},options:{...chartBase(),scales:{...chartBase().scales,y:{...chartBase().scales.y,beginAtZero:false,min:300,max:850}}}});
},
async loans(){
  loading();const d=await api('/me/lenders');let f='all',sort='match';
  const types=[...new Set(d.lenders.map(l=>l.type))];
  const draw=()=>{let L=d.lenders.filter(l=>f==='all'||(f==='eligible'?l.eligible:l.type===f));
    if(sort==='rate')L=[...L].sort((a,b)=>a.rate_min-b.rate_min);if(sort==='amount')L=[...L].sort((a,b)=>b.max_amount-a.max_amount);
    $('#ll').innerHTML=L.map(l=>`<div class="card lender ${l.eligible?'':'no'}">${l.eligible?`<span class="match">${l.match}% match</span>`:''}
    <div><span class="pill ${l.scheme?'ok':'info'}">${esc(l.type)}</span></div><h3 style="padding-right:80px">${esc(l.name)}</h3><div class="prov">${esc(l.provider)}</div>
    <p style="font-size:13.5px;color:var(--mut)">${esc(l.note)}</p>
    <div class="meta"><div><small>Interest</small><b>${l.rate_min}-${l.rate_max}%</b></div><div><small>${l.eligible?'You can get':'Up to'}</small><b>${inr(l.eligible?l.limit:l.max_amount)}</b></div><div><small>Tenure</small><b>≤ ${l.tenure_max} mo</b></div></div>
    <div class="hint">📄 ${esc(l.docs)}</div>
    ${l.eligible?'':`<div class="alert dev" style="margin:0">🔒 ${esc(l.reason)}</div>`}
    <div style="display:flex;gap:8px;margin-top:auto"><button class="btn sm" style="flex:1" data-apply="${l.id}" ${l.eligible?'':'disabled'}>Apply now</button><a class="btn ghost sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">Official site ↗</a></div></div>`).join('')||'<div class="empty">No lenders match this filter.</div>';
    $$('[data-apply]').forEach(b=>b.onclick=()=>applyModal(d.lenders.find(x=>x.id===b.dataset.apply)));
    $$('.fchip').forEach(c=>c.classList.toggle('on',c.dataset.f===f));};
  view.innerHTML=`<div class="top"><div><h1>Loan marketplace</h1><p>Real lenders & schemes, matched to your score of <b>${d.score}</b>. You can borrow up to <b style="color:var(--pri)">${inr(d.eligibility.maxLoan)}</b>.</p></div>
  <select id="sort" style="width:auto"><option value="match">Sort: Best match</option><option value="rate">Sort: Lowest rate</option><option value="amount">Sort: Highest amount</option></select></div>
  <div data-ad-slot></div>
  <div class="filters"><button class="fchip" data-f="all">All (${d.lenders.length})</button><button class="fchip" data-f="eligible">✓ Eligible (${d.lenders.filter(l=>l.eligible).length})</button>${types.map(t=>`<button class="fchip" data-f="${esc(t)}">${esc(t)}</button>`).join('')}</div>
  <div class="grid g3" id="ll"></div><p class="hint" style="margin-top:20px">Rates and limits are indicative from each lender's public information. Final approval, pricing and terms are decided by the lender - confirm on their official site.</p>`;
  $$('.fchip').forEach(c=>c.onclick=()=>{f=c.dataset.f;draw();});$('#sort').onchange=e=>{sort=e.target.value;draw();};draw();
},
async applications(){
  loading();const a=await api('/me/loans');
  view.innerHTML=`<div class="top"><div><h1>My applications</h1><p>Track every loan request in one place.</p></div><a class="btn" href="#/loans">Browse lenders</a></div>
  <div class="card tw">${a.length?`<table><thead><tr><th>Product</th><th>Amount</th><th>Tenure</th><th>Score</th><th>Applied</th><th>Status</th><th>Banker note</th></tr></thead><tbody>${a.map(x=>`<tr><td><b>${esc(x.product)}</b><div class="hint">${esc(x.purpose||'')}</div></td><td>${inr(x.amount)}</td><td>${x.tenure_months} mo</td><td>${x.score_at_apply}</td><td>${fdate(x.created_at)}</td><td>${statusPill(x.status)}</td><td style="color:var(--mut)">${esc(x.reviewer_note||'—')}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">You have not applied anywhere yet.<br><br><a class="btn sm" href="#/loans">Find a loan</a></div>'}</div>`;
},
async profile(){
  loading();const p=await api('/me/profile');
  view.innerHTML=`<div class="top"><div><h1>Profile & financial details</h1><p>These alternative-data signals feed your credit score.</p></div></div>
  <form class="card" id="pf" style="max-width:820px"><div class="row"><div class="field"><label>Full name</label><input id="n" value="${esc(p.name)}" required></div><div class="field"><label>Email (verified)</label><input value="${esc(p.email)}" disabled></div></div>
  <div class="row"><div class="field"><label>Mobile (encrypted)</label><input id="ph" value="${esc(p.phone)}" placeholder="9876543210" inputmode="numeric"></div><div class="field"><label>PAN (optional, encrypted)</label><input id="pan" value="${esc(p.pan)}" placeholder="ABCDE1234F" maxlength="10"></div></div>
  <div class="row"><div class="field"><label>Type of work</label><select id="oc">${Object.entries(OCC).map(([k,v])=>`<option value="${k}" ${k===p.occupation?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>City</label><input id="ct" value="${esc(p.city)}" placeholder="Mumbai"></div></div>
  <h3 style="margin:8px 0 14px">Financial signals</h3>
  <div class="row"><div class="field"><label>Typical monthly income (₹)</label><input type="number" id="di" min="0" value="${p.declared_income}"><div class="hint">Used only until you have logged earnings.</div></div><div class="field"><label>Monthly loan EMIs / debts (₹)</label><input type="number" id="md" min="0" value="${p.monthly_debt}"></div></div>
  <div class="row"><div class="field"><label>UPI transactions per month</label><input type="number" id="up" min="0" value="${p.upi_txns}"></div><div class="field"><label>Bills paid on time (%)</label><input type="number" id="bo" min="0" max="100" value="${p.bill_ontime}"><div class="hint">Electricity, mobile, rent…</div></div></div>
  <div class="field" style="max-width:300px"><label>Months since you started this work</label><input type="number" id="am" min="0" value="${p.account_age_months}"></div>
  <button class="btn">Save & recalculate score</button></form>`;
  $('#pf').onsubmit=async e=>{e.preventDefault();try{await api('/me/profile',{method:'PUT',body:{name:$('#n').value,phone:$('#ph').value,pan:$('#pan').value,occupation:$('#oc').value,city:$('#ct').value,declared_income:$('#di').value,monthly_debt:$('#md').value,upi_txns:$('#up').value,bill_ontime:$('#bo').value,account_age_months:$('#am').value}});toast('Profile saved ✓');ME.name=$('#n').value;$('#uname').textContent=ME.name;}catch(er){toast(er.message,1);}};
},
async privacy(){
  loading();const [log,p]=await Promise.all([api('/me/activity'),api('/me/profile')]);
  view.innerHTML=`<div class="top"><div><h1>Privacy & data control</h1><p>You decide what happens to your data.</p></div></div>
  <div class="grid g2" style="margin-bottom:18px"><div class="card"><h3 style="margin-bottom:10px">How we protect you</h3>
  ${[['🔑','Passwords hashed with bcrypt - nobody can read them'],['🧬','Phone & PAN encrypted with AES-256-GCM'],['🍪','HttpOnly session cookie - safe from script theft'],['✉️','Email OTP verification and rate-limited sign-ins'],['🙈','Bankers see only masked contact details']].map(([i,t])=>`<div class="tip"><span style="font-size:20px">${i}</span><div>${t}</div></div>`).join('')}</div>
  <div class="card"><h3 style="margin-bottom:10px">Your rights</h3><p style="color:var(--mut);font-size:14.5px;margin-bottom:16px">We use your data only to calculate your score and match loans. Download a full copy or permanently erase your account.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="/api/me/export" download>⬇ Download my data</a><button class="btn danger" id="del">Delete my account</button></div>
  <p class="hint" style="margin-top:14px">Member since ${fdate(p.created_at)}</p></div></div>
  <div class="card tw"><h3 style="margin-bottom:6px">Recent account activity</h3><table><thead><tr><th>Action</th><th>IP</th><th>When</th></tr></thead><tbody>${log.map(l=>`<tr><td>${esc(l.action.replace(/_/g,' '))}</td><td>${esc(l.ip)}</td><td>${fdate(l.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
  $('#del').onclick=()=>modal(`<h2 style="margin-bottom:8px">Delete account?</h2><p style="color:var(--mut);margin-bottom:16px">This permanently erases your profile, earnings, scores and applications. It cannot be undone.</p><div class="field"><label>Confirm with your password</label><input type="password" id="dp"></div><div style="display:flex;gap:10px"><button class="btn danger" id="dgo" style="flex:1">Delete forever</button><button class="btn ghost" data-close>Cancel</button></div>`,m=>{$('#dgo',m).onclick=async()=>{try{await api('/me/delete',{method:'POST',body:{password:$('#dp').value}});location.href='/';}catch(e){toast(e.message,1);}};});
}};

function modal(html,after){const o=document.createElement('div');o.className='overlay';o.innerHTML=`<div class="modal">${html}</div>`;document.body.appendChild(o);
  const close=()=>o.remove();o.onclick=e=>{if(e.target===o)close();};$$('[data-close]',o).forEach(b=>b.onclick=close);after&&after(o,close);return close;}
function applyModal(l){
  const max=l.limit,min=l.min_amount,step=max>200000?5000:1000,tens=[6,12,18,24,36,48,60].filter(t=>t<=l.tenure_max);
  modal(`<h2 style="margin-bottom:4px">Apply: ${esc(l.name)}</h2><p class="hint" style="margin-bottom:18px">${esc(l.provider)} · indicative rate ${l.your_rate}% p.a.</p>
  <div class="field"><label>Loan amount: <span id="av" style="color:var(--pri)">${inr(Math.min(max,Math.max(min,Math.round(max/2/step)*step)))}</span></label><input type="range" id="am" min="${min}" max="${max}" step="${step}" value="${Math.min(max,Math.max(min,Math.round(max/2/step)*step))}"><div class="hint">${inr(min)} - ${inr(max)}</div></div>
  <div class="field"><label>Tenure</label><select id="tn">${tens.map(t=>`<option value="${t}" ${t===tens[Math.min(1,tens.length-1)]?'selected':''}>${t} months</option>`).join('')}</select></div>
  <div class="field"><label>Purpose</label><input id="pu" maxlength="120" placeholder="e.g. Bike repair, stock for my stall"></div>
  <div class="card" style="padding:14px;background:var(--bg);box-shadow:none;margin-bottom:16px;display:flex;justify-content:space-between"><span>Estimated EMI</span><b id="em" style="color:var(--pri)"></b></div>
  <div style="display:flex;gap:10px"><button class="btn" id="go" style="flex:1">Submit application</button><button class="btn ghost" data-close>Cancel</button></div>`,(m,close)=>{
    const upd=()=>{$('#av',m).textContent=inr($('#am',m).value);$('#em',m).textContent=inr(emi(+$('#am',m).value,l.your_rate,+$('#tn',m).value))+' / month';};
    $('#am',m).oninput=upd;$('#tn',m).onchange=upd;upd();
    $('#go',m).onclick=async()=>{try{await api('/me/loans',{method:'POST',body:{lender_id:l.id,amount:$('#am',m).value,tenure_months:$('#tn',m).value,purpose:$('#pu',m).value}});close();toast('Application submitted ✓');location.hash='#/applications';}catch(e){toast(e.message,1);}};});
}

async function route(){
  charts.forEach(c=>c.destroy());charts=[];
  const name=(location.hash.replace('#/','')||'dashboard');const key=pages[name]?name:'dashboard';
  $$('#nav a').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#/'+key));
  try{await pages[key]();window.scrollTo(0,0);}catch(e){if(e.status===401)location.href='/login.html';else view.innerHTML=`<div class="card empty">Something went wrong: ${esc(e.message)}</div>`;}
}
(async()=>{
  try{ME=await api('/auth/me');}catch{location.href='/login.html';return;}
  if(ME.role==='admin'){location.href='/admin.html';return;}
  $('#uname').textContent=ME.name;$('#uemail').textContent=ME.email;$('#logout').onclick=logout;
  window.addEventListener('hashchange',route);document.addEventListener('themechange',route);route();
})();
