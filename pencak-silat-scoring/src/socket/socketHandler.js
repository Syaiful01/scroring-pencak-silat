const db = require('../db/database');
const juriBuffer = require('../logic/juriBuffer');
const timerManager = require('../logic/timerManager');

// Poin hukuman (nilai negatif diberikan ke sudut pelanggar)
const POIN_HUKUMAN = {
    binaan: 0,
    teguran1: -1,
    teguran2: -2,
    peringatan1: -5,
    peringatan2: -10,
};
const POIN_JATUHAN = 3;

function getMatch(matchId) {
    return db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
}

function updateMatchScore(matchId, sudut, deltaPoin) {
    const col = sudut === 'merah' ? 'merah_skor' : 'biru_skor';
    db.prepare(`UPDATE matches SET ${col} = ${col} + ?, updated_at = datetime('now','localtime') WHERE id = ?`)
        .run(deltaPoin, matchId);
    return getMatch(matchId);
}

function registerSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log(`[Socket] Client terhubung: ${socket.id}`);

        // Client memberi tahu role-nya agar bisa join room khusus (opsional, untuk logging)
        socket.on('join_role', ({ role, matchId, juriId }) => {
            socket.data.role = role;
            socket.data.juriId = juriId;
            if (matchId) socket.join(`match:${matchId}`);
            console.log(`[Socket] ${socket.id} join sebagai ${role}${juriId ? ' #' + juriId : ''}`);
        });

        // ================= TIMER (Dewan 1) =================

        socket.on('timer:init', ({ matchId }) => {
            const match = getMatch(matchId);
            if (!match) return;
            const state = timerManager.ensure(matchId, match.durasi_round, match.round_berjalan);
            socket.emit('timer:update', state);
        });

        socket.on('timer:sync', ({ matchId }) => {
            const match = getMatch(matchId);
            if (!match) return;
            socket.emit('timer:update', timerManager.ensure(matchId, match.durasi_round, match.round_berjalan));
        });

        socket.on('timer:start', ({ matchId }) => {
            const state = timerManager.start(
                matchId,
                (tickState) => io.emit('timer:update', tickState),
                (finishState) => io.emit('timer:finished', finishState)
            );
            io.emit('timer:update', state);
        });

        socket.on('timer:pause', ({ matchId }) => {
            const state = timerManager.pause(matchId);
            io.emit('timer:update', state);
        });

        socket.on('timer:reset', ({ matchId }) => {
            const state = timerManager.reset(matchId);
            io.emit('timer:update', state);
        });

        // Lanjut ke round berikutnya
        socket.on('timer:next_round', ({ matchId }) => {
            const match = getMatch(matchId);
            if (!match) return;
            const nextRound = Math.min(match.round_berjalan + 1, match.babak_max);
            db.prepare("UPDATE matches SET round_berjalan = ? WHERE id = ?").run(nextRound, matchId);
            const state = timerManager.init(matchId, match.durasi_round, nextRound);
            juriBuffer.resetBuffer(matchId);
            io.emit('timer:update', state);
            io.emit('juri:session_reset', { matchId, round: nextRound });
            io.emit('display:round_changed', { matchId, round: nextRound });
        });

        // Tombol "Refresh Juri" - reset input tablet juri (mis. saat ganti partai/babak)
        socket.on('timer:refresh_juri', ({ matchId }) => {
            juriBuffer.resetBuffer(matchId);
            io.emit('juri:session_reset', { matchId });
        });

        // ================= JURI (Tablet 1,2,3) =================

        socket.on('juri:press_button', ({ matchId, juriId, sudut, jenis, round }) => {
            const match = getMatch(matchId);
            if (!match || match.status !== 'aktif') return;

            const result = juriBuffer.registerPress({ matchId, juriId, sudut, jenis, round: round || match.round_berjalan });

            if (result.valid) {
                // SAH: simpan ke DB & broadcast skor
                db.prepare(`
                    INSERT INTO score_log (match_id, round, sudut, jenis, poin, sumber, juri_ids)
                    VALUES (?, ?, ?, ?, ?, 'juri', ?)
                `).run(matchId, result.round, result.sudut, result.jenis, result.poin, JSON.stringify(result.juriIds));

                const updatedMatch = updateMatchScore(matchId, result.sudut, result.poin);

                io.emit('score:valid_added', {
                    matchId,
                    sudut: result.sudut,
                    jenis: result.jenis,
                    poin: result.poin,
                    juriIds: result.juriIds,
                    round: result.round,
                    merah_skor: updatedMatch.merah_skor,
                    biru_skor: updatedMatch.biru_skor,
                });
            } else {
                // Belum mayoritas — beri tahu tablet juri lain bahwa ada 1 vote pending
                // (opsional, untuk indikator visual "menunggu juri lain")
                io.emit('juri:vote_pending', {
                    matchId,
                    sudut,
                    jenis,
                    pendingJuriIds: result.pendingJuriIds,
                });
            }
        });

        // Juri mengirim vote saat sesi verifikasi aktif
        socket.on('juri:submit_verification', ({ verificationId, juriId, vote }) => {
            const verif = db.prepare('SELECT * FROM verifications WHERE id = ?').get(verificationId);
            if (!verif || verif.status !== 'menunggu') return;

            db.prepare(`
                INSERT INTO verification_votes (verification_id, juri_id, vote)
                VALUES (?, ?, ?)
                ON CONFLICT(verification_id, juri_id) DO UPDATE SET vote = excluded.vote, timestamp = datetime('now','localtime')
            `).run(verificationId, juriId, vote);

            const votes = db.prepare('SELECT juri_id, vote FROM verification_votes WHERE verification_id = ?').all(verificationId);
            const counts = votes.reduce((acc, v) => {
                acc[v.vote] = (acc[v.vote] || 0) + 1;
                return acc;
            }, {});

            io.emit('verification:tally_update', {
                verificationId,
                matchId: verif.match_id,
                votes,
                counts,
            });
        });

        // ================= KETUA PERTANDINGAN =================

        // Hukuman/pelanggaran - eksekusi langsung tanpa aturan 2-juri
        socket.on('ketua:add_hukuman', ({ matchId, sudut, jenis, round }) => {
            const match = getMatch(matchId);
            if (!match) return;
            const poin = POIN_HUKUMAN[jenis];
            if (poin === undefined) return;

            db.prepare(`
                INSERT INTO penalty_log (match_id, round, sudut, jenis, poin)
                VALUES (?, ?, ?, ?, ?)
            `).run(matchId, round || match.round_berjalan, sudut, jenis, poin);

            const updatedMatch = poin !== 0 ? updateMatchScore(matchId, sudut, poin) : match;

            io.emit('ketua:score_updated', {
                matchId,
                sudut,
                jenis,
                poin,
                round: round || match.round_berjalan,
                merah_skor: updatedMatch.merah_skor,
                biru_skor: updatedMatch.biru_skor,
                tipe: 'hukuman',
            });
        });

        // Jatuhan (+3 untuk penjatuh) - eksekusi langsung
        socket.on('ketua:add_jatuhan', ({ matchId, sudut, round }) => {
            const match = getMatch(matchId);
            if (!match) return;

            db.prepare(`
                INSERT INTO score_log (match_id, round, sudut, jenis, poin, sumber)
                VALUES (?, ?, ?, 'jatuhan', ?, 'ketua')
            `).run(matchId, round || match.round_berjalan, sudut, POIN_JATUHAN);

            const updatedMatch = updateMatchScore(matchId, sudut, POIN_JATUHAN);

            io.emit('ketua:score_updated', {
                matchId,
                sudut,
                jenis: 'jatuhan',
                poin: POIN_JATUHAN,
                round: round || match.round_berjalan,
                merah_skor: updatedMatch.merah_skor,
                biru_skor: updatedMatch.biru_skor,
                tipe: 'jatuhan',
            });
        });

        // Ketua memicu verifikasi ke seluruh layar juri
        socket.on('ketua:trigger_verification', ({ matchId, tipe, round }) => {
            const match = getMatch(matchId);
            if (!match) return;

            const info = db.prepare(`
                INSERT INTO verifications (match_id, round, tipe, status)
                VALUES (?, ?, ?, 'menunggu')
            `).run(matchId, round || match.round_berjalan, tipe || 'umum');

            const verification = db.prepare('SELECT * FROM verifications WHERE id = ?').get(info.lastInsertRowid);

            io.emit('verification:request', verification);
        });

        // Ketua konfirmasi hasil akhir verifikasi (menutup sesi, opsional terapkan skor)
        socket.on('ketua:confirm_verification', ({ verificationId, hasil_final, terapkan_skor, poin }) => {
            const verif = db.prepare('SELECT * FROM verifications WHERE id = ?').get(verificationId);
            if (!verif) return;

            db.prepare(`
                UPDATE verifications SET status = 'selesai', hasil_final = ?, closed_at = datetime('now','localtime')
                WHERE id = ?
            `).run(hasil_final, verificationId);

            let updatedMatch = getMatch(verif.match_id);

            // Jika ketua memilih menerapkan skor hasil verifikasi (mis. jatuhan sah untuk sudut X)
            if (terapkan_skor && (hasil_final === 'merah' || hasil_final === 'biru') && poin) {
                db.prepare(`
                    INSERT INTO score_log (match_id, round, sudut, jenis, poin, sumber)
                    VALUES (?, ?, ?, 'verifikasi', ?, 'ketua')
                `).run(verif.match_id, verif.round, hasil_final, poin);
                updatedMatch = updateMatchScore(verif.match_id, hasil_final, poin);
            }

            io.emit('verification:closed', {
                verificationId,
                matchId: verif.match_id,
                hasil_final,
                merah_skor: updatedMatch.merah_skor,
                biru_skor: updatedMatch.biru_skor,
            });
        });

        socket.on('ketua:cancel_verification', ({ verificationId }) => {
            const verif = db.prepare('SELECT * FROM verifications WHERE id = ?').get(verificationId);
            if (!verif) return;
            db.prepare("UPDATE verifications SET status = 'dibatalkan', closed_at = datetime('now','localtime') WHERE id = ?").run(verificationId);
            io.emit('verification:closed', { verificationId, matchId: verif.match_id, hasil_final: null, dibatalkan: true });
        });

        // Keputusan pemenang (rekomendasi otomatis dihitung di client dari skor, ini untuk override/final submit)
        socket.on('ketua:set_winner', ({ matchId, pemenang, metode_menang }) => {
            db.prepare(`
                UPDATE matches SET pemenang = ?, metode_menang = ?, status = 'selesai',
                    updated_at = datetime('now','localtime')
                WHERE id = ?
            `).run(pemenang, metode_menang, matchId);

            const match = getMatch(matchId);
            io.emit('match:winner_set', match);
            io.emit('display:match_finished', match);
        });

        // ================= DISPLAY =================

        socket.on('display:request_state', ({ matchId }) => {
            const match = getMatch(matchId);
            if (match) {
                socket.emit('display:full_state', {
                    match,
                    timer: timerManager.publicState(matchId),
                });
            }
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] Client terputus: ${socket.id}`);
        });
    });
}

module.exports = registerSocketHandlers;
