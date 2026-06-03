// school-name-animation.js - VERSION 4.0
// Animasi nama sekolah dengan TYPING EFFECT + perubahan warna berulang (looping color change)

let schoolNameAnimationEnabled = true;
let originalSchoolName = '';
let currentUserRole = '';
let typingInterval = null;
let isTypingActive = false;

// Konfigurasi animasi
const TYPING_SPEED = 80; // kecepatan typing (ms per karakter)
const COLOR_ANIMATION_DURATION = 4000; // durasi animasi warna (4 detik)

/**
 * Inisialisasi animasi nama sekolah (Typing + Warna)
 */
function initSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) {
        console.warn('schoolNameDisplay element not found');
        return;
    }
    
    // Simpan teks asli
    const fullText = schoolNameElement.textContent || 'Sistem Absensi IoT';
    originalSchoolName = fullText;
    
    // Hentikan animasi typing yang sedang berjalan
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
    
    // Reset elemen
    schoolNameElement.innerHTML = '';
    schoolNameElement.style.opacity = '1';
    
    if (schoolNameAnimationEnabled) {
        isTypingActive = true;
        
        // Buat span untuk efek typing
        const typingSpan = document.createElement('span');
        typingSpan.className = 'school-name-typing';
        schoolNameElement.appendChild(typingSpan);
        
        let i = 0;
        typingInterval = setInterval(function() {
            if (i < fullText.length) {
                typingSpan.textContent += fullText.charAt(i);
                i++;
            } else {
                // Typing selesai
                clearInterval(typingInterval);
                typingInterval = null;
                isTypingActive = false;
                
                // Hapus border cursor
                typingSpan.style.borderRight = 'none';
                // Ganti dengan efek warna berubah
                typingSpan.className = 'school-name-animated';
                typingSpan.setAttribute('title', '✨ Sistem Absensi IoT - HakaTech ✨');
                
                // Tambahkan efek hover
                typingSpan.style.transition = 'all 0.3s ease';
                
                console.log('✨ Typing animation completed, color looping animation started');
            }
        }, TYPING_SPEED);
    } else {
        // Nonaktifkan animasi, tampilkan teks biasa
        schoolNameElement.textContent = originalSchoolName;
        schoolNameElement.classList.remove('school-name-animated', 'school-name-typing');
        schoolNameElement.style.animation = 'none';
    }
    
    console.log('✨ School name typing + color animation initialized');
}

/**
 * Restart animasi (saat teks berubah)
 */
function restartSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    // Hentikan animasi yang sedang berjalan
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
    
    // Simpan teks baru
    originalSchoolName = schoolNameElement.textContent || 'Sistem Absensi IoT';
    
    // Reset dan jalankan ulang animasi
    schoolNameElement.innerHTML = '';
    schoolNameElement.style.opacity = '1';
    
    if (schoolNameAnimationEnabled) {
        isTypingActive = true;
        
        const typingSpan = document.createElement('span');
        typingSpan.className = 'school-name-typing';
        schoolNameElement.appendChild(typingSpan);
        
        let i = 0;
        typingInterval = setInterval(function() {
            if (i < originalSchoolName.length) {
                typingSpan.textContent += originalSchoolName.charAt(i);
                i++;
            } else {
                clearInterval(typingInterval);
                typingInterval = null;
                isTypingActive = false;
                
                typingSpan.style.borderRight = 'none';
                typingSpan.className = 'school-name-animated';
                typingSpan.setAttribute('title', '✨ Sistem Absensi IoT - HakaTech ✨');
                typingSpan.style.transition = 'all 0.3s ease';
                
                console.log('✨ School name animation restarted and completed');
            }
        }, TYPING_SPEED);
    } else {
        schoolNameElement.textContent = originalSchoolName;
        schoolNameElement.classList.remove('school-name-animated', 'school-name-typing');
    }
    
    console.log('✨ School name animation restarted');
}

/**
 * Hentikan animasi sementara
 */
function pauseSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
    
    schoolNameElement.classList.remove('school-name-animated', 'school-name-typing');
    schoolNameElement.style.animation = 'none';
    if (schoolNameElement.firstChild) {
        schoolNameElement.firstChild.style.animation = 'none';
    }
    
    console.log('⏸️ School name animation paused');
}

/**
 * Lanjutkan animasi
 */
function resumeSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    if (!schoolNameAnimationEnabled) return;
    
    // Jika sedang dalam typing mode, restart saja
    if (schoolNameElement.querySelector('.school-name-typing')) {
        restartSchoolNameAnimation();
    } else if (schoolNameElement.querySelector('.school-name-animated')) {
        schoolNameElement.querySelector('.school-name-animated').classList.add('school-name-animated');
        schoolNameElement.querySelector('.school-name-animated').style.animation = '';
    } else {
        restartSchoolNameAnimation();
    }
    
    console.log('▶️ School name animation resumed');
}

/**
 * Nonaktifkan animasi
 */
function disableSchoolNameAnimation() {
    schoolNameAnimationEnabled = false;
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
    
    const currentText = originalSchoolName;
    schoolNameElement.innerHTML = '';
    schoolNameElement.textContent = currentText;
    schoolNameElement.classList.remove('school-name-animated', 'school-name-typing');
    schoolNameElement.style.animation = 'none';
    
    console.log('🔇 School name animation disabled');
}

/**
 * Aktifkan animasi
 */
function enableSchoolNameAnimation() {
    if (schoolNameAnimationEnabled) return;
    
    schoolNameAnimationEnabled = true;
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    restartSchoolNameAnimation();
    
    console.log('🔊 School name animation enabled');
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
                if (newText !== originalSchoolName && newText && !isTypingActive) {
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
        if (newName && newName !== originalSchoolName && !isTypingActive) {
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
                    if (schoolNameElement) {
                        const hasAnimatedClass = schoolNameElement.querySelector('.school-name-animated');
                        if (!hasAnimatedClass && !isTypingActive) {
                            restartSchoolNameAnimation();
                        }
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

// CSS untuk animasi (inject ke head jika belum ada)
function injectAnimationStyles() {
    if (document.getElementById('school-name-animation-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'school-name-animation-styles';
    style.textContent = `
        /* ==================== ANIMASI NAMA SEKOLAH - TYPING + WARNA BERUBAH ==================== */
        
        /* Animasi warna berulang (looping) */
        @keyframes schoolNameColorShift {
            0% {
                color: #ffd700;
                text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
            }
            15% {
                color: #ffaa00;
                text-shadow: 0 0 10px rgba(255, 170, 0, 0.6);
            }
            30% {
                color: #ff6600;
                text-shadow: 0 0 15px rgba(255, 102, 0, 0.7);
            }
            45% {
                color: #ff3366;
                text-shadow: 0 0 15px rgba(255, 51, 102, 0.7);
            }
            60% {
                color: #9c27b0;
                text-shadow: 0 0 15px rgba(156, 39, 176, 0.7);
            }
            75% {
                color: #00bcd4;
                text-shadow: 0 0 12px rgba(0, 188, 212, 0.6);
            }
            100% {
                color: #2196f3;
                text-shadow: 0 0 8px rgba(33, 150, 243, 0.5);
            }
        }

        /* Animasi warna untuk light mode */
        @keyframes schoolNameColorShiftLight {
            0% { color: #d4a017; }
            15% { color: #e6a800; }
            30% { color: #cc6b00; }
            45% { color: #c2185b; }
            60% { color: #7b1fa2; }
            75% { color: #0097a7; }
            100% { color: #0288d1; }
        }

        /* Efek glow berkelanjutan */
        @keyframes schoolNameGlow {
            0% {
                text-shadow: 0 0 5px rgba(255, 215, 0, 0.3);
            }
            50% {
                text-shadow: 0 0 20px rgba(0, 188, 212, 0.5), 0 0 8px rgba(255, 215, 0, 0.3);
            }
            100% {
                text-shadow: 0 0 5px rgba(33, 150, 243, 0.3);
            }
        }

        /* Efek bounce saat hover */
        @keyframes schoolNameBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
        }

        /* Cursor berkedip untuk efek typing */
        @keyframes blinkCursor {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }

        /* Gaya untuk efek typing */
        .school-name-typing {
            display: inline-block;
            font-weight: 800;
            letter-spacing: 0.5px;
            white-space: nowrap;
            overflow: hidden;
            border-right: 3px solid var(--primary, #00bcd4);
            animation: blinkCursor 0.8s step-end infinite;
        }

        /* Gaya untuk animasi warna berulang */
        .school-name-animated {
            display: inline-block;
            font-weight: 800;
            letter-spacing: 0.5px;
            animation: schoolNameColorShift 4s ease-in-out infinite;
            transition: all 0.3s ease;
        }

        .school-name-animated:hover {
            animation: schoolNameColorShift 4s ease-in-out infinite, schoolNameBounce 0.5s ease-in-out, schoolNameGlow 1s ease-in-out;
            cursor: pointer;
        }

        /* Light mode */
        body.light-mode .school-name-animated {
            animation: schoolNameColorShiftLight 4s ease-in-out infinite;
        }

        body.light-mode .school-name-animated:hover {
            animation: schoolNameColorShiftLight 4s ease-in-out infinite, schoolNameBounce 0.5s ease-in-out, schoolNameGlow 1s ease-in-out;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .school-name-animated,
            .school-name-typing {
                font-size: 1.2rem;
                animation-duration: 3s;
            }
            body.light-mode .school-name-animated {
                animation-duration: 3s;
            }
        }

        /* Tooltip style */
        .school-name-animated[title],
        .school-name-typing[title] {
            position: relative;
        }

        .school-name-animated[title]:hover::after,
        .school-name-typing[title]:hover::after {
            content: attr(title);
            position: absolute;
            bottom: -30px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 8px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 100;
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
}

// Auto initialize
injectAnimationStyles();
initFullSchoolNameAnimation();
setupDashboardTabListener();

// Ekspor ke global
window.initSchoolNameAnimation = initSchoolNameAnimation;
window.restartSchoolNameAnimation = restartSchoolNameAnimation;
window.pauseSchoolNameAnimation = pauseSchoolNameAnimation;
window.resumeSchoolNameAnimation = resumeSchoolNameAnimation;
window.disableSchoolNameAnimation = disableSchoolNameAnimation;
window.enableSchoolNameAnimation = enableSchoolNameAnimation;

console.log('✅ school-name-animation.js v4.0 loaded - Typing + Looping color change animation ready!');