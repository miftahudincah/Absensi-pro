// theme.js - VERSION 1.0
// Fungsi Dark/Light Mode untuk Sistem Absensi
// ============================================================================

/**
 * Inisialisasi tema (dark/light mode)
 * - Membaca preferensi dari localStorage
 * - Menerapkan tema yang sesuai
 * - Menambahkan event listener ke tombol toggle
 */
function initTheme() {
    console.log("🎨 Initializing theme system...");
    
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
        console.warn("⚠️ Theme toggle button not found");
    }
}

/**
 * Menerapkan tema ke seluruh halaman
 * @param {string} theme - 'dark' atau 'light'
 */
function applyTheme(theme) {
    const isLight = theme === 'light';
    const toggleBtn = document.getElementById('themeToggleBtn');
    
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
    
    // Update komponen yang membutuhkan refresh tema
    refreshThemeDependentComponents();
}

/**
 * Refresh komponen yang bergantung pada tema (chart, dll)
 */
function refreshThemeDependentComponents() {
    // Update dashboard chart jika ada
    if (typeof window.updateDashboardChart === 'function') {
        setTimeout(function() {
            try {
                window.updateDashboardChart();
                console.log("📊 Dashboard chart refreshed for theme change");
            } catch(e) {
                console.warn("Failed to refresh dashboard chart:", e);
            }
        }, 100);
    }
    
    // Update attendance donut chart jika ada
    if (typeof window.updateAttendanceDonutChart === 'function') {
        setTimeout(function() {
            try {
                window.updateAttendanceDonutChart();
                console.log("🍩 Attendance donut chart refreshed for theme change");
            } catch(e) {
                console.warn("Failed to refresh attendance donut chart:", e);
            }
        }, 150);
    }
    
    // Update rekap charts jika tab rekap aktif
    if (typeof window.loadRekap === 'function' && document.getElementById('tab-rekap') && document.getElementById('tab-rekap').classList.contains('active')) {
        setTimeout(function() {
            try {
                window.loadRekap();
                console.log("📊 Rekap charts refreshed for theme change");
            } catch(e) {
                console.warn("Failed to refresh rekap charts:", e);
            }
        }, 200);
    }
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

// Ekspor ke global
window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.toggleTheme = toggleTheme;
window.getCurrentTheme = getCurrentTheme;
window.getChartColorsByTheme = getChartColorsByTheme;
window.refreshThemeDependentComponents = refreshThemeDependentComponents;

console.log("✅ theme.js loaded - Dark/Light mode ready");