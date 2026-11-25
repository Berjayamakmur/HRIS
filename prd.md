# PRD & MASTER CONTEXT: HRIS DIGITAL — PT. BERJAYA MAKMUR INDONESIA

> Dokumen ini merupakan **Single Source of Truth** resmi yang disusun mengikuti standar rekayasa **ZettBOT v4.1**.
> Terdiri dari **Zona Atas (Blueprint Produk)** dan **Zona Bawah (Master Context & Logika Terkini)**.

---

# ==============================================================================
# ZONA ATAS: SPESIFIKASI KEBUTUHAN PRODUK (BLUEPRINT AWAL)
# ==============================================================================

## 1. Nama Projek & Problem Statement
- **Nama Aplikasi:** HRIS Digital — **PT. BERJAYA MAKMUR INDONESIA**
- **Masalah yang Diselesaikan:**
  1. Pencatatan absensi karyawan masih rawan titip absen, lokasi tidak terverifikasi, dan kamera live browser sering diblokir pada perangkat mobile.
  2. Pengajuan cuti, ijin, sakit, serta lembur masih manual sehingga HRD kesulitan memantau status approval dan rekapitulasi bulanan.
  3. Pembuatan laporan rekap absensi siap cetak (berkop surat + TTD) dan distribusi slip gaji ke seluruh karyawan memakan waktu lama.
- **Solusi:** Aplikasi web HRIS responsif (*Mobile-First* untuk karyawan di HP dan *Dashboard Monitoring* bergaya modern bersih untuk Admin di Laptop) yang memisahkan frontend (GitHub Pages / Vercel) agar sensor kamera native HP & GPS berjalan mulus tanpa hambatan *iframe*, serta backend **Google Apps Script + Google Sheets + Google Drive** yang gratis, aman, dan terpusat.

---

## 2. Peran Pengguna (User Roles)
1. **Admin / HRD:**
   - Memantau dashboard ringkasan kehadiran, keterlambatan, tren mingguan/bulanan, pengajuan pending (badge notifikasi), dan aktivitas terbaru karyawan secara real-time.
   - Mengelola akun karyawan (Tambah, Edit, Reset Password, Aktif/Nonaktif, Upload/Ganti Foto Profil) melalui Web App.
   - Mengatur titik koordinat lokasi kantor & radius absensi interaktif menggunakan peta **Leaflet.js** (geser pin, tombol *Gunakan Lokasi Saat Ini*, slider radius meter).
   - Mengatur jam kerja baku, toleransi keterlambatan, hari libur, serta Kop Surat & Penandatangan PDF (Upload Logo, Nama PT, Alamat, Nama & Jabatan Penandatangan).
   - Menyetujui atau menolak pengajuan **Cuti / Ijin / Sakit** (beserta preview lampiran file di Google Drive) dan pengajuan **Lembur**.
   - Memantau log absensi (foto selfie Google Drive, link Google Maps, jarak meter dari kantor, dan alasan jika di luar radius).
   - Mengatur nominal komponen **Slip Gaji** per karyawan per periode (Gaji Pokok, Tunjangan, Lembur, Potongan).
   - Mengunduh **Rekap Absensi PDF** (berkop surat + TTD siap print), **Export Excel/CSV**, dan **Slip Gaji PDF**.
2. **Karyawan:**
   - Login menggunakan **ID Karyawan (NIP)** dan **Password**.
   - Melakukan **Absen Masuk** dan **Absen Pulang** di HP: wajib menyalakan GPS, mengambil foto selfie menggunakan **aplikasi kamera bawaan HP** (`capture="user"`), dan wajib mengisi alasan jika terdeteksi di luar radius kantor.
   - Mengunggah & memperbarui **Foto Profil** pribadi (tersimpan ke Google Drive).
   - Mengajukan **Cuti / Ijin / Sakit** lengkap dengan upload dokumen/surat dokter ke Google Drive, serta memantau status persetujuannya.
   - Mengajukan **Lembur** dan memantau status approval Admin.
   - Melihat riwayat absensi pribadi dan mengunduh **Slip Gaji PDF** milik sendiri yang sudah diterbitkan Admin.

---

## 3. Arsitektur & Lingkungan Kerja
- **Pendekatan Arsitektur:** **Decoupled Web App (Frontend Statis + Serverless GAS Backend)**
  - **Frontend (Modular SPA Responsif):**
    - `index.html`, `styles.css`, `app.js` (dideploy ke **GitHub Pages** atau **Vercel**).
    - Kelebihan: Bebas dari pemblokiran *iframe sandbox* Google terhadap `navigator.geolocation` (GPS) dan pemanggil kamera native HP (`<input type="file" capture="user">`).
    - Library CDN ringan: **Leaflet.js** (peta radius kantor), **jsPDF + jspdf-autotable** (generator PDF Kop Surat & Slip Gaji langsung jadi file `.pdf` di HP/Laptop), **SheetJS (xlsx)** atau generator CSV (export Excel rekap), serta ikon **SVG inline** tajam bergaya human-crafted (tanpa emoji berlebihan).
  - **Backend (Google Apps Script):**
    - `code.gs`: API endpoint (`doGet` & `doPost`) dengan protokol JSON berbasis `Content-Type: text/plain;charset=utf-8` (mencegah CORS preflight failure), `LockService` anti-tabrakan, `SpreadsheetApp.flush()`, `getDisplayValues()`, dan manajemen upload file Base64 ke Google Drive.
    - `setup.gs`: Inisialisasi sheet *Safe Migrate* (idempoten, anti-underscore, sinkronisasi kolom ke kanan, seed akun Admin default & pengaturan awal hanya jika sheet masih kosong).
  - **Database & Storage:**
    - **Google Sheets** (7 Tab tanpa karakter underscore `_`).
    - **Google Drive** (Folder terstruktur otomatis: `HRIS - PT Berjaya Makmur Indonesia` dengan subfolder `FotoProfil`, `SelfieAbsensi`, `LampiranIzin`, `AssetPerusahaan`).

---

## 4. Alur Kerja Aplikasi (User Flow)
1. **Konfigurasi Awal & Login:**
   - Admin menjalankan `setupDatabase()` di `setup.gs` satu kali untuk membuat seluruh tab Sheet, folder Google Drive, dan akun Admin awal (`ADM001`).
   - User membuka URL Frontend -> Memasukkan `ID Karyawan (NIP)` & `Password` -> Backend memverifikasi hash password & status aktif -> Mengembalikan token sesi & profil user -> Masuk ke Dashboard sesuai role (Admin vs Karyawan).
2. **Alur Pengaturan Lokasi Kantor (Admin):**
   - Admin buka menu **Pengaturan -> Lokasi & Jam Kerja**.
   - Peta **Leaflet.js** tampil; Admin bisa menggeser pin marker, klik *"Gunakan Lokasi Saat Ini"*, dan mengatur radius (meter) dengan lingkaran visual real-time, lalu Simpan.
3. **Alur Absensi Selfie & GPS (Karyawan / Admin):**
   - Buka menu **Absensi** -> Sistem otomatis meminta izin & membaca GPS (`Lat, Lng`).
   - Sistem menghitung jarak (Haversine) terhadap koordinat kantor & menampilkan status instan: **Dalam Radius** (hijau) atau **Di Luar Radius** (kuning/merah).
   - Jika di luar radius, kolom **Alasan Absen Luar Radius** otomatis muncul dan wajib diisi.
   - User menekan tombol **Ambil Selfie (Kamera HP)** -> membuka kamera native HP -> foto dikompres otomatis di browser agar ringan -> dikirim bersama koordinat & link Google Maps ke backend -> backend menyimpan foto ke Google Drive dan mencatat link Drive + link Google Maps ke `LogAbsensi`.
4. **Alur Cuti / Ijin / Sakit & Lembur:**
   - Karyawan mengisi form Cuti/Ijin/Sakit (+ upload file surat dokter/pendukung) atau Form Lembur -> Foto/PDF diunggah ke Drive -> Data masuk dengan status `Pending`.
   - Badge notifikasi di Dashboard Admin bertambah -> Admin memeriksa berkas/detail -> Klik **Setujui (Approve)** atau **Tolak (Reject)** + catatan Admin.
5. **Alur Penggajian & Cetak Laporan PDF:**
   - Admin membuka menu **Slip Gaji**, memilih Periode (Bulan/Tahun) & Karyawan, mengisi rincian Gaji Pokok, Tunjangan, Uang Lembur, dan Potongan -> Simpan (status `Terbit` atau `Draft`).
   - Karyawan & Admin dapat langsung klik **Download Slip Gaji PDF** (dokumen resmi berkop surat + TTD).
   - Admin membuka menu **Rekap Absensi**, memfilter rentang tanggal / departemen / karyawan (eksekusi di backend) -> klik **Download PDF (Kop Surat + TTD)** atau **Export Excel/CSV**.

---

## 5. Desain Basis Data (Google Sheets — Tanpa Karakter `_`)

### Tab 1: `DataKaryawan`
| Indeks (`COL`) | Nama Kolom | Tipe Data | Contoh Isi |
| :--- | :--- | :--- | :--- |
| `0` (`ID`) | IDKaryawan | String (PK) | `ADM001` / `KRY-202611-001` |
| `1` (`PASSWORD_HASH`) | PasswordHash | String (SHA256) | `e3b0c44298fc...` |
| `2` (`NAMA`) | NamaLengkap | String | `Budi Santoso` |
| `3` (`ROLE`) | Role | Enum (`Admin`/`Karyawan`) | `Karyawan` |
| `4` (`JABATAN`) | Jabatan | String | `Staff Operasional` |
| `5` (`DEPARTEMEN`) | Departemen | String | `Operasional` |
| `6` (`EMAIL`) | Email | String | `budi@berjayamakmur.co.id` |
| `7` (`NO_HP`) | NoHP | String | `081234567890` |
| `8` (`FOTO_URL`) | FotoProfilURL | URL (Google Drive) | `https://drive.google.com/uc?export=view&id=...` |
| `9` (`STATUS`) | StatusAktif | Enum (`Aktif`/`Nonaktif`) | `Aktif` |
| `10` (`CREATED_AT`) | DibuatPada | Datetime String | `2026-11-25 09:00:00` |

### Tab 2: `LogAbsensi`
| Indeks (`COL`) | Nama Kolom | Tipe Data | Contoh Isi |
| :--- | :--- | :--- | :--- |
| `0` (`ID`) | IDAbsensi | String (PK) | `ABS-20261125-001` |
| `1` (`ID_KARYAWAN`) | IDKaryawan | String (FK) | `KRY-202611-001` |
| `2` (`NAMA`) | NamaKaryawan | String | `Budi Santoso` |
| `3` (`TANGGAL`) | Tanggal | Date String | `2026-11-25` |
| `4` (`TIPE`) | TipeAbsen | Enum (`Masuk`/`Pulang`) | `Masuk` |
| `5` (`WAKTU`) | WaktuAbsen | Time String | `08:04:12` |
| `6` (`STATUS_WAKTU`) | StatusKetepatan | Enum (`Tepat Waktu`/`Terlambat`/`Pulang Awal`/`Normal`) | `Tepat Waktu` |
| `7` (`LAT_LNG`) | Koordinat | String | `-6.208800, 106.845600` |
| `8` (`MAPS_URL`) | LinkGoogleMaps | URL | `https://www.google.com/maps?q=-6.208800,106.845600` |
| `9` (`JARAK_METER`) | JarakMeter | Number | `35` |
| `10` (`STATUS_LOKASI`) | StatusLokasi | Enum (`Dalam Radius`/`Luar Radius`) | `Dalam Radius` |
| `11` (`ALASAN_LUAR`) | AlasanLuarRadius | String | `Kunjungan klien di Bekasi` |
| `12` (`FOTO_URL`) | LinkFotoDrive | URL (Google Drive) | `https://drive.google.com/file/d/.../view` |
| `13` (`CREATED_AT`) | DicatatPada | Datetime String | `2026-11-25 08:04:15` |

### Tab 3: `PengajuanCuti`
| Indeks (`COL`) | Nama Kolom | Tipe Data | Contoh Isi |
| :--- | :--- | :--- | :--- |
| `0` (`ID`) | IDCuti | String (PK) | `CUT-202611-001` |
| `1` (`ID_KARYAWAN`) | IDKaryawan | String (FK) | `KRY-202611-001` |
| `2` (`NAMA`) | NamaKaryawan | String | `Budi Santoso` |
| `3` (`JENIS`) | JenisPengajuan | Enum (`Cuti`/`Ijin`/`Sakit`) | `Sakit` |
| `4` (`TGL_MULAI`) | TanggalMulai | Date String | `2026-11-26` |
| `5` (`TGL_SELESAI`) | TanggalSelesai | Date String | `2026-11-27` |
| `6` (`JUMLAH_HARI`) | JumlahHari | Number | `2` |
| `7` (`ALASAN`) | Keterangan | String | `Demam tinggi, surat dokter terlampir` |
| `8` (`FILE_URL`) | LinkLampiranDrive | URL (Google Drive) | `https://drive.google.com/file/d/.../view` |
| `9` (`STATUS`) | StatusApproval | Enum (`Pending`/`Disetujui`/`Ditolak`) | `Pending` |
| `10` (`CATATAN_ADMIN`) | CatatanAdmin | String | `Semoga lekas sembuh` |
| `11` (`APPROVER`) | DisetujuiOleh | String | `ADM001` |
| `12` (`CREATED_AT`) | DiajukanPada | Datetime String | `2026-11-25 09:15:00` |

### Tab 4: `PengajuanLembur`
| Indeks (`COL`) | Nama Kolom | Tipe Data | Contoh Isi |
| :--- | :--- | :--- | :--- |
| `0` (`ID`) | IDLembur | String (PK) | `LMB-202611-001` |
| `1` (`ID_KARYAWAN`) | IDKaryawan | String (FK) | `KRY-202611-001` |
| `2` (`NAMA`) | NamaKaryawan | String | `Budi Santoso` |
| `3` (`TANGGAL`) | TanggalLembur | Date String | `2026-11-25` |
| `4` (`JAM_MULAI`) | JamMulai | Time String | `17:30` |
| `5` (`JAM_SELESAI`) | JamSelesai | Time String | `20:30` |
| `6` (`DURASI_JAM`) | DurasiJam | Number | `3` |
| `7` (`PEKERJAAN`) | DeskripsiTugas | String | `Penyelesaian laporan stok gudang` |
| `8` (`STATUS`) | StatusApproval | Enum (`Pending`/`Disetujui`/`Ditolak`) | `Pending` |
| `9` (`CATATAN_ADMIN`) | CatatanAdmin | String | `Disetujui 3 jam` |
| `10` (`APPROVER`) | DisetujuiOleh | String | `ADM001` |
| `11` (`CREATED_AT`) | DiajukanPada | Datetime String | `2026-11-25 17:00:00` |

### Tab 5: `DataSlipGaji`
| Indeks (`COL`) | Nama Kolom | Tipe Data | Contoh Isi |
| :--- | :--- | :--- | :--- |
| `0` (`ID`) | IDSlip | String (PK) | `SLP-202611-001` |
| `1` (`PERIODE`) | PeriodeBulan | String (`YYYY-MM`) | `2026-11` |
| `2` (`ID_KARYAWAN`) | IDKaryawan | String (FK) | `KRY-202611-001` |
| `3` (`NAMA`) | NamaKaryawan | String | `Budi Santoso` |
| `4` (`JABATAN`) | Jabatan | String | `Staff Operasional` |
| `5` (`GAJI_POKOK`) | GajiPokok | Number | `5500000` |
| `6` (`TUNJANGAN`) | Tunjangan | Number | `750000` |
| `7` (`LEMBUR`) | UangLembur | Number | `350000` |
| `8` (`POTONGAN`) | Potongan | Number | `150000` |
| `9` (`TOTAL_BERSIH`) | TotalGajiBersih | Number | `6450000` |
| `10` (`CATATAN`) | CatatanSlip | String | `Termasuk tunjangan makan & transport` |
| `11` (`STATUS`) | StatusTerbit | Enum (`Terbit`/`Draft`) | `Terbit` |
| `12` (`UPDATED_AT`) | DiperbaruiPada | Datetime String | `2026-11-25 10:00:00` |

### Tab 6: `PengaturanSistem`
| Indeks (`COL`) | Nama Kolom | Tipe Data | Contoh Isi |
| :--- | :--- | :--- | :--- |
| `0` (`KUNCI`) | KeyPengaturan | String (PK) | `KANTOR_LAT` |
| `1` (`NILAI`) | NilaiPengaturan | String | `-6.208800` |
| `2` (`KETERANGAN`) | Keterangan | String | `Koordinat Latitude Kantor` |

*(Kunci standar: `NAMA_PERUSAHAAN`, `ALAMAT_PERUSAHAAN`, `KONTAK_PERUSAHAAN`, `LOGO_URL`, `TTD_NAMA`, `TTD_JABATAN`, `KANTOR_LAT`, `KANTOR_LNG`, `RADIUS_METER`, `JAM_MASUK`, `JAM_PULANG`, `TOLERANSI_MENIT`, `FOLDER_ROOT_ID`)*

### Tab 7: `HariLibur`
| Indeks (`COL`) | Nama Kolom | Tipe Data | Contoh Isi |
| :--- | :--- | :--- | :--- |
| `0` (`ID`) | IDLibur | String (PK) | `LIB-202611-001` |
| `1` (`TANGGAL`) | TanggalLibur | Date String | `2026-12-25` |
| `2` (`NAMA_LIBUR`) | NamaHariLibur | String | `Hari Raya Natal` |

---

## 6. Aturan Validasi & Logika Khusus
1. **Penomoran Sekuensial Otomatis (Anti-Tabrakan):**
   - Kode karyawan (`KRY-YYYYMM-XXX`), Absensi (`ABS-YYYYMMDD-XXX`), Cuti (`CUT-YYYYMM-XXX`), Lembur (`LMB-YYYYMM-XXX`), Slip Gaji (`SLP-YYYYMM-XXX`), Hari Libur (`LIB-YYYYMM-XXX`) dihitung di backend menggunakan `MAX + 1` pada periode aktif dan dilindungi `LockService.getScriptLock()`.
2. **Keamanan & Autentikasi:**
   - Password wajib di-hash (SHA-256 + salt tetap di Script Properties atau prefix aman) sebelum disimpan dan dibandingkan di backend. Password tidak pernah dikembalikan ke frontend.
   - Sesi login disimpan dengan token sementara bertanda tangan / `PropertiesService` atau validasi backend per request mutasi.
3. **Validasi Absensi (Kamera Native + GPS + Radius):**
   - Kamera: Menggunakan `<input type="file" accept="image/*" capture="user">` sehingga otomatis membuka kamera depan HP native (anti-blokir browser). Foto dikompres ke JPEG (maks lebar ~800px) sebelum dikirim agar cepat.
   - GPS: `navigator.geolocation.getCurrentPosition` (`enableHighAccuracy: true`) wajib berhasil sebelum tombol kirim aktif.
   - Radius: Hitung jarak Haversine antara posisi user dan `KANTOR_LAT, KANTOR_LNG`. Jika `jarak > RADIUS_METER`, kolom alasan wajib terisi minimal 5 karakter (divalidasi di frontend & backend).
   - Pencegahan duplikat: 1 karyawan hanya boleh `Masuk` 1x dan `Pulang` 1x per tanggal hari yang sama; tidak bisa `Pulang` sebelum `Masuk`.
   - Ketepatan waktu: Jika waktu `Masuk` > `JAM_MASUK + TOLERANSI_MENIT`, status = `Terlambat`; selain itu `Tepat Waktu`.
4. **Performa & Arsitektur Data:**
   - **Backend Search, Filter & Pagination (`limit`, `offset`)** untuk log absensi, daftar karyawan, cuti, lembur, dan slip gaji.
   - **Client-Side In-Memory Cache + Optimistic UI** saat perpindahan menu & tombol *Refresh Data* manual.
   - **Backend Wajib:** `SpreadsheetApp.flush()` setelah setiap mutasi, `getDisplayValues()` untuk membaca data bebas distorsi zona waktu, dan format waktu `Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss')`.

---

## 7. Rencana Antarmuka (UI / UX — Mengacu Gambar Referensi)
- **Estetika Visual (Mengadaptasi Referensi *Team Flow / Taskify*):**
  - Latar utama: Soft Mint/Slate (`#F4FAF7`), kartu putih bersih (`#FFFFFF`), sudut membulat `16px`, bayangan lembut, border tipis `#E2E8F0`.
  - Aksen warna utama: Emerald Green (`#10B981` / `#059669`), aksen pendukung: Sky Blue (`#3B82F6`), Amber (`#F59E0B`), Rose (`#EF4444`).
  - Ikon: 100% **SVG Vektor inline** seragam dan tajam.
- **Tata Letak Responsif (HP & Laptop):**
  - **Laptop (Admin & Karyawan):** Sidebar kiri elegan (Logo PT, menu navigasi, info jam kerja aktif di kartu bawah sidebar) + Topbar (Judul/pencarian cepat, ikon lonceng notifikasi dengan badge pending approval, avatar & nama/jabatan user).
  - **HP (Mobile-Friendly First):** Topbar ringkas + Bottom Navigation Bar (4 menu utama: *Beranda, Absen, Izin/Lembur, Slip Gaji*) + tombol **"Lainnya"** di kanan yang membuka drawer rapi untuk sisa menu (Rekap PDF, Karyawan, Pengaturan Map, dll).
- **Halaman & Modul Utama:**
  1. **Halaman Login:** Card bersih di tengah dengan logo perusahaan, input ID Karyawan (NIP) & Password, tombol toggle show/hide password, dan petunjuk koneksi URL API (jika pertama kali dibuka).
  2. **Dashboard Utama (Mengikuti Layout Gambar Referensi):**
     - Sapaan personal (*"Selamat Pagi, [Nama]!"*) + tanggal hari ini & filter periode (*Hari Ini / Minggu Ini / Bulan Ini*).
     - **4 Kartu Metrik Ringkas** (Grid 2 kolom di HP, 4 kolom di Laptop): Total Karyawan / Hadir Hari Ini, Tepat Waktu vs Terlambat, Pengajuan Pending (Cuti + Lembur), Status Absensi / Total Jam Lembur.
     - **Baris Tengah 3 Kolom (di Laptop):** Progres Kehadiran per Departemen (progress bar horizontal), Ringkasan Status Kehadiran (Donut/Ring Chart SVG proporsional), dan Pantauan Karyawan / Keterlambatan.
     - **Baris Bawah:** Daftar Jadwal Libur / Pengajuan Terbaru & **Activity Feed** real-time (siapa baru absen masuk/pulang, mengajukan cuti, atau lembur).
  3. **Halaman Absensi (Kamera Native + GPS):** Status GPS & jarak real-time dari kantor, tombol Selfie Kamera HP, preview foto, field Alasan jika luar radius, tombol Absen Masuk / Pulang, dan riwayat absen hari ini.
  4. **Halaman Rekap & Monitoring Absensi:** Filter tanggal/bulan, pencarian nama/NIP, status lokasi, pagination backend, tombol lihat Foto Selfie (Drive) & Lokasi (Google Maps), tombol **Download PDF (Kop Surat + TTD siap print)**, dan **Export Excel/CSV**.
  5. **Halaman Cuti / Ijin / Sakit:** Form pengajuan + upload file lampiran (foto/PDF ke Drive), daftar riwayat, dan tombol Approve / Tolak + catatan (khusus Admin).
  6. **Halaman Lembur:** Form pengajuan jam mulai–selesai + deskripsi tugas, daftar riwayat, dan tombol Approve / Tolak (khusus Admin).
  7. **Halaman Slip Gaji:** Daftar slip gaji per periode, tombol **Download Slip Gaji PDF** (berkop surat + TTD) untuk semua user; plus modal Input/Edit Nominal Gaji (Gaji Pokok, Tunjangan, Lembur, Potongan) khusus Admin.
  8. **Halaman Manajemen Karyawan (Admin) & Profil Saya (Semua User):** Tabel/kartu karyawan responsif, tambah/edit akun, reset password, aktif/nonaktifkan, serta upload/ganti Foto Profil ke Drive.
  9. **Halaman Pengaturan Sistem (Admin):**
     - Tab **Peta Radius Kantor (Leaflet.js)**: Peta interaktif geser pin, tombol *Lokasi Saat Ini*, input/slider radius meter.
     - Tab **Jam Kerja & Hari Libur**: Atur jam masuk, jam pulang, toleransi telat, dan daftar hari libur.
     - Tab **Kop Surat & TTD PDF**: Upload logo perusahaan, isi nama PT, alamat, kontak, nama & jabatan penandatangan.

---

## 8. Kriteria Pengujian (User Acceptance Checklist)
- [ ] Login berhasil untuk Admin (`ADM001`) dan Karyawan; akun nonaktif ditolak.
- [ ] Admin dapat membuat akun karyawan baru, mengedit data, mereset password, dan karyawan dapat mengganti foto profil (tersimpan di Google Drive).
- [ ] Di HP, tombol selfie membuka aplikasi kamera bawaan HP (bukan live stream browser), GPS aktif otomatis, foto masuk Google Drive, dan link Google Maps + link Drive tersimpan di `LogAbsensi`.
- [ ] Admin dapat menggeser pin peta Leaflet.js, klik *Gunakan Lokasi Saat Ini*, dan mengubah radius; absen di luar radius wajib mengisi alasan.
- [ ] Pengajuan Cuti/Ijin/Sakit (+ upload file) dan Pengajuan Lembur masuk status `Pending`, muncul di badge notifikasi Admin, dan bisa Disetujui/Ditolak.
- [ ] Download PDF Rekap Absensi menghasilkan PDF berkop surat + tabel + TTD siap print; Export Excel/CSV berjalan lancar.
- [ ] Admin mengatur nominal Slip Gaji; Karyawan dapat mengunduh Slip Gaji PDF miliknya sendiri (bukan milik orang lain).

---

# ==============================================================================
# ZONA BAWAH: MASTER CONTEXT & LOGIKA SISTEM TERKINI (LIVING CONTEXT)
# ==============================================================================

## Status Arsitektur & Lingkungan Aktif
- **Fase:** Kode v1.1 telah diperbarui (Admin bebas absensi selfie + Kop Surat & Logo resmi Depok).
- **Berkas Aktif:** `setup.gs`, `code.gs`, `index.html`, `styles.css`, `app.js`, `logo-bmi.jpg`, `README.md`.
- **Stack Terpilih:** Frontend Statis (GitHub Pages / Vercel: `index.html`, `styles.css`, `app.js`, `logo-bmi.jpg`) + Backend Google Apps Script (`code.gs`, `setup.gs`) + Google Sheets + Google Drive.

## Skema Kolom Database Terkini
- Tab Sheet (bebas underscore): `DataKaryawan` (11 kolom), `LogAbsensi` (14 kolom), `PengajuanCuti` (13 kolom), `PengajuanLembur` (12 kolom), `DataSlipGaji` (13 kolom), `PengaturanSistem` (3 kolom), `HariLibur` (3 kolom).

## Logika Bisnis & Formula Hitung Berlaku
- **Peran Admin vs Karyawan pada Absensi:** Akun `Admin` tidak melakukan absensi selfie (menu `Absensi Selfie` & tombol *"Absen Sekarang"* disembunyikan untuk Admin, backend menolak `submitAttendance` dari role `Admin`, dan perhitungan metrik wajib absen / progres departemen di Dashboard mengecualikan akun `Admin`).
- **Kop Surat & Logo Resmi PDF:** Menggunakan logo horizontal `logo-bmi.jpg` (atau logo unggahan custom Admin) secara proporsional dengan alamat resmi `Komplek DDN No.Kav 23, Harjamukti, Kec. Cimanggis, Kota Depok, Jawa Barat 16454`, kontak `Telp: 02138852384 | Website: https://www.berjaya-makmur-indonesia.co.id/`, dan Kota TTD `Depok`.
- Jam kerja tetap + toleransi menit keterlambatan (dikelola di `PengaturanSistem`).
- Deteksi lokasi menggunakan formula Haversine (meter); luar radius berstatus `Luar Radius` dengan alasan wajib terisi.
- Slip gaji terstruktur: `TotalGajiBersih = GajiPokok + Tunjangan + UangLembur - Potongan`.
- Seluruh ID entitas menggunakan generator `PREFIX-YYYYMM-XXX` / `PREFIX-YYYYMMDD-XXX` berbasis `MAX + 1` + `LockService`.

## Log Pembaruan Resmi
- `2026-11-25` (v1.1): Penghapusan fitur & kewajiban absensi selfie pada akun Admin (UI & Backend Dashboard/Attendance) serta pembaruan Kop Surat resmi Depok + aset logo `logo-bmi.jpg`.
- `2026-11-25` (v1.0): Implementasi awal aplikasi HRIS Digital PT. BERJAYA MAKMUR INDONESIA.
