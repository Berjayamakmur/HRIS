/**
 * app.js
 * Frontend SPA Controller — HRIS Digital PT. BERJAYA MAKMUR INDONESIA
 * Standar Rekayasa ZettBOT v4.1:
 * - 100% Terhubung ke Backend Google Apps Script (Zero Hardcoded Dummy)
 * - Client-side In-Memory Cache + Invalidasi Otomatis + Optimistic UI
 * - Backend Search, Filter & Pagination
 * - Native Phone Camera + Mandatory GPS + Leaflet.js Office Radius
 * - jsPDF Kop Surat & TTD Ready-to-Print + Excel Export
 */

(function () {
  'use strict';

  // Isi URL Web App Google Apps Script (/exec) di sini sebelum deploy ke GitHub Pages / Vercel
  // Jika dikosongkan, user tetap bisa mengisi URL lewat tombol "Pengaturan URL Server Backend" di halaman Login.
  var DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycby3nWhp-Qks2-fcOD3QQJukwcMUvhpS-phMtjpPjD3BVS5wBaYuov3xyB6RDjmyEk4C/exec';

  var STORAGE_KEYS = {
    API_URL: 'hris_bmi_api_url',
    TOKEN: 'hris_bmi_token',
    USER: 'hris_bmi_user'
  };

  var state = {
    apiUrl: localStorage.getItem(STORAGE_KEYS.API_URL) || DEFAULT_API_URL,
    token: localStorage.getItem(STORAGE_KEYS.TOKEN) || '',
    user: safeJsonParse(localStorage.getItem(STORAGE_KEYS.USER), null),
    settings: {},
    route: 'dashboard',
    dashPeriod: 'today',
    cache: {},
    pendingCounts: { cuti: 0, lembur: 0, total: 0 },
    gps: { lat: null, lng: null, accuracy: null, jarak: null, statusLokasi: '', error: '' },
    selfieBase64: '',
    leaveFile: { base64: '', name: '', mime: '' },
    filters: {
      attendance: { search: '', dateFrom: '', dateTo: '', statusLokasi: 'ALL', tipe: 'ALL', offset: 0, limit: 15 },
      leaves: { search: '', status: 'ALL', jenis: 'ALL', offset: 0, limit: 15 },
      overtimes: { search: '', status: 'ALL', offset: 0, limit: 15 },
      payslips: { search: '', periode: '', status: 'ALL', offset: 0, limit: 15 },
      employees: { search: '', status: 'ALL', role: 'ALL', offset: 0, limit: 15 }
    },
    settingsTab: 'map',
    leafletMap: null,
    leafletMarker: null,
    leafletCircle: null
  };

  /* ==========================================================================
     UTILITIES & HELPERS
     ========================================================================== */

  function safeJsonParse(str, fallback) {
    try {
      return str ? JSON.parse(str) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function escapeHtml(val) {
    return String(val === null || val === undefined ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRupiah(num) {
    var n = Number(num || 0);
    return 'Rp ' + n.toLocaleString('id-ID');
  }

  function formatDateId(dateStr) {
    if (!dateStr) return '-';
    var parts = String(dateStr).split('-');
    if (parts.length !== 3) return dateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    var mIdx = parseInt(parts[1], 10) - 1;
    return parts[2] + ' ' + (months[mIdx] || parts[1]) + ' ' + parts[0];
  }

  function todayDateStr() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function currentMonthStr() {
    return todayDateStr().substring(0, 7);
  }

  function driveThumbUrl(driveUrl) {
    if (!driveUrl) return '';
    var match = String(driveUrl).match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return 'https://drive.google.com/thumbnail?id=' + match[1] + '&sz=w800';
    }
    return driveUrl;
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var toRad = function (deg) { return deg * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLon = toRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  function getInitials(name) {
    var parts = String(name || 'U').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function renderAvatarHtml(fotoUrl, nama, extraClass) {
    var thumb = driveThumbUrl(fotoUrl);
    var cls = 'avatar-circle' + (extraClass ? ' ' + extraClass : '');
    if (thumb) {
      return '<div class="' + cls + '"><img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(nama) + '" onerror="this.parentNode.textContent=\'' + escapeHtml(getInitials(nama)) + '\'" /></div>';
    }
    return '<div class="' + cls + '">' + escapeHtml(getInitials(nama)) + '</div>';
  }

  function renderStatusPill(statusText) {
    var s = String(statusText || '');
    var cls = 'neutral';
    if (['Disetujui', 'Tepat Waktu', 'Dalam Radius', 'Aktif', 'Terbit', 'Masuk'].indexOf(s) !== -1) cls = 'success';
    else if (['Pending', 'Terlambat', 'Luar Radius', 'Pulang Awal', 'Draft'].indexOf(s) !== -1) cls = 'warning';
    else if (['Ditolak', 'Nonaktif', 'Belum Absen'].indexOf(s) !== -1) cls = 'danger';
    else if (['Cuti', 'Ijin', 'Sakit', 'Pulang'].indexOf(s) !== -1) cls = 'info';
    return '<span class="status-pill ' + cls + '">' + escapeHtml(s) + '</span>';
  }

  function svgIcon(name) {
    var icons = {
      dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
      camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
      report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
      wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
      users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
      user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
      download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>',
      alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
    };
    return icons[name] || '';
  }

  /* ==========================================================================
     TOAST & CUSTOM MODAL SYSTEM (ANTI ALERT/CONFIRM BROWSER)
     ========================================================================== */

  function showToast(message, type) {
    var container = document.getElementById('toastContainer');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 3800);
  }

  function openModal(title, bodyHtml) {
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalBackdrop').classList.remove('hidden');
  }

  function closeModal() {
    document.getElementById('modalBackdrop').classList.add('hidden');
    document.getElementById('modalBody').innerHTML = '';
  }

  function confirmAction(title, message, confirmLabel, onConfirm) {
    var html = '<p style="margin-bottom:18px;color:var(--text-secondary)">' + escapeHtml(message) + '</p>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px">' +
      '<button type="button" class="btn btn-secondary" data-modal-cancel="1">Batal</button>' +
      '<button type="button" class="btn btn-danger" id="modalConfirmOkBtn">' + escapeHtml(confirmLabel || 'Ya, Lanjutkan') + '</button>' +
      '</div>';
    openModal(title, html);
    document.querySelector('[data-modal-cancel]').addEventListener('click', closeModal);
    document.getElementById('modalConfirmOkBtn').addEventListener('click', function () {
      closeModal();
      onConfirm();
    });
  }

  /* ==========================================================================
     API COMMUNICATION & CACHE LAYER
     ========================================================================== */

  async function apiCall(action, payload) {
    if (!state.apiUrl) {
      throw new Error('URL Server Backend Google Apps Script belum diatur.');
    }

    var res = await fetch(state.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: action,
        token: state.token || '',
        payload: payload || {}
      })
    });

    if (!res.ok) {
      throw new Error('Gagal terhubung ke server (HTTP ' + res.status + ').');
    }

    var data = await res.json();
    if (!data.success) {
      if (data.code === 'UNAUTHORIZED') {
        handleForceLogout();
      }
      throw new Error(data.message || 'Permintaan gagal diproses.');
    }
    return data;
  }

  function invalidateCache(prefixes) {
    if (!prefixes || !prefixes.length) {
      state.cache = {};
      return;
    }
    Object.keys(state.cache).forEach(function (k) {
      for (var i = 0; i < prefixes.length; i++) {
        if (k.indexOf(prefixes[i]) === 0) {
          delete state.cache[k];
        }
      }
    });
  }

  function compressImageFile(file, maxDimension, quality) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (ev) {
        var img = new Image();
        img.onload = function () {
          var w = img.width;
          var h = img.height;
          var max = maxDimension || 800;
          if (w > h && w > max) {
            h = Math.round(h * (max / w));
            w = max;
          } else if (h >= w && h > max) {
            w = Math.round(w * (max / h));
            h = max;
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality || 0.78));
        };
        img.onerror = function () { reject(new Error('Gagal memproses gambar.')); };
        img.src = ev.target.result;
      };
      reader.onerror = function () { reject(new Error('Gagal membaca file gambar.')); };
      reader.readAsDataURL(file);
    });
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) { resolve(e.target.result); };
      reader.onerror = function () { reject(new Error('Gagal membaca file.')); };
      reader.readAsDataURL(file);
    });
  }

  /* ==========================================================================
     AUTH & NAVIGATION SHELL
     ========================================================================== */

  function isAdmin() {
    return state.user && state.user.role === 'Admin';
  }

  function getNavItems() {
    var items = [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'absen', label: 'Absensi Selfie', icon: 'camera' },
      { id: 'rekap', label: 'Rekap & PDF', icon: 'report' },
      { id: 'cuti', label: 'Cuti / Ijin / Sakit', icon: 'calendar', badge: isAdmin() ? state.pendingCounts.cuti : 0 },
      { id: 'lembur', label: 'Pengajuan Lembur', icon: 'clock', badge: isAdmin() ? state.pendingCounts.lembur : 0 },
      { id: 'gaji', label: 'Slip Gaji', icon: 'wallet' }
    ];
    if (isAdmin()) {
      items.push({ id: 'karyawan', label: 'Kelola Karyawan', icon: 'users' });
      items.push({ id: 'pengaturan', label: 'Pengaturan & Map', icon: 'mapPin' });
    }
    items.push({ id: 'profil', label: 'Profil Saya', icon: 'user' });
    return items;
  }

  function renderNavigation() {
    var navItems = getNavItems();

    // Sidebar Desktop
    var sidebarHtml = navItems.map(function (item) {
      var activeCls = state.route === item.id ? ' active' : '';
      var badgeHtml = item.badge > 0 ? '<span class="nav-badge">' + item.badge + '</span>' : '';
      return '<button type="button" class="nav-item' + activeCls + '" data-nav="' + item.id + '">' +
        svgIcon(item.icon) +
        '<span>' + escapeHtml(item.label) + '</span>' +
        badgeHtml +
        '</button>';
    }).join('');
    document.getElementById('sidebarNav').innerHTML = sidebarHtml;

    // Mobile Bottom Bar (4 utama + Lainnya)
    var primaryIds = ['dashboard', 'absen', 'cuti', 'gaji'];
    var bottomHtml = primaryIds.map(function (pid) {
      var found = navItems.find(function (it) { return it.id === pid; });
      if (!found) return '';
      var shortLabel = pid === 'dashboard' ? 'Beranda' : (pid === 'absen' ? 'Absen' : (pid === 'cuti' ? 'Izin/Cuti' : 'Slip Gaji'));
      var activeCls = state.route === pid ? ' active' : '';
      return '<button type="button" class="bottom-nav-btn' + activeCls + '" data-nav="' + pid + '">' +
        svgIcon(found.icon) +
        '<span>' + shortLabel + '</span>' +
        '</button>';
    }).join('');

    var isOverflowActive = primaryIds.indexOf(state.route) === -1;
    bottomHtml += '<button type="button" class="bottom-nav-btn' + (isOverflowActive ? ' active' : '') + '" id="openMobileDrawerBtn">' +
      svgIcon('menu') +
      '<span>Lainnya</span>' +
      '</button>';
    document.getElementById('mobileBottomNav').innerHTML = bottomHtml;

    // Mobile Drawer Items (sisa menu)
    var drawerItems = navItems.filter(function (it) { return primaryIds.indexOf(it.id) === -1; });
    var drawerHtml = drawerItems.map(function (item) {
      return '<button type="button" class="drawer-item" data-nav="' + item.id + '">' +
        svgIcon(item.icon) +
        '<span>' + escapeHtml(item.label) + '</span>' +
        '</button>';
    }).join('');
    drawerHtml += '<button type="button" class="drawer-item" id="drawerLogoutBtn">' +
      svgIcon('logout') + '<span>Keluar Akun</span></button>';
    document.getElementById('mobileDrawerList').innerHTML = drawerHtml;

    // Update Topbar & Sidebar Info
    if (state.user) {
      document.getElementById('topbarUserName').textContent = state.user.nama;
      document.getElementById('topbarUserRole').textContent = state.user.jabatan + ' (' + state.user.role + ')';
      document.getElementById('topbarAvatar').outerHTML = renderAvatarHtml(state.user.fotoUrl, state.user.nama, '').replace('class="avatar-circle"', 'id="topbarAvatar" class="avatar-circle"');
    }

    var jamM = state.settings.JAM_MASUK || '08:00';
    var jamP = state.settings.JAM_PULANG || '17:00';
    var rad = state.settings.RADIUS_METER || '150';
    document.getElementById('sidebarShiftInfo').textContent = 'Shift ' + jamM + ' - ' + jamP + ' • Radius ' + rad + 'm';

    var badgeEl = document.getElementById('notifBadge');
    if (isAdmin() && state.pendingCounts.total > 0) {
      badgeEl.textContent = String(state.pendingCounts.total);
      badgeEl.classList.remove('hidden');
    } else {
      badgeEl.classList.add('hidden');
    }
  }

  function navigateTo(routeId) {
    state.route = routeId;
    document.getElementById('mobileDrawerBackdrop').classList.add('hidden');
    renderNavigation();
    renderCurrentRoute();
  }

  function handleForceLogout() {
    state.token = '';
    state.user = null;
    state.cache = {};
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    document.getElementById('appShell').classList.add('hidden');
    document.getElementById('loginView').classList.remove('hidden');
  }

  async function testServerConnection(urlToTest) {
    var pill = document.getElementById('serverStatusPill');
    if (!urlToTest) {
      pill.className = 'status-pill warning';
      pill.textContent = 'URL Server Belum Diisi';
      return false;
    }
    pill.className = 'status-pill info';
    pill.textContent = 'Mengecek Koneksi...';
    try {
      var res = await fetch(urlToTest, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'ping', payload: {} })
      });
      var data = await res.json();
      if (data && data.success) {
        pill.className = 'status-pill success';
        pill.textContent = 'Terhubung ke Server';
        return true;
      }
    } catch (e) {
      // fallback message below
    }
    pill.className = 'status-pill danger';
    pill.textContent = 'Gagal Terhubung';
    return false;
  }

  function openApiConfigModal() {
    var html = '<form id="apiConfigForm" class="stack-form">' +
      '<div class="form-group">' +
      '<label for="apiUrlInput">URL Web App Google Apps Script (/exec)</label>' +
      '<input type="url" id="apiUrlInput" placeholder="https://script.google.com/macros/s/.../exec" value="' + escapeHtml(state.apiUrl) + '" required />' +
      '<small style="color:var(--text-muted)">Dapatkan dari menu Deploy -> New deployment -> Web app (Who has access: Anyone) di Google Apps Script.</small>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px">' +
      '<button type="button" class="btn btn-secondary" id="cancelApiModalBtn">Tutup</button>' +
      '<button type="submit" class="btn btn-primary" id="saveApiUrlBtn">Simpan &amp; Tes Koneksi</button>' +
      '</div></form>';
    openModal('Pengaturan Server Backend', html);
    document.getElementById('cancelApiModalBtn').addEventListener('click', closeModal);
    document.getElementById('apiConfigForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('saveApiUrlBtn');
      var urlVal = document.getElementById('apiUrlInput').value.trim();
      btn.disabled = true;
      btn.textContent = 'Menghubungkan...';
      try {
        var ok = await testServerConnection(urlVal);
        if (ok) {
          state.apiUrl = urlVal;
          localStorage.setItem(STORAGE_KEYS.API_URL, urlVal);
          showToast('Berhasil terhubung ke server Google Apps Script!', 'success');
          closeModal();
        } else {
          showToast('Tidak dapat menjangkau URL tersebut. Pastikan Deploy akses diset ke "Anyone".', 'error');
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Simpan & Tes Koneksi';
      }
    });
  }

  /* ==========================================================================
     ROUTE RENDERER
     ========================================================================== */

  async function renderCurrentRoute() {
    var container = document.getElementById('pageContent');
    if (state.route === 'dashboard') await renderDashboardView(container);
    else if (state.route === 'absen') await renderAbsensiView(container);
    else if (state.route === 'rekap') await renderRekapView(container);
    else if (state.route === 'cuti') await renderCutiView(container);
    else if (state.route === 'lembur') await renderLemburView(container);
    else if (state.route === 'gaji') await renderGajiView(container);
    else if (state.route === 'karyawan') await renderKaryawanView(container);
    else if (state.route === 'pengaturan') await renderPengaturanView(container);
    else if (state.route === 'profil') await renderProfilView(container);
  }

  function renderLoadingState(container, label) {
    container.innerHTML = '<div class="card" style="text-align:center;padding:42px 20px;color:var(--text-muted)">' +
      '<p style="font-weight:600">' + escapeHtml(label || 'Memuat data dari server...') + '</p></div>';
  }

  /* ==========================================================================
     1. DASHBOARD VIEW (TEAM FLOW INSPIRED)
     ========================================================================== */

  function buildDonutSvg(overview) {
    var tw = Number(overview.tepatWaktu || 0);
    var tl = Number(overview.terlambat || 0);
    var iz = Number(overview.izinCuti || 0);
    var bl = Number(overview.belumAbsen || 0);
    var total = tw + tl + iz + bl;

    var r = 54;
    var circ = 2 * Math.PI * r;
    if (total === 0) {
      return '<svg viewBox="0 0 144 144" width="144" height="144">' +
        '<circle cx="72" cy="72" r="' + r + '" fill="none" stroke="#e2e8f0" stroke-width="18"></circle>' +
        '</svg>';
    }

    var segments = [
      { val: tw, color: '#10b981' },
      { val: bl, color: '#3b82f6' },
      { val: iz, color: '#f59e0b' },
      { val: tl, color: '#ef4444' }
    ];
    var offset = 0;
    var circles = segments.map(function (seg) {
      if (seg.val <= 0) return '';
      var len = (seg.val / total) * circ;
      var dash = len + ' ' + circ;
      var el = '<circle cx="72" cy="72" r="' + r + '" fill="none" stroke="' + seg.color + '" stroke-width="18" ' +
        'stroke-dasharray="' + dash + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 72 72)"></circle>';
      offset += len;
      return el;
    }).join('');

    return '<svg viewBox="0 0 144 144" width="144" height="144">' + circles + '</svg>';
  }

  async function renderDashboardView(container) {
    var cacheKey = 'dashboard:' + state.dashPeriod;
    var data = state.cache[cacheKey];

    if (!data) {
      renderLoadingState(container, 'Memuat ringkasan dashboard...');
      try {
        data = await apiCall('getDashboard', { period: state.dashPeriod });
        state.cache[cacheKey] = data;
      } catch (err) {
        container.innerHTML = '<div class="card"><p style="color:var(--rose)">' + escapeHtml(err.message) + '</p></div>';
        return;
      }
    }

    state.pendingCounts = data.pendingCounts || { cuti: 0, lembur: 0, total: 0 };
    renderNavigation();

    var kpis = data.kpis || {};
    var ov = data.overview || {};
    var totalOv = Number(ov.tepatWaktu || 0) + Number(ov.terlambat || 0) + Number(ov.izinCuti || 0) + Number(ov.belumAbsen || 0);
    var adminMode = isAdmin();

    var metricsHtml = '' +
      '<div class="metric-card">' +
      '<div class="metric-icon blue">' + svgIcon('users') + '</div>' +
      '<div class="metric-body"><div class="metric-label">' + (adminMode ? 'Hadir Hari Ini' : 'Absensi Periode Ini') + '</div>' +
      '<div class="metric-value-row"><span class="metric-value">' + (adminMode ? kpis.hadirHariIni + '/' + kpis.totalKaryawan : kpis.absensiSayaPeriode) + '</span>' +
      '<span class="metric-trend trend-up">Aktif</span></div>' +
      '<div class="metric-sub">PT. BERJAYA MAKMUR</div></div></div>' +

      '<div class="metric-card">' +
      '<div class="metric-icon emerald">' + svgIcon('check') + '</div>' +
      '<div class="metric-body"><div class="metric-label">Absen Tepat Waktu</div>' +
      '<div class="metric-value-row"><span class="metric-value">' + kpis.tepatWaktu + '</span>' +
      '<span class="metric-trend trend-up">On-Time</span></div>' +
      '<div class="metric-sub">' + kpis.terlambat + ' kali terlambat</div></div></div>' +

      '<div class="metric-card">' +
      '<div class="metric-icon amber">' + svgIcon('calendar') + '</div>' +
      '<div class="metric-body"><div class="metric-label">Menunggu Approval</div>' +
      '<div class="metric-value-row"><span class="metric-value">' + kpis.pendingApproval + '</span>' +
      '<span class="metric-trend trend-warn">Pending</span></div>' +
      '<div class="metric-sub">Cuti &amp; Lembur</div></div></div>' +

      '<div class="metric-card">' +
      '<div class="metric-icon violet">' + svgIcon('clock') + '</div>' +
      '<div class="metric-body"><div class="metric-label">Jam Lembur Disetujui</div>' +
      '<div class="metric-value-row"><span class="metric-value">' + kpis.totalJamLembur + '</span>' +
      '<span class="metric-trend trend-up">Jam</span></div>' +
      '<div class="metric-sub">' + kpis.luarRadius + ' absen luar radius</div></div></div>';

    var deptHtml = (data.deptProgress && data.deptProgress.length)
      ? data.deptProgress.map(function (dp, idx) {
          var colors = ['', 'blue', 'amber', 'violet'];
          var cCls = colors[idx % colors.length];
          return '<div class="progress-item">' +
            '<div class="progress-item-head"><span>' + escapeHtml(dp.departemen) + ' (' + dp.hadir + '/' + dp.total + ')</span><span>' + dp.persen + '%</span></div>' +
            '<div class="progress-track"><div class="progress-fill ' + cCls + '" style="width:' + dp.persen + '%"></div></div>' +
            '</div>';
        }).join('')
      : '<p style="color:var(--text-muted)">Belum ada data departemen.</p>';

    var empListHtml = (data.employeeStatusList && data.employeeStatusList.length)
      ? data.employeeStatusList.map(function (em, idx) {
          var fillCls = em.statusHariIni === 'Terlambat' ? 'amber' : (idx % 2 === 1 ? 'blue' : '');
          return '<div class="emp-mini-row">' +
            renderAvatarHtml(em.fotoUrl, em.nama, '') +
            '<div class="emp-mini-meta"><strong>' + escapeHtml(em.nama) + '</strong><span>' + escapeHtml(em.jabatan) + ' • ' + escapeHtml(em.statusHariIni) + ' (' + escapeHtml(em.jamMasuk) + ')</span></div>' +
            '<div style="width:68px"><div class="progress-track"><div class="progress-fill ' + fillCls + '" style="width:' + em.skor + '%"></div></div></div>' +
            '</div>';
        }).join('')
      : '<p style="color:var(--text-muted)">Belum ada data karyawan.</p>';

    var holidayHtml = (data.upcomingHolidays && data.upcomingHolidays.length)
      ? data.upcomingHolidays.map(function (h) {
          return '<div class="feed-item">' +
            '<div class="status-pill info">' + escapeHtml(formatDateId(h.tanggal)) + '</div>' +
            '<div class="feed-content"><p><strong>' + escapeHtml(h.nama) + '</strong></p><small>Hari Libur Terdaftar</small></div>' +
            '</div>';
        }).join('')
      : '<p style="color:var(--text-muted)">Tidak ada jadwal hari libur mendatang.</p>';

    var feedHtml = (data.activities && data.activities.length)
      ? data.activities.map(function (act) {
          return '<div class="feed-item">' +
            renderAvatarHtml(act.fotoUrl, act.nama, '') +
            '<div class="feed-content"><p><strong>' + escapeHtml(act.nama) + '</strong> ' + escapeHtml(act.title) + '</p>' +
            '<small>' + escapeHtml(act.detail) + '</small></div>' +
            '<span class="feed-time">' + escapeHtml(String(act.timestamp || '').substring(11, 16)) + '</span>' +
            '</div>';
        }).join('')
      : '<p style="color:var(--text-muted)">Belum ada aktivitas tercatat.</p>';

    container.innerHTML = '' +
      '<div class="page-header">' +
      '<div><h1 class="page-title">Selamat Datang, ' + escapeHtml(state.user.nama.split(' ')[0]) + '!</h1>' +
      '<p class="page-subtitle">Ringkasan kehadiran &amp; operasional PT. BERJAYA MAKMUR INDONESIA — ' + escapeHtml(formatDateId(data.today)) + '</p></div>' +
      '<div class="header-actions">' +
      '<select id="dashPeriodSelect" style="padding:9px 12px;border-radius:10px;border:1px solid var(--border-strong);background:#fff;font-weight:600">' +
      '<option value="today"' + (state.dashPeriod === 'today' ? ' selected' : '') + '>Hari Ini</option>' +
      '<option value="week"' + (state.dashPeriod === 'week' ? ' selected' : '') + '>7 Hari Terakhir</option>' +
      '<option value="month"' + (state.dashPeriod === 'month' ? ' selected' : '') + '>Bulan Ini</option>' +
      '</select>' +
      '<button type="button" class="btn btn-primary" data-nav="absen">' + svgIcon('camera') + '<span>Absen Sekarang</span></button>' +
      '</div></div>' +

      '<div class="metrics-grid">' + metricsHtml + '</div>' +

      '<div class="dash-grid-3">' +
      '<div class="card"><div class="card-header"><h2 class="card-title">Kehadiran Departemen</h2><button type="button" class="btn-link" data-nav="rekap">Lihat Rekap →</button></div><div class="progress-list">' + deptHtml + '</div></div>' +

      '<div class="card"><div class="card-header"><h2 class="card-title">Ringkasan Absensi</h2></div>' +
      '<div class="donut-wrap">' +
      '<div class="donut-svg-box">' + buildDonutSvg(ov) + '<div class="donut-center"><strong>' + totalOv + '</strong><span>Total Data</span></div></div>' +
      '<div class="donut-legend">' +
      '<div class="legend-item"><span class="legend-left"><span class="dot emerald"></span>Tepat Waktu</span><strong>' + (ov.tepatWaktu || 0) + '</strong></div>' +
      '<div class="legend-item"><span class="legend-left"><span class="dot blue"></span>Belum Absen</span><strong>' + (ov.belumAbsen || 0) + '</strong></div>' +
      '<div class="legend-item"><span class="legend-left"><span class="dot amber"></span>Ijin / Cuti</span><strong>' + (ov.izinCuti || 0) + '</strong></div>' +
      '<div class="legend-item"><span class="legend-left"><span class="dot rose"></span>Terlambat</span><strong>' + (ov.terlambat || 0) + '</strong></div>' +
      '</div></div></div>' +

      '<div class="card"><div class="card-header"><h2 class="card-title">Pantauan Kehadiran</h2>' + (adminMode ? '<button type="button" class="btn-link" data-nav="karyawan">Semua →</button>' : '') + '</div><div class="emp-mini-list">' + empListHtml + '</div></div>' +
      '</div>' +

      '<div class="dash-grid-2">' +
      '<div class="card"><div class="card-header"><h2 class="card-title">Hari Libur Mendatang</h2>' + (adminMode ? '<button type="button" class="btn-link" data-nav="pengaturan">Atur →</button>' : '') + '</div><div class="feed-list">' + holidayHtml + '</div></div>' +
      '<div class="card"><div class="card-header"><h2 class="card-title">Aktivitas Terbaru</h2><button type="button" class="btn-link" data-nav="rekap">Detail →</button></div><div class="feed-list">' + feedHtml + '</div></div>' +
      '</div>';

    document.getElementById('dashPeriodSelect').addEventListener('change', function (e) {
      state.dashPeriod = e.target.value;
      renderDashboardView(container);
    });
  }

  /* ==========================================================================
     2. ABSENSI SELFIE (KAMERA NATIVE HP) + GPS + RADIUS
     ========================================================================== */

  function refreshGpsPosition() {
    var gpsBox = document.getElementById('gpsStatusBox');
    if (!gpsBox) return;

    if (!navigator.geolocation) {
      state.gps.error = 'Browser perangkat tidak mendukung GPS.';
      updateGpsUi();
      return;
    }

    gpsBox.innerHTML = '<div><strong>Mendeteksi lokasi GPS...</strong><p class="cell-sub">Pastikan izin lokasi &amp; GPS HP dalam kondisi menyala.</p></div>';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
        var kLat = parseFloat(state.settings.KANTOR_LAT || '-6.2088');
        var kLng = parseFloat(state.settings.KANTOR_LNG || '106.8456');
        var rad = parseInt(state.settings.RADIUS_METER || '150', 10);
        var jarak = haversineMeters(lat, lng, kLat, kLng);
        state.gps = {
          lat: lat,
          lng: lng,
          accuracy: Math.round(pos.coords.accuracy || 0),
          jarak: jarak,
          statusLokasi: jarak <= rad ? 'Dalam Radius' : 'Luar Radius',
          error: ''
        };
        updateGpsUi();
      },
      function (err) {
        state.gps.lat = null;
        state.gps.lng = null;
        state.gps.error = 'GPS gagal diakses (' + (err.message || 'Izin ditolak') + '). Wajib nyalakan GPS untuk absen.';
        updateGpsUi();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function updateGpsUi() {
    var gpsBox = document.getElementById('gpsStatusBox');
    var alasanWrap = document.getElementById('alasanLuarRadiusGroup');
    var alasanInput = document.getElementById('alasanLuarInput');
    if (!gpsBox) return;

    if (state.gps.error || state.gps.lat === null) {
      gpsBox.className = 'gps-banner out-radius';
      gpsBox.innerHTML = '<div><strong>GPS Belum Aktif</strong><p class="cell-sub">' + escapeHtml(state.gps.error || 'Menunggu sinyal lokasi...') + '</p></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="retryGpsBtn">Aktifkan GPS</button>';
      if (alasanWrap) alasanWrap.classList.add('hidden');
      if (alasanInput) alasanInput.required = false;
    } else {
      var inRad = state.gps.statusLokasi === 'Dalam Radius';
      var mapsUrl = 'https://www.google.com/maps?q=' + state.gps.lat.toFixed(6) + ',' + state.gps.lng.toFixed(6);
      gpsBox.className = 'gps-banner ' + (inRad ? 'in-radius' : 'out-radius');
      gpsBox.innerHTML = '<div>' +
        '<strong>' + (inRad ? 'Dalam Radius Kantor' : 'Di Luar Radius Kantor') + ' (' + state.gps.jarak + ' m)</strong>' +
        '<p class="cell-sub">Koordinat: ' + state.gps.lat.toFixed(6) + ', ' + state.gps.lng.toFixed(6) + ' • <a href="' + mapsUrl + '" target="_blank" rel="noopener">Lihat Google Maps</a></p>' +
        '</div>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="retryGpsBtn">Perbarui GPS</button>';

      if (alasanWrap && alasanInput) {
        if (inRad) {
          alasanWrap.classList.add('hidden');
          alasanInput.required = false;
        } else {
          alasanWrap.classList.remove('hidden');
          alasanInput.required = true;
        }
      }
    }

    var retryBtn = document.getElementById('retryGpsBtn');
    if (retryBtn) retryBtn.addEventListener('click', refreshGpsPosition);
  }

  async function renderAbsensiView(container) {
    var cacheKey = 'absenToday';
    var todayData = state.cache[cacheKey];
    if (!todayData) {
      renderLoadingState(container, 'Memuat status absensi hari ini...');
      try {
        todayData = await apiCall('getAttendanceStatusToday', {});
        state.cache[cacheKey] = todayData;
        if (todayData.settings) state.settings = todayData.settings;
      } catch (err) {
        container.innerHTML = '<div class="card"><p style="color:var(--rose)">' + escapeHtml(err.message) + '</p></div>';
        return;
      }
    }

    var masuk = todayData.masuk;
    var pulang = todayData.pulang;
    var nextTipe = !masuk ? 'Masuk' : (!pulang ? 'Pulang' : 'Selesai');

    var selfiePreviewHtml = state.selfieBase64
      ? '<img src="' + state.selfieBase64 + '" class="selfie-preview" alt="Preview Selfie" />'
      : '<div style="color:var(--text-muted)">' + svgIcon('camera') + '<p style="margin-top:6px">Belum ada foto selfie. Tekan tombol di bawah untuk membuka aplikasi kamera HP.</p></div>';

    var formHtml = nextTipe === 'Selesai'
      ? '<div class="card" style="text-align:center;padding:34px 20px">' +
        '<div class="metric-icon emerald" style="margin:0 auto 12px">' + svgIcon('check') + '</div>' +
        '<h3>Absensi Hari Ini Lengkap</h3>' +
        '<p class="page-subtitle">Anda sudah melakukan Absen Masuk dan Absen Pulang untuk tanggal ' + escapeHtml(formatDateId(todayData.tanggal)) + '.</p></div>'
      : '<form id="attendanceForm" class="card stack-form">' +
        '<div class="card-header"><h2 class="card-title">Form Absen ' + nextTipe + '</h2>' + renderStatusPill(nextTipe) + '</div>' +
        '<div id="gpsStatusBox" class="gps-banner">Mendeteksi lokasi GPS...</div>' +
        '<div class="selfie-box">' + selfiePreviewHtml +
        '<input type="file" id="selfieNativeInput" accept="image/*" capture="user" class="hidden" />' +
        '<label for="selfieNativeInput" class="btn btn-secondary" style="cursor:pointer">' + svgIcon('camera') + '<span>' + (state.selfieBase64 ? 'Ambil Ulang Selfie (Kamera HP)' : 'Buka Kamera HP &amp; Ambil Selfie') + '</span></label>' +
        '</div>' +
        '<div id="alasanLuarRadiusGroup" class="form-group hidden">' +
        '<label for="alasanLuarInput">Alasan Absen di Luar Radius Kantor (Wajib diisi)</label>' +
        '<textarea id="alasanLuarInput" placeholder="Jelaskan alasan absen di luar lokasi kantor (misal: Dinas luar, Kunjungan klien)..."></textarea>' +
        '</div>' +
        '<button type="submit" id="submitAbsenBtn" class="btn btn-primary btn-block">' + svgIcon('check') + '<span>Kirim Absen ' + nextTipe + '</span></button>' +
        '</form>';

    var statusCardHtml = '<div class="card stack-form">' +
      '<div class="card-header"><h2 class="card-title">Status Kehadiran Hari Ini</h2><span class="cell-sub">' + escapeHtml(formatDateId(todayData.tanggal)) + '</span></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div style="padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-subtle)">' +
      '<div class="cell-sub">Absen Masuk</div>' +
      '<div style="font-size:18px;font-weight:800;margin:4px 0">' + (masuk ? escapeHtml(masuk.waktu) : '--:--') + '</div>' +
      (masuk ? renderStatusPill(masuk.statusWaktu) : renderStatusPill('Belum Absen')) +
      (masuk && masuk.mapsUrl ? '<div style="margin-top:8px"><a href="' + escapeHtml(masuk.mapsUrl) + '" target="_blank" rel="noopener" class="btn-link">Lihat Maps</a></div>' : '') +
      '</div>' +
      '<div style="padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg-subtle)">' +
      '<div class="cell-sub">Absen Pulang</div>' +
      '<div style="font-size:18px;font-weight:800;margin:4px 0">' + (pulang ? escapeHtml(pulang.waktu) : '--:--') + '</div>' +
      (pulang ? renderStatusPill(pulang.statusWaktu) : renderStatusPill('Belum Absen')) +
      (pulang && pulang.mapsUrl ? '<div style="margin-top:8px"><a href="' + escapeHtml(pulang.mapsUrl) + '" target="_blank" rel="noopener" class="btn-link">Lihat Maps</a></div>' : '') +
      '</div></div>' +
      '<div style="padding:12px;border-radius:12px;background:var(--emerald-soft);font-size:12.5px;color:var(--emerald-dark)">' +
      '<strong>Info Kantor:</strong> Jam kerja ' + escapeHtml(state.settings.JAM_MASUK || '08:00') + ' - ' + escapeHtml(state.settings.JAM_PULANG || '17:00') +
      ' • Toleransi ' + escapeHtml(state.settings.TOLERANSI_MENIT || '15') + ' menit • Batas radius ' + escapeHtml(state.settings.RADIUS_METER || '150') + ' m.' +
      '</div></div>';

    container.innerHTML = '' +
      '<div class="page-header"><div><h1 class="page-title">Absensi Selfie &amp; GPS</h1>' +
      '<p class="page-subtitle">Gunakan kamera bawaan HP dan pastikan GPS aktif sebelum mengirim absensi.</p></div></div>' +
      '<div class="absen-grid">' + formHtml + statusCardHtml + '</div>';

    if (nextTipe !== 'Selesai') {
      refreshGpsPosition();

      document.getElementById('selfieNativeInput').addEventListener('change', async function (ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        try {
          state.selfieBase64 = await compressImageFile(file, 760, 0.78);
          renderAbsensiView(container);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });

      document.getElementById('attendanceForm').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (state.gps.lat === null || state.gps.lng === null) {
          showToast('GPS wajib aktif! Klik "Aktifkan GPS" terlebih dahulu.', 'error');
          return;
        }
        if (!state.selfieBase64) {
          showToast('Silakan ambil foto selfie dengan kamera HP terlebih dahulu.', 'error');
          return;
        }
        var alasanVal = document.getElementById('alasanLuarInput') ? document.getElementById('alasanLuarInput').value.trim() : '';
        if (state.gps.statusLokasi === 'Luar Radius' && alasanVal.length < 5) {
          showToast('Anda berada di luar radius kantor. Isi alasan minimal 5 karakter.', 'warning');
          return;
        }

        var btn = document.getElementById('submitAbsenBtn');
        btn.disabled = true;
        btn.innerHTML = '<span>Mengunggah Selfie &amp; Menyimpan...</span>';

        try {
          var res = await apiCall('submitAttendance', {
            tipe: nextTipe,
            lat: state.gps.lat,
            lng: state.gps.lng,
            fotoBase64: state.selfieBase64,
            alasanLuar: alasanVal
          });
          state.selfieBase64 = '';
          invalidateCache(['absenToday', 'dashboard', 'attendance:']);
          showToast(res.message, 'success');
          await renderAbsensiView(container);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.innerHTML = svgIcon('check') + '<span>Kirim Absen ' + nextTipe + '</span>';
        }
      });
    }
  }

  /* ==========================================================================
     3. REKAP ABSENSI + PDF KOP SURAT + TTD + EXPORT EXCEL
     ========================================================================== */

  async function renderRekapView(container) {
    var f = state.filters.attendance;
    var cacheKey = 'attendance:' + JSON.stringify(f);
    var data = state.cache[cacheKey];

    if (!data) {
      renderLoadingState(container, 'Memuat data rekap absensi...');
      try {
        data = await apiCall('getAttendance', f);
        state.cache[cacheKey] = data;
      } catch (err) {
        container.innerHTML = '<div class="card"><p style="color:var(--rose)">' + escapeHtml(err.message) + '</p></div>';
        return;
      }
    }

    var rowsHtml = (data.items && data.items.length)
      ? data.items.map(function (r) {
          var fotoLink = r.fotoUrl
            ? '<button type="button" class="btn btn-secondary btn-sm" data-action="previewFoto" data-url="' + escapeHtml(r.fotoUrl) + '" data-title="Selfie ' + escapeHtml(r.nama) + '">Foto</button>'
            : '-';
          var mapsLink = r.mapsUrl
            ? '<a href="' + escapeHtml(r.mapsUrl) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Maps</a>'
            : '-';
          return '<tr>' +
            '<td><div class="cell-main">' + escapeHtml(r.tanggal) + '</div><div class="cell-sub">' + escapeHtml(r.id) + '</div></td>' +
            '<td><div class="cell-main">' + escapeHtml(r.nama) + '</div><div class="cell-sub">' + escapeHtml(r.idKaryawan) + '</div></td>' +
            '<td>' + renderStatusPill(r.tipe) + '<div class="cell-sub" style="margin-top:4px">' + escapeHtml(r.waktu) + '</div></td>' +
            '<td>' + renderStatusPill(r.statusWaktu) + '</td>' +
            '<td>' + renderStatusPill(r.statusLokasi) + '<div class="cell-sub">' + r.jarakMeter + ' m' + (r.alasanLuar && r.alasanLuar !== '-' ? ' • ' + escapeHtml(r.alasanLuar) : '') + '</div></td>' +
            '<td><div class="table-actions">' + fotoLink + mapsLink + '</div></td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-muted)">Tidak ada data absensi sesuai filter.</td></tr>';

    container.innerHTML = '' +
      '<div class="page-header">' +
      '<div><h1 class="page-title">Rekap Absensi &amp; Laporan</h1><p class="page-subtitle">Pantau lokasi Maps, foto selfie Google Drive, serta cetak PDF berkop surat + TTD.</p></div>' +
      '<div class="header-actions">' +
      '<button type="button" id="exportExcelBtn" class="btn btn-secondary">' + svgIcon('download') + '<span>Export Excel</span></button>' +
      '<button type="button" id="exportPdfRekapBtn" class="btn btn-primary">' + svgIcon('report') + '<span>Download PDF (Kop + TTD)</span></button>' +
      '</div></div>' +

      '<div class="card">' +
      '<form id="rekapFilterForm" class="filter-bar">' +
      '<div class="form-group"><label>Cari Nama / NIP</label><input type="text" id="recSearch" value="' + escapeHtml(f.search) + '" placeholder="Ketik kata kunci..." /></div>' +
      '<div class="form-group"><label>Dari Tanggal</label><input type="date" id="recDateFrom" value="' + escapeHtml(f.dateFrom) + '" /></div>' +
      '<div class="form-group"><label>Sampai Tanggal</label><input type="date" id="recDateTo" value="' + escapeHtml(f.dateTo) + '" /></div>' +
      '<div class="form-group"><label>Status Lokasi</label><select id="recLokasi">' +
      '<option value="ALL"' + (f.statusLokasi === 'ALL' ? ' selected' : '') + '>Semua Lokasi</option>' +
      '<option value="Dalam Radius"' + (f.statusLokasi === 'Dalam Radius' ? ' selected' : '') + '>Dalam Radius</option>' +
      '<option value="Luar Radius"' + (f.statusLokasi === 'Luar Radius' ? ' selected' : '') + '>Luar Radius</option>' +
      '</select></div>' +
      '<button type="submit" class="btn btn-primary">Terapkan</button>' +
      '</form>' +

      '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      '<th>Tanggal &amp; ID</th><th>Karyawan</th><th>Tipe &amp; Jam</th><th>Ketepatan</th><th>Lokasi &amp; Alasan</th><th>Bukti</th>' +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      renderPaginationBar('rec', f, data) +
      '</div>';

    document.getElementById('rekapFilterForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      f.search = document.getElementById('recSearch').value.trim();
      f.dateFrom = document.getElementById('recDateFrom').value;
      f.dateTo = document.getElementById('recDateTo').value;
      f.statusLokasi = document.getElementById('recLokasi').value;
      f.offset = 0;
      renderRekapView(container);
    });

    bindPaginationBar('rec', f, function () { renderRekapView(container); });

    document.getElementById('exportPdfRekapBtn').addEventListener('click', handleDownloadRekapPdf);
    document.getElementById('exportExcelBtn').addEventListener('click', handleExportRekapExcel);
  }

  function renderPaginationBar(prefix, filterObj, data) {
    var total = data.total || 0;
    var startIdx = total === 0 ? 0 : filterObj.offset + 1;
    var endIdx = Math.min(total, filterObj.offset + (data.items ? data.items.length : 0));
    return '<div class="pagination-bar">' +
      '<span>Menampilkan ' + startIdx + ' - ' + endIdx + ' dari ' + total + ' data</span>' +
      '<div style="display:flex;gap:8px">' +
      '<button type="button" class="btn btn-secondary btn-sm" id="' + prefix + 'PrevBtn"' + (filterObj.offset <= 0 ? ' disabled' : '') + '>Sebelumnya</button>' +
      '<button type="button" class="btn btn-secondary btn-sm" id="' + prefix + 'NextBtn"' + (endIdx >= total ? ' disabled' : '') + '>Berikutnya</button>' +
      '</div></div>';
  }

  function bindPaginationBar(prefix, filterObj, rerenderFn) {
    var prevBtn = document.getElementById(prefix + 'PrevBtn');
    var nextBtn = document.getElementById(prefix + 'NextBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        filterObj.offset = Math.max(0, filterObj.offset - filterObj.limit);
        rerenderFn();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        filterObj.offset += filterObj.limit;
        rerenderFn();
      });
    }
  }

  function renderKopSuratPdf(doc, settings) {
    var pageW = doc.internal.pageSize.getWidth();
    var namaPt = settings.NAMA_PERUSAHAAN || 'PT. BERJAYA MAKMUR INDONESIA';
    var alamat = settings.ALAMAT_PERUSAHAAN || '';
    var kontak = settings.KONTAK_PERUSAHAAN || '';
    var logoB64 = settings.LOGO_BASE64 || '';

    var textStartX = 14;
    if (logoB64 && logoB64.indexOf('data:image') === 0) {
      try {
        doc.addImage(logoB64, 'PNG', 14, 10, 18, 18);
        textStartX = 36;
      } catch (e) {
        textStartX = 14;
      }
    }

    var centerX = textStartX > 20 ? (pageW + 20) / 2 : pageW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(namaPt, centerX, 16, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    if (alamat) doc.text(alamat, centerX, 21.5, { align: 'center' });
    if (kontak) doc.text(kontak, centerX, 26, { align: 'center' });

    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.8);
    doc.line(14, 30, pageW - 14, 30);
    doc.setLineWidth(0.3);
    doc.line(14, 31.3, pageW - 14, 31.3);
    return 37;
  }

  async function handleDownloadRekapPdf() {
    var btn = document.getElementById('exportPdfRekapBtn');
    btn.disabled = true;
    try {
      var res = await apiCall('getAttendanceReport', state.filters.attendance);
      var settings = res.settings || state.settings;
      if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast('Library PDF belum termuat. Periksa koneksi internet Anda.', 'error');
        return;
      }

      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      var y = renderKopSuratPdf(doc, settings);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text('LAPORAN REKAPITULASI ABSENSI KARYAWAN', doc.internal.pageSize.getWidth() / 2, y, { align: 'center' });

      var f = state.filters.attendance;
      var periodeText = 'Periode: ' + (f.dateFrom || 'Awal') + ' s/d ' + (f.dateTo || 'Terbaru') + '   |   Total Data: ' + res.items.length;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(periodeText, doc.internal.pageSize.getWidth() / 2, y + 5.5, { align: 'center' });

      var bodyRows = res.items.map(function (it, idx) {
        return [
          idx + 1,
          it.tanggal,
          it.idKaryawan,
          it.nama,
          it.tipe,
          it.waktu,
          it.statusWaktu,
          it.statusLokasi + ' (' + it.jarakMeter + 'm)',
          it.alasanLuar || '-'
        ];
      });

      doc.autoTable({
        startY: y + 9,
        head: [['No', 'Tanggal', 'NIP', 'Nama Karyawan', 'Tipe', 'Jam', 'Ketepatan', 'Status Lokasi', 'Alasan Luar Radius']],
        body: bodyRows,
        theme: 'grid',
        headStyles: { fillColor: [5, 150, 105], textColor: 255, fontSize: 8.5 },
        styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        margin: { left: 14, right: 14 }
      });

      var finalY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y + 30) + 12;
      var pageH = doc.internal.pageSize.getHeight();
      if (finalY + 35 > pageH) {
        doc.addPage();
        finalY = 20;
      }

      var signX = doc.internal.pageSize.getWidth() - 75;
      var kota = settings.KOTA_TTD || 'Jakarta';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(kota + ', ' + formatDateId(todayDateStr()), signX, finalY);
      doc.text(settings.TTD_JABATAN || 'HRD Manager', signX, finalY + 5);
      doc.setFont('helvetica', 'bold');
      doc.text(settings.TTD_NAMA || 'Administrator HRD', signX, finalY + 26);

      doc.save('Rekap_Absensi_PT_Berjaya_Makmur_' + todayDateStr() + '.pdf');
      showToast('PDF Rekap Absensi berhasil diunduh.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  async function handleExportRekapExcel() {
    var btn = document.getElementById('exportExcelBtn');
    btn.disabled = true;
    try {
      var res = await apiCall('getAttendanceReport', state.filters.attendance);
      var rows = res.items.map(function (it, idx) {
        return {
          No: idx + 1,
          IDAbsensi: it.id,
          Tanggal: it.tanggal,
          NIP: it.idKaryawan,
          Nama: it.nama,
          Tipe: it.tipe,
          Waktu: it.waktu,
          Ketepatan: it.statusWaktu,
          StatusLokasi: it.statusLokasi,
          JarakMeter: it.jarakMeter,
          AlasanLuarRadius: it.alasanLuar,
          LinkMaps: it.mapsUrl,
          LinkFotoDrive: it.fotoUrl
        };
      });

      if (window.XLSX) {
        var ws = window.XLSX.utils.json_to_sheet(rows);
        var wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'RekapAbsensi');
        window.XLSX.writeFile(wb, 'Rekap_Absensi_' + todayDateStr() + '.xlsx');
      } else {
        var headers = Object.keys(rows[0] || {});
        var csv = [headers.join(',')].concat(rows.map(function (r) {
          return headers.map(function (h) { return '"' + String(r[h] || '').replace(/"/g, '""') + '"'; }).join(',');
        })).join('\n');
        var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Rekap_Absensi_' + todayDateStr() + '.csv';
        a.click();
      }
      showToast('Rekap berhasil diekspor.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ==========================================================================
     4. CUTI / IJIN / SAKIT + UPLOAD FILE + APPROVAL
     ========================================================================== */

  async function renderCutiView(container) {
    var f = state.filters.leaves;
    var cacheKey = 'leaves:' + JSON.stringify(f);
    var data = state.cache[cacheKey];

    if (!data) {
      renderLoadingState(container, 'Memuat data pengajuan cuti/ijin/sakit...');
      try {
        data = await apiCall('getLeaves', f);
        state.cache[cacheKey] = data;
      } catch (err) {
        container.innerHTML = '<div class="card"><p style="color:var(--rose)">' + escapeHtml(err.message) + '</p></div>';
        return;
      }
    }

    var rowsHtml = (data.items && data.items.length)
      ? data.items.map(function (it) {
          var fileBtn = it.fileUrl
            ? '<a href="' + escapeHtml(it.fileUrl) + '" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Lampiran</a>'
            : '<span class="cell-sub">-</span>';
          var actionHtml = (isAdmin() && it.status === 'Pending')
            ? '<button type="button" class="btn btn-primary btn-sm" data-action="reviewLeave" data-id="' + escapeHtml(it.id) + '" data-nama="' + escapeHtml(it.nama) + '">Proses</button>'
            : '';
          return '<tr>' +
            '<td><div class="cell-main">' + escapeHtml(it.id) + '</div><div class="cell-sub">' + escapeHtml(it.nama) + ' (' + escapeHtml(it.idKaryawan) + ')</div></td>' +
            '<td>' + renderStatusPill(it.jenis) + '</td>' +
            '<td><div class="cell-main">' + escapeHtml(it.tglMulai) + ' s/d ' + escapeHtml(it.tglSelesai) + '</div><div class="cell-sub">' + it.jumlahHari + ' hari</div></td>' +
            '<td>' + escapeHtml(it.alasan) + (it.catatanAdmin ? '<div class="cell-sub">Catatan Admin: ' + escapeHtml(it.catatanAdmin) + '</div>' : '') + '</td>' +
            '<td>' + renderStatusPill(it.status) + '</td>' +
            '<td><div class="table-actions">' + fileBtn + actionHtml + '</div></td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:26px;color:var(--text-muted)">Belum ada pengajuan cuti/ijin/sakit.</td></tr>';

    container.innerHTML = '' +
      '<div class="page-header">' +
      '<div><h1 class="page-title">Cuti, Ijin &amp; Sakit</h1><p class="page-subtitle">Ajukan permohonan beserta upload dokumen pendukung untuk disetujui Admin HRD.</p></div>' +
      '<div class="header-actions"><button type="button" id="openNewLeaveBtn" class="btn btn-primary">' + svgIcon('plus') + '<span>Ajukan Cuti / Ijin / Sakit</span></button></div>' +
      '</div>' +

      '<div class="card">' +
      '<form id="leaveFilterForm" class="filter-bar">' +
      '<div class="form-group"><label>Pencarian</label><input type="text" id="lvSearch" value="' + escapeHtml(f.search) + '" placeholder="Cari nama atau keterangan..." /></div>' +
      '<div class="form-group"><label>Jenis</label><select id="lvJenis"><option value="ALL">Semua</option><option value="Cuti"' + (f.jenis === 'Cuti' ? ' selected' : '') + '>Cuti</option><option value="Ijin"' + (f.jenis === 'Ijin' ? ' selected' : '') + '>Ijin</option><option value="Sakit"' + (f.jenis === 'Sakit' ? ' selected' : '') + '>Sakit</option></select></div>' +
      '<div class="form-group"><label>Status</label><select id="lvStatus"><option value="ALL">Semua</option><option value="Pending"' + (f.status === 'Pending' ? ' selected' : '') + '>Pending</option><option value="Disetujui"' + (f.status === 'Disetujui' ? ' selected' : '') + '>Disetujui</option><option value="Ditolak"' + (f.status === 'Ditolak' ? ' selected' : '') + '>Ditolak</option></select></div>' +
      '<button type="submit" class="btn btn-primary">Filter</button>' +
      '</form>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>ID &amp; Pemohon</th><th>Jenis</th><th>Tanggal</th><th>Keterangan</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      renderPaginationBar('lv', f, data) +
      '</div>';

    document.getElementById('leaveFilterForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      f.search = document.getElementById('lvSearch').value.trim();
      f.jenis = document.getElementById('lvJenis').value;
      f.status = document.getElementById('lvStatus').value;
      f.offset = 0;
      renderCutiView(container);
    });

    bindPaginationBar('lv', f, function () { renderCutiView(container); });
    document.getElementById('openNewLeaveBtn').addEventListener('click', openNewLeaveModal);
  }

  async function openNewLeaveModal() {
    state.leaveFile = { base64: '', name: '', mime: '' };
    var previewId = 'Auto';
    try {
      var idRes = await apiCall('getNextIdPreview', { type: 'CUTI' });
      previewId = idRes.nextId;
    } catch (e) { /* keep auto */ }

    var html = '<form id="leaveSubmitForm" class="stack-form">' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>No. Pengajuan (Otomatis)</label><input type="text" value="' + escapeHtml(previewId) + '" readonly /></div>' +
      '<div class="form-group"><label>Jenis Pengajuan</label><select id="lvFormJenis"><option value="Cuti">Cuti</option><option value="Ijin">Ijin</option><option value="Sakit">Sakit</option></select></div>' +
      '</div>' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>Tanggal Mulai</label><input type="date" id="lvFormMulai" value="' + todayDateStr() + '" required /></div>' +
      '<div class="form-group"><label>Tanggal Selesai</label><input type="date" id="lvFormSelesai" value="' + todayDateStr() + '" required /></div>' +
      '</div>' +
      '<div class="form-group"><label>Keterangan / Alasan</label><textarea id="lvFormAlasan" placeholder="Tuliskan alasan permohonan..." required></textarea></div>' +
      '<div class="form-group"><label>Upload Surat Dokter / Lampiran (Foto / PDF, maks 4MB)</label>' +
      '<input type="file" id="lvFormFile" accept="image/*,.pdf" />' +
      '<small id="lvFileInfo" style="color:var(--text-muted)">Opsional untuk cuti/ijin, disarankan untuk sakit.</small></div>' +
      '<button type="submit" id="lvSubmitBtn" class="btn btn-primary btn-block">Kirim Pengajuan</button>' +
      '</form>';

    openModal('Ajukan Cuti / Ijin / Sakit', html);

    document.getElementById('lvFormFile').addEventListener('change', async function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        showToast('Ukuran file maksimal 4 MB.', 'warning');
        ev.target.value = '';
        return;
      }
      if (file.type.indexOf('image/') === 0) {
        state.leaveFile.base64 = await compressImageFile(file, 1000, 0.8);
        state.leaveFile.mime = 'image/jpeg';
      } else {
        state.leaveFile.base64 = await readFileAsBase64(file);
        state.leaveFile.mime = file.type || 'application/pdf';
      }
      state.leaveFile.name = file.name;
      document.getElementById('lvFileInfo').textContent = 'File siap diunggah: ' + file.name;
    });

    document.getElementById('leaveSubmitForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('lvSubmitBtn');
      btn.disabled = true;
      btn.textContent = 'Mengirim & Mengunggah...';
      try {
        var res = await apiCall('submitLeave', {
          jenis: document.getElementById('lvFormJenis').value,
          tglMulai: document.getElementById('lvFormMulai').value,
          tglSelesai: document.getElementById('lvFormSelesai').value,
          alasan: document.getElementById('lvFormAlasan').value.trim(),
          fileBase64: state.leaveFile.base64,
          fileName: state.leaveFile.name,
          fileMime: state.leaveFile.mime
        });
        invalidateCache(['leaves:', 'dashboard:']);
        showToast(res.message, 'success');
        closeModal();
        renderCutiView(document.getElementById('pageContent'));
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Kirim Pengajuan';
      }
    });
  }

  function openReviewModal(kind, id, nama) {
    var title = kind === 'leave' ? 'Approval Cuti / Ijin / Sakit' : 'Approval Lembur';
    var html = '<form id="reviewApprovalForm" class="stack-form">' +
      '<p>Proses pengajuan <strong>' + escapeHtml(id) + '</strong> atas nama <strong>' + escapeHtml(nama) + '</strong>.</p>' +
      '<div class="form-group"><label>Keputusan</label><select id="revDecision"><option value="Disetujui">Setujui (Approve)</option><option value="Ditolak">Tolak (Reject)</option></select></div>' +
      '<div class="form-group"><label>Catatan Admin</label><textarea id="revCatatan" placeholder="Tambahkan catatan (opsional)..."></textarea></div>' +
      '<button type="submit" id="revSubmitBtn" class="btn btn-primary btn-block">Simpan Keputusan</button>' +
      '</form>';
    openModal(title, html);

    document.getElementById('reviewApprovalForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('revSubmitBtn');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        var endpoint = kind === 'leave' ? 'reviewLeave' : 'reviewOvertime';
        var res = await apiCall(endpoint, {
          id: id,
          status: document.getElementById('revDecision').value,
          catatanAdmin: document.getElementById('revCatatan').value.trim()
        });
        invalidateCache(['leaves:', 'overtimes:', 'dashboard:']);
        showToast(res.message, 'success');
        closeModal();
        renderCurrentRoute();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Simpan Keputusan';
      }
    });
  }

  /* ==========================================================================
     5. PENGAJUAN LEMBUR + APPROVAL ADMIN
     ========================================================================== */

  async function renderLemburView(container) {
    var f = state.filters.overtimes;
    var cacheKey = 'overtimes:' + JSON.stringify(f);
    var data = state.cache[cacheKey];

    if (!data) {
      renderLoadingState(container, 'Memuat data pengajuan lembur...');
      try {
        data = await apiCall('getOvertimes', f);
        state.cache[cacheKey] = data;
      } catch (err) {
        container.innerHTML = '<div class="card"><p style="color:var(--rose)">' + escapeHtml(err.message) + '</p></div>';
        return;
      }
    }

    var rowsHtml = (data.items && data.items.length)
      ? data.items.map(function (it) {
          var actionHtml = (isAdmin() && it.status === 'Pending')
            ? '<button type="button" class="btn btn-primary btn-sm" data-action="reviewOvertime" data-id="' + escapeHtml(it.id) + '" data-nama="' + escapeHtml(it.nama) + '">Proses</button>'
            : '-';
          return '<tr>' +
            '<td><div class="cell-main">' + escapeHtml(it.id) + '</div><div class="cell-sub">' + escapeHtml(it.nama) + ' (' + escapeHtml(it.idKaryawan) + ')</div></td>' +
            '<td><div class="cell-main">' + escapeHtml(it.tanggal) + '</div><div class="cell-sub">' + escapeHtml(it.jamMulai) + ' - ' + escapeHtml(it.jamSelesai) + ' (' + it.durasiJam + ' jam)</div></td>' +
            '<td>' + escapeHtml(it.pekerjaan) + (it.catatanAdmin ? '<div class="cell-sub">Catatan Admin: ' + escapeHtml(it.catatanAdmin) + '</div>' : '') + '</td>' +
            '<td>' + renderStatusPill(it.status) + '</td>' +
            '<td>' + actionHtml + '</td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="5" style="text-align:center;padding:26px;color:var(--text-muted)">Belum ada pengajuan lembur.</td></tr>';

    container.innerHTML = '' +
      '<div class="page-header">' +
      '<div><h1 class="page-title">Pengajuan Lembur</h1><p class="page-subtitle">Catat jam kerja lembur untuk diverifikasi dan disetujui Admin HRD.</p></div>' +
      '<div class="header-actions"><button type="button" id="openNewOvertimeBtn" class="btn btn-primary">' + svgIcon('plus') + '<span>Ajukan Lembur</span></button></div>' +
      '</div>' +

      '<div class="card">' +
      '<form id="overtimeFilterForm" class="filter-bar">' +
      '<div class="form-group"><label>Pencarian</label><input type="text" id="ovSearch" value="' + escapeHtml(f.search) + '" placeholder="Cari nama atau tugas..." /></div>' +
      '<div class="form-group"><label>Status</label><select id="ovStatus"><option value="ALL">Semua</option><option value="Pending"' + (f.status === 'Pending' ? ' selected' : '') + '>Pending</option><option value="Disetujui"' + (f.status === 'Disetujui' ? ' selected' : '') + '>Disetujui</option><option value="Ditolak"' + (f.status === 'Ditolak' ? ' selected' : '') + '>Ditolak</option></select></div>' +
      '<button type="submit" class="btn btn-primary">Filter</button>' +
      '</form>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>ID &amp; Karyawan</th><th>Tanggal &amp; Durasi</th><th>Deskripsi Tugas</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      renderPaginationBar('ov', f, data) +
      '</div>';

    document.getElementById('overtimeFilterForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      f.search = document.getElementById('ovSearch').value.trim();
      f.status = document.getElementById('ovStatus').value;
      f.offset = 0;
      renderLemburView(container);
    });

    bindPaginationBar('ov', f, function () { renderLemburView(container); });
    document.getElementById('openNewOvertimeBtn').addEventListener('click', openNewOvertimeModal);
  }

  async function openNewOvertimeModal() {
    var previewId = 'Auto';
    try {
      var idRes = await apiCall('getNextIdPreview', { type: 'LEMBUR' });
      previewId = idRes.nextId;
    } catch (e) { /* keep auto */ }

    var html = '<form id="overtimeSubmitForm" class="stack-form">' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>No. Lembur (Otomatis)</label><input type="text" value="' + escapeHtml(previewId) + '" readonly /></div>' +
      '<div class="form-group"><label>Tanggal Lembur</label><input type="date" id="ovFormTanggal" value="' + todayDateStr() + '" required /></div>' +
      '</div>' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>Jam Mulai</label><input type="time" id="ovFormMulai" value="17:30" required /></div>' +
      '<div class="form-group"><label>Jam Selesai</label><input type="time" id="ovFormSelesai" value="20:00" required /></div>' +
      '</div>' +
      '<div class="form-group"><label>Deskripsi Pekerjaan Lembur</label><textarea id="ovFormTugas" placeholder="Jelaskan pekerjaan yang diselesaikan saat lembur..." required></textarea></div>' +
      '<button type="submit" id="ovSubmitBtn" class="btn btn-primary btn-block">Kirim Pengajuan Lembur</button>' +
      '</form>';

    openModal('Ajukan Lembur', html);

    document.getElementById('overtimeSubmitForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('ovSubmitBtn');
      btn.disabled = true;
      btn.textContent = 'Mengirim...';
      try {
        var res = await apiCall('submitOvertime', {
          tanggal: document.getElementById('ovFormTanggal').value,
          jamMulai: document.getElementById('ovFormMulai').value,
          jamSelesai: document.getElementById('ovFormSelesai').value,
          pekerjaan: document.getElementById('ovFormTugas').value.trim()
        });
        invalidateCache(['overtimes:', 'dashboard:']);
        showToast(res.message, 'success');
        closeModal();
        renderLemburView(document.getElementById('pageContent'));
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Kirim Pengajuan Lembur';
      }
    });
  }

  /* ==========================================================================
     6. SLIP GAJI (ADMIN ATUR NOMINAL, SEMUA USER DOWNLOAD PDF)
     ========================================================================== */

  async function renderGajiView(container) {
    var f = state.filters.payslips;
    var cacheKey = 'payslips:' + JSON.stringify(f);
    var data = state.cache[cacheKey];

    if (!data) {
      renderLoadingState(container, 'Memuat data slip gaji...');
      try {
        data = await apiCall('getPayslips', f);
        state.cache[cacheKey] = data;
      } catch (err) {
        container.innerHTML = '<div class="card"><p style="color:var(--rose)">' + escapeHtml(err.message) + '</p></div>';
        return;
      }
    }

    var rowsHtml = (data.items && data.items.length)
      ? data.items.map(function (it) {
          var adminBtns = isAdmin()
            ? '<button type="button" class="btn btn-secondary btn-sm" data-action="editPayslip" data-id="' + escapeHtml(it.id) + '">Edit</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-action="deletePayslip" data-id="' + escapeHtml(it.id) + '">Hapus</button>'
            : '';
          return '<tr>' +
            '<td><div class="cell-main">' + escapeHtml(it.periode) + '</div><div class="cell-sub">' + escapeHtml(it.id) + '</div></td>' +
            '<td><div class="cell-main">' + escapeHtml(it.nama) + '</div><div class="cell-sub">' + escapeHtml(it.idKaryawan) + ' • ' + escapeHtml(it.jabatan) + '</div></td>' +
            '<td><div class="cell-main">' + formatRupiah(it.gajiPokok) + '</div><div class="cell-sub">Tunj: ' + formatRupiah(it.tunjangan) + ' | Lmb: ' + formatRupiah(it.lembur) + '</div></td>' +
            '<td>' + formatRupiah(it.potongan) + '</td>' +
            '<td><div class="cell-main" style="color:var(--emerald-dark)">' + formatRupiah(it.totalBersih) + '</div>' + renderStatusPill(it.status) + '</td>' +
            '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="downloadSlipPdf" data-id="' + escapeHtml(it.id) + '">' + svgIcon('download') + '<span>PDF</span></button>' +
            adminBtns + '</div></td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:26px;color:var(--text-muted)">Belum ada data slip gaji.</td></tr>';

    container.innerHTML = '' +
      '<div class="page-header">' +
      '<div><h1 class="page-title">Slip Gaji Karyawan</h1><p class="page-subtitle">' + (isAdmin() ? 'Kelola nominal gaji per periode dan terbitkan slip PDF resmi.' : 'Unduh slip gaji resmi Anda yang telah diterbitkan Admin.') + '</p></div>' +
      (isAdmin() ? '<div class="header-actions"><button type="button" id="openNewPayslipBtn" class="btn btn-primary">' + svgIcon('plus') + '<span>Buat Slip Gaji</span></button></div>' : '') +
      '</div>' +

      '<div class="card">' +
      '<form id="slipFilterForm" class="filter-bar">' +
      '<div class="form-group"><label>Cari Karyawan / ID Slip</label><input type="text" id="slpSearch" value="' + escapeHtml(f.search) + '" placeholder="Nama atau NIP..." /></div>' +
      '<div class="form-group"><label>Periode Bulan</label><input type="month" id="slpPeriode" value="' + escapeHtml(f.periode) + '" /></div>' +
      '<button type="submit" class="btn btn-primary">Filter</button>' +
      '</form>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Periode &amp; ID</th><th>Karyawan</th><th>Penghasilan</th><th>Potongan</th><th>Gaji Bersih</th><th>Aksi</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      renderPaginationBar('slp', f, data) +
      '</div>';

    document.getElementById('slipFilterForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      f.search = document.getElementById('slpSearch').value.trim();
      f.periode = document.getElementById('slpPeriode').value;
      f.offset = 0;
      renderGajiView(container);
    });

    bindPaginationBar('slp', f, function () { renderGajiView(container); });
    if (isAdmin()) {
      document.getElementById('openNewPayslipBtn').addEventListener('click', function () {
        openPayslipModal(null);
      });
    }
  }

  async function openPayslipModal(existingItem) {
    var empList = [];
    try {
      var empRes = await apiCall('getEmployees', { status: 'Aktif', limit: 200, offset: 0 });
      empList = empRes.items || [];
    } catch (e) {
      showToast('Gagal memuat daftar karyawan.', 'error');
      return;
    }

    var empOptions = empList.map(function (em) {
      var sel = existingItem && existingItem.idKaryawan === em.id ? ' selected' : '';
      return '<option value="' + escapeHtml(em.id) + '"' + sel + '>' + escapeHtml(em.id + ' - ' + em.nama + ' (' + em.jabatan + ')') + '</option>';
    }).join('');

    var html = '<form id="payslipForm" class="stack-form">' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>Periode Bulan</label><input type="month" id="slpFormPeriode" value="' + escapeHtml(existingItem ? existingItem.periode : currentMonthStr()) + '" required /></div>' +
      '<div class="form-group"><label>Status Terbit</label><select id="slpFormStatus"><option value="Terbit"' + (!existingItem || existingItem.status === 'Terbit' ? ' selected' : '') + '>Terbit (Bisa Didownload)</option><option value="Draft"' + (existingItem && existingItem.status === 'Draft' ? ' selected' : '') + '>Draft</option></select></div>' +
      '</div>' +
      '<div class="form-group"><label>Pilih Karyawan</label><select id="slpFormEmp" ' + (existingItem ? 'disabled' : '') + '>' + empOptions + '</select></div>' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>Gaji Pokok (Rp)</label><input type="number" id="slpPokok" min="0" value="' + (existingItem ? existingItem.gajiPokok : 0) + '" required /></div>' +
      '<div class="form-group"><label>Tunjangan (Rp)</label><input type="number" id="slpTunj" min="0" value="' + (existingItem ? existingItem.tunjangan : 0) + '" required /></div>' +
      '</div>' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>Uang Lembur (Rp)</label><input type="number" id="slpLembur" min="0" value="' + (existingItem ? existingItem.lembur : 0) + '" required /></div>' +
      '<div class="form-group"><label>Potongan (Rp)</label><input type="number" id="slpPotongan" min="0" value="' + (existingItem ? existingItem.potongan : 0) + '" required /></div>' +
      '</div>' +
      '<div style="padding:12px;border-radius:10px;background:var(--emerald-soft);display:flex;justify-content:space-between;align-items:center">' +
      '<strong>Total Gaji Bersih:</strong><strong id="slpLiveTotal" style="font-size:17px;color:var(--emerald-dark)">Rp 0</strong></div>' +
      '<div class="form-group"><label>Catatan Slip</label><textarea id="slpCatatan" placeholder="Contoh: Termasuk tunjangan makan &amp; transport">' + escapeHtml(existingItem ? existingItem.catatan : '') + '</textarea></div>' +
      '<button type="submit" id="slpSaveBtn" class="btn btn-primary btn-block">Simpan Slip Gaji</button>' +
      '</form>';

    openModal(existingItem ? 'Edit Slip Gaji ' + existingItem.id : 'Buat Slip Gaji Baru', html);

    var recalc = function () {
      var p = Number(document.getElementById('slpPokok').value || 0);
      var t = Number(document.getElementById('slpTunj').value || 0);
      var l = Number(document.getElementById('slpLembur').value || 0);
      var pot = Number(document.getElementById('slpPotongan').value || 0);
      document.getElementById('slpLiveTotal').textContent = formatRupiah(p + t + l - pot);
    };
    ['slpPokok', 'slpTunj', 'slpLembur', 'slpPotongan'].forEach(function (fid) {
      document.getElementById(fid).addEventListener('input', recalc);
    });
    recalc();

    document.getElementById('payslipForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('slpSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        var res = await apiCall('savePayslip', {
          id: existingItem ? existingItem.id : '',
          periode: document.getElementById('slpFormPeriode').value,
          idKaryawan: document.getElementById('slpFormEmp').value,
          gajiPokok: Number(document.getElementById('slpPokok').value || 0),
          tunjangan: Number(document.getElementById('slpTunj').value || 0),
          lembur: Number(document.getElementById('slpLembur').value || 0),
          potongan: Number(document.getElementById('slpPotongan').value || 0),
          catatan: document.getElementById('slpCatatan').value.trim(),
          status: document.getElementById('slpFormStatus').value
        });
        invalidateCache(['payslips:']);
        showToast(res.message, 'success');
        closeModal();
        renderGajiView(document.getElementById('pageContent'));
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Simpan Slip Gaji';
      }
    });
  }

  function downloadSlipGajiPdf(slip) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast('Library PDF belum termuat.', 'error');
      return;
    }
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var settings = state.settings;
    var y = renderKopSuratPdf(doc, settings);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('SLIP GAJI KARYAWAN', 105, y + 2, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('No. Slip: ' + slip.id + '   |   Periode: ' + slip.periode, 105, y + 8, { align: 'center' });

    doc.setFontSize(9.5);
    doc.text('NIP / ID Karyawan : ' + slip.idKaryawan, 14, y + 18);
    doc.text('Nama Lengkap      : ' + slip.nama, 14, y + 24);
    doc.text('Jabatan           : ' + slip.jabatan, 14, y + 30);

    doc.autoTable({
      startY: y + 36,
      head: [['Komponen Penghasilan / Potongan', 'Keterangan', 'Nominal']],
      body: [
        ['Gaji Pokok', 'Gaji dasar bulanan', formatRupiah(slip.gajiPokok)],
        ['Tunjangan', 'Tunjangan tetap & operasional', formatRupiah(slip.tunjangan)],
        ['Uang Lembur', 'Akumulasi jam lembur', formatRupiah(slip.lembur)],
        ['Potongan', 'Potongan keterlambatan / lainnya', '- ' + formatRupiah(slip.potongan)],
        [{ content: 'TOTAL GAJI BERSIH (TAKE HOME PAY)', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [231, 248, 240] } }, { content: formatRupiah(slip.totalBersih), styles: { fontStyle: 'bold', fillColor: [231, 248, 240] } }]
      ],
      theme: 'grid',
      headStyles: { fillColor: [5, 150, 105], textColor: 255 },
      columnStyles: { 2: { halign: 'right' } },
      margin: { left: 14, right: 14 }
    });

    var endY = (doc.lastAutoTable ? doc.lastAutoTable.finalY : y + 90) + 10;
    if (slip.catatan) {
      doc.setFontSize(9);
      doc.text('Catatan: ' + slip.catatan, 14, endY);
      endY += 10;
    }

    var kota = settings.KOTA_TTD || 'Jakarta';
    doc.setFontSize(9.5);
    doc.text('Diterima oleh,', 24, endY + 4);
    doc.text(kota + ', ' + formatDateId(todayDateStr()), 135, endY + 4);
    doc.text(settings.TTD_JABATAN || 'HRD Manager', 135, endY + 9);

    doc.setFont('helvetica', 'bold');
    doc.text(slip.nama, 24, endY + 30);
    doc.text(settings.TTD_NAMA || 'Administrator HRD', 135, endY + 30);

    doc.save('Slip_Gaji_' + slip.idKaryawan + '_' + slip.periode + '.pdf');
    showToast('Slip Gaji PDF berhasil diunduh.', 'success');
  }

  /* ==========================================================================
     7. MANAJEMEN KARYAWAN (ADMIN)
     ========================================================================== */

  async function renderKaryawanView(container) {
    var f = state.filters.employees;
    var cacheKey = 'employees:' + JSON.stringify(f);
    var data = state.cache[cacheKey];

    if (!data) {
      renderLoadingState(container, 'Memuat daftar karyawan...');
      try {
        data = await apiCall('getEmployees', f);
        state.cache[cacheKey] = data;
      } catch (err) {
        container.innerHTML = '<div class="card"><p style="color:var(--rose)">' + escapeHtml(err.message) + '</p></div>';
        return;
      }
    }

    var rowsHtml = (data.items && data.items.length)
      ? data.items.map(function (em) {
          return '<tr>' +
            '<td><div style="display:flex;align-items:center;gap:10px">' + renderAvatarHtml(em.fotoUrl, em.nama, '') +
            '<div><div class="cell-main">' + escapeHtml(em.nama) + '</div><div class="cell-sub">' + escapeHtml(em.id) + '</div></div></div></td>' +
            '<td><div class="cell-main">' + escapeHtml(em.jabatan) + '</div><div class="cell-sub">' + escapeHtml(em.departemen || '-') + '</div></td>' +
            '<td>' + renderStatusPill(em.role) + '</td>' +
            '<td><div class="cell-main">' + escapeHtml(em.noHp || '-') + '</div><div class="cell-sub">' + escapeHtml(em.email || '-') + '</div></td>' +
            '<td>' + renderStatusPill(em.status) + '</td>' +
            '<td><div class="table-actions">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="editEmployee" data-id="' + escapeHtml(em.id) + '">Edit</button>' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="resetPassEmployee" data-id="' + escapeHtml(em.id) + '" data-nama="' + escapeHtml(em.nama) + '">Reset Pass</button>' +
            '</div></td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;padding:26px;color:var(--text-muted)">Tidak ada data karyawan.</td></tr>';

    container.innerHTML = '' +
      '<div class="page-header">' +
      '<div><h1 class="page-title">Manajemen Akun Karyawan</h1><p class="page-subtitle">Atur ID (NIP), password, jabatan, role, dan status aktif karyawan.</p></div>' +
      '<div class="header-actions"><button type="button" id="openNewEmpBtn" class="btn btn-primary">' + svgIcon('plus') + '<span>Tambah Karyawan</span></button></div>' +
      '</div>' +

      '<div class="card">' +
      '<form id="empFilterForm" class="filter-bar">' +
      '<div class="form-group"><label>Pencarian</label><input type="text" id="empSearch" value="' + escapeHtml(f.search) + '" placeholder="Cari NIP, nama, atau jabatan..." /></div>' +
      '<div class="form-group"><label>Status</label><select id="empStatus"><option value="ALL">Semua</option><option value="Aktif"' + (f.status === 'Aktif' ? ' selected' : '') + '>Aktif</option><option value="Nonaktif"' + (f.status === 'Nonaktif' ? ' selected' : '') + '>Nonaktif</option></select></div>' +
      '<button type="submit" class="btn btn-primary">Filter</button>' +
      '</form>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Karyawan</th><th>Jabatan &amp; Dept</th><th>Role</th><th>Kontak</th><th>Status</th><th>Aksi</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
      renderPaginationBar('emp', f, data) +
      '</div>';

    document.getElementById('empFilterForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      f.search = document.getElementById('empSearch').value.trim();
      f.status = document.getElementById('empStatus').value;
      f.offset = 0;
      renderKaryawanView(container);
    });

    bindPaginationBar('emp', f, function () { renderKaryawanView(container); });
    document.getElementById('openNewEmpBtn').addEventListener('click', function () {
      openEmployeeModal(null);
    });
  }

  async function openEmployeeModal(emp) {
    var isEdit = Boolean(emp);
    var recommendedId = emp ? emp.id : '';
    if (!isEdit) {
      try {
        var idRes = await apiCall('getNextIdPreview', { type: 'KARYAWAN' });
        recommendedId = idRes.nextId;
      } catch (e) { /* keep empty */ }
    }

    var html = '<form id="employeeModalForm" class="stack-form">' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>ID Karyawan (NIP)</label><input type="text" id="empFormId" value="' + escapeHtml(recommendedId) + '" ' + (isEdit ? 'readonly' : 'required') + ' /></div>' +
      '<div class="form-group"><label>Role Akses</label><select id="empFormRole"><option value="Karyawan"' + (!emp || emp.role === 'Karyawan' ? ' selected' : '') + '>Karyawan</option><option value="Admin"' + (emp && emp.role === 'Admin' ? ' selected' : '') + '>Admin</option></select></div>' +
      '</div>' +
      '<div class="form-group"><label>Nama Lengkap</label><input type="text" id="empFormNama" value="' + escapeHtml(emp ? emp.nama : '') + '" required /></div>' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>Jabatan</label><input type="text" id="empFormJabatan" value="' + escapeHtml(emp ? emp.jabatan : '') + '" required /></div>' +
      '<div class="form-group"><label>Departemen</label><input type="text" id="empFormDept" value="' + escapeHtml(emp ? emp.departemen : 'Operasional') + '" required /></div>' +
      '</div>' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>Email</label><input type="email" id="empFormEmail" value="' + escapeHtml(emp ? emp.email : '') + '" /></div>' +
      '<div class="form-group"><label>No. HP</label><input type="text" id="empFormHp" value="' + escapeHtml(emp ? emp.noHp : '') + '" /></div>' +
      '</div>' +
      '<div class="form-grid-2">' +
      '<div class="form-group"><label>' + (isEdit ? 'Password Baru (opsional)' : 'Password Awal (min 6 karakter)') + '</label><input type="password" id="empFormPass" placeholder="' + (isEdit ? 'Kosongkan jika tetap' : 'Minimal 6 karakter') + '" ' + (isEdit ? '' : 'required') + ' /></div>' +
      '<div class="form-group"><label>Status Akun</label><select id="empFormStatus"><option value="Aktif"' + (!emp || emp.status === 'Aktif' ? ' selected' : '') + '>Aktif</option><option value="Nonaktif"' + (emp && emp.status === 'Nonaktif' ? ' selected' : '') + '>Nonaktif</option></select></div>' +
      '</div>' +
      '<button type="submit" id="empSaveBtn" class="btn btn-primary btn-block">' + (isEdit ? 'Simpan Perubahan' : 'Buat Akun Karyawan') + '</button>' +
      '</form>';

    openModal(isEdit ? 'Edit Akun ' + emp.nama : 'Tambah Karyawan Baru', html);

    document.getElementById('employeeModalForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('empSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        var res = await apiCall('saveEmployee', {
          isEdit: isEdit,
          id: document.getElementById('empFormId').value.trim(),
          nama: document.getElementById('empFormNama').value.trim(),
          role: document.getElementById('empFormRole').value,
          jabatan: document.getElementById('empFormJabatan').value.trim(),
          departemen: document.getElementById('empFormDept').value.trim(),
          email: document.getElementById('empFormEmail').value.trim(),
          noHp: document.getElementById('empFormHp').value.trim(),
          password: document.getElementById('empFormPass').value,
          status: document.getElementById('empFormStatus').value
        });
        invalidateCache(['employees:', 'dashboard:']);
        showToast(res.message, 'success');
        closeModal();
        renderKaryawanView(document.getElementById('pageContent'));
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = isEdit ? 'Simpan Perubahan' : 'Buat Akun Karyawan';
      }
    });
  }

  function openResetPasswordModal(empId, nama) {
    var html = '<form id="resetPassForm" class="stack-form">' +
      '<p>Atur password baru untuk <strong>' + escapeHtml(nama) + '</strong> (' + escapeHtml(empId) + ').</p>' +
      '<div class="form-group"><label>Password Baru (Minimal 6 karakter)</label><input type="password" id="rstPassInput" minlength="6" required /></div>' +
      '<button type="submit" id="rstPassBtn" class="btn btn-primary btn-block">Reset Password</button>' +
      '</form>';
    openModal('Reset Password Karyawan', html);
    document.getElementById('resetPassForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('rstPassBtn');
      btn.disabled = true;
      try {
        var res = await apiCall('resetEmployeePassword', {
          id: empId,
          newPassword: document.getElementById('rstPassInput').value
        });
        showToast(res.message, 'success');
        closeModal();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  /* ==========================================================================
     8. PENGATURAN KANTOR & LEAFLET.JS MAP RADIUS + HARI LIBUR + KOP SURAT
     ========================================================================== */

  async function renderPengaturanView(container) {
    var cacheKey = 'settingsFull';
    var data = state.cache[cacheKey];
    if (!data) {
      renderLoadingState(container, 'Memuat pengaturan sistem...');
      try {
        data = await apiCall('getSettings', {});
        state.cache[cacheKey] = data;
        state.settings = data.settings || {};
      } catch (err) {
        container.innerHTML = '<div class="card"><p style="color:var(--rose)">' + escapeHtml(err.message) + '</p></div>';
        return;
      }
    }

    var s = data.settings || {};
    var holidays = data.holidays || [];
    var tab = state.settingsTab;

    var tabContentHtml = '';
    if (tab === 'map') {
      var latVal = parseFloat(s.KANTOR_LAT || '-6.2088');
      var lngVal = parseFloat(s.KANTOR_LNG || '106.8456');
      var radVal = parseInt(s.RADIUS_METER || '150', 10);

      tabContentHtml = '<form id="mapSettingsForm" class="card stack-form">' +
        '<div class="card-header"><h2 class="card-title">Peta Lokasi &amp; Radius Kantor (Leaflet.js)</h2>' +
        '<button type="button" id="useCurrentLocBtn" class="btn btn-secondary btn-sm">' + svgIcon('mapPin') + '<span>Pilih Lokasi Saat Ini</span></button></div>' +
        '<p class="page-subtitle">Geser pin biru di peta atau klik lokasi mana saja untuk menentukan titik pusat kantor.</p>' +
        '<div id="officeMap" class="leaflet-box"></div>' +
        '<div class="form-grid-2">' +
        '<div class="form-group"><label>Latitude</label><input type="text" id="setLat" value="' + latVal + '" required /></div>' +
        '<div class="form-group"><label>Longitude</label><input type="text" id="setLng" value="' + lngVal + '" required /></div>' +
        '</div>' +
        '<div class="form-group"><label>Radius Absensi: <strong id="radDisplay">' + radVal + ' meter</strong></label>' +
        '<input type="range" id="setRadiusRange" min="25" max="3000" step="25" value="' + radVal + '" />' +
        '<input type="number" id="setRadiusNum" min="10" max="10000" value="' + radVal + '" style="margin-top:6px" />' +
        '</div>' +
        '<button type="submit" id="saveMapBtn" class="btn btn-primary">Simpan Lokasi &amp; Radius Kantor</button>' +
        '</form>';
    } else if (tab === 'shift') {
      var holRows = holidays.length
        ? holidays.map(function (h) {
            return '<tr><td>' + escapeHtml(h.tanggal) + '</td><td>' + escapeHtml(h.nama) + '</td>' +
              '<td><button type="button" class="btn btn-danger btn-sm" data-action="deleteHoliday" data-id="' + escapeHtml(h.id) + '">Hapus</button></td></tr>';
          }).join('')
        : '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Belum ada hari libur.</td></tr>';

      tabContentHtml = '<div class="dash-grid-2">' +
        '<form id="shiftSettingsForm" class="card stack-form">' +
        '<h2 class="card-title">Aturan Jam Kerja</h2>' +
        '<div class="form-grid-2">' +
        '<div class="form-group"><label>Jam Masuk Baku</label><input type="time" id="setJamMasuk" value="' + escapeHtml(s.JAM_MASUK || '08:00') + '" required /></div>' +
        '<div class="form-group"><label>Jam Pulang Baku</label><input type="time" id="setJamPulang" value="' + escapeHtml(s.JAM_PULANG || '17:00') + '" required /></div>' +
        '</div>' +
        '<div class="form-group"><label>Toleransi Keterlambatan (Menit)</label><input type="number" id="setToleransi" min="0" max="120" value="' + escapeHtml(s.TOLERANSI_MENIT || '15') + '" required /></div>' +
        '<button type="submit" id="saveShiftBtn" class="btn btn-primary">Simpan Jam Kerja</button>' +
        '</form>' +

        '<div class="card stack-form">' +
        '<h2 class="card-title">Daftar Hari Libur</h2>' +
        '<form id="addHolidayForm" style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input type="date" id="holDate" required style="padding:8px;border:1px solid var(--border-strong);border-radius:8px" />' +
        '<input type="text" id="holName" placeholder="Nama Hari Libur" required style="flex:1;min-width:140px;padding:8px;border:1px solid var(--border-strong);border-radius:8px" />' +
        '<button type="submit" id="addHolBtn" class="btn btn-primary btn-sm">Tambah</button>' +
        '</form>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Aksi</th></tr></thead><tbody>' + holRows + '</tbody></table></div>' +
        '</div></div>';
    } else {
      tabContentHtml = '<form id="kopSettingsForm" class="card stack-form">' +
        '<h2 class="card-title">Kop Surat PDF &amp; Pejabat Penandatangan</h2>' +
        '<div class="form-group"><label>Nama Perusahaan</label><input type="text" id="setNamaPt" value="' + escapeHtml(s.NAMA_PERUSAHAAN || 'PT. BERJAYA MAKMUR INDONESIA') + '" required /></div>' +
        '<div class="form-group"><label>Alamat Lengkap</label><input type="text" id="setAlamatPt" value="' + escapeHtml(s.ALAMAT_PERUSAHAAN || '') + '" required /></div>' +
        '<div class="form-group"><label>Kontak (Telepon / Email)</label><input type="text" id="setKontakPt" value="' + escapeHtml(s.KONTAK_PERUSAHAAN || '') + '" /></div>' +
        '<div class="form-grid-2">' +
        '<div class="form-group"><label>Kota Tanda Tangan</label><input type="text" id="setKotaTtd" value="' + escapeHtml(s.KOTA_TTD || 'Jakarta') + '" required /></div>' +
        '<div class="form-group"><label>Jabatan Penandatangan</label><input type="text" id="setJabatanTtd" value="' + escapeHtml(s.TTD_JABATAN || 'HRD Manager') + '" required /></div>' +
        '</div>' +
        '<div class="form-group"><label>Nama Pejabat Penandatangan</label><input type="text" id="setNamaTtd" value="' + escapeHtml(s.TTD_NAMA || 'Administrator HRD') + '" required /></div>' +
        '<div class="form-group"><label>Logo Perusahaan (PNG/JPG untuk Kop Surat PDF)</label>' +
        (s.LOGO_BASE64 ? '<img src="' + s.LOGO_BASE64 + '" alt="Logo" style="width:64px;height:64px;object-fit:contain;border:1px solid var(--border);border-radius:8px;padding:4px" />' : '') +
        '<input type="file" id="setLogoFile" accept="image/*" />' +
        '</div>' +
        '<button type="submit" id="saveKopBtn" class="btn btn-primary">Simpan Kop Surat &amp; TTD</button>' +
        '</form>';
    }

    container.innerHTML = '' +
      '<div class="page-header"><div><h1 class="page-title">Pengaturan Kantor &amp; Sistem</h1><p class="page-subtitle">Atur koordinat peta Leaflet, radius absensi, jam kerja, hari libur, dan kop surat PDF.</p></div></div>' +
      '<div class="tabs-bar">' +
      '<button type="button" class="tab-btn' + (tab === 'map' ? ' active' : '') + '" data-settab="map">Peta &amp; Radius Kantor</button>' +
      '<button type="button" class="tab-btn' + (tab === 'shift' ? ' active' : '') + '" data-settab="shift">Jam Kerja &amp; Hari Libur</button>' +
      '<button type="button" class="tab-btn' + (tab === 'kop' ? ' active' : '') + '" data-settab="kop">Kop Surat &amp; TTD PDF</button>' +
      '</div>' + tabContentHtml;

    container.querySelectorAll('[data-settab]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.settingsTab = b.getAttribute('data-settab');
        renderPengaturanView(container);
      });
    });

    if (tab === 'map') {
      initLeafletSettingsMap(parseFloat(s.KANTOR_LAT || '-6.2088'), parseFloat(s.KANTOR_LNG || '106.8456'), parseInt(s.RADIUS_METER || '150', 10));
    } else if (tab === 'shift') {
      bindShiftAndHolidayForms(container);
    } else {
      bindKopForm(container);
    }
  }

  function initLeafletSettingsMap(initLat, initLng, initRad) {
    if (!window.L) {
      showToast('Library peta Leaflet.js belum termuat.', 'error');
      return;
    }

    var map = window.L.map('officeMap').setView([initLat, initLng], 16);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var marker = window.L.marker([initLat, initLng], { draggable: true }).addTo(map);
    var circle = window.L.circle([initLat, initLng], {
      color: '#059669',
      fillColor: '#10b981',
      fillOpacity: 0.18,
      radius: initRad
    }).addTo(map);

    var syncCoords = function (lat, lng) {
      document.getElementById('setLat').value = lat.toFixed(6);
      document.getElementById('setLng').value = lng.toFixed(6);
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
    };

    marker.on('dragend', function () {
      var pos = marker.getLatLng();
      syncCoords(pos.lat, pos.lng);
    });

    map.on('click', function (ev) {
      syncCoords(ev.latlng.lat, ev.latlng.lng);
    });

    var syncRad = function (r) {
      var val = Math.max(10, parseInt(r || 150, 10));
      document.getElementById('setRadiusRange').value = Math.min(3000, val);
      document.getElementById('setRadiusNum').value = val;
      document.getElementById('radDisplay').textContent = val + ' meter';
      circle.setRadius(val);
    };

    document.getElementById('setRadiusRange').addEventListener('input', function (e) { syncRad(e.target.value); });
    document.getElementById('setRadiusNum').addEventListener('input', function (e) { syncRad(e.target.value); });

    document.getElementById('useCurrentLocBtn').addEventListener('click', function () {
      if (!navigator.geolocation) {
        showToast('Perangkat tidak mendukung GPS.', 'error');
        return;
      }
      navigator.geolocation.getCurrentPosition(function (pos) {
        syncCoords(pos.coords.latitude, pos.coords.longitude);
        map.setView([pos.coords.latitude, pos.coords.longitude], 17);
        showToast('Lokasi saat ini berhasil dipilih!', 'success');
      }, function (err) {
        showToast('Gagal mengambil GPS: ' + err.message, 'error');
      }, { enableHighAccuracy: true });
    });

    document.getElementById('mapSettingsForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('saveMapBtn');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        var res = await apiCall('saveSettings', {
          settings: {
            KANTOR_LAT: document.getElementById('setLat').value.trim(),
            KANTOR_LNG: document.getElementById('setLng').value.trim(),
            RADIUS_METER: document.getElementById('setRadiusNum').value.trim()
          }
        });
        state.settings = res.settings;
        invalidateCache(['settingsFull', 'absenToday']);
        renderNavigation();
        showToast(res.message, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Simpan Lokasi & Radius Kantor';
      }
    });

    setTimeout(function () { map.invalidateSize(); }, 180);
  }

  function bindShiftAndHolidayForms(container) {
    document.getElementById('shiftSettingsForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('saveShiftBtn');
      btn.disabled = true;
      try {
        var res = await apiCall('saveSettings', {
          settings: {
            JAM_MASUK: document.getElementById('setJamMasuk').value,
            JAM_PULANG: document.getElementById('setJamPulang').value,
            TOLERANSI_MENIT: document.getElementById('setToleransi').value
          }
        });
        state.settings = res.settings;
        invalidateCache(['settingsFull', 'absenToday']);
        renderNavigation();
        showToast(res.message, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('addHolidayForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('addHolBtn');
      btn.disabled = true;
      try {
        var res = await apiCall('saveHoliday', {
          tanggal: document.getElementById('holDate').value,
          nama: document.getElementById('holName').value.trim()
        });
        invalidateCache(['settingsFull', 'dashboard:']);
        showToast(res.message, 'success');
        renderPengaturanView(container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
      }
    });
  }

  function bindKopForm(container) {
    var pendingLogoB64 = '';
    document.getElementById('setLogoFile').addEventListener('change', async function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      pendingLogoB64 = await compressImageFile(file, 260, 0.85);
      showToast('Logo siap disimpan.', 'success');
    });

    document.getElementById('kopSettingsForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('saveKopBtn');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        var res = await apiCall('saveSettings', {
          logoBase64: pendingLogoB64,
          settings: {
            NAMA_PERUSAHAAN: document.getElementById('setNamaPt').value.trim(),
            ALAMAT_PERUSAHAAN: document.getElementById('setAlamatPt').value.trim(),
            KONTAK_PERUSAHAAN: document.getElementById('setKontakPt').value.trim(),
            KOTA_TTD: document.getElementById('setKotaTtd').value.trim(),
            TTD_NAMA: document.getElementById('setNamaTtd').value.trim(),
            TTD_JABATAN: document.getElementById('setJabatanTtd').value.trim()
          }
        });
        state.settings = res.settings;
        invalidateCache(['settingsFull']);
        showToast(res.message, 'success');
        renderPengaturanView(container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Simpan Kop Surat & TTD';
      }
    });
  }

  /* ==========================================================================
     9. PROFIL SAYA (UPLOAD FOTO PROFIL -> GOOGLE DRIVE)
     ========================================================================== */

  async function renderProfilView(container) {
    var u = state.user;
    var pendingFotoBase64 = '';

    container.innerHTML = '' +
      '<div class="page-header"><div><h1 class="page-title">Profil Saya</h1><p class="page-subtitle">Perbarui foto profil (tersimpan ke Google Drive), kontak, atau password akun Anda.</p></div></div>' +
      '<div class="dash-grid-2">' +
      '<div class="card" style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px">' +
      '<div id="profileBigAvatar">' + renderAvatarHtml(u.fotoUrl, u.nama, '') + '</div>' +
      '<h3>' + escapeHtml(u.nama) + '</h3>' +
      '<p class="cell-sub">' + escapeHtml(u.id) + ' • ' + escapeHtml(u.jabatan) + ' (' + escapeHtml(u.departemen) + ')</p>' +
      renderStatusPill(u.role) +
      '<input type="file" id="profileFotoInput" accept="image/*" class="hidden" />' +
      '<label for="profileFotoInput" class="btn btn-secondary" style="cursor:pointer">' + svgIcon('camera') + '<span>Pilih / Upload Foto Profil</span></label>' +
      '<small id="profileFotoHint" style="color:var(--text-muted)">Setelah memilih foto, klik "Simpan Perubahan Profil".</small>' +
      '</div>' +

      '<form id="ownProfileForm" class="card stack-form">' +
      '<h2 class="card-title">Edit Kontak &amp; Password</h2>' +
      '<div class="form-group"><label>Email</label><input type="email" id="profEmail" value="' + escapeHtml(u.email) + '" /></div>' +
      '<div class="form-group"><label>No. HP</label><input type="text" id="profHp" value="' + escapeHtml(u.noHp) + '" /></div>' +
      '<div class="form-group"><label>Password Baru (Kosongkan jika tidak diganti)</label><input type="password" id="profPass" placeholder="Minimal 6 karakter" /></div>' +
      '<button type="submit" id="profSaveBtn" class="btn btn-primary">Simpan Perubahan Profil</button>' +
      '</form></div>';

    var bigAv = document.querySelector('#profileBigAvatar .avatar-circle');
    if (bigAv) {
      bigAv.style.width = '88px';
      bigAv.style.height = '88px';
      bigAv.style.fontSize = '26px';
    }

    document.getElementById('profileFotoInput').addEventListener('change', async function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      pendingFotoBase64 = await compressImageFile(file, 500, 0.8);
      document.getElementById('profileBigAvatar').innerHTML = '<div class="avatar-circle" style="width:88px;height:88px"><img src="' + pendingFotoBase64 + '" alt="Preview" /></div>';
      document.getElementById('profileFotoHint').textContent = 'Foto baru dipilih. Klik Simpan Perubahan Profil.';
    });

    document.getElementById('ownProfileForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var btn = document.getElementById('profSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        var res = await apiCall('updateOwnProfile', {
          email: document.getElementById('profEmail').value.trim(),
          noHp: document.getElementById('profHp').value.trim(),
          newPassword: document.getElementById('profPass').value,
          fotoBase64: pendingFotoBase64
        });
        state.user = res.user;
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(res.user));
        invalidateCache(['employees:', 'dashboard:']);
        renderNavigation();
        showToast(res.message, 'success');
        renderProfilView(container);
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Simpan Perubahan Profil';
      }
    });
  }

  /* ==========================================================================
     GLOBAL EVENT DELEGATION & INITIALIZATION
     ========================================================================== */

  function bindGlobalEvents() {
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.getElementById('modalBackdrop').addEventListener('click', function (ev) {
      if (ev.target.id === 'modalBackdrop') closeModal();
    });

    document.getElementById('openApiConfigBtn').addEventListener('click', openApiConfigModal);
    document.getElementById('toggleLoginPass').addEventListener('click', function () {
      var inp = document.getElementById('loginPassword');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('loginForm').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!state.apiUrl) {
        showToast('Silakan atur URL Server Backend terlebih dahulu.', 'warning');
        openApiConfigModal();
        return;
      }
      var btn = document.getElementById('loginSubmitBtn');
      btn.disabled = true;
      btn.innerHTML = '<span>Memverifikasi...</span>';
      try {
        var res = await apiCall('login', {
          id: document.getElementById('loginNip').value.trim(),
          password: document.getElementById('loginPassword').value
        });
        state.token = res.token;
        state.user = res.user;
        state.settings = res.settings || {};
        localStorage.setItem(STORAGE_KEYS.TOKEN, res.token);
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(res.user));
        enterAppShell();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Masuk ke Aplikasi</span>';
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
      confirmAction('Keluar dari Aplikasi', 'Apakah Anda yakin ingin keluar dari sesi saat ini?', 'Keluar', async function () {
        try { await apiCall('logout', {}); } catch (e) { /* ignore */ }
        handleForceLogout();
      });
    });

    document.getElementById('refreshViewBtn').addEventListener('click', function () {
      state.cache = {};
      showToast('Menyegarkan data terbaru dari server...', 'success');
      renderCurrentRoute();
    });

    document.getElementById('sidebarQuickAbsenBtn').addEventListener('click', function () {
      navigateTo('absen');
    });

    document.getElementById('userChipBtn').addEventListener('click', function () {
      navigateTo('profil');
    });

    document.getElementById('notifBellBtn').addEventListener('click', function () {
      if (isAdmin()) {
        if (state.pendingCounts.cuti > 0) navigateTo('cuti');
        else if (state.pendingCounts.lembur > 0) navigateTo('lembur');
        else showToast('Tidak ada pengajuan yang menunggu approval.', 'success');
      } else {
        navigateTo('cuti');
      }
    });

    document.getElementById('globalSearchInput').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        var q = ev.target.value.trim();
        state.filters.attendance.search = q;
        state.filters.attendance.offset = 0;
        navigateTo('rekap');
      }
    });

    document.getElementById('drawerCloseBtn').addEventListener('click', function () {
      document.getElementById('mobileDrawerBackdrop').classList.add('hidden');
    });
    document.getElementById('mobileDrawerBackdrop').addEventListener('click', function (ev) {
      if (ev.target.id === 'mobileDrawerBackdrop') {
        document.getElementById('mobileDrawerBackdrop').classList.add('hidden');
      }
    });

    // Delegasi klik navigasi & tombol aksi tabel secara aman
    document.body.addEventListener('click', function (ev) {
      var navBtn = ev.target.closest('[data-nav]');
      if (navBtn) {
        navigateTo(navBtn.getAttribute('data-nav'));
        return;
      }

      if (ev.target.closest('#openMobileDrawerBtn')) {
        document.getElementById('mobileDrawerBackdrop').classList.remove('hidden');
        return;
      }
      if (ev.target.closest('#drawerLogoutBtn')) {
        document.getElementById('mobileDrawerBackdrop').classList.add('hidden');
        document.getElementById('logoutBtn').click();
        return;
      }

      var actBtn = ev.target.closest('[data-action]');
      if (!actBtn) return;

      var action = actBtn.getAttribute('data-action');
      var id = actBtn.getAttribute('data-id');

      if (action === 'previewFoto') {
        var url = actBtn.getAttribute('data-url');
        var title = actBtn.getAttribute('data-title') || 'Preview Foto';
        var thumb = driveThumbUrl(url);
        openModal(title, '<div style="text-align:center">' +
          '<img src="' + escapeHtml(thumb) + '" alt="Selfie" style="max-width:100%;border-radius:12px;margin-bottom:12px" />' +
          '<div><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener" class="btn btn-primary">Buka Asli di Google Drive</a></div></div>');
      } else if (action === 'reviewLeave') {
        openReviewModal('leave', id, actBtn.getAttribute('data-nama'));
      } else if (action === 'reviewOvertime') {
        openReviewModal('overtime', id, actBtn.getAttribute('data-nama'));
      } else if (action === 'editEmployee') {
        var empCache = state.cache['employees:' + JSON.stringify(state.filters.employees)];
        var foundEmp = empCache && empCache.items.find(function (x) { return x.id === id; });
        if (foundEmp) openEmployeeModal(foundEmp);
      } else if (action === 'resetPassEmployee') {
        openResetPasswordModal(id, actBtn.getAttribute('data-nama'));
      } else if (action === 'editPayslip') {
        var slpCache = state.cache['payslips:' + JSON.stringify(state.filters.payslips)];
        var foundSlip = slpCache && slpCache.items.find(function (x) { return x.id === id; });
        if (foundSlip) openPayslipModal(foundSlip);
      } else if (action === 'downloadSlipPdf') {
        var slpCache2 = state.cache['payslips:' + JSON.stringify(state.filters.payslips)];
        var foundSlip2 = slpCache2 && slpCache2.items.find(function (x) { return x.id === id; });
        if (foundSlip2) downloadSlipGajiPdf(foundSlip2);
      } else if (action === 'deletePayslip') {
        confirmAction('Hapus Slip Gaji', 'Yakin ingin menghapus slip gaji ' + id + '?', 'Hapus', async function () {
          try {
            var res = await apiCall('deletePayslip', { id: id });
            invalidateCache(['payslips:']);
            showToast(res.message, 'success');
            renderGajiView(document.getElementById('pageContent'));
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      } else if (action === 'deleteHoliday') {
        confirmAction('Hapus Hari Libur', 'Hapus hari libur ' + id + '?', 'Hapus', async function () {
          try {
            var res = await apiCall('deleteHoliday', { id: id });
            invalidateCache(['settingsFull', 'dashboard:']);
            showToast(res.message, 'success');
            renderPengaturanView(document.getElementById('pageContent'));
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      }
    });
  }

  async function enterAppShell() {
    document.getElementById('loginView').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    state.route = 'dashboard';
    renderNavigation();
    try {
      var st = await apiCall('getSettings', {});
      state.settings = st.settings || {};
      state.cache.settingsFull = st;
      renderNavigation();
    } catch (e) { /* settings will retry on view */ }
    renderCurrentRoute();
  }

  function bootstrap() {
    bindGlobalEvents();
    if (state.apiUrl) {
      testServerConnection(state.apiUrl);
    }
    if (state.token && state.user) {
      enterAppShell();
    }
  }

  bootstrap();
})();
