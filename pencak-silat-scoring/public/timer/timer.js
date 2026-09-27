const socket = io();
let currentMatch = null;

const el = {
    noMatch: document.getElementById('no-match'),
    content: document.getElementById('content'),
    title: document.getElementById('match-title'),
    round: document.getElementById('round-label'),
    display: document.getElementById('timer-display'),
    skorMerah: document.getElementById('skor-merah'),
    skorBiru: document.getElementById('skor-biru'),
};

function pad(n) {
    return String(n).padStart(2, '0');
}

async function loadActiveMatch() {
    const res = await fetch('/api/matches/status/active');
    const match = await res.json();
    if (!match) {
        el.noMatch.classList.remove('hidden');
        el.content.classList.add('hidden');
        currentMatch = null;
        return;
    }
    currentMatch = match;
    el.noMatch.classList.add('hidden');
    el.content.classList.remove('hidden');
    el.title.textContent = `${match.merah_nama} vs ${match.biru_nama}`;
    el.round.textContent = match.round_berjalan;
    el.skorMerah.textContent = match.merah_skor;
    el.skorBiru.textContent = match.biru_skor;

    socket.emit('join_role', { role: 'timer', matchId: match.id });
    socket.emit('timer:init', { matchId: match.id });
}

socket.on('connect', loadActiveMatch);
socket.on('admin:match_activated', loadActiveMatch);

socket.on('timer:update', (state) => {
    if (!currentMatch || state.matchId !== currentMatch.id) return;
    el.display.textContent = `${pad(state.minutes)}:${pad(state.seconds)}`;
    el.display.classList.toggle('text-red-500', state.remaining <= 10 && state.remaining > 0);
});

socket.on('timer:finished', () => {
    el.display.classList.add('text-red-500');
});

socket.on('score:valid_added', (data) => {
    if (!currentMatch || data.matchId !== currentMatch.id) return;
    el.skorMerah.textContent = data.merah_skor;
    el.skorBiru.textContent = data.biru_skor;
});
socket.on('ketua:score_updated', (data) => {
    if (!currentMatch || data.matchId !== currentMatch.id) return;
    el.skorMerah.textContent = data.merah_skor;
    el.skorBiru.textContent = data.biru_skor;
});

document.getElementById('btn-start').addEventListener('click', () => {
    if (currentMatch) socket.emit('timer:start', { matchId: currentMatch.id });
});
document.getElementById('btn-pause').addEventListener('click', () => {
    if (currentMatch) socket.emit('timer:pause', { matchId: currentMatch.id });
});
document.getElementById('btn-reset').addEventListener('click', () => {
    if (currentMatch) socket.emit('timer:reset', { matchId: currentMatch.id });
});
document.getElementById('btn-next-round').addEventListener('click', () => {
    if (currentMatch && confirm('Lanjut ke babak selanjutnya? Timer akan direset.')) {
        socket.emit('timer:next_round', { matchId: currentMatch.id });
    }
});
document.getElementById('btn-refresh-juri').addEventListener('click', () => {
    if (currentMatch) socket.emit('timer:refresh_juri', { matchId: currentMatch.id });
});
