const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

test('faction colors survive swapped seats and hidden online opponents',t=>{
  const read=f=>fs.readFileSync(f,'utf8');
  const dom=new JSDOM(read('index.html'),{runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window;
  w.matchMedia=()=>({matches:true});
  for(const file of ['bot.js','game-rules.js','app.js'])vm.runInContext(read(file),dom.getInternalVMContext());
  const style=w.document.createElement('style');style.textContent=read('styles.css');w.document.head.append(style);
  const colors={romanos:'#2868b2',orcs:'#b33240',elfos:'#299563',anoes:'#df812f',egipcios:'#d6ad38'};
  for(const faction of Object.keys(colors))for(const seat of [0,1])for(const viewer of [0,1]) {
    w.dominiusMultiplayer={active:true,seat:viewer};
    w.eval(`state.gameMode='online';state.phase='battle';state.winner=null;
      state.players=[{faction:'${faction}'},{faction:'${faction}'}];
      state.board=buildInitialBoard();
      state.board[0][0].piece={...PIECE_CONFIG.rank5,id:'test',roleKey:'rank5',
        factionKey:'${faction}',playerIndex:${seat},name:FACTIONS['${faction}'].names.rank5,x:0,y:0};
      renderBoard();`);
    const piece=w.document.querySelector('#board .piece');
    assert.equal(piece.dataset.faction,faction);
    assert.equal(w.getComputedStyle(piece).getPropertyValue('--medal-light').trim(),colors[faction]);
    assert(!/player-[12]/.test(piece.className));
    if(viewer!==seat) {
      assert.equal(piece.textContent,'?');
      assert.equal(piece.dataset.kind,undefined);
      assert.equal(piece.title,'');
      assert.equal(piece.querySelector('svg'),null);
    } else assert(piece.textContent.includes('5'));
  }
  assert(!/\.piece\.player-[12]\s*\{/.test(read('styles.css')));
});
