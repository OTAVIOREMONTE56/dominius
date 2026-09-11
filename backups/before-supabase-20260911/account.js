/* DOMINIUS — protótipo de conta, exclusivamente local.
 * NÃO é autenticação, NÃO protege recursos e NÃO cria contas reais.
 * Nenhuma senha/e-mail entra no estado, em armazenamento ou em requisições.
 * A futura integração deve substituir o serviço de demonstração por um backend
 * de autenticação real; nunca aproveitar esta comparação pública como segurança.
 * Não depende de state, els, FACTIONS ou de qualquer função de gameplay.
 */
(() => {
  'use strict';
  const dialog = document.getElementById('account-dialog');
  const view = document.getElementById('account-view');
  const entry = document.getElementById('account-entry');
  const factions = ['Nenhuma', 'Romanos', 'Orcs', 'Elfos', 'Anões', 'Egípcios'];
  const demoIdentity = Object.freeze({ email: 'comandante@dominius.test', password: 'dominius' });
  // Estado efêmero: somente dados cosméticos. Recarregar elimina a sessão.
  const demoSession = {
    profile: null,
    draftName: null,
    signIn() {
      this.profile = { name: this.draftName || 'Comandante', favoriteFaction: 'Nenhuma' };
      this.draftName = null;
    },
    signOut() { this.profile = null; this.draftName = null; },
  };

  function clearSensitiveFields() {
    view.querySelectorAll('input[type="password"], input[type="email"]').forEach(input => { input.value = ''; });
  }

  function updateAccountEntry() {
    entry.textContent = demoSession.profile ? 'CONTA / PERFIL' : 'CONTA / ENTRAR';
  }

  function openAuth() {
    if (dialog.open) return;
    if (demoSession.profile) renderProfile();
    else renderLogin();
    dialog.showModal();
    view.querySelector('h2').focus();
  }

  function closeAuth() {
    clearSensitiveFields();
    dialog.close();
  }

  function renderView(title, content) {
    clearSensitiveFields();
    // Somente templates internos constantes. Dados do jogador usam textContent/value.
    view.innerHTML = '<h2 id="account-view-title" tabindex="-1"></h2>' + content;
    const heading = view.querySelector('h2');
    heading.textContent = title;
    dialog.scrollTop = 0;
    if (dialog.open) heading.focus();
  }

  function field(id, label, type = 'text', options = '') {
    return '<div class="account-field"><label for="' + id + '">' + label +
      '</label><input id="' + id + '" type="' + type + '" autocomplete="off" aria-describedby="' + id +
      '-error" ' + options + '><p class="account-field-error" id="' + id + '-error"></p></div>';
  }

  function feedback() {
    return '<p id="account-feedback" class="account-feedback" role="status" aria-live="polite" aria-atomic="true" hidden></p>';
  }

  function renderLogin() {
    renderView('ENTRAR', `
      <p class="account-copy">Explore a área do comandante com um perfil de demonstração.</p>
      <div class="account-demo-credentials">E-mail: <strong>comandante@dominius.test</strong><br>Senha fictícia: <strong>dominius</strong></div>
      <form data-account-form="login" novalidate autocomplete="off">
        ${field('account-login-email', 'E-mail', 'email', 'required maxlength="254" spellcheck="false" autocapitalize="none"')}
        ${field('account-login-password', 'Senha', 'password', 'required minlength="6" maxlength="128"')}
        ${feedback()}
        <div class="account-actions">
          <button class="account-button account-primary" type="submit">ENTRAR</button>
          <button class="account-button" type="button" data-account-action="register">CRIAR CONTA</button>
        </div>
        <div class="account-links">
          <button class="account-link" type="button" data-account-action="recover">ESQUECI MINHA SENHA</button>
          <button class="account-link" type="button" data-account-action="close">VOLTAR</button>
        </div>
      </form>`);
    view.querySelector('#account-login-email').value = demoIdentity.email;
  }

  function renderRegister() {
    renderView('CRIAR CONTA', `
      <p class="account-copy">Ensaie seu alistamento. Este cadastro não cria uma conta online. Não use uma senha real.</p>
      <form data-account-form="register" novalidate autocomplete="off">
        <div class="account-form-grid">
          ${field('account-register-name', 'Nome de jogador', 'text', 'required minlength="3" maxlength="32"')}
          ${field('account-register-email', 'E-mail', 'email', 'required maxlength="254" spellcheck="false" autocapitalize="none"')}
          ${field('account-register-password', 'Senha', 'password', 'required minlength="6" maxlength="128"')}
          ${field('account-register-confirm', 'Confirmar senha', 'password', 'required maxlength="128"')}
        </div>
        ${feedback()}
        <div class="account-actions">
          <button class="account-button account-primary" type="submit">CRIAR CONTA</button>
          <button class="account-button" type="button" data-account-action="login">VOLTAR PARA ENTRAR</button>
        </div>
      </form>`);
  }

  function renderRegistrationSuccess() {
    renderView('ALISTAMENTO SIMULADO', `
      <p class="account-success" role="status">Conta criada com sucesso. Conectaremos esta tela ao sistema online na próxima etapa.</p>
      <p class="account-copy">Esta foi apenas uma simulação. Nenhuma conta real foi criada. Para conhecer o perfil, volte para Entrar e use as credenciais fictícias exibidas lá.</p>
      <button class="account-button account-primary" type="button" data-account-action="login">VOLTAR PARA ENTRAR</button>`);
  }

  function renderRecovery() {
    renderView('RECUPERAR SENHA', `
      <p class="account-copy">Prévia do fluxo de recuperação. Nenhum e-mail será enviado nesta etapa.</p>
      <form data-account-form="recover" novalidate autocomplete="off">
        ${field('account-recovery-email', 'E-mail', 'email', 'required maxlength="254" spellcheck="false" autocapitalize="none"')}
        ${feedback()}
        <div class="account-actions">
          <button class="account-button account-primary" type="submit">SIMULAR RECUPERAÇÃO</button>
          <button class="account-button" type="button" data-account-action="login">VOLTAR PARA ENTRAR</button>
        </div>
      </form>`);
  }

  function renderProfile() {
    if (!demoSession.profile) { renderLogin(); return; }
    renderView('PERFIL DO COMANDANTE', `
      <p class="account-player-name" id="account-player-name"></p>
      <p class="account-copy account-online">Status: <strong>Online</strong> <span>· presença simulada</span></p>
      <dl class="account-stats">
        <div><dt>Liga</dt><dd>Não classificado</dd></div><div><dt>Rating</dt><dd>1000</dd></div>
        <div><dt>Vitórias</dt><dd>0</dd></div><div><dt>Derrotas</dt><dd>0</dd></div>
        <div><dt>Partidas</dt><dd>0</dd></div><div><dt>Facção favorita</dt><dd id="account-favorite"></dd></div>
      </dl>
      <p class="account-copy">Estatísticas de demonstração, sem vínculo com as partidas.</p>
      <div class="account-actions account-profile-actions">
        <button class="account-button account-primary" type="button" data-account-action="play">JOGAR</button>
        <button class="account-button" type="button" data-account-action="edit">EDITAR PERFIL</button>
        <button class="account-button" type="button" data-account-action="logout">SAIR DA CONTA</button>
      </div>`);
    view.querySelector('#account-player-name').textContent = demoSession.profile.name;
    view.querySelector('#account-favorite').textContent = demoSession.profile.favoriteFaction;
  }

  function renderEditProfile() {
    if (!demoSession.profile) { renderLogin(); return; }
    renderView('EDITAR PERFIL', `
      <p class="account-copy">Personalize seu comandante nesta demonstração. A preferência de facção não altera o exército da partida.</p>
      <form data-account-form="edit" novalidate autocomplete="off">
        ${field('account-edit-name', 'Nome de jogador', 'text', 'required minlength="3" maxlength="32"')}
        <div class="account-field">
          <label for="account-edit-faction">Facção favorita</label>
          <select id="account-edit-faction" aria-describedby="account-edit-faction-error"></select>
          <p class="account-field-error" id="account-edit-faction-error"></p>
        </div>
        ${feedback()}
        <div class="account-actions">
          <button class="account-button account-primary" type="submit">SALVAR ALTERAÇÕES</button>
          <button class="account-button" type="button" data-account-action="profile">VOLTAR AO PERFIL</button>
        </div>
      </form>`);
    view.querySelector('#account-edit-name').value = demoSession.profile.name;
    const select = view.querySelector('#account-edit-faction');
    factions.forEach(label => {
      const option = document.createElement('option');
      option.value = option.textContent = label;
      select.appendChild(option);
    });
    select.value = demoSession.profile.favoriteFaction;
  }

  function resetErrors(form) {
    form.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    form.querySelectorAll('.account-field-error').forEach(error => { error.textContent = ''; });
    const message = form.querySelector('#account-feedback');
    message.hidden = true;
    message.textContent = '';
    message.classList.remove('account-success');
  }

  function markError(input, message) {
    input.setAttribute('aria-invalid', 'true');
    document.getElementById(input.id + '-error').textContent = message;
  }

  function validName(input) {
    const length = Array.from(input.value.trim()).length;
    if (length < 3 || length > 32) { markError(input, 'Use um nome de 3 a 32 caracteres.'); return false; }
    return true;
  }

  function validEmail(input) {
    input.value = input.value.trim();
    if (!input.value || input.value.length > 254 || input.validity.typeMismatch || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) {
      markError(input, 'Informe um e-mail com formato válido.'); return false;
    }
    return true;
  }

  function validPassword(input) {
    if (input.value.length < 6 || input.value.length > 128) {
      markError(input, 'Use uma senha fictícia de 6 a 128 caracteres.'); return false;
    }
    return true;
  }

  function announce(form, message, success = false) {
    const feedback = form.querySelector('#account-feedback');
    feedback.textContent = message;
    feedback.classList.toggle('account-success', success);
    feedback.hidden = false;
  }

  function rejectInvalid(form, validations) {
    if (validations.every(Boolean)) return false;
    announce(form, 'Revise os campos destacados para continuar.');
    form.querySelector('[aria-invalid="true"]')?.focus();
    return true;
  }

  function submitLogin(form) {
    const email = form.querySelector('#account-login-email');
    const password = form.querySelector('#account-login-password');
    if (rejectInvalid(form, [validEmail(email), validPassword(password)])) return;
    // Credenciais públicas de demonstração. Isto NÃO autentica uma identidade.
    if (email.value.toLowerCase() !== demoIdentity.email || password.value !== demoIdentity.password) {
      password.value = '';
      announce(form, 'Este protótipo aceita somente o e-mail comandante@dominius.test e a senha fictícia dominius.');
      password.focus();
      return;
    }
    clearSensitiveFields();
    demoSession.signIn();
    updateAccountEntry();
    renderProfile();
  }

  function submitRegistration(form) {
    const name = form.querySelector('#account-register-name');
    const password = form.querySelector('#account-register-password');
    const confirm = form.querySelector('#account-register-confirm');
    const matches = Boolean(confirm.value) && password.value === confirm.value;
    if (!matches) markError(confirm, 'A confirmação deve ser igual à senha.');
    if (rejectInvalid(form, [validName(name), validEmail(form.querySelector('#account-register-email')), validPassword(password), matches])) return;
    demoSession.draftName = name.value.trim(); // Somente o nome fictício, nunca as credenciais.
    clearSensitiveFields();
    renderRegistrationSuccess();
  }

  function submitRecovery(form) {
    if (rejectInvalid(form, [validEmail(form.querySelector('#account-recovery-email'))])) return;
    clearSensitiveFields();
    announce(form, 'Simulação concluída. Nenhum e-mail foi enviado. A recuperação estará disponível após a integração online.', true);
  }

  function submitProfileEdit(form) {
    if (!demoSession.profile) { renderLogin(); return; }
    const name = form.querySelector('#account-edit-name');
    const favorite = form.querySelector('#account-edit-faction');
    const validFaction = factions.includes(favorite.value);
    if (!validFaction) markError(favorite, 'Escolha uma das facções disponíveis.');
    if (rejectInvalid(form, [validName(name), validFaction])) return;
    demoSession.profile = { name: name.value.trim(), favoriteFaction: favorite.value };
    renderProfile();
  }

  const routes = {
    login: renderLogin, register: renderRegister, recover: renderRecovery,
    profile: renderProfile, edit: renderEditProfile, close: closeAuth,
    play() {
      closeAuth();
      // Devolve ao menu: a escolha de modo continua nos botões originais.
      document.querySelector('#start-screen [data-menu-mode="bot"]').focus();
    },
    logout() {
      clearSensitiveFields();
      demoSession.signOut();
      updateAccountEntry();
      renderLogin();
      announce(view.querySelector('form'), 'Você saiu do perfil de demonstração. Os dados do perfil foram descartados.', true);
    },
  };

  document.querySelectorAll('[data-account-open]').forEach(button => button.addEventListener('click', openAuth));
  dialog.addEventListener('click', event => {
    const button = event.target.closest('[data-account-action]');
    if (button && dialog.contains(button)) routes[button.dataset.accountAction]?.();
  });
  const submissions = { login: submitLogin, register: submitRegistration, recover: submitRecovery, edit: submitProfileEdit };
  dialog.addEventListener('submit', event => {
    const form = event.target.closest('[data-account-form]');
    if (!form) return;
    event.preventDefault(); // Nunca enviar formulários/credenciais.
    resetErrors(form);
    submissions[form.dataset.accountForm]?.(form);
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeAuth(); });
  dialog.addEventListener('close', () => {
    if (!dialog.open) { clearSensitiveFields(); view.replaceChildren(); }
  });
})();
