import { supabase } from './supabase-client.js';

const id = new URLSearchParams(location.search).get('id');
const title = document.querySelector('#article-title');
const message = document.querySelector('#article-message');

if (!id) {
  title.textContent = 'Материал не найден';
  message.textContent = 'В адресе страницы нет идентификатора материала.';
} else {
  const { data, error } = await supabase
    .from('lsn_articles')
    .select('title, category, excerpt, body, image_url, author_name, published_at, created_at')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle();

  if (error || !data) {
    title.textContent = 'Материал не найден';
    message.textContent = error?.message || 'Статья снята с публикации или адрес неверен.';
  } else {
    document.title = `${data.title} — Los Santos News`;
    document.querySelector('#article-category').textContent = data.category;
    title.textContent = data.title;
    const publishedDate = data.published_at || data.created_at;
    document.querySelector('#article-author').textContent = `Автор: ${data.author_name || 'Редакция Los Santos News'}`;
    if (publishedDate) {
      const dateElement = document.querySelector('#article-date');
      dateElement.dateTime = publishedDate;
      dateElement.textContent = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(publishedDate));
    }
    const cover = document.querySelector('#article-cover');
    if (data.image_url) {
      cover.src = data.image_url;
      cover.alt = `Обложка: ${data.title}`;
      cover.hidden = false;
    }
    document.querySelector('#article-excerpt').textContent = data.excerpt;
    document.querySelector('#article-body').textContent = data.body;
  }
}

document.querySelector('#article-back').addEventListener('click', (event) => {
  if (!document.referrer) return;
  try {
    if (new URL(document.referrer).origin === location.origin && history.length > 1) {
      event.preventDefault();
      history.back();
    }
  } catch {}
});
