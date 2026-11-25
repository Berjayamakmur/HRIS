/**
 * code.gs
 * Backend REST-like API Controller (Google Apps Script)
 * HRIS Digital - PT. BERJAYA MAKMUR INDONESIA
 *
 * Standar Rekayasa ZettBOT v4.1:
 * - Index-Based Column Mapping (konstanta COL_*, bebas ketergantungan teks header)
 * - getDisplayValues() untuk membaca bebas distorsi timezone
 * - SpreadsheetApp.flush() setelah setiap operasi tulis
 * - LockService.getScriptLock() + MAX + 1 untuk penomoran ID sekuensial anti-tabrakan
 * - Pencarian, filter, & paginasi dieksekusi di backend
 */

var COL_KARYAWAN = {
  ID: 0,
  PASSWORD_HASH: 1,
  NAMA: 2,
  ROLE: 3,
  JABATAN: 4,
  DEPARTEMEN: 5,
  EMAIL: 6,
  NO_HP: 7,
  FOTO_URL: 8,
  STATUS: 9,
  CREATED_AT: 10
};

var COL_ABSENSI = {
  ID: 0,
  ID_KARYAWAN: 1,
  NAMA: 2,
  TANGGAL: 3,
  TIPE: 4,
  WAKTU: 5,
  STATUS_WAKTU: 6,
  LAT_LNG: 7,
  MAPS_URL: 8,
  JARAK_METER: 9,
  STATUS_LOKASI: 10,
  ALASAN_LUAR: 11,
  FOTO_URL: 12,
  CREATED_AT: 13
};

var COL_CUTI = {
  ID: 0,
  ID_KARYAWAN: 1,
  NAMA: 2,
  JENIS: 3,
  TGL_MULAI: 4,
  TGL_SELESAI: 5,
  JUMLAH_HARI: 6,
  ALASAN: 7,
  FILE_URL: 8,
  STATUS: 9,
  CATATAN_ADMIN: 10,
  APPROVER: 11,
  CREATED_AT: 12
};

var COL_LEMBUR = {
  ID: 0,
  ID_KARYAWAN: 1,
  NAMA: 2,
  TANGGAL: 3,
  JAM_MULAI: 4,
  JAM_SELESAI: 5,
  DURASI_JAM: 6,
  PEKERJAAN: 7,
  STATUS: 8,
  CATATAN_ADMIN: 9,
  APPROVER: 10,
  CREATED_AT: 11
};

var COL_SLIP = {
  ID: 0,
  PERIODE: 1,
  ID_KARYAWAN: 2,
  NAMA: 3,
  JABATAN: 4,
  GAJI_POKOK: 5,
  TUNJANGAN: 6,
  LEMBUR: 7,
  POTONGAN: 8,
  TOTAL_BERSIH: 9,
  CATATAN: 10,
  STATUS: 11,
  UPDATED_AT: 12
};

var COL_SETTING = {
  KEY: 0,
  VALUE: 1,
  DESC: 2
};

var COL_LIBUR = {
  ID: 0,
  TANGGAL: 1,
  NAMA: 2
};

/**
 * Endpoint GET untuk pengecekan koneksi server Apps Script.
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : 'ping';
  if (action === 'ping') {
    return jsonResponse_({
      success: true,
      app: 'HRIS Digital - PT. BERJAYA MAKMUR INDONESIA',
      status: 'online',
      serverTime: formatJakartaNow_()
    });
  }
  return jsonResponse_({
    success: false,
    message: 'Gunakan metode POST dengan payload JSON untuk mengakses endpoint API.'
  });
}

/**
 * Endpoint POST utama untuk seluruh aksi frontend (memakai Content-Type: text/plain).
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ success: false, message: 'Payload request kosong.' });
    }

    var req = JSON.parse(e.postData.contents);
    var action = String(req.action || '').trim();
    var payload = req.payload || {};
    var token = String(req.token || '').trim();

    if (action === 'ping') {
      return jsonResponse_({
        success: true,
        app: 'HRIS Digital - PT. BERJAYA MAKMUR INDONESIA',
        serverTime: formatJakartaNow_()
      });
    }

    if (action === 'login') {
      return jsonResponse_(handleLogin_(payload));
    }

    if (action === 'logout') {
      if (token) {
        CacheService.getScriptCache().remove('SESSION_' + token);
      }
      return jsonResponse_({ success: true });
    }

    // Semua endpoint selain ping/login/logout wajib memverifikasi sesi
    var sessionUser = verifySession_(token);
    if (!sessionUser) {
      return jsonResponse_({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Sesi Anda telah berakhir atau tidak valid. Silakan login kembali.'
      });
    }

    var result;
    switch (action) {
      case 'getDashboard':
        result = handleGetDashboard_(sessionUser, payload);
        break;
      case 'getSettings':
        result = handleGetSettings_(sessionUser);
        break;
      case 'saveSettings':
        requireAdmin_(sessionUser);
        result = handleSaveSettings_(sessionUser, payload);
        break;
      case 'getHolidays':
        result = handleGetHolidays_(payload);
        break;
      case 'saveHoliday':
        requireAdmin_(sessionUser);
        result = handleSaveHoliday_(payload);
        break;
      case 'deleteHoliday':
        requireAdmin_(sessionUser);
        result = handleDeleteHoliday_(payload);
        break;
      case 'getEmployees':
        result = handleGetEmployees_(sessionUser, payload);
        break;
      case 'saveEmployee':
        requireAdmin_(sessionUser);
        result = handleSaveEmployee_(payload);
        break;
      case 'resetEmployeePassword':
        requireAdmin_(sessionUser);
        result = handleResetEmployeePassword_(payload);
        break;
      case 'updateOwnProfile':
        result = handleUpdateOwnProfile_(sessionUser, payload);
        break;
      case 'getAttendanceStatusToday':
        result = handleGetAttendanceStatusToday_(sessionUser);
        break;
      case 'submitAttendance':
        result = handleSubmitAttendance_(sessionUser, payload);
        break;
      case 'getAttendance':
        result = handleGetAttendance_(sessionUser, payload);
        break;
      case 'getAttendanceReport':
        result = handleGetAttendanceReport_(sessionUser, payload);
        break;
      case 'getLeaves':
        result = handleGetLeaves_(sessionUser, payload);
        break;
      case 'submitLeave':
        result = handleSubmitLeave_(sessionUser, payload);
        break;
      case 'reviewLeave':
        requireAdmin_(sessionUser);
        result = handleReviewLeave_(sessionUser, payload);
        break;
      case 'getOvertimes':
        result = handleGetOvertimes_(sessionUser, payload);
        break;
      case 'submitOvertime':
        result = handleSubmitOvertime_(sessionUser, payload);
        break;
      case 'reviewOvertime':
        requireAdmin_(sessionUser);
        result = handleReviewOvertime_(sessionUser, payload);
        break;
      case 'getPayslips':
        result = handleGetPayslips_(sessionUser, payload);
        break;
      case 'savePayslip':
        requireAdmin_(sessionUser);
        result = handleSavePayslip_(payload);
        break;
      case 'deletePayslip':
        requireAdmin_(sessionUser);
        result = handleDeletePayslip_(payload);
        break;
      case 'getNextIdPreview':
        result = handleGetNextIdPreview_(sessionUser, payload);
        break;
      default:
        result = { success: false, message: 'Aksi tidak dikenali: ' + action };
    }

    return jsonResponse_(result);
  } catch (err) {
    return jsonResponse_({
      success: false,
      message: err && err.message ? err.message : 'Terjadi kesalahan pada server.'
    });
  }
}

/* ============================================================================
 * HELPERS: WAKTU, HASH, SESI, LOCK & ID SEKUENSIAL
 * ============================================================================ */

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatJakartaNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
}

function formatJakartaDate_(dateObj) {
  return Utilities.formatDate(dateObj || new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
}

function formatJakartaTime_(dateObj) {
  return Utilities.formatDate(dateObj || new Date(), 'Asia/Jakarta', 'HH:mm:ss');
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetSafe_(sheetName) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Tab sheet "' + sheetName + '" tidak ditemukan. Jalankan setupDatabase() di setup.gs terlebih dahulu.');
  }
  return sheet;
}

function getDataRows_(sheetName) {
  var sheet = getSheetSafe_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) {
    return [];
  }
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
}

function hashPassword_(plainPassword) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('APP_SALT');
  if (!salt) {
    salt = Utilities.getUuid();
    props.setProperty('APP_SALT', salt);
  }
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + '::' + String(plainPassword || ''),
    Utilities.Charset.UTF_8
  );
  return raw.map(function (byteVal) {
    var v = (byteVal < 0 ? byteVal + 256 : byteVal).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function requireAdmin_(sessionUser) {
  if (!sessionUser || sessionUser.role !== 'Admin') {
    throw new Error('Akses ditolak. Fitur ini khusus Admin HRD.');
  }
}

function verifySession_(token) {
  if (!token) {
    return null;
  }
  var cache = CacheService.getScriptCache();
  var rawSession = cache.get('SESSION_' + token);
  if (!rawSession) {
    return null;
  }
  var parsed = JSON.parse(rawSession);
  var rows = getDataRows_(SHEET_NAMES.KARYAWAN);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][COL_KARYAWAN.ID] === parsed.id) {
      if (rows[i][COL_KARYAWAN.STATUS] !== 'Aktif') {
        cache.remove('SESSION_' + token);
        return null;
      }
      return mapEmployeeRow_(rows[i]);
    }
  }
  return null;
}

function mapEmployeeRow_(row) {
  return {
    id: row[COL_KARYAWAN.ID] || '',
    nama: row[COL_KARYAWAN.NAMA] || '',
    role: row[COL_KARYAWAN.ROLE] || 'Karyawan',
    jabatan: row[COL_KARYAWAN.JABATAN] || '',
    departemen: row[COL_KARYAWAN.DEPARTEMEN] || '',
    email: row[COL_KARYAWAN.EMAIL] || '',
    noHp: row[COL_KARYAWAN.NO_HP] || '',
    fotoUrl: row[COL_KARYAWAN.FOTO_URL] || '',
    status: row[COL_KARYAWAN.STATUS] || 'Aktif',
    createdAt: row[COL_KARYAWAN.CREATED_AT] || ''
  };
}

/**
 * Generator ID Sekuensial Anti-Tabrakan berbasis MAX + 1 (bukan rowCount + 1).
 * Contoh: ABS-20261125-001, CUT-202611-001
 */
function generateNextId_(sheetName, idColIndex, prefix, periodStr) {
  var rows = getDataRows_(sheetName);
  var fullPrefix = prefix + '-' + periodStr + '-';
  var maxSeq = 0;

  for (var i = 0; i < rows.length; i++) {
    var existingId = String(rows[i][idColIndex] || '');
    if (existingId.indexOf(fullPrefix) === 0) {
      var seqPart = existingId.substring(fullPrefix.length);
      var num = parseInt(seqPart, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  var nextNum = maxSeq + 1;
  var padded = String(nextNum);
  while (padded.length < 3) {
    padded = '0' + padded;
  }
  return fullPrefix + padded;
}

function handleGetNextIdPreview_(sessionUser, payload) {
  var type = String(payload.type || '').trim();
  var ym = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMM');
  if (type === 'KARYAWAN') {
    requireAdmin_(sessionUser);
    return { success: true, nextId: generateNextId_(SHEET_NAMES.KARYAWAN, COL_KARYAWAN.ID, 'KRY', ym) };
  }
  if (type === 'CUTI') {
    return { success: true, nextId: generateNextId_(SHEET_NAMES.CUTI, COL_CUTI.ID, 'CUT', ym) };
  }
  if (type === 'LEMBUR') {
    return { success: true, nextId: generateNextId_(SHEET_NAMES.LEMBUR, COL_LEMBUR.ID, 'LMB', ym) };
  }
  if (type === 'SLIP') {
    requireAdmin_(sessionUser);
    return { success: true, nextId: generateNextId_(SHEET_NAMES.SLIP_GAJI, COL_SLIP.ID, 'SLP', ym) };
  }
  if (type === 'LIBUR') {
    requireAdmin_(sessionUser);
    return { success: true, nextId: generateNextId_(SHEET_NAMES.HARI_LIBUR, COL_LIBUR.ID, 'LIB', ym) };
  }
  return { success: false, message: 'Tipe ID tidak valid.' };
}

/**
 * Mengunggah file Base64 ke Google Drive subfolder tertentu dan menyetel izin lihat publik via link.
 */
function uploadBase64ToDrive_(base64Input, fileName, defaultMime, propFolderKey, fallbackFolderName) {
  var rawStr = String(base64Input || '');
  if (!rawStr) {
    return '';
  }

  var mimeType = defaultMime || 'image/jpeg';
  var base64Data = rawStr;
  var match = rawStr.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    base64Data = match[2];
  }

  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, mimeType, fileName);

  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(propFolderKey);
  var folder;

  if (folderId) {
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch (e) {
      folder = null;
    }
  }
  if (!folder) {
    var folders = ensureDriveFolders_();
    if (propFolderKey === 'FOLDER_FOTO_PROFIL_ID') folder = DriveApp.getFolderById(folders.fotoProfilId);
    else if (propFolderKey === 'FOLDER_SELFIE_ID') folder = DriveApp.getFolderById(folders.selfieAbsensiId);
    else if (propFolderKey === 'FOLDER_LAMPIRAN_ID') folder = DriveApp.getFolderById(folders.lampiranIzinId);
    else folder = DriveApp.getFolderById(folders.assetPerusahaanId);
  }

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}

/* ============================================================================
 * AUTENTIKASI & PROFIL
 * ============================================================================ */

function handleLogin_(payload) {
  var nip = String(payload.id || '').trim().toUpperCase();
  var password = String(payload.password || '');

  if (!nip || !password) {
    return { success: false, message: 'ID Karyawan (NIP) dan Password wajib diisi.' };
  }

  var rows = getDataRows_(SHEET_NAMES.KARYAWAN);
  var inputHash = hashPassword_(password);

  for (var i = 0; i < rows.length; i++) {
    var rowId = String(rows[i][COL_KARYAWAN.ID] || '').trim().toUpperCase();
    if (rowId === nip) {
      if (rows[i][COL_KARYAWAN.STATUS] !== 'Aktif') {
        return { success: false, message: 'Akun Anda berstatus Nonaktif. Hubungi Admin HRD.' };
      }
      if (rows[i][COL_KARYAWAN.PASSWORD_HASH] !== inputHash) {
        return { success: false, message: 'Password tidak sesuai.' };
      }

      var token = Utilities.getUuid() + '-' + new Date().getTime();
      var userObj = mapEmployeeRow_(rows[i]);
      CacheService.getScriptCache().put('SESSION_' + token, JSON.stringify({ id: userObj.id }), 21600);

      return {
        success: true,
        token: token,
        user: userObj,
        settings: readSettingsMap_()
      };
    }
  }

  return { success: false, message: 'ID Karyawan (NIP) tidak ditemukan.' };
}

function handleUpdateOwnProfile_(sessionUser, payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getSheetSafe_(SHEET_NAMES.KARYAWAN);
    var rows = getDataRows_(SHEET_NAMES.KARYAWAN);
    var rowIndex = -1;

    for (var i = 0; i < rows.length; i++) {
      if (rows[i][COL_KARYAWAN.ID] === sessionUser.id) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: false, message: 'Akun tidak ditemukan.' };
    }

    if (payload.email !== undefined) {
      sheet.getRange(rowIndex, COL_KARYAWAN.EMAIL + 1).setValue(String(payload.email || '').trim());
    }
    if (payload.noHp !== undefined) {
      sheet.getRange(rowIndex, COL_KARYAWAN.NO_HP + 1).setValue(String(payload.noHp || '').trim());
    }
    if (payload.newPassword && String(payload.newPassword).length >= 6) {
      sheet.getRange(rowIndex, COL_KARYAWAN.PASSWORD_HASH + 1).setValue(hashPassword_(payload.newPassword));
    }
    if (payload.fotoBase64) {
      var fileName = 'PROFIL_' + sessionUser.id + '_' + new Date().getTime() + '.jpg';
      var driveUrl = uploadBase64ToDrive_(payload.fotoBase64, fileName, 'image/jpeg', 'FOLDER_FOTO_PROFIL_ID', 'FotoProfil');
      sheet.getRange(rowIndex, COL_KARYAWAN.FOTO_URL + 1).setValue(driveUrl);
    }

    SpreadsheetApp.flush();
    var updatedRow = sheet.getRange(rowIndex, 1, 1, 11).getDisplayValues()[0];
    return {
      success: true,
      message: 'Profil berhasil diperbarui.',
      user: mapEmployeeRow_(updatedRow)
    };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * MANAJEMEN KARYAWAN (ADMIN)
 * ============================================================================ */

function handleGetEmployees_(sessionUser, payload) {
  var search = String(payload.search || '').trim().toLowerCase();
  var statusFilter = String(payload.status || 'ALL');
  var roleFilter = String(payload.role || 'ALL');
  var limit = parseInt(payload.limit, 10) || 20;
  var offset = parseInt(payload.offset, 10) || 0;

  var rows = getDataRows_(SHEET_NAMES.KARYAWAN);
  var filtered = [];

  for (var i = 0; i < rows.length; i++) {
    var item = mapEmployeeRow_(rows[i]);
    if (sessionUser.role !== 'Admin' && item.id !== sessionUser.id) {
      continue;
    }
    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      continue;
    }
    if (roleFilter !== 'ALL' && item.role !== roleFilter) {
      continue;
    }
    if (search) {
      var hay = (item.id + ' ' + item.nama + ' ' + item.jabatan + ' ' + item.departemen + ' ' + item.email).toLowerCase();
      if (hay.indexOf(search) === -1) {
        continue;
      }
    }
    filtered.push(item);
  }

  var total = filtered.length;
  var paged = filtered.slice(offset, offset + limit);

  return {
    success: true,
    items: paged,
    total: total,
    limit: limit,
    offset: offset
  };
}

function handleSaveEmployee_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getSheetSafe_(SHEET_NAMES.KARYAWAN);
    var rows = getDataRows_(SHEET_NAMES.KARYAWAN);
    var isEdit = Boolean(payload.isEdit);
    var targetId = String(payload.id || '').trim().toUpperCase();
    var nama = String(payload.nama || '').trim();
    var role = payload.role === 'Admin' ? 'Admin' : 'Karyawan';
    var jabatan = String(payload.jabatan || '').trim();
    var departemen = String(payload.departemen || '').trim();
    var email = String(payload.email || '').trim();
    var noHp = String(payload.noHp || '').trim();
    var status = payload.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';

    if (!nama || !jabatan) {
      return { success: false, message: 'Nama lengkap dan Jabatan wajib diisi.' };
    }

    var fotoUrl = String(payload.fotoUrl || '');
    if (payload.fotoBase64) {
      var fname = 'PROFIL_' + (targetId || 'NEW') + '_' + new Date().getTime() + '.jpg';
      fotoUrl = uploadBase64ToDrive_(payload.fotoBase64, fname, 'image/jpeg', 'FOLDER_FOTO_PROFIL_ID', 'FotoProfil');
    }

    if (isEdit) {
      var rowIdx = -1;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][COL_KARYAWAN.ID].toUpperCase() === targetId) {
          rowIdx = i + 2;
          if (!fotoUrl) {
            fotoUrl = rows[i][COL_KARYAWAN.FOTO_URL];
          }
          break;
        }
      }
      if (rowIdx === -1) {
        return { success: false, message: 'Karyawan dengan NIP ' + targetId + ' tidak ditemukan.' };
      }

      sheet.getRange(rowIdx, COL_KARYAWAN.NAMA + 1).setValue(nama);
      sheet.getRange(rowIdx, COL_KARYAWAN.ROLE + 1).setValue(role);
      sheet.getRange(rowIdx, COL_KARYAWAN.JABATAN + 1).setValue(jabatan);
      sheet.getRange(rowIdx, COL_KARYAWAN.DEPARTEMEN + 1).setValue(departemen);
      sheet.getRange(rowIdx, COL_KARYAWAN.EMAIL + 1).setValue(email);
      sheet.getRange(rowIdx, COL_KARYAWAN.NO_HP + 1).setValue(noHp);
      sheet.getRange(rowIdx, COL_KARYAWAN.FOTO_URL + 1).setValue(fotoUrl);
      sheet.getRange(rowIdx, COL_KARYAWAN.STATUS + 1).setValue(status);
      if (payload.password && String(payload.password).length >= 6) {
        sheet.getRange(rowIdx, COL_KARYAWAN.PASSWORD_HASH + 1).setValue(hashPassword_(payload.password));
      }

      SpreadsheetApp.flush();
      var editedRow = sheet.getRange(rowIdx, 1, 1, 11).getDisplayValues()[0];
      return { success: true, message: 'Data karyawan berhasil diperbarui.', item: mapEmployeeRow_(editedRow) };
    }

    // Mode Tambah Baru
    var ym = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMM');
    if (!targetId) {
      targetId = generateNextId_(SHEET_NAMES.KARYAWAN, COL_KARYAWAN.ID, 'KRY', ym);
    } else {
      for (var j = 0; j < rows.length; j++) {
        if (rows[j][COL_KARYAWAN.ID].toUpperCase() === targetId) {
          return { success: false, message: 'ID Karyawan (NIP) ' + targetId + ' sudah terdaftar.' };
        }
      }
    }

    var rawPass = String(payload.password || '123456');
    if (rawPass.length < 6) {
      return { success: false, message: 'Password minimal 6 karakter.' };
    }

    var nowStr = formatJakartaNow_();
    var newRow = [
      targetId,
      hashPassword_(rawPass),
      nama,
      role,
      jabatan,
      departemen,
      email,
      noHp,
      fotoUrl,
      status,
      nowStr
    ];
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();

    return { success: true, message: 'Akun karyawan baru berhasil dibuat.', item: mapEmployeeRow_(newRow) };
  } finally {
    lock.releaseLock();
  }
}

function handleResetEmployeePassword_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var targetId = String(payload.id || '').trim().toUpperCase();
    var newPass = String(payload.newPassword || '');
    if (!targetId || newPass.length < 6) {
      return { success: false, message: 'NIP dan password baru (minimal 6 karakter) wajib diisi.' };
    }

    var sheet = getSheetSafe_(SHEET_NAMES.KARYAWAN);
    var rows = getDataRows_(SHEET_NAMES.KARYAWAN);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][COL_KARYAWAN.ID].toUpperCase() === targetId) {
        sheet.getRange(i + 2, COL_KARYAWAN.PASSWORD_HASH + 1).setValue(hashPassword_(newPass));
        SpreadsheetApp.flush();
        return { success: true, message: 'Password untuk ' + targetId + ' berhasil direset.' };
      }
    }
    return { success: false, message: 'Karyawan tidak ditemukan.' };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * PENGATURAN SISTEM, MAP RADIUS & HARI LIBUR
 * ============================================================================ */

function readSettingsMap_() {
  var rows = getDataRows_(SHEET_NAMES.PENGATURAN);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][COL_SETTING.KEY] || '').trim();
    if (k) {
      map[k] = rows[i][COL_SETTING.VALUE] || '';
    }
  }
  return map;
}

function handleGetSettings_(sessionUser) {
  var settings = readSettingsMap_();
  var holidays = getDataRows_(SHEET_NAMES.HARI_LIBUR).map(function (r) {
    return { id: r[COL_LIBUR.ID], tanggal: r[COL_LIBUR.TANGGAL], nama: r[COL_LIBUR.NAMA] };
  });
  return {
    success: true,
    settings: settings,
    holidays: holidays
  };
}

function handleSaveSettings_(sessionUser, payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getSheetSafe_(SHEET_NAMES.PENGATURAN);
    var rows = getDataRows_(SHEET_NAMES.PENGATURAN);
    var updates = payload.settings || {};

    if (payload.logoBase64) {
      var fname = 'LOGO_PERUSAHAAN_' + new Date().getTime() + '.png';
      var driveUrl = uploadBase64ToDrive_(payload.logoBase64, fname, 'image/png', 'FOLDER_ASSET_ID', 'AssetPerusahaan');
      updates.LOGO_URL = driveUrl;
      updates.LOGO_BASE64 = String(payload.logoBase64);
    }

    var keyToRow = {};
    for (var i = 0; i < rows.length; i++) {
      keyToRow[String(rows[i][COL_SETTING.KEY] || '').trim()] = i + 2;
    }

    var keys = Object.keys(updates);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var val = String(updates[key] === null || updates[key] === undefined ? '' : updates[key]);
      if (keyToRow[key]) {
        sheet.getRange(keyToRow[key], COL_SETTING.VALUE + 1).setValue(val);
      } else {
        sheet.appendRow([key, val, 'Pengaturan sistem']);
      }
    }

    SpreadsheetApp.flush();
    return {
      success: true,
      message: 'Pengaturan sistem berhasil disimpan.',
      settings: readSettingsMap_()
    };
  } finally {
    lock.releaseLock();
  }
}

function handleGetHolidays_(payload) {
  var rows = getDataRows_(SHEET_NAMES.HARI_LIBUR);
  var items = rows.map(function (r) {
    return {
      id: r[COL_LIBUR.ID],
      tanggal: r[COL_LIBUR.TANGGAL],
      nama: r[COL_LIBUR.NAMA]
    };
  }).sort(function (a, b) {
    return a.tanggal.localeCompare(b.tanggal);
  });
  return { success: true, items: items };
}

function handleSaveHoliday_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var tanggal = String(payload.tanggal || '').trim();
    var nama = String(payload.nama || '').trim();
    if (!tanggal || !nama) {
      return { success: false, message: 'Tanggal dan Nama Hari Libur wajib diisi.' };
    }
    var sheet = getSheetSafe_(SHEET_NAMES.HARI_LIBUR);
    var ym = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMM');
    var nextId = generateNextId_(SHEET_NAMES.HARI_LIBUR, COL_LIBUR.ID, 'LIB', ym);
    sheet.appendRow([nextId, tanggal, nama]);
    SpreadsheetApp.flush();
    return {
      success: true,
      message: 'Hari libur berhasil ditambahkan.',
      item: { id: nextId, tanggal: tanggal, nama: nama }
    };
  } finally {
    lock.releaseLock();
  }
}

function handleDeleteHoliday_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var id = String(payload.id || '').trim();
    var sheet = getSheetSafe_(SHEET_NAMES.HARI_LIBUR);
    var rows = getDataRows_(SHEET_NAMES.HARI_LIBUR);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][COL_LIBUR.ID] === id) {
        sheet.deleteRow(i + 2);
        SpreadsheetApp.flush();
        return { success: true, message: 'Hari libur dihapus.' };
      }
    }
    return { success: false, message: 'Data hari libur tidak ditemukan.' };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * ABSENSI SELFIE + GPS + RADIUS KANTOR
 * ============================================================================ */

function haversineMeters_(lat1, lon1, lat2, lon2) {
  var R = 6371000;
  var toRad = function (deg) { return deg * Math.PI / 180; };
  var dLat = toRad(lat2 - lat1);
  var dLon = toRad(lon2 - lon1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function timeToMinutes_(hhmm) {
  var parts = String(hhmm || '00:00').split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

function mapAttendanceRow_(row) {
  return {
    id: row[COL_ABSENSI.ID],
    idKaryawan: row[COL_ABSENSI.ID_KARYAWAN],
    nama: row[COL_ABSENSI.NAMA],
    tanggal: row[COL_ABSENSI.TANGGAL],
    tipe: row[COL_ABSENSI.TIPE],
    waktu: row[COL_ABSENSI.WAKTU],
    statusWaktu: row[COL_ABSENSI.STATUS_WAKTU],
    koordinat: row[COL_ABSENSI.LAT_LNG],
    mapsUrl: row[COL_ABSENSI.MAPS_URL],
    jarakMeter: Number(row[COL_ABSENSI.JARAK_METER] || 0),
    statusLokasi: row[COL_ABSENSI.STATUS_LOKASI],
    alasanLuar: row[COL_ABSENSI.ALASAN_LUAR],
    fotoUrl: row[COL_ABSENSI.FOTO_URL],
    createdAt: row[COL_ABSENSI.CREATED_AT]
  };
}

function handleGetAttendanceStatusToday_(sessionUser) {
  if (sessionUser && sessionUser.role === 'Admin') {
    return {
      success: true,
      isAdminExempt: true,
      message: 'Akun Admin tidak memerlukan absensi selfie.',
      tanggal: formatJakartaDate_(),
      masuk: null,
      pulang: null,
      settings: readSettingsMap_()
    };
  }

  var today = formatJakartaDate_();
  var rows = getDataRows_(SHEET_NAMES.ABSENSI);
  var masukRecord = null;
  var pulangRecord = null;

  for (var i = 0; i < rows.length; i++) {
    if (rows[i][COL_ABSENSI.ID_KARYAWAN] === sessionUser.id && rows[i][COL_ABSENSI.TANGGAL] === today) {
      var mapped = mapAttendanceRow_(rows[i]);
      if (mapped.tipe === 'Masuk') masukRecord = mapped;
      if (mapped.tipe === 'Pulang') pulangRecord = mapped;
    }
  }

  return {
    success: true,
    tanggal: today,
    masuk: masukRecord,
    pulang: pulangRecord,
    settings: readSettingsMap_()
  };
}

function handleSubmitAttendance_(sessionUser, payload) {
  if (sessionUser && sessionUser.role === 'Admin') {
    return { success: false, message: 'Akun Admin tidak melakukan absensi selfie.' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var tipe = payload.tipe === 'Pulang' ? 'Pulang' : 'Masuk';
    var lat = parseFloat(payload.lat);
    var lng = parseFloat(payload.lng);
    var fotoBase64 = String(payload.fotoBase64 || '');
    var alasanLuar = String(payload.alasanLuar || '').trim();

    if (isNaN(lat) || isNaN(lng)) {
      return { success: false, message: 'GPS wajib aktif untuk membaca koordinat lokasi Anda.' };
    }
    if (!fotoBase64) {
      return { success: false, message: 'Foto selfie menggunakan kamera HP wajib diambil.' };
    }

    var today = formatJakartaDate_();
    var existingRows = getDataRows_(SHEET_NAMES.ABSENSI);
    var hasMasukToday = false;
    var hasPulangToday = false;

    for (var i = 0; i < existingRows.length; i++) {
      if (existingRows[i][COL_ABSENSI.ID_KARYAWAN] === sessionUser.id && existingRows[i][COL_ABSENSI.TANGGAL] === today) {
        if (existingRows[i][COL_ABSENSI.TIPE] === 'Masuk') hasMasukToday = true;
        if (existingRows[i][COL_ABSENSI.TIPE] === 'Pulang') hasPulangToday = true;
      }
    }

    if (tipe === 'Masuk' && hasMasukToday) {
      return { success: false, message: 'Anda sudah melakukan Absen Masuk hari ini.' };
    }
    if (tipe === 'Pulang' && !hasMasukToday) {
      return { success: false, message: 'Anda harus melakukan Absen Masuk terlebih dahulu sebelum Absen Pulang.' };
    }
    if (tipe === 'Pulang' && hasPulangToday) {
      return { success: false, message: 'Anda sudah melakukan Absen Pulang hari ini.' };
    }

    var settings = readSettingsMap_();
    var kantorLat = parseFloat(settings.KANTOR_LAT || '-6.2088');
    var kantorLng = parseFloat(settings.KANTOR_LNG || '106.8456');
    var radiusMeter = parseInt(settings.RADIUS_METER || '150', 10);

    var jarak = haversineMeters_(lat, lng, kantorLat, kantorLng);
    var statusLokasi = jarak <= radiusMeter ? 'Dalam Radius' : 'Luar Radius';

    if (statusLokasi === 'Luar Radius' && alasanLuar.length < 5) {
      return {
        success: false,
        message: 'Lokasi Anda di luar radius kantor (' + jarak + ' m). Wajib mengisi alasan minimal 5 karakter.'
      };
    }

    var timeStr = formatJakartaTime_();
    var nowMinutes = timeToMinutes_(timeStr.substring(0, 5));
    var jamMasukMin = timeToMinutes_(settings.JAM_MASUK || '08:00');
    var toleransi = parseInt(settings.TOLERANSI_MENIT || '15', 10);
    var jamPulangMin = timeToMinutes_(settings.JAM_PULANG || '17:00');

    var statusWaktu = 'Normal';
    if (tipe === 'Masuk') {
      statusWaktu = nowMinutes > (jamMasukMin + toleransi) ? 'Terlambat' : 'Tepat Waktu';
    } else {
      statusWaktu = nowMinutes < jamPulangMin ? 'Pulang Awal' : 'Tepat Waktu';
    }

    var ymd = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd');
    var nextId = generateNextId_(SHEET_NAMES.ABSENSI, COL_ABSENSI.ID, 'ABS', ymd);
    var fotoName = nextId + '_' + sessionUser.id + '_' + tipe.toUpperCase() + '.jpg';
    var driveUrl = uploadBase64ToDrive_(fotoBase64, fotoName, 'image/jpeg', 'FOLDER_SELFIE_ID', 'SelfieAbsensi');

    var coordStr = lat.toFixed(6) + ', ' + lng.toFixed(6);
    var mapsUrl = 'https://www.google.com/maps?q=' + lat.toFixed(6) + ',' + lng.toFixed(6);
    var nowStr = formatJakartaNow_();

    var rowData = [
      nextId,
      sessionUser.id,
      sessionUser.nama,
      today,
      tipe,
      timeStr,
      statusWaktu,
      coordStr,
      mapsUrl,
      jarak,
      statusLokasi,
      statusLokasi === 'Luar Radius' ? alasanLuar : '-',
      driveUrl,
      nowStr
    ];

    var sheet = getSheetSafe_(SHEET_NAMES.ABSENSI);
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Absen ' + tipe + ' berhasil dicatat (' + statusLokasi + ', ' + jarak + ' m).',
      item: mapAttendanceRow_(rowData)
    };
  } finally {
    lock.releaseLock();
  }
}

function filterAttendanceRows_(sessionUser, payload) {
  var search = String(payload.search || '').trim().toLowerCase();
  var dateFrom = String(payload.dateFrom || '').trim();
  var dateTo = String(payload.dateTo || '').trim();
  var statusLokasi = String(payload.statusLokasi || 'ALL');
  var tipe = String(payload.tipe || 'ALL');
  var employeeId = String(payload.employeeId || 'ALL');

  var rows = getDataRows_(SHEET_NAMES.ABSENSI);
  var filtered = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    var item = mapAttendanceRow_(rows[i]);
    if (sessionUser.role !== 'Admin' && item.idKaryawan !== sessionUser.id) {
      continue;
    }
    if (sessionUser.role === 'Admin' && employeeId !== 'ALL' && item.idKaryawan !== employeeId) {
      continue;
    }
    if (dateFrom && item.tanggal < dateFrom) continue;
    if (dateTo && item.tanggal > dateTo) continue;
    if (statusLokasi !== 'ALL' && item.statusLokasi !== statusLokasi) continue;
    if (tipe !== 'ALL' && item.tipe !== tipe) continue;

    if (search) {
      var hay = (item.id + ' ' + item.idKaryawan + ' ' + item.nama + ' ' + item.alasanLuar + ' ' + item.statusWaktu).toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }
    filtered.push(item);
  }
  return filtered;
}

function handleGetAttendance_(sessionUser, payload) {
  var limit = parseInt(payload.limit, 10) || 20;
  var offset = parseInt(payload.offset, 10) || 0;
  var filtered = filterAttendanceRows_(sessionUser, payload);
  return {
    success: true,
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit: limit,
    offset: offset
  };
}

function handleGetAttendanceReport_(sessionUser, payload) {
  var filtered = filterAttendanceRows_(sessionUser, payload);
  return {
    success: true,
    items: filtered,
    total: filtered.length,
    settings: readSettingsMap_()
  };
}

/* ============================================================================
 * PENGAJUAN CUTI / IJIN / SAKIT + UPLOAD FILE + APPROVAL
 * ============================================================================ */

function mapLeaveRow_(row) {
  return {
    id: row[COL_CUTI.ID],
    idKaryawan: row[COL_CUTI.ID_KARYAWAN],
    nama: row[COL_CUTI.NAMA],
    jenis: row[COL_CUTI.JENIS],
    tglMulai: row[COL_CUTI.TGL_MULAI],
    tglSelesai: row[COL_CUTI.TGL_SELESAI],
    jumlahHari: Number(row[COL_CUTI.JUMLAH_HARI] || 1),
    alasan: row[COL_CUTI.ALASAN],
    fileUrl: row[COL_CUTI.FILE_URL],
    status: row[COL_CUTI.STATUS],
    catatanAdmin: row[COL_CUTI.CATATAN_ADMIN],
    approver: row[COL_CUTI.APPROVER],
    createdAt: row[COL_CUTI.CREATED_AT]
  };
}

function handleGetLeaves_(sessionUser, payload) {
  var search = String(payload.search || '').trim().toLowerCase();
  var statusFilter = String(payload.status || 'ALL');
  var jenisFilter = String(payload.jenis || 'ALL');
  var limit = parseInt(payload.limit, 10) || 20;
  var offset = parseInt(payload.offset, 10) || 0;

  var rows = getDataRows_(SHEET_NAMES.CUTI);
  var filtered = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    var item = mapLeaveRow_(rows[i]);
    if (sessionUser.role !== 'Admin' && item.idKaryawan !== sessionUser.id) continue;
    if (statusFilter !== 'ALL' && item.status !== statusFilter) continue;
    if (jenisFilter !== 'ALL' && item.jenis !== jenisFilter) continue;
    if (search) {
      var hay = (item.id + ' ' + item.idKaryawan + ' ' + item.nama + ' ' + item.alasan).toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }
    filtered.push(item);
  }

  return {
    success: true,
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit: limit,
    offset: offset
  };
}

function handleSubmitLeave_(sessionUser, payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var jenis = String(payload.jenis || 'Cuti');
    if (['Cuti', 'Ijin', 'Sakit'].indexOf(jenis) === -1) {
      return { success: false, message: 'Jenis pengajuan harus Cuti, Ijin, atau Sakit.' };
    }
    var tglMulai = String(payload.tglMulai || '').trim();
    var tglSelesai = String(payload.tglSelesai || '').trim();
    var alasan = String(payload.alasan || '').trim();

    if (!tglMulai || !tglSelesai || alasan.length < 3) {
      return { success: false, message: 'Tanggal mulai, tanggal selesai, dan keterangan wajib diisi.' };
    }
    if (tglSelesai < tglMulai) {
      return { success: false, message: 'Tanggal selesai tidak boleh lebih awal dari tanggal mulai.' };
    }

    var d1 = new Date(tglMulai + 'T00:00:00');
    var d2 = new Date(tglSelesai + 'T00:00:00');
    var jumlahHari = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);

    var ym = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMM');
    var nextId = generateNextId_(SHEET_NAMES.CUTI, COL_CUTI.ID, 'CUT', ym);

    var fileUrl = '';
    if (payload.fileBase64) {
      var origName = String(payload.fileName || 'lampiran.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
      var fileName = nextId + '_' + origName;
      fileUrl = uploadBase64ToDrive_(payload.fileBase64, fileName, payload.fileMime || 'image/jpeg', 'FOLDER_LAMPIRAN_ID', 'LampiranIzin');
    }

    var nowStr = formatJakartaNow_();
    var rowData = [
      nextId,
      sessionUser.id,
      sessionUser.nama,
      jenis,
      tglMulai,
      tglSelesai,
      jumlahHari,
      alasan,
      fileUrl,
      'Pending',
      '',
      '',
      nowStr
    ];

    var sheet = getSheetSafe_(SHEET_NAMES.CUTI);
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Pengajuan ' + jenis + ' berhasil dikirim dan menunggu persetujuan Admin.',
      item: mapLeaveRow_(rowData)
    };
  } finally {
    lock.releaseLock();
  }
}

function handleReviewLeave_(sessionUser, payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var id = String(payload.id || '').trim();
    var status = payload.status === 'Disetujui' ? 'Disetujui' : 'Ditolak';
    var catatan = String(payload.catatanAdmin || '').trim();

    var sheet = getSheetSafe_(SHEET_NAMES.CUTI);
    var rows = getDataRows_(SHEET_NAMES.CUTI);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][COL_CUTI.ID] === id) {
        var rIdx = i + 2;
        sheet.getRange(rIdx, COL_CUTI.STATUS + 1).setValue(status);
        sheet.getRange(rIdx, COL_CUTI.CATATAN_ADMIN + 1).setValue(catatan);
        sheet.getRange(rIdx, COL_CUTI.APPROVER + 1).setValue(sessionUser.id);
        SpreadsheetApp.flush();
        var updated = sheet.getRange(rIdx, 1, 1, 13).getDisplayValues()[0];
        return { success: true, message: 'Pengajuan ' + id + ' telah ' + status + '.', item: mapLeaveRow_(updated) };
      }
    }
    return { success: false, message: 'Data pengajuan tidak ditemukan.' };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * PENGAJUAN LEMBUR + APPROVAL ADMIN
 * ============================================================================ */

function mapOvertimeRow_(row) {
  return {
    id: row[COL_LEMBUR.ID],
    idKaryawan: row[COL_LEMBUR.ID_KARYAWAN],
    nama: row[COL_LEMBUR.NAMA],
    tanggal: row[COL_LEMBUR.TANGGAL],
    jamMulai: row[COL_LEMBUR.JAM_MULAI],
    jamSelesai: row[COL_LEMBUR.JAM_SELESAI],
    durasiJam: Number(row[COL_LEMBUR.DURASI_JAM] || 0),
    pekerjaan: row[COL_LEMBUR.PEKERJAAN],
    status: row[COL_LEMBUR.STATUS],
    catatanAdmin: row[COL_LEMBUR.CATATAN_ADMIN],
    approver: row[COL_LEMBUR.APPROVER],
    createdAt: row[COL_LEMBUR.CREATED_AT]
  };
}

function handleGetOvertimes_(sessionUser, payload) {
  var search = String(payload.search || '').trim().toLowerCase();
  var statusFilter = String(payload.status || 'ALL');
  var limit = parseInt(payload.limit, 10) || 20;
  var offset = parseInt(payload.offset, 10) || 0;

  var rows = getDataRows_(SHEET_NAMES.LEMBUR);
  var filtered = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    var item = mapOvertimeRow_(rows[i]);
    if (sessionUser.role !== 'Admin' && item.idKaryawan !== sessionUser.id) continue;
    if (statusFilter !== 'ALL' && item.status !== statusFilter) continue;
    if (search) {
      var hay = (item.id + ' ' + item.idKaryawan + ' ' + item.nama + ' ' + item.pekerjaan).toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }
    filtered.push(item);
  }

  return {
    success: true,
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit: limit,
    offset: offset
  };
}

function handleSubmitOvertime_(sessionUser, payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var tanggal = String(payload.tanggal || '').trim();
    var jamMulai = String(payload.jamMulai || '').trim();
    var jamSelesai = String(payload.jamSelesai || '').trim();
    var pekerjaan = String(payload.pekerjaan || '').trim();

    if (!tanggal || !jamMulai || !jamSelesai || pekerjaan.length < 3) {
      return { success: false, message: 'Tanggal, jam mulai, jam selesai, dan deskripsi tugas wajib diisi.' };
    }

    var startMin = timeToMinutes_(jamMulai);
    var endMin = timeToMinutes_(jamSelesai);
    if (endMin <= startMin) {
      endMin += 1440; // Mendukung lembur melewati tengah malam
    }
    var durasiJam = Math.round(((endMin - startMin) / 60) * 10) / 10;

    var ym = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMM');
    var nextId = generateNextId_(SHEET_NAMES.LEMBUR, COL_LEMBUR.ID, 'LMB', ym);
    var nowStr = formatJakartaNow_();

    var rowData = [
      nextId,
      sessionUser.id,
      sessionUser.nama,
      tanggal,
      jamMulai,
      jamSelesai,
      durasiJam,
      pekerjaan,
      'Pending',
      '',
      '',
      nowStr
    ];

    var sheet = getSheetSafe_(SHEET_NAMES.LEMBUR);
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();

    return {
      success: true,
      message: 'Pengajuan lembur (' + durasiJam + ' jam) berhasil dikirim.',
      item: mapOvertimeRow_(rowData)
    };
  } finally {
    lock.releaseLock();
  }
}

function handleReviewOvertime_(sessionUser, payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var id = String(payload.id || '').trim();
    var status = payload.status === 'Disetujui' ? 'Disetujui' : 'Ditolak';
    var catatan = String(payload.catatanAdmin || '').trim();

    var sheet = getSheetSafe_(SHEET_NAMES.LEMBUR);
    var rows = getDataRows_(SHEET_NAMES.LEMBUR);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][COL_LEMBUR.ID] === id) {
        var rIdx = i + 2;
        sheet.getRange(rIdx, COL_LEMBUR.STATUS + 1).setValue(status);
        sheet.getRange(rIdx, COL_LEMBUR.CATATAN_ADMIN + 1).setValue(catatan);
        sheet.getRange(rIdx, COL_LEMBUR.APPROVER + 1).setValue(sessionUser.id);
        SpreadsheetApp.flush();
        var updated = sheet.getRange(rIdx, 1, 1, 12).getDisplayValues()[0];
        return { success: true, message: 'Pengajuan lembur ' + id + ' telah ' + status + '.', item: mapOvertimeRow_(updated) };
      }
    }
    return { success: false, message: 'Data lembur tidak ditemukan.' };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * SLIP GAJI (ADMIN INPUT NOMINAL, SEMUA USER DOWNLOAD PDF)
 * ============================================================================ */

function mapPayslipRow_(row) {
  return {
    id: row[COL_SLIP.ID],
    periode: row[COL_SLIP.PERIODE],
    idKaryawan: row[COL_SLIP.ID_KARYAWAN],
    nama: row[COL_SLIP.NAMA],
    jabatan: row[COL_SLIP.JABATAN],
    gajiPokok: Number(row[COL_SLIP.GAJI_POKOK] || 0),
    tunjangan: Number(row[COL_SLIP.TUNJANGAN] || 0),
    lembur: Number(row[COL_SLIP.LEMBUR] || 0),
    potongan: Number(row[COL_SLIP.POTONGAN] || 0),
    totalBersih: Number(row[COL_SLIP.TOTAL_BERSIH] || 0),
    catatan: row[COL_SLIP.CATATAN],
    status: row[COL_SLIP.STATUS],
    updatedAt: row[COL_SLIP.UPDATED_AT]
  };
}

function handleGetPayslips_(sessionUser, payload) {
  var search = String(payload.search || '').trim().toLowerCase();
  var periode = String(payload.periode || '').trim();
  var statusFilter = String(payload.status || 'ALL');
  var limit = parseInt(payload.limit, 10) || 20;
  var offset = parseInt(payload.offset, 10) || 0;

  var rows = getDataRows_(SHEET_NAMES.SLIP_GAJI);
  var filtered = [];

  for (var i = rows.length - 1; i >= 0; i--) {
    var item = mapPayslipRow_(rows[i]);
    if (sessionUser.role !== 'Admin') {
      if (item.idKaryawan !== sessionUser.id || item.status !== 'Terbit') {
        continue;
      }
    }
    if (periode && item.periode !== periode) continue;
    if (statusFilter !== 'ALL' && item.status !== statusFilter) continue;
    if (search) {
      var hay = (item.id + ' ' + item.idKaryawan + ' ' + item.nama + ' ' + item.periode).toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }
    filtered.push(item);
  }

  return {
    success: true,
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit: limit,
    offset: offset
  };
}

function handleSavePayslip_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var id = String(payload.id || '').trim();
    var periode = String(payload.periode || '').trim();
    var idKaryawan = String(payload.idKaryawan || '').trim().toUpperCase();
    var gajiPokok = Math.max(0, Number(payload.gajiPokok || 0));
    var tunjangan = Math.max(0, Number(payload.tunjangan || 0));
    var lembur = Math.max(0, Number(payload.lembur || 0));
    var potongan = Math.max(0, Number(payload.potongan || 0));
    var totalBersih = gajiPokok + tunjangan + lembur - potongan;
    var catatan = String(payload.catatan || '').trim();
    var status = payload.status === 'Draft' ? 'Draft' : 'Terbit';

    if (!periode || !idKaryawan) {
      return { success: false, message: 'Periode bulan dan Karyawan wajib dipilih.' };
    }

    var empRows = getDataRows_(SHEET_NAMES.KARYAWAN);
    var emp = null;
    for (var e = 0; e < empRows.length; e++) {
      if (empRows[e][COL_KARYAWAN.ID].toUpperCase() === idKaryawan) {
        emp = mapEmployeeRow_(empRows[e]);
        break;
      }
    }
    if (!emp) {
      return { success: false, message: 'Karyawan tidak ditemukan.' };
    }

    var sheet = getSheetSafe_(SHEET_NAMES.SLIP_GAJI);
    var rows = getDataRows_(SHEET_NAMES.SLIP_GAJI);
    var nowStr = formatJakartaNow_();

    if (id) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][COL_SLIP.ID] === id) {
          var rIdx = i + 2;
          var updatedRow = [
            id, periode, emp.id, emp.nama, emp.jabatan,
            gajiPokok, tunjangan, lembur, potongan, totalBersih,
            catatan, status, nowStr
          ];
          sheet.getRange(rIdx, 1, 1, 13).setValues([updatedRow]);
          SpreadsheetApp.flush();
          return { success: true, message: 'Slip gaji berhasil diperbarui.', item: mapPayslipRow_(updatedRow) };
        }
      }
    }

    // Cegah duplikasi slip pada karyawan & periode yang sama
    for (var j = 0; j < rows.length; j++) {
      if (rows[j][COL_SLIP.ID_KARYAWAN] === emp.id && rows[j][COL_SLIP.PERIODE] === periode) {
        return { success: false, message: 'Slip gaji untuk ' + emp.nama + ' periode ' + periode + ' sudah ada. Silakan edit data yang ada.' };
      }
    }

    var ym = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMM');
    var nextId = generateNextId_(SHEET_NAMES.SLIP_GAJI, COL_SLIP.ID, 'SLP', ym);
    var newRow = [
      nextId, periode, emp.id, emp.nama, emp.jabatan,
      gajiPokok, tunjangan, lembur, potongan, totalBersih,
      catatan, status, nowStr
    ];
    sheet.appendRow(newRow);
    SpreadsheetApp.flush();

    return { success: true, message: 'Slip gaji berhasil dibuat.', item: mapPayslipRow_(newRow) };
  } finally {
    lock.releaseLock();
  }
}

function handleDeletePayslip_(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var id = String(payload.id || '').trim();
    var sheet = getSheetSafe_(SHEET_NAMES.SLIP_GAJI);
    var rows = getDataRows_(SHEET_NAMES.SLIP_GAJI);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][COL_SLIP.ID] === id) {
        sheet.deleteRow(i + 2);
        SpreadsheetApp.flush();
        return { success: true, message: 'Slip gaji berhasil dihapus.' };
      }
    }
    return { success: false, message: 'Slip gaji tidak ditemukan.' };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 * DASHBOARD MONITORING & ANALYTICS
 * ============================================================================ */

function handleGetDashboard_(sessionUser, payload) {
  var period = String(payload.period || 'today');
  var today = formatJakartaDate_();
  var now = new Date();
  var startDate = today;

  if (period === 'week') {
    var weekAgo = new Date(now.getTime() - 6 * 86400000);
    startDate = formatJakartaDate_(weekAgo);
  } else if (period === 'month') {
    startDate = today.substring(0, 7) + '-01';
  }

  var empRows = getDataRows_(SHEET_NAMES.KARYAWAN);
  var absRows = getDataRows_(SHEET_NAMES.ABSENSI);
  var cutiRows = getDataRows_(SHEET_NAMES.CUTI);
  var lemburRows = getDataRows_(SHEET_NAMES.LEMBUR);
  var liburRows = getDataRows_(SHEET_NAMES.HARI_LIBUR);

  var empMap = {};
  var activeEmployees = [];
  var deptTotals = {};

  for (var i = 0; i < empRows.length; i++) {
    var e = mapEmployeeRow_(empRows[i]);
    empMap[e.id] = e;
    if (e.status === 'Aktif' && e.role !== 'Admin') {
      activeEmployees.push(e);
      var dept = e.departemen || 'Umum';
      deptTotals[dept] = (deptTotals[dept] || 0) + 1;
    }
  }

  var isAdmin = sessionUser.role === 'Admin';
  var onTimeCount = 0;
  var lateCount = 0;
  var outsideCount = 0;
  var presentUniqueToday = {};
  var deptPresentToday = {};
  var myAttendancePeriod = 0;

  for (var a = 0; a < absRows.length; a++) {
    var abs = mapAttendanceRow_(absRows[a]);
    var absEmp = empMap[abs.idKaryawan];
    if (absEmp && absEmp.role === 'Admin') {
      continue;
    }
    if (abs.tanggal >= startDate && abs.tanggal <= today) {
      if (!isAdmin && abs.idKaryawan !== sessionUser.id) {
        continue;
      }
      if (abs.tipe === 'Masuk') {
        myAttendancePeriod++;
        if (abs.statusWaktu === 'Terlambat') lateCount++;
        else onTimeCount++;
        if (abs.statusLokasi === 'Luar Radius') outsideCount++;
      }
    }
    if (abs.tanggal === today && abs.tipe === 'Masuk') {
      presentUniqueToday[abs.idKaryawan] = abs;
      if (absEmp) {
        var dName = absEmp.departemen || 'Umum';
        deptPresentToday[dName] = deptPresentToday[dName] || {};
        deptPresentToday[dName][abs.idKaryawan] = true;
      }
    }
  }

  var pendingCuti = 0;
  var approvedLeaveToday = 0;
  for (var c = 0; c < cutiRows.length; c++) {
    var cuti = mapLeaveRow_(cutiRows[c]);
    if (!isAdmin && cuti.idKaryawan !== sessionUser.id) continue;
    if (cuti.status === 'Pending') pendingCuti++;
    if (cuti.status === 'Disetujui' && cuti.tglMulai <= today && cuti.tglSelesai >= today) {
      approvedLeaveToday++;
    }
  }

  var pendingLembur = 0;
  var approvedOvertimeHours = 0;
  for (var l = 0; l < lemburRows.length; l++) {
    var lmb = mapOvertimeRow_(lemburRows[l]);
    if (!isAdmin && lmb.idKaryawan !== sessionUser.id) continue;
    if (lmb.status === 'Pending') pendingLembur++;
    if (lmb.status === 'Disetujui' && lmb.tanggal >= startDate && lmb.tanggal <= today) {
      approvedOvertimeHours += lmb.durasiJam;
    }
  }

  // Progres per Departemen (untuk grafik progres ala referensi)
  var deptProgress = [];
  var deptNames = Object.keys(deptTotals);
  for (var d = 0; d < deptNames.length; d++) {
    var dn = deptNames[d];
    var totalInDept = deptTotals[dn];
    var presentCount = deptPresentToday[dn] ? Object.keys(deptPresentToday[dn]).length : 0;
    var pct = totalInDept > 0 ? Math.round((presentCount / totalInDept) * 100) : 0;
    deptProgress.push({
      departemen: dn,
      hadir: presentCount,
      total: totalInDept,
      persen: pct
    });
  }

  // Daftar pantauan kehadiran karyawan hari ini
  var employeeStatusList = [];
  var targetList = isAdmin ? activeEmployees.slice(0, 6) : [sessionUser];
  for (var m = 0; m < targetList.length; m++) {
    var em = targetList[m];
    var absToday = presentUniqueToday[em.id];
    employeeStatusList.push({
      id: em.id,
      nama: em.nama,
      jabatan: em.jabatan,
      fotoUrl: em.fotoUrl,
      statusHariIni: absToday ? absToday.statusWaktu : 'Belum Absen',
      jamMasuk: absToday ? absToday.waktu.substring(0, 5) : '-',
      skor: absToday ? (absToday.statusWaktu === 'Terlambat' ? 75 : 100) : 0
    });
  }

  // Jadwal hari libur mendatang
  var upcomingHolidays = [];
  for (var h = 0; h < liburRows.length; h++) {
    if (liburRows[h][COL_LIBUR.TANGGAL] >= today) {
      upcomingHolidays.push({
        id: liburRows[h][COL_LIBUR.ID],
        tanggal: liburRows[h][COL_LIBUR.TANGGAL],
        nama: liburRows[h][COL_LIBUR.NAMA]
      });
    }
  }
  upcomingHolidays.sort(function (x, y) { return x.tanggal.localeCompare(y.tanggal); });

  // Activity Feed gabungan (Absensi, Cuti, Lembur terbaru)
  var activities = [];
  for (var a2 = Math.max(0, absRows.length - 10); a2 < absRows.length; a2++) {
    var ab2 = mapAttendanceRow_(absRows[a2]);
    if (!isAdmin && ab2.idKaryawan !== sessionUser.id) continue;
    activities.push({
      type: 'absensi',
      nama: ab2.nama,
      fotoUrl: (empMap[ab2.idKaryawan] && empMap[ab2.idKaryawan].fotoUrl) || '',
      title: 'melakukan Absen ' + ab2.tipe,
      detail: ab2.statusWaktu + ' • ' + ab2.statusLokasi + ' (' + ab2.jarakMeter + ' m)',
      timestamp: ab2.createdAt || (ab2.tanggal + ' ' + ab2.waktu)
    });
  }
  for (var c2 = Math.max(0, cutiRows.length - 6); c2 < cutiRows.length; c2++) {
    var ct2 = mapLeaveRow_(cutiRows[c2]);
    if (!isAdmin && ct2.idKaryawan !== sessionUser.id) continue;
    activities.push({
      type: 'cuti',
      nama: ct2.nama,
      fotoUrl: (empMap[ct2.idKaryawan] && empMap[ct2.idKaryawan].fotoUrl) || '',
      title: 'mengajukan ' + ct2.jenis,
      detail: ct2.tglMulai + ' s/d ' + ct2.tglSelesai + ' • ' + ct2.status,
      timestamp: ct2.createdAt
    });
  }
  for (var l2 = Math.max(0, lemburRows.length - 6); l2 < lemburRows.length; l2++) {
    var lm2 = mapOvertimeRow_(lemburRows[l2]);
    if (!isAdmin && lm2.idKaryawan !== sessionUser.id) continue;
    activities.push({
      type: 'lembur',
      nama: lm2.nama,
      fotoUrl: (empMap[lm2.idKaryawan] && empMap[lm2.idKaryawan].fotoUrl) || '',
      title: 'mengajukan Lembur',
      detail: lm2.tanggal + ' (' + lm2.durasiJam + ' jam) • ' + lm2.status,
      timestamp: lm2.createdAt
    });
  }
  activities.sort(function (x, y) { return String(y.timestamp).localeCompare(String(x.timestamp)); });

  var totalActive = activeEmployees.length;
  var presentTodayCount = Object.keys(presentUniqueToday).length;
  var notYetCount = isAdmin ? Math.max(0, totalActive - presentTodayCount - approvedLeaveToday) : (presentTodayCount > 0 ? 0 : 1);

  return {
    success: true,
    period: period,
    today: today,
    pendingCounts: {
      cuti: pendingCuti,
      lembur: pendingLembur,
      total: pendingCuti + pendingLembur
    },
    kpis: {
      totalKaryawan: totalActive,
      hadirHariIni: presentTodayCount,
      tepatWaktu: onTimeCount,
      terlambat: lateCount,
      luarRadius: outsideCount,
      pendingApproval: pendingCuti + pendingLembur,
      totalJamLembur: Math.round(approvedOvertimeHours * 10) / 10,
      absensiSayaPeriode: myAttendancePeriod
    },
    overview: {
      tepatWaktu: onTimeCount,
      terlambat: lateCount,
      izinCuti: approvedLeaveToday,
      belumAbsen: notYetCount
    },
    deptProgress: deptProgress,
    employeeStatusList: employeeStatusList,
    upcomingHolidays: upcomingHolidays.slice(0, 5),
    activities: activities.slice(0, 8)
  };
}
