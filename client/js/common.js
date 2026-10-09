(function(){const t=localStorage.getItem('fi-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;})();
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>'₹'+Math.round(n||0).toLocaleString('en-IN');
const fdate=d=>new Date(String(d).replace(' ','T')+(String(d).includes('T')||String(d).includes('Z')?'':'Z')).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
async function api(path,opt={}){
  const o={method:opt.method||'GET',headers:{},credentials:'same-origin'};
  if(opt.body!==undefined){o.headers['Content-Type']='application/json';o.body=JSON.stringify(opt.body);}
  const r=await fetch('/api'+path,o); let d={}; try{d=await r.json();}catch{}
  if(!r.ok){const e=new Error(d.error||'Request failed');e.status=r.status;e.data=d;throw e;}
  return d;
}
function toast(msg,err){let t=$('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}t.textContent=msg;t.className='toast show'+(err?' err':'');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3400);}
function toggleTheme(){const n=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=n;localStorage.setItem('fi-theme',n);document.dispatchEvent(new Event('themechange'));$$('.theme').forEach(b=>b.textContent=n==='dark'?'☀️':'🌙');}
document.addEventListener('DOMContentLoaded',()=>{$$('.theme').forEach(b=>{b.textContent=document.documentElement.dataset.theme==='dark'?'☀️':'🌙';b.addEventListener('click',toggleTheme);});});
async function logout(){try{await api('/auth/logout',{method:'POST',body:{}});}catch{}location.href='/login.html';}
const brand=`<a class="brand" href="/"><span class="logo">₹</span><span>Fin<b>Inclusive</b></span></a>`;
