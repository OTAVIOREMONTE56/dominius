(() => {
  let pending;
  const config=window.DOMINIUS_SUPABASE||{};
  const expectedUrl='https://pvnhfxqvypxxiakdbctf.supabase.co';
  const configurationError=config.SUPABASE_URL!==expectedUrl
    ? `Configuração online inválida: SUPABASE_URL deve ser ${expectedUrl}. Atualize a página para carregar a configuração atual.`
    : !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.SUPABASE_PUBLISHABLE_KEY||'')
      ? 'Configure uma SUPABASE_PUBLISHABLE_KEY válida em supabase-config.js. Nunca use uma chave secreta no navegador.' : '';
  const configured=!configurationError;
  function errorMessage(error) {
    if(/failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(error?.message||''))
      return 'Não foi possível alcançar o Supabase. Verifique sua conexão e bloqueadores de rede e atualize a página. Se persistir, confira se o projeto está ativo no painel do Supabase.';
    return error?.message||'Não foi possível concluir a operação online.';
  }
  async function client() {
    if(!configured) throw new Error(configurationError);
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
  window.DominiusCloud={client,session,rpc,configured,errorMessage};
})();
