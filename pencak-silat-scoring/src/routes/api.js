const express = require('express');
const db = require('../db/database');
const timerManager = require('../logic/timerManager');

function createApiRouter(io) {
    const router = express.Router();

    // ---------- MATCHES (Partai) ----------

    // GET semua partai
    router.get('/matches', (req, res) => {
        const rows = db.prepare('SELECT * FROM matches ORDER BY id DESC').all();
        res.json(rows);
    });

    // GET satu partai + detail skor/hukuman
    router.get('/matches/:id', (req, res) => {
        const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
        if (!match) return res.status(404).json({ error: 'Partai tidak ditemukan' });

        const scoreLog = db
            .prepare('SELECT * FROM score_log WHERE match_id = ? ORDER BY id DESC')
            .all(req.params.id);
        const penaltyLog = db
            .prepare('SELECT * FROM penalty_log WHERE match_id = ? ORDER BY id DESC')
            .all(req.params.id);

        res.json({ ...match, scoreLog, penaltyLog });
    });

    // GET partai yang sedang aktif (dipakai oleh /timer, /juri, /ketua, /display saat load)
    router.get('/matches/status/active', (req, res) => {
        const match = db
            .prepare("SELECT * FROM matches WHERE status = 'aktif' ORDER BY id DESC LIMIT 1")
            .get();
        res.json(match || null);
    });

    // POST buat partai baru
    router.post('/matches', (req, res) => {
        const {
            nomor_partai, kelas, babak_max, durasi_round,
            merah_nama, merah_kontingen, biru_nama, biru_kontingen,
        } = req.body;

        if (!merah_nama || !biru_nama || !durasi_round) {
            return res.status(400).json({ error: 'merah_nama, biru_nama, dan durasi_round wajib diisi' });
        }

        const stmt = db.prepare(`
            INSERT INTO matches (nomor_partai, kelas, babak_max, durasi_round,
                merah_nama, merah_kontingen, biru_nama, biru_kontingen, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')
        `);
        const info = stmt.run(
            nomor_partai || null, kelas || null, babak_max || 3, durasi_round,
            merah_nama, merah_kontingen || null, biru_nama, biru_kontingen || null
        );
        const created = db.prepare('SELECT * FROM matches WHERE id = ?').get(info.lastInsertRowid);
        io.emit('admin:matches_updated');
        res.status(201).json(created);
    });

    // PUT edit partai
    router.put('/matches/:id', (req, res) => {
        const existing = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Partai tidak ditemukan' });

        const fields = [
            'nomor_partai', 'kelas', 'babak_max', 'durasi_round',
            'merah_nama', 'merah_kontingen', 'biru_nama', 'biru_kontingen',
        ];
        const updates = [];
        const values = [];
        for (const f of fields) {
            if (req.body[f] !== undefined) {
                updates.push(`${f} = ?`);
                values.push(req.body[f]);
            }
        }
        if (updates.length === 0) return res.json(existing);

        values.push(req.params.id);
        db.prepare(`UPDATE matches SET ${updates.join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`).run(...values);
        const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
        io.emit('admin:matches_updated');
        res.json(updated);
    });

    // POST aktifkan partai (jadikan "sedang berjalan di gelanggang")
    router.post('/matches/:id/activate', (req, res) => {
        const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
        if (!match) return res.status(404).json({ error: 'Partai tidak ditemukan' });

        // Nonaktifkan partai aktif lain (hanya 1 partai aktif dalam satu waktu di gelanggang ini)
        db.prepare("UPDATE matches SET status = 'draft' WHERE status = 'aktif'").run();
        db.prepare(`
            UPDATE matches SET status = 'aktif', round_berjalan = 1,
                merah_skor = 0, biru_skor = 0, pemenang = NULL, metode_menang = NULL
            WHERE id = ?
        `).run(req.params.id);

        const activated = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
        const timerState = timerManager.init(activated.id, activated.durasi_round, activated.round_berjalan);
        io.emit('admin:match_activated', activated);
        io.emit('timer:update', timerState);
        res.json(activated);
    });

    // POST selesaikan partai
    router.post('/matches/:id/finish', (req, res) => {
        const { pemenang, metode_menang } = req.body;
        db.prepare(`
            UPDATE matches SET status = 'selesai', pemenang = ?, metode_menang = ?,
                updated_at = datetime('now','localtime')
            WHERE id = ?
        `).run(pemenang || null, metode_menang || null, req.params.id);

        const finished = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
        io.emit('admin:match_finished', finished);
        io.emit('display:match_finished', finished);
        res.json(finished);
    });

    // DELETE partai
    router.delete('/matches/:id', (req, res) => {
        db.prepare('DELETE FROM matches WHERE id = ?').run(req.params.id);
        io.emit('admin:matches_updated');
        res.json({ success: true });
    });

    return router;
}

module.exports = createApiRouter;
