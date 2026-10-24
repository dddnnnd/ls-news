import { supabase } from './supabase-client.js';
import { PUBLIC_SITE_URL } from './supabase-config.js';

const message = document.querySelector('#auth-message');
const loginPanel = document.querySelector('#login-panel');
const applyPanel = document.querySelector('#apply-panel');
const resetPanel = document.querySelector('#reset-panel');
const tabList = document.querySelector('.portal-tabs');
const authDialog = document.querySelector('#auth-dialog');
const journalLogin = document.querySelector('#journal-auth-open');
const journalCabinet = document.querySelector('#journal-cabinet-link');
const editorDialog = document.querySelector('#editor-dialog');
const editorFrame = document.querySelector('#editor-frame');
const query = new URLSearchParams(location.search);

function report(text, kind = 'info') {
  message.textContent = text;
  message.dataset.kind = kind;
}

function authPageUrl(mode) {
  const url = new URL('auth.html', PUBLIC_SITE_URL);
  if (mode) url.searchParams.set('mode', mode);
  return url.toString();
}

function showPanel(panel) {
  for (const form of [loginPanel, applyPanel, resetPanel]) form.hidden = form !== panel;
  tabList.hidden = panel === resetPanel;
  document.querySelectorAll('.portal-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.show === panel.id);
  });
}

function explainError(error) {
  const detail = String(error?.message || '');
  const normalized = detail.toLowerCase();

  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    return 'Таблицы кабинета не настроены. Администратору нужно выполнить supabase-setup.sql в Supabase SQL Editor.';
  }
  if (normalized.includes('invalid login credentials')) {
    return 'Неверный email или пароль. Проверь данные или сначала сбрось пароль.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Сначала подтверди email. Если письма нет, введи email и нажми «Не пришло письмо подтверждения?».';
  }
  if (normalized.includes('user already registered')) {
    return 'Аккаунт с таким адресом уже существует. Войди или запроси письмо подтверждения повторно.';
  }
  if (normalized.includes('lsn_user_profiles_username_key') || normalized.includes('duplicate key')) {
    return 'Этот User ID уже занят. Выбери другой.';
  }
  if (normalized.includes('error sending') || normalized.includes('smtp') || error?.status >= 500) {
    return 'Supabase не смог отправить письмо. Проверь SMTP в настройках Supabase; для Gmail нужен пароль приложения, не обычный пароль.';
  }
  if (error?.status === 429) {
    return 'Слишком много попыток. Подожди немного и попробуй ещё раз.';
  }
  return detail || 'Не удалось связаться с Supabase. Проверь интернет и настройки проекта.';
}

async function updateJournalMenu(isSignedIn) {
  if (!journalLogin || !journalCabinet) return;
  journalLogin.hidden = isSignedIn;
  journalCabinet.hidden = !isSignedIn;
  if (!isSignedIn) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profileUsername } = await supabase.rpc('get_lsn_username');
  const username = profileUsername || user.user_metadata?.username || user.id;
  const accountName = user.user_metadata?.full_name?.trim() || user.email?.split('@')[0] || 'Мой аккаунт';
  document.querySelector('#journal-account-name').textContent = accountName;
  document.querySelector('#journal-account-id').textContent = `User ID · ${username}`;
  journalCabinet.setAttribute('aria-label', `${accountName}, User ID ${username}. Открыть редакционный кабинет`);
}

if (journalCabinet && editorDialog && editorFrame) {
  journalCabinet.addEventListener('click', (event) => {
    event.preventDefault();
    if (!editorFrame.hasAttribute('src')) editorFrame.src = 'editor.html?embed=1';
    editorDialog.showModal();
  });

  document.querySelector('#editor-dialog-close').addEventListener('click', () => editorDialog.close());
  editorDialog.addEventListener('click', (event) => {
    if (event.target === editorDialog) editorDialog.close();
  });
  window.addEventListener('message', async (event) => {
    if (event.origin !== location.origin || event.source !== editorFrame.contentWindow) return;
    if (event.data?.type === 'lsn-close-editor') editorDialog.close();
    if (event.data?.type === 'lsn-editor-signed-out') {
      editorDialog.close();
      await updateJournalMenu(false);
      journalLogin?.focus();
    }
    if (event.data?.type === 'lsn-banner-changed') {
      window.dispatchEvent(new Event('lsn-banner-refresh'));
    }
  });
}

async function finishSignIn() {
  if (authDialog) {
    authDialog.close();
    await updateJournalMenu(true);
    journalCabinet?.focus();
    return;
  }
  location.assign('editor.html');
}

function getEmail(form) {
  const input = form.elements.email;
  input.value = input.value.trim();
  if (!input.reportValidity() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value)) return null;
  return input.value;
}

async function withButton(button, action) {
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    report(explainError(error), 'error');
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('.portal-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    showPanel(document.getElementById(tab.dataset.show));
    report('');
  });
});

loginPanel.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!loginPanel.reportValidity()) return;
  const button = loginPanel.querySelector('[type="submit"]');
  const values = new FormData(loginPanel);
  const identifier = String(values.get('email')).trim();
  const password = String(values.get('password'));
  report('Проверяю данные…');

  withButton(button, async () => {
    if (identifier.includes('@')) {
      const { error } = await supabase.auth.signInWithPassword({ email: identifier, password });
      if (error) return report(explainError(error), 'error');
    } else {
      const { data, error } = await supabase.functions.invoke('login-by-user-id', {
        body: { user_id: identifier, password },
      });
      if (error) {
        if (error.context?.status === 401) return report('Неверный User ID или пароль.', 'error');
        return report('Не удалось войти по User ID. Проверь, что Edge Function опубликована в Supabase.', 'error');
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError) return report(explainError(sessionError), 'error');
    }

    finishSignIn();
  });
});

applyPanel.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!applyPanel.reportValidity()) return;
  const button = applyPanel.querySelector('[type="submit"]');
  const values = new FormData(applyPanel);
  const email = String(values.get('email')).trim();
  const fullName = String(values.get('full_name')).trim();
  const username = String(values.get('username')).trim().toLowerCase();
  report('Создаю аккаунт…');

  withButton(button, async () => {
    const { data: isUsernameAvailable, error: usernameCheckError } = await supabase.rpc('lsn_username_available', {
      candidate_username: username,
    });
    if (usernameCheckError) return report('Не удалось проверить User ID. Администратору нужно выполнить обновлённый supabase-setup.sql.', 'error');
    if (!isUsernameAvailable) return report('Этот User ID уже занят или не подходит. Используй 3–24 латинских букв, цифр или символов _.', 'error');

    const { data, error } = await supabase.auth.signUp({
      email,
      password: String(values.get('password')),
      options: {
        data: { full_name: fullName, username },
        emailRedirectTo: authPageUrl(),
      },
    });
    if (error) return report(explainError(error), 'error');
    if (data.session) return finishSignIn();
    report('Аккаунт создан. Подтверди email по ссылке из письма, если это потребуется, затем войди.', 'success');
  });
});

document.querySelectorAll('[data-auth-open]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (!authDialog) return;
    event.preventDefault();
    const panel = link.dataset.authOpen === 'register' ? applyPanel : loginPanel;
    showPanel(panel);
    report('');
    authDialog.showModal();
  });
});

document.querySelector('#auth-dialog-close')?.addEventListener('click', () => authDialog.close());

document.querySelector('#resend-confirmation').addEventListener('click', () => {
  const email = getEmail(loginPanel);
  if (!email) return report('Введи корректный email в форме входа.', 'error');
  const button = document.querySelector('#resend-confirmation');
  report('Запрашиваю письмо подтверждения…');

  withButton(button, async () => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authPageUrl() },
    });
    if (error) return report(explainError(error), 'error');
    report('Если аккаунт ожидает подтверждения, письмо отправлено. Проверь входящие, спам и промоакции.', 'success');
  });
});

document.querySelector('#forgot-password').addEventListener('click', () => {
  const email = getEmail(loginPanel);
  if (!email) return report('Введи корректный email в форме входа.', 'error');
  const button = document.querySelector('#forgot-password');
  report('Запрашиваю письмо для сброса пароля…');

  withButton(button, async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authPageUrl('recovery'),
    });
    if (error) return report(explainError(error), 'error');
    report('Если адрес зарегистрирован, Supabase отправит письмо для сброса пароля. Проверь входящие, спам и промоакции.', 'success');
  });
});

resetPanel.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!resetPanel.reportValidity()) return;
  const button = resetPanel.querySelector('[type="submit"]');
  const password = String(new FormData(resetPanel).get('password'));
  report('Сохраняю новый пароль…');

  withButton(button, async () => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return report(explainError(error), 'error');
    await supabase.auth.signOut();
    resetPanel.reset();
    showPanel(loginPanel);
    report('Пароль обновлён. Теперь можно войти.', 'success');
  });
});

if (query.get('error_description')) {
  report(query.get('error_description'), 'error');
} else if (query.get('mode') === 'recovery') {
  showPanel(resetPanel);
  report('Введи новый пароль из письма восстановления.');
} else {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) report(explainError(error), 'error');
  if (authDialog) {
    await updateJournalMenu(Boolean(session));
  } else if (session) {
    location.assign('editor.html');
  }
  if (query.get('code')) report('Email подтверждён. Теперь войди в кабинет.', 'success');
}
