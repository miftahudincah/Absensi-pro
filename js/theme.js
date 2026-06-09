// theme.js - VERSION 2.0 (FIXED LIGHT MODE FULLY WORKING)
// Fungsi Dark/Light Mode untuk Sistem Absensi
// PERUBAHAN V2.0:
//   - Memperbaiki light mode yang tidak berfungsi
//   - Menambahkan CSS variables lengkap untuk light mode
//   - Menambahkan forced refresh untuk semua komponen
//   - Menambahkan listener untuk perubahan tema
// ============================================================================

// CSS untuk light mode - akan diinject ke document head
const lightModeCSS = `
    /* ==================== LIGHT MODE STYLES ==================== */
    body.light-mode {
        --bg-primary: #f8f9fa !important;
        --bg-secondary: #ffffff !important;
        --bg-card: #ffffff !important;
        --bg-hover: #f1f3f5 !important;
        --bg-sidebar: #f8f9fa !important;
        --bg-input: #ffffff !important;
        --text-primary: #212529 !important;
        --text-secondary: #495057 !important;
        --text-muted: #6c757d !important;
        --border: #dee2e6 !important;
        --primary: #0d6efd !important;
        --primary-dark: #0b5ed7 !important;
        --success: #198754 !important;
        --danger: #dc3545 !important;
        --warning: #ffc107 !important;
        --info: #0dcaf0 !important;
        --shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.08) !important;
        --shadow-sm: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.05) !important;
    }
    
    /* Card styles light mode */
    body.light-mode .stat-card-new {
        background: linear-gradient(135deg, #ffffff, #f8f9fa) !important;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08) !important;
        border: 1px solid rgba(0, 0, 0, 0.05) !important;
    }
    
    body.light-mode .stat-card-new:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12) !important;
    }
    
    body.light-mode .stat-title-new {
        color: #495057 !important;
    }
    
    body.light-mode .stat-number {
        color: #0d6efd !important;
    }
    
    body.light-mode .stat-percent.positive {
        color: #198754 !important;
    }
    
    body.light-mode .stat-percent.negative {
        color: #dc3545 !important;
    }
    
    body.light-mode .stat-percent.neutral {
        color: #6c757d !important;
    }
    
    /* Table styles light mode */
    body.light-mode table {
        background: #ffffff !important;
    }
    
    body.light-mode table thead th {
        background: #e9ecef !important;
        color: #212529 !important;
        border-bottom: 2px solid #dee2e6 !important;
    }
    
    body.light-mode table tbody tr {
        border-bottom: 1px solid #e9ecef !important;
    }
    
    body.light-mode table tbody tr:hover {
        background: #f8f9fa !important;
    }
    
    /* Input styles light mode */
    body.light-mode input, 
    body.light-mode select, 
    body.light-mode textarea,
    body.light-mode .form-control {
        background: #ffffff !important;
        border: 1px solid #ced4da !important;
        color: #212529 !important;
    }
    
    body.light-mode input:focus, 
    body.light-mode select:focus, 
    body.light-mode textarea:focus {
        border-color: #0d6efd !important;
        outline: none !important;
        box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25) !important;
    }
    
    body.light-mode input::placeholder {
        color: #adb5bd !important;
    }
    
    /* Button styles light mode */
    body.light-mode .btn-action {
        background: #0d6efd !important;
        color: white !important;
    }
    
    body.light-mode .btn-action:hover {
        background: #0b5ed7 !important;
    }
    
    body.light-mode .btn-action.btn-secondary {
        background: #6c757d !important;
    }
    
    body.light-mode .btn-action.btn-secondary:hover {
        background: #5c636a !important;
    }
    
    body.light-mode .btn-action.btn-success {
        background: #198754 !important;
    }
    
    body.light-mode .btn-action.btn-success:hover {
        background: #157347 !important;
    }
    
    body.light-mode .btn-action.btn-danger {
        background: #dc3545 !important;
    }
    
    body.light-mode .btn-action.btn-danger:hover {
        background: #bb2d3b !important;
    }
    
    body.light-mode .btn-action.btn-warning {
        background: #ffc107 !important;
        color: #212529 !important;
    }
    
    body.light-mode .btn-cancel {
        background: #e9ecef !important;
        color: #212529 !important;
        border: 1px solid #dee2e6 !important;
    }
    
    body.light-mode .btn-cancel:hover {
        background: #dee2e6 !important;
    }
    
    /* Modal styles light mode */
    body.light-mode .modal-overlay {
        background: rgba(0, 0, 0, 0.5) !important;
    }
    
    body.light-mode .modal-box {
        background: #ffffff !important;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
    }
    
    body.light-mode .modal-title {
        background: #f8f9fa !important;
        border-bottom: 1px solid #dee2e6 !important;
        color: #212529 !important;
    }
    
    /* Dropdown styles light mode */
    body.light-mode .dropdown-btn {
        background: #ffffff !important;
        border: 1px solid #dee2e6 !important;
        color: #212529 !important;
    }
    
    body.light-mode .dropdown-btn:hover {
        background: #0d6efd !important;
        color: white !important;
    }
    
    body.light-mode .dropdown-content {
        background: #ffffff !important;
        border: 1px solid #dee2e6 !important;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1) !important;
    }
    
    body.light-mode .dropdown-content button {
        color: #212529 !important;
    }
    
    body.light-mode .dropdown-content button:hover {
        background: #0d6efd !important;
        color: white !important;
    }
    
    /* Navbar styles light mode */
    body.light-mode .dropdown-navbar {
        background: #ffffff !important;
        border-bottom: 1px solid #dee2e6 !important;
    }
    
    body.light-mode .navbar-user {
        background: #f8f9fa !important;
    }
    
    body.light-mode .navbar-logout {
        background: #dc3545 !important;
    }
    
    body.light-mode .navbar-logout:hover {
        background: #bb2d3b !important;
    }
    
    /* Header bar light mode */
    body.light-mode .header-bar {
        background: linear-gradient(135deg, #e9ecef, #ffffff) !important;
    }
    
    /* Announcement styles light mode */
    body.light-mode .announcement-container {
        background: #f8f9fa !important;
        border: 1px solid #dee2e6 !important;
    }
    
    body.light-mode .announcement-item {
        background: #ffffff !important;
        border: 1px solid #e9ecef !important;
    }
    
    body.light-mode .announcement-high {
        border-left: 4px solid #dc3545 !important;
    }
    
    body.light-mode .announcement-normal {
        border-left: 4px solid #0d6efd !important;
    }
    
    body.light-mode .announcement-low {
        border-left: 4px solid #198754 !important;
    }
    
    /* Status bar light mode */
    body.light-mode .status-bar-container {
        background: #f8f9fa !important;
        border: 1px solid #dee2e6 !important;
    }
    
    body.light-mode .status-item {
        background: #ffffff !important;
        border: 1px solid #e9ecef !important;
    }
    
    /* Chat styles light mode */
    body.light-mode .chat-container {
        background: #ffffff !important;
        border: 1px solid #dee2e6 !important;
    }
    
    body.light-mode .chat-sidebar {
        background: #f8f9fa !important;
        border-right: 1px solid #dee2e6 !important;
    }
    
    body.light-mode .chat-item {
        border-bottom: 1px solid #e9ecef !important;
    }
    
    body.light-mode .chat-item:hover {
        background: #f1f3f5 !important;
    }
    
    body.light-mode .chat-item.active {
        background: #e7f1ff !important;
    }
    
    body.light-mode .chat-message.friend .chat-message-bubble {
        background: #e9ecef !important;
        color: #212529 !important;
    }
    
    body.light-mode .chat-message.me .chat-message-bubble {
        background: #0d6efd !important;
        color: white !important;
    }
    
    /* Friends list light mode */
    body.light-mode .friends-list .friend-item {
        border-bottom: 1px solid #e9ecef !important;
    }
    
    /* Role badges light mode */
    body.light-mode .role-badge.role-developer {
        background: #6f42c1 !important;
        color: white !important;
    }
    
    body.light-mode .role-badge.role-admin {
        background: #dc3545 !important;
        color: white !important;
    }
    
    body.light-mode .role-badge.role-wakil-kepala {
        background: #fd7e14 !important;
        color: white !important;
    }
    
    body.light-mode .role-badge.role-staff-tu {
        background: #20c997 !important;
        color: white !important;
    }
    
    body.light-mode .role-badge.role-guru {
        background: #0dcaf0 !important;
        color: #212529 !important;
    }
    
    body.light-mode .role-badge.role-siswa {
        background: #6c757d !important;
        color: white !important;
    }
    
    /* Progress bar light mode */
    body.light-mode .progress-bar {
        background: #e9ecef !important;
    }
    
    /* Clock display light mode */
    body.light-mode .clock-display {
        color: #212529 !important;
    }
    
    /* Footer light mode */
    body.light-mode .branding-footer {
        background: #f8f9fa !important;
        border-top: 1px solid #dee2e6 !important;
    }
    
    body.light-mode .branding-text {
        color: #6c757d !important;
    }
    
    /* Login card light mode */
    body.light-mode .auth-card {
        background: #ffffff !important;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.1) !important;
    }
    
    /* Toast light mode */
    body.light-mode .toast {
        background: #ffffff !important;
        color: #212529 !important;
        box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
    }
    
    /* AI Chat light mode */
    body.light-mode .ai-message.ai-bot .ai-bubble {
        background: #e9ecef !important;
        color: #212529 !important;
    }
    
    body.light-mode .ai-message.ai-user .ai-bubble {
        background: #0d6efd !important;
        color: white !important;
    }
    
    /* Sensor status light mode */
    body.light-mode .sensor-card {
        background: #ffffff !important;
        border: 1px solid #dee2e6 !important;
    }
    
    body.light-mode .sensor-card.online {
        border-left: 4px solid #198754 !important;
    }
    
    body.light-mode .sensor-card.offline {
        border-left: 4px solid #dc3545 !important;
    }
`;

/**
 * Inisialisasi tema (dark/light mode)
 * - Membaca preferensi dari localStorage
 * - Menerapkan tema yang sesuai
 * - Menambahkan event listener ke tombol toggle
 * - Inject CSS untuk light mode
 */
function initTheme() {
    console.log("🎨 Initializing theme system...");
    
    // Inject CSS untuk light mode jika belum ada
    if (!document.getElementById('light-mode-styles')) {
        const style = document.createElement('style');
        style.id = 'light-mode-styles';
        style.textContent = lightModeCSS;
        document.head.appendChild(style);
        console.log("✅ Light mode CSS injected");
    }
    
    // Baca tema yang tersimpan, default ke 'dark'
    const savedTheme = localStorage.getItem('theme') || 'dark';
    
    // Terapkan tema
    applyTheme(savedTheme);
    
    // Setup tombol toggle tema
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        // Hapus event listener lama jika ada (untuk mencegah duplikasi)
        const newToggleBtn = themeToggleBtn.cloneNode(true);
        themeToggleBtn.parentNode.replaceChild(newToggleBtn, themeToggleBtn);
        
        // Tambah event listener baru
        newToggleBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
        });
        
        console.log("✅ Theme toggle button initialized");
    } else {
        console.warn("⚠️ Theme toggle button not found, will retry...");
        // Retry mencari tombol setelah delay
        setTimeout(() => {
            const retryBtn = document.getElementById('themeToggleBtn');
            if (retryBtn && !retryBtn._listenerAdded) {
                retryBtn._listenerAdded = true;
                retryBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
                    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                    applyTheme(newTheme);
                });
                console.log("✅ Theme toggle button initialized (retry)");
            }
        }, 500);
    }
    
    // Setup observer untuk memastikan tombol tetap berfungsi setelah DOM berubah
    setupThemeButtonObserver();
}

/**
 * Setup observer untuk memastikan tombol tema tetap berfungsi
 */
function setupThemeButtonObserver() {
    const observer = new MutationObserver(() => {
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn && !themeToggleBtn._listenerAdded) {
            themeToggleBtn._listenerAdded = true;
            themeToggleBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                applyTheme(newTheme);
            });
            console.log("✅ Theme toggle button listener reattached");
        }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Menerapkan tema ke seluruh halaman
 * @param {string} theme - 'dark' atau 'light'
 */
function applyTheme(theme) {
    const isLight = theme === 'light';
    const toggleBtn = document.getElementById('themeToggleBtn');
    
    console.log(`🎨 Applying theme: ${theme}`);
    
    // Terapkan class ke body
    if (isLight) {
        document.body.classList.add('light-mode');
        if (toggleBtn) toggleBtn.innerHTML = '☀️';
        console.log("🌞 Light mode activated");
    } else {
        document.body.classList.remove('light-mode');
        if (toggleBtn) toggleBtn.innerHTML = '🌙';
        console.log("🌙 Dark mode activated");
    }
    
    // Simpan ke localStorage
    localStorage.setItem('theme', theme);
    
    // Force refresh semua komponen yang bergantung pada tema
    forceRefreshAllThemeComponents();
    
    // Dispatch event untuk memberitahu modul lain tentang perubahan tema
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: theme } }));
}

/**
 * Force refresh semua komponen yang bergantung pada tema
 */
function forceRefreshAllThemeComponents() {
    console.log("🔄 Force refreshing all theme-dependent components...");
    
    // Update dashboard chart
    if (typeof window.updateDashboardChart === 'function') {
        setTimeout(() => {
            try {
                window.updateDashboardChart();
                console.log("📊 Dashboard chart refreshed");
            } catch(e) {
                console.warn("Failed to refresh dashboard chart:", e);
            }
        }, 50);
    }
    
    // Update attendance donut chart
    if (typeof window.updateAttendanceDonutChart === 'function') {
        setTimeout(() => {
            try {
                window.updateAttendanceDonutChart();
                console.log("🍩 Attendance donut chart refreshed");
            } catch(e) {
                console.warn("Failed to refresh attendance donut chart:", e);
            }
        }, 100);
    }
    
    // Update rekap charts
    if (typeof window.loadRekap === 'function') {
        const tabRekap = document.getElementById('tab-rekap');
        if (tabRekap && tabRekap.classList.contains('active')) {
            setTimeout(() => {
                try {
                    window.loadRekap();
                    console.log("📊 Rekap charts refreshed");
                } catch(e) {
                    console.warn("Failed to refresh rekap charts:", e);
                }
            }, 150);
        }
    }
    
    // Refresh attendance table
    if (typeof window.renderTable === 'function') {
        setTimeout(() => {
            try {
                window.renderTable();
                console.log("📋 Attendance table refreshed");
            } catch(e) {
                console.warn("Failed to refresh attendance table:", e);
            }
        }, 200);
    }
    
    // Refresh students table
    if (typeof window.renderStudentsTable === 'function') {
        setTimeout(() => {
            try {
                window.renderStudentsTable();
                console.log("👨‍🎓 Students table refreshed");
            } catch(e) {
                console.warn("Failed to refresh students table:", e);
            }
        }, 250);
    }
    
    // Refresh users table
    if (typeof window.renderUsersTable === 'function') {
        setTimeout(() => {
            try {
                window.renderUsersTable();
                console.log("👥 Users table refreshed");
            } catch(e) {
                console.warn("Failed to refresh users table:", e);
            }
        }, 300);
    }
    
    // Refresh staff table
    if (typeof window.renderStaffTable === 'function') {
        setTimeout(() => {
            try {
                window.renderStaffTable();
                console.log("👥 Staff table refreshed");
            } catch(e) {
                console.warn("Failed to refresh staff table:", e);
            }
        }, 350);
    }
    
    // Refresh staff attendance table
    if (typeof window.renderStaffAttendanceTable === 'function') {
        setTimeout(() => {
            try {
                window.renderStaffAttendanceTable();
                console.log("📋 Staff attendance table refreshed");
            } catch(e) {
                console.warn("Failed to refresh staff attendance table:", e);
            }
        }, 400);
    }
    
    // Refresh chat interface
    if (typeof window.loadChatList === 'function') {
        setTimeout(() => {
            try {
                window.loadChatList();
                console.log("💬 Chat list refreshed");
            } catch(e) {
                console.warn("Failed to refresh chat list:", e);
            }
        }, 450);
    }
    
    // Refresh friends list
    if (typeof window.loadFriendsList === 'function') {
        setTimeout(() => {
            try {
                window.loadFriendsList();
                console.log("👥 Friends list refreshed");
            } catch(e) {
                console.warn("Failed to refresh friends list:", e);
            }
        }, 500);
    }
    
    // Refresh status bar
    if (typeof window.renderStatusBar === 'function') {
        setTimeout(() => {
            try {
                window.renderStatusBar();
                console.log("📸 Status bar refreshed");
            } catch(e) {
                console.warn("Failed to refresh status bar:", e);
            }
        }, 550);
    }
    
    // Refresh sensor status
    if (typeof window.refreshSensorStatus === 'function') {
        setTimeout(() => {
            try {
                window.refreshSensorStatus();
                console.log("🔍 Sensor status refreshed");
            } catch(e) {
                console.warn("Failed to refresh sensor status:", e);
            }
        }, 600);
    }
    
    console.log("✅ Theme refresh completed");
}

/**
 * Refresh komponen yang bergantung pada tema (legacy - untuk kompatibilitas)
 */
function refreshThemeDependentComponents() {
    forceRefreshAllThemeComponents();
}

/**
 * Mendapatkan tema saat ini
 * @returns {string} 'dark' atau 'light'
 */
function getCurrentTheme() {
    return document.body.classList.contains('light-mode') ? 'light' : 'dark';
}

/**
 * Toggle tema secara manual (alternatif)
 */
function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}

/**
 * Mendapatkan warna chart berdasarkan tema aktif
 * @returns {object} Warna untuk chart
 */
function getChartColorsByTheme() {
    const isLight = document.body.classList.contains('light-mode');
    return {
        gridColor: isLight ? '#e0e0e0' : '#333333',
        tickColor: isLight ? '#666666' : '#cccccc',
        labelColor: isLight ? '#333333' : '#ffffff',
        tooltipBackground: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
        tooltipColor: isLight ? '#333333' : '#ffffff',
        backgroundColor: isLight ? '#ffffff' : '#1a1d24',
        borderColor: isLight ? '#e2e8f0' : '#2a2e3a'
    };
}

/**
 * Mendapatkan warna teks berdasarkan tema
 * @returns {string} Warna teks
 */
function getTextColorByTheme() {
    return document.body.classList.contains('light-mode') ? '#212529' : '#ffffff';
}

/**
 * Mendapatkan warna background card berdasarkan tema
 * @returns {string} Warna background card
 */
function getCardBgColorByTheme() {
    return document.body.classList.contains('light-mode') ? '#ffffff' : '#1e1e2e';
}

// Ekspor ke global
window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.toggleTheme = toggleTheme;
window.getCurrentTheme = getCurrentTheme;
window.getChartColorsByTheme = getChartColorsByTheme;
window.refreshThemeDependentComponents = refreshThemeDependentComponents;
window.forceRefreshAllThemeComponents = forceRefreshAllThemeComponents;
window.getTextColorByTheme = getTextColorByTheme;
window.getCardBgColorByTheme = getCardBgColorByTheme;

// Auto-initialize ketika DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initTheme, 100);
    });
} else {
    setTimeout(initTheme, 100);
}

console.log("✅ theme.js V2.0 loaded - Light mode fully working with complete CSS");