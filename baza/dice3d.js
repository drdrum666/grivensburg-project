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
                ctx.fillStyle = shade(die.color, lit);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,225,170,0.55)';
                ctx.lineWidth = Math.max(1, R * 0.012);
                ctx.stroke();
            });
        }

        function step() {
            if (!die.alive) return;
            die.speed += (die.target - die.speed) * 0.06;   /* плавный разгон и торможение */
            die.rx += die.speed * 0.9;
            die.ry += die.speed * 1.6;
            die.rz += die.speed * 0.4;
            draw();
            if (w.requestAnimationFrame) w.requestAnimationFrame(step);
        }
        if (w.requestAnimationFrame) w.requestAnimationFrame(step); else draw();

        die.redraw = draw;
        return die;
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
        make: makeDie,
        ATTACK_COLOR: '#7a2c1c',      /* атака красная */
        DEFENSE_COLOR: '#1c3a6a'      /* защита синяя */
    };
})(typeof window !== 'undefined' ? window : globalThis);
