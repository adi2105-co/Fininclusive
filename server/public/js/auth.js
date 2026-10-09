const page=document.body.dataset.page; const msg=$('#msg');
const show=(t,k='err')=>{msg.innerHTML=t?`<div class="alert ${k}">${esc(t)}</div>`:'';};
const devHint=c=>c&&show(`Dev mode (email not configured): your code is ${c}`,'dev');
const qs=new URLSearchParams(location.search);

function otpBoxes(box){
  box.innerHTML=Array.from({length:6},()=>'<input inputmode="numeric" maxlength="1" autocomplete="one-time-code">').join('');
  const ins=$$('input',box);
  ins.forEach((i,k)=>{
    i.addEventListener('input',()=>{i.value=i.value.replace(/\D/g,'');if(i.value&&ins[k+1])ins[k+1].focus();});
    i.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!i.value&&ins[k-1])ins[k-1].focus();});
    i.addEventListener('paste',e=>{const t=(e.clipboardData.getData('text')||'').replace(/\D/g,'').slice(0,6);if(!t)return;e.preventDefault();t.split('').forEach((c,n)=>ins[n]&&(ins[n].value=c));ins[Math.min(t.length,5)].focus();});
  });
  return {get:()=>ins.map(i=>i.value).join(''),focus:()=>ins[0].focus()};
}
function strength(pw){let s=0;if(pw.length>=8)s++;if(/[A-Z]/.test(pw))s++;if(/[a-z]/.test(pw))s++;if(/\d/.test(pw))s++;if(/[^A-Za-z0-9]/.test(pw)||pw.length>=12)s++;return s;}
function wirePw(){const p=$('#password');if(!p)return;const m=$('.meter i');p&&m&&p.addEventListener('input',()=>{const s=strength(p.value);m.style.width=s*20+'%';m.style.background=['#dc2626','#dc2626','#f59e0b','#eab308','#16a34a','#16a34a'][s];});
  $$('.eye').forEach(b=>b.addEventListener('click',()=>{const i=b.previousElementSibling;i.type=i.type==='password'?'text':'password';}));}
function countdown(btn,sec=30){btn.disabled=true;let s=sec;const l=btn.dataset.l||btn.textContent;btn.dataset.l=l;const t=setInterval(()=>{btn.textContent=`Resend in ${--s}s`;if(s<=0){clearInterval(t);btn.disabled=false;btn.textContent=l;}},1000);btn.textContent=`Resend in ${s}s`;}
const go=role=>location.href=role==='admin'?'/admin.html':'/app.html';
wirePw();

if(page==='login'){
  if(qs.get('reset'))show('Password updated. Please sign in.','ok');
  $('#f').addEventListener('submit',async e=>{e.preventDefault();const b=$('button[type=submit]');b.disabled=true;show('');
    try{const r=await api('/auth/login',{method:'POST',body:{email:$('#email').value,password:$('#password').value}});go(r.role);}
    catch(err){if(err.data&&err.data.needsVerify){sessionStorage.setItem('fi-verify',err.data.email);sessionStorage.setItem('fi-dev',err.data.devOtp||'');location.href='/register.html?verify=1';return;}show(err.message);b.disabled=false;}});
}
if(page==='register'){
  let email='';const ob=otpBoxes($('#otpbox'));
  const toOtp=(em,dev)=>{email=em;$('#step1').hidden=true;$('#step2').hidden=false;$('#sentto').textContent=em;ob.focus();countdown($('#resend'));devHint(dev);};
  if(qs.get('verify')&&sessionStorage.getItem('fi-verify')){toOtp(sessionStorage.getItem('fi-verify'),sessionStorage.getItem('fi-dev'));}
  $('#f').addEventListener('submit',async e=>{e.preventDefault();const b=$('#f button[type=submit]');b.disabled=true;show('');
    try{const r=await api('/auth/register',{method:'POST',body:{name:$('#name').value,email:$('#email').value,phone:$('#phone').value,password:$('#password').value,consent:$('#consent').checked}});toOtp(r.email,r.devOtp);}
    catch(err){show(err.message);}b.disabled=false;});
  $('#verify').addEventListener('click',async()=>{const v=ob.get();if(v.length<6)return show('Enter the 6-digit code.');show('');
    try{const r=await api('/auth/verify-otp',{method:'POST',body:{email,otp:v}});sessionStorage.removeItem('fi-verify');go(r.role);}catch(err){show(err.message);}});
  $('#resend').addEventListener('click',async()=>{try{const r=await api('/auth/resend-otp',{method:'POST',body:{email,purpose:'verify'}});countdown($('#resend'));show('New code sent.','ok');devHint(r.devOtp);}catch(err){show(err.message);}});
  $('#back').addEventListener('click',()=>{$('#step2').hidden=true;$('#step1').hidden=false;show('');});
}
if(page==='forgot'){
  let email='';const ob=otpBoxes($('#otpbox'));
  $('#f1').addEventListener('submit',async e=>{e.preventDefault();email=$('#email').value;show('');
    try{const r=await api('/auth/forgot',{method:'POST',body:{email}});$('#f1').hidden=true;$('#f2').hidden=false;ob.focus();countdown($('#resend'));if(r.devOtp)devHint(r.devOtp);else show(r.message,'ok');}catch(err){show(err.message);}});
  $('#f2').addEventListener('submit',async e=>{e.preventDefault();show('');
    try{await api('/auth/reset',{method:'POST',body:{email,otp:ob.get(),password:$('#password').value}});location.href='/login.html?reset=1';}catch(err){show(err.message);}});
  $('#resend').addEventListener('click',async()=>{try{const r=await api('/auth/resend-otp',{method:'POST',body:{email,purpose:'reset'}});countdown($('#resend'));devHint(r.devOtp);}catch(err){show(err.message);}});
}
