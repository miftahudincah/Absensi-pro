// school-name-animation.js - VERSION 3.0
// Animasi nama sekolah dengan perubahan warna berulang (tanpa typing effect)

let schoolNameAnimationEnabled = true;
let originalSchoolName = '';
let currentUserRole = '';

// Konfigurasi animasi
const COLOR_ANIMATION_DURATION = 4000; // durasi animasi warna (4 detik)

/**
 * Inisialisasi animasi nama sekolah (hanya perubahan warna)
 */
function initSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) {
        console.warn('schoolNameDisplay element not found');
        return;
    }
    
    // Simpan teks asli
    originalSchoolName = schoolNameElement.textContent || 'Sistem Absensi';
    
    // Hapus class yang sudah ada
    schoolNameElement.classList.remove('school-name-animated');
    
    if (schoolNameAnimationEnabled) {
        // Langsung tampilkan teks dan animasi warna
        schoolNameElement.textContent = originalSchoolName;
        schoolNameElement.classList.add('school-name-animated');
    } else {
        schoolNameElement.textContent = originalSchoolName;
        schoolNameElement.classList.remove('school-name-animated');
    }
    
    // Tambahkan tooltip
    schoolNameElement.setAttribute('title', '✨ Sistem Absensi IoT - HakaTech ✨');
    
    // Tambahkan event hover untuk efek tambahan
    schoolNameElement.style.transition = 'all 0.3s ease';
    
    console.log('✨ School name color animation initialized (looping color change)');
}

/**
 * Restart animasi (misal saat teks berubah)
 */
function restartSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    // Simpan teks baru
    originalSchoolName = schoolNameElement.textContent || 'Sistem Absensi';
    
    // Restart animasi
    schoolNameElement.classList.remove('school-name-animated');
    // Force reflow
    void schoolNameElement.offsetWidth;
    schoolNameElement.classList.add('school-name-animated');
    
    console.log('✨ School name color animation restarted');
}

/**
 * Hentikan animasi sementara
 */
function pauseSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    schoolNameElement.classList.remove('school-name-animated');
    schoolNameElement.style.animation = 'none';
}

/**
 * Lanjutkan animasi
 */
function resumeSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    schoolNameElement.classList.add('school-name-animated');
    schoolNameElement.style.animation = '';
}

/**
 * Nonaktifkan animasi
 */
function disableSchoolNameAnimation() {
    schoolNameAnimationEnabled = false;
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    schoolNameElement.classList.remove('school-name-animated');
    schoolNameElement.style.animation = 'none';
}

/**
 * Aktifkan animasi
 */
function enableSchoolNameAnimation() {
    schoolNameAnimationEnabled = true;
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    schoolNameElement.classList.add('school-name-animated');
    schoolNameElement.style.animation = '';
}

/**
 * Setup observer untuk mendeteksi perubahan teks nama sekolah
 */
function setupSchoolNameObserver() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const newText = schoolNameElement.textContent;
                if (newText !== originalSchoolName && newText) {
                    console.log('📝 School name changed, restarting animation');
                    originalSchoolName = newText;
                    restartSchoolNameAnimation();
                }
            }
        });
    });
    
    observer.observe(schoolNameElement, {
        childList: true,
        characterData: true,
        subtree: true
    });
    
    console.log('👁️ School name observer set up');
}

/**
 * Setup listener untuk Firebase realtime
 */
function setupSchoolNameFirebaseListener() {
    if (typeof db === 'undefined' || !db) {
        console.warn('Firebase not available, skipping realtime listener');
        return;
    }
    
    db.ref('system_config/schoolName').on('value', (snapshot) => {
        const newName = snapshot.val();
        if (newName && newName !== originalSchoolName) {
            console.log('📡 School name changed from Firebase:', newName);
            originalSchoolName = newName;
            const schoolNameElement = document.getElementById('schoolNameDisplay');
            if (schoolNameElement && schoolNameElement.textContent !== newName) {
                schoolNameElement.textContent = newName;
                restartSchoolNameAnimation();
            }
        }
    });
    
    console.log('📡 Firebase school name listener set up');
}

/**
 * Setup listener untuk tab dashboard aktif
 */
function setupDashboardTabListener() {
    const originalSwitchTab = window.switchTab;
    if (originalSwitchTab && typeof originalSwitchTab === 'function') {
        window.switchTab = function(tabId) {
            originalSwitchTab(tabId);
            if (tabId === 'dashboard') {
                setTimeout(() => {
                    const schoolNameElement = document.getElementById('schoolNameDisplay');
                    if (schoolNameElement && !schoolNameElement.classList.contains('school-name-animated')) {
                        restartSchoolNameAnimation();
                    }
                }, 200);
            }
        };
    }
}

/**
 * Inisialisasi lengkap
 */
function initFullSchoolNameAnimation() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                initSchoolNameAnimation();
                setupSchoolNameObserver();
                setupSchoolNameFirebaseListener();
            }, 500);
        });
    } else {
        setTimeout(() => {
            initSchoolNameAnimation();
            setupSchoolNameObserver();
            setupSchoolNameFirebaseListener();
        }, 500);
    }
}

// Auto initialize
initFullSchoolNameAnimation();
setupDashboardTabListener();

// Ekspor ke global
window.initSchoolNameAnimation = initSchoolNameAnimation;
window.restartSchoolNameAnimation = restartSchoolNameAnimation;
window.pauseSchoolNameAnimation = pauseSchoolNameAnimation;
window.resumeSchoolNameAnimation = resumeSchoolNameAnimation;
window.disableSchoolNameAnimation = disableSchoolNameAnimation;
window.enableSchoolNameAnimation = enableSchoolNameAnimation;

console.log('✅ school-name-animation.js loaded - Looping color change animation ready!');