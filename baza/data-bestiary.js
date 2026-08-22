// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: БЕСТИАРИЙ (группировка врагов по главам)
// ═══════════════════════════════════════════════════════════
// Подключается дашбордом через <script> ДО основного кода.
// Использует глобальный GITHUB_URL (объявлен в дашборде).
// Ссылается на window.enemiesDB — подключать ПОСЛЕ data-enemies.js
// ═══════════════════════════════════════════════════════════

    window.bestiaryDB = {
        'chapter1': {
            name: "Глава 1: Начало",
            enemies: { 'fat_rat': window.enemiesDB.fat_rat, 'rat_king': window.enemiesDB.rat_king, 'wild_wolf': window.enemiesDB.wild_wolf, 'direwolf': window.enemiesDB.direwolf, 'bandit': window.enemiesDB.bandit, 'bandit_archer': window.enemiesDB.bandit_archer, 'bandit_leader': window.enemiesDB.bandit_leader }
        }
    };
