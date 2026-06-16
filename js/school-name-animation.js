// school-name-animation.js - VERSION 6.0 (LOOPING TYPING EFFECT)
// Animasi nama sekolah dengan LOOPING TYPING EFFECT + perubahan warna berulang
// Fitur:
// - Typing effect berulang (terus menerus)
// - Setelah selesai typing, akan pause sebentar lalu restart typing
// - Warna berubah terus menerus selama animasi berjalan
// - Mendukung perubahan nama sekolah dari Firebase
// ============================================================================

let schoolNameAnimationEnabled = true;
let originalSchoolName = '';
let currentUserRole = '';
let typingInterval = null;
let isTypingActive = false;
let animationRestartDebounceTimer = null;
let isInitialized = false;
let loopTimeout = null;
let currentTypingSpan = null;
let isLoopingEnabled = true;

// Konfigurasi animasi
const TYPING_SPEED = 80; // kecepatan typing (ms per karakter)
const PAUSE_BEFORE_RESTART = 2000; // jeda sebelum restart typing (2 detik)
const COLOR_ANIMATION_DURATION = 4000; // durasi animasi warna (4 detik)
const DEBOUNCE_DELAY = 300; // delay untuk menghindari restart berlebihan

// ======================= FUNGSI UTILITY =======================

/**
 * Membersihkan semua interval, timeout, dan loop yang sedang berjalan
 */
function clearAllAnimations() {
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
    if (loopTimeout) {
        clearTimeout(loopTimeout);
        loopTimeout = null;
    }
    if (animationRestartDebounceTimer) {
        clearTimeout(animationRestartDebounceTimer);
        animationRestartDebounceTimer = null;
    }
}

/**
 * Mendapatkan teks nama sekolah saat ini
 */
function getCurrentSchoolName() {
    const element = document.getElementById('schoolNameDisplay');
    if (!element) return 'Sistem Absensi IoT';
    const text = element.textContent || element.innerText || '';
    return text.trim() || 'Sistem Absensi IoT';
}

/**
 * Memperbarui teks asli nama sekolah
 */
function updateOriginalSchoolName() {
    const newText = getCurrentSchoolName();
    if (newText !== originalSchoolName) {
        originalSchoolName = newText;
        console.log('📝 Original school name updated to:', originalSchoolName);
    }
}

// ======================= INJECT CSS STYLES =======================

function injectAnimationStyles() {
    if (document.getElementById('school-name-animation-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'school-name-animation-styles';
    style.textContent = `
        /* ==================== ANIMASI NAMA SEKOLAH - LOOPING TYPING ==================== */
        
        /* Animasi warna berulang (looping) - Lebih smooth */
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

        /* Efek pulse ringan untuk typing */
        @keyframes typingPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
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
            white-space: nowrap;
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

        /* Loading/dots animation */
        .loading-dots {
            display: inline-block;
            font-size: 1.2rem;
            letter-spacing: 2px;
        }
        .loading-dots span {
            animation: blink 1.4s infinite both;
        }
        .loading-dots span:nth-child(1) { animation-delay: 0s; }
        .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
        .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes blink {
            0%, 80%, 100% { opacity: 0; }
            40% { opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    console.log('🎨 School name animation styles injected');
}

// ======================= FUNGSI ANIMASI UTAMA =======================

/**
 * Menjalankan efek typing untuk teks yang diberikan
 * @param {HTMLElement} container - Element container untuk menampung typing span
 * @param {string} text - Teks yang akan diketik
 * @param {function} onComplete - Callback setelah typing selesai
 */
function runTypingEffect(container, text, onComplete) {
    if (!container || !text) {
        if (onComplete) onComplete();
        return;
    }
    
    // Bersihkan container
    container.innerHTML = '';
    container.style.opacity = '1';
    
    // Buat span untuk efek typing
    const typingSpan = document.createElement('span');
    typingSpan.className = 'school-name-typing';
    typingSpan.style.whiteSpace = 'nowrap';
    container.appendChild(typingSpan);
    currentTypingSpan = typingSpan;
    
    let i = 0;
    let currentText = '';
    
    typingInterval = setInterval(function() {
        if (i < text.length) {
            currentText += text.charAt(i);
            typingSpan.textContent = currentText;
            i++;
        } else {
            // Typing selesai
            clearInterval(typingInterval);
            typingInterval = null;
            
            // Hapus border cursor
            typingSpan.style.borderRight = 'none';
            // Ganti dengan efek warna berubah
            typingSpan.className = 'school-name-animated';
            typingSpan.setAttribute('title', '✨ Sistem Absensi IoT - HakaTech ✨');
            typingSpan.style.transition = 'all 0.3s ease';
            
            console.log('✨ Typing animation completed for:', text);
            
            if (onComplete) {
                onComplete();
            }
        }
    }, TYPING_SPEED);
}

/**
 * Menjalankan loop typing (terus menerus)
 * @param {HTMLElement} container - Element container
 * @param {string} text - Teks yang akan diketik berulang
 */
function startLoopingTyping(container, text) {
    if (!isLoopingEnabled || !schoolNameAnimationEnabled) return;
    
    runTypingEffect(container, text, function() {
        // Setelah typing selesai, tunggu beberapa detik lalu restart
        if (isLoopingEnabled && schoolNameAnimationEnabled) {
            loopTimeout = setTimeout(function() {
                // Cek apakah teks masih sama (mungkin berubah dari Firebase)
                const currentText = getCurrentSchoolName();
                if (currentText !== text) {
                    text = currentText;
                    originalSchoolName = text;
                }
                startLoopingTyping(container, text);
            }, PAUSE_BEFORE_RESTART);
        }
    });
}

/**
 * Menghentikan loop typing
 */
function stopLoopingTyping() {
    isLoopingEnabled = false;
    if (loopTimeout) {
        clearTimeout(loopTimeout);
        loopTimeout = null;
    }
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
    isTypingActive = false;
}

/**
 * Memulai ulang loop typing (dengan teks terbaru)
 */
function restartLoopingTyping() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    const newText = getCurrentSchoolName();
    originalSchoolName = newText;
    
    // Hentikan loop yang sedang berjalan
    if (loopTimeout) {
        clearTimeout(loopTimeout);
        loopTimeout = null;
    }
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
    
    // Mulai loop baru
    isLoopingEnabled = true;
    startLoopingTyping(schoolNameElement, newText);
    console.log('🔄 Looping typing restarted with text:', newText);
}

/**
 * Inisialisasi animasi nama sekolah (Looping Typing)
 */
function initSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) {
        console.warn('⚠️ schoolNameDisplay element not found, retrying in 500ms...');
        setTimeout(() => initSchoolNameAnimation(), 500);
        return;
    }
    
    // Bersihkan animasi yang sedang berjalan
    clearAllAnimations();
    isLoopingEnabled = true;
    isTypingActive = true;
    
    // Simpan teks asli
    const fullText = getCurrentSchoolName();
    originalSchoolName = fullText;
    
    // Reset elemen
    schoolNameElement.innerHTML = '';
    schoolNameElement.style.opacity = '1';
    schoolNameElement.style.display = 'inline-block';
    
    if (!schoolNameAnimationEnabled) {
        schoolNameElement.textContent = originalSchoolName;
        schoolNameElement.classList.remove('school-name-animated', 'school-name-typing');
        schoolNameElement.style.animation = 'none';
        console.log('🔇 School name animation disabled');
        return;
    }
    
    // Mulai loop typing
    startLoopingTyping(schoolNameElement, fullText);
    
    console.log('✨ School name LOOPING typing animation initialized for:', fullText);
}

/**
 * Restart animasi (saat teks berubah)
 */
function restartSchoolNameAnimation() {
    // Debounce untuk menghindari restart berlebihan
    if (animationRestartDebounceTimer) {
        clearTimeout(animationRestartDebounceTimer);
    }
    
    animationRestartDebounceTimer = setTimeout(() => {
        const schoolNameElement = document.getElementById('schoolNameDisplay');
        if (!schoolNameElement) {
            console.warn('⚠️ schoolNameDisplay not found for restart');
            return;
        }
        
        const newText = getCurrentSchoolName();
        
        // Hanya restart jika teks benar-benar berubah
        if (newText === originalSchoolName) {
            console.log('📝 Text unchanged, skipping restart');
            return;
        }
        
        originalSchoolName = newText;
        
        // Hentikan loop yang sedang berjalan
        stopLoopingTyping();
        
        // Reset elemen
        schoolNameElement.innerHTML = '';
        schoolNameElement.style.opacity = '1';
        
        if (schoolNameAnimationEnabled) {
            isLoopingEnabled = true;
            startLoopingTyping(schoolNameElement, newText);
        } else {
            schoolNameElement.textContent = originalSchoolName;
            schoolNameElement.classList.remove('school-name-animated', 'school-name-typing');
            schoolNameElement.style.animation = 'none';
        }
        
        console.log('✨ School name animation restarted for:', originalSchoolName);
        animationRestartDebounceTimer = null;
    }, DEBOUNCE_DELAY);
}

/**
 * Force restart animasi (tanpa debounce)
 */
function forceRestartSchoolNameAnimation() {
    if (animationRestartDebounceTimer) {
        clearTimeout(animationRestartDebounceTimer);
        animationRestartDebounceTimer = null;
    }
    
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    const newText = getCurrentSchoolName();
    originalSchoolName = newText;
    
    // Hentikan semua animasi
    stopLoopingTyping();
    
    // Reset elemen
    schoolNameElement.innerHTML = '';
    schoolNameElement.style.opacity = '1';
    
    if (schoolNameAnimationEnabled) {
        isLoopingEnabled = true;
        startLoopingTyping(schoolNameElement, newText);
    } else {
        schoolNameElement.textContent = originalSchoolName;
        schoolNameElement.classList.remove('school-name-animated', 'school-name-typing');
    }
    
    console.log('✨ Force restart completed for:', originalSchoolName);
}

/**
 * Hentikan animasi sementara
 */
function pauseSchoolNameAnimation() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    stopLoopingTyping();
    
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
    
    // Jika sedang tidak ada animasi, restart
    const hasTypingClass = schoolNameElement.querySelector('.school-name-typing');
    const hasAnimatedClass = schoolNameElement.querySelector('.school-name-animated');
    
    if (!hasTypingClass && !hasAnimatedClass) {
        forceRestartSchoolNameAnimation();
    } else if (hasTypingClass && !isTypingActive) {
        // Jika ada typing class tapi tidak aktif, restart
        forceRestartSchoolNameAnimation();
    } else {
        // Jika animasi warna, pastikan berjalan
        if (hasAnimatedClass) {
            const animatedSpan = schoolNameElement.querySelector('.school-name-animated');
            animatedSpan.style.animation = '';
        }
    }
    
    console.log('▶️ School name animation resumed');
}

/**
 * Nonaktifkan animasi
 */
function disableSchoolNameAnimation() {
    schoolNameAnimationEnabled = false;
    isLoopingEnabled = false;
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    stopLoopingTyping();
    
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
    isLoopingEnabled = true;
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    forceRestartSchoolNameAnimation();
    
    console.log('🔊 School name animation enabled');
}

// ======================= OBSERVER DAN LISTENER =======================

/**
 * Setup observer untuk mendeteksi perubahan teks nama sekolah
 */
function setupSchoolNameObserver() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) {
        console.warn('⚠️ schoolNameDisplay not found for observer setup');
        setTimeout(() => setupSchoolNameObserver(), 500);
        return;
    }
    
    // Hapus observer lama jika ada
    if (window._schoolNameObserver) {
        window._schoolNameObserver.disconnect();
    }
    
    const observer = new MutationObserver((mutations) => {
        let textChanged = false;
        
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
                    textChanged = true;
                }
            } else if (mutation.type === 'characterData') {
                textChanged = true;
            }
        });
        
        if (textChanged && !isTypingActive) {
            const newText = schoolNameElement.textContent || schoolNameElement.innerText || '';
            if (newText && newText !== originalSchoolName) {
                console.log('📝 School name changed via DOM, restarting animation');
                originalSchoolName = newText;
                restartSchoolNameAnimation();
            }
        }
    });
    
    observer.observe(schoolNameElement, {
        childList: true,
        characterData: true,
        subtree: true,
        characterDataOldValue: true
    });
    
    window._schoolNameObserver = observer;
    console.log('👁️ School name observer set up');
}

/**
 * Setup listener untuk Firebase realtime
 */
function setupSchoolNameFirebaseListener() {
    if (typeof db === 'undefined' || !db) {
        console.warn('⚠️ Firebase not available, skipping realtime listener');
        setTimeout(() => setupSchoolNameFirebaseListener(), 1000);
        return;
    }
    
    // Hapus listener lama jika ada
    if (window._schoolNameFirebaseListener) {
        db.ref('system_config/schoolName').off('value', window._schoolNameFirebaseListener);
    }
    
    window._schoolNameFirebaseListener = (snapshot) => {
        const newName = snapshot.val();
        if (newName && newName !== originalSchoolName) {
            console.log('📡 School name changed from Firebase:', newName);
            originalSchoolName = newName;
            
            const schoolNameElement = document.getElementById('schoolNameDisplay');
            if (schoolNameElement) {
                // Update element tanpa memicu observer berlebihan
                if (typingInterval) {
                    clearInterval(typingInterval);
                    typingInterval = null;
                }
                if (loopTimeout) {
                    clearTimeout(loopTimeout);
                    loopTimeout = null;
                }
                schoolNameElement.innerHTML = '';
                
                if (schoolNameAnimationEnabled) {
                    isLoopingEnabled = true;
                    startLoopingTyping(schoolNameElement, newName);
                } else {
                    schoolNameElement.textContent = newName;
                }
            }
        }
    };
    
    db.ref('system_config/schoolName').on('value', window._schoolNameFirebaseListener);
    console.log('📡 Firebase school name listener set up');
}

/**
 * Setup listener untuk perubahan tema (dark/light mode)
 */
function setupThemeChangeListener() {
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                const schoolNameElement = document.getElementById('schoolNameDisplay');
                const animatedSpan = schoolNameElement?.querySelector('.school-name-animated');
                if (animatedSpan) {
                    // Refresh animasi dengan class baru
                    animatedSpan.style.animation = 'none';
                    setTimeout(() => {
                        animatedSpan.style.animation = '';
                    }, 50);
                }
                console.log('🎨 Theme changed, animation refreshed');
            }
        });
    });
    
    themeObserver.observe(document.body, { attributes: true });
    console.log('🎨 Theme change listener set up');
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
                        const hasTypingClass = schoolNameElement.querySelector('.school-name-typing');
                        const hasAnimatedClass = schoolNameElement.querySelector('.school-name-animated');
                        if (!hasTypingClass && !hasAnimatedClass && schoolNameAnimationEnabled) {
                            console.log('📺 Dashboard tab activated, restarting animation');
                            forceRestartSchoolNameAnimation();
                        }
                    }
                }, 200);
            }
        };
    }
}

/**
 * Setup periodic check untuk memastikan animasi tetap berjalan
 */
function setupPeriodicAnimationCheck() {
    setInterval(() => {
        const schoolNameElement = document.getElementById('schoolNameDisplay');
        if (!schoolNameElement) return;
        
        const hasTypingClass = schoolNameElement.querySelector('.school-name-typing');
        const hasAnimatedClass = schoolNameElement.querySelector('.school-name-animated');
        const isEmpty = schoolNameElement.innerHTML === '' || schoolNameElement.textContent === '';
        
        // Jika element kosong atau tidak memiliki animasi yang benar
        if ((isEmpty || (!hasTypingClass && !hasAnimatedClass)) && schoolNameAnimationEnabled && !isTypingActive) {
            console.log('🔄 Periodic check: animation missing, restarting');
            forceRestartSchoolNameAnimation();
        }
        
        // Jika sudah dalam mode animated tapi tidak ada animasi warna
        if (hasAnimatedClass && hasAnimatedClass.style.animation === 'none') {
            hasAnimatedClass.style.animation = '';
        }
    }, 15000); // Cek setiap 15 detik
    console.log('🔄 Periodic animation check set up (every 15 seconds)');
}

// ======================= INISIALISASI LENGKAP =======================

/**
 * Inisialisasi lengkap semua komponen
 */
function initFullSchoolNameAnimation() {
    if (isInitialized) {
        console.log('⚠️ School name animation already initialized');
        return;
    }
    
    console.log('🚀 Initializing full school name animation system (LOOPING TYPING)...');
    
    const init = () => {
        injectAnimationStyles();
        setupSchoolNameObserver();
        setupSchoolNameFirebaseListener();
        setupThemeChangeListener();
        setupDashboardTabListener();
        setupPeriodicAnimationCheck();
        initSchoolNameAnimation();
        isInitialized = true;
        console.log('✅ Full school name animation system initialized with LOOPING TYPING!');
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(init, 300);
        });
    } else {
        setTimeout(init, 300);
    }
}

/**
 * Reset seluruh sistem animasi (untuk debugging)
 */
function resetSchoolNameAnimationSystem() {
    console.log('🔄 Resetting school name animation system...');
    
    // Bersihkan semua listener
    if (window._schoolNameObserver) {
        window._schoolNameObserver.disconnect();
        window._schoolNameObserver = null;
    }
    
    if (window._schoolNameFirebaseListener && typeof db !== 'undefined' && db) {
        db.ref('system_config/schoolName').off('value', window._schoolNameFirebaseListener);
        window._schoolNameFirebaseListener = null;
    }
    
    clearAllAnimations();
    stopLoopingTyping();
    isTypingActive = false;
    isInitialized = false;
    isLoopingEnabled = true;
    
    // Re-init
    setTimeout(() => {
        initFullSchoolNameAnimation();
    }, 100);
}

/**
 * Mengatur ulang loop typing dengan teks terbaru (tanpa reset penuh)
 */
function refreshLoopingTyping() {
    const schoolNameElement = document.getElementById('schoolNameDisplay');
    if (!schoolNameElement) return;
    
    const newText = getCurrentSchoolName();
    if (newText !== originalSchoolName) {
        originalSchoolName = newText;
    }
    
    stopLoopingTyping();
    isLoopingEnabled = true;
    startLoopingTyping(schoolNameElement, originalSchoolName);
    console.log('🔄 Looping typing refreshed');
}

// ======================= EKSPOR KE GLOBAL =======================

window.initSchoolNameAnimation = initSchoolNameAnimation;
window.restartSchoolNameAnimation = restartSchoolNameAnimation;
window.forceRestartSchoolNameAnimation = forceRestartSchoolNameAnimation;
window.pauseSchoolNameAnimation = pauseSchoolNameAnimation;
window.resumeSchoolNameAnimation = resumeSchoolNameAnimation;
window.disableSchoolNameAnimation = disableSchoolNameAnimation;
window.enableSchoolNameAnimation = enableSchoolNameAnimation;
window.resetSchoolNameAnimationSystem = resetSchoolNameAnimationSystem;
window.refreshLoopingTyping = refreshLoopingTyping;
window.stopLoopingTyping = stopLoopingTyping;

// Auto initialize
initFullSchoolNameAnimation();

console.log('✅ school-name-animation.js v6.0 loaded - LOOPING TYPING + Looping color change animation ready!');