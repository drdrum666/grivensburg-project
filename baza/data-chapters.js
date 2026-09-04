// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: ГЛАВЫ, СЦЕНЫ И РАЗВИЛКИ
// ═══════════════════════════════════════════════════════════
// Подключается ДО основного кода. Пути строит от GITHUB_URL (baza/assets.js).
//
// ГЛАВНОЕ ПРАВИЛО: ветвление живёт ЗДЕСЬ, а не в коде. Добавить главу или
// переставить развилку можно, не трогая дашборд. Иначе сюжет размажется по
// трём файлам ровно так же, как когда-то размазались правила боя.
//
// Поля сцены:
//   id        — ключ, по нему идут связи
//   name      — как видит мастер
//   kind      — тип: 'story' рассказ, 'battle' бой, 'shop' торговля,
//               'rest' отдых, 'bank' банк. Определяет значок:
//               боевые — мечи, торговля и банк — монета
//   img       — фон дашборду (статика)
//   stream_file — фон зрителям (может быть видео)
//   configs   — враги по сложности. Есть configs — сцена боевая
//   next[]    — куда можно пойти дальше: { to, label }
//               Несколько вариантов = РАЗВИЛКА, мастер выбирает по решению
//               игроков. Пусто = конец ветки
//   gm_text   — подсказка мастеру: что происходит и на что смотреть
// ═══════════════════════════════════════════════════════════
// БАЛАНС (под партию 4):
//   easy   — справится любой (дети), максимум 1 зелье
//   normal — челлендж: нужны магия, хилки, 1-2 ночёвки
//   hard   — думать над каждым ходом (задроты), ~80%+ побед
//            только при сне перед боем, идеальном свежевании
//            и обмене хилками.
// ═══════════════════════════════════════════════════════════

    window.chaptersDB = {
        'chapter1': {
            name: "Глава 1: Старый Гривенсбург",
            start: 'sc_intro',
            scenarios: [

                // ── ЗАВЯЗКА ────────────────────────────────────────────
                { id: 'sc_intro', name: "Интро", kind: 'story',
                  img: 'assets/chapters/chapter_1/intro.jpg',
                  stream_file: 'assets/chapters/chapter_1/intro.jpg',
                  gm_text: "Похищена принцесса Шкурлета. Король обещает награду, авантюристы стягиваются в столицу — Старый Гривенсбург. Вести как пересказ мультфильма, с обращением к игрокам.",
                  next: [{ to: 'sc_first_town', label: 'Прибытие в портовый город' }] },

                { id: 'sc_first_town', name: "1. Портовый город", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_1_first_town.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_1_first_town.jpg',
                  gm_text: "Панорама города. Только герои собрались идти — на них нападают.",
                  next: [{ to: 'sc_robbery', label: 'На нас напали' }] },

                { id: 'sc_robbery', name: "2. Ограбление", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_2_first_banditos.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_2_first_banditos.jpg',
                  gm_text: "Бандиты отбирают снаряжение и деньги. Осталось 10 монет, спрятанных в трусах. ЭТО ОБЪЯСНЕНИЕ стартовой бедности, боя здесь нет. Те же бандиты всплывут в финале у Графа — снаряжение вернётся.",
                  next: [{ to: 'sc_dragons_eggs', label: 'Идём дальше по городу' }] },

                { id: 'sc_dragons_eggs', name: "3. Драконьи яйца", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_3_dragons_egs.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_3_dragons_egs.jpg',
                  gm_text: "Проходная сцена по дороге к порту.",
                  next: [{ to: 'sc_pirat_k', label: 'К капитану' }] },

                { id: 'sc_pirat_k', name: "4. Капитан Адрестанец", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_4_pirat_K.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_4_pirat_K.jpg',
                  gm_text: "Судно «Адрестия». Билет 30 монет с человека. Отплывёт, только когда наберётся вся партия. Нагнать драмы: вторая глава будет в море и связана с ним.",
                  next: [{ to: 'sc_taverna', label: 'Расстроенные идём в таверну' }] },

                { id: 'sc_taverna', name: "5. Таверна снаружи", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_5_taverna.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_5_taverna.jpg',
                  next: [{ to: 'sc_bar', label: 'Заходим внутрь' }] },

                { id: 'sc_bar', name: "6. Знакомство в баре", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_6_bar.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_6_bar.jpg',
                  gm_text: "ЗДЕСЬ игроки знакомятся: кто они, откуда. Обсуждаем цену билета и решаем идти вместе.",
                  next: [{ to: 'sc_friendship', label: 'Выходим полные авантюризма' }] },

                { id: 'sc_friendship', name: "7. Начало дружбы", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_9_start_friendship.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_9_start_friendship.jpg',
                  next: [{ to: 'sc_desk', label: 'К доске объявлений' }] },

                // ── РАЗВИЛКА 1: доска объявлений ───────────────────────
                { id: 'sc_desk', name: "8. Доска объявлений ⭐РАЗВИЛКА", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_7_desk.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_7_desk.jpg',
                  gm_text: "ТРИ ЗАКАЗА: гигантские крысы (просто), волки в лесу (опасно), пропавшая жена Графа Рафаэля (награда 20 монет). Пройти надо всё — это порядок, а не выбор навсегда. Логично начать с крыс.",
                  next: [
                      { to: 'sc_shaterochka', label: '🐀 Крысы — сначала за снаряжением' },
                      { to: 'sc_graf_rafael', label: '👰 К Графу за пропавшей женой' },
                      { to: 'sc_dark_wood',   label: '🐺 Сразу в лес к волкам' }
                  ] },

                { id: 'sc_shaterochka', name: "9. ШатерОчка 🪙", kind: 'shop',
                  img: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  gm_text: "Кот-торговец в полукостюме-полуплатье. «Лучшее оружие до самого Гривенсбурга!» ЗДЕСЬ покупают снаряжение. Подсказать про факел (бонус в темноте), верёвку (пригодится) и нож для трофеев.",
                  next: [{ to: 'sc_guards', label: 'К стражникам за дорогой' }] },

                // ── ВЕТКА КРЫС ────────────────────────────────────────
                { id: 'sc_guards', name: "10. Стражники", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_10_guards.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_10_guards.jpg',
                  gm_text: "Смеются: «Никто этот заказ не берёт — там грязно и воняет. А вы полезете?»",
                  next: [{ to: 'sc_tunnel', label: 'Лезем в канализацию' }] },

                { id: 'sc_tunnel', name: "11. Тоннель", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_11_tunel.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_11_tunel.jpg',
                  isDark: true,
                  gm_text: "Описать вонь: помои затекают за край обуви, шлёпает на пятке. ПОДСКАЗКА ЗАКАДРОВЫМ ГОЛОСОМ: у кого факел — бонус к атаке в темноте.",
                  next: [{ to: 'sc1_rats', label: 'Слышим писк' }] },

                { id: 'sc1_rats', name: "12. Крысиный патруль", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_sewerage_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/rats_fight.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_12_battle_sewerage_16_9.jpg',
                  isDark: true,
                  gm_text: "Первый бой, лёгкий. Последний пацюк убегает — за ним слышно рычание.",
                  configs: {
                      easy: { xp: 30, enemies: ['fat_rat', 'fat_rat'] },
                      normal: { hpMult: 1.705, xp: 80, enemies: ['fat_rat', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat'] },
                      hard: { hpMult: 1.95, xp: 125, enemies: ['fat_rat', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat'] }
                  },
                  next: [
                      { to: 'sc2_king',   label: '➡ Идём за ним дальше' },
                      { to: 'sc_rest_tavern', label: '🛏 Отступить и выспаться' }
                  ] },

                { id: 'sc2_king', name: "13. Король Нечистот", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_sewerage_boss_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/King_rat.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_13_battle_sewerage_boss_16_9.jpg',
                  isDark: true,
                  gm_text: "Тронный зал из мусора, старый стул вместо трона. ПОСЛЕ БОЯ: в мусоре годные вещи (лут). У кого нож — мини-игра на трофей, хвост пацюка.",
                  configs: {
                      easy: { xp: 45, enemies: ['rat_king'] },
                      normal: { atkMult: 1.15, hpMult: 1.95, xp: 115, enemies: ['rat_king', 'fat_rat', 'fat_rat'] },
                      hard: { hpMult: 1.35, xp: 175, enemies: ['rat_king', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat', 'fat_rat'] }
                  },
                  next: [{ to: 'sc_first_reward', label: 'Выходим наверх' }] },

                { id: 'sc_first_reward', name: "14. Первая награда", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_14_first_reward.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_14_first_reward.jpg',
                  gm_text: "Стражники ржут ещё громче: «Идите помойтесь, иначе с вами никто говорить не станет». Держите 15 монет. НОВАЯ МЕХАНИКА: таверна — сон, мытьё, восстановление сил и маны за 2 золотых.",
                  next: [{ to: 'sc_rest_tavern', label: '🛏 Ночуем в таверне' }] },

                { id: 'sc_rest_tavern', name: "15. Ночёвка 🪙", kind: 'rest',
                  img: 'assets/chapters/chapter_1/scene_6_bar.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_6_bar.jpg',
                  gm_text: "2 золотых с человека. Восстанавливает HP, ману и снимает ступень опьянения. Наступает новый день.",
                  next: [{ to: 'sc_shop_pedlar', label: 'Утром к тележке торговца' }] },

                /* ВТОРАЯ ЛАВКА. До неё магазин в главе был ОДИН — сцена 9,
                   до всех боёв, когда у героев по 10 монет в трусах. Хватало
                   ровно на оружие, а остальные шестьдесят монет за главу
                   тратить было негде: следующая возможность купить что-либо
                   не наступала до самого корабля.
                   Здесь на руках уже около 26: пора одеваться. */
                { id: 'sc_shop_pedlar', name: "15б. Кот с тележкой 🪙", kind: 'shop',
                  img: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  gm_text: "Тот самый кот-торговец приехал в город с тележкой. ЗДЕСЬ ВТОРАЯ ЗАКУПКА: после Короля Нечистот на руках уже около 26 монет. Самое время на одежду — шлем, пояс, перчатки. Напомнить, что в лесу темно и зелья лишними не будут.",
                  next: [{ to: 'sc_desk', label: '↩ Снова к доске объявлений' }] },

                // ── ВЕТКА ГРАФА ───────────────────────────────────────
                { id: 'sc_graf_rafael', name: "16. Граф Рафаэль", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_15_graf_rafael.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_15_graf_rafael.jpg',
                  gm_text: "Пожилой, полулысый, бородавки, неприятный. За спиной ухоженная осёдланная бурёнка. Дом в упадке. Говорит: жена ушла в лес в красном платье и шапочке и не вернулась. Награда за квест — 20 монет, ОЗВУЧИТЬ СРАЗУ.",
                  next: [{ to: 'sc_dark_wood', label: 'Идём в лес искать' }] },

                { id: 'sc_dark_wood', name: "17. Тёмный лес", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_16_dark_wood.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_16_dark_wood.jpg',
                  isDark: true,
                  gm_text: "Плутали до вечера. У старого охотничьего домика стая волков грызёт что-то в красном.",
                  next: [{ to: 'sc3_wolves', label: 'Нападаем' }] },

                { id: 'sc3_wolves', name: "18. Павшие в лесу", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_dark_forrest_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/forest_fight.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_17_battle_dark_forrest_16_9.jpg',
                  isDark: true,
                  gm_text: "КОММЕНТАРИИ В БОЙ: смеркается, волки сливаются с лесом — хорошо тому, кто взял факел. КОГДА ОСТАЁТСЯ ОДИН волк, он воет и зовёт подмогу во главе с лютоволком.",
                  configs: {
                      easy: { xp: 45, enemies: ['wild_wolf', 'wild_wolf', 'wild_wolf'] },
                      normal: { atkMult: 1.5, hpMult: 1.8, xp: 115, enemies: ['wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf'] },
                      hard: { atkMult: 1.75, hpMult: 1.25, xp: 175, enemies: ['wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf'] }
                  },
                  next: [{ to: 'sc4_alpha', label: 'На вой прибегает лютоволк' }] },

                { id: 'sc4_alpha', name: "19. Альфа-Хищник", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_dark_forrest_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/forest_fight.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_18_battle_dark_forrest_16_9.jpg',
                  isDark: true,
                  gm_text: "Огромный серый волк с седой гривой и синим светом из глаз. ВО РТУ ЧТО-ТО ЦВЕТНОЕ — это мячик Спука. Самый сложный бой главы. ПОСЛЕ: трофей ухо волка, а внутри туши — вещи съеденных воинов, кольца и амулеты.",
                  configs: {
                      easy: { xp: 55, enemies: ['direwolf', 'wild_wolf'] },
                      normal: { atkMult: 1.4, xp: 145, enemies: ['direwolf', 'wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf'] },
                      hard: { atkMult: 1.5, hpMult: 1.15, xp: 225, enemies: ['direwolf', 'wild_wolf', 'wild_wolf', 'wild_wolf', 'wild_wolf'] }
                  },
                  next: [{ to: 'sc_second_reward', label: 'Осматриваем труп в красном' }] },

                { id: 'sc_second_reward', name: "20. Вторая награда", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_19_second_reward.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_19_second_reward.jpg',
                  gm_text: "Труп оказался СКЕЛЕТОМ лет пятидесяти: натянуто красное платье, в кости напихано мясо в тряпках. Умные поймут — их послали в ловушку. Дать игрокам подумать.",
                  next: [
                      { to: 'sc_relic_ball', label: '🎾 Нашли яркий мячик' },
                      { to: 'sc_back_to_graf', label: '↩ Утром идём к Графу' }
                  ] },

                // ── ЛИНИЯ СПУКА ───────────────────────────────────────
                { id: 'sc_relic_ball', name: "21. Мячик 🎾", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_22_frist_relic.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_22_frist_relic.jpg',
                  gm_text: "Реликвия. Тёмная фигура в капюшоне стоит на КАЖДОЙ городской картинке в тени — если игроки заметят и подойдут, начнётся линия Спука.",
                  next: [{ to: 'sc_who_are_you', label: 'Подходим к фигуре в капюшоне' }] },

                { id: 'sc_who_are_you', name: "22. Кто вы, мистер?", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_20_whoyou_are_mister_spook.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_20_whoyou_are_mister_spook.jpg',
                  gm_text: "«Это неважно. Я ходил по лесу и потерял очень важную вещь». Если мячик уже найден — отдают сразу; если нет, он сам спросит потом.",
                  next: [{ to: 'sc_mister_spook', label: 'Отдаём мячик' }] },

                { id: 'sc_mister_spook', name: "23. Мистер Спук 🤝", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_21_mister_spook.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_21_mister_spook.jpg',
                  gm_text: "Снимает капюшон — зверолюд корги. Мячик от любимого хозяина, которого он пережил: зверолюди живут дольше людей. Заигрался в лесу, услышал волков и убежал. ОТКРЫВАЕТ НАЁМНИКА: реликвия зовёт Спука в бой раз в 7 дней.",
                  next: [{ to: 'sc_back_to_graf', label: '↩ К Графу' }] },

                // ── ДВОР ГРАФА: РАЗВИЛКА 2 ────────────────────────────
                { id: 'sc_back_to_graf', name: "24. Снова к Графу", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_23_back_to_graf.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_23_back_to_graf.jpg',
                  gm_text: "Растерянный Граф делает вид, что не понимает, о чём речь, и выпихивает на улицу.",
                  next: [{ to: 'sc_shop_graf', label: 'У ворот стоит знакомая тележка' }] },

                /* ТРЕТЬЯ ЛАВКА — последняя перед финальным боем. На руках уже
                   около 57 монет: пора доодеться и взять заклинание.
                   ЗДЕСЬ РАЗВИЛКА КОШЕЛЬКА: маг и жрец берут магию за 25 и
                   остаются полуодетыми, остальные добирают броню. Так и
                   задумано — на билет 30 монет хватит всем, но у мага с
                   жрецом не останется на грудь и ноги. */
                { id: 'sc_shop_graf', name: "24б. Тележка у ворот 🪙", kind: 'shop',
                  img: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_8_shaterochka.jpg',
                  gm_text: "Кот-торговец успел раньше вас и торгует прямо у ворот поместья. ПОСЛЕДНЯЯ ЗАКУПКА ПЕРЕД ФИНАЛОМ: на руках около 57 монет. Магу и жрецу пора брать заклинание за 25 — тогда на броню им уже не хватит, и это нормально. Предупредить, что билет на корабль стоит 30 с человека: спускать всё до монеты не стоит.",
                  next: [{ to: 'sc_backyard', label: 'Выходим во двор' }] },

                { id: 'sc_backyard', name: "25. Двор ⭐РАЗВИЛКА", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_24_backyard.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_24_backyard.jpg',
                  gm_text: "Во дворе пахнет падалью. ЖДАТЬ, предложат ли игроки осмотреться сами. ТРИ МЕСТА: теплица, амбар, колодец. ⚠ ТОЛЬКО ДВЕ ПОПЫТКИ В ДЕНЬ — на третью мастер отправляет спать. Правильный ответ — колодец.",
                  next: [
                      { to: 'sc_veranda', label: '🌱 Теплица (пусто)' },
                      { to: 'sc_barn',    label: '🏚 Амбар (пусто)' },
                      { to: 'sc_well',    label: '🕳 Колодец (ВЕРНО)' }
                  ] },

                { id: 'sc_veranda', name: "26. Теплица", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_25_veranda.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_25_veranda.jpg',
                  gm_text: "Полдня впустую: Граф залил отраву, передохли кроты и всё живое. Сам пытался в садоводы.",
                  next: [{ to: 'sc_backyard', label: '↩ Обратно во двор' }] },

                { id: 'sc_barn', name: "27. Амбар", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_26_barn.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_26_barn.jpg',
                  gm_text: "Полдня впустую: забрела старая собака и умерла. Вот и вся падаль.",
                  next: [{ to: 'sc_backyard', label: '↩ Обратно во двор' }] },

                { id: 'sc_well', name: "28. Колодец", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_27_well.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_27_well.jpg',
                  gm_text: "Кто-то должен спуститься. ЕСТЬ ВЕРЁВКА — спускается легко (можно сбегать купить, ещё не поздно). НЕТ — прыгает и кидает кубик: 10+ норм, меньше — подворачивает ногу, −3 HP на следующий бой. Внизу труп молодой девушки и ровно 5 монет — верёвка окупилась.",
                  next: [{ to: 'sc_surprise', label: 'Поднимаем тело' }] },

                // ── ФИНАЛ: РАЗВИЛКА 3 ─────────────────────────────────
                { id: 'sc_surprise', name: "29. Сюрприз ⭐РАЗВИЛКА", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_28_surprise.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_28_surprise.jpg',
                  gm_text: "Возвращаемся к Графу с находкой. «Ребята, давайте договоримся — по 25 монет каждому». Награда за квест была 20. ГЛАВНЫЙ ВЫБОР ГЛАВЫ.",
                  next: [
                      { to: 'sc_bribe',   label: '💰 Берём взятку и молчим' },
                      { to: 'sc_threats', label: '⚔ Сдаём Графа страже' }
                  ] },

                { id: 'sc_bribe', name: "30. Взятка", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_33_bribe.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_33_bribe.jpg',
                  gm_text: "Взяли по 25 и сказали страже, что её сгрызли волки. За информацию ещё по 5. Квест вышел в ноль. Боя с бандитами НЕ БУДЕТ — и снаряжение, отобранное в начале, не вернётся.",
                  next: [{ to: 'sc_pirat_final', label: 'К капитану' }] },

                { id: 'sc_threats', name: "31. Угрозы", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_29_threats.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_29_threats.jpg',
                  gm_text: "Граф орёт — из соседней комнаты выходят бандиты во главе с отбитым здоровяком с дубиной. ЭТО ТЕ САМЫЕ, что ограбили партию в начале. Пламенная речь о том, как герои облажались с выбором.",
                  next: [{ to: 'sc5_bandits', label: 'Начинается бой' }] },

                { id: 'sc5_bandits', name: "32. Разборка у Графа", kind: 'battle',
                  img: 'assets/chapters/chapter_1/battle_graff_dh.jpg',
                  stream_file: 'assets/streamer/chapter_1/fights/Graf_fight.mp4',
                  stream_still: 'assets/chapters/chapter_1/scene_30_banditos_fight.jpg',
                  gm_text: "ГЛАВАРЬ КРИЧИТ на 5-м раунде: своим +3 к атаке и защите на 3 хода. ПОСЛЕ БОЯ: лут щедрый — деньги каждому и ВЕРНУВШЕЕСЯ снаряжение, отобранное в начале главы.",
                  configs: {
                      easy: { xp: 75, enemies: ['bandit_leader', 'bandit'] },
                      normal: { atkMult: 1.5, hpMult: 1.15, xp: 195, enemies: ['bandit_leader', 'bandit', 'bandit_archer', 'bandit_archer', 'bandit_archer', 'bandit_archer'] },
                      hard: { atkMult: 1.75, hpMult: 1.2, xp: 300, enemies: ['bandit_leader', 'bandit', 'bandit', 'bandit_archer', 'bandit_archer', 'bandit'] }
                  },
                  next: [{ to: 'sc_mercy', label: 'Тащим Графа страже' }] },

                { id: 'sc_mercy', name: "33. Пощада", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_31_mercy.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_31_mercy.jpg',
                  next: [{ to: 'sc_arrest', label: 'Сдаём стражникам' }] },

                { id: 'sc_arrest', name: "34. Арест", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_32_arest.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_32_arest.jpg',
                  gm_text: "Убитый главарь оказался в розыске по всей стране — по 10 монет каждому за его голову. Игроки откладывают на билет и докупают снаряжение.",
                  next: [{ to: 'sc_pirat_final', label: 'Утром к капитану' }] },

                { id: 'sc_pirat_final', name: "35. Капитан снова", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_34_pirat_K.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_34_pirat_K.jpg',
                  gm_text: "Трубка, чёрный попугай с красными глазами, тёмная аура. Видит, что герои чистые и похожи на людей. Билет 30 монет. НАГНАТЬ ЗАГАДОЧНОСТИ: вторая глава будет в море и связана с ним.",
                  next: [{ to: 'sc_all_aboard', label: 'Поднимаемся на борт' }] },

                { id: 'sc_all_aboard', name: "36. Все на борт", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_35_all_aboard_the_ship.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_35_all_aboard_the_ship.jpg',
                  next: [{ to: 'sc_sailing', label: 'Отплытие' }] },

                { id: 'sc_sailing', name: "37. Отплытие — КОНЕЦ ГЛАВЫ", kind: 'story',
                  img: 'assets/chapters/chapter_1/scene_36_sailing.jpg',
                  stream_file: 'assets/chapters/chapter_1/scene_36_sailing.jpg',
                  gm_text: "Конец первой главы. ЗДЕСЬ бросить намёк на большой сюжет — что-то, что аукнется во второй главе.",
                  next: [] }
            ]
        }
    };
