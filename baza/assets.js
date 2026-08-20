/* ═══════════════════════════════════════════════════════════
   ОТКУДА БЕРУТСЯ КАРТИНКИ: сеть или локальная папка
   ═══════════════════════════════════════════════════════════
   Подключать ПЕРВЫМ, до всех data-*.js: они склеивают полные пути прямо
   при загрузке (GITHUB_URL + "assets/..."), поэтому база должна быть
   известна раньше них. Переключение на лету поэтому и невозможно —
   только с перезагрузкой страницы.

   Раньше база была объявлена в ТРЁХ местах: своей строкой в app.js, своей
   в streamer-app.js и в оболочке дашборда. Разъехались бы при первой же
   смене адреса. Теперь одна.

   Настройка ПОУСТРОЙСТВЕННАЯ, а не общая на комнату. Иначе, переключив
   дашборд на локальную папку, ГМ сломал бы картинки на телефонах игроков:
   папки с ассетами у них нет и быть не может.
   ═══════════════════════════════════════════════════════════ */

(function (w) {
    var ONLINE = 'https://drdrum666.github.io/grivensburg-project/';
    var OFFLINE = '';            /* пусто = рядом с html: site/assets/... */
    var KEY = 'grivensburg_assets';

    function read() {
        try {
            var v = w.localStorage && w.localStorage.getItem(KEY);
            return v === 'offline' ? 'offline' : 'online';
        } catch (e) { return 'online'; }   /* localStorage закрыт — работаем из сети */
    }

    /* Адрес можно задать и ссылкой: ?assets=offline. Нужно стримеру и
       клиенту, у которых своей кнопки нет. Выбор запоминается. */
    try {
        var q = new URLSearchParams(w.location && w.location.search || '');
        var forced = q.get('assets');
        if (forced === 'offline' || forced === 'online') {
            w.localStorage.setItem(KEY, forced);
        }
    } catch (e) { /* не вышло — не страшно */ }

    var mode = read();

    w.ASSET_MODE = mode;
    w.GITHUB_URL = (mode === 'offline') ? OFFLINE : ONLINE;

    /* Переключить и перезагрузить. Зовёт кнопка в дашборде. */
    w.setAssetMode = function (next) {
        try { w.localStorage.setItem(KEY, next === 'offline' ? 'offline' : 'online'); }
        catch (e) { return false; }
        if (w.location && w.location.reload) w.location.reload();
        return true;
    };
    w.toggleAssetMode = function () {
        return w.setAssetMode(read() === 'offline' ? 'online' : 'offline');
    };

    /* Достроить путь. Готовые ссылки не трогаем. */
    w.assetUrl = function (path) {
        if (!path) return '';
        return String(path).indexOf('http') === 0 ? path : w.GITHUB_URL + path;
    };

    /* В разметке остались прямые ссылки: иконки кубиков, фон шапки, сундук
       лута. Часть из них сидит внутри <style>, поэтому в js их не подменить
       по одной. Разово переписываем при загрузке — один проход, не в слое
       отрисовки. Онлайн-режим ничего не трогает.

       Оба адреса ниже — исторические: часть картинок бралась с github.io,
       часть с raw.githubusercontent. Оставлены оба, чтобы старая разметка
       переключалась целиком. */
    if (mode === 'offline' && typeof document !== 'undefined') {
        var PREFIXES = [
            'https://drdrum666.github.io/grivensburg-project/',
            'https://raw.githubusercontent.com/drdrum666/grivensburg-project/main/'
        ];
        var strip = function (text) {
            for (var i = 0; i < PREFIXES.length; i++) {
                text = text.split(PREFIXES[i]).join(OFFLINE);
            }
            return text;
        };
        var sweep = function () {
            var i, n;
            var styles = document.getElementsByTagName('style');
            for (i = 0; i < styles.length; i++) styles[i].textContent = strip(styles[i].textContent);
            var imgs = document.getElementsByTagName('img');
            for (i = 0; i < imgs.length; i++) {
                var src = imgs[i].getAttribute('src');
                if (src) imgs[i].setAttribute('src', strip(src));
            }
            var all = document.querySelectorAll('[style*="drdrum666"]');
            for (i = 0, n = all.length; i < n; i++) {
                all[i].setAttribute('style', strip(all[i].getAttribute('style')));
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', sweep);
        } else sweep();
    }
})(typeof window !== 'undefined' ? window : globalThis);
