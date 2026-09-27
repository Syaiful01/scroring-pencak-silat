const socket = io();
let currentMatch = null;

const el = {
    noMatch: document.getElementById('no-match'),
    content: document.getElementById('content'),
    kelas: document.getElementById('kelas-label'),
    round: document.getElementById('round-label'),
    timer: document.getElementById('timer-display'),
    merahNama: document.getElementById('merah-nama'),
    merahKontingen: document.getElementById('merah-kontingen'),
    merahSkor: document.getElementById('merah-skor'),
    merahHukuman: document.getElementById('merah-hukuman'),
    biruNama: document.getElementById('biru-nama'),
    biruKontingen: document.getElementById('biru-kontingen'),
    biruSkor: document.getElementById('biru-skor'),
    biruHukuman: document.getElementById('biru-hukuman'),
    poinIndicator: document.getElementById('poin-indicator'),
    poinText: document.getElementById('poin-text'),
    winnerOverlay: document.getElementById('winner-overlay'),
    winnerName: document.getElementById('winner-name'),
    winnerMethod: document.getElementById('winner-method'),
};

const hukumanCount = { merah: {}, biru: {} };

function pad(n) { return String(n).padStart(2, '0'); }

function renderHukuman(sudut) {
    const counts = hukumanCount[sudut];
    const labels = { teguran1: 'T1', teguran2: 'T2', peringatan1: 'P1', peringatan2: 'P2' };
    const parts = Object.keys(labels)
        .filter((k) => counts[k])
        .map((k) => `${labels[k]}:${counts[k]}`);
    const target = sudut === 'merah' ? el.merahHukuman : el.biruHukuman;
    target.textContent = parts.join(' | ');
}

async function loadActiveMatch() {
    const res = await fetch('/api/matches/status/active');
    const match = await res.json();
    if (!match) {
        el.noMatch.classList.remove('hidden');
        el.content.classList.add('hidden');
        el.winnerOverlay.classList.add('hidden');
        currentMatch = null;
        return;
    }
    currentMatch = match;
    hukumanCount.merah = {};
    hukumanCount.biru = {};
    el.noMatch.classList.add('hidden');
    el.content.classList.remove('hidden');
    el.winnerOverlay.classList.add('hidden');

    el.kelas.textContent = `${match.kelas || ''} ${match.nomor_partai ? '- ' + match.nomor_partai : ''}`.trim() || 'PENCAK SILAT';
    el.round.textContent = match.round_berjalan;
    el.merahNama.textContent = match.merah_nama;
    el.merahKontingen.textContent = match.merah_kontingen || '';
    el.merahSkor.textContent = match.merah_skor;
    el.biruNama.textContent = match.biru_nama;
    el.biruKontingen.textContent = match.biru_kontingen || '';
    el.biruSkor.textContent = match.biru_skor;
    renderHukuman('merah');
    renderHukuman('biru');

    socket.emit('join_role', { role: 'display', matchId: match.id });
    socket.emit('timer:init', { matchId: match.id });
}

socket.on('connect', loadActiveMatch);
socket.on('admin:match_activated', loadActiveMatch);

socket.on('timer:update', (state) => {
    if (!currentMatch || state.matchId !== currentMatch.id) return;
    el.timer.textContent = `${pad(state.minutes)}:${pad(state.seconds)}`;
    el.timer.classList.toggle('text-red-500', state.remaining <= 10 && state.remaining > 0);
});

function flashPoin(text) {
    el.poinText.textContent = text;
    el.poinIndicator.classList.remove('hidden');
    el.poinText.classList.remove('score-pop');
    void el.poinText.offsetWidth; // restart animasi
    el.poinText.classList.add('score-pop');
    setTimeout(() => el.poinIndicator.classList.add('hidden'), 1200);
}

socket.on('score:valid_added', (d) => {
    if (!currentMatch || d.matchId !== currentMatch.id) return;
    el.merahSkor.textContent = d.merah_skor;
    el.biruSkor.textContent = d.biru_skor;
    flashPoin(`${d.sudut.toUpperCase()} +${d.poin} (${d.jenis})`);
});

socket.on('ketua:score_updated', (d) => {
    if (!currentMatch || d.matchId !== currentMatch.id) return;
    el.merahSkor.textContent = d.merah_skor;
    el.biruSkor.textContent = d.biru_skor;
    if (d.tipe === 'hukuman') {
        hukumanCount[d.sudut][d.jenis] = (hukumanCount[d.sudut][d.jenis] || 0) + 1;
        renderHukuman(d.sudut);
        flashPoin(`${d.sudut.toUpperCase()} HUKUMAN (${d.jenis})`);
    } else if (d.tipe === 'jatuhan') {
        flashPoin(`${d.sudut.toUpperCase()} JATUHAN +3`);
    }
});

socket.on('verification:request', () => flashPoin('VERIFIKASI...'));

socket.on('display:round_changed', ({ matchId, round }) => {
    if (currentMatch && matchId === currentMatch.id) {
        currentMatch.round_berjalan = round;
        el.round.textContent = round;
    }
});

socket.on('display:match_finished', (match) => {
    if (!currentMatch || match.id !== currentMatch.id) return;
    el.winnerName.textContent = match.pemenang ? `SUDUT ${match.pemenang.toUpperCase()}` : '-';
    el.winnerMethod.textContent = match.metode_menang || '';
    el.winnerOverlay.classList.remove('hidden');
});
