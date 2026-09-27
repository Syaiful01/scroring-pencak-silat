/**
 * TIMER MANAGER
 * -------------
 * Mengelola countdown timer per match secara in-memory di server,
 * lalu broadcast state (menit, detik, status) ke semua client via Socket.io
 * setiap 1 detik selagi berjalan. Ini memastikan semua layar (Juri, Ketua,
 * Display) selalu sinkron walau mereka join/refresh kapan saja.
 */

// Map<matchId, { remaining: number(detik), duration: number(detik),
//                running: boolean, round: number, interval: NodeJS.Timer|null }>
const timers = new Map();

function getState(matchId) {
    if (!timers.has(matchId)) {
        timers.set(matchId, {
            remaining: 0,
            duration: 0,
            running: false,
            round: 1,
            interval: null,
            endsAt: null,
        });
    }
    return timers.get(matchId);
}

function publicState(matchId) {
    const s = getState(matchId);
    const remaining = s.running && s.endsAt
        ? Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000))
        : s.remaining;
    return {
        matchId,
        remaining,
        duration: s.duration,
        running: s.running,
        round: s.round,
        minutes: Math.floor(remaining / 60),
        seconds: remaining % 60,
    };
}

function init(matchId, durationSeconds, round = 1) {
    stop(matchId);
    const s = getState(matchId);
    s.duration = durationSeconds;
    s.remaining = durationSeconds;
    s.running = false;
    s.round = round;
    s.endsAt = null;
    return publicState(matchId);
}

// Sinkronisasi client tidak boleh me-reset timer yang sedang berjalan.
function ensure(matchId, durationSeconds, round = 1) {
    const s = getState(matchId);
    if (!s.duration || s.duration !== durationSeconds || s.round !== round) {
        return init(matchId, durationSeconds, round);
    }
    return publicState(matchId);
}

function start(matchId, onTick, onFinish) {
    const s = getState(matchId);
    if (s.running || s.remaining <= 0) return publicState(matchId);
    s.running = true;
    s.endsAt = Date.now() + (s.remaining * 1000);
    s.interval = setInterval(() => {
        s.remaining = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
        if (s.remaining <= 0) {
            s.remaining = 0;
            s.running = false;
            clearInterval(s.interval);
            s.interval = null;
            s.endsAt = null;
            onTick && onTick(publicState(matchId));
            onFinish && onFinish(publicState(matchId));
            return;
        }
        onTick && onTick(publicState(matchId));
    }, 1000);
    return publicState(matchId);
}

function pause(matchId) {
    const s = getState(matchId);
    if (s.running && s.endsAt) {
        s.remaining = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
    }
    s.running = false;
    if (s.interval) {
        clearInterval(s.interval);
        s.interval = null;
    }
    s.endsAt = null;
    return publicState(matchId);
}

function reset(matchId) {
    const s = getState(matchId);
    pause(matchId);
    s.remaining = s.duration;
    return publicState(matchId);
}

function stop(matchId) {
    const s = timers.get(matchId);
    if (s && s.interval) clearInterval(s.interval);
    if (s) {
        s.running = false;
        s.interval = null;
    }
}

module.exports = { init, ensure, start, pause, reset, stop, publicState, getState };
