const STORAGE_KEY = "simpresma_app_data";
let currentUser = null;
let currentPage = "dashboard";
let currentTheme = localStorage.getItem("simpresma_theme") || "dark";
let allData = [];
const defaultConfig = {
  app_title: "SIMPRESMA",
  university_name: "Universitas XYZ",
  background_color: "#0f172a",
  surface_color: "#1e293b",
  text_color: "#e2e8f0",
  primary_color: "#3b82f6",
  secondary_color: "#8b5cf6",
};
const USER_CREDENTIALS_KEY = "simpresma_user_credentials";
const defaultCredentials = {
  student: {
    password: "student123",
    role: "mahasiswa",
    email: "student@example.com",
  },
  admin: {
    password: "admin123",
    role: "admin",
    email: "admin@example.com",
  },
};
let userCredentials = loadCredentials();
let isRegisterMode = false;
let notificationEventsAttached = false;
function loadCredentials() {
  const stored = localStorage.getItem(USER_CREDENTIALS_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const merged = { ...defaultCredentials, ...parsed };
      localStorage.setItem(USER_CREDENTIALS_KEY, JSON.stringify(merged));
      return merged;
    } catch (e) {
      console.warn("Failed to parse credentials", e);
    }
  }
  localStorage.setItem(
    USER_CREDENTIALS_KEY,
    JSON.stringify(defaultCredentials),
  );
  return { ...defaultCredentials };
}
function saveCredentials() {
  localStorage.setItem(USER_CREDENTIALS_KEY, JSON.stringify(userCredentials));
}
function addUser(username, password, role, email) {
  userCredentials[username] = { password, role, email };
  saveCredentials();
}
function updateLoginModeUI() {
  const title = document.getElementById("login-form-title");
  const submitBtn = document.getElementById("login-submit-btn");
  const toggleBtn = document.getElementById("toggle-register-btn");
  const confirmField = document.getElementById("login-confirm-password-field");
  const emailField = document.getElementById("login-email-field");
  const emailInput = document.getElementById("login-email");
  const confirmInput = document.getElementById("login-confirm-password");
  if (!title || !submitBtn || !toggleBtn || !confirmField || !emailField)
    return;
  if (isRegisterMode) {
    title.textContent = "Daftar Akun Mahasiswa";
    submitBtn.textContent = "Buat Akun";
    toggleBtn.textContent = "Sudah Punya Akun? Login";
    confirmField.classList.remove("hidden");
    emailField.classList.remove("hidden");
    if (emailInput) emailInput.required = true;
    if (confirmInput) confirmInput.required = true;
  } else {
    title.textContent = "Masuk ke akun Anda";
    submitBtn.textContent = "Masuk";
    toggleBtn.textContent = "Buat Akun Mahasiswa";
    confirmField.classList.add("hidden");
    emailField.classList.add("hidden");
    if (emailInput) emailInput.required = false;
    if (confirmInput) confirmInput.required = false;
  }
  const loginModeInput = document.getElementById("login-mode");
  if (loginModeInput) {
    loginModeInput.value = isRegisterMode ? "register" : "login";
  }
}
function resetLoginForm() {
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
  const confirmInput = document.getElementById("login-confirm-password");
  if (confirmInput) confirmInput.value = "";
  const emailInput = document.getElementById("login-email");
  if (emailInput) emailInput.value = "";
}

function loadBackendData() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn("Failed to parse stored data", e);
    return [];
  }
}
function saveBackendData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("Penyimpanan lokal penuh, gunakan database server", e);
  }
}
function createBackendId() {
  return `simpresma-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function getImageSrc(value) {
  if (!value || typeof value !== "string") return "";
  if (
    value.startsWith("data:") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("uploads/")
  ) {
    return value;
  }
  return "";
}
async function apiRequest(action, payload = null) {
  const options = payload
    ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    : { method: "GET" };
  const response = await fetch(
    `api.php?action=${encodeURIComponent(action)}`,
    options,
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "Permintaan gagal diproses");
  }
  return data;
}
async function uploadImageFile(file) {
  if (!file) return "";
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File terlalu besar (maksimal 5MB)");
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar");
  }
  const formData = new FormData();
  formData.append("file", file);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch("api.php?action=upload", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(
        "Upload terlalu lama. Coba kompres gambar atau pilih file lebih kecil.",
      );
    }
    throw new Error(
      "Tidak bisa menghubungi server upload. Pastikan dibuka lewat index.php di localhost.",
    );
  } finally {
    clearTimeout(timeoutId);
  }
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    throw new Error(
      "Server upload mengirim respon tidak valid. Cek Apache/PHP dan database MySQL.",
    );
  }
  if (!response.ok || data.ok === false || !data.url) {
    throw new Error(data.message || "Upload gambar gagal");
  }
  return data.url;
}
function ensureElementSdk() {
  if (
    !window.elementSdk ||
    !window.elementSdk.init ||
    !window.elementSdk.setConfig
  ) {
    window.elementSdk = {
      init() {},
      setConfig() {},
    };
  }
}
function ensureDataSdk() {
  if (
    !window.dataSdk ||
    !window.dataSdk.init ||
    !window.dataSdk.create ||
    !window.dataSdk.update ||
    !window.dataSdk.delete
  ) {
    let dataHandler = null;
    let storedData = [];
    function notifyDataChanged() {
      if (dataHandler && dataHandler.onDataChanged) {
        dataHandler.onDataChanged([...storedData]);
      }
    }
    async function refreshData() {
      try {
        const response = await apiRequest("list");
        storedData = response.data || [];
        saveBackendData(storedData);
      } catch (e) {
        console.warn(
          "Database server belum tersedia, memakai data lokal sementara",
          e,
        );
        storedData = loadBackendData();
      }
      notifyDataChanged();
    }
    window.dataSdk = {
      async init(handler) {
        dataHandler = handler;
        await refreshData();
      },
      async create(record) {
        const item = {
          ...record,
          __backendId: record.__backendId || createBackendId(),
        };
        try {
          const response = await apiRequest("create", item);
          await refreshData();
          return { isOk: true, data: response.data || item };
        } catch (e) {
          console.error(e);
          storedData.push(item);
          saveBackendData(storedData);
          notifyDataChanged();
          return {
            isOk: true,
            data: item,
            offline: true,
            warning:
              "Data tersimpan sementara di browser karena database/server belum tersambung.",
          };
        }
      },
      async update(record) {
        if (!record || !record.__backendId) return { isOk: false };
        try {
          const response = await apiRequest("update", record);
          await refreshData();
          return { isOk: true, data: response.data || record };
        } catch (e) {
          console.error(e);
          return { isOk: false, error: e.message };
        }
      },
      async delete(record) {
        if (!record || !record.__backendId) return { isOk: false };
        try {
          await apiRequest("delete", { __backendId: record.__backendId });
          await refreshData();
          return { isOk: true };
        } catch (e) {
          console.error(e);
          return { isOk: false, error: e.message };
        }
      },
    };
  }
}
function showToast(msg, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
    type === "success"
      ? "bg-green-600"
      : type === "error"
        ? "bg-red-600"
        : "bg-blue-600"
  } text-white`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
function getAchievements() {
  return allData.filter((d) => d.type === "prestasi");
}
function getCompetitions() {
  return allData.filter((d) => d.type === "kompetisi");
}
function getPublishedCompetitions() {
  return getCompetitions().filter((d) => d.status === "published");
}
function getNotifications() {
  return allData.filter(
    (d) =>
      d.is_notification === true && d.submitted_by === currentUser.username,
  );
}
function getUnreadNotifications() {
  return getNotifications().filter((n) => n.unread !== false);
}
function markNotificationRead(id) {
  const record = allData.find((d) => String(d.__backendId) === String(id));
  if (!record || record.unread === false) return Promise.resolve();
  return window.dataSdk.update({ ...record, unread: false });
}
function showNotificationDetail(notification) {
  const modal = document.createElement("div");
  modal.className =
    "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4";
  modal.innerHTML = `
    <div class="bg-slate-900/95 text-slate-100 rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto p-5 border border-slate-700">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold">Detail Notifikasi</h2>
          <p class="text-xs text-slate-400 mt-1">${new Date(notification.tanggal || notification.__createdAt || Date.now()).toLocaleString("id-ID")}</p>
        </div>
        <button id="close-notif-detail" class="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition">Tutup</button>
      </div>
      <div class="space-y-3">
        <p class="text-sm text-slate-200">${
          notification.notif_type === "rejected"
            ? "Pengajuan Anda ditolak."
            : notification.notif_type === "approved"
              ? "Pengajuan Anda disetujui."
              : "Ada pembaruan pada pengajuan Anda."
        }</p>
        <div class="p-4 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm">
          ${notification.feedback || "Tidak ada detail pemberitahuan."}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document
    .getElementById("close-notif-detail")
    .addEventListener("click", () => modal.remove());
}
function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle("light-mode", theme === "light");
  localStorage.setItem("simpresma_theme", theme);
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) {
    btn.textContent = theme === "light" ? "Mode Gelap" : "Mode Terang";
  }
}
function toggleTheme() {
  applyTheme(currentTheme === "light" ? "dark" : "light");
}
function getPendingSubmissions() {
  return allData.filter(
    (item) =>
      item.submitted_by === currentUser.username &&
      item.status === "pending" &&
      !item.is_notification,
  );
}
function getValidatedAchievements() {
  return getAchievements().filter((a) => a.status === "validated");
}
const mahasiswaMenu = [
  { id: "dashboard", icon: "layout-dashboard", label: "Dashboard" },
  { id: "kompetisi", icon: "grid", label: "Kompetisi Terpublikasi" },
  { id: "prestasi", icon: "award", label: "Lihat Semua Prestasi" },
  {
    id: "ajukan-prestasi",
    icon: "file-plus",
    label: "Ajukan Validasi Prestasi",
  },
  {
    id: "ajukan-kompetisi",
    icon: "megaphone",
    label: "Ajukan Publikasi Kompetisi",
  },
  { id: "surat-dispen", icon: "file-text", label: "Download Surat Dispen" },
  { id: "surat-tugas", icon: "file-text", label: "Download Surat Tugas" },
  {
    id: "publikasi-prestasi",
    icon: "external-link",
    label: "Pengajuan Publikasi Prestasi",
  },
];
const adminMenu = [
  { id: "dashboard", icon: "layout-dashboard", label: "Dashboard" },
  { id: "validasi-prestasi", icon: "check-circle", label: "Validasi Prestasi" },
  {
    id: "validasi-kompetisi",
    icon: "check-square",
    label: "Validasi Kompetisi",
  },
  { id: "manajemen", icon: "settings", label: "Manajemen Data" },
];
function renderNav() {
  const nav = document.getElementById("nav-menu");
  const menu = currentUser.role === "admin" ? adminMenu : mahasiswaMenu;
  nav.innerHTML = menu
    .map(
      (m) => `
        <button class="sidebar-item w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 ${
          currentPage === m.id ? "active" : ""
        }" data-page="${m.id}">
          <i data-lucide="${m.icon}" class="w-4 h-4"></i> ${m.label}
        </button>
      `,
    )
    .join("");
  nav.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentPage = btn.dataset.page;
      renderNav();
      renderCurrentPage();
    });
  });
  lucide.createIcons();
}
function renderCurrentPage() {
  const content = document.getElementById("main-content");
  switch (currentPage) {
    case "dashboard":
      content.innerHTML =
        currentUser.role === "admin"
          ? renderDashboardAdmin()
          : renderDashboard();
      break;
    case "kompetisi":
      content.innerHTML = renderCompetitions();
      break;
    case "prestasi":
      content.innerHTML = renderPrestasi();
      break;
    case "ajukan-prestasi":
      content.innerHTML = renderFormPrestasi();
      break;
    case "ajukan-kompetisi":
      content.innerHTML = renderFormKompetisi();
      break;
    case "surat-dispen":
      content.innerHTML = renderSuratDispen();
      break;
    case "surat-tugas":
      content.innerHTML = renderSuratTugas();
      break;
    case "publikasi-prestasi":
      content.innerHTML = renderPublikasiPrestasi();
      break;
    case "validasi-prestasi":
      content.innerHTML = renderValidasiPrestasi();
      break;
    case "validasi-kompetisi":
      content.innerHTML = renderValidasiKompetisi();
      break;
    case "manajemen":
      content.innerHTML = renderManajemen();
      break;
  }
  attachPageEvents();
  lucide.createIcons();
}
function renderDashboard() {
  const published = getPublishedCompetitions();
  const achievements = getAchievements().filter(
    (a) => a.submitted_by === currentUser.username,
  );
  const validated = achievements.filter((a) => a.status === "validated").length;
  const notifications = getNotifications();
  const unread = getUnreadNotifications().length;
  return `
        <div class="fade-in space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-2xl font-bold text-white">Dashboard</h1>
              <p class="text-slate-400 text-sm mt-1">Selamat datang, ${currentUser.username}</p>
            </div>
            <div class="relative">
              <button id="notif-bell" class="w-12 h-12 rounded-lg bg-slate-700/50 flex items-center justify-center hover:bg-slate-700 transition relative">
                <i data-lucide="bell" class="w-5 h-5 text-slate-300"></i>
                ${
                  unread > 0
                    ? `<span class="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">${unread}</span>`
                    : ""
                }
              </button>
              <div id="notif-dropdown" class="hidden absolute top-14 right-0 w-80 bg-slate-800/95 border border-slate-700/50 rounded-xl shadow-xl max-h-96 overflow-auto">
                <div class="p-3 border-b border-slate-700/50 sticky top-0 bg-slate-800">
                  <h3 class="text-sm font-semibold text-white">Notifikasi (${notifications.length})</h3>
                </div>
                ${
                  notifications.length === 0
                    ? '<p class="p-4 text-xs text-slate-500 text-center">Tidak ada notifikasi</p>'
                    : notifications
                        .map(
                          (n) => `
                    <button type="button" class="notification-item w-full text-left p-3 border-b border-slate-700/30 hover:bg-slate-700/50 transition" data-id="${n.__backendId}">
                      <div class="flex items-start gap-2">
                        <div class="w-2 h-2 rounded-full ${
                          n.unread !== false ? "bg-blue-500" : "bg-slate-600"
                        } mt-1 flex-shrink-0"></div>
                        <div class="flex-1 min-w-0">
                          <p class="text-xs font-medium text-white">${
                            n.notif_type === "rejected"
                              ? "❌ Pengajuan Ditolak"
                              : n.notif_type === "approved"
                                ? "✅ Pengajuan Disetujui"
                                : "Feedback"
                          }</p>
                          <p class="text-xs text-slate-400 mt-0.5">${n.feedback || "Tidak ada pesan"}</p>
                          <p class="text-xs text-slate-500 mt-1">${new Date(n.tanggal || n.__createdAt || Date.now()).toLocaleDateString("id-ID")}</p>
                        </div>
                      </div>
                    </button>
                  `,
                        )
                        .join("")
                }
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="stat-card rounded-xl p-5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center"><i data-lucide="trophy" class="w-5 h-5 text-blue-400"></i></div>
                <div><p class="text-2xl font-bold text-white">${achievements.length}</p><p class="text-xs text-slate-400">Prestasi Saya</p></div>
              </div>
            </div>
            <div class="stat-card rounded-xl p-5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center"><i data-lucide="check-circle" class="w-5 h-5 text-green-400"></i></div>
                <div><p class="text-2xl font-bold text-white">${validated}</p><p class="text-xs text-slate-400">Tervalidasi</p></div>
              </div>
            </div>
            <div class="stat-card rounded-xl p-5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center"><i data-lucide="megaphone" class="w-5 h-5 text-purple-400"></i></div>
                <div><p class="text-2xl font-bold text-white">${published.length}</p><p class="text-xs text-slate-400">Kompetisi Aktif</p></div>
              </div>
            </div>
          </div>
          <div class="glass rounded-xl p-5">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold text-white">Pengajuan Saya Belum Valid</h2>
            </div>
            ${
              getPendingSubmissions().length === 0
                ? '<p class="text-slate-500 text-sm">Tidak ada pengajuan pending.</p>'
                : `<div class="space-y-3">${getPendingSubmissions()
                    .map(
                      (item) => `
                <div class="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50">
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-white">${item.type === "prestasi" ? item.nama_kompetisi || "Prestasi" : item.judul_kompetisi || "Kompetisi"}</p>
                      <p class="text-xs text-slate-400 mt-1">${item.type === "prestasi" ? "Prestasi" : "Kompetisi"}</p>
                      <p class="text-xs text-slate-500 mt-1">Status: ${item.status}</p>
                    </div>
                    <span class="px-2 py-1 rounded-full text-xs bg-yellow-500/20 text-yellow-400">Menunggu</span>
                  </div>
                </div>
              `,
                    )
                    .join("")}</div>`
            }
          </div>
          <div>
            <h2 class="text-lg font-semibold text-white mb-3">Kompetisi Terpublikasi</h2>
            ${
              published.length === 0
                ? '<p class="text-slate-500 text-sm">Belum ada kompetisi yang dipublikasikan.</p>'
                : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${published
                    .map(
                      (c) => `
                <div class="glass rounded-xl p-5 card-hover">
                  <div class="w-full h-32 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-3 overflow-hidden">
                    ${
                      getImageSrc(c.poster_url)
                        ? `<img src="${getImageSrc(c.poster_url)}" class="w-full h-full object-cover">`
                        : '<i data-lucide="image" class="w-10 h-10 text-slate-500"></i>'
                    }
                  </div>
                  <h3 class="font-semibold text-white text-sm">${c.judul_kompetisi || ""}</h3>
                  <p class="text-xs text-slate-400 mt-1 line-clamp-2">${c.deskripsi || ""}</p>
                  <button class="mt-4 btn-primary text-white text-xs px-3 py-2 rounded-lg view-competition-btn" data-id="${c.__backendId}">Lihat Detail</button>
                </div>
              `,
                    )
                    .join("")}</div>`
            }
          </div>
        </div>
      `;
}
function renderDashboardAdmin() {
  const published = getPublishedCompetitions();
  const pending =
    getAchievements().filter((a) => a.status === "pending").length +
    getCompetitions().filter((c) => c.status === "pending").length;
  const totalData = allData.filter((d) => !d.is_notification).length;
  return `
        <div class="fade-in space-y-6">
          <div>
            <h1 class="text-2xl font-bold text-white">Dashboard Admin</h1>
            <p class="text-slate-400 text-sm mt-1">Sistem Manajemen Prestasi & Kompetisi</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="stat-card rounded-xl p-5 border-l-4 border-blue-500">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                  <i data-lucide="megaphone" class="w-6 h-6 text-blue-400"></i>
                </div>
                <div>
                  <p class="text-3xl font-bold text-white">${published.length}</p>
                  <p class="text-xs text-slate-400 mt-1">Kompetisi Aktif</p>
                </div>
              </div>
            </div>
            <div class="stat-card rounded-xl p-5 border-l-4 border-yellow-500">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
                  <i data-lucide="clock" class="w-6 h-6 text-yellow-400"></i>
                </div>
                <div>
                  <p class="text-3xl font-bold text-white">${pending}</p>
                  <p class="text-xs text-slate-400 mt-1">Menunggu Validasi</p>
                </div>
              </div>
            </div>
            <div class="stat-card rounded-xl p-5 border-l-4 border-purple-500">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                  <i data-lucide="database" class="w-6 h-6 text-purple-400"></i>
                </div>
                <div>
                  <p class="text-3xl font-bold text-white">${totalData}</p>
                  <p class="text-xs text-slate-400 mt-1">Total Data</p>
                </div>
              </div>
            </div>
            <div class="stat-card rounded-xl p-5 border-l-4 border-green-500">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                  <i data-lucide="users" class="w-6 h-6 text-green-400"></i>
                </div>
                <div>
                  <p class="text-3xl font-bold text-white">${new Set(allData.filter((d) => d.submitted_by && !d.is_notification).map((d) => d.submitted_by)).size}</p>
                  <p class="text-xs text-slate-400 mt-1">Mahasiswa Aktif</p>
                </div>
              </div>
            </div>
          </div>
          <div class="glass rounded-xl p-6">
            <h2 class="text-lg font-semibold text-white mb-4">📢 Kompetisi Terpublikasi</h2>
            ${
              published.length === 0
                ? '<div class="text-center py-8"><p class="text-slate-500 text-sm">Belum ada kompetisi yang dipublikasikan</p></div>'
                : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${published
                    .map(
                      (c) => `
                <div class="bg-slate-700/30 rounded-lg p-4 hover:bg-slate-700/50 transition border border-slate-600/30">
                  <div class="w-full h-36 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-3 overflow-hidden border border-slate-600/20">
                    ${
                      getImageSrc(c.poster_url)
                        ? `<img src="${getImageSrc(c.poster_url)}" class="w-full h-full object-cover">`
                        : '<i data-lucide="image" class="w-10 h-10 text-slate-500"></i>'
                    }
                  </div>
                  <h3 class="font-semibold text-white text-sm mb-1">${c.judul_kompetisi || ""}</h3>
                  <p class="text-xs text-slate-400 line-clamp-2 mb-2">${c.deskripsi || ""}</p>
                  <p class="text-xs text-slate-500 border-t border-slate-600/30 pt-2">👤 ${c.submitted_by || "-"}</p>
                  <button class="mt-4 btn-primary text-white text-xs px-3 py-2 rounded-lg view-competition-btn" data-id="${c.__backendId}">Lihat Detail</button>
                </div>
              `,
                    )
                    .join("")}</div>`
            }
          </div>
        </div>
      `;
}
function renderCompetitions() {
  const published = getPublishedCompetitions();
  return `
        <div class="fade-in space-y-6">
          <h1 class="text-2xl font-bold text-white">Kompetisi Terpublikasikan</h1>
          <p class="text-slate-400 text-sm">Semua kompetisi yang sudah dipublikasikan oleh admin tersedia untuk seluruh mahasiswa.</p>
          ${
            published.length === 0
              ? '<div class="glass rounded-xl p-6 text-center text-slate-500">Belum ada kompetisi yang dipublikasikan.</div>'
              : `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${published
                  .map(
                    (c) => `
                <div class="glass rounded-xl p-5 card-hover">
                  <div class="w-full h-32 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center mb-3 overflow-hidden">
                    ${
                      getImageSrc(c.poster_url)
                        ? `<img src="${getImageSrc(c.poster_url)}" class="w-full h-full object-cover">`
                        : '<i data-lucide="image" class="w-10 h-10 text-slate-500"></i>'
                    }
                  </div>
                  <h3 class="font-semibold text-white text-sm mb-1">${c.judul_kompetisi || ""}</h3>
                  <p class="text-xs text-slate-400 line-clamp-3 mb-2">${c.deskripsi || ""}</p>
                  <button class="mt-4 btn-primary text-white text-xs px-3 py-2 rounded-lg view-competition-btn" data-id="${c.__backendId}">Lihat Detail</button>
                </div>
              `,
                  )
                  .join("")}</div>`
          }
        </div>
      `;
}

function renderPrestasi() {
  const achievements = getAchievements();
  const validatedItems = achievements.filter((a) => a.status === "validated");
  const validated = validatedItems.length;
  const pending = achievements.filter((a) => a.status === "pending").length;
  const pct = achievements.length
    ? Math.round((validated / achievements.length) * 100)
    : 0;
  const categoryCounts = validatedItems.reduce((acc, item) => {
    const key = item.kategori || "Lainnya";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return `
        <div class="fade-in space-y-6">
          <h1 class="text-2xl font-bold text-white">Data Statistik Prestasi</h1>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="stat-card rounded-xl p-4 text-center"><p class="text-xl font-bold text-white">${achievements.length}</p><p class="text-xs text-slate-400">Total Pengajuan</p></div>
            <div class="stat-card rounded-xl p-4 text-center"><p class="text-xl font-bold text-green-400">${validated}</p><p class="text-xs text-slate-400">Tervalidasi</p></div>
            <div class="stat-card rounded-xl p-4 text-center"><p class="text-xl font-bold text-yellow-400">${pending}</p><p class="text-xs text-slate-400">Pending</p></div>
            <div class="stat-card rounded-xl p-4 text-center"><p class="text-xl font-bold text-blue-400">${pct}%</p><p class="text-xs text-slate-400">Rasio Validasi</p></div>
          </div>
          <div class="glass rounded-xl p-5 space-y-4">
            <h2 class="text-lg font-semibold text-white">Rincian Perolehan</h2>
            ${
              Object.keys(categoryCounts).length === 0
                ? '<p class="text-slate-500 text-sm">Belum ada prestasi tervalidasi.</p>'
                : `<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${Object.entries(
                    categoryCounts,
                  )
                    .map(
                      ([kategori, count]) =>
                        `<div class="bg-slate-800/80 rounded-xl p-4 text-sm text-white"><p class="font-semibold">${kategori}</p><p class="text-slate-400 mt-1">${count} prestasi</p></div>`,
                    )
                    .join("")}</div>`
            }
          </div>
          <div class="glass rounded-xl overflow-hidden">
            <div class="p-4 border-b border-slate-700/50">
              <h2 class="text-base font-semibold text-white">Prestasi Tervalidasi</h2>
            </div>
            <table class="w-full text-sm">
              <thead><tr class="border-b border-slate-700/50 text-slate-400 text-xs">
                <th class="p-3 text-left">Nama</th><th class="p-3 text-left">Kompetisi</th><th class="p-3 text-left">Juara</th><th class="p-3 text-left">Kategori</th><th class="p-3 text-left">Tanggal</th>
              </tr></thead>
              <tbody>${
                validatedItems.length === 0
                  ? '<tr><td colspan="5" class="p-4 text-center text-slate-500">Belum ada prestasi tervalidasi.</td></tr>'
                  : validatedItems
                      .map(
                        (a) => `<tr class="border-b border-slate-700/30">
                  <td class="p-3">${a.nama || ""}</td>
                  <td class="p-3">${a.nama_kompetisi || ""}</td>
                  <td class="p-3">${a.juara || ""}</td>
                  <td class="p-3">${a.kategori || "-"}</td>
                  <td class="p-3">${a.tanggal || "-"}</td>
                </tr>`,
                      )
                      .join("")
              }</tbody>
            </table>
          </div>
        </div>
      `;
}
function renderFormPrestasi() {
  return `
        <div class="fade-in space-y-6 max-w-2xl">
          <h1 class="text-2xl font-bold text-white">Pengajuan Validasi Prestasi</h1>
          <form id="form-prestasi" class="glass rounded-xl p-6 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label for="fp-nama" class="block text-xs text-slate-400 mb-1">Nama Lengkap</label><input id="fp-nama" type="text" class="w-full px-3 py-2.5 rounded-lg text-sm" required></div>
              <div><label for="fp-npm" class="block text-xs text-slate-400 mb-1">NPM</label><input id="fp-npm" type="text" class="w-full px-3 py-2.5 rounded-lg text-sm" required></div>
              <div><label for="fp-angkatan" class="block text-xs text-slate-400 mb-1">Angkatan</label><input id="fp-angkatan" type="text" class="w-full px-3 py-2.5 rounded-lg text-sm" placeholder="2022" required></div>
              <div><label for="fp-kompetisi" class="block text-xs text-slate-400 mb-1">Nama Kompetisi</label><input id="fp-kompetisi" type="text" class="w-full px-3 py-2.5 rounded-lg text-sm" required></div>
              <div><label for="fp-juara" class="block text-xs text-slate-400 mb-1">Perolehan Juara</label><input id="fp-juara" type="text" class="w-full px-3 py-2.5 rounded-lg text-sm" placeholder="Juara 1" required></div>
              <div><label for="fp-tanggal" class="block text-xs text-slate-400 mb-1">Tanggal Perolehan</label><input id="fp-tanggal" type="date" class="w-full px-3 py-2.5 rounded-lg text-sm" required></div>
              <div><label for="fp-kategori" class="block text-xs text-slate-400 mb-1">Kategori Kompetisi</label>
                <select id="fp-kategori" class="w-full px-3 py-2.5 rounded-lg text-sm">
                  <option value="Nasional">Nasional</option><option value="Internasional">Internasional</option><option value="Regional">Regional</option><option value="Provinsi">Provinsi</option>
                </select>
              </div>
            </div>
            <div class="space-y-3 pt-2">
              <div>
                <label for="fp-sertifikat" class="block text-xs text-slate-400 mb-1">Upload Bukti Sertifikat (JPG/PNG)</label>
                <input id="fp-sertifikat" type="file" accept="image/jpeg,image/png" class="w-full text-xs text-slate-200" required>
                <p id="fp-sertifikat-name" class="text-xs text-slate-500 mt-1"></p>
              </div>
              <div>
                <label for="fp-bukti" class="block text-xs text-slate-400 mb-1">Upload Foto Kegiatan (JPG/PNG)</label>
                <input id="fp-bukti" type="file" accept="image/jpeg,image/png" class="w-full text-xs text-slate-200" required>
                <p id="fp-bukti-name" class="text-xs text-slate-500 mt-1"></p>
              </div>
              <div>
                <label for="fp-ktm" class="block text-xs text-slate-400 mb-1">Upload KTM (JPG/PNG)</label>
                <input id="fp-ktm" type="file" accept="image/jpeg,image/png" class="w-full text-xs text-slate-200" required>
                <p id="fp-ktm-name" class="text-xs text-slate-500 mt-1"></p>
              </div>
            </div>
            <button type="submit" class="btn-primary text-white font-semibold px-6 py-2.5 rounded-lg text-sm">Kirim Pengajuan</button>
            <p id="fp-loading" class="text-xs text-blue-400 hidden">Mengirim...</p>
          </form>
        </div>
      `;
}
function renderPrestasiFileLinks(record) {
  const files = [
    ["Sertifikat", record.bukti_sertifikat],
    ["Foto Kegiatan", record.foto_kegiatan],
    ["KTM", record.ktm],
  ].filter(([, value]) => getImageSrc(value));
  if (files.length === 0) return "";
  return `<div class="mt-3 flex flex-wrap gap-2">${files
    .map(
      ([label, value]) =>
        `<a href="${getImageSrc(value)}" target="_blank" rel="noopener noreferrer" class="px-2 py-1.5 bg-slate-700/60 hover:bg-slate-700 text-blue-300 text-xs rounded transition">${label}</a>`,
    )
    .join("")}</div>`;
}
function renderFormKompetisi() {
  return `
        <div class="fade-in space-y-6 max-w-2xl">
          <h1 class="text-2xl font-bold text-white">Pengajuan Publikasi Kompetisi</h1>
          <form id="form-kompetisi" class="glass rounded-xl p-6 space-y-4">
            <div><label for="fk-judul" class="block text-xs text-slate-400 mb-1">Judul Kompetisi</label><input id="fk-judul" type="text" class="w-full px-3 py-2.5 rounded-lg text-sm" required></div>
            <div>
              <label class="block text-xs text-slate-400 mb-2">Upload Poster Kompetisi</label>
              <div class="upload-area rounded-lg p-6 text-center cursor-pointer hover:bg-slate-700/30 transition">
                <input id="fk-poster-file" type="file" accept="image/*" class="hidden">
                <div id="poster-upload-area" class="cursor-pointer">
                  <i data-lucide="image" class="w-8 h-8 text-slate-500 mx-auto mb-2"></i>
                  <p class="text-xs text-slate-400">Klik atau drag poster di sini</p>
                  <p class="text-xs text-slate-500 mt-1">(JPG, PNG, maksimal 5MB)</p>
                </div>
                <div id="poster-preview" class="hidden mt-3">
                  <img id="poster-img" class="w-32 h-32 object-cover rounded-lg mx-auto">
                  <button type="button" id="remove-poster" class="mt-2 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded transition">Hapus Poster</button>
                </div>
              </div>
            </div>
            <div><label for="fk-deskripsi" class="block text-xs text-slate-400 mb-1">Deskripsi Kompetisi</label><textarea id="fk-deskripsi" rows="4" class="w-full px-3 py-2.5 rounded-lg text-sm" required></textarea></div>
            <button type="submit" class="btn-primary text-white font-semibold px-6 py-2.5 rounded-lg text-sm">Kirim Pengajuan</button>
            <p id="fk-loading" class="text-xs text-blue-400 hidden">Mengirim...</p>
          </form>
        </div>
      `;
}
function renderSuratDispen() {
  return `
    <div class="fade-in space-y-6 max-w-2xl">
      <h1 class="text-2xl font-bold text-white">
        Download Surat Dispensasi
      </h1>

      <div class="glass rounded-xl p-6 text-center space-y-4">
        
        <div class="w-20 h-20 mx-auto rounded-xl bg-blue-500/20 flex items-center justify-center">
          <i data-lucide="file-text" class="w-10 h-10 text-blue-400"></i>
        </div>

        <p class="text-slate-300 text-sm">
          Klik tombol di bawah untuk mengunduh template Surat Dispensasi.
        </p>

        <a 
          href="files/Surat Keterangan Dispensasi.docx" 
          download="Surat Keterangan Dispensasi.docx"
          class="btn-primary text-white font-semibold px-6 py-2.5 rounded-lg text-sm inline-flex items-center gap-2"
        >
          <i data-lucide="download" class="w-4 h-4"></i>
          Download Surat Dispen
        </a>

      </div>
    </div>
  `;
}

function renderSuratTugas() {
  return `
    <div class="fade-in space-y-6 max-w-2xl">
      <h1 class="text-2xl font-bold text-white">
        Download Surat Tugas Lomba
      </h1>

      <div class="glass rounded-xl p-6 text-center space-y-4">

        <div class="w-20 h-20 mx-auto rounded-xl bg-purple-500/20 flex items-center justify-center">
          <i data-lucide="file-text" class="w-10 h-10 text-purple-400"></i>
        </div>

        <p class="text-slate-300 text-sm">
          Klik tombol di bawah untuk mengunduh template Surat Tugas Lomba.
        </p>

        <a 
          href="files/surat tugas lomba.docx" 
          download="surat tugas lomba.docx"
          class="btn-primary text-white font-semibold px-6 py-2.5 rounded-lg text-sm inline-flex items-center gap-2"
        >
          <i data-lucide="download" class="w-4 h-4"></i>
          Download Surat Tugas
        </a>

      </div>
    </div>
  `;
}
function renderPublikasiPrestasi() {
  return `
        <div class="fade-in space-y-6 max-w-2xl">
          <h1 class="text-2xl font-bold text-white">Pengajuan Publikasi Prestasi</h1>
          <div class="glass rounded-xl p-6 text-center space-y-4">
            <div class="w-20 h-20 mx-auto rounded-xl bg-green-500/20 flex items-center justify-center"><i data-lucide="external-link" class="w-10 h-10 text-green-400"></i></div>
            <p class="text-slate-300 text-sm">Anda akan diarahkan ke formulir pengajuan publikasi prestasi milik Humas Universitas.</p>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSf458wxyUaDkNKSb2u0G2IQ_0H3XHYZg653I9yp7S0iHMJixg/viewform" target="_blank" rel="noopener noreferrer" class="btn-primary text-white font-semibold px-6 py-2.5 rounded-lg text-sm inline-flex items-center gap-2"><i data-lucide="external-link" class="w-4 h-4"></i> Buka Formulir Humas</a>
          </div>
        </div>
      `;
}
function openCompetitionDetailsModal(record, canEdit = false) {
  const modal = document.createElement("div");
  modal.className =
    "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4";
  modal.innerHTML = `
    <div class="bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto p-5 border border-slate-700">
      <div class="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 class="font-semibold text-white text-xl">${record.judul_kompetisi || "Detail Kompetisi"}</h2>
          <p class="text-xs text-slate-400 mt-1">Diajukan oleh: ${record.submitted_by || "-"}</p>
        </div>
        <button id="close-competition-detail" class="text-slate-300 text-xs px-3 py-2 bg-slate-700/80 rounded hover:bg-slate-700">Tutup</button>
      </div>
      ${getImageSrc(record.poster_url) ? `<div class="mb-4 rounded-xl overflow-hidden"><img src="${getImageSrc(record.poster_url)}" class="w-full object-cover"></div>` : ""}
      <div class="space-y-3 text-slate-300 text-sm">
        <div><span class="font-semibold text-white">Deskripsi:</span><p class="mt-2">${record.deskripsi || "-"}</p></div>
        <div><span class="font-semibold text-white">Status:</span> <span class="text-slate-300">${record.status === "published" ? "Dipublikasikan" : record.status}</span></div>
      </div>
      ${
        canEdit
          ? `
      <div class="mt-5 space-y-3">
        <h3 class="text-sm font-semibold text-white">Edit Kompetisi</h3>
        <div>
          <label class="text-xs text-slate-400 mb-1 block">Judul</label>
          <input id="modal-edit-judul" type="text" value="${record.judul_kompetisi || ""}" class="w-full px-3 py-2 rounded-lg text-sm" />
        </div>
        <div>
          <label class="text-xs text-slate-400 mb-1 block">Deskripsi</label>
          <textarea id="modal-edit-deskripsi" rows="4" class="w-full px-3 py-2 rounded-lg text-sm">${record.deskripsi || ""}</textarea>
        </div>
        <button id="modal-save-competition" class="btn-primary text-white px-4 py-2 rounded-lg text-sm">Simpan Perubahan</button>
      </div>
      `
          : ""
      }
    </div>
  `;
  document.body.appendChild(modal);
  document
    .getElementById("close-competition-detail")
    .addEventListener("click", () => modal.remove());
  if (canEdit) {
    document
      .getElementById("modal-save-competition")
      .addEventListener("click", async () => {
        const updated = {
          ...record,
          judul_kompetisi: document.getElementById("modal-edit-judul").value,
          deskripsi: document.getElementById("modal-edit-deskripsi").value,
        };
        const result = await window.dataSdk.update(updated);
        if (result.isOk) {
          showToast("Kompetisi diperbarui!");
          modal.remove();
          renderCurrentPage();
        } else {
          showToast("Gagal memperbarui kompetisi", "error");
        }
      });
  }
}
function renderValidasiPrestasi() {
  const pending = getAchievements().filter((a) => a.status === "pending");
  return `
        <div class="fade-in space-y-6">
          <h1 class="text-2xl font-bold text-white">Validasi Prestasi Mahasiswa</h1>
          ${
            pending.length === 0
              ? '<div class="glass rounded-xl p-6 text-center text-slate-500">Tidak ada pengajuan prestasi yang perlu divalidasi.</div>'
              : `<div class="space-y-3">${pending
                  .map(
                    (a) => `
              <div class="glass rounded-xl p-4">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <p class="font-semibold text-white text-sm">${a.nama || ""} - ${a.nama_kompetisi || ""}</p>
                    <p class="text-xs text-slate-400">NPM: ${a.npm || "-"} | Juara: ${a.juara || ""} | Kategori: ${a.kategori || "-"}</p>
                    ${renderPrestasiFileLinks(a)}
                  </div>
                  <button class="edit-data-btn px-2 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded transition" data-id="${a.__backendId}" data-type="prestasi">
                    <i data-lucide="edit-2" class="w-3 h-3 inline"></i> Edit
                  </button>
                </div>
                <div class="mb-3 space-y-2">
                  <input type="text" id="feedback-${a.__backendId}" class="w-full px-3 py-2 rounded-lg text-sm text-xs text-slate-400" placeholder="Alasan penolakan (opsional)...">
                </div>
                <div class="flex gap-2">
                  <button class="validate-btn px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg transition" data-id="${a.__backendId}">Validasi</button>
                  <button class="reject-btn px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition" data-id="${a.__backendId}">Tolak</button>
                </div>
              </div>
            `,
                  )
                  .join("")}</div>`
          }
        </div>
      `;
}
function renderValidasiKompetisi() {
  const pending = getCompetitions().filter((c) => c.status === "pending");
  return `
        <div class="fade-in space-y-6">
          <h1 class="text-2xl font-bold text-white">Validasi & Publikasi Kompetisi</h1>
          ${
            pending.length === 0
              ? '<div class="glass rounded-xl p-6 text-center text-slate-500">Tidak ada pengajuan kompetisi yang perlu divalidasi.</div>'
              : `<div class="space-y-3">${pending
                  .map(
                    (c) => `
              <div class="glass rounded-xl p-4">
                <div class="flex items-start justify-between mb-3">
                  <div class="flex-1">
                    <p class="font-semibold text-white text-sm">${c.judul_kompetisi || ""}</p>
                    <p class="text-xs text-slate-400 mt-1">${c.deskripsi ? c.deskripsi.substring(0, 100) + "..." : ""}</p>
                    ${
                      getImageSrc(c.poster_url)
                        ? `
                      <div class="mt-2 w-20 h-20 rounded-lg overflow-hidden">
                        <img src="${getImageSrc(c.poster_url)}" class="w-full h-full object-cover">
                      </div>
                    `
                        : ""
                    }
                    <p class="text-xs text-slate-500 mt-1">Diajukan oleh: ${c.submitted_by || "-"}</p>
                  </div>
                  <button class="edit-data-btn px-2 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded transition" data-id="${c.__backendId}" data-type="kompetisi">
                    <i data-lucide="edit-2" class="w-3 h-3 inline"></i> Edit
                  </button>
                </div>
                <div class="mb-3 space-y-2">
                  <input type="text" id="feedback-${c.__backendId}" class="w-full px-3 py-2 rounded-lg text-sm text-xs text-slate-400" placeholder="Alasan penolakan (opsional)...">
                </div>
                <div class="flex gap-2">
                  <button class="publish-btn px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg transition" data-id="${c.__backendId}">Publikasikan</button>
                  <button class="reject-comp-btn px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-lg transition" data-id="${c.__backendId}">Tolak</button>
                </div>
              </div>
            `,
                  )
                  .join("")}</div>`
          }
        </div>
      `;
}
function renderManajemen() {
  const mahasiswa = new Set(
    allData
      .filter((d) => d.submitted_by && !d.is_notification)
      .map((d) => d.submitted_by),
  );
  return `
        <div class="fade-in space-y-6">
          <h1 class="text-2xl font-bold text-white">Manajemen Data</h1>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="stat-card rounded-xl p-5">
              <p class="text-sm text-slate-400">Total Prestasi</p>
              <p class="text-3xl font-bold text-white mt-1">${getAchievements().length}</p>
            </div>
            <div class="stat-card rounded-xl p-5">
              <p class="text-sm text-slate-400">Total Kompetisi</p>
              <p class="text-3xl font-bold text-white mt-1">${getCompetitions().length}</p>
            </div>
            <div class="stat-card rounded-xl p-5">
              <p class="text-sm text-slate-400">Total Mahasiswa</p>
              <p class="text-3xl font-bold text-white mt-1">${mahasiswa.size}</p>
            </div>
          </div>
          <div class="glass rounded-xl p-5">
            <h3 class="font-semibold text-white mb-3">Data Mahasiswa</h3>
            <div class="space-y-2 max-h-96 overflow-auto">
              ${Array.from(mahasiswa)
                .map(
                  (m) => `
                <div class="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                  <div>
                    <p class="text-sm font-medium text-white">${m}</p>
                    <p class="text-xs text-slate-400 mt-0.5">${allData.filter((d) => d.submitted_by === m && !d.is_notification).length} pengajuan</p>
                  </div>
                  <button class="view-user-data px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded transition" data-user="${m}">Lihat Data</button>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
          <div id="user-data-container"></div>
        </div>
      `;
}
function attachPageEvents() {
  const notifBell = document.getElementById("notif-bell");
  const notifDropdown = document.getElementById("notif-dropdown");
  if (notifBell && notifDropdown) {
    if (!notificationEventsAttached) {
      document.addEventListener("click", (e) => {
        const bell = e.target.closest("#notif-bell");
        const item = e.target.closest(".notification-item");
        const dropdown = document.getElementById("notif-dropdown");

        if (bell && dropdown) {
          e.preventDefault();
          e.stopPropagation();
          dropdown.classList.toggle("hidden");
          return;
        }

        if (item) {
          e.preventDefault();
          e.stopPropagation();
          const id = item.dataset.id;
          const notification = allData.find(
            (d) => String(d.__backendId) === String(id),
          );
          if (!notification) return;
          if (notification.unread !== false) {
            markNotificationRead(id);
          }
          showNotificationDetail(notification);
          if (dropdown) {
            dropdown.classList.add("hidden");
          }
          return;
        }

        if (dropdown && !e.target.closest("#notif-dropdown")) {
          notifDropdown.classList.add("hidden");
        }
      });
      notificationEventsAttached = true;
    }
  }
  const formP = document.getElementById("form-prestasi");
  if (formP) {
    const fpFiles = {
      sertifikat: null,
      bukti: null,
      ktm: null,
    };
    const sertifikatInput = document.getElementById("fp-sertifikat");
    const buktiInput = document.getElementById("fp-bukti");
    const ktmInput = document.getElementById("fp-ktm");
    const sertifikatName = document.getElementById("fp-sertifikat-name");
    const buktiName = document.getElementById("fp-bukti-name");
    const ktmName = document.getElementById("fp-ktm-name");
    function handlePrestasiFile(input, fileKey, nameEl) {
      if (!input) return;
      input.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) {
          fpFiles[fileKey] = null;
          if (nameEl) nameEl.textContent = "";
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          showToast("File terlalu besar (maksimal 5MB)", "error");
          input.value = "";
          if (nameEl) nameEl.textContent = "";
          return;
        }
        if (!["image/png", "image/jpeg"].includes(file.type)) {
          showToast("File harus JPG atau PNG", "error");
          input.value = "";
          if (nameEl) nameEl.textContent = "";
          return;
        }
        fpFiles[fileKey] = file;
        if (nameEl) nameEl.textContent = file.name;
      });
    }
    handlePrestasiFile(sertifikatInput, "sertifikat", sertifikatName);
    handlePrestasiFile(buktiInput, "bukti", buktiName);
    handlePrestasiFile(ktmInput, "ktm", ktmName);
    formP.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (allData.length >= 999) {
        showToast("Batas data tercapai (999)", "error");
        return;
      }
      if (!fpFiles.sertifikat || !fpFiles.bukti || !fpFiles.ktm) {
        showToast(
          "Silakan upload sertifikat, foto kegiatan, dan KTM dalam format JPG/PNG",
          "error",
        );
        return;
      }
      const loading = document.getElementById("fp-loading");
      const submitButton = formP.querySelector('button[type="submit"]');
      loading.classList.remove("hidden");
      loading.textContent = "Mengupload gambar...";
      if (submitButton) submitButton.disabled = true;
      let result = { isOk: false };
      try {
        const sertifikatUrl = await uploadImageFile(fpFiles.sertifikat);
        const buktiUrl = await uploadImageFile(fpFiles.bukti);
        const ktmUrl = await uploadImageFile(fpFiles.ktm);
        loading.textContent = "Menyimpan data...";
        result = await window.dataSdk.create({
          type: "prestasi",
          nama: document.getElementById("fp-nama").value,
          npm: document.getElementById("fp-npm").value,
          angkatan: document.getElementById("fp-angkatan").value,
          nama_kompetisi: document.getElementById("fp-kompetisi").value,
          juara: document.getElementById("fp-juara").value,
          tanggal: document.getElementById("fp-tanggal").value,
          kategori: document.getElementById("fp-kategori").value,
          status: "pending",
          submitted_by: currentUser.username,
          role: "mahasiswa",
          judul_kompetisi: "",
          deskripsi: "",
          poster_url: "",
          is_notification: false,
          feedback: "",
          bukti_sertifikat: sertifikatUrl,
          foto_kegiatan: buktiUrl,
          ktm: ktmUrl,
        });
      } catch (e) {
        showToast(e.message || "Upload gambar gagal", "error");
      } finally {
        loading.classList.add("hidden");
        loading.textContent = "Mengirim...";
        if (submitButton) submitButton.disabled = false;
      }
      if (result.isOk) {
        showToast(result.warning || "Pengajuan berhasil dikirim!");
        formP.reset();
        fpFiles.sertifikat = null;
        fpFiles.bukti = null;
        fpFiles.ktm = null;
        if (sertifikatName) sertifikatName.textContent = "";
        if (buktiName) buktiName.textContent = "";
        if (ktmName) ktmName.textContent = "";
      } else {
        showToast(result.error || "Gagal mengirim pengajuan", "error");
      }
    });
  }
  const formK = document.getElementById("form-kompetisi");
  if (formK) {
    let posterBase64 = "";
    let posterFile = null;
    const fileInput = document.getElementById("fk-poster-file");
    const uploadArea = document.getElementById("poster-upload-area");
    const preview = document.getElementById("poster-preview");
    const posterImg = document.getElementById("poster-img");
    const removeBtn = document.getElementById("remove-poster");
    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.parentElement.classList.add("drag-active");
    });
    uploadArea.addEventListener("dragleave", () => {
      uploadArea.parentElement.classList.remove("drag-active");
    });
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.parentElement.classList.remove("drag-active");
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFileSelect(files[0]);
    });
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
    });
    function handleFileSelect(file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast("File terlalu besar (maksimal 5MB)", "error");
        return;
      }
      if (!file.type.startsWith("image/")) {
        showToast("File harus berupa gambar", "error");
        return;
      }
      posterFile = file;
      const reader = new FileReader();
      reader.onload = (event) => {
        posterBase64 = event.target.result;
        posterImg.src = posterBase64;
        preview.classList.remove("hidden");
        uploadArea.classList.add("hidden");
      };
      reader.readAsDataURL(file);
    }
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      posterBase64 = "";
      posterFile = null;
      fileInput.value = "";
      preview.classList.add("hidden");
      uploadArea.classList.remove("hidden");
    });
    formK.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (allData.length >= 999) {
        showToast("Batas data tercapai (999)", "error");
        return;
      }
      const loading = document.getElementById("fk-loading");
      const submitButton = formK.querySelector('button[type="submit"]');
      loading.classList.remove("hidden");
      loading.textContent = posterFile
        ? "Mengupload poster..."
        : "Menyimpan data...";
      if (submitButton) submitButton.disabled = true;
      let result = { isOk: false };
      try {
        const posterUrl = posterFile ? await uploadImageFile(posterFile) : "";
        loading.textContent = "Menyimpan data...";
        result = await window.dataSdk.create({
          type: "kompetisi",
          judul_kompetisi: document.getElementById("fk-judul").value,
          poster_url: posterUrl,
          deskripsi: document.getElementById("fk-deskripsi").value,
          status: "pending",
          submitted_by: currentUser.username,
          role: "mahasiswa",
          nama: "",
          npm: "",
          angkatan: "",
          nama_kompetisi: "",
          juara: "",
          tanggal: "",
          kategori: "",
          is_notification: false,
          feedback: "",
        });
      } catch (e) {
        showToast(e.message || "Upload poster gagal", "error");
      } finally {
        loading.classList.add("hidden");
        loading.textContent = "Mengirim...";
        if (submitButton) submitButton.disabled = false;
      }
      if (result.isOk) {
        showToast(result.warning || "Pengajuan kompetisi berhasil!");
        formK.reset();
        posterBase64 = "";
        posterFile = null;
        preview.classList.add("hidden");
        uploadArea.classList.remove("hidden");
      } else {
        showToast(result.error || "Gagal mengirim", "error");
      }
    });
  }
  document.querySelectorAll(".edit-data-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const type = btn.dataset.type;
      const record = allData.find((d) => d.__backendId === id);
      if (!record) return;
      const modal = document.createElement("div");
      modal.className =
        "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4";
      modal.innerHTML = `
        <div class="bg-slate-800 rounded-xl w-full max-w-md max-h-96 overflow-auto p-5 border border-slate-700">
          <h2 class="font-semibold text-white mb-3">Edit ${type === "prestasi" ? "Prestasi" : "Kompetisi"}</h2>
          <div class="space-y-2 text-xs mb-3">
            ${
              type === "prestasi"
                ? `<input id="edit-nama-${id}" type="text" class="w-full px-3 py-2 rounded-lg text-sm" placeholder="Nama" value="${record.nama || ""}">
                <input id="edit-npm-${id}" type="text" class="w-full px-3 py-2 rounded-lg text-sm" placeholder="NPM" value="${record.npm || ""}">
                <input id="edit-kompetisi-${id}" type="text" class="w-full px-3 py-2 rounded-lg text-sm" placeholder="Nama Kompetisi" value="${record.nama_kompetisi || ""}">
                <input id="edit-juara-${id}" type="text" class="w-full px-3 py-2 rounded-lg text-sm" placeholder="Juara" value="${record.juara || ""}">`
                : `<input id="edit-judul-${id}" type="text" class="w-full px-3 py-2 rounded-lg text-sm" placeholder="Judul" value="${record.judul_kompetisi || ""}">
                <input id="edit-deskripsi-${id}" type="text" class="w-full px-3 py-2 rounded-lg text-sm" placeholder="Deskripsi" value="${record.deskripsi || ""}">`
            }
          </div>
          <div class="flex gap-2">
            <button id="save-edit-${id}" class="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition">Simpan</button>
            <button id="close-modal-${id}" class="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition">Tutup</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      document
        .getElementById(`close-modal-${id}`)
        .addEventListener("click", () => modal.remove());
      document
        .getElementById(`save-edit-${id}`)
        .addEventListener("click", async () => {
          const updated = { ...record };
          if (type === "prestasi") {
            updated.nama = document.getElementById(`edit-nama-${id}`).value;
            updated.npm = document.getElementById(`edit-npm-${id}`).value;
            updated.nama_kompetisi = document.getElementById(
              `edit-kompetisi-${id}`,
            ).value;
            updated.juara = document.getElementById(`edit-juara-${id}`).value;
          } else {
            updated.judul_kompetisi = document.getElementById(
              `edit-judul-${id}`,
            ).value;
            updated.deskripsi = document.getElementById(
              `edit-deskripsi-${id}`,
            ).value;
          }
          const result = await window.dataSdk.update(updated);
          if (result.isOk) {
            showToast("Data berhasil diperbarui!");
            modal.remove();
          } else {
            showToast("Gagal memperbarui", "error");
          }
        });
    });
  });
  document.querySelectorAll(".view-competition-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const record = allData.find((d) => d.__backendId === id);
      if (!record) return;
      const canEdit = currentUser && currentUser.role === "admin";
      openCompetitionDetailsModal(record, canEdit);
    });
  });
  document.querySelectorAll(".validate-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const record = allData.find((d) => d.__backendId === btn.dataset.id);
      if (!record) return;
      btn.disabled = true;
      btn.textContent = "...";
      const result = await window.dataSdk.update({
        ...record,
        status: "validated",
      });
      if (result.isOk) {
        showToast("Prestasi divalidasi!");
        await window.dataSdk.create({
          type: "notification",
          is_notification: true,
          notif_type: "approved",
          feedback: "Prestasi Anda telah divalidasi dan diterima.",
          source_backend_id: record.__backendId,
          submitted_by: record.submitted_by,
          tanggal: new Date().toISOString(),
          unread: true,
          nama: "",
          npm: "",
          angkatan: "",
          nama_kompetisi: "",
          juara: "",
          kategori: "",
          status: "",
          judul_kompetisi: "",
          deskripsi: "",
          poster_url: "",
          role: "",
        });
      } else {
        showToast("Gagal", "error");
      }
    });
  });
  document.querySelectorAll(".reject-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const record = allData.find((d) => d.__backendId === btn.dataset.id);
      if (!record) return;
      btn.disabled = true;
      btn.textContent = "...";
      const feedback =
        document.getElementById(`feedback-${btn.dataset.id}`).value ||
        "Pengajuan tidak memenuhi kriteria";
      await window.dataSdk.create({
        type: "notification",
        is_notification: true,
        notif_type: "rejected",
        feedback,
        source_backend_id: record.__backendId,
        submitted_by: record.submitted_by,
        tanggal: new Date().toISOString(),
        unread: true,
        nama: "",
        npm: "",
        angkatan: "",
        nama_kompetisi: "",
        juara: "",
        kategori: "",
        status: "",
        judul_kompetisi: "",
        deskripsi: "",
        poster_url: "",
        role: "",
      });
      const result = await window.dataSdk.delete(record);
      if (result.isOk) {
        showToast("Pengajuan ditolak");
      } else {
        showToast("Gagal", "error");
      }
    });
  });
  document.querySelectorAll(".publish-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const record = allData.find((d) => d.__backendId === btn.dataset.id);
      if (!record) return;
      btn.disabled = true;
      btn.textContent = "...";
      const result = await window.dataSdk.update({
        ...record,
        status: "published",
      });
      if (result.isOk) {
        showToast("Kompetisi dipublikasikan!");
        await window.dataSdk.create({
          type: "notification",
          is_notification: true,
          notif_type: "approved",
          feedback: `Kompetisi "${record.judul_kompetisi}" telah dipublikasikan.`,
          source_backend_id: record.__backendId,
          submitted_by: record.submitted_by,
          tanggal: new Date().toISOString(),
          unread: true,
          nama: "",
          npm: "",
          angkatan: "",
          nama_kompetisi: "",
          juara: "",
          kategori: "",
          status: "",
          judul_kompetisi: "",
          deskripsi: "",
          poster_url: "",
          role: "",
        });
      } else {
        showToast("Gagal", "error");
      }
    });
  });
  document.querySelectorAll(".reject-comp-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const record = allData.find((d) => d.__backendId === btn.dataset.id);
      if (!record) return;
      btn.disabled = true;
      btn.textContent = "...";
      const feedback =
        document.getElementById(`feedback-${btn.dataset.id}`).value ||
        "Kompetisi tidak memenuhi kriteria publikasi";
      await window.dataSdk.create({
        type: "notification",
        is_notification: true,
        notif_type: "rejected",
        feedback,
        source_backend_id: record.__backendId,
        submitted_by: record.submitted_by,
        tanggal: new Date().toISOString(),
        unread: true,
        nama: "",
        npm: "",
        angkatan: "",
        nama_kompetisi: "",
        juara: "",
        kategori: "",
        status: "",
        judul_kompetisi: "",
        deskripsi: "",
        poster_url: "",
        role: "",
      });
      const result = await window.dataSdk.delete(record);
      if (result.isOk) {
        showToast("Kompetisi ditolak");
      } else {
        showToast("Gagal", "error");
      }
    });
  });
  document.querySelectorAll(".view-user-data").forEach((btn) => {
    btn.addEventListener("click", () => {
      const user = btn.dataset.user;
      const userData = allData.filter(
        (d) => d.submitted_by === user && !d.is_notification,
      );
      const container = document.getElementById("user-data-container");
      let html = `<div class="glass rounded-xl p-5 mt-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-semibold text-white">Data: ${user}</h3>
              <button class="close-user-data px-2 py-1 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs rounded">Tutup</button>
            </div>
            <div class="space-y-2 max-h-96 overflow-auto">`;
      userData.forEach((d) => {
        html += `<div class="p-3 bg-slate-700/30 rounded-lg flex items-start justify-between">
              <div class="flex-1">
                <p class="text-sm font-medium text-white">${d.nama_kompetisi || d.judul_kompetisi || "-"}</p>
                <p class="text-xs text-slate-400 mt-0.5">Tipe: ${d.type === "prestasi" ? "Prestasi" : "Kompetisi"} | Status: ${d.status}</p>
              </div>
              <button class="delete-user-data-btn px-2 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded transition" data-id="${d.__backendId}">
                <i data-lucide="trash-2" class="w-3 h-3 inline"></i>
              </button>
            </div>`;
      });
      html += `</div></div>`;
      container.innerHTML = html;
      document
        .querySelector(".close-user-data")
        .addEventListener("click", () => {
          container.innerHTML = "";
        });
      document.querySelectorAll(".delete-user-data-btn").forEach((delBtn) => {
        delBtn.addEventListener("click", async () => {
          const record = allData.find(
            (d) => d.__backendId === delBtn.dataset.id,
          );
          if (!record) return;
          delBtn.disabled = true;
          const result = await window.dataSdk.delete(record);
          if (result.isOk) {
            showToast("Data dihapus");
          } else {
            showToast("Gagal menghapus", "error");
          }
        });
      });
      lucide.createIcons();
    });
  });
}

function generateSurat(type) {
  const title =
    type === "dispensasi" ? "SURAT DISPENSASI" : "SURAT TUGAS LOMBA";
  const content = `\n${title}\nNo: ${Math.floor(Math.random() * 1000)}/UN/2024\n\nYang bertanda tangan di bawah ini menerangkan bahwa:\nNama: ${currentUser.username}\nDengan ini diberikan ${
    type === "dispensasi"
      ? "dispensasi untuk mengikuti kegiatan lomba"
      : "tugas untuk mengikuti perlombaan"
  }.\n\nDemikian surat ini dibuat untuk dipergunakan sebagaimana mestinya.\n\nTanggal: ${new Date().toLocaleDateString("id-ID")}\n      `;
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `surat_${type}_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Surat ${type} berhasil diunduh!`);
}
function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  const role = document.getElementById("login-role").value;
  if (isRegisterMode) {
    const email = document.getElementById("login-email").value.trim();
    const confirmPassword = document.getElementById(
      "login-confirm-password",
    ).value;
    if (role !== "mahasiswa") {
      showToast("Hanya mahasiswa dapat membuat akun", "error");
      return;
    }
    if (!email || !username || !password) {
      showToast("Email, username, dan password harus diisi", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("Format email tidak valid", "error");
      return;
    }
    if (password.length < 4) {
      showToast("Password minimal 4 karakter", "error");
      return;
    }
    if (password !== confirmPassword) {
      showToast("Password dan konfirmasi tidak cocok", "error");
      return;
    }
    if (userCredentials[username]) {
      showToast("Username sudah terdaftar", "error");
      return;
    }
    addUser(username, password, role, email);
    showToast("Akun berhasil dibuat. Silakan login.");
    isRegisterMode = false;
    updateLoginModeUI();
    resetLoginForm();
    return;
  }
  const credential = userCredentials[username];
  if (
    credential &&
    credential.password === password &&
    credential.role === role
  ) {
    currentUser = { username, role };
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    document.getElementById("user-role-label").textContent =
      role === "admin" ? "Admin" : "Mahasiswa";
    renderNav();
    renderCurrentPage();
    showToast(
      `Login berhasil sebagai ${role === "admin" ? "Admin" : "Mahasiswa"}`,
    );
  } else {
    showToast("Username atau password salah", "error");
    document.getElementById("login-password").value = "";
  }
}
function handleLogout() {
  window.location.href = "index.php?action=logout";
}
function initApp() {
  ensureElementSdk();
  ensureDataSdk();
  const dataHandler = {
    onDataChanged(data) {
      allData = data;
      if (currentUser) renderCurrentPage();
    },
  };
  window.elementSdk.init({
    defaultConfig,
    onConfigChange: async (config) => {
      const title = config.app_title || defaultConfig.app_title;
      const univ = config.university_name || defaultConfig.university_name;
      const el1 = document.getElementById("login-title");
      const el2 = document.getElementById("login-univ");
      const el3 = document.getElementById("sidebar-title");
      if (el1) el1.textContent = title;
      if (el2) el2.textContent = univ;
      if (el3)
        el3.textContent =
          title.length > 20 ? `${title.substring(0, 20)}...` : title;
      const bg = config.background_color || defaultConfig.background_color;
      const text = config.text_color || defaultConfig.text_color;
      const primary = config.primary_color || defaultConfig.primary_color;
      const secondary = config.secondary_color || defaultConfig.secondary_color;
      document.body.style.backgroundColor = bg;
      document.body.style.color = text;
      document.querySelectorAll(".btn-primary").forEach((el) => {
        el.style.background = `linear-gradient(135deg, ${primary}, ${secondary})`;
      });
    },
    mapToCapabilities: (config) => ({
      recolorables: [
        {
          get: () => config.background_color || defaultConfig.background_color,
          set: (v) => {
            config.background_color = v;
            window.elementSdk.setConfig({ background_color: v });
          },
        },
        {
          get: () => config.surface_color || defaultConfig.surface_color,
          set: (v) => {
            config.surface_color = v;
            window.elementSdk.setConfig({ surface_color: v });
          },
        },
        {
          get: () => config.text_color || defaultConfig.text_color,
          set: (v) => {
            config.text_color = v;
            window.elementSdk.setConfig({ text_color: v });
          },
        },
        {
          get: () => config.primary_color || defaultConfig.primary_color,
          set: (v) => {
            config.primary_color = v;
            window.elementSdk.setConfig({ primary_color: v });
          },
        },
        {
          get: () => config.secondary_color || defaultConfig.secondary_color,
          set: (v) => {
            config.secondary_color = v;
            window.elementSdk.setConfig({ secondary_color: v });
          },
        },
      ],
      borderables: [],
      fontEditable: {
        get: () => config.font_family || "Plus Jakarta Sans",
        set: (v) => {
          config.font_family = v;
          window.elementSdk.setConfig({ font_family: v });
        },
      },
      fontSizeable: {
        get: () => config.font_size || 14,
        set: (v) => {
          config.font_size = v;
          window.elementSdk.setConfig({ font_size: v });
        },
      },
    }),
    mapToEditPanelValues: (config) =>
      new Map([
        ["app_title", config.app_title || defaultConfig.app_title],
        [
          "university_name",
          config.university_name || defaultConfig.university_name,
        ],
      ]),
  });
  window.dataSdk.init(dataHandler);
  const toggleRegister = document.getElementById("toggle-register-btn");
  if (toggleRegister) {
    toggleRegister.addEventListener("click", () => {
      isRegisterMode = !isRegisterMode;
      updateLoginModeUI();
      resetLoginForm();
    });
  }
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
  const themeToggle = document.getElementById("theme-toggle-btn");
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }
  if (window.initialRegisterMode) {
    isRegisterMode = true;
  }
  updateLoginModeUI();
  applyTheme(currentTheme);
  if (window.serverUser) {
    currentUser = window.serverUser;
    const loginScreen = document.getElementById("login-screen");
    const mainApp = document.getElementById("main-app");
    if (loginScreen) loginScreen.classList.add("hidden");
    if (mainApp) mainApp.classList.remove("hidden");
    const roleLabel = document.getElementById("user-role-label");
    if (roleLabel) {
      roleLabel.textContent =
        currentUser.role === "admin" ? "Admin" : "Mahasiswa";
    }
    renderNav();
    renderCurrentPage();
  }
  lucide.createIcons();
}
initApp();
