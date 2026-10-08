// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: ЗВУКИ СОБЫТИЙ (эффекты боя, лавки, интерфейса)
// ═══════════════════════════════════════════════════════════
// Подключается ПОСЛЕ baza/assets.js.
//
// У КАЖДОГО СОБЫТИЯ — СВОЙ ПОСТОЯННЫЙ ФАЙЛ: sounds/sfx/<ключ>.mp3
// (например sounds/sfx/sword_hit.mp3). Код зовёт звук по ключу события,
// а не по имени файла.
//
// ЗАМЕНИТЬ ЗВУК СВОИМ: положите файл с тем же именем в sounds/sfx/ — на
// гитхаб или в папку игры. Код трогать не нужно. Другое имя или формат
// (.ogg, .wav) — поменяйте file у события. volume — громкость от 0 до 1.
//
// ФАЙЛА НЕТ — событие молчит, игра не ломается.
//
// Стоковые звуки выбираются в лаборатории: sound-lab.html (корень игры). Там же
// слышно, что сейчас лежит в sounds/sfx/ под каждым именем.
// ═══════════════════════════════════════════════════════════
(function (w) {
    w.sfxDB = {
        base: 'sounds/sfx/',
        events: {
        /* ── Оружие ── */
        sword_swing:    { group: "Оружие", name: "Меч: замах",
                         where: "перед ударом мечом (и любым клинком)", file: 'sword_swing.mp3', volume: 1 },
        sword_hit:      { group: "Оружие", name: "Меч: попадание",
                         where: "меч попал по врагу", file: 'sword_hit.mp3', volume: 1 },
        axe_hit:        { group: "Оружие", name: "Топор: попадание",
                         where: "топор и двуручный топор попали", file: 'axe_hit.mp3', volume: 1 },
        dagger_hit:     { group: "Оружие", name: "Кинжал: удар",
                         where: "кинжал (и левый кинжал) попал", file: 'dagger_hit.mp3', volume: 1 },
        staff_hit:      { group: "Оружие", name: "Посох / палочка: удар вблизи",
                         where: "маг или жрец бьёт посохом/палочкой", file: 'staff_hit.mp3', volume: 1 },
        lute_hit:       { group: "Оружие", name: "Лютня: удар (бард)",
                         where: "бард бьёт лютней", file: 'lute_hit.mp3', volume: 1 },
        punch:          { group: "Оружие", name: "Без оружия: кулак",
                         where: "удар без оружия", file: 'punch.mp3', volume: 1 },
        bow_shot:       { group: "Оружие", name: "Лук: выстрел",
                         where: "лучник стреляет", file: 'bow_shot.mp3', volume: 1 },
        arrow_hit:      { group: "Оружие", name: "Стрела: попадание",
                         where: "стрела вонзилась", file: 'arrow_hit.mp3', volume: 1 },
        double_shot:    { group: "Оружие", name: "Двойной выстрел (лучник)",
                         where: "две стрелы подряд", file: 'double_shot.mp3', volume: 1 },
        power_strike:   { group: "Оружие", name: "Удар с размаха (воин)",
                         where: "мощный удар воина", file: 'power_strike.mp3', volume: 1 },
        sweep:          { group: "Оружие", name: "Вихрь (удар по нескольким)",
                         where: "удар по нескольким врагам", file: 'sweep.mp3', volume: 1 },
        crit:           { group: "Оружие", name: "Критический удар",
                         where: "крит героя", file: 'crit.mp3', volume: 1 },

        /* ── Защита ── */
        shield_block:   { group: "Защита", name: "Удар по щиту (блок)",
                         where: "враг попал в поднятый щит / блок", file: 'shield_block.mp3', volume: 1 },
        parry:          { group: "Защита", name: "Парирование (клинок о клинок)",
                         where: "защита — парирование", file: 'parry.mp3', volume: 1 },
        miss:           { group: "Защита", name: "Промах (свист мимо)",
                         where: "удар мимо — у героя и у врага", file: 'miss.mp3', volume: 1 },
        ricochet:       { group: "Защита", name: "Рикошет",
                         where: "стрела/удар отскочил", file: 'ricochet.mp3', volume: 1 },
        shield_raise:   { group: "Защита", name: "Поднять щит (Глухая оборона)",
                         where: "воин закрылся щитом", file: 'shield_raise.mp3', volume: 1 },
        hero_hurt:      { group: "Защита", name: "Героя ранили (вскрик)",
                         where: "герой получил урон", file: 'hero_hurt.mp3', volume: 1 },
        hero_down:      { group: "Защита", name: "Герой пал",
                         where: "здоровье героя упало до нуля", file: 'hero_down.mp3', volume: 1 },
        second_wind:    { group: "Защита", name: "Второе дыхание (воин встаёт)",
                         where: "воин поднялся на ярости", file: 'second_wind.mp3', volume: 1 },

        /* ── Магия ── */
        magic_cast:     { group: "Магия", name: "Магия: вылет из посоха / палочки",
                         where: "маг выпускает заклинание", file: 'magic_cast.mp3', volume: 1 },
        fireball_fly:   { group: "Магия", name: "Огненная стрела: полёт",
                         where: "огненная стрела летит", file: 'fireball_fly.mp3', volume: 1 },
        fireball_boom:  { group: "Магия", name: "Огненная стрела: попадание",
                         where: "огненная стрела попала", file: 'fireball_boom.mp3', volume: 1 },
        ice_cast:       { group: "Магия", name: "Ледяная стрела: выстрел",
                         where: "ледяной шип летит", file: 'ice_cast.mp3', volume: 1 },
        ice_hit:        { group: "Магия", name: "Лёд: попадание",
                         where: "ледяной шип попал", file: 'ice_hit.mp3', volume: 1 },
        frozen:         { group: "Магия", name: "Скован холодом (пропуск хода)",
                         where: "враг заморожен и пропускает ход", file: 'frozen.mp3', volume: 1 },
        heal:           { group: "Магия", name: "Лечение (Прикосновение Лекаря)",
                         where: "жрец лечит", file: 'heal.mp3', volume: 1 },
        revive:         { group: "Магия", name: "Воскрешение",
                         where: "павший поднят", file: 'revive.mp3', volume: 1 },
        prayer:         { group: "Магия", name: "Молитва (благословение)",
                         where: "жрец помолился", file: 'prayer.mp3', volume: 1 },
        book_open:      { group: "Магия", name: "Книга открыта (молитвенник, книга песен, тома)",
                         where: "открыл книгу навыков", file: 'book_open.mp3', volume: 1 },
        aggro:          { group: "Магия", name: "Свиток «Агр» (боевой клич)",
                         where: "воин отвлекает всех на себя", file: 'aggro.mp3', volume: 1 },
        stealth:        { group: "Магия", name: "Разбойник уходит в тень",
                         where: "скрытность разбойника", file: 'stealth.mp3', volume: 1 },
        meditation:     { group: "Магия", name: "Медитация мага",
                         where: "маг медитирует, пропуская ход", file: 'meditation.mp3', volume: 1 },

        /* ── Враги ── */
        wolf_howl:      { group: "Враги", name: "Вой волка (альфа воет)",
                         where: "вой альфы и предупреждение", file: 'wolf_howl.mp3', volume: 1 },
        wolf_bite:      { group: "Враги", name: "Укус волка / собаки",
                         where: "волк атакует", file: 'wolf_bite.mp3', volume: 1 },
        beast_growl:    { group: "Враги", name: "Рык зверя (перед атакой)",
                         where: "зверь рычит", file: 'beast_growl.mp3', volume: 1 },
        rat_squeak:     { group: "Враги", name: "Писк крысы",
                         where: "крыса атакует / пищит", file: 'rat_squeak.mp3', volume: 1 },
        rat_bite:       { group: "Враги", name: "Укус крысы",
                         where: "крыса попала", file: 'rat_bite.mp3', volume: 1 },
        rat_king:       { group: "Враги", name: "Король пацюков (аура, рык)",
                         where: "Царский Пацюк", file: 'rat_king.mp3', volume: 1 },
        bandit_roar:    { group: "Враги", name: "Клич главаря (Ярость бандитов)",
                         where: "главарь бандитов кричит", file: 'bandit_roar.mp3', volume: 1 },
        bandit_attack:  { group: "Враги", name: "Бандит бьёт (выкрик)",
                         where: "бандит атакует", file: 'bandit_attack.mp3', volume: 1 },
        enemy_hurt:     { group: "Враги", name: "Враг ранен",
                         where: "враг получил урон", file: 'enemy_hurt.mp3', volume: 1 },
        enemy_death:    { group: "Враги", name: "Враг погиб",
                         where: "враг убит", file: 'enemy_death.mp3', volume: 1 },
        enemy_flee:     { group: "Враги", name: "Враг сбежал",
                         where: "последний волк удирает", file: 'enemy_flee.mp3', volume: 1 },

        /* ── Заведения ── */
        buy:            { group: "Заведения", name: "Покупка в лавке",
                         where: "купил вещь", file: 'buy.mp3', volume: 1 },
        sell:           { group: "Заведения", name: "Продажа",
                         where: "продал вещь", file: 'sell.mp3', volume: 1 },
        buy_drink:      { group: "Заведения", name: "Покупка выпивки (таверна)",
                         where: "заказал выпивку", file: 'buy_drink.mp3', volume: 1 },
        drink_booze:    { group: "Заведения", name: "Выпил алкоголь",
                         where: "глотнул из бутылки", file: 'drink_booze.mp3', volume: 1 },
        drink_potion:   { group: "Заведения", name: "Выпил зелье",
                         where: "зелье жизни/маны", file: 'drink_potion.mp3', volume: 1 },
        rent_room:      { group: "Заведения", name: "Снять комнату (ночёвка)",
                         where: "комната в таверне", file: 'rent_room.mp3', volume: 1 },
        provision:      { group: "Заведения", name: "Припасы в дорогу",
                         where: "купил припасы", file: 'provision.mp3', volume: 1 },
        bank_put:       { group: "Заведения", name: "Банк: положить",
                         where: "положил в банк / общак", file: 'bank_put.mp3', volume: 1 },
        bank_take:      { group: "Заведения", name: "Банк: снять",
                         where: "снял из банка / общака", file: 'bank_take.mp3', volume: 1 },
        church_donate:  { group: "Заведения", name: "Пожертвование в храм",
                         where: "положил в урну храма", file: 'church_donate.mp3', volume: 1 },
        equip:          { group: "Заведения", name: "Надеть / сменить вещь",
                         where: "переодевание, смена оружия", file: 'equip.mp3', volume: 1 },
        give_item:      { group: "Заведения", name: "Передать вещь другу",
                         where: "передача вещи", file: 'give_item.mp3', volume: 1 },
        loot_drop:      { group: "Заведения", name: "Добыча выпала",
                         where: "после победы", file: 'loot_drop.mp3', volume: 1 },
        skinning:       { group: "Заведения", name: "Свежевание (нож)",
                         where: "разделка туши", file: 'skinning.mp3', volume: 1 },
        relic_spook:    { group: "Заведения", name: "Реликвия «Мистер Спук»",
                         where: "призыв Спука", file: 'relic_spook.mp3', volume: 1 },

        /* ── Бой ── */
        battle_start:   { group: "Бой", name: "Начало боя",
                         where: "бой начался", file: 'battle_start.mp3', volume: 1 },
        round_start:    { group: "Бой", name: "Новый раунд",
                         where: "начался новый раунд", file: 'round_start.mp3', volume: 1 },
        your_turn:      { group: "Бой", name: "Ваш ход (телефон)",
                         where: "на телефоне: ваш ход", file: 'your_turn.mp3', volume: 1 },
        dice_roll:      { group: "Бой", name: "Кубики: бросок",
                         where: "кубики вылетели", file: 'dice_roll.mp3', volume: 1 },
        dice_land:      { group: "Бой", name: "Кубики: легли на число",
                         where: "кубики остановились", file: 'dice_land.mp3', volume: 1 },
        result_card:    { group: "Бой", name: "Карточка итога на стриме",
                         where: "карточка удара появилась", file: 'result_card.mp3', volume: 1 },
        intercept:      { group: "Бой", name: "Перехват (бросился наперерез)",
                         where: "кто-то бросился наперерез", file: 'intercept.mp3', volume: 1 },
        breakaway:      { group: "Бой", name: "Вырвался / удар вслед",
                         where: "разрыв ближнего боя", file: 'breakaway.mp3', volume: 1 },
        level_up:       { group: "Бой", name: "Новый уровень",
                         where: "герой вырос в уровне", file: 'level_up.mp3', volume: 1 },
        victory:        { group: "Бой", name: "Победа",
                         where: "враги повержены", file: 'victory.mp3', volume: 1 },
        defeat:         { group: "Бой", name: "Поражение (все пали)",
                         where: "партия проиграла", file: 'defeat.mp3', volume: 1 },
        xp_gain:        { group: "Бой", name: "Опыт получен",
                         where: "кнопка «Забрать XP»", file: 'xp_gain.mp3', volume: 1 },
        error:          { group: "Бой", name: "Нельзя (отказ)",
                         where: "действие недоступно", file: 'error.mp3', volume: 1 },
        click:          { group: "Бой", name: "Нажатие кнопки",
                         where: "клик по кнопке меню", file: 'click.mp3', volume: 1 }
        }
    };
    /* Полный адрес звука события: сеть или папка игры — как у картинок
       (baza/assets.js). Нет события или файла — пустая строка. */
    w.sfxUrl = function (key) {
        var e = w.sfxDB.events[key];
        if (!e || !e.file) return '';
        var p = w.sfxDB.base + e.file;
        return typeof w.assetUrl === 'function' ? w.assetUrl(p) : p;
    };
})(window);
