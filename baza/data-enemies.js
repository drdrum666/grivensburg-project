// ═══════════════════════════════════════════════════════════
// БАЗА ДАННЫХ: ВРАГИ
// ═══════════════════════════════════════════════════════════
// Подключается дашбордом через <script> ДО основного кода.
// Использует глобальный GITHUB_URL (объявлен в дашборде).
// Каждый враг: id: { name, hp, maxHP, atk, init, human, img, icon }
// ═══════════════════════════════════════════════════════════
// БАЛАНС (пересчёт под партию 4): HP и атаки боссов снижены,
// чтобы Глава 1 была проходимой. Сложность регулируется
// составом врагов в data-chapters.js (easy/normal/hard).
//   Крыса        12->11
//   Король крыс   38->34, atk 5->4
//   Волк          18->16
//   Лютоволк      50->42, atk 6->5
//   Бандит        28->22
//   Лучник        20->17, atk 5->4
//   Главарь       76->55, atk 7->5
// ═══════════════════════════════════════════════════════════

    window.enemiesDB = {
        fat_rat: { name: "Нажористый Пацюк", hp: 11, maxHP: 11, atk: 3, init: 0, human: false, img: GITHUB_URL + "assets/enemy/fat_rat.png", icon: GITHUB_URL + "assets/icons/fat_rat_icon.png" },
        rat_king: { name: "Царский Пацюк", hp: 34, maxHP: 34, atk: 4, init: 1, human: false, isUnique: true, img: GITHUB_URL + "assets/enemy/rat_king.png", icon: GITHUB_URL + "assets/icons/rat_king_icon.png" },
        wild_wolf: { name: "Дикий Волк", hp: 16, maxHP: 16, atk: 4, init: 3, human: false, img: GITHUB_URL + "assets/enemy/wolf.png", icon: GITHUB_URL + "assets/icons/wolf_icon.png" },
        direwolf: { name: "Лютоволк", hp: 42, maxHP: 42, atk: 5, init: 4, human: false, isUnique: true, img: GITHUB_URL + "assets/enemy/alfa_wolf.png", icon: GITHUB_URL + "assets/icons/alfawolf_icon.png" },
        bandit: { name: "Бандит", hp: 22, maxHP: 22, atk: 4, init: 1, human: true, img: GITHUB_URL + "assets/enemy/bandit.png", icon: GITHUB_URL + "assets/icons/bandit_icon.png" },
        bandit_archer: { name: "Лучник Бандитов", hp: 17, maxHP: 17, atk: 4, init: 2, human: true, isRanged: true, img: GITHUB_URL + "assets/enemy/bandit_archer.png", icon: GITHUB_URL + "assets/icons/archer_bandit_icon.png" },
        bandit_leader: { name: "Главарь", hp: 55, maxHP: 55, atk: 5, init: 3, human: true, isUnique: true, img: GITHUB_URL + "assets/enemy/bandit_boss.jpg", icon: GITHUB_URL + "assets/icons/bossbandit_icon.png" }
    };
