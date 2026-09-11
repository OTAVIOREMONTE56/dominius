// Supabase Auth: conta independente das regras locais e do BOT.
(() => {
  const dialog=document.getElementById('account-dialog'),view=document.getElementById('account-view'),entry=document.getElementById('account-entry');
  let current=null,mode='login',busy=false;
  const message=text=>{const el=view.querySelector('[role="status"]');if(el)el.textContent=text;};
  function draw() {
    entry.textContent=current?'CONTA / PERFIL':'CONTA / ENTRAR';
    if(current&&mode!=='password') {
      view.innerHTML=`<h2 id="account-view-title">PERFIL DO COMANDANTE</h2><p id="auth-name"></p><p id="auth-email"></p>
        <p class="account-copy">Sua conta está conectada. Escolha BATALHA ONLINE para jogar.</p>
        <p role="status"></p><button class="account-button" data-auth="logout">SAIR DA CONTA</button>`;
      view.querySelector('#auth-name').textContent=current.user.user_metadata?.display_name||'Comandante';
      view.querySelector('#auth-email').textContent=current.user.email;return;
    }
    const register=mode==='register',recover=mode==='recover',password=mode==='password';
    view.innerHTML=`<h2 id="account-view-title">${register?'CRIAR CONTA':recover?'RECUPERAR SENHA':password?'NOVA SENHA':'ENTRAR'}</h2>
      <form id="auth-form">
      ${register?'<div class="account-field"><label for="auth-name">Nome de jogador</label><input id="auth-name" name="name" required minlength="3" maxlength="32" autocomplete="nickname"></div>':''}
      ${password?'':'<div class="account-field"><label for="auth-email">E-mail</label><input id="auth-email" name="email" type="email" required maxlength="254" autocomplete="email"></div>'}
      ${recover?'':`<div class="account-field"><label for="auth-password">Senha</label><input id="auth-password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="${register||password?'new-password':'current-password'}"></div>`}
      <p class="account-feedback" role="status" aria-live="polite"></p>
      <div class="account-actions"><button class="account-button account-primary" type="submit">${register?'CRIAR CONTA':recover?'ENVIAR LINK':password?'SALVAR SENHA':'ENTRAR'}</button>
      <button class="account-button" type="button" data-auth="${mode==='login'?'register':'login'}">${mode==='login'?'CRIAR CONTA':'VOLTAR PARA ENTRAR'}</button></div>
      ${mode==='login'?'<button type="button" class="account-link" data-auth="recover">ESQUECI MINHA SENHA</button>':''}</form>`;
  }
  async function open() {
    mode='login';draw();if(!dialog.open)dialog.showModal();
    try{current=await DominiusCloud.session();draw();}catch(error){message(error.message);}
  }
  dialog.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const form=event.target;if(!form.reportValidity())return;
    busy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;message('Conectando…');
    try {
      const db=await DominiusCloud.client();
      const email=form.elements.email?.value.trim(),password=form.elements.password?.value;
      if(mode==='register') {
        const {data,error}=await db.auth.signUp({email,password,options:{data:{display_name:form.elements.namedItem('name').value.trim()}}});
        if(error)throw error;current=data.session;
        if(current)draw();else{form.reset();message('Cadastro recebido. Confira seu e-mail para confirmar a conta e depois entre.');}
      } else if(mode==='recover') {
        const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
        if(error)throw error;message('Se houver uma conta para esse e-mail, você receberá um link de recuperação.');
      } else if(mode==='password') {
        const {error}=await db.auth.updateUser({password});if(error)throw error;
        mode='login';current=await DominiusCloud.session();draw();message('Senha atualizada.');
      } else {
        const {data,error}=await db.auth.signInWithPassword({email,password});if(error)throw error;
        current=data.session;draw();
      }
    }catch(error){message(error.message);}
    finally{busy=false;button.disabled=false;form.querySelectorAll('[type="password"]').forEach(el=>el.value='');}
  });
  dialog.addEventListener('click',async event=>{
    const action=event.target.closest('[data-auth]')?.dataset.auth;
    if(event.target.closest('[data-account-action="close"]'))dialog.close();
    if(!action||busy)return;
    if(action==='logout') {
      busy=true;
      try{await window.dominiusMultiplayer?.leave?.();const db=await DominiusCloud.client();const {error}=await db.auth.signOut();if(error)throw error;current=null;mode='login';draw();}
      catch(error){message(error.message);}finally{busy=false;}
    }else{mode=action;draw();}
  });
  dialog.addEventListener('close',()=>view.querySelectorAll('[type="password"]').forEach(el=>el.value=''));
  document.querySelectorAll('[data-account-open]').forEach(el=>el.addEventListener('click',open));
  window.addEventListener('dominius-auth',event=>{
    current=event.detail.session;entry.textContent=current?'CONTA / PERFIL':'CONTA / ENTRAR';
    if(event.detail.event==='PASSWORD_RECOVERY'){mode='password';draw();if(!dialog.open)dialog.showModal();}
  });
  window.DominiusAccount={open};
})();
