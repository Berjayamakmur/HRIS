# Panduan Deploy & Instalasi HRIS Digital — PT. BERJAYA MAKMUR INDONESIA

Aplikasi ini terdiri dari 2 bagian yang saling terhubung:
1. **Backend (`setup.gs` & `code.gs`):** Berjalan gratis di **Google Apps Script + Google Sheets + Google Drive**.
2. **Frontend (`index.html`, `styles.css`, `app.js`):** Berjalan di **GitHub Pages / Vercel** (atau hosting statis lainnya) agar kamera native HP dan sensor GPS berfungsi tanpa blokir *iframe*.

---

## Langkah 1: Siapkan Backend Google Apps Script & Google Sheets
1. Buka Google Drive Anda dan buat **Google Spreadsheet (Google Sheets)** baru, beri nama misalnya `Database HRIS PT Berjaya Makmur Indonesia`.
2. Di Google Sheets tersebut, klik menu **Ekstensi (Extensions) -> Apps Script**.
3. Pada editor Apps Script:
   - Ubah isi file `Code.gs` dengan seluruh kode dari file [`code.gs`](code.gs).
   - Klik ikon **+** di sebelah *Files* -> pilih **Script**, beri nama `setup`, lalu tempel seluruh kode dari file [`setup.gs`](setup.gs).
4. Simpan semua file (`Ctrl + S`).
5. Di toolbar atas editor Apps Script, pilih fungsi **`setupDatabase`** lalu klik tombol **Run (Jalankan)**.
6. Jika muncul popup perizinan akses (*Authorization Required*):
   - Klik **Review Permissions** -> pilih akun Google Anda -> klik **Advanced** -> klik **Go to ... (unsafe)** -> klik **Allow**.
   - Fungsi `setupDatabase()` otomatis membuat 7 tab sheet (`DataKaryawan`, `LogAbsensi`, `PengajuanCuti`, `PengajuanLembur`, `DataSlipGaji`, `PengaturanSistem`, `HariLibur`) beserta folder di Google Drive (`HRIS - PT Berjaya Makmur Indonesia`).

---

## Langkah 2: Deploy Backend Sebagai Web App
1. Di editor Apps Script, klik tombol **Deploy (Terapkan)** di kanan atas -> **New deployment (Deployment baru)**.
2. Klik ikon roda gigi di *Select type* -> pilih **Web app**.
3. Isi konfigurasi:
   - **Description:** `HRIS Backend v1`
   - **Execute as:** `Me` (akun Google Anda)
   - **Who has access:** **`Anyone`** *(Wajib dipilih agar aplikasi web di HP/Laptop karyawan bisa terhubung ke server)*
4. Klik **Deploy**, lalu **salin URL Web App** yang berakhiran `/exec` (contoh: `https://script.google.com/macros/s/AKfycb.../exec`).

---

## Langkah 3: Hubungkan & Deploy Frontend (GitHub Pages / Vercel)
1. **(Opsional tapi Direkomendasikan)** Buka file [`app.js`](app.js), cari baris paling atas:
   ```javascript
   var DEFAULT_API_URL = '';
   ```
   Tempel URL `/exec` Anda di antara tanda kutip agar seluruh karyawan langsung terhubung otomatis tanpa perlu memasukkan URL manual.
2. Upload 3 file frontend (`index.html`, `styles.css`, `app.js`) ke repositori **GitHub** (aktifkan **GitHub Pages**) atau deploy ke **Vercel** (cukup drag-and-drop folder atau sambungkan repo GitHub).
   - *Catatan:* HTTPS dari GitHub Pages / Vercel sangat penting agar browser HP mengizinkan akses **GPS** dan **Kamera HP**.

---

## Langkah 4: Login Pertama Kali & Pengaturan Awal
Buka alamat Web App (GitHub Pages / Vercel) Anda:
- Jika `DEFAULT_API_URL` belum diisi, klik **"Pengaturan URL Server Backend"** di bagian bawah kartu login, tempel URL `/exec`, lalu klik **Simpan & Tes Koneksi**.
- **Akun Default (Dibuat otomatis oleh `setupDatabase`):**
  - **Admin HRD:** NIP `ADM001` | Password `admin123`
  - **Contoh Karyawan:** NIP `KRY-202611-001` | Password `123456`
- **Saran Keamanan:** Setelah login pertama sebagai Admin, segera ubah password `ADM001` lewat menu **Profil Saya** atau **Kelola Karyawan**, lalu atur titik koordinat & radius kantor di menu **Pengaturan & Map**.
