import { supabase } from './supabase-client.js';

const message = document.querySelector('#editor-message');
const list = document.querySelector('#article-list');
const articleSearch = document.querySelector('#article-search');
const articleStatusFilter = document.querySelector('#article-status-filter');
const articleListSummary = document.querySelector('#article-list-summary');
const roleMessage = document.querySelector('#role-message');
const roleList = document.querySelector('#user-role-list');
const roleSearch = document.querySelector('#role-account-search');
const roleSearchEmpty = document.querySelector('#role-search-empty');
const roleOverview = document.querySelector('#role-overview');
const articleForm = document.querySelector('#article-form');
const articleSubmit = document.querySelector('#article-submit');
const articleCancelEdit = document.querySelector('#article-cancel-edit');
const bannerForm = document.querySelector('#banner-form');
const bannerMessage = document.querySelector('#banner-message');
const bannerKey = document.querySelector('#banner-key');
const bannerList = document.querySelector('#banner-list');
const imageInput = document.querySelector('#article-image');
const imagePreviewWrap = document.querySelector('#image-preview-wrap');
const imagePreview = document.querySelector('#image-preview');
let currentUser;
let currentPublicUserId;
let isModerator = false;
let imagePreviewUrl;
let siteBanners = [];
let editorArticles = [];
let editingArticle = null;
const embeddedEditor = new URLSearchParams(location.search).get('embed') === '1';
if (embeddedEditor) document.body.classList.add('embedded-editor');

const roleLabels = {
  moderator: 'Модератор',
  journalist: 'Журналист',
  editor: 'Редактор',
};

function report(text, kind = 'info') {
  message.textContent = text;
  message.dataset.kind = kind;
}

function notifyBannerChanged() {
  if (embeddedEditor) window.parent.postMessage({ type: 'lsn-banner-changed' }, location.origin);
}

function hasSchemaError(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

function articleErrorMessage(error) {
  const text = error?.message || 'Неизвестная ошибка.';
  if (error?.code === '42501' || /row-level security|permission denied/i.test(text)) {
    return 'Supabase отклонил запись по RLS. Откройте SQL Editor нужного проекта и заново выполните актуальный файл supabase-setup.sql.';
  }
  if (error?.code === 'PGRST204' || /image_url/i.test(text)) {
    return 'В таблице нет поля для фотографии. Выполните актуальный supabase-setup.sql в SQL Editor.';
  }
  return text;
}

function updateSubmitLabel() {
  if (editingArticle) {
    articleSubmit.textContent = 'Сохранить изменения';
    return;
  }
  articleSubmit.textContent = articleForm.elements.status.value === 'published'
    ? 'Опубликовать статью'
    : 'Сохранить как черновик';
}

function clearImagePreview() {
  if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
  imagePreviewUrl = undefined;
  imagePreview.removeAttribute('src');
  imagePreviewWrap.hidden = true;
}

function showBannerInForm() {
  const banner = siteBanners.find((item) => item.banner_key === bannerKey.value);
  bannerForm.elements.message.value = banner?.message || '';
}

function renderBanners() {
  bannerList.replaceChildren();
  if (!siteBanners.length) {
    const empty = document.createElement('p');
    empty.className = 'banner-list-empty';
    empty.textContent = 'Сохранённых баннеров пока нет. Выберите полосу выше и добавьте текст.';
    bannerList.append(empty);
    return;
  }

  for (const banner of siteBanners) {
    const row = document.createElement('article');
    row.className = 'banner-list-row';
    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = banner.label || banner.banner_key;
    const text = document.createElement('p');
    text.textContent = banner.message || 'Без текста';
    const state = document.createElement('span');
    state.className = banner.is_active ? 'banner-state is-active' : 'banner-state';
    state.textContent = banner.is_active ? 'Показывается на сайте' : 'Выключен';
    copy.append(title, text, state);

    const actions = document.createElement('div');
    actions.className = 'banner-list-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.action = 'edit-banner';
    edit.dataset.key = banner.banner_key;
    edit.className = 'secondary-button';
    edit.textContent = 'Изменить';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.action = 'delete-banner';
    remove.dataset.key = banner.banner_key;
    remove.className = 'secondary-button danger-button';
    remove.textContent = 'Удалить';
    actions.append(edit, remove);
    row.append(copy, actions);
    bannerList.append(row);
  }
}

async function loadBanners() {
  const { data, error } = await supabase
    .from('lsn_site_banners')
    .select('banner_key, label, message, is_active')
    .order('banner_key');
  if (error) {
    bannerMessage.textContent = 'Не удалось загрузить баннеры. Выполните обновлённый supabase-setup.sql в SQL Editor.';
    bannerMessage.dataset.kind = 'error';
    return;
  }
  siteBanners = data || [];
  renderBanners();
  showBannerInForm();
}

bannerKey.addEventListener('change', showBannerInForm);

bannerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!bannerForm.reportValidity()) return;
  const values = new FormData(bannerForm);
  const bannerType = String(values.get('banner_key'));
  const messageText = String(values.get('message')).trim();
  if (!messageText) {
    bannerMessage.textContent = 'Добавьте текст баннера перед сохранением.';
    bannerMessage.dataset.kind = 'error';
    bannerForm.elements.message.focus();
    return;
  }
  const submit = bannerForm.querySelector('[type="submit"]');
  submit.disabled = true;
  bannerMessage.textContent = 'Сохраняю настройки баннера…';
  const banner = {
    banner_key: bannerType,
    label: bannerType === 'ticker' ? 'Срочно' : bannerType === 'ad' ? 'Реклама' : 'Новости • Статьи',
    message: messageText,
    is_active: true,
    updated_at: new Date().toISOString(),
    updated_by: currentUser.id,
  };
  const { error } = await supabase.from('lsn_site_banners').upsert(banner, { onConflict: 'banner_key' });
  submit.disabled = false;
  if (error) {
    bannerMessage.textContent = error.code === '42501'
      ? 'Supabase отклонил изменение. Выполните политики баннеров из актуального supabase-setup.sql.'
      : error.message;
    bannerMessage.dataset.kind = 'error';
    return;
  }
  siteBanners = siteBanners.filter((item) => item.banner_key !== banner.banner_key).concat(banner);
  renderBanners();
  notifyBannerChanged();
  bannerMessage.textContent = 'Текст сохранён и показывается на сайте.';
  bannerMessage.dataset.kind = 'success';
});

bannerList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const banner = siteBanners.find((item) => item.banner_key === button.dataset.key);
  if (!banner) return;
  if (button.dataset.action === 'edit-banner') {
    bannerKey.value = banner.banner_key;
    showBannerInForm();
    bannerForm.elements.message.focus();
    return;
  }
  if (!window.confirm(`Удалить полосу «${banner.label || banner.banner_key}»? Она исчезнет с сайта.`)) return;
  button.disabled = true;
  bannerMessage.textContent = 'Удаляю баннер…';
  const { error } = await supabase.from('lsn_site_banners').delete().eq('banner_key', banner.banner_key);
  if (error) {
    button.disabled = false;
    bannerMessage.textContent = error.code === '42501'
      ? 'Supabase запретил удаление. Выполните новую политику удаления из supabase-setup.sql.'
      : error.message;
    bannerMessage.dataset.kind = 'error';
    return;
  }
  siteBanners = siteBanners.filter((item) => item.banner_key !== banner.banner_key);
  notifyBannerChanged();
  if (bannerKey.value === banner.banner_key) bannerForm.elements.message.value = '';
  renderBanners();
  bannerMessage.textContent = 'Баннер удалён и скрыт с сайта.';
  bannerMessage.dataset.kind = 'success';
});

imageInput.addEventListener('change', () => {
  clearImagePreview();
  const file = imageInput.files?.[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    imageInput.value = '';
    report('Выберите изображение JPG, PNG, WebP или GIF.', 'error');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    imageInput.value = '';
    report('Фотография слишком большая. Максимальный размер — 8 МБ.', 'error');
    return;
  }
  imagePreviewUrl = URL.createObjectURL(file);
  imagePreview.src = imagePreviewUrl;
  imagePreviewWrap.hidden = false;
  report('Фотография готова к загрузке.');
});

document.querySelector('#remove-image').addEventListener('click', () => {
  imageInput.value = '';
  clearImagePreview();
});

articleForm.elements.status.addEventListener('change', updateSubmitLabel);

async function initialize() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return location.replace('auth.html');
  currentUser = user;
  const { data: profileUsername } = await supabase.rpc('get_lsn_username');
  const publicUserId = profileUsername || user.user_metadata?.username || user.id;
  currentPublicUserId = publicUserId;
  const accountName = user.user_metadata?.full_name?.trim() || user.email?.split('@')[0] || 'Аккаунт';
  document.querySelector('#editor-user-id').textContent = publicUserId;
  document.querySelector('#account-trigger-name').textContent = accountName;
  document.querySelector('#account-trigger-id').textContent = `User ID · ${publicUserId}`;
  document.querySelector('#editor-account-email').textContent = user.email || '';
  const { data: role, error: roleError } = await supabase.rpc('get_lsn_user_role');
  if (roleError) {
    report('Не удалось проверить роль. Выполните обновлённый supabase-setup.sql.', 'error');
    return;
  }
  isModerator = role === 'moderator';
  document.querySelector('#editor-user').textContent = `${accountName} · ${roleLabels[role] || roleLabels.editor}`;
  document.querySelector('#moderator-nav-link').hidden = !isModerator;
  if (isModerator) document.querySelector('#article-list-title').textContent = 'Все материалы';
  if (isModerator) {
    const sharedAccount = new URLSearchParams(location.search).get('account');
    if (sharedAccount) roleSearch.value = sharedAccount;
    await loadUsersAndRoles();
  }
  await loadBanners();
  await loadArticles();
}

function activateDashboardPanel(panelId, { scroll = false } = {}) {
  const panel = document.getElementById(panelId);
  if (!panel?.classList.contains('dashboard-panel')) return;
  if (panelId === 'moderator-tools' && !isModerator) return;

  for (const dashboardPanel of document.querySelectorAll('.dashboard-panel')) {
    dashboardPanel.hidden = dashboardPanel !== panel;
  }
  for (const button of document.querySelectorAll('[data-panel-target]')) {
    const isActive = button.dataset.panelTarget === panelId;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  }
  const nextUrl = new URL(location.href);
  nextUrl.hash = panelId;
  history.replaceState(null, '', nextUrl);
  if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelectorAll('[data-panel-target]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.panelTarget === 'new-article' && editingArticle) resetArticleEditor();
    activateDashboardPanel(button.dataset.panelTarget, { scroll: true });
  });
});

function normalizeAccountSearch(value) {
  const query = value.trim();
  if (!query) return '';
  try {
    const url = new URL(query);
    const target = ['account', 'user_id', 'userid', 'id', 'username']
      .map((key) => url.searchParams.get(key))
      .find(Boolean);
    return String(target || decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || query))
      .replace(/^@/, '').toLowerCase();
  } catch {
    return query.replace(/^@/, '').toLowerCase();
  }
}

function filterRoleList() {
  const term = normalizeAccountSearch(roleSearch.value);
  let visibleCount = 0;
  for (const row of roleList.children) {
    row.hidden = Boolean(term) && !row.dataset.search.includes(term);
    if (!row.hidden) visibleCount += 1;
  }
  roleSearchEmpty.hidden = !term || visibleCount > 0;
}

async function loadUsersAndRoles() {
  const { data, error } = await supabase.rpc('lsn_admin_list_users');
  if (error) {
    roleList.textContent = 'Не удалось загрузить пользователей. Проверьте SQL-схему Supabase.';
    return;
  }

  roleList.replaceChildren();
  roleOverview.replaceChildren();
  const roleCounts = data.reduce((counts, account) => {
    counts[account.role] = (counts[account.role] || 0) + 1;
    return counts;
  }, {});
  for (const role of ['moderator', 'journalist', 'editor']) {
    const stat = document.createElement('div');
    stat.className = `role-stat role-stat-${role}`;
    const count = document.createElement('strong');
    count.textContent = String(roleCounts[role] || 0);
    const label = document.createElement('span');
    label.textContent = roleLabels[role];
    stat.append(count, label);
    roleOverview.append(stat);
  }

  for (const account of data) {
    const row = document.createElement('div');
    row.className = 'user-role-row';
    row.dataset.search = [account.username, account.email, account.full_name, account.user_id]
      .filter(Boolean).join(' ').toLowerCase();

    const identity = document.createElement('div');
    identity.className = 'user-role-identity';
    const name = document.createElement('strong');
    name.textContent = account.full_name || account.email || account.user_id;
    const email = document.createElement('span');
    email.textContent = account.email || account.user_id;
    const userId = document.createElement('code');
    userId.textContent = account.username ? `@${account.username}` : account.user_id;
    identity.append(name, email, userId);

    const controls = document.createElement('div');
    controls.className = 'user-role-controls';
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Роль пользователя ${account.email || account.user_id}`);
    const availableRoles = account.role === 'moderator'
      ? ['moderator', 'journalist', 'editor']
      : ['journalist', 'editor'];
    for (const role of availableRoles) {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = roleLabels[role];
      option.selected = account.role === role;
      option.disabled = role === 'moderator';
      select.append(option);
    }

    const isCurrentUser = account.user_id === currentUser.id;
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Сохранить роль';
    save.disabled = isCurrentUser;
    select.disabled = isCurrentUser;
    if (isCurrentUser) save.title = 'Нельзя менять собственную роль';

    save.addEventListener('click', async () => {
      save.disabled = true;
      roleMessage.textContent = 'Сохраняю роль…';
      const { error: updateError } = await supabase.rpc('lsn_admin_set_user_role', {
        target_user_id: account.user_id,
        new_role: select.value,
      });
      if (updateError) {
        roleMessage.textContent = 'Не удалось изменить роль. Обновите список и попробуйте снова.';
        save.disabled = false;
        return;
      }
      roleMessage.textContent = `Роль пользователя ${account.email || account.user_id} изменена.`;
      await loadUsersAndRoles();
    });

    controls.append(select, save);
    const accountUrl = new URL(location.href);
    accountUrl.searchParams.delete('embed');
    accountUrl.searchParams.set('account', account.username || account.user_id);
    accountUrl.hash = 'moderator-tools';
    const copyLink = document.createElement('button');
    copyLink.type = 'button';
    copyLink.className = 'role-account-link';
    copyLink.textContent = 'Ссылка';
    copyLink.title = 'Скопировать ссылку на управление этим аккаунтом';
    copyLink.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(accountUrl.toString());
        roleMessage.textContent = `Ссылка для управления аккаунтом ${account.username ? `@${account.username}` : account.email} скопирована.`;
      } catch {
        roleMessage.textContent = `Скопируйте адрес вручную: ${accountUrl.toString()}`;
      }
    });
    controls.append(copyLink);
    row.append(identity, controls);
    roleList.append(row);
  }
  filterRoleList();
}

roleSearch.addEventListener('input', filterRoleList);
document.querySelector('#clear-role-search').addEventListener('click', () => {
  roleSearch.value = '';
  filterRoleList();
  roleSearch.focus();
});

async function loadArticles() {
  let query = supabase
    .from('lsn_articles')
    .select('id, title, category, excerpt, body, image_url, status, published_at, created_at, author_id')
    .order('created_at', { ascending: false });
  if (!isModerator) query = query.eq('author_id', currentUser.id);
  const { data, error } = await query;
  if (error) {
    list.textContent = hasSchemaError(error)
      ? 'Таблица материалов ещё не создана. Выполните supabase-setup.sql.'
      : error.message;
    articleListSummary.textContent = 'Статистика материалов недоступна.';
    return;
  }
  editorArticles = data || [];
  const publishedCount = editorArticles.filter((article) => article.status === 'published').length;
  articleListSummary.textContent = `Всего: ${editorArticles.length} · Опубликовано: ${publishedCount} · Черновики: ${editorArticles.length - publishedCount}`;
  list.replaceChildren();
  if (!editorArticles.length) {
    list.textContent = 'У вас пока нет материалов.';
    return;
  }

  for (const article of editorArticles) {
    const row = document.createElement('div');
    row.className = 'article-row';
    row.dataset.id = article.id;
    row.dataset.title = article.title.toLocaleLowerCase('ru');
    row.dataset.status = article.status;
    const title = document.createElement('span');
    title.textContent = article.title;
    const status = document.createElement('span');
    status.className = 'article-status';
    status.textContent = article.status === 'published' ? 'Опубликовано' : 'Черновик';
    const actions = document.createElement('div');
    actions.className = 'article-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.dataset.action = 'edit-article';
    edit.textContent = 'Редактировать';
    actions.append(edit);
    const toggleStatus = document.createElement('button');
    toggleStatus.type = 'button';
    toggleStatus.dataset.action = 'toggle-status';
    toggleStatus.textContent = article.status === 'published' ? 'Снять с публикации' : 'Опубликовать';
    actions.append(toggleStatus);
    if (article.status === 'published') {
      const open = document.createElement('a');
      open.href = `index.html?article=${encodeURIComponent(article.id)}#news`;
      open.target = '_top';
      open.textContent = 'На сайте';
      actions.append(open);
    }
    row.append(title, status, actions);
    list.append(row);
  }
  filterArticles();
}

function filterArticles() {
  const search = articleSearch.value.trim().toLocaleLowerCase('ru');
  const status = articleStatusFilter.value;
  let visibleCount = 0;
  for (const row of list.querySelectorAll('.article-row')) {
    row.hidden = (search && !row.dataset.title.includes(search))
      || (status !== 'all' && row.dataset.status !== status);
    if (!row.hidden) visibleCount += 1;
  }
  const empty = list.querySelector('.article-filter-empty');
  if (editorArticles.length && !visibleCount) {
    if (!empty) {
      const notice = document.createElement('p');
      notice.className = 'article-filter-empty';
      notice.textContent = 'По заданным условиям материалы не найдены.';
      list.append(notice);
    }
  } else {
    empty?.remove();
  }
}

articleSearch.addEventListener('input', filterArticles);
articleStatusFilter.addEventListener('change', filterArticles);

function resetArticleEditor() {
  editingArticle = null;
  articleForm.reset();
  document.querySelector('#article-composer-title').textContent = 'Новая статья';
  imageInput.value = '';
  clearImagePreview();
  articleCancelEdit.hidden = true;
  updateSubmitLabel();
  report('');
}

function startArticleEdit(article) {
  editingArticle = article;
  document.querySelector('#article-composer-title').textContent = 'Редактирование статьи';
  articleForm.elements.title.value = article.title;
  articleForm.elements.category.value = article.category;
  articleForm.elements.excerpt.value = article.excerpt;
  articleForm.elements.body.value = article.body;
  articleForm.elements.status.value = article.status;
  imageInput.value = '';
  clearImagePreview();
  if (article.image_url) {
    imagePreview.src = article.image_url;
    imagePreview.alt = `Текущая обложка: ${article.title}`;
    imagePreviewWrap.hidden = false;
  }
  articleCancelEdit.hidden = false;
  updateSubmitLabel();
  report(`Редактирование: ${article.title}`);
  activateDashboardPanel('new-article', { scroll: true });
}

articleCancelEdit.addEventListener('click', resetArticleEditor);

articleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  const status = String(values.get('status'));
  const image = imageInput.files?.[0];
  let uploadedImagePath;
  articleSubmit.disabled = true;
  report(editingArticle ? 'Сохраняю изменения…' : 'Сохраняю…');
  let imageUrl = editingArticle?.image_url || null;
  if (image) {
    const extension = image.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'image';
    uploadedImagePath = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('article-images')
      .upload(uploadedImagePath, image, { cacheControl: '3600', contentType: image.type, upsert: false });
    if (uploadError) {
      articleSubmit.disabled = false;
      return report(/row-level security|permission denied/i.test(uploadError.message)
        ? 'Не удалось загрузить фотографию: примените политики Storage из актуального supabase-setup.sql.'
        : `Не удалось загрузить фотографию: ${uploadError.message}`, 'error');
    }
    imageUrl = supabase.storage.from('article-images').getPublicUrl(uploadedImagePath).data.publicUrl;
  }

  const content = {
    title: String(values.get('title')).trim(),
    category: String(values.get('category')),
    excerpt: String(values.get('excerpt')).trim(),
    body: String(values.get('body')).trim(),
    image_url: imageUrl,
    status,
    published_at: status === 'published'
      ? editingArticle?.status === 'published'
        ? editingArticle.published_at || new Date().toISOString()
        : new Date().toISOString()
      : null,
  };
  const result = editingArticle
    ? await supabase.from('lsn_articles').update(content).eq('id', editingArticle.id)
    : await supabase.from('lsn_articles').insert({
      ...content,
      author_id: currentUser.id,
      author_name: currentUser.user_metadata?.full_name?.trim() || currentPublicUserId,
    });
  const { error } = result;
  if (error) {
    if (uploadedImagePath) await supabase.storage.from('article-images').remove([uploadedImagePath]);
    articleSubmit.disabled = false;
    return report(articleErrorMessage(error), 'error');
  }
  const wasEditing = Boolean(editingArticle);
  form.reset();
  editingArticle = null;
  articleCancelEdit.hidden = true;
  imageInput.value = '';
  clearImagePreview();
  updateSubmitLabel();
  articleSubmit.disabled = false;
  report(wasEditing ? 'Изменения сохранены.' : status === 'published' ? 'Материал опубликован.' : 'Черновик сохранён.', 'success');
  await loadArticles();
});

list.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-action="edit-article"]');
  if (editButton) {
    const article = editorArticles.find((item) => item.id === editButton.closest('.article-row').dataset.id);
    if (article) startArticleEdit(article);
    return;
  }
  const button = event.target.closest('[data-action="toggle-status"]');
  if (!button) return;
  const row = button.closest('.article-row');
  const nextStatus = row.querySelector('.article-status').textContent === 'Черновик' ? 'published' : 'draft';
  const { error } = await supabase
    .from('lsn_articles')
    .update({ status: nextStatus, published_at: nextStatus === 'published' ? new Date().toISOString() : null })
    .eq('id', row.dataset.id);
  if (error) return report(articleErrorMessage(error), 'error');
  report(nextStatus === 'published' ? 'Материал опубликован.' : 'Материал снят с публикации.', 'success');
  await loadArticles();
});

document.querySelector('#sign-out').addEventListener('click', async () => {
  await supabase.auth.signOut();
  if (embeddedEditor) {
    window.parent.postMessage({ type: 'lsn-editor-signed-out' }, location.origin);
    return;
  }
  location.replace('auth.html');
});

document.querySelector('#account-menu').addEventListener('click', () => {
  document.querySelector('#account-dialog').showModal();
});

document.querySelector('.account-dialog-close').addEventListener('click', () => {
  document.querySelector('#account-dialog').close();
});

document.querySelector('#editor-back').addEventListener('click', (event) => {
  if (embeddedEditor) {
    event.preventDefault();
    window.parent.postMessage({ type: 'lsn-close-editor' }, location.origin);
    return;
  }
  if (!document.referrer) return;
  try {
    const previousPage = new URL(document.referrer);
    const cameFromAuth = previousPage.pathname.endsWith('/auth.html') || previousPage.pathname.endsWith('/auth');
    if (previousPage.origin === location.origin && !cameFromAuth && history.length > 1) {
      event.preventDefault();
      history.back();
    }
  } catch {}
});

await initialize();
updateSubmitLabel();
if (currentUser) activateDashboardPanel(location.hash.slice(1) || 'new-article');
