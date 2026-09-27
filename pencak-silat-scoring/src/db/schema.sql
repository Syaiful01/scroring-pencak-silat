-- ============================================================
-- SKEMA DATABASE: Digital Scoring Pencak Silat
-- ============================================================

-- Tabel pertandingan/partai
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nomor_partai TEXT,
    kelas TEXT,                        -- kelas tanding (mis. Kelas A Putra)
    babak_max INTEGER DEFAULT 3,       -- jumlah round (biasanya 3)
    durasi_round INTEGER NOT NULL,     -- durasi tiap round dalam detik

    merah_nama TEXT NOT NULL,
    merah_kontingen TEXT,
    biru_nama TEXT NOT NULL,
    biru_kontingen TEXT,

    status TEXT NOT NULL DEFAULT 'draft', -- draft | aktif | selesai
    round_berjalan INTEGER DEFAULT 1,

    merah_skor INTEGER DEFAULT 0,
    biru_skor INTEGER DEFAULT 0,

    pemenang TEXT,                     -- 'merah' | 'biru' | NULL
    metode_menang TEXT,                -- Angka | Teknik | Diskualifikasi | Mutlak | RSC | WO

    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Log setiap poin yang SAH masuk (hasil rule 2-juri ATAU input ketua langsung)
CREATE TABLE IF NOT EXISTS score_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    sudut TEXT NOT NULL,               -- 'merah' | 'biru'
    jenis TEXT NOT NULL,               -- 'pukulan' | 'tendangan' | 'jatuhan'
    poin INTEGER NOT NULL,
    sumber TEXT NOT NULL,              -- 'juri' (2-juri rule) | 'ketua'
    juri_ids TEXT,                     -- JSON array id juri yang menyepakati (jika sumber=juri)
    timestamp TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Log hukuman / pelanggaran (input langsung oleh Ketua Pertandingan)
CREATE TABLE IF NOT EXISTS penalty_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    sudut TEXT NOT NULL,               -- sudut yang dikenai hukuman
    jenis TEXT NOT NULL,               -- binaan | teguran1 | teguran2 | peringatan1 | peringatan2
    poin INTEGER NOT NULL,             -- nilai negatif (0, -1, -2, -5, -10)
    timestamp TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Sesi verifikasi (dipicu Ketua Pertandingan, divote oleh juri)
CREATE TABLE IF NOT EXISTS verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    tipe TEXT NOT NULL,                -- 'jatuhan' | 'pelanggaran' | 'umum'
    status TEXT NOT NULL DEFAULT 'menunggu', -- menunggu | selesai | dibatalkan
    hasil_final TEXT,                  -- 'merah' | 'biru' | 'invalid' (dikonfirmasi ketua)
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    closed_at TEXT
);

-- Vote masing-masing juri dalam satu sesi verifikasi
CREATE TABLE IF NOT EXISTS verification_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    verification_id INTEGER NOT NULL REFERENCES verifications(id) ON DELETE CASCADE,
    juri_id INTEGER NOT NULL,          -- 1, 2, atau 3
    vote TEXT NOT NULL,                -- 'merah' | 'biru' | 'invalid'
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    UNIQUE(verification_id, juri_id)
);

CREATE INDEX IF NOT EXISTS idx_score_log_match ON score_log(match_id);
CREATE INDEX IF NOT EXISTS idx_penalty_log_match ON penalty_log(match_id);
CREATE INDEX IF NOT EXISTS idx_verifications_match ON verifications(match_id);
