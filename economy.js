// Coroas are read from Supabase. The browser never calculates or writes a wallet balance.
(() => {
  const format = value => new Intl.NumberFormat('pt-BR').format(value);
  let userId = null;
  let balance = null;
  let walletRequest = 0;
  const badge = document.createElement('div');
  badge.id = 'coin-balance-badge';
  badge.className = 'coin-balance';
  badge.hidden = true;
  badge.innerHTML = '<span aria-hidden="true">♛</span> COROAS <strong>—</strong>';
  document.querySelector('#start-screen')?.append(badge);

  async function wallet() {
    const request = ++walletRequest;
    const session = await DominiusCloud.session();
    if (!session) {
      if (request === walletRequest) { userId = null; balance = null; badge.hidden = true; }
      return null;
    }
    const db = await DominiusCloud.client();
    const { data, error } = await db.from('wallets').select('balance').eq('user_id', session.user.id).single();
    if (error) throw error;
    if (request !== walletRequest) return null;
    const previous = userId === session.user.id ? balance : null;
    userId = session.user.id;
    balance = Number(data.balance);
    badge.hidden = false;
    badge.querySelector('strong').textContent = format(balance);
    if (previous !== null && balance > previous) {
      badge.classList.remove('coin-gain');
      void badge.offsetWidth;
      badge.classList.add('coin-gain');
    }
    document.querySelectorAll('[data-coin-balance]').forEach(el => { el.textContent = format(balance); });
    return balance;
  }
  async function history() {
    const session = await DominiusCloud.session();
    if (!session) return [];
    const db = await DominiusCloud.client();
    const { data, error } = await db.from('coin_transactions')
      .select('amount,type,balance_after,created_at').eq('user_id', session.user.id)
      .order('id', { ascending: false }).limit(10);
    if (error) throw error;
    return data;
  }
  window.DominiusEconomy = { wallet, history, format, get balance() { return balance; } };
  window.addEventListener('dominius-auth', () => wallet().catch(() => { badge.hidden = true; }));
  if (DominiusCloud.configured) wallet().catch(() => { badge.hidden = true; });
})();
