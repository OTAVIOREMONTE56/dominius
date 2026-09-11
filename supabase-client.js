(() => {
  let pending;
  const config=window.DOMINIUS_SUPABASE||{};
  const configured=/^https:\/\//.test(config.SUPABASE_URL||'')&&/^sb_publishable_/.test(config.SUPABASE_PUBLISHABLE_KEY||'');
  async function client() {
    if(!configured) throw new Error('Configure SUPABASE_PUBLISHABLE_KEY em supabase-config.js para entrar online.');
    if(!pending) pending=(async()=>{
      if(!window.supabase) await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src='vendor/supabase.js';script.onload=resolve;
        script.onerror=()=>{script.remove();reject(new Error('Não foi possível carregar o serviço online. Atualize a página.'));};
        document.head.append(script);
      });
      const db=window.supabase.createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},
      });
      // Não chamar Auth assincronamente dentro deste callback.
      db.auth.onAuthStateChange((event,session)=>setTimeout(()=>window.dispatchEvent(new CustomEvent('dominius-auth',{detail:{event,session}})),0));
      return db;
    })().catch(error=>{pending=null;throw error;});
    return pending;
  }
  async function session() {const db=await client();const {data,error}=await db.auth.getSession();if(error)throw error;return data.session;}
  async function rpc(name,args) {const db=await client();const {data,error}=await db.rpc(name,args);if(error)throw new Error(error.message);return data;}
  window.DominiusCloud={client,session,rpc,configured};
})();
