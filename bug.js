var gl;
var program;
var positionBuffer;
var colorBuffer;

var rotationMatrix;
var dragging = false;
var lastX, lastY;

var MAX_BACTERIA    = 10;
var TARGET_KILLS    = 50;
var THRESHOLD_DEG   = 30;
var SPHERE_RADIUS   = 0.7;
var BACTERIA_RADIUS = 0.705;
var DOT_RADIUS      = 0.708;
var BASE_GROW_RATE  = 1.5;
var growRate        = BASE_GROW_RATE;

var BACTERIA_COLORS = [
    [0.10, 0.35, 1.00],
    [1.00, 0.15, 0.10],
    [0.10, 0.85, 0.20],
    [1.00, 0.82, 0.00],
    [0.88, 0.10, 0.88],
    [0.00, 0.88, 0.88],
    [1.00, 0.48, 0.00],
    [0.55, 0.10, 1.00],
    [1.00, 0.28, 0.58],
    [0.18, 0.88, 0.50],
];

var bacteria          = [];
var score             = 0;
var gameRunning       = false;
var gameOver          = false;
var elapsed           = 0;
var lastTimestamp     = 0;
var autoSpawnTimer    = 0;
var autoSpawnInterval = 5.0;
var nextBactId        = 0;
var totalSpawned      = 0;
var totalKilled       = 0;
var currentHover      = -1;
var msgTimer          = null;
var thresholdReached  = 0;

var WAVE_SIZE              = 10;
var TOTAL_WAVES            = 5;
var WAVE_GROWTH_MULTIPLIER = [1,   1,   1.5, 1.5, 2  ]; // indexed by wave-1
var WAVE_SPAWN_MIN         = [1,   2,   1,   2,   2  ];
var WAVE_SPAWN_MAX         = [1,   3,   1,   3,   3  ];
var currentWave            = 1;

function waveForKills(kills) {
    return Math.min(TOTAL_WAVES, Math.floor(kills / WAVE_SIZE) + 1);
}

function spawnCountForWave(wave) {
    var min = WAVE_SPAWN_MIN[wave - 1];
    var max = WAVE_SPAWN_MAX[wave - 1];
    return min + Math.floor(Math.random() * (max - min + 1));
}

function buildSphere() {
    var points   = [];
    var colors   = [];
    var drawList = [];
    var latBands  = 36;
    var longBands = 36;
    var radius    = SPHERE_RADIUS;
    var grey      = vec4(0.50, 0.52, 0.54, 1.0);

    for (var lat = 0; lat < latBands; lat++) {
        var start  = points.length;
        var theta1 = (lat       / latBands) * Math.PI;
        var theta2 = ((lat + 1) / latBands) * Math.PI;

        for (var lon = 0; lon <= longBands; lon++) {
            var phi = (lon / longBands) * 2 * Math.PI;
            points.push(vec4(radius * Math.sin(theta1) * Math.cos(phi),
                             radius * Math.cos(theta1),
                             radius * Math.sin(theta1) * Math.sin(phi), 1.0));
            colors.push(grey);
            points.push(vec4(radius * Math.sin(theta2) * Math.cos(phi),
                             radius * Math.cos(theta2),
                             radius * Math.sin(theta2) * Math.sin(phi), 1.0));
            colors.push(grey);
        }
        drawList.push({ start: start, count: points.length - start });
    }
    return { points: points, colors: colors, drawList: drawList };
}

function buildDots() {
    var points      = [];
    var colors      = [];
    var drawList    = [];
    var numRings    = 18;
    var dotsPerRing = 18;
    var dotSegments = 8;
    var dotSize     = 0.025;
    var sphereR     = DOT_RADIUS;
    var white       = vec4(1.0, 1.0, 1.0, 1.0);

    for (var ring = 0; ring < numRings; ring++) {
        var theta = ((ring + 1) / (numRings + 1)) * Math.PI;
        var sinT  = Math.sin(theta);
        var cosT  = Math.cos(theta);

        for (var d = 0; d < dotsPerRing; d++) {
            var phi = (d / dotsPerRing) * 2 * Math.PI;
            var cx  = sphereR * sinT * Math.cos(phi);
            var cy  = sphereR * cosT;
            var cz  = sphereR * sinT * Math.sin(phi);

            var t1x = -Math.sin(phi),                 t1y = 0.0,               t1z =  Math.cos(phi);
            var t2x =  Math.cos(theta)*Math.cos(phi), t2y = -Math.sin(theta),  t2z =  Math.cos(theta)*Math.sin(phi);

            var start = points.length;
            points.push(vec4(cx, cy, cz, 1.0));
            colors.push(white);

            for (var s = 0; s <= dotSegments; s++) {
                var a  = (s / dotSegments) * 2 * Math.PI;
                var ca = Math.cos(a) * dotSize;
                var sa = Math.sin(a) * dotSize;
                points.push(vec4(cx + ca*t1x + sa*t2x,
                                 cy + ca*t1y + sa*t2y,
                                 cz + ca*t1z + sa*t2z, 1.0));
                colors.push(white);
            }
            drawList.push({ start: start, count: points.length - start });
        }
    }
    return { points: points, colors: colors, drawList: drawList };
}

function buildBacteriumCap(bact) {
    var points      = [];
    var colors      = [];
    var capSegments = 48;
    var capR        = BACTERIA_RADIUS;
    var capAng      = (bact.angleDeg / 2.0) * Math.PI / 180.0;
    var cx = bact.cx, cy = bact.cy, cz = bact.cz;

    var upX = 0, upY = 1, upZ = 0;
    if (Math.abs(cy) > 0.9) { upX = 1; upY = 0; upZ = 0; }

    var t1x = upY*cz - upZ*cy,  t1y = upZ*cx - upX*cz,  t1z = upX*cy - upY*cx;
    var t1l = Math.sqrt(t1x*t1x + t1y*t1y + t1z*t1z);
    t1x /= t1l;  t1y /= t1l;  t1z /= t1l;

    var t2x = cy*t1z - cz*t1y,  t2y = cz*t1x - cx*t1z,  t2z = cx*t1y - cy*t1x;

    var col  = vec4(bact.color[0], bact.color[1], bact.color[2], 1.0);
    var cosC = Math.cos(capAng);
    var sinC = Math.sin(capAng);

    points.push(vec4(capR*cx, capR*cy, capR*cz, 1.0));
    colors.push(col);

    for (var s = 0; s <= capSegments; s++) {
        var a  = (s / capSegments) * 2 * Math.PI;
        var ca = Math.cos(a);
        var sa = Math.sin(a);
        var nx = cosC*cx + sinC*(ca*t1x + sa*t2x);
        var ny = cosC*cy + sinC*(ca*t1y + sa*t2y);
        var nz = cosC*cz + sinC*(ca*t1z + sa*t2z);
        points.push(vec4(capR*nx, capR*ny, capR*nz, 1.0));
        colors.push(col);
    }
    return { points: points, colors: colors, count: points.length };
}

function uploadAndDraw() {
    var sphere     = buildSphere();
    var caps       = [];
    var capOffsets = [];

    for (var i = 0; i < bacteria.length; i++) {
        caps.push(buildBacteriumCap(bacteria[i]));
    }

    var dots = buildDots();

    var allPoints = sphere.points.slice();
    var allColors = sphere.colors.slice();

    for (var i = 0; i < caps.length; i++) {
        capOffsets.push(allPoints.length);
        allPoints = allPoints.concat(caps[i].points);
        allColors = allColors.concat(caps[i].colors);
    }

    var dotsOffset = allPoints.length;
    allPoints = allPoints.concat(dots.points);
    allColors = allColors.concat(dots.colors);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(allPoints), gl.DYNAMIC_DRAW);
    var vPosition = gl.getAttribLocation(program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(allColors), gl.DYNAMIC_DRAW);
    var vColor = gl.getAttribLocation(program, "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    var uMatrix = gl.getUniformLocation(program, "uMatrix");
    gl.uniformMatrix4fv(uMatrix, false, flatten(rotationMatrix));

    for (var i = 0; i < sphere.drawList.length; i++) {
        gl.drawArrays(gl.TRIANGLE_STRIP, sphere.drawList[i].start, sphere.drawList[i].count);
    }
    for (var i = 0; i < caps.length; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, capOffsets[i], caps[i].count);
    }
    for (var i = 0; i < dots.drawList.length; i++) {
        gl.drawArrays(gl.TRIANGLE_FAN, dotsOffset + dots.drawList[i].start, dots.drawList[i].count);
    }
}

// Mirrors the gl.clearColor() call in init() so picking can recognize background pixels.
var CLEAR_COLOR_RGB = [
    Math.round(0.05 * 255),
    Math.round(0.05 * 255),
    Math.round(0.10 * 255)
];

function pickBacteriumAtPixel(mx, my) {
    var pixels = new Uint8Array(4);
    gl.readPixels(mx, gl.canvas.height - my, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    var r = pixels[0], g = pixels[1], b = pixels[2];

    if (Math.abs(r-CLEAR_COLOR_RGB[0])<20 && Math.abs(g-CLEAR_COLOR_RGB[1])<20 && Math.abs(b-CLEAR_COLOR_RGB[2])<20) return -1;
    if (Math.abs(r-128)<40 && Math.abs(g-133)<40 && Math.abs(b-138)<40)                                             return -1;
    if (r > 180 && g > 180 && b > 180)                                                                              return -1;

    var best     = -1;
    var bestDist = 60 * 60 * 3;
    for (var i = 0; i < bacteria.length; i++) {
        var bc   = bacteria[i].color;
        var dist = (r - Math.round(bc[0]*255)) * (r - Math.round(bc[0]*255)) +
                   (g - Math.round(bc[1]*255)) * (g - Math.round(bc[1]*255)) +
                   (b - Math.round(bc[2]*255)) * (b - Math.round(bc[2]*255));
        if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
}

function spawnBacterium() {
    if (bacteria.length >= MAX_BACTERIA) return;
    if (totalSpawned >= TARGET_KILLS) return;

    var usedColors = {};
    for (var i = 0; i < bacteria.length; i++) {
        usedColors[bacteria[i].colorIdx] = true;
    }
    var colorIdx = -1;
    for (var c = 0; c < BACTERIA_COLORS.length; c++) {
        if (!usedColors[c]) { colorIdx = c; break; }
    }
    if (colorIdx === -1) return;

    var phi   = -Math.PI/2 + (Math.random() - 0.5) * Math.PI * 0.6; // centered on front face (cz < 0)
    var u     = (Math.random() - 0.5) * Math.PI * 0.45; // avoids top/bottom rim
    var theta = Math.PI / 2 + u;

    bacteria.push({
        id:            nextBactId++,
        colorIdx:      colorIdx,
        cx:            Math.sin(theta) * Math.cos(phi),
        cy:            Math.cos(theta),
        cz:            Math.sin(theta) * Math.sin(phi),
        color:         BACTERIA_COLORS[colorIdx],
        angleDeg:      5.0,
        overThreshold: false,
        spawnTime:     elapsed
    });

    totalSpawned++;
}

function zapAction() {
    if (!gameRunning || gameOver) return;

    if (currentHover >= 0 && currentHover < bacteria.length) {
        var killed = bacteria[currentHover];
        bacteria.splice(currentHover, 1);
        currentHover = -1;
        totalKilled++;
        currentWave = waveForKills(totalKilled);
        showMessage("Bacteria " + (killed.id + 1) + " eliminated! (" + totalKilled + "/" + TARGET_KILLS + ")", "success");
        updateUI();
        checkWin();
    } else {
        showMessage("Miss! Place mouse over a bacterium first.", "warning");
    }
}

function updateGame(dt) {
    if (!gameRunning || gameOver) return;

    elapsed        += dt;
    autoSpawnTimer += dt;

    currentWave = waveForKills(totalKilled);
    growRate    = BASE_GROW_RATE * WAVE_GROWTH_MULTIPLIER[currentWave - 1];

    if (autoSpawnTimer >= autoSpawnInterval) {
        var spawnCount = spawnCountForWave(currentWave);
        for (var s = 0; s < spawnCount; s++) spawnBacterium();
        autoSpawnTimer    = 0;
        autoSpawnInterval = Math.max(2.0, autoSpawnInterval * 0.92);
    }

    for (var i = 0; i < bacteria.length; i++) {
        var b = bacteria[i];

        b.angleDeg += growRate * dt;
        score      += dt * (b.angleDeg / THRESHOLD_DEG);

        if (!b.overThreshold && b.angleDeg >= THRESHOLD_DEG) {
            b.overThreshold = true;
            thresholdReached++;
            score += 200;
            showMessage("WARNING: Bacteria " + (b.id + 1) + " reached critical size!", "danger");

            if (thresholdReached >= 2) {
                endGame(false);
                return;
            }
        }

        if (b.angleDeg > 170) b.angleDeg = 170;
    }

    checkWin();
    updateUI();
}

function checkWin() {
    if (totalKilled >= TARGET_KILLS && bacteria.length === 0) {
        endGame(true);
    }
}

function startGame() {
    bacteria          = [];
    score             = 0;
    elapsed           = 0;
    nextBactId        = 0;
    totalSpawned      = 0;
    totalKilled       = 0;
    autoSpawnTimer    = 0;
    autoSpawnInterval = 5.0;
    thresholdReached  = 0;
    currentWave       = 1;
    growRate          = BASE_GROW_RATE;
    gameOver          = false;
    gameRunning       = true;
    lastTimestamp     = performance.now();
    showMessage("Hover over bacteria and click Zap to eliminate them!", "info");
    spawnBacterium();
    spawnBacterium();
    updateUI();
}

function endGame(win) {
    gameOver    = true;
    gameRunning = false;
    if (win) {
        showMessage("YOU WIN! All bacteria eliminated. Final score: " + Math.floor(score) + " (lower is better). Refresh to play again.", "success");
    } else {
        showMessage("GAME OVER! Two bacteria reached 30 degrees. Score: " + Math.floor(score) + ". Refresh to play again.", "danger");
    }
    updateUI();
}

function updateUI() {
    document.getElementById("ui-count").textContent  = bacteria.length;
    document.getElementById("ui-wave").textContent   = currentWave + "/" + TOTAL_WAVES;
    document.getElementById("ui-danger").textContent = thresholdReached;
    document.getElementById("ui-score").textContent  = Math.floor(score);
    document.getElementById("ui-time").textContent   = Math.floor(elapsed) + "s";

    var waveClass = "wave-" + currentWave;
    if (document.body.className !== waveClass) {
        document.body.className = waveClass;
    }
}

function showMessage(txt, type) {
    var el = document.getElementById("message");
    if (!el) return;
    el.textContent = txt;
    el.className = type ? "msg-" + type : "";
    if (msgTimer) clearTimeout(msgTimer);
    if (txt !== "") msgTimer = setTimeout(function(){ el.textContent = ""; el.className = ""; }, 3500);
}

function init() {
    var canvas = document.getElementById("gl-canvas");

    gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
    if (!gl) { alert("WebGL not available"); return; }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.05, 0.05, 0.10, 1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    positionBuffer = gl.createBuffer();
    colorBuffer    = gl.createBuffer();

    rotationMatrix = mat4();

    canvas.addEventListener("mousedown", function(ev) {
        dragging = true;
        lastX = ev.clientX;
        lastY = ev.clientY;
        ev.preventDefault();
    });
    window.addEventListener("mouseup", function() { dragging = false; });

    window.addEventListener("mousemove", function(ev) {
        var rect = canvas.getBoundingClientRect();
        var mx   = ev.clientX - rect.left;
        var my   = ev.clientY - rect.top;

        if (dragging) {
            var dx = ev.clientX - lastX;
            var dy = ev.clientY - lastY;
            lastX = ev.clientX;
            lastY = ev.clientY;
            rotationMatrix = mult(rotationMatrix, rotateY(dx * 0.5));
            rotationMatrix = mult(rotationMatrix, rotateX(dy * 0.5));
            return;
        }

        if (gameRunning && !gameOver) {
            currentHover = pickBacteriumAtPixel(Math.round(mx), Math.round(my));
            canvas.style.cursor = (currentHover >= 0) ? "crosshair" : "default";
        }
    });

    canvas.addEventListener("click", function() { if (!dragging) zapAction(); });
    document.addEventListener("keydown", function(ev) {
        if (ev.code === "Space") { ev.preventDefault(); zapAction(); }
    });

    var btn = document.getElementById("btn-zap");
    if (btn) btn.addEventListener("click", zapAction);

    startGame();

    function renderLoop(timestamp) {
        var dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
        lastTimestamp = timestamp;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        uploadAndDraw();

        if (gameRunning && !gameOver) updateGame(dt);

        requestAnimationFrame(renderLoop);
    }

    lastTimestamp = performance.now();
    requestAnimationFrame(renderLoop);
}