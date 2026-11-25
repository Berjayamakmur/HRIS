/**
 * setup.gs
 * Inisialisasi Database Google Sheets (Safe Migrate) & Folder Google Drive
 * HRIS Digital - PT. BERJAYA MAKMUR INDONESIA
 *
 * CARA MENJALANKAN:
 * 1. Buka Google Sheets baru, klik Ekstensi -> Apps Script.
 * 2. Tempel kode setup.gs dan code.gs ke masing-masing file.
 * 3. Pilih fungsi `setupDatabase` di toolbar atas lalu klik Run (Jalankan).
 * 4. Setujui izin akses Google Sheets & Google Drive saat diminta.
 */

var SHEET_NAMES = {
  KARYAWAN: 'DataKaryawan',
  ABSENSI: 'LogAbsensi',
  CUTI: 'PengajuanCuti',
  LEMBUR: 'PengajuanLembur',
  SLIP_GAJI: 'DataSlipGaji',
  PENGATURAN: 'PengaturanSistem',
  HARI_LIBUR: 'HariLibur'
};

/**
 * Menjalankan migrasi skema secara aman (Idempoten & Non-Destruktif).
 * Aman dijalankan berulang kali tanpa menghapus data produksi yang sudah ada.
 */
function setupDatabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Jalankan setupDatabase dari Google Apps Script yang terikat pada Google Sheets.');
  }

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('APP_SALT')) {
    props.setProperty('APP_SALT', Utilities.getUuid());
  }

  var folders = ensureDriveFolders_();

  ensureSheetWithHeaders_(ss, SHEET_NAMES.KARYAWAN, [
    'IDKaryawan', 'PasswordHash', 'NamaLengkap', 'Role', 'Jabatan',
    'Departemen', 'Email', 'NoHP', 'FotoProfilURL', 'StatusAktif', 'DibuatPada'
  ]);

  ensureSheetWithHeaders_(ss, SHEET_NAMES.ABSENSI, [
    'IDAbsensi', 'IDKaryawan', 'NamaKaryawan', 'Tanggal', 'TipeAbsen',
    'WaktuAbsen', 'StatusKetepatan', 'Koordinat', 'LinkGoogleMaps',
    'JarakMeter', 'StatusLokasi', 'AlasanLuarRadius', 'LinkFotoDrive', 'DicatatPada'
  ]);

  ensureSheetWithHeaders_(ss, SHEET_NAMES.CUTI, [
    'IDCuti', 'IDKaryawan', 'NamaKaryawan', 'JenisPengajuan', 'TanggalMulai',
    'TanggalSelesai', 'JumlahHari', 'Keterangan', 'LinkLampiranDrive',
    'StatusApproval', 'CatatanAdmin', 'DisetujuiOleh', 'DiajukanPada'
  ]);

  ensureSheetWithHeaders_(ss, SHEET_NAMES.LEMBUR, [
    'IDLembur', 'IDKaryawan', 'NamaKaryawan', 'TanggalLembur', 'JamMulai',
    'JamSelesai', 'DurasiJam', 'DeskripsiTugas', 'StatusApproval',
    'CatatanAdmin', 'DisetujuiOleh', 'DiajukanPada'
  ]);

  ensureSheetWithHeaders_(ss, SHEET_NAMES.SLIP_GAJI, [
    'IDSlip', 'PeriodeBulan', 'IDKaryawan', 'NamaKaryawan', 'Jabatan',
    'GajiPokok', 'Tunjangan', 'UangLembur', 'Potongan', 'TotalGajiBersih',
    'CatatanSlip', 'StatusTerbit', 'DiperbaruiPada'
  ]);

  ensureSheetWithHeaders_(ss, SHEET_NAMES.PENGATURAN, [
    'KeyPengaturan', 'NilaiPengaturan', 'Keterangan'
  ]);

  ensureSheetWithHeaders_(ss, SHEET_NAMES.HARI_LIBUR, [
    'IDLibur', 'TanggalLibur', 'NamaHariLibur'
  ]);

  seedInitialDataIfEmpty_(ss, folders);
  SpreadsheetApp.flush();

  Logger.log('Setup HRIS PT. BERJAYA MAKMUR INDONESIA selesai dengan aman.');
  return {
    success: true,
    message: 'Database Google Sheets dan Folder Google Drive berhasil disiapkan.',
    folders: folders
  };
}

/**
 * Memastikan tab sheet tersedia dan menambahkan kolom baru di sisi paling kanan
 * tanpa menghapus atau menggeser data lama.
 */
function ensureSheetWithHeaders_(ss, sheetName, expectedHeaders) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    styleHeaderRow_(sheet, expectedHeaders.length);
    sheet.setFrozenRows(1);
    return sheet;
  }

  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    styleHeaderRow_(sheet, expectedHeaders.length);
    sheet.setFrozenRows(1);
    return sheet;
  }

  var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  if (expectedHeaders.length > existingHeaders.length) {
    var missingHeaders = expectedHeaders.slice(existingHeaders.length);
    sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    styleHeaderRow_(sheet, expectedHeaders.length);
  }
  return sheet;
}

/**
 * Memberikan gaya visual rapi pada baris header Google Sheets.
 */
function styleHeaderRow_(sheet, colCount) {
  var range = sheet.getRange(1, 1, 1, colCount);
  range.setBackground('#059669');
  range.setFontColor('#FFFFFF');
  range.setFontWeight('bold');
  range.setVerticalAlignment('middle');
}

/**
 * Menyiapkan folder root dan subfolder di Google Drive untuk menyimpan foto & dokumen.
 */
function ensureDriveFolders_() {
  var props = PropertiesService.getScriptProperties();
  var rootFolder = getOrCreateFolderByProp_(props, 'FOLDER_ROOT_ID', 'HRIS - PT Berjaya Makmur Indonesia', DriveApp.getRootFolder());
  var fotoProfil = getOrCreateFolderByProp_(props, 'FOLDER_FOTO_PROFIL_ID', 'FotoProfil', rootFolder);
  var selfieAbsensi = getOrCreateFolderByProp_(props, 'FOLDER_SELFIE_ID', 'SelfieAbsensi', rootFolder);
  var lampiranIzin = getOrCreateFolderByProp_(props, 'FOLDER_LAMPIRAN_ID', 'LampiranIzin', rootFolder);
  var assetPerusahaan = getOrCreateFolderByProp_(props, 'FOLDER_ASSET_ID', 'AssetPerusahaan', rootFolder);

  return {
    rootId: rootFolder.getId(),
    fotoProfilId: fotoProfil.getId(),
    selfieAbsensiId: selfieAbsensi.getId(),
    lampiranIzinId: lampiranIzin.getId(),
    assetPerusahaanId: assetPerusahaan.getId()
  };
}

/**
 * Mengambil folder berdasarkan ScriptProperties atau mencari/membuatnya di folder induk.
 */
function getOrCreateFolderByProp_(props, propKey, folderName, parentFolder) {
  var savedId = props.getProperty(propKey);
  if (savedId) {
    try {
      var existing = DriveApp.getFolderById(savedId);
      if (existing && !existing.isTrashed()) {
        return existing;
      }
    } catch (err) {
      // Lanjut cari berdasarkan nama jika ID lama tidak valid
    }
  }

  var iter = parentFolder.getFoldersByName(folderName);
  var folder = iter.hasNext() ? iter.next() : parentFolder.createFolder(folderName);
  props.setProperty(propKey, folder.getId());
  return folder;
}

/**
 * Mengisi data awal HANYA jika sheet benar-benar baru / kosong (baris <= 1).
 */
function seedInitialDataIfEmpty_(ss, folders) {
  var nowStr = formatJakartaNow_();
  var yearMonth = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMM');

  // 1. Seed DataKaryawan
  var karyawanSheet = ss.getSheetByName(SHEET_NAMES.KARYAWAN);
  if (karyawanSheet.getLastRow() <= 1) {
    karyawanSheet.appendRow([
      'ADM001',
      hashPassword_('admin123'),
      'Administrator HRD',
      'Admin',
      'HRD Manager',
      'Human Resources',
      'hrd@berjayamakmur.co.id',
      '081200000001',
      '',
      'Aktif',
      nowStr
    ]);
    karyawanSheet.appendRow([
      'KRY-' + yearMonth + '-001',
      hashPassword_('123456'),
      'Budi Santoso',
      'Karyawan',
      'Staff Operasional',
      'Operasional',
      'budi@berjayamakmur.co.id',
      '081200000002',
      '',
      'Aktif',
      nowStr
    ]);
  }

  // 2. Seed PengaturanSistem
  var settingSheet = ss.getSheetByName(SHEET_NAMES.PENGATURAN);
  if (settingSheet.getLastRow() <= 1) {
    var defaultSettings = [
      ['NAMA_PERUSAHAAN', 'PT. BERJAYA MAKMUR INDONESIA', 'Nama resmi perusahaan pada kop surat'],
      ['ALAMAT_PERUSAHAAN', 'Komplek DDN No.Kav 23, Harjamukti, Kec. Cimanggis, Kota Depok, Jawa Barat 16454', 'Alamat perusahaan pada kop surat PDF'],
      ['KONTAK_PERUSAHAAN', 'Telp: 02138852384 | Website: https://www.berjaya-makmur-indonesia.co.id/', 'Kontak perusahaan pada kop surat PDF'],
      ['LOGO_URL', '', 'Link Google Drive logo perusahaan'],
      ['LOGO_BASE64', '', 'Data gambar logo terkompresi untuk render PDF bebas CORS'],
      ['KOTA_TTD', 'Depok', 'Nama kota pada blok tanda tangan PDF'],
      ['TTD_NAMA', 'Administrator HRD', 'Nama pejabat penandatangan PDF'],
      ['TTD_JABATAN', 'HRD Manager', 'Jabatan pejabat penandatangan PDF'],
      ['KANTOR_LAT', '-6.373600', 'Koordinat Latitude kantor'],
      ['KANTOR_LNG', '106.890200', 'Koordinat Longitude kantor'],
      ['RADIUS_METER', '150', 'Batas radius absensi dalam meter'],
      ['JAM_MASUK', '08:00', 'Jam masuk kerja standar (HH:mm)'],
      ['JAM_PULANG', '17:00', 'Jam pulang kerja standar (HH:mm)'],
      ['TOLERANSI_MENIT', '15', 'Toleransi keterlambatan dalam menit'],
      ['FOLDER_ROOT_ID', folders.rootId, 'ID Folder Root Google Drive HRIS']
    ];
    settingSheet.getRange(2, 1, defaultSettings.length, 3).setValues(defaultSettings);
  } else {
    // Sinkronisasi aman jika masih memakai alamat default template awal
    var existingSettings = settingSheet.getRange(2, 1, settingSheet.getLastRow() - 1, 2).getDisplayValues();
    for (var sIdx = 0; sIdx < existingSettings.length; sIdx++) {
      var sKey = existingSettings[sIdx][0];
      var sVal = existingSettings[sIdx][1];
      if (sKey === 'ALAMAT_PERUSAHAAN' && sVal === 'Jl. Jend. Sudirman Kav. 52-53, Jakarta Selatan 12190') {
        settingSheet.getRange(sIdx + 2, 2).setValue('Komplek DDN No.Kav 23, Harjamukti, Kec. Cimanggis, Kota Depok, Jawa Barat 16454');
      } else if (sKey === 'KONTAK_PERUSAHAAN' && sVal === 'Telp: (021) 555-0199 | Email: hrd@berjayamakmur.co.id') {
        settingSheet.getRange(sIdx + 2, 2).setValue('Telp: 02138852384 | Website: https://www.berjaya-makmur-indonesia.co.id/');
      } else if (sKey === 'KOTA_TTD' && sVal === 'Jakarta') {
        settingSheet.getRange(sIdx + 2, 2).setValue('Depok');
      }
    }
  }

  // 3. Seed HariLibur
  var liburSheet = ss.getSheetByName(SHEET_NAMES.HARI_LIBUR);
  if (liburSheet.getLastRow() <= 1) {
    var yearStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy');
    liburSheet.appendRow(['LIB-' + yearMonth + '-001', yearStr + '-12-25', 'Hari Raya Natal']);
  }
}
