# Restock.id — Sistem Manajemen Stok Otomatis Berbasis Reorder Point untuk UMKM

Purwarupa aplikasi web pengendalian persediaan untuk UMKM. Sistem menghitung **Reorder Point (ROP)**, **Safety Stock (SS)**, dan **EOQ** secara otomatis dari data penjualan historis, memberi peringatan saat stok menyentuh titik pemesanan ulang, serta menyediakan modul **Pengujian** yang membandingkan metode *manual* dengan metode *ROP* untuk mendukung penelitian tugas akhir.

- Aplikasi berjalan sepenuhnya di **browser** (tampilan Bahasa Indonesia, tanpa koneksi internet).
- Data disimpan di **database SQLite** melalui server Node.js bawaan (tanpa dependency eksternal — cukup `node server.js`).
- Tersedia data contoh (13 produk, 90 hari riwayat penjualan) yang bisa di-reset kapan saja.

## Fitur

| Modul | Fungsi |
| --- | --- |
| Dashboard | Kartu ringkasan stok, peringatan ROP, grafik tren penjualan, grafik stok vs ROP |
| Produk | Kelola master produk + perhitungan detail ROP per produk |
| Transaksi | Catat stok masuk/keluar (stok otomatis ter-update), import dari CSV |
| Reorder Point | Tabel d, σd, SS, ROP, saran kuantitas pesanan per produk |
| Notifikasi | Peringatan status, draft purchase order yang bisa dicetak |
| Pengujian | Simulasi Manual vs ROP, metrik stockout/fill rate/stok & biaya, akurasi notifikasi |
| Laporan | Stok saat ini, pergerakan stok, hasil perhitungan ROP (ekspor CSV / cetak) |
| Pengaturan | Parameter sistem (service level, lead time, biaya pesan/simpan), backup JSON |

## Persyaratan

- [Node.js](https://nodejs.org) versi **24 atau lebih baru** (memakai modul bawaan `node:sqlite`).

## Cara Menjalankan

**Cara cepat (Windows):** klik dua kali `start-server.cmd`, lalu buka `http://localhost:3000` di browser.

**Manual:**
```bash
node server.js
```

Kemudian buka `http://localhost:3000`.

- Data otomatis dibuat pertama kali saat aplikasi dibuka (data contoh) dan tersimpan di `data/restock.sqlite`.
- Data tetap tersimpan meskipun browser ditutup atau server dimulai ulang.
- Untuk akses dari perangkat lain dalam satu WiFi/LAN, gunakan alamat IP yang ditampilkan saat server dijalankan (mis. `http://192.168.1.5:3000`).

## Struktur Database

Skema (di `server.js`):

| Tabel | Isi |
| --- | --- |
| `products` | master produk (sku, nama, kategori, harga, lead time, service level, stok) |
| `transactions` | riwayat masuk/keluar per produk |
| `notifications` | notifikasi pemesanan ulang beserta kuantitas yang disarankan |
| `settings` | parameter sistem (JSON) |
| `meta` | penanda urutan ID (tx, notifikasi, PO) |

Data juga dapat diekspor/impor sebagai JSON dari halaman **Pengaturan** (fitur backup untuk sidang).

## Pengujian

```bash
node test/smoke.js
```

Menjalankan 25 uji fungsional inti (perhitungan ROP/EOQ, validasi transaksi, simulasi) tanpa browser.

## Struktur Folder

```
restock-id/
├─ index.html            # antarmuka aplikasi
├─ server.js             # server Node.js + database SQLite
├─ css/style.css         # gaya
├─ js/
│  ├─ app-data.js        # data contoh & konfigurasi default
│  ├─ app-calc.js        # rumus statistik, ROP, EOQ, simulasi
│  ├─ app-store.js       # state aplikasi + sinkronisasi ke database
│  ├─ app-ui.js          # helper antarmuka, grafik SVG, cetak
│  ├─ app-pages.js       # renderer halaman & aksi
│  └─ app-main.js        # inisialisasi
├─ test/smoke.js         # uji fungsional
└─ data/                 # database SQLite (dibuat otomatis, tidak ikut version control)
```

## Lisensi

MIT — bebas dipakai untuk keperluan penelitian dan uji coba.