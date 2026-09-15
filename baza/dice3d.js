// ═══════════════════════════════════════════════════════════
// ТРЁХМЕРНЫЙ ДВАДЦАТИГРАННИК — без библиотек
// ═══════════════════════════════════════════════════════════
// Почему не three.js: качать библиотеку неоткуда, а проект обязан работать
// с диска двойным кликом. Здесь ноль зависимостей — обычный canvas.
//
// Почему не CSS: там двадцать треугольников поворачивались РУКАМИ, и ошибка
// в один угол разносила фигуру. Тут геометрия ВЫЧИСЛЯЕТСЯ из золотого
// сечения, ошибиться в ней нельзя, и её можно проверить числами —
// что и делает dice-test.mjs.
//
// Кубик — декорация. Он НЕ приземляется на выпавшую грань: правду говорит
// цифра, которая вспыхивает поверх. Поэтому не нужна ни физика, ни подгонка.
// Из этого же следует, что на гранях НЕ должно быть чисел: крутится 20,
// встанет на 7, а вспышка покажет 15 — зрители заметят за первый вечер.
// ═══════════════════════════════════════════════════════════

(function (w) {
    var PHI = (1 + Math.sqrt(5)) / 2;

    /* Двенадцать вершин икосаэдра: три взаимно перпендикулярных
       золотых прямоугольника. Классическое построение. */
    function buildVertices() {
        var v = [], s = [[0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI]];
        for (var i = 0; i < 4; i++) {
            var a = s[i];
            v.push([a[0], a[1], a[2]]);      /* (0, ±1, ±φ) */
            v.push([a[1], a[2], a[0]]);      /* (±1, ±φ, 0) */
            v.push([a[2], a[0], a[1]]);      /* (±φ, 0, ±1) */
        }
        /* Нормируем на единичную сферу — так радиус предсказуем. */
        var r = Math.sqrt(1 + PHI * PHI);
        return v.map(function (p) { return [p[0] / r, p[1] / r, p[2] / r]; });
    }

    /* Двадцать граней: каждая тройка вершин, попарно соседних.
       Соседние — те, между которыми РЕБРО, то есть кратчайшее расстояние. */
    function buildFaces(verts) {
        var n = verts.length, faces = [];
        var d2 = function (a, b) {
            var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
            return x * x + y * y + z * z;
        };
        /* Длина ребра — минимальное расстояние между вершинами. */
        var min = Infinity;
        for (var i = 0; i < n; i++)
            for (var j = i + 1; j < n; j++) min = Math.min(min, d2(verts[i], verts[j]));
        var eps = min * 0.05;

        for (var a = 0; a < n; a++)
            for (var b = a + 1; b < n; b++) {
                if (Math.abs(d2(verts[a], verts[b]) - min) > eps) continue;
                for (var c = b + 1; c < n; c++) {
                    if (Math.abs(d2(verts[a], verts[c]) - min) > eps) continue;
                    if (Math.abs(d2(verts[b], verts[c]) - min) > eps) continue;
                    /* Разворачиваем грань НАРУЖУ. Перебор по возрастанию
                       индексов даёт половину граней вывернутыми, и тогда
                       отсечение задних выбросило бы не те: кубик оказался бы
                       дырявым. Нормаль должна смотреть от центра. */
                    faces.push(orient(verts, a, b, c));
                }
            }
        return faces;
    }

    /* Если нормаль смотрит внутрь — меняем две вершины местами. */
    function orient(verts, a, b, c) {
        var A = verts[a], B = verts[b], C = verts[c];
        var u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
        var v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        var n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        var mid = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
        var dot = n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2];
        return dot >= 0 ? [a, b, c] : [a, c, b];
    }

    var VERTS = buildVertices();
    var FACES = buildFaces(VERTS);

    /* ══════════════════════════════════════════════════════════════════
       АТЛАС ЦИФР И ДОВОРОТ НА ВЫПАВШУЮ ГРАНЬ

       Порознь эти две вещи противоречат друг другу: пока кубик встаёт как
       попало, цифры на гранях ВРУТ — крутится двадцатка, встал на семёрку,
       вспышка показывает пятнадцать. Поэтому либо обе сразу, либо грани
       остаются гладкими.

       АТЛАС 4x5, ячейка n = грань с числом n+1. У canvas нет
       текстурирования, поэтому натягиваем руками: каждой грани
       соответствует треугольная ячейка, между ними считается аффинное
       преобразование. Три точки однозначно его задают, а треугольник у нас
       как раз из трёх вершин.

       ДОВОРОТ ищется по нормали грани. Порядок важен и совпадает с
       порядком в rotate(): сперва вокруг X, потом вокруг Y.
       ══════════════════════════════════════════════════════════════════ */

    var NORMALS = FACES.map(function (f) {
        var a = VERTS[f[0]], b = VERTS[f[1]], c = VERTS[f[2]];
        var u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
        var v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
        var n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        var L = Math.sqrt(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]) || 1;
        return [n[0]/L, n[1]/L, n[2]/L];
    });

    /* Углы, при которых нормаль грани смотрит в камеру.

       Первый вариант я выводил одной формулой «в уме» — он работал ровно
       для половины граней: восемь из двадцати доворачивались чужой
       стороной. Считаем по шагам и проверяем численно. */
    function anglesFor(faceIdx) {
        var n = NORMALS[faceIdx];
        var ax = Math.atan2(n[1], n[2]);
        var p1 = rotate(n, ax, 0, 0);        /* здесь p1[1] уже ноль */
        var ay = Math.atan2(-p1[0], p1[2]);
        return { ax: ax, ay: ay };
    }

    /* Треугольник ячейки атласа в долях кадра. Поля ИЗМЕРЕНЫ по готовому
       атласу: в клетке 225 точек вершина стояла на y=9, основание на 215,
       края на 12 и 210. Другой атлас — меняются три числа. */
    /* ЧТО РИСОВАТЬ НА КАКОЙ ГРАНИ.

       У настоящего d20 противоположные грани в сумме дают 21: единица
       напротив двадцатки, двойка напротив девятнадцати. Так гасится перекос,
       если кость чуть кривая, и так делают все производители.

       Наши грани нумеруются подряд по построению, и правило не выполнялось:
       напротив двойки стояла шестнадцать. На честность броска это не влияет —
       число задаёт игра, — но при близком рассмотрении кубик выдавал себя.

       Таблица говорит: на грани i рисовать ЯЧЕЙКУ FACE_CELL[i]. Художник
       рисует ячейки как обычно, 1..20 по порядку; перестановка живёт здесь.
       Посчитана перебором пар и проверена: суммы везде 21, номера без
       повторов. */
    var FACE_CELL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 17, 18, 14, 16, 19, 13, 11, 15, 20];

    var M_TOP = 9/225, M_BOT = 10/225, M_SIDE = 12/225;
    function cellTri(n, iw, ih) {
        var cw = iw / 4, ch = ih / 5;
        var x = (n % 4) * cw, y = Math.floor(n / 4) * ch;
        return [[x + cw/2, y + ch*M_TOP],
                [x + cw*M_SIDE, y + ch*(1-M_BOT)],
                [x + cw*(1-M_SIDE), y + ch*(1-M_BOT)]];
    }

    /* Атлас грузится один раз на всех: кубиков на экране бывает два. */
    var ATLAS = null, ATLAS_OK = false;
    function loadAtlas(url) {
        if (ATLAS || !url || typeof Image === 'undefined') return;
        ATLAS = new Image();
        ATLAS.onload = function () { ATLAS_OK = true; };
        ATLAS.onerror = function () { ATLAS_OK = false; };
        ATLAS.src = url;
    }

    function rotate(p, rx, ry, rz) {
        var x = p[0], y = p[1], z = p[2], t;
        t = y * Math.cos(rx) - z * Math.sin(rx); z = y * Math.sin(rx) + z * Math.cos(rx); y = t;
        t = x * Math.cos(ry) + z * Math.sin(ry); z = -x * Math.sin(ry) + z * Math.cos(ry); x = t;
        t = x * Math.cos(rz) - y * Math.sin(rz); y = x * Math.sin(rz) + y * Math.cos(rz); x = t;
        return [x, y, z];
    }

    /* Один кубик на своём canvas. */
    function makeDie(canvas, opts) {
        opts = opts || {};
        var ctx = canvas && canvas.getContext && canvas.getContext('2d');
        var die = {
            rx: 0.5, ry: 0.3, rz: 0,
            speed: 0, target: 0,
            color: opts.color || '#7a2c1c',
            alive: true,
            canvas: canvas
        };
        /* Управление объявляем ДО проверки canvas: без него кубик просто не
           рисуется, но звать spin/stop всё равно должно быть безопасно —
           иначе стример упадёт там, где холста нет. */
        die.spin = function () { die.target = 0.09; };     /* быстрее — мутит */
        die.stop = function () { die.target = 0; };
        die.setColor = function (c) { die.color = c; if (die.redraw) die.redraw(); };
        die.destroy = function () { die.alive = false; };
        if (!ctx) return die;

        function draw() {
            var W = canvas.width, H = canvas.height;
            var R = Math.min(W, H) * 0.38;
            ctx.clearRect(0, 0, W, H);

            var pts = VERTS.map(function (v) { return rotate(v, die.rx, die.ry, die.rz); });

            /* Художник: дальние грани рисуем первыми, ближние поверх.
               Так не нужен буфер глубины. */
            var order = FACES.map(function (f, i) {
                return { i: i, z: (pts[f[0]][2] + pts[f[1]][2] + pts[f[2]][2]) / 3 };
            }).sort(function (a, b) { return a.z - b.z; });

            order.forEach(function (o) {
                var f = FACES[o.i];
                var a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];

                /* Нормаль грани: свет и отсечение задом наперёд. */
                var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
                var vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
                var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                nz /= len; nx /= len; ny /= len;
                if (nz < 0) return;                      /* грань смотрит от нас */

                /* Свет сверху-сбоку, как в прототипе. */
                var lit = 0.35 + 0.65 * Math.max(0, nx * 0.4 + ny * 0.5 + nz * 0.75);
                ctx.beginPath();
                ctx.moveTo(W / 2 + a[0] * R, H / 2 - a[1] * R);
                ctx.lineTo(W / 2 + b[0] * R, H / 2 - b[1] * R);
                ctx.lineTo(W / 2 + c[0] * R, H / 2 - c[1] * R);
                ctx.closePath();
                var P0 = [W/2 + a[0]*R, H/2 - a[1]*R];
                var P1 = [W/2 + b[0]*R, H/2 - b[1]*R];
                var P2 = [W/2 + c[0]*R, H/2 - c[1]*R];

                if (ATLAS_OK) {
                    /* Цифра из атласа, поверх — затенение: без него фигура
                       выглядит плоской наклейкой. */
                    drawTexTri(ctx, ATLAS, cellTri(FACE_CELL[o.i] - 1, ATLAS.width, ATLAS.height),
                               [P0, P1, P2]);
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(P0[0],P0[1]); ctx.lineTo(P1[0],P1[1]); ctx.lineTo(P2[0],P2[1]);
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(0,0,0,' + ((1 - lit) * 0.55).toFixed(3) + ')';
                    ctx.fill();
                    ctx.restore();
                } else {
                    ctx.fillStyle = shade(die.color, lit);
                    ctx.fill();
                }
                ctx.strokeStyle = 'rgba(255,225,170,0.55)';
                ctx.lineWidth = Math.max(1, R * 0.012);
                ctx.stroke();
            });
        }

        /* ДОВОРОТ НА ВЫПАВШУЮ ГРАНЬ. Без него цифры на гранях врут: крутится
           двадцатка, встал на семёрку, а вспышка показывает пятнадцать.
           Зрители заметят за первый вечер.

           Зовётся ИЗВНЕ, когда исход броска уже известен: dice.land(17). */
        die.land = function (value) {
            var v = Math.max(1, Math.min(FACES.length, Math.round(value) || 1));
            /* Ищем ГРАНЬ, на которой нарисовано это число, а не грань с таким
               порядковым номером: после перестановки это разные вещи. */
            var face = FACE_CELL.indexOf(v);
            die.landing = anglesFor(face < 0 ? v - 1 : face);
            die.result = v;
        };

        function step() {
            if (!die.alive) return;
            if (die.landing) {
                /* Подходим по КРАТЧАЙШЕЙ дуге, иначе кубик крутанёт лишний
                   круг перед остановкой. */
                var d = function (x) {
                    return (x % (2*Math.PI) + 3*Math.PI) % (2*Math.PI) - Math.PI;
                };
                var dx = d(die.landing.ax - die.rx);
                var dy = d(die.landing.ay - die.ry);
                var dz = d(0 - die.rz);
                die.rx += dx * 0.14; die.ry += dy * 0.14; die.rz += dz * 0.14;
                die.speed *= 0.8;
                if (Math.abs(dx) < 0.004 && Math.abs(dy) < 0.004 && Math.abs(dz) < 0.004) {
                    die.rx = die.landing.ax; die.ry = die.landing.ay; die.rz = 0;
                    die.landing = null; die.speed = 0;
                    if (die.onLanded) die.onLanded(die.result);
                }
            } else {
                die.speed += (die.target - die.speed) * 0.06;   /* плавный разгон и торможение */
                die.rx += die.speed * 0.9;
                die.ry += die.speed * 1.6;
                die.rz += die.speed * 0.4;
            }
            draw();
            if (w.requestAnimationFrame) w.requestAnimationFrame(step);
        }
        if (w.requestAnimationFrame) w.requestAnimationFrame(step); else draw();

        die.redraw = draw;
        return die;
    }

    /* Натяжение куска атласа на треугольник. У canvas нет текстур, поэтому:
       обрезаем по треугольнику на экране, задаём аффинное преобразование из
       треугольника атласа в него и рисуем картинку целиком — видна окажется
       только нужная ячейка. */
    function drawTexTri(ctx, img, src, dst) {
        var s0 = src[0], s1 = src[1], s2 = src[2];
        var d0 = dst[0], d1 = dst[1], d2 = dst[2];
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(d0[0], d0[1]); ctx.lineTo(d1[0], d1[1]); ctx.lineTo(d2[0], d2[1]);
        ctx.closePath(); ctx.clip();
        var sx1 = s1[0]-s0[0], sy1 = s1[1]-s0[1], sx2 = s2[0]-s0[0], sy2 = s2[1]-s0[1];
        var det = sx1*sy2 - sx2*sy1;
        if (Math.abs(det) < 1e-9) { ctx.restore(); return; }
        var dx1 = d1[0]-d0[0], dy1 = d1[1]-d0[1], dx2 = d2[0]-d0[0], dy2 = d2[1]-d0[1];
        var A = (dx1*sy2 - dx2*sy1)/det, B = (dy1*sy2 - dy2*sy1)/det;
        var C = (dx2*sx1 - dx1*sx2)/det, Dd = (dy2*sx1 - dy1*sx2)/det;
        ctx.transform(A, B, C, Dd, d0[0] - A*s0[0] - C*s0[1], d0[1] - B*s0[0] - Dd*s0[1]);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
    }

    function shade(hex, k) {
        var n = parseInt(String(hex).replace('#', ''), 16);
        var r = Math.min(255, Math.round(((n >> 16) & 255) * k));
        var g = Math.min(255, Math.round(((n >> 8) & 255) * k));
        var b = Math.min(255, Math.round((n & 255) * k));
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    w.Dice3D = {
        VERTS: VERTS,
        FACES: FACES,
        NORMALS: NORMALS,
        anglesFor: anglesFor,
        cellTri: cellTri, FACE_CELL: FACE_CELL,
        loadAtlas: loadAtlas,
        atlasReady: function () { return ATLAS_OK; },
        make: makeDie,
        ATTACK_COLOR: '#7a2c1c',      /* атака красная */
        DEFENSE_COLOR: '#1c3a6a'      /* защита синяя */
    };
})(typeof window !== 'undefined' ? window : globalThis);
