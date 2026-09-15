// Adaptador online. Nunca executa combate local nem recebe o exército secreto rival.
(() => {
  const cloud=window.DominiusCloud;
  const dialog=document.createElement('dialog');dialog.id='online-lobby';
  dialog.setAttribute('aria-labelledby','online-title');
  dialog.innerHTML=`<p class="eyebrow">O CONSELHO DOS REINOS</p><h2 id="online-title">BATALHA ONLINE</h2>
    <p id="online-notice" role="status" aria-live="polite"></p>
    <div id="online-actions"><p class="coin-balance"><span aria-hidden="true">♛</span> SEU SALDO <strong data-coin-balance>—</strong></p>
      <label for="online-faction">Seu reino</label><select id="online-faction"></select>
      <div class="online-economy"><h3>BATALHA LIVRE</h3><p>Jogue sem arriscar Coroas. Vitória: +1 Coroa.</p>
        <label><input type="radio" name="online-mode" value="free" checked> Batalha livre</label>
        <h3>BATALHA VALENDO COROAS</h3><p>Coloque suas Coroas em jogo.</p>
        <label><input type="radio" name="online-mode" value="wager"> Valendo Coroas</label>
        <div id="online-wager-options" hidden><p>APOSTA DA BATALHA</p><div class="wager-options">
          ${[5,10,20,50,100].map((amount,i)=>`<label><input type="radio" name="wager-amount" value="${amount}" ${i===0?'checked':''}><span>♛ ${amount}</span><small hidden>Saldo insuficiente</small></label>`).join('')}
        </div><p id="online-wager-terms" aria-live="polite"></p></div></div>
      <button type="button" class="primary-btn" id="online-create">Criar Batalha</button>
      <form id="online-join-form"><label for="online-code">Código da Sala</label><input id="online-code" maxlength="6" pattern="[a-fA-F0-9]{6}" required autocomplete="off" placeholder="Ex.: A12B3C">
      <button type="submit" class="secondary-btn">Entrar em Sala</button></form></div>
    <div id="online-wager-challenge" class="online-economy" hidden><h3>DESAFIO RECEBIDO</h3><p id="online-challenge-terms"></p><p class="coin-balance"><span aria-hidden="true">♛</span> SEU SALDO <strong data-coin-balance>—</strong></p><p id="online-challenge-warning" role="status"></p>
      <button type="button" class="primary-btn" id="online-accept-wager">ACEITAR DESAFIO</button><button type="button" class="secondary-btn" id="online-cancel-wager">RECUSAR</button></div>
    <div id="online-room-info" hidden><p id="online-room-code"></p><p id="online-room-wager"></p><p class="coin-balance"><span aria-hidden="true">♛</span> SEU SALDO <strong data-coin-balance>—</strong></p><ul id="online-players"></ul>
      <button id="online-prepare" type="button" class="primary-btn">Preparar exército</button></div>
    <button id="online-account" type="button" class="secondary-btn">Conta / Entrar</button>
    <button id="online-close" type="button" class="secondary-btn">Voltar ao menu</button>`;
  document.body.append(dialog);
  const q=id=>document.getElementById(id);
  const notice=q('online-notice'), faction=q('online-faction'), actions=q('online-actions');
  const economy=window.DominiusEconomy||{wallet:async()=>null,balance:null,format:String};
  let pendingOffer=null;
  function updateWagerChoices(balance){
    const options=q('online-wager-options');
    options.querySelectorAll('input').forEach(option=>{option.disabled=balance===null||Number(option.value)>balance;option.closest('label').querySelector('small').hidden=!option.disabled;});
    if(options.querySelector('input:checked')?.disabled)options.querySelector('input:not(:disabled)')?.click();
    q('online-create').disabled=!!(dialog.querySelector('input[name="online-mode"][value="wager"]:checked') && !q('online-wager-options').querySelector('input:checked:not(:disabled)'));
    const amount=Number(options.querySelector('input:checked:not(:disabled)')?.value||0);
    q('online-wager-terms').textContent=amount?`APOSTA: ${amount} COROAS · POTE: ${amount*2} COROAS`:'Saldo insuficiente para apostar.';
  }
  Object.entries(FACTIONS).forEach(([key,f])=>faction.add(new Option(f.label,key)));
  const toolbar=document.createElement('div');toolbar.id='online-toolbar';toolbar.hidden=true;
  toolbar.innerHTML='<p id="online-battle-status" role="status"></p><p class="coin-balance"><span aria-hidden="true">♛</span> COROAS <strong data-coin-balance>—</strong></p><button type="button" class="secondary-btn">Sala / Chat</button>';
  els.gameScreen.querySelector('.board-shell').prepend(toolbar);
  const battleStatus=toolbar.querySelector('p');
  const chat=document.createElement('section');chat.id='online-chat';chat.hidden=true;
  chat.innerHTML=`<h3>Chat da sala</h3><div id="online-messages" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Mensagens da sala"></div>
    <form id="online-chat-form"><label for="online-message">Mensagem</label><div class="online-compose"><input id="online-message" maxlength="500" required autocomplete="off" placeholder="Escreva ao adversário…"><button class="primary-btn" type="submit">Enviar</button></div></form>
    <p id="online-chat-status" role="status"></p>`;
  dialog.append(chat);
  const messages=q('online-messages'), input=q('online-message'), chatStatus=q('online-chat-status');
  let user=null,roomId=null,seat=null,last=null,draft=null,channel=null,heartbeat=null,fallback=null;
  let epoch=0,busy=false,refreshRunning=false,refreshAgain=false,refreshTargetVersion=-1,refreshPromise=null,boardOpen=false,lastVersion=-1,lastChatId=0,lastVisualMoveId=0,chatBusy=false,pendingChat=null;
  let attaching=null,chatLoading=false,chatAgain=false,realtimeReady=false;
  let rewardMatchId=null,rewardToken=0,rewardTimer=null,rewardIntroTimer=null,rewardFinish=null;
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
    const perf=window.DOMINIUS_PERF_DEBUG?window.dominiusPerf:null;
    perf?.onlineRenderStart(last.match.version);
    const stateDone=perf?.span('state');
    const oldVersion=lastVersion,oldPhase=state.phase;lastVersion=last.match.version;
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
    stateDone?.();
    els.startScreen.classList.add('hidden');els.gameScreen.classList.remove('hidden');toolbar.hidden=false;
    render();
    perf?.onlineRendered();
    if(last.match.phase==='finished' && last.match.winner===null){
      els.endScreenTitle.textContent='EMPATE';
      els.endScreenSubtitle.textContent='Aposta devolvida aos dois jogadores.';
      els.endScreenImage.style.display='none';
      els.endScreen.classList.remove('hidden');
    }
    if(oldVersion>=0&&oldPhase!=='battle'&&last.match.phase==='battle')
      window.dominiusVisualizeOnlineBattleStart?.(players[0].faction);
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
    const previousWagerStatus=last?.match.wager_status;
    last=s;seat=s.players.find(p=>p.user_id===user.id)?.seat;
    actions.hidden=true;q('online-room-info').hidden=false;q('online-account').hidden=true;
    q('online-room-code').textContent=`Código da sala: ${s.room.code}`;
    q('online-room-wager').textContent=s.match.wager_amount>0
      ?`APOSTA: ${s.match.wager_amount} COROAS · POTE: ${s.match.pot_amount||s.match.wager_amount*2} COROAS · ${s.match.wager_status==='locked'?'APOSTA CONFIRMADA':'AGUARDANDO ADVERSÁRIO'}`
      :'BATALHA LIVRE · Vitória: +1 COROA';
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
    if(s.match.wager_status==='locked' && previousWagerStatus!=='locked')
      economy.wallet().catch(error=>message(`Saldo de Coroas indisponível: ${error.message}`));
    renderGame();
    if(boardOpen&&s.match.phase==='finished')showCoinResult(s);
  }
  async function showCoinResult(s){
    if(rewardMatchId===s.match.id)return;
    rewardMatchId=s.match.id;const token=++rewardToken;
    const panel=els.endScreen.querySelector('#online-reward')||document.createElement('section');
    panel.id='online-reward';panel.className='online-reward';panel.hidden=false;
    panel.innerHTML='<header class="online-reward-header"><span>BATALHA ONLINE</span><strong>DOMINIUS</strong><span>ARENA DOS REINOS</span></header><div class="online-reward-stage"><div class="online-reward-banners" aria-label="Reinos da partida"></div><section class="online-reward-center"><div class="online-reward-vessel" aria-hidden="true">♛</div><p class="online-reward-label"></p><strong class="online-reward-pot"></strong><p class="online-reward-gain" role="status" aria-live="polite"></p></section><div class="online-reward-flight" aria-hidden="true"></div></div><footer class="online-reward-footer"><p class="online-reward-balance"></p><p class="online-reward-streak"></p><button class="online-reward-continue" type="button">CONTINUAR</button><small class="online-reward-skip">Clique para pular a animação</small></footer>';
    els.endScreen.append(panel);els.endScreen.classList.add('online-result-active');
    const winner=s.match.winner===seat,tie=s.match.winner===null,wager=Number(s.match.wager_amount||0);
    panel.dataset.mode=wager?'wager':'free';panel.dataset.result=tie?'tie':winner?'winner':'loser';
    panel.querySelector('.online-reward-label').textContent='Confirmando recompensa…';
    panel.querySelector('.online-reward-continue').addEventListener('click',()=>{
      if(rewardFinish){rewardFinish();return;}
      els.playAgainBtn.click();
    });
    try{
      const db=await cloud.client();
      const {data,error}=await db.from('coin_transactions').select('amount,type,balance_after')
        .eq('match_id',s.match.id).eq('user_id',user.id)
        .in('type',['wager_win','wager_refund','online_win_reward']);
      if(error)throw error;
      if(token!==rewardToken||!last||last.match.id!==s.match.id)return;
      const payoutType=tie?'wager_refund':wager?'wager_win':'online_win_reward';
      const payout=data?.find(row=>row.type===payoutType);
      const pot=Number(s.match.pot_amount||0);
      if(wager && (tie?s.match.wager_status!=='refunded':s.match.wager_status!=='settled'))throw new Error('Resultado financeiro ainda não confirmado.');
      if((winner||tie&&wager) && (!payout||Number(payout.amount)!==(tie?wager:wager?pot:1)))
        throw new Error('Recompensa oficial ainda não disponível.');
      const amount=winner?Number(payout.amount):tie&&wager?Number(payout.amount):0;
      const animate=!!(wager||winner);
      const unit=n=>`${economy.format(n)} ${n===1?'COROA':'COROAS'}`;
      const bannerHost=panel.querySelector('.online-reward-banners');
      const realms=tie?[0,1]:[s.match.winner,1-s.match.winner];
      for(const playerSeat of realms){
        const player=s.players.find(p=>p.seat===playerSeat);
        const key=player?.faction;
        if(!Object.hasOwn(FACTIONS,key))continue;
        const card=document.createElement('div');
        card.className=`online-reward-banner ${tie?'neutral':playerSeat===s.match.winner?'victor':'vanquished'}`;
        card.dataset.faction=key;card.dataset.seat=String(playerSeat);
        const outcome=document.createElement('h3');outcome.className='online-reward-outcome';
        outcome.textContent=tie?'EMPATE':playerSeat===s.match.winner?'VITÓRIA':'DERROTA';
        const flag=document.createElement('img');flag.src=`assets/faccoes/${key}.png`;
        flag.alt=`Estandarte dos ${FACTIONS[key].label}`;
        const identity=document.createElement('div');identity.className='online-reward-identity';
        const name=document.createElement('strong');name.textContent=`Jogador ${playerSeat+1}`;
        const patent=document.createElement('small');patent.textContent='Patente indisponível';
        const stats=document.createElement('dl');stats.className='online-reward-stats';
        for(const [field,label] of [['streak','SEQUÊNCIA'],['wins','VITÓRIAS'],['losses','DERROTAS'],['win_rate','TAXA DE VITÓRIA']]){
          const term=document.createElement('dt');term.textContent=label;
          const value=document.createElement('dd');value.dataset.stat=field;value.textContent='—';stats.append(term,value);
        }
        identity.append(name,patent);card.append(outcome,flag,identity,stats);bannerHost.append(card);
      }
      // O ranking expõe apenas nomes públicos e patentes; fora do Top 50, mantém-se o identificador da sala.
      cloud.rpc('dominius_ranking').then(ranking=>{
        if(token!==rewardToken||!ranking)return;
        const rows=[...(ranking.top||[]),ranking.me].filter(Boolean);
        for(const card of bannerHost.children){
          const player=s.players.find(p=>p.seat===Number(card.dataset.seat));
          const row=rows.find(item=>item.user_id===player?.user_id);
          if(row){card.querySelector('strong').textContent=row.name||`Jogador ${player.seat+1}`;
            card.querySelector('small').textContent=row.patent||'Patente indisponível';
            for(const field of ['streak','wins','losses','win_rate']){
              const value=row[field];if(value!==undefined&&value!==null)
                card.querySelector(`[data-stat="${field}"]`).textContent=field==='win_rate'?`${value}%`:String(value);
            }}
        }
      }).catch(()=>{});
      const revealPot=()=>{
        if(token!==rewardToken||panel.classList.contains('complete'))return;
        rewardIntroTimer=null;
        if(!animate){finish();return;}
        panel.classList.remove('intro');panel.classList.add('pot-visible');
        panel.querySelector('.online-reward-label').textContent=wager?'POTE DA BATALHA':winner?'BATALHA LIVRE':tie?'EMPATE':'BATALHA LIVRE';
        panel.querySelector('.online-reward-pot').textContent=wager?unit(pot):winner?'1 COROA':'';
        if(animate)launchCoins();
        panel.classList.add('playing');rewardTimer=setTimeout(finish,3500);
      };
      const seenKey=`dominius-reward:${user.id}:${s.match.id}`;
      const seen=storage.get(seenKey)==='1';storage.set(seenKey,'1');
      const flight=panel.querySelector('.online-reward-flight');
      const launchCoins=()=>{
        if(!animate||seen)return;
        const origin=panel.querySelector('.online-reward-vessel').getBoundingClientRect();
        const bounds=flight.getBoundingClientRect();
        const coinCount=wager?(flight.clientWidth>=700?12:flight.clientWidth>=440?10:8):1;
        for(let i=0;i<coinCount;i++){
          const coin=document.createElement('span');coin.className='online-reward-coin';coin.textContent='♛';
          const destination=tie?i%2:s.match.winner;
          const target=bannerHost.querySelector(`[data-seat="${destination}"] img`)?.getBoundingClientRect();
          const startX=origin.width?origin.left+origin.width/2-bounds.left:flight.clientWidth/2;
          const startY=origin.height?origin.top+origin.height/2-bounds.top:flight.clientHeight*.66;
          const endX=target?.width?target.left+target.width/2-bounds.left:destination===0?flight.clientWidth*.18:flight.clientWidth*.82;
          const endY=target?.height?target.top+target.height*.55-bounds.top:flight.clientHeight*.36;
          coin.style.setProperty('--reward-start-x',`${startX}px`);
          coin.style.setProperty('--reward-start-y',`${startY}px`);
          coin.style.setProperty('--reward-end-x',`${endX}px`);
          coin.style.setProperty('--reward-end-y',`${endY}px`);
          coin.style.setProperty('--reward-mid-x',`${startX+(endX-startX)*.55}px`);
          coin.style.setProperty('--reward-mid-y',`${Math.min(startY,endY)-45-i%4*9}px`);
          coin.style.setProperty('--reward-delay',`${wager?700+i*60:700}ms`);
          coin.style.setProperty('--reward-scale',`${(0.88+i%4*0.07).toFixed(2)}`);
          const spark=document.createElement('i');spark.className='online-reward-spark';
          spark.style.setProperty('--reward-end-x',`${endX}px`);
          spark.style.setProperty('--reward-end-y',`${endY}px`);
          spark.style.setProperty('--reward-spark-delay',`${wager?700+i*60+2100:2800}ms`);
          flight.append(coin,spark);
        }
      };
      const finish=()=>{
        if(token!==rewardToken||!rewardFinish)return;
        clearTimeout(rewardTimer);clearTimeout(rewardIntroTimer);rewardTimer=null;rewardIntroTimer=null;rewardFinish=null;
        panel.classList.remove('playing','intro');panel.classList.add('pot-visible','complete');
        panel.querySelector('.online-reward-label').textContent=wager?'POTE DA BATALHA':winner?'BATALHA LIVRE':tie?'EMPATE':'BATALHA LIVRE';
        panel.querySelector('.online-reward-pot').textContent=wager?unit(pot):winner?'1 COROA':'';
        panel.querySelector('.online-reward-skip').hidden=true;
        panel.querySelector('.online-reward-gain').textContent=amount
          ?tie?`${unit(amount)} DEVOLVIDAS`:`+${unit(amount)}`
          :winner?'':'Nenhuma Coroa recebida';
        if(payout)panel.querySelector('.online-reward-balance').textContent=`SALDO CONFIRMADO: ${unit(Number(payout.balance_after))}`;
        economy.wallet().then(balance=>{
          if(token===rewardToken&&balance!==null)panel.querySelector('.online-reward-balance').textContent=`SALDO ATUAL: ${unit(balance)}`;
        }).catch(()=>{});
      };
      rewardFinish=finish;
      if(!seen&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
        panel.classList.add('intro');rewardIntroTimer=setTimeout(revealPot,2500);
      }else finish();
      cloud.rpc('dominius_my_stats').then(stats=>{
        if(token===rewardToken&&stats){
          const own=bannerHost.querySelector(`[data-seat="${seat}"]`);
          if(own)for(const [field,key] of [['streak','current_win_streak'],['wins','wins'],['losses','losses'],['win_rate','win_rate']]){
            if(stats[key]!==undefined&&stats[key]!==null)
              own.querySelector(`[data-stat="${field}"]`).textContent=field==='win_rate'?`${stats[key]}%`:String(stats[key]);
          }
        }
        if(token===rewardToken&&stats&&!winner)
          panel.querySelector('.online-reward-streak').textContent=`Sequência atual: ${stats.current_win_streak}`;
      }).catch(()=>{});
    }catch(error){
      if(token===rewardToken){rewardMatchId=null;panel.classList.add('pot-visible');panel.querySelector('.online-reward-label').textContent=`Coroas indisponíveis: ${error.message}`;panel.querySelector('.online-reward-skip').hidden=true;economy.wallet().catch(()=>{});}
    }
  }
  function refresh(targetVersion=null) {
    if(!roomId)return Promise.resolve();
    const requested=Number(targetVersion);
    const versioned=Number.isInteger(requested)&&requested>=0;
    if(versioned)refreshTargetVersion=Math.max(refreshTargetVersion,requested);
    if(refreshRunning){
      // matches, match_moves e a RPC podem anunciar a mesma versao.
      if(!versioned)refreshAgain=true;
      return refreshPromise;
    }
    refreshRunning=true;const generation=epoch;
    refreshPromise=(async()=>{
    try {
      do {
        refreshAgain=false;
        const networkStart=window.DOMINIUS_PERF_DEBUG?performance.now():0;
        let snapshot;
        try{snapshot=await cloud.rpc('dominius_snapshot',{p_room:roomId});}
        finally{if(window.DOMINIUS_PERF_DEBUG)window.dominiusPerf?.snapshotNetwork(performance.now()-networkStart,networkStart);}
        if(generation!==epoch)return;
        apply(snapshot);
        if(Number(snapshot?.match?.version)>=refreshTargetVersion)refreshTargetVersion=-1;
      }while(refreshAgain||refreshTargetVersion>=0);
    }catch(error){if(generation===epoch)message(`Não foi possível sincronizar: ${error.message}`);}
    finally{refreshRunning=false;refreshPromise=null;if(generation!==epoch&&roomId)refresh();}
    })();
    return refreshPromise;
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
  function syncNow(){if(roomId){if(window.DOMINIUS_PERF_DEBUG)window.dominiusPerf?.signal('poll');refresh();loadChat();}}
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
    const changed=payload=>{if(current()){
      if(window.DOMINIUS_PERF_DEBUG)window.dominiusPerf?.signal('realtime');
      const row=payload?.new;
      const target=Number.isInteger(row?.version)?row.version:Number.isInteger(row?.turn_number)?row.turn_number:null;
      if(target!==null&&target<=Number(last?.match?.version))return;
      refresh(target);
    }};
    const roomChanged=payload=>{
      if(payload?.new?.status===last?.room?.status)return;
      changed(payload);
    };
    const chatted=()=>{if(current())loadChat();};
    scheduleFallback(false);
    channel=db.channel(`dominius:${id}:${user.id}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'matches',filter:`room_id=eq.${id}`},changed)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'match_moves',filter:`room_id=eq.${id}`},changed)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'room_players',filter:`room_id=eq.${id}`},changed)
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'room_players',filter:`room_id=eq.${id}`},changed)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms',filter:`id=eq.${id}`},roomChanged)
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
    epoch++;rewardToken++;clearTimeout(rewardTimer);clearTimeout(rewardIntroTimer);rewardTimer=null;rewardIntroTimer=null;rewardFinish=null;rewardMatchId=null;
    els.endScreen.querySelector('#online-reward')?.remove();els.endScreen.classList.remove('online-result-active');
    els.endScreen.querySelector('.end-screen-visual')?.classList.remove('online-reward-no-art');
    clearInterval(heartbeat);clearInterval(fallback);
    const old=channel;channel=null;realtimeReady=false;chatAgain=false;
    roomId=null;seat=null;last=null;draft=null;lastVersion=-1;lastChatId=0;lastVisualMoveId=0;boardOpen=false;refreshAgain=false;refreshTargetVersion=-1;refreshPromise=null;
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
      if(!session){message('ENTRE NA SUA CONTA PARA JOGAR VALENDO COROAS. Use Conta / Entrar para entrar ou criar conta.');return;}
      user=session.user;
      updateWagerChoices(await economy.wallet());
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
    let procedure=create?'dominius_create_room':pendingOffer?.wager_amount>0?'dominius_accept_wager':'dominius_join_room';
    let args=create?{p_faction:faction.value}:{p_code:q('online-code').value.trim(),p_faction:faction.value};
    if(!create&&pendingOffer?.wager_amount>0)args.p_wager=pendingOffer.wager_amount;
    if(create && dialog.querySelector('input[name="online-mode"][value="wager"]:checked')){
      const amount=Number(dialog.querySelector('input[name="wager-amount"]:checked')?.value);
      if(![5,10,20,50,100].includes(amount)||amount>await economy.wallet())throw new Error('Saldo de Coroas insuficiente.');
      procedure='dominius_create_wager_room';args={p_faction:faction.value,p_wager:amount};
    }
    const id=await cloud.rpc(procedure,args);
    if(!id)throw new Error('Sala não encontrada ou limite de tentativas atingido. Confira o código e tente em um minuto.');
    await attach(id);
  }
  q('online-create').addEventListener('click',()=>run(()=>enter(true)));
  dialog.querySelectorAll('input[name="online-mode"]').forEach(option=>option.addEventListener('change',()=>{
    q('online-wager-options').hidden=option.value!=='wager' || !option.checked;
    updateWagerChoices(economy.balance);
  }));
  q('online-wager-options').addEventListener('change',()=>updateWagerChoices(economy.balance));
  q('online-join-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const session=await cloud.session();if(!session)throw new Error('Entre ou crie sua conta primeiro.');
    const offer=await cloud.rpc('dominius_wager_offer',{p_code:q('online-code').value.trim()});
    // A prévia só existe enquanto a sala aguarda um rival. Membros já admitidos podem reconectar.
    if(!offer){await enter(false);return;}
    if(offer.wager_amount>0){pendingOffer=offer;const balance=await economy.wallet();
      q('online-challenge-terms').textContent=`Adversário: ${offer.opponent||'Comandante'} · Aposta: ${offer.wager_amount} Coroas · Seu saldo: ${economy.format(balance)} Coroas · Pote: ${offer.pot_amount} Coroas`;
      q('online-accept-wager').disabled=balance<offer.wager_amount;
      q('online-challenge-warning').textContent=balance<offer.wager_amount?'Saldo insuficiente para aceitar este desafio.':'';
      q('online-wager-challenge').hidden=false;actions.hidden=true;
    }else await enter(false);
  });});
  q('online-accept-wager').addEventListener('click',()=>run(async()=>{
    if(!pendingOffer || await economy.wallet()<pendingOffer.wager_amount)throw new Error('Saldo de Coroas insuficiente.');
    await enter(false);pendingOffer=null;q('online-wager-challenge').hidden=true;
    await economy.wallet();
  }));
  q('online-cancel-wager').addEventListener('click',()=>{pendingOffer=null;q('online-wager-challenge').hidden=true;actions.hidden=false;});
  q('online-account').addEventListener('click',()=>{dialog.close();window.DominiusAccount.open();});
  q('online-close').addEventListener('click',()=>run(async()=>{if(roomId)await leave();else dialog.close();}));
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(boardOpen){dialog.close();renderGame(true);}else q('online-close').click();});
  q('online-prepare').addEventListener('click',()=>{if(!last||last.players.length<2)return;boardOpen=true;dialog.close();window.audioManager?.unlock?.();window.audioManager?.playAmbient?.();renderGame(true);if(last.match.phase==='finished')showCoinResult(last);});
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
        if(!preparing&&window.DOMINIUS_PERF_DEBUG)window.dominiusPerf?.begin('online-local',{acao:'movimento'});
        if(preparing) {
          const a=draft.find(p=>p.id===selected.id),b=draft.find(p=>p.x===x&&p.y===y);
          if(b)Object.assign(b,{x:a.x,y:a.y});Object.assign(a,{x,y});saveDraft();renderGame(true);
        }else run(async()=>{const targetVersion=last.match.version+1;await cloud.rpc('dominius_move',{p_room:roomId,p_piece:selected.id,p_x:x,p_y:y,p_version:last.match.version,p_request:crypto.randomUUID()});await refresh(targetVersion);});
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
