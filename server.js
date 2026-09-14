const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const rules = fs.readFileSync(path.join(__dirname, 'game-rules.js'), 'utf8');
const rooms = new Map();
const ttl = 30 * 60 * 1000;
function fail(message) { throw new Error(message); }
function engine(factions) {
  const context = vm.createContext({ factions });
  vm.runInContext(`const state = {players:[], board:[], winner:null};
    const els = {faction1:{value:factions[0]}, faction2:{value:factions[1]}};
    ${rules}
    buildPlayers(); placeInitialArmies();
    globalThis.game = {state, getValidMoves, swapSetupPieces, moveSetupPiece, resolveBattle, applyBattleResult};
  `, context);
  return context.game;
}
function view(room, seat) {
  const g = room.game;
  const sanitize = p => !p ? null : p.playerIndex === seat || p.lost || g.state.winner !== null
    ? {...p} : {id:p.publicId, playerIndex:p.playerIndex, x:p.x, y:p.y, hidden:true, lost:false};
  return {code:room.code, seat, version:room.version, joined:!!room.tokens[1], closed:room.closed,
    opponentOnline:Date.now()-room.seen[1-seat]<10000,
    ready:room.ready, factions:room.factions, turn:room.turn, winner:g?.state.winner ?? null,
    battle:room.ready.every(Boolean), log:room.log, chat:room.chat, chatVersion:room.chatVersion,
    board:g?.state.board.map(row=>row.map(c=>({...c,piece:sanitize(c.piece)}))),
    players:g?.state.players.map(p=>({...p, objective:null, pieces:p.pieces.map(sanitize), lostPieces:p.lostPieces.map(sanitize)}))};
}
function join(room, faction) {
  if (room.tokens[1] || room.closed) fail('Sala indisponível.');
  room.tokens[1] = crypto.randomUUID(); room.factions[1] = faction;
  room.game = engine(room.factions);
  room.game.state.players.forEach(p=>p.pieces.forEach(piece=>piece.publicId=crypto.randomUUID()));
  room.version++; room.updated = Date.now(); room.seen[1]=Date.now();
  return {token:room.tokens[1], ...view(room,1)};
}
function action(room, seat, data) {
  if (data.action === 'leave') { room.closed = true; return; }
  if (!room.game || room.closed) fail('A sala não está disponível.');
  if (data.version !== room.version) fail('O tabuleiro mudou. Tente novamente.');
  const g = room.game, s = g.state;
  if (s.winner !== null) fail('A partida terminou.');
  if (!room.ready.every(Boolean)) {
    if (room.ready[seat]) fail('Seu exército já foi confirmado.');
    if (data.action === 'ready') { room.ready[seat] = true; s.players[seat].ready = true; return; }
    if (data.action === 'shuffle') {
      const cells = s.board.flat().filter(c=>c.piece?.playerIndex===seat);
      const pieces = cells.map(c=>c.piece);
      for (let i=pieces.length-1;i>0;i--) { const j=crypto.randomInt(i+1); [pieces[i],pieces[j]]=[pieces[j],pieces[i]]; }
      cells.forEach((c,i)=>{c.piece=pieces[i];Object.assign(c.piece,{x:c.x,y:c.y,setupMoved:true});});
      return;
    }
  } else if (room.turn !== seat) fail('Aguarde sua vez.');
  if (data.action !== 'move') fail('Ação inválida.');
  const {x,y,fromX,fromY}=data;
  if (![x,y,fromX,fromY].every(n=>Number.isInteger(n)&&n>=0&&n<10)) fail('Posição inválida.');
  const piece=s.board[fromY][fromX].piece, cell=s.board[y][x];
  if (!piece || piece.playerIndex!==seat) fail('Selecione uma peça sua.');
  if (!room.ready.every(Boolean)) {
    if (!(seat===0 ? y<4 : y>=6)) fail('Use sua área de preparação.');
    if (cell.piece) g.swapSetupPieces(piece,cell.piece); else g.moveSetupPiece(piece,x,y);
    return;
  }
  if (!g.getValidMoves(piece).some(m=>m.x===x&&m.y===y)) fail('Movimento inválido.');
  if (cell.piece) {
    const result=g.resolveBattle(piece,cell.piece);
    g.applyBattleResult(piece,cell.piece,result.outcome);
    room.log.unshift({text:result.reason,type:'success'});
    if (result.captureObjective) s.winner=seat;
  } else {
    s.board[fromY][fromX].piece=null; cell.piece=piece; piece.x=x;piece.y=y;
    room.log.unshift({text:`Jogador ${seat+1} moveu uma peça para ${x+1}, ${y+1}.`,type:''});
  }
  room.log=room.log.slice(0,10); room.turn=1-seat;
  if (s.winner===null && !s.players[room.turn].pieces.some(p=>!p.lost&&g.getValidMoves(p).length)) {
    s.winner=seat;room.log.unshift({text:'O adversário ficou sem movimentos. Fim da batalha.',type:'success'});
  }
}
function api(data) {
  for (const [code,r] of rooms) if(Date.now()-r.updated>ttl) rooms.delete(code);
  const faction=data.faction;
  if (['create','join','quick'].includes(data.action)) {
    if (!['romanos','orcs','elfos','anoes','egipcios'].includes(faction)) fail('Reino inválido.');
    if (data.action==='join') { const r=rooms.get(String(data.code).toUpperCase()); if(!r) fail('Sala não encontrada.'); return join(r,faction); }
    if (data.action==='quick') { const r=[...rooms.values()].find(r=>r.quick&&!r.tokens[1]&&!r.closed); if(r) return join(r,faction); }
    if (rooms.size>=500) fail('Servidor cheio. Tente mais tarde.');
    let code; do {code=crypto.randomBytes(3).toString('hex').toUpperCase();} while(rooms.has(code));
    const r={code,tokens:[crypto.randomUUID(),null],factions:[faction,null],ready:[false,false],turn:0,version:0,log:[],chat:[],chatVersion:0,quick:data.action==='quick',updated:Date.now(),seen:[Date.now(),0],closed:false};
    rooms.set(code,r);return {token:r.tokens[0],...view(r,0)};
  }
  const room=rooms.get(data.code);
  const seat=room?.tokens.indexOf(data.token);
  if (!room || !data.token || seat<0) fail('Sessão expirada. Entre em uma nova sala.');
  room.updated=Date.now(); room.seen[seat]=Date.now();
  if(data.action==='chat') {
    if(room.closed) fail('A sala foi encerrada.');
    if(typeof data.text!=='string' || !data.text.trim() || data.text.length>500) fail('Escreva uma mensagem de até 500 caracteres.');
    if(typeof data.messageId!=='string' || !/^[a-zA-Z0-9-]{1,80}$/.test(data.messageId)) fail('Identificador de mensagem inválido.');
    if(!room.chat.some(m=>m.messageId===data.messageId&&m.seat===seat)) {
      room.chat.push({id:++room.chatVersion,messageId:data.messageId,seat,text:data.text.trim(),time:Date.now()});
      room.chat=room.chat.slice(-100);
    }
  } else if(data.action!=='poll') {action(room,seat,data);room.version++;}
  return view(room,seat);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/multiplayer'&&req.method==='POST') {
      if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) fail('Origem inválida.');
      let body='';for await(const chunk of req) {body+=chunk;if(body.length>8192) fail('Pedido muito grande.');}
      const result=api(JSON.parse(body));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));return;
    }
    const file=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    if(!/^\/(index\.html|app\.js|game-rules\.js|multiplayer\.js|styles\.css|multiplayer\.css|tutorial\.(js|css)|intro\.(js|css)|menu\.css|supabase-(config\.js|client\.js|online\.js|online\.css)|vendor\/supabase\.js|account\.(js|css)|economy\.(js|css)|bot\.js|audioManager\.js|assets\/[\w./ -]+)$/.test(file)||file.split('/').includes('..')) {res.writeHead(404);res.end();return;}
    const full=path.join(__dirname,file);
    if(!fs.existsSync(full)||!fs.statSync(full).isFile()) {res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream'});fs.createReadStream(full).pipe(res);
  } catch(error) {res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
});
if(require.main===module) server.listen(Number(process.env.PORT)||8000,'0.0.0.0',()=>console.log('DOMINIUS: http://localhost:'+(process.env.PORT||8000)));
module.exports={api,rooms,server};
