const socket = io();

const params = new URLSearchParams(window.location.search);
const juriId = parseInt(params.get('id'), 10) || 1;
document.getElementById('juri-id').textContent = juriId;

let currentMatch = null;
let activeVerification = null;

const el = {
    noMatch: document.getElementById('no-match'),
    content: document.getElementById('content'),
    title: document.getElementById('match-title'),
    timer: document.getElementById('timer-display'),
    timerStatus: document.getElementById('timer-status'),
    verifModal: document.getElementById('verif-modal'),
    verifTipe: document.getElementById('verif-tipe'),
    verifVoted: document.getElementById('verif-voted'),
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
    el.title.textContent = `${match.merah_nama} vs ${match.biru_nama} | Babak ${match.round_berjalan}`;

    socket.emit('join_role', { role: 'juri', matchId: match.id, juriId });
    socket.emit('timer:sync', { matchId: match.id });
}

socket.on('connect', loadActiveMatch);
socket.on('admin:match_activated', loadActiveMatch);
socket.on('timer:update', (state) => {
    if (!currentMatch || state.matchId !== currentMatch.id) return;
    el.timer.textContent = `${String(state.minutes).padStart(2, '0')}:${String(state.seconds).padStart(2, '0')}`;
    el.timer.classList.toggle('text-red-300', state.remaining <= 10 && state.remaining > 0);
    el.timerStatus.textContent = state.running ? 'BERJALAN' : (state.remaining === 0 ? 'SELESAI' : 'JEDA');
    el.timerStatus.className = `text-xs ${state.running ? 'text-emerald-300' : state.remaining === 0 ? 'text-red-300' : 'text-amber-300'}`;
});
socket.on('timer:finished', (state) => {
    if (currentMatch && state.matchId === currentMatch.id) el.timerStatus.textContent = 'SELESAI';
});

// Tombol input nilai
document.querySelectorAll('.score-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (!currentMatch) return;
        const { sudut, jenis } = btn.dataset;

        // Feedback visual instan (belum tentu sah, hanya indikasi tombol ditekan)
        btn.classList.add(sudut === 'merah' ? 'flash-red' : 'flash-blue');
        setTimeout(() => btn.classList.remove('flash-red', 'flash-blue'), 400);
        if (navigator.vibrate) navigator.vibrate(50);

        socket.emit('juri:press_button', {
            matchId: currentMatch.id,
            juriId,
            sudut,
            jenis,
            round: currentMatch.round_berjalan,
        });
    });
});

// Reset sesi input (dipicu dari Timer: "Refresh Juri" atau ganti babak)
socket.on('juri:session_reset', ({ matchId }) => {
    if (currentMatch && matchId === currentMatch.id) {
        // Tidak ada state lokal signifikan untuk direset selain feedback visual;
        // server-side buffer sudah dibersihkan.
        console.log('[Juri] Sesi direset oleh Dewan 1.');
    }
});

socket.on('display:round_changed', ({ matchId, round }) => {
    if (currentMatch && matchId === currentMatch.id) {
        currentMatch.round_berjalan = round;
        el.title.textContent = `${currentMatch.merah_nama} vs ${currentMatch.biru_nama} | Babak ${round}`;
    }
});

// ===== VERIFIKASI =====
socket.on('verification:request', (verification) => {
    if (!currentMatch || verification.match_id !== currentMatch.id) return;
    activeVerification = verification;
    el.verifTipe.textContent = `Tipe: ${verification.tipe.toUpperCase()} — Babak ${verification.round}`;
    el.verifVoted.classList.add('hidden');
    document.querySelectorAll('.verif-btn').forEach((b) => b.classList.remove('hidden'));
    el.verifModal.classList.remove('hidden');
});

document.querySelectorAll('.verif-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (!activeVerification) return;
        socket.emit('juri:submit_verification', {
            verificationId: activeVerification.id,
            juriId,
            vote: btn.dataset.vote,
        });
        document.querySelectorAll('.verif-btn').forEach((b) => b.classList.add('hidden'));
        el.verifVoted.classList.remove('hidden');
    });
});

socket.on('verification:closed', ({ matchId }) => {
    if (currentMatch && matchId === currentMatch.id) {
        el.verifModal.classList.add('hidden');
        activeVerification = null;
    }
});
