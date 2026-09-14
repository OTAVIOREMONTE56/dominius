// Supabase Auth: conta independente das regras locais e do BOT.
(() => {
  const dialog=document.getElementById('account-dialog'),view=document.getElementById('account-view'),entry=document.getElementById('account-entry'),registerEntry=document.getElementById('account-register-entry');
  let current=null,mode='login',busy=false;
  const message=text=>{const el=view.querySelector('[role="status"]');if(el)el.textContent=text;};
  const reportError=error=>message(DominiusCloud.errorMessage(error));
  function draw() {
    entry.textContent=current?'CONTA / PERFIL':'CONTA / ENTRAR';
    if(registerEntry){registerEntry.querySelector('span').textContent=current?'MEU PERFIL':'CRIAR CONTA';registerEntry.querySelector('small').textContent=current?'Gerencie sua conta online':'Crie seu comandante e prepare-se para batalhas online';}
    if(current&&mode!=='password') {
      view.innerHTML=`<h2 id="account-view-title">PERFIL DO COMANDANTE</h2><p id="auth-name"></p><p id="auth-email"></p>
        <p class="account-copy">Sua conta está conectada. Escolha BATALHA ONLINE para jogar.</p>
        <div class="profile-patent">PATENTE <strong id="profile-patent">—</strong></div>
        <dl class="account-stats" id="profile-stats"><div><dt>Partidas</dt><dd>—</dd></div><div><dt>Vitórias</dt><dd>—</dd></div><div><dt>Derrotas</dt><dd>—</dd></div><div><dt>Empates</dt><dd>—</dd></div><div><dt>Sequência atual</dt><dd>—</dd></div><div><dt>Melhor sequência</dt><dd>—</dd></div><div><dt>Taxa de vitórias</dt><dd>—</dd></div><div><dt>Posição no ranking</dt><dd id="profile-ranking-position">—</dd></div></dl>
        <p class="coin-balance"><span aria-hidden="true">♛</span> COROAS <strong data-coin-balance>—</strong></p>
        <p class="coin-balance">GEMAS <strong id="profile-gems">—</strong></p>
        <h3>HISTÓRICO DE COROAS</h3><ul class="coin-history" id="account-coin-history"></ul>
        <p role="status"></p><button class="account-button" data-auth="logout">SAIR DA CONTA</button>`;
      view.querySelector('#auth-name').textContent=current.user.user_metadata?.display_name||'Comandante';
      view.querySelector('#auth-email').textContent=current.user.email;
      const profileUser=current.user.id;
      DominiusCloud.rpc('dominius_my_stats').then(stats=>{
        if(current?.user.id!==profileUser || !view.querySelector('#profile-stats') || !stats)return;
        view.querySelector('#profile-patent').textContent=stats.patent;
        const values=[stats.matches_played,stats.wins,stats.losses,stats.draws,stats.current_win_streak,stats.best_win_streak,`${stats.win_rate}%`];
        view.querySelectorAll('#profile-stats dd').forEach((cell,i)=>cell.textContent=values[i]);
      }).catch(error=>message(error.message));
      DominiusCloud.rpc('dominius_ranking').then(data=>{
        if(current?.user.id===profileUser && view.querySelector('#profile-ranking-position') && data?.me)
          view.querySelector('#profile-ranking-position').textContent=`#${data.me.position}`;
      }).catch(()=>{});
      window.DominiusEconomy?.wallet().then(() => {
        if(current?.user.id===profileUser && view.querySelector('#profile-gems'))view.querySelector('#profile-gems').textContent=window.DominiusEconomy.format(window.DominiusEconomy.gems);
        return window.DominiusEconomy.history();
      }).then(rows => {
        if(current?.user.id!==profileUser || !view.querySelector('#account-coin-history'))return;
        const names={initial_balance:'Saldo inicial',online_win_reward:'Vitória em Batalha Livre',wager_lock:'Aposta da batalha',wager_win:'Vitória em batalha',wager_refund:'Reembolso de batalha',admin_adjustment:'Ajuste'};
        const list=view.querySelector('#account-coin-history');list.replaceChildren();
        for(const row of rows){const li=document.createElement('li'),description=document.createElement('span'),date=document.createElement('time');
          const reference=row.metadata?.room_code?` · Sala ${row.metadata.room_code}`:row.match_id?` · Partida ${row.match_id.slice(0,8)}`:'';
          const opponent=row.metadata?.opponent?` · ${row.metadata.opponent}`:'';
          description.textContent=`${row.amount>0?'+':''}${window.DominiusEconomy.format(row.amount)} · ${names[row.type]||row.type}${reference}${opponent}`;
          date.dateTime=row.created_at;date.textContent=new Date(row.created_at).toLocaleString('pt-BR');li.append(description,date);list.append(li);}
      }).catch(error=>message(error.message));
      return;
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
  async function open(modeToOpen='login') {
    mode=modeToOpen;draw();if(!dialog.open)dialog.showModal();
    try{current=await DominiusCloud.session();draw();}catch(error){reportError(error);}
  }
  dialog.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const form=event.target;if(!form.reportValidity())return;
    busy=true;const button=form.querySelector('[type="submit"]');button.disabled=true;message('Conectando…');
    try {
      const db=await DominiusCloud.client();
      const email=form.elements.email?.value.trim(),password=form.elements.password?.value;
      if(mode==='register') {
        const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{display_name:form.elements.namedItem('name').value.trim()}}});
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
    }catch(error){reportError(error);}
    finally{busy=false;button.disabled=false;form.querySelectorAll('[type="password"]').forEach(el=>el.value='');}
  });
  dialog.addEventListener('click',async event=>{
    const action=event.target.closest('[data-auth]')?.dataset.auth;
    if(event.target.closest('[data-account-action="close"]'))dialog.close();
    if(!action||busy)return;
    if(action==='logout') {
      busy=true;
      try{await window.dominiusMultiplayer?.leave?.();const db=await DominiusCloud.client();const {error}=await db.auth.signOut();if(error)throw error;current=null;mode='login';draw();}
      catch(error){reportError(error);}finally{busy=false;}
    }else{mode=action;draw();}
  });
  dialog.addEventListener('close',()=>view.querySelectorAll('[type="password"]').forEach(el=>el.value=''));
  document.querySelectorAll('[data-account-open]').forEach(el=>el.addEventListener('click',()=>open()));
  registerEntry?.addEventListener('click',()=>open('register'));
  const rankingDialog=document.createElement('dialog');rankingDialog.id='ranking-dialog';rankingDialog.className='ranking-dialog';
  rankingDialog.setAttribute('aria-labelledby','ranking-title');
  rankingDialog.innerHTML='<button class="ranking-close" type="button" aria-label="Fechar ranking">×</button><p class="ranking-kicker">A GLÓRIA DOS REINOS</p><h2 id="ranking-title">RANKING DOS REINOS</h2><p class="ranking-subtitle">Os comandantes mais vitoriosos de DOMINIUS</p><div id="ranking-content" role="status" aria-live="polite"></div>';
  document.body.append(rankingDialog);
  rankingDialog.querySelector('.ranking-close').addEventListener('click',()=>rankingDialog.close());
  function rankingRow(row,me){
    const item=document.createElement('li');item.className=`ranking-row${me?' ranking-me':''}${row.position<=3?` ranking-place-${row.position}`:''}`;
    const fields=[['position',`${row.position}º`],['name',row.name||'Comandante'],['patent',row.patent],
      ['wins',row.wins],['losses',row.losses],['matches',row.matches_played],
      ['streak',row.streak],['best',row.best_win_streak],['rate',`${row.win_rate}%`]];
    for(const [key,value] of fields){const span=document.createElement('span');span.className=`ranking-${key}`;span.textContent=value;item.append(span);}
    return item;
  }
  function rankingHead(){
    const head=document.createElement('div');head.className='ranking-row ranking-head';
    for(const [key,label] of [['position','POS'],['name','COMANDANTE'],['patent','PATENTE'],['wins','VITÓRIAS'],['losses','DERROTAS'],['matches','PARTIDAS'],['streak','SEQUÊNCIA'],['best','MELHOR'],['rate','TAXA']]){
      const cell=document.createElement('span');cell.className=`ranking-${key}`;cell.textContent=label;head.append(cell);
    }
    return head;
  }
  async function openRanking(){
    const content=rankingDialog.querySelector('#ranking-content');content.textContent='Carregando ranking…';
    if(!rankingDialog.open)rankingDialog.showModal();
    try{
      const session=await DominiusCloud.session();
      if(!session){content.replaceChildren();const prompt=document.createElement('p');prompt.textContent='Entre na sua conta para consultar o ranking.';
        const login=document.createElement('button');login.type='button';login.textContent='ENTRAR';login.addEventListener('click',()=>{rankingDialog.close();open();});content.append(prompt,login);return;}
      const data=await DominiusCloud.rpc('dominius_ranking');
      if(!rankingDialog.open)return;
      const list=document.createElement('ol');list.className='ranking-list';list.setAttribute('aria-label','Top 50 dos reinos');
      for(const row of data.top)list.append(rankingRow(row,row.user_id===session.user.id));
      content.replaceChildren(rankingHead(),list);
      if(data.me && data.me.position>50){const label=document.createElement('p');label.className='ranking-own-label';label.textContent='SUA POSIÇÃO';const own=document.createElement('ol');own.className='ranking-list';own.append(rankingRow(data.me,true));content.append(label,own);}
    }catch(error){content.textContent=DominiusCloud.errorMessage(error);}
  }
  document.getElementById('ranking-entry')?.addEventListener('click',openRanking);
  window.addEventListener('dominius-auth',event=>{
    current=event.detail.session;entry.textContent=current?'CONTA / PERFIL':'CONTA / ENTRAR';
    if(registerEntry){registerEntry.querySelector('span').textContent=current?'MEU PERFIL':'CRIAR CONTA';registerEntry.querySelector('small').textContent=current?'Gerencie sua conta online':'Crie seu comandante e prepare-se para batalhas online';}
    if(event.detail.event==='PASSWORD_RECOVERY'){mode='password';draw();if(!dialog.open)dialog.showModal();}
  });
  window.DominiusAccount={open};
})();
