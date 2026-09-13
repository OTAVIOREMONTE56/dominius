// Adaptador online. Nunca executa combate local nem recebe o exército secreto rival.
(() => {
  const cloud=window.DominiusCloud;
  const dialog=document.createElement('dialog');dialog.id='online-lobby';
  dialog.setAttribute('aria-labelledby','online-title');
  dialog.innerHTML=`<p class="eyebrow">O CONSELHO DOS REINOS</p><h2 id="online-title">BATALHA ONLINE</h2>
    <p id="online-notice" role="status" aria-live="polite"></p>
    <div id="online-actions"><label for="online-faction">Seu reino</label><select id="online-faction"></select>
      <button type="button" class="primary-btn" id="online-create">Criar Sala</button>
      <form id="online-join-form"><label for="online-code">Código da Sala</label><input id="online-code" maxlength="6" pattern="[a-fA-F0-9]{6}" required autocomplete="off" placeholder="Ex.: A12B3C">
      <button type="submit" class="secondary-btn">Entrar em Sala</button></form></div>
    <div id="online-room-info" hidden><p id="online-room-code"></p><ul id="online-players"></ul>
      <button id="online-prepare" type="button" class="primary-btn">Preparar exército</button></div>
    <button id="online-account" type="button" class="secondary-btn">Conta / Entrar</button>
    <button id="online-close" type="button" class="secondary-btn">Voltar ao menu</button>`;
  document.body.append(dialog);
  const q=id=>document.getElementById(id);
  const notice=q('online-notice'), faction=q('online-faction'), actions=q('online-actions');
  Object.entries(FACTIONS).forEach(([key,f])=>faction.add(new Option(f.label,key)));
  const toolbar=document.createElement('div');toolbar.id='online-toolbar';toolbar.hidden=true;
  toolbar.innerHTML='<p id="online-battle-status" role="status"></p><button type="button" class="secondary-btn">Sala / Chat</button>';
  els.gameScreen.querySelector('.board-shell').prepend(toolbar);
  const battleStatus=toolbar.querySelector('p');
  const chat=document.createElement('section');chat.id='online-chat';chat.hidden=true;
  chat.innerHTML=`<h3>Chat da sala</h3><div id="online-messages" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Mensagens da sala"></div>
    <form id="online-chat-form"><label for="online-message">Mensagem</label><div class="online-compose"><input id="online-message" maxlength="500" required autocomplete="off" placeholder="Escreva ao adversário…"><button class="primary-btn" type="submit">Enviar</button></div></form>
    <p id="online-chat-status" role="status"></p>`;
  dialog.append(chat);
  const messages=q('online-messages'), input=q('online-message'), chatStatus=q('online-chat-status');
  let user=null,roomId=null,seat=null,last=null,draft=null,channel=null,heartbeat=null,fallback=null;
  let epoch=0,busy=false,refreshRunning=false,refreshAgain=false,boardOpen=false,lastVersion=-1,lastChatId=0,lastVisualMoveId=0,chatBusy=false,pendingChat=null;
  let attaching=null,chatLoading=false,chatAgain=false,realtimeReady=false;
  const storage={get:key=>{try{return sessionStorage.getItem(key);}catch{return null;}},set:(key,value)=>{try{sessionStorage.setItem(key,value);}catch{}},remove:key=>{try{sessionStorage.removeItem(key);}catch{}}};
  const roomKey=()=>`dominius-supabase-room:${user?.id}`;
  const draftKey=()=>`dominius-supabase-draft:${user?.id}:${roomId}`;
  function message(text) {notice.textContent=text;battleStatus.textContent=text;}
  function status(s) {
    if(s.room.status==='closed'||s.match.phase==='finished')return 'Partida encerrada';
    if(s.players.length<2)return 'Aguardando jogador';
    if(s.match.phase==='setup')return s.players[seat]?.ready?'Aguardando adversário':'Preparando exército';
    return s.match.turn===seat?'Sua vez':'Vez do adversário';
  }
  function describePiece(p) {
    const f=last.players[p.seat]?.faction||'romanos',c=PIECE_CONFIG[p.role];
    const base={id:p.id,playerIndex:p.seat,factionKey:f,x:p.x,y:p.y,lost:p.lost,setupMoved:true};
    if(!c)return {...base,name:'Peça oculta',label:'Oculta',short:'?',hidden:true,canMove:false};
    return {...base,...c,roleKey:p.role,name:FACTIONS[f].names[p.role],power:c.rank,
      lineMove:!!c.lineMove,isObjective:!!c.isObjective,isTrap:!!c.isTrap,
      image:f==='romanos'&&p.role==='rank10'?`assets/${f}/${FACTIONS[f].images.rank10}`:'',hidden:false};
  }
  function ensureDraft() {
    if(draft)return;
    try{const saved=JSON.parse(storage.get(draftKey()));if(Array.isArray(saved)&&saved.length===40)draft=saved;}catch{}
    if(!draft) {
      draft=Object.entries(PIECE_COUNTS).flatMap(([role,n])=>Array(n).fill(role)).map((role,i)=>({id:`draft-${i}`,seat,role,x:i%10,y:Math.floor(i/10)+seat*6,lost:false}));
    }
  }
  function saveDraft(){storage.set(draftKey(),JSON.stringify(draft));}
  function moveText(move) {
    const e=move.event;
    if(e.kind==='move')return `Jogador ${e.seat+1} moveu uma peça para ${e.x+1}, ${e.y+1}.`;
    const attacker=FACTIONS[last.players[e.seat].faction].names[e.attackerRole];
    const defender=FACTIONS[last.players[1-e.seat].faction].names[e.defenderRole];
    return e.captureObjective?`${attacker} capturou o objetivo ${defender}.`:
      e.outcome==='tie'?`${attacker} e ${defender} se anularam em empate.`:
      e.outcome==='attacker'?`${attacker} venceu ${defender}.`:`${defender} venceu ${attacker}.`;
  }
  function renderGame(force=false) {
    if(!last||!boardOpen||last.players.length<2)return;
    const preparing=last.match.phase==='setup',me=last.players[seat];
    if(!force&&lastVersion===last.match.version)return;
    const oldVersion=lastVersion;lastVersion=last.match.version;
    cancelVisualMotion();
    const pieces=last.pieces.map(describePiece);
    if(preparing&&!me.ready){ensureDraft();pieces.push(...draft.map(describePiece));}
    const board=buildInitialBoard();pieces.filter(p=>!p.lost).forEach(p=>board[p.y][p.x].piece=p);
    const players=last.players.map(p=>({name:`Jogador ${p.seat+1}`,faction:p.faction,color:FACTIONS[p.faction].color,
      ready:p.ready,pieces:pieces.filter(piece=>piece.playerIndex===p.seat),lostPieces:pieces.filter(piece=>piece.playerIndex===p.seat&&piece.lost),objective:null}));
    Object.assign(state,{players,board,gameMode:'online',phase:preparing?`setup-player-${seat+1}`:'battle',currentTurn:last.match.turn,
      started:last.match.phase==='battle',battleStarted:!preparing,winner:last.match.winner,loser:last.match.winner===null?null:1-last.match.winner,
      readyPlayers:last.players.map(p=>p.ready),selectedPiece:null,validMoves:[],transitionVisible:false,combatReveal:null,botThinking:false,botAnimation:null,
      log:last.moves.slice().reverse().map(m=>({text:moveText(m),type:m.event.kind==='combat'?'success':''}))});
    els.startScreen.classList.add('hidden');els.gameScreen.classList.remove('hidden');toolbar.hidden=false;
    render();
    els.randomizeBtn.disabled=me.ready||busy;els.confirmArmyBtn.disabled=me.ready||busy;
    els.restartBtn.textContent='Sair da sala';
    // O botão desenhado na arte continua ativo: volta ao lobby para nova sala.
    els.playAgainBtn.hidden=false;
    if(last.match.phase==='finished') {
      els.endScreen.querySelector('.end-screen-card').append(chat);
      if(oldVersion>=0&&oldVersion!==lastVersion) {
        if(last.match.winner===seat)window.audioManager?.playVitoria?.();else window.audioManager?.playDerrota?.();
      }
    }else if(!dialog.open){els.gameScreen.querySelector('.right-panel').append(chat);}
    const latest=last.moves.at(-1);
    if(oldVersion>=0&&latest&&latest.turn_number>oldVersion)playActionSound(latest.event);
    if(latest){
      if(oldVersion>=0&&latest.id>lastVisualMoveId)window.dominiusVisualizeOnlineAction?.(latest.event,players);
      lastVisualMoveId=Math.max(lastVisualMoveId,latest.id);
    }
  }
  function playActionSound(e) {
    if(e.kind==='move')window.audioManager?.playPassos?.();
    else if(e.captureObjective)return;
    else if(e.defenderRole==='trap'&&e.attackerRole==='rank3')window.audioManager?.playDesarme?.();
    else if(e.defenderRole==='trap')window.audioManager?.playExplosao?.();
    else window.audioManager?.playEspadas?.();
  }
  function apply(s) {
    if(last&&s.match.version<last.match.version)return;
    last=s;seat=s.players.find(p=>p.user_id===user.id)?.seat;
    actions.hidden=true;q('online-room-info').hidden=false;q('online-account').hidden=true;
    q('online-room-code').textContent=`Código da sala: ${s.room.code}`;
    q('online-players').replaceChildren();
    for(const player of s.players) {
      const li=document.createElement('li');
      const connected=Date.now()-Date.parse(player.last_seen)<45000;
      li.textContent=`Jogador ${player.seat+1}${player.seat===seat?' (você)':''} · ${FACTIONS[player.faction].label} · ${connected?'Jogador conectado':'Aguardando reconexão'}${player.ready?' · Exército confirmado':''}`;
      q('online-players').append(li);
    }
    message(status(s));chat.hidden=false;
    q('online-prepare').disabled=s.players.length<2||s.room.status==='closed';
    q('online-prepare').textContent=s.match.phase==='setup'?'Preparar exército':'Voltar à partida';
    input.disabled=s.room.status==='closed';
    renderGame();
  }
  async function refresh() {
    if(!roomId)return;
    if(refreshRunning){refreshAgain=true;return;}
    refreshRunning=true;const generation=epoch;
    try {
      do {
        refreshAgain=false;
        const snapshot=await cloud.rpc('dominius_snapshot',{p_room:roomId});
        if(generation!==epoch)return;
        apply(snapshot);
      }while(refreshAgain);
    }catch(error){if(generation===epoch)message(`Não foi possível sincronizar: ${error.message}`);}
    finally{refreshRunning=false;if(generation!==epoch&&roomId)refresh();}
  }
  async function loadChat() {
    if(!roomId)return;
    if(chatLoading){chatAgain=true;return;}
    chatLoading=true;chatAgain=false;const generation=epoch,id=roomId;
    try {
      const db=await cloud.client();
      if(generation!==epoch)return;
      const {data,error}=await db.from('chat_messages').select('id,user_id,body,created_at').eq('room_id',id).order('id',{ascending:false}).limit(100);
      if(error)throw error;if(generation!==epoch)return;
      const nearBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<60;
      for(const row of data.reverse()) {
        if(row.id<=lastChatId)continue;lastChatId=row.id;
        const p=document.createElement('p'),author=document.createElement('strong'),body=document.createElement('span'),time=document.createElement('time');
        p.className=row.user_id===user.id?'online-own':'';
        author.textContent=row.user_id===user.id?'Você':'Adversário';body.textContent=row.body;
        time.textContent=new Date(row.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
        time.dateTime=row.created_at;p.append(author,time,body);messages.append(p);
      }
      while(messages.children.length>100)messages.firstElementChild.remove();
      if(nearBottom)messages.scrollTop=messages.scrollHeight;
    }catch(error){if(generation===epoch)chatStatus.textContent=error.message;}
    finally{chatLoading=false;if(roomId&&(chatAgain||generation!==epoch))loadChat();}
  }
  function syncNow(){if(roomId){refresh();loadChat();}}
  function scheduleFallback(ready) {
    realtimeReady=ready;clearInterval(fallback);
    // Reconciliação rara quando conectado; recuperação curta apenas sem Realtime.
    fallback=setInterval(syncNow,ready?60000:3000);
  }
  function attach(id) {
    if(attaching)return attaching;
    attaching=connectRoom(id).finally(()=>{attaching=null;});
    return attaching;
  }
  async function connectRoom(id) {
    const cleanup=detach(),generation=epoch;
    await cleanup;if(generation!==epoch)return;
    roomId=id;storage.set(roomKey(),id);lastVersion=-1;lastVisualMoveId=0;
    const db=await cloud.client();if(generation!==epoch)return;
    const current=()=>generation===epoch&&roomId===id;
    const changed=()=>{if(current())refresh();};
    const chatted=()=>{if(current())loadChat();};
    scheduleFallback(false);
    channel=db.channel(`dominius:${id}:${user.id}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches',filter:`room_id=eq.${id}`},changed)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'match_moves',filter:`room_id=eq.${id}`},changed)
      .on('postgres_changes',{event:'*',schema:'public',table:'room_players',filter:`room_id=eq.${id}`},changed)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${id}`},changed)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages',filter:`room_id=eq.${id}`},chatted)
      .subscribe((result,error)=>{
        if(!current())return;
        if(result==='SUBSCRIBED'){scheduleFallback(true);syncNow();}
        else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(result)) {
          scheduleFallback(false);syncNow();
          console.warn('DOMINIUS Realtime:',result,error?.message||'Verifique conexão, publicação supabase_realtime e permissões RLS.');
        }
      });
    const pulse=()=>{if(current())cloud.rpc('dominius_heartbeat',{p_room:id}).catch(()=>{});};
    pulse();heartbeat=setInterval(pulse,15000);
    await refresh();await loadChat();
  }
  async function detach() {
    epoch++;clearInterval(heartbeat);clearInterval(fallback);
    const old=channel;channel=null;realtimeReady=false;chatAgain=false;
    roomId=null;seat=null;last=null;draft=null;lastVersion=-1;lastChatId=0;lastVisualMoveId=0;boardOpen=false;refreshAgain=false;
    toolbar.hidden=true;chat.hidden=true;messages.replaceChildren();input.value='';pendingChat=null;
    els.randomizeBtn.disabled=false;els.confirmArmyBtn.disabled=false;els.restartBtn.textContent='Reiniciar partida';
    actions.hidden=false;q('online-room-info').hidden=true;q('online-account').hidden=false;
    if(old){const db=await cloud.client();await db.removeChannel(old);}
  }
  // O navegador móvel pode suspender o socket e os timers em segundo plano.
  function resume(){if(roomId){syncNow();if(!realtimeReady)scheduleFallback(false);}}
  window.addEventListener('online',resume);
  window.addEventListener('pageshow',resume);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume();});
  async function leave() {
    if(!roomId)return;
    try{await cloud.rpc('dominius_leave',{p_room:roomId});}
    finally{
      storage.remove(roomKey());storage.remove(draftKey());await detach();
      if(dialog.open)dialog.close();restartGame();
    }
  }
  async function open() {
    dialog.append(chat);if(!dialog.open)dialog.showModal();
    try {
      const session=await cloud.session();
      if(!session){message('Entre ou crie sua conta para jogar online.');return;}
      user=session.user;
      if(!roomId){const saved=storage.get(roomKey());if(saved)await attach(saved);else message('Escolha seu reino e crie uma sala ou entre pelo código.');}
      else refresh();
    }catch(error){message(error.message);}
  }
  async function run(task) {
    if(busy)return;busy=true;
    if(roomId){els.randomizeBtn.disabled=true;els.confirmArmyBtn.disabled=true;}
    const generation=epoch;
    try{await task();}catch(error){message(error.message);if(roomId)await refresh();}
    finally{busy=false;if(generation===epoch&&last){els.randomizeBtn.disabled=last.players[seat].ready;els.confirmArmyBtn.disabled=last.players[seat].ready;}}
  }
  async function enter(create) {
    const session=await cloud.session();if(!session)throw new Error('Entre na sua conta primeiro.');user=session.user;
    const id=await cloud.rpc(create?'dominius_create_room':'dominius_join_room',create?{p_faction:faction.value}:{p_code:q('online-code').value.trim(),p_faction:faction.value});
    if(!id)throw new Error('Sala não encontrada ou limite de tentativas atingido. Confira o código e tente em um minuto.');
    await attach(id);
  }
  q('online-create').addEventListener('click',()=>run(()=>enter(true)));
  q('online-join-form').addEventListener('submit',e=>{e.preventDefault();run(()=>enter(false));});
  q('online-account').addEventListener('click',()=>{dialog.close();window.DominiusAccount.open();});
  q('online-close').addEventListener('click',()=>run(async()=>{if(roomId)await leave();else dialog.close();}));
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(boardOpen){dialog.close();renderGame(true);}else q('online-close').click();});
  q('online-prepare').addEventListener('click',()=>{if(!last||last.players.length<2)return;boardOpen=true;dialog.close();window.audioManager?.unlock?.();window.audioManager?.playAmbient?.();renderGame(true);});
  toolbar.querySelector('button').addEventListener('click',open);
  document.getElementById('online-entry').addEventListener('click',open);
  [[els.randomizeBtn,()=>{
    if(busy||!last||last.match.phase!=='setup'||last.players[seat].ready)return;
    ensureDraft();const cells=shuffleArray(draft.map(p=>({x:p.x,y:p.y})));
    draft.forEach((p,i)=>Object.assign(p,cells[i]));saveDraft();renderGame(true);
  }],[els.confirmArmyBtn,()=>run(async()=>{
    if(!last||last.match.phase!=='setup'||last.players[seat].ready)return;
    ensureDraft();await cloud.rpc('dominius_confirm_army',{p_room:roomId,p_pieces:draft.map(({role,x,y})=>({role,x,y}))});await refresh();
  })]].forEach(([button,callback])=>button.addEventListener('click',e=>{if(roomId){e.stopImmediatePropagation();callback();}},true));
  [els.restartBtn,els.menuBtn,els.playAgainBtn].forEach(button=>button.addEventListener('click',e=>{if(roomId){e.stopImmediatePropagation();run(leave);}},true));
  q('online-chat-form').addEventListener('submit',async e=>{
    e.preventDefault();if(!roomId||chatBusy||!input.value.trim())return;
    const text=input.value,generation=epoch;
    if(!pendingChat||pendingChat.p_body!==text)pendingChat={p_room:roomId,p_body:text,p_request:crypto.randomUUID()};
    chatBusy=true;chatStatus.textContent='Enviando…';
    try{await cloud.rpc('dominius_chat',pendingChat);if(generation!==epoch)return;pendingChat=null;if(input.value===text)input.value='';chatStatus.textContent='';await loadChat();}
    catch(error){if(generation===epoch)chatStatus.textContent=error.message;}
    finally{chatBusy=false;}
  });
  window.dominiusMultiplayer={get active(){return !!roomId;},get seat(){return seat;},leave,
    click(x,y) {
      if(!last||busy||last.room.status==='closed'||last.match.phase==='finished')return;
      const preparing=last.match.phase==='setup';
      if(preparing?last.players[seat].ready:last.match.turn!==seat)return;
      const cell=state.board[y]?.[x];if(!cell||cell.blocked)return;
      const selected=state.selectedPiece;
      if(selected&&state.validMoves.some(m=>m.x===x&&m.y===y)) {
        if(preparing) {
          const a=draft.find(p=>p.id===selected.id),b=draft.find(p=>p.x===x&&p.y===y);
          if(b)Object.assign(b,{x:a.x,y:a.y});Object.assign(a,{x,y});saveDraft();renderGame(true);
        }else run(async()=>{await cloud.rpc('dominius_move',{p_room:roomId,p_piece:selected.id,p_x:x,p_y:y,p_version:last.match.version,p_request:crypto.randomUUID()});await refresh();});
      }else if(cell.piece?.playerIndex===seat){state.selectedPiece=cell.piece;state.validMoves=preparing?getSetupValidMoves(cell.piece):getValidMoves(cell.piece);render();}
      else{state.selectedPiece=null;state.validMoves=[];render();}
    }};
  window.addEventListener('dominius-auth',async e=>{
    const next=e.detail.session?.user;
    if(user&&(!next||next.id!==user.id)){await detach();if(dialog.open)dialog.close();restartGame();}
    user=next||null;
  });
  // Inicializa Auth para links de confirmação/recuperação; não abre sala por cima do jogo local.
  if(cloud.configured)cloud.session().then(s=>{user=s?.user||null;}).catch(()=>{});
})();
