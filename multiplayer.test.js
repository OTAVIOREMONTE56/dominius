const {test}=require('node:test');
const assert=require('node:assert/strict');
const {api,rooms,server}=require('./server');
function pair(quick=false) {
  const a=api({action:quick?'quick':'create',faction:'romanos'});
  const b=api({action:quick?'quick':'join',code:a.code,faction:'orcs'});
  return [a,b];
}
const poll=p=>api({...p,action:'poll'});
const act=(p,action,extra={})=>api({...p,action,version:poll(p).version,...extra});
test('chat is private to the room, authenticated and independent of turns',()=>{
  const [a,b]=pair(),[other]=pair();
  const before=poll(a);
  const message={action:'chat',text:'Olá, comandante!',messageId:'test-message'};
  api({code:a.code,token:a.token,...message,seat:1});
  const received=poll(b);
  assert.equal(received.chat[0].text,message.text);
  assert.equal(received.chat[0].seat,0);
  assert.equal(received.version,before.version);
  assert.deepEqual(received.board,poll(b).board);
  assert.equal(poll(other).chat.length,0);
  api({code:a.code,token:a.token,...message});
  assert.equal(poll(b).chat.length,1);
  assert.throws(()=>api({code:a.code,token:'wrong',...message}));
  for(const text of ['', '   ', 'x'.repeat(501),42]) assert.throws(()=>api({code:a.code,token:a.token,...message,text}));
  act(a,'ready');act(b,'ready');
  api({code:b.code,token:b.token,action:'chat',text:'<img src=x onerror=alert(1)>',messageId:'literal-text'});
  assert.equal(poll(a).chat[1].text,'<img src=x onerror=alert(1)>');
  assert.equal(poll(a).turn,0);
  act(a,'leave');assert.throws(()=>api({code:b.code,token:b.token,...message}));
});
test('chat works while waiting and retains only the last 100 messages',()=>{
  const a=api({action:'create',faction:'romanos'});
  for(let i=0;i<105;i++) api({code:a.code,token:a.token,action:'chat',text:`Mensagem ${i}`,messageId:`message-${i}`});
  const b=api({action:'join',code:a.code,faction:'elfos'});
  assert.equal(b.chat.length,100);assert.equal(b.chat[0].text,'Mensagem 5');
  assert.equal(b.chatVersion,105);assert.deepEqual(poll(a).chat,b.chat);
});
test('create, join, hidden pieces, reconnect and capacity',()=>{
  const [a,b]=pair();const v=poll(a);
  assert.equal(v.joined,true);assert.equal(b.seat,1);
  assert.equal(v.players[1].objective,null);
  for(const p of v.players[1].pieces) {assert.equal(p.rank,undefined);assert.equal(p.roleKey,undefined);assert(!p.id.includes('objective'));}
  assert.equal(v.board[6][0].piece.rank,undefined);
  assert.equal(v.players[0].pieces[0].roleKey,'objective');
  assert.deepEqual(poll(a),v);
  assert.throws(()=>api({action:'join',code:a.code,faction:'elfos'}));
  assert.throws(()=>api({action:'poll',code:a.code,token:'fake'}));
});
test('independent preparation, ready lock, turn validation and version guard',()=>{
  const [a,b]=pair();
  act(a,'move',{fromX:0,fromY:0,x:1,y:0});
  assert.equal(poll(a).board[0][1].piece.roleKey,'objective');
  act(b,'shuffle');
  assert.throws(()=>act(a,'move',{fromX:1,fromY:0,x:1,y:6}));
  act(a,'ready');assert.throws(()=>act(a,'shuffle'));
  act(b,'ready');assert.equal(poll(a).battle,true);
  assert.throws(()=>act(b,'move',{fromX:0,fromY:6,x:0,y:5}));
  assert.throws(()=>act(a,'move',{fromX:0,fromY:0,x:0,y:1}));
  act(a,'move',{fromX:0,fromY:3,x:0,y:4});
  assert.equal(poll(b).turn,1);
  assert.throws(()=>api({...a,action:'ready',version:0}));
});
test('quick match, leave and expired rooms',()=>{
  const [a,b]=pair(true);assert.equal(a.code,b.code);
  act(a,'leave');assert.equal(poll(b).closed,true);
  assert.throws(()=>act(b,'ready'));
  rooms.get(a.code).updated=0;assert.throws(()=>poll(a));
});
test('combat, objective victory and no secret names in ordinary moves',()=>{
  const [a,b]=pair();act(a,'ready');act(b,'ready');
  act(a,'move',{fromX:0,fromY:3,x:0,y:4});
  assert.match(poll(b).log[0].text,/moveu uma peça/);
  const room=rooms.get(a.code),s=room.game.state;
  // Arrange an objective capture using real pieces and the production rules.
  const objective=s.players[1].pieces.find(p=>p.isObjective);
  const attacker=s.board[4][0].piece;
  s.board[objective.y][objective.x].piece=null;
  s.board[5][0].piece=objective;objective.x=0;objective.y=5;room.turn=0;
  act(a,'move',{fromX:attacker.x,fromY:attacker.y,x:0,y:5});
  assert.equal(poll(a).winner,0);assert.equal(poll(b).winner,0);
  assert.equal(poll(b).players[0].pieces[0].roleKey,'objective');
  assert.throws(()=>act(a,'move',{fromX:0,fromY:5,x:0,y:6}));
});
test('HTTP serves the game, handles room API and protects project files',async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const file of ['/','/game-rules.js','/multiplayer.js','/multiplayer.css','/tutorial.js','/tutorial.css']) assert.equal((await fetch(base+file)).status,200);
    const portrait=await fetch(base+'/assets/romanos/optimized/cesar.webp');
    assert.equal(portrait.status,200);
    assert.equal(portrait.headers.get('content-type'),'image/webp');
    for(const file of ['/server.js','/.git/config','/package.json']) assert.equal((await fetch(base+file)).status,404);
    const response=await fetch(base+'/api/multiplayer',{method:'POST',body:JSON.stringify({action:'create',faction:'elfos'})});
    assert.equal(response.status,200);assert.equal((await response.json()).seat,0);
    const invalid=await fetch(base+'/api/multiplayer',{method:'POST',body:'invalid json'});assert.equal(invalid.status,400);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
