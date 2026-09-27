const socket = io();
let currentMatch = null;
let activeVerification = null;

const el = {
    noMatch: document.getElementById('no-match'),
    content: document.getElementById('content'),
    title: document.getElementById('match-title'),
    round: document.getElementById('round-label'),
    timer: document.getElementById('timer-display'),
    timerStatus: document.getElementById('timer-status'),
    skorMerah: document.getElementById('skor-merah'),
    skorBiru: document.getElementById('skor-biru'),
    verifPanel: document.getElementById('verif-panel'),
    verifStatus: document.getElementById('verif-status'),
    rekomendasi: document.getElementById('rekomendasi'),
};

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
    updateScoreDisplay(match.merah_skor, match.biru_skor);

    socket.emit('join_role', { role: 'ketua', matchId: match.id });
    socket.emit('timer:sync', { matchId: match.id });
}

function updateScoreDisplay(merah, biru) {
    el.skorMerah.textContent = merah;
    el.skorBiru.textContent = biru;
    if (currentMatch) {
        currentMatch.merah_skor = merah;
        currentMatch.biru_skor = biru;
    }
    if (merah > biru) el.rekomendasi.textContent = 'Rekomendasi otomatis: Sudut MERAH unggul poin';
    else if (biru > merah) el.rekomendasi.textContent = 'Rekomendasi otomatis: Sudut BIRU unggul poin';
    else el.rekomendasi.textContent = 'Rekomendasi otomatis: Skor SERI — perlu penentuan lain';
}

socket.on('connect', loadActiveMatch);
socket.on('admin:match_activated', loadActiveMatch);
socket.on('timer:update', (state) => {
    if (!currentMatch || state.matchId !== currentMatch.id) return;
    el.timer.textContent = `${String(state.minutes).padStart(2, '0')}:${String(state.seconds).padStart(2, '0')}`;
    el.timer.classList.toggle('text-red-600', state.remaining <= 10 && state.remaining > 0);
    el.timerStatus.textContent = state.running ? 'BERJALAN' : (state.remaining === 0 ? 'SELESAI' : 'JEDA');
    el.timerStatus.className = `text-xs ${state.running ? 'text-emerald-300' : state.remaining === 0 ? 'text-red-300' : 'text-amber-300'}`;
});
socket.on('timer:finished', (state) => {
    if (currentMatch && state.matchId === currentMatch.id) el.timerStatus.textContent = 'SELESAI';
});
socket.on('score:valid_added', (d) => {
    if (currentMatch && d.matchId === currentMatch.id) updateScoreDisplay(d.merah_skor, d.biru_skor);
});
socket.on('ketua:score_updated', (d) => {
    if (currentMatch && d.matchId === currentMatch.id) updateScoreDisplay(d.merah_skor, d.biru_skor);
});

// Hukuman
document.querySelectorAll('.hukuman-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (!currentMatch) return;
        const { sudut, jenis } = btn.dataset;
        socket.emit('ketua:add_hukuman', { matchId: currentMatch.id, sudut, jenis, round: currentMatch.round_berjalan });
    });
});

// Jatuhan
document.querySelectorAll('.jatuhan-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (!currentMatch) return;
        const { sudut } = btn.dataset;
        if (!confirm(`Konfirmasi jatuhan +3 untuk sudut ${sudut.toUpperCase()}?`)) return;
        socket.emit('ketua:add_jatuhan', { matchId: currentMatch.id, sudut, round: currentMatch.round_berjalan });
    });
});

// ===== VERIFIKASI =====
document.querySelectorAll('.trigger-verif-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (!currentMatch) return;
        const tipe = btn.dataset.tipe;
        socket.emit('ketua:trigger_verification', { matchId: currentMatch.id, tipe, round: currentMatch.round_berjalan });
    });
});

socket.on('verification:request', (verification) => {
    if (!currentMatch || verification.match_id !== currentMatch.id) return;
    activeVerification = verification;
    el.verifPanel.classList.remove('hidden');
    el.verifStatus.textContent = `Verifikasi "${verification.tipe}" dikirim ke juri. Menunggu vote...`;
    ['1', '2', '3'].forEach((id) => (document.getElementById(`vote-${id}`).textContent = '-'));
});

socket.on('verification:tally_update', (data) => {
    if (!activeVerification || data.verificationId !== activeVerification.id) return;
    data.votes.forEach((v) => {
        const cell = document.getElementById(`vote-${v.juri_id}`);
        if (cell) cell.textContent = v.vote.toUpperCase();
    });
    el.verifStatus.textContent = `Vote masuk: ${data.votes.length}/3 juri.`;
});

document.querySelectorAll('.confirm-verif-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (!activeVerification) return;
        const hasil_final = btn.dataset.hasil;
        const terapkan_skor = document.getElementById('terapkan-skor-jatuhan').checked && activeVerification.tipe === 'jatuhan';
        socket.emit('ketua:confirm_verification', {
            verificationId: activeVerification.id,
            hasil_final,
            terapkan_skor,
            poin: 3,
        });
    });
});

document.getElementById('cancel-verif-btn').addEventListener('click', () => {
    if (!activeVerification) return;
    socket.emit('ketua:cancel_verification', { verificationId: activeVerification.id });
});

socket.on('verification:closed', (data) => {
    if (!currentMatch || data.matchId !== currentMatch.id) return;
    el.verifPanel.classList.add('hidden');
    activeVerification = null;
    if (data.merah_skor !== undefined) updateScoreDisplay(data.merah_skor, data.biru_skor);
});

// ===== PEMENANG =====
document.getElementById('submit-winner-btn').addEventListener('click', () => {
    if (!currentMatch) return;
    const pemenang = document.getElementById('pemenang-select').value;
    const metode_menang = document.getElementById('metode-select').value;
    if (!confirm(`Sahkan ${pemenang.toUpperCase()} sebagai pemenang (${metode_menang})? Partai akan ditutup.`)) return;
    socket.emit('ketua:set_winner', { matchId: currentMatch.id, pemenang, metode_menang });
});

socket.on('match:winner_set', (match) => {
    alert(`Partai selesai. Pemenang: ${match.pemenang?.toUpperCase()} (${match.metode_menang})`);
    loadActiveMatch();
});
