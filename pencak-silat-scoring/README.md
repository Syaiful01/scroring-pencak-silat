# Digital Scoring Pertandingan Pencak Silat

Aplikasi web real-time untuk pencatatan skor pertandingan pencak silat,
berjalan di jaringan lokal (LAN) tanpa perlu internet. Server berjalan
di satu Host PC/Laptop, lalu diakses oleh perangkat lain (Tablet Juri,
Ketua, Timer, Display TV) via browser dalam jaringan WiFi/LAN yang sama.

## Struktur Proyek

```
pencak-silat-scoring/
├── server.js                  # Entry point (Express + Socket.io)
├── package.json
├── data/                      # Database SQLite (dibuat otomatis)
├── src/
│   ├── db/
│   │   ├── database.js        # Koneksi & init SQLite
│   │   └── schema.sql         # Skema tabel
│   ├── logic/
│   │   ├── juriBuffer.js      # Algoritma rule 2-juri (in-memory buffer)
│   │   └── timerManager.js    # State & broadcast timer per match
│   ├── routes/
│   │   └── api.js             # REST API (CRUD partai) untuk Admin
│   └── socket/
│       └── socketHandler.js   # Semua event Socket.io (skor, hukuman, verifikasi, dst.)
└── public/
    ├── admin/                 # /admin   - kelola partai
    ├── timer/                 # /timer   - kontrol waktu (Dewan 1)
    ├── juri/                  # /juri?id=1|2|3 - tablet juri
    ├── ketua/                 # /ketua   - hukuman, verifikasi, keputusan menang
    └── display/                # /display - layar TV/proyektor
```

## Instalasi

Pastikan Node.js versi 18+ terpasang, lalu jalankan di folder proyek:

```bash
npm install
```

> Catatan: `better-sqlite3` akan mengkompilasi native binding saat instalasi.
> Jika muncul error terkait build tools di Windows, install dulu
> `npm install --global windows-build-tools` (run as Administrator) atau
> pastikan Visual Studio Build Tools / Python sudah tersedia.

## Menjalankan Server

```bash
npm start
```

Setelah berjalan, terminal akan menampilkan sesuatu seperti:

```
========================================================
  Digital Scoring Pencak Silat - Server AKTIF
========================================================
  Lokal   : http://localhost:3000
  Jaringan: http://192.168.1.10:3000
--------------------------------------------------------
  Admin   : /admin
  Timer   : /timer
  Juri    : /juri?id=1  /juri?id=2  /juri?id=3
  Ketua   : /ketua
  Display : /display
========================================================
```

Catat alamat **Jaringan** (contoh: `192.168.1.10`) — inilah IP yang
dipakai perangkat lain untuk mengakses aplikasi.

## Setup Jaringan LAN (Wajib untuk Penggunaan Nyata)

1. **Siapkan Access Point/Router WiFi lokal** (tidak perlu koneksi internet,
   cukup jaringan lokal). Bisa juga memakai fitur *Mobile Hotspot* dari Host PC.
2. **Hubungkan semua perangkat ke jaringan WiFi yang sama**:
   Host PC (server), Tablet Juri 1/2/3, perangkat Ketua, perangkat Dewan 1 (Timer),
   dan Android TV/Smart TV/proyektor (via browser atau mini PC yang terhubung ke TV).
3. **Cari IP Address Host PC** (sudah otomatis ditampilkan di terminal saat
   `npm start`). Bisa juga dicek manual:
   - Windows: `ipconfig` → lihat "IPv4 Address"
   - Mac/Linux: `ifconfig` atau `ip addr`
4. **Akses dari tiap perangkat** menggunakan browser (Chrome/Safari/Firefox),
   ganti `192.168.1.10` dengan IP Host PC yang sebenarnya:

   | Perangkat        | URL                                      |
   |-------------------|-------------------------------------------|
   | Admin/Panitia     | `http://192.168.1.10:3000/admin`          |
   | Timer / Dewan 1   | `http://192.168.1.10:3000/timer`          |
   | Tablet Juri 1     | `http://192.168.1.10:3000/juri?id=1`      |
   | Tablet Juri 2     | `http://192.168.1.10:3000/juri?id=2`      |
   | Tablet Juri 3     | `http://192.168.1.10:3000/juri?id=3`      |
   | Ketua Pertandingan| `http://192.168.1.10:3000/ketua`          |
   | Display/TV        | `http://192.168.1.10:3000/display`        |

5. **Firewall**: jika perangkat lain tidak bisa connect, pastikan Firewall
   Host PC mengizinkan koneksi masuk pada port `3000` (untuk jaringan Private/Home).

6. Tips: gunakan aplikasi seperti **"Fully Kiosk Browser"** (Android) untuk
   menjalankan tablet Juri dalam mode kiosk fullscreen tanpa gangguan.

## Alur Penggunaan Singkat

1. Buka `/admin` di Host PC → buat partai baru (isi nama atlet, kontingen,
   kelas, durasi round).
2. Klik **"Jadikan Aktif"** pada partai yang akan bertanding.
3. Semua layar lain (Timer, Juri, Ketua, Display) otomatis memuat partai aktif.
4. Dewan 1 menekan **Mulai** di `/timer` untuk menjalankan countdown.
5. Juri 1–3 menekan tombol Pukulan/Tendangan sesuai sudut yang terlihat sah;
   poin baru tercatat otomatis jika **minimal 2 dari 3 juri** menekan
   kombinasi sudut & jenis yang sama dalam ±2 detik.
6. Ketua Pertandingan menambahkan hukuman/jatuhan langsung, memicu sesi
   verifikasi bila diperlukan, dan mengesahkan pemenang di akhir partai.
7. Display menampilkan semua informasi secara real-time untuk penonton.

## Mengubah Port

Secara default server berjalan di port `3000`. Untuk mengubahnya:

```bash
PORT=8080 npm start
```

(Windows PowerShell: `$env:PORT=8080; npm start`)
