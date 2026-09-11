(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'multiplayer-dialog';
  dialog.className = 'menu-preparation';
  dialog.setAttribute('aria-labelledby', 'multiplayer-title');
  dialog.innerHTML = `<h2 id="multiplayer-title">Multiplayer</h2>
    <div id="multiplayer-options"><label for="online-faction">Seu reino</label><select id="online-faction"></select>
    <label for="online-code">Código da sala</label><input id="online-code" maxlength="6" autocomplete="off" placeholder="Ex.: A12B3C">
    <button type="button" id="online-submit" class="primary-btn">Continuar</button></div>
    <p id="online-status" role="status" aria-live="polite"></p>
    <button type="button" id="online-close" class="secondary-btn">Voltar</button>`;
  document.body.append(dialog);
  const style = document.createElement('link');style.rel='stylesheet';style.href='multiplayer.css';document.head.append(style);
  const options = dialog.querySelector('#multiplayer-options');
  const faction = dialog.querySelector('#online-faction');
  const code = dialog.querySelector('#online-code');
  const status = dialog.querySelector('#online-status');
  const submit = dialog.querySelector('#online-submit');
  Object.entries(FACTIONS).forEach(([key,value]) => faction.add(new Option(value.label,key)));
  const banner = document.createElement('p');banner.id='online-banner';banner.setAttribute('role','status');banner.hidden=true;
  els.gameScreen.prepend(banner);
  let session=null, version=-1, mode='create', busy=false, timer, connected=false, lastView=null;
  let generation=0;
  const chat=document.createElement('section');
  chat.id='room-chat';chat.hidden=true;chat.setAttribute('aria-labelledby','room-chat-title');
  chat.innerHTML=`<h3 id="room-chat-title">Chat da sala</h3>
    <div id="chat-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="Mensagens da sala" tabindex="0"></div>
    <form id="chat-form"><label for="chat-input">Mensagem</label>
    <div class="chat-compose"><input id="chat-input" maxlength="500" autocomplete="off" placeholder="Converse com seu adversário…" required>
    <button type="submit" class="primary-btn">Enviar</button></div></form>
    <p id="chat-status" role="status"></p>`;
  const chatMessages=chat.querySelector('#chat-messages');
  const chatInput=chat.querySelector('#chat-input');
  const chatButton=chat.querySelector('button');
  const chatStatus=chat.querySelector('#chat-status');
  let chatVersion=-1, chatSending=false, pendingMessage=null;
  function renderChat(v) {
    const parent=v.joined?els.gameScreen:dialog;
    if(chat.parentNode!==parent) parent.append(chat);
    chat.hidden=false;
    chatInput.disabled=!!v.closed;chatButton.disabled=!!v.closed||chatSending;
    if(v.closed) chatStatus.textContent='Sala encerrada. O histórico continua disponível até sair.';
    if((v.chatVersion??0)<=chatVersion) return;
    const nearBottom=chatMessages.scrollHeight-chatMessages.scrollTop-chatMessages.clientHeight<60;
    const previous=chatVersion;chatVersion=v.chatVersion??0;
    for(const message of v.chat||[]) {
      if(message.id<=previous) continue;
      const row=document.createElement('p');row.className=message.seat===session.seat?'chat-own':'chat-other';
      const author=document.createElement('strong');
      author.textContent=message.seat===session.seat?'Você':`Jogador ${message.seat+1}`;
      const time=document.createElement('time');time.dateTime=new Date(message.time).toISOString();
      time.textContent=new Date(message.time).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      const body=document.createElement('span');body.textContent=message.text;
      row.append(author,time,body);chatMessages.append(row);
    }
    while(chatMessages.children.length>100) chatMessages.firstElementChild.remove();
    if(nearBottom) chatMessages.scrollTop=chatMessages.scrollHeight;
  }
  chat.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();
    if(!session||chatSending||lastView?.closed||!chatInput.value.trim()) return;
    const text=chatInput.value;
    if(!pendingMessage||pendingMessage.text!==text) pendingMessage={text,messageId:crypto.randomUUID()};
    const epoch=generation;chatSending=true;chatButton.disabled=true;chatStatus.textContent='Enviando…';
    try {
      const v=await request({...session,action:'chat',...pendingMessage});
      if(epoch!==generation) return;
      renderChat(v);pendingMessage=null;
      if(chatInput.value===text) chatInput.value='';
      chatStatus.textContent='';
    } catch(error) {if(epoch===generation) chatStatus.textContent=`Não foi possível enviar: ${error.message} Tente novamente.`;}
    finally {if(epoch===generation){chatSending=false;chatButton.disabled=!!lastView?.closed;}}
  });
  const online = window.dominiusMultiplayer = {
    get active(){return !!session;}, get seat(){return session?.seat;},
    click(x,y) {
      if(!session || busy || !connected || !lastView?.joined || lastView.closed || state.winner!==null) return;
      if(isSetupPhase()?state.readyPlayers[session.seat]:state.currentTurn!==session.seat) return;
      const p=state.board[y][x].piece;
      if(state.selectedPiece && state.validMoves.some(m=>m.x===x&&m.y===y)) {
        send('move',{fromX:state.selectedPiece.x,fromY:state.selectedPiece.y,x,y});return;
      }
      if(p?.playerIndex===session.seat) {
        state.selectedPiece=p;
        state.validMoves=isSetupPhase()?getSetupValidMoves(p):getValidMoves(p);
      } else {state.selectedPiece=null;state.validMoves=[];}
      render();
    }
  };
  async function request(data) {
    if(location.protocol==='file:') throw new Error('Abra http://localhost:8000 com o servidor multiplayer iniciado.');
    const response=await fetch('/api/multiplayer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(7000)});
    if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('Inicie o servidor multiplayer com node server.js e abra http://localhost:8000.');
    const result=await response.json();if(!response.ok) throw new Error(result.error||'Servidor indisponível.');return result;
  }
  function apply(v) {
    connected=true;lastView=v;
    renderChat(v);
    if(v.closed) {banner.textContent='O adversário saiu. Volte ao menu para uma nova partida.';status.textContent='A sala foi encerrada.';return;}
    if(!v.joined) {status.textContent=`Sala ${v.code}. ${mode==='quick'?'Buscando adversário…':'Compartilhe este código e aguarde o outro jogador.'}`;return;}
    if(dialog.open) dialog.close();
    banner.hidden=false;
    banner.textContent=`Sala ${v.code} · Você é o Jogador ${v.seat+1} · ${!v.battle?(v.ready[v.seat]?'Exército confirmado. Aguardando adversário.':'Organize e confirme seu exército.'):(v.turn===v.seat?'Sua vez.':'Aguardando a jogada do adversário.')}`;
    if(!v.opponentOnline) banner.textContent+=' Adversário desconectado; aguardando reconexão.';
    if(version===v.version) return;
    version=v.version;
    cancelVisualMotion();
    Object.assign(state,{players:v.players,board:v.board,gameMode:'online',phase:v.battle?'battle':`setup-player-${v.seat+1}`,
      currentTurn:v.turn,readyPlayers:v.ready,started:v.battle&&v.winner===null,battleStarted:v.battle,winner:v.winner,
      loser:v.winner===null?null:1-v.winner,transitionVisible:false,selectedPiece:null,validMoves:[],log:v.log,
      botThinking:false,botAnimation:null,combatReveal:null});
    els.startScreen.classList.add('hidden');els.gameScreen.classList.remove('hidden');
    render();
    els.randomizeBtn.disabled=v.ready[v.seat];els.confirmArmyBtn.disabled=v.ready[v.seat];
    els.playAgainBtn.hidden=true;
  }
  async function send(action,extra={}) {
    if(!session || busy) return;
    busy=true; const epoch=generation;
    try {const v=await request({...session,action,version,...extra});if(epoch===generation) apply(v);}
    catch(error) {if(epoch===generation) {connected=false;status.textContent=error.message;banner.textContent=`${error.message} Tentando reconectar…`;}}
    finally {if(epoch===generation) busy=false;}
  }
  function stop() {
    const previous=session;
    generation++;session=null;connected=false;busy=false;version=-1;lastView=null;clearInterval(timer);
    sessionStorage.removeItem('dominius-room');banner.hidden=true;
    chat.hidden=true;chatMessages.replaceChildren();chatInput.value='';chatStatus.textContent='';
    chatVersion=-1;chatSending=false;pendingMessage=null;
    els.randomizeBtn.disabled=false;els.confirmArmyBtn.disabled=false;els.playAgainBtn.hidden=false;
    if(dialog.open) dialog.close();
    if(previous) request({...previous,action:'leave'}).catch(()=>{});
  }
  function activate(v) {
    session={code:v.code,token:v.token,seat:v.seat};version=-1;
    sessionStorage.setItem('dominius-room',JSON.stringify(session));
    options.hidden=true;apply(v);clearInterval(timer);timer=setInterval(()=>send('poll'),700);
  }
  const buttons=document.querySelectorAll('[aria-labelledby="multiplayer-heading"] .menu-button');
  ['create','join','quick'].forEach((action,i)=>{
    const button=buttons[i];button.disabled=false;
    button.querySelector('small').textContent=['Convide alguém pelo código','Digite o código do seu amigo','Encontre um adversário disponível'][i];
    button.addEventListener('click',()=>{mode=action;options.hidden=false;code.hidden=action!=='join';dialog.querySelector('[for="online-code"]').hidden=action!=='join';status.textContent='';submit.disabled=false;dialog.showModal();});
  });
  document.querySelector('[aria-labelledby="multiplayer-heading"] .menu-panel-foot').textContent='Dois jogadores. Dois dispositivos. Uma batalha.';
  submit.addEventListener('click',async()=>{
    if(busy)return;
    if(mode==='join'&&!/^[a-f0-9]{6}$/i.test(code.value.trim())) {status.textContent='Informe um código de sala com 6 caracteres.';return;}
    busy=true;submit.disabled=true;status.textContent='Conectando…';const epoch=generation;
    try {const v=await request({action:mode,faction:faction.value,code:code.value.trim().toUpperCase()});
      if(epoch===generation) activate(v);else request({code:v.code,token:v.token,action:'leave'}).catch(()=>{});
    } catch(error) {if(epoch===generation)status.textContent=error.message;}
    finally {if(epoch===generation){busy=false;submit.disabled=false;}}
  });
  dialog.querySelector('#online-close').addEventListener('click',stop);
  dialog.addEventListener('cancel',event=>{event.preventDefault();stop();});
  [[els.randomizeBtn,'shuffle'],[els.confirmArmyBtn,'ready']].forEach(([button,action])=>button.addEventListener('click',event=>{
    if(session){event.stopImmediatePropagation();event.preventDefault();send(action);}
  },true));
  [els.restartBtn,els.menuBtn,els.playAgainBtn].forEach(button=>button.addEventListener('click',event=>{
    if(session){event.stopImmediatePropagation();event.preventDefault();stop();restartGame();}
  },true));
  try {
    const saved=JSON.parse(sessionStorage.getItem('dominius-room'));
    if(saved?.token&&saved.code) {
      session=saved;options.hidden=true;dialog.showModal();status.textContent='Reconectando à sala…';
      send('poll');timer=setInterval(()=>send('poll'),700);
    }
  } catch {sessionStorage.removeItem('dominius-room');}
})();
