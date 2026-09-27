/**
 * ALGORITMA MATCH VALUE (2-JURI RULE)
 * ------------------------------------
 * Setiap kali seorang juri menekan tombol nilai, tekanan itu dicatat
 * sementara di buffer memory (per pertandingan). Nilai baru dianggap SAH
 * hanya jika minimal 2 dari 3 juri menekan tombol JENIS & SUDUT yang sama
 * dalam rentang waktu toleransi (WINDOW_MS).
 *
 * Buffer disimpan per matchId agar beberapa gelanggang/partai bisa
 * berjalan independen (walau umumnya cuma 1 partai aktif).
 */

const WINDOW_MS = 2000; // rentang toleransi 2 detik (bisa disetel 1.5 - 2 detik)

// Poin per jenis pukulan/tendangan
const POIN_JENIS = {
    pukulan: 1,
    tendangan: 2,
};

// Struktur: Map<matchId, Array<{ juriId, sudut, jenis, timestamp }>>
const buffers = new Map();

function getBuffer(matchId) {
    if (!buffers.has(matchId)) {
        buffers.set(matchId, []);
    }
    return buffers.get(matchId);
}

/**
 * Buang entri yang sudah lewat window toleransi.
 */
function pruneBuffer(matchId, now = Date.now()) {
    const buf = getBuffer(matchId);
    const fresh = buf.filter((entry) => now - entry.timestamp <= WINDOW_MS);
    buffers.set(matchId, fresh);
    return fresh;
}

/**
 * Proses satu tekanan tombol dari juri.
 * Return:
 *   { valid: false } jika belum ada mayoritas (2 dari 3),
 *   { valid: true, sudut, jenis, poin, juriIds, round } jika sah dan sudah dikonsumsi dari buffer.
 */
function registerPress({ matchId, juriId, sudut, jenis, round }) {
    const now = Date.now();
    let buf = pruneBuffer(matchId, now);

    // Cegah juri yang sama menekan dobel untuk kombinasi sudut+jenis yang identik
    // dalam window yang sama (hindari 1 juri "mencurangi" sistem dengan spam klik).
    const alreadyPressed = buf.some(
        (e) => e.juriId === juriId && e.sudut === sudut && e.jenis === jenis
    );
    if (!alreadyPressed) {
        buf.push({ juriId, sudut, jenis, round, timestamp: now });
        buffers.set(matchId, buf);
    }

    // Cari semua entri dengan kombinasi sudut+jenis yang sama, dari juri berbeda
    const matching = buf.filter((e) => e.sudut === sudut && e.jenis === jenis);
    const distinctJuriIds = [...new Set(matching.map((e) => e.juriId))];

    if (distinctJuriIds.length >= 2) {
        // SAH! Konsumsi (hapus) entri-entri ini dari buffer agar tidak trigger ulang
        const remaining = buf.filter(
            (e) => !(e.sudut === sudut && e.jenis === jenis)
        );
        buffers.set(matchId, remaining);

        return {
            valid: true,
            sudut,
            jenis,
            poin: POIN_JENIS[jenis] || 0,
            juriIds: distinctJuriIds,
            round,
        };
    }

    return { valid: false, pendingJuriIds: distinctJuriIds };
}

/**
 * Reset buffer untuk satu match (dipanggil saat "Refresh Juri" / ganti babak).
 */
function resetBuffer(matchId) {
    buffers.set(matchId, []);
}

module.exports = {
    registerPress,
    resetBuffer,
    pruneBuffer,
    WINDOW_MS,
    POIN_JENIS,
};
