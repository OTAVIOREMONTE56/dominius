const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(file,'utf8');
function page(t,config) {
  const dom=new JSDOM(read('index.html'),{url:'https://otavioremonte56.github.io/dominius/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.eval(read('supabase-config.js'));
  if(config)w.DOMINIUS_SUPABASE=config;
  w.eval(read('supabase-client.js'));
  return w;
}
test('configuration rejects the historical DNS typo and non-publishable keys before SDK loading',async t=>{
  for(const config of [
    {SUPABASE_URL:'https://pvnhfxqvypxxiakdbcft.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},
    {SUPABASE_URL:'https://pvnhfxqvypxxiakdbctf.supabase.co',SUPABASE_PUBLISHABLE_KEY:'invalid'}
  ]) {
    const w=page(t,config);
    assert.equal(w.DominiusCloud.configured,false);
    await assert.rejects(w.DominiusCloud.client(),/SUPABASE_/);
    assert.equal(w.document.querySelector('script[src="vendor/supabase.js"]'),null);
  }
});
test('client loads one local SDK, retries a failed load and preserves auth options',async t=>{
  const w=page(t);let calls=0,options;
  const pending=w.DominiusCloud.client();
  w.document.querySelector('script[src="vendor/supabase.js"]').onerror();
  await assert.rejects(pending,/carregar/);
  const a=w.DominiusCloud.client(),b=w.DominiusCloud.client();
  const db={auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}};
  w.supabase={createClient(url,key,opts){calls++;assert.equal(url,'https://pvnhfxqvypxxiakdbctf.supabase.co');assert.equal(key,w.DOMINIUS_SUPABASE.SUPABASE_PUBLISHABLE_KEY);options=opts;return db;}};
  w.document.querySelector('script[src="vendor/supabase.js"]').onload();
  assert.equal(await a,await b);assert.equal(calls,1);
  assert.equal(options.auth.persistSession,true);assert.equal(options.auth.autoRefreshToken,true);assert.equal(options.auth.detectSessionInUrl,true);
  assert.equal(await w.DominiusCloud.session(),null);
});
test('account registration, network retry, login, restored session, recovery and logout',async t=>{
  const w=page(t);let session=null,signup,redirect,updated,fail=true;
  const signed={user:{id:'test-user',email:'player@example.test',user_metadata:{display_name:'Comandante'}}};
  const auth={
    onAuthStateChange(){},getSession:async()=>({data:{session}}),
    signUp:async args=>{signup=args;return fail?{error:new TypeError('Failed to fetch')}:{data:{session:null}};},
    signInWithPassword:async()=>({data:{session:session=signed}}),
    resetPasswordForEmail:async(email,options)=>{redirect=options.redirectTo;return {};},
    updateUser:async args=>{updated=args.password;return {};},
    signOut:async()=>{session=null;return {};}
  };
  w.supabase={createClient:()=>({auth})};w.eval(read('account.js'));
  const q=s=>w.document.querySelector(s);
  const tick=()=>new Promise(r=>setTimeout(r,10));
  const submit=async()=>{const form=q('#auth-form');if(form.elements.email)form.elements.email.value='player@example.test';if(form.elements.password)form.elements.password.value='password123';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();};
  q('#account-register-entry').click();await tick();
  assert.equal(q('#account-view-title').textContent,'CRIAR CONTA');
  await w.DominiusAccount.open();q('[data-auth="register"]').click();q('#auth-name').value='Jogador';
  await submit();assert.match(q('[role="status"]').textContent,/alcançar o Supabase/);
  assert.equal(q('#auth-password').value,'');assert.equal(q('[type="submit"]').disabled,false);
  fail=false;await submit();assert.match(q('[role="status"]').textContent,/Confira seu e-mail/);
  assert.equal(signup.options.emailRedirectTo,w.location.href);assert.equal(signup.options.data.display_name,'Jogador');
  q('[data-auth="login"]').click();await submit();assert(q('[data-auth="logout"]'));
  await w.DominiusAccount.open();assert.equal(q('#auth-email').textContent,signed.user.email);
  q('[data-auth="logout"]').click();await tick();assert.equal(session,null);
  q('[data-auth="recover"]').click();await submit();assert.equal(redirect,w.location.href);
  session=signed;w.dispatchEvent(new w.CustomEvent('dominius-auth',{detail:{event:'PASSWORD_RECOVERY',session}}));
  await submit();assert.equal(updated,'password123');assert(q('[data-auth="logout"]'));
});
