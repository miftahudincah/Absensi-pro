// ui.js - VERSION 5.18 (FIX: USER NAME & ROLE SYNC ISSUE)
// Berisi fungsi-fungsi antarmuka pengguna, modal, profil, dan inisialisasi dashboard
// PERUBAHAN V5.18: 
//   - Memperbaiki updateUserInterface() untuk update navbar user (nama & role)
//   - Menambahkan force update setelah login untuk memastikan data sinkron
//   - Menambahkan validasi dan perbaikan data user saat login
// ============================================================================

// ======================== GLOBAL UI STATE ========================
let clockInterval = null;
let uiInitialized = false;
let dashboardChart = null;
let dashboardChartRetryTimeout = null;
let populateRetryCount = 0;
const MAX_POPULATE_RETRY = 20;
let chatRenderRetryCount = 0;
const MAX_CHAT_RENDER_RETRY = 10;
let photoRefreshListenerAttached = false;

// ======================== HELPER FUNCTIONS ========================

function getClassIconForHeader(className) {
    if (!className) return '🏫';
    const classes = window.currentSchoolConfig?.classes || [];
    const classData = classes.find(c => {
        if (typeof c === 'object') return c.name === className;
        return c === className;
    });
    if (classData && typeof classData === 'object' && classData.icon) {
        return classData.icon;
    }
    if (className.includes('VII')) return '📚';
    if (className.includes('VIII')) return '📖';
    if (className.includes('IX')) return '🎓';
    if (className.includes('X')) return '💻';
    if (className.includes('XI')) return '🔧';
    if (className.includes('XII')) return '🚀';
    return '🏫';
}

/**
 * VALIDATE AND FIX CURRENT USER DATA
 * Memastikan currentUser memiliki data yang lengkap dan benar
 */
function validateAndFixCurrentUser() {
    if (!currentUser) return false;
    
    let changed = false;
    
    // Pastikan nama ada
    if (!currentUser.nama || currentUser.nama === 'User' || currentUser.nama === 'user' || currentUser.nama === '') {
        currentUser.nama = currentUser.email?.split('@')[0] || 'User';
        changed = true;
        console.log("🔧 Fixed missing nama:", currentUser.nama);
    }
    
    // Pastikan role developer untuk email zaki5go@gmail.com
    if (currentUser.email === 'zaki5go@gmail.com' && currentUser.role !== 'developer') {
        currentUser.role = 'developer';
        changed = true;
        console.log("🔧 Fixed role to developer for:", currentUser.email);
        // Update ke Firebase
        if (currentUser.uid) {
            db.ref(`users_auth/${currentUser.uid}/role`).set('developer')
                .catch(err => console.warn("Failed to update role in Firebase:", err));
        }
    }
    
    // Pastikan role tidak undefined
    if (!currentUser.role) {
        currentUser.role = 'siswa';
        changed = true;
        console.log("🔧 Fixed missing role to:", currentUser.role);
    }
    
    if (changed) {
        if (typeof saveUserToLocalStorage === 'function') {
            saveUserToLocalStorage(currentUser);
        }
        updateUserInterface();
    }
    
    return true;
}

/**
 * REFRESH ALL AVATARS - Fungsi untuk memaksa refresh semua avatar
 * dengan timestamp untuk bypass cache browser
 */
function refreshAllAvatars() {
    if (!currentUser) return;
    
    console.log("🖼️ refreshAllAvatars called - Current photoUrl:", currentUser.photoUrl);
    
    // Gunakan timestamp untuk bypass cache browser
    const timestamp = Date.now();
    let photoUrl = currentUser.photoUrl;
    
    // Jika tidak ada foto, gunakan avatar default dari UI Avatars
    if (!photoUrl) {
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.nama || 'User')}&background=00bcd4&color=fff&size=100`;
    } else {
        // Tambahkan timestamp ke URL untuk force refresh
        const separator = photoUrl.includes('?') ? '&' : '?';
        photoUrl = photoUrl.split('?')[0] + separator + 't=' + timestamp;
    }
    
    // Update semua element avatar yang ada
    const avatarElements = [
        'headerAvatar',
        'navbarAvatar', 
        'sidebarAvatar',
        'profileImg'
    ];
    
    avatarElements.forEach(id => {
        const el = document.getElementById(id);
        if (el && photoUrl) {
            el.src = photoUrl;
            console.log(`✅ Avatar updated for: ${id}`);
        }
    });
    
    // Update juga gambar di sidebar user info jika ada struktur berbeda
    const sidebarUserImg = document.querySelector('#sidebarUserInfo img');
    if (sidebarUserImg && photoUrl) {
        sidebarUserImg.src = photoUrl;
    }
    
    // Update navbar user image jika ada
    const navbarUserImg = document.querySelector('.navbar-user img');
    if (navbarUserImg && photoUrl) {
        navbarUserImg.src = photoUrl;
    }
    
    // Update header user image jika ada struktur berbeda
    const headerUserImg = document.querySelector('.header-user img');
    if (headerUserImg && photoUrl) {
        headerUserImg.src = photoUrl;
    }
}

/**
 * Setup realtime listener untuk perubahan foto profil
 */
function setupPhotoRealtimeListener() {
    if (photoRefreshListenerAttached) return;
    if (!currentUser || !currentUser.uid) return;
    
    photoRefreshListenerAttached = true;
    console.log("📡 Setting up realtime photo listener for user:", currentUser.uid);
    
    db.ref(`users_auth/${currentUser.uid}/photoUrl`).on('value', (snapshot) => {
        const newPhotoUrl = snapshot.val();
        if (newPhotoUrl && currentUser.photoUrl !== newPhotoUrl) {
            console.log("🖼️ Photo URL changed in Firebase, updating UI...");
            currentUser.photoUrl = newPhotoUrl;
            if (typeof saveUserToLocalStorage === 'function') {
                saveUserToLocalStorage(currentUser);
            }
            refreshAllAvatars();
        }
    });
}

// ======================== SIDEBAR FUNCTIONS ========================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebarMenu');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburgerIcon = document.querySelector('.hamburger-icon');
    const closeIcon = document.querySelector('.hamburger-close');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('open');
        
        if (sidebar.classList.contains('open')) {
            if (hamburgerIcon) hamburgerIcon.style.display = 'none';
            if (closeIcon) closeIcon.style.display = 'inline';
            document.body.style.overflow = 'hidden';
        } else {
            if (hamburgerIcon) hamburgerIcon.style.display = 'inline';
            if (closeIcon) closeIcon.style.display = 'none';
            document.body.style.overflow = '';
        }
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebarMenu');
    const overlay = document.getElementById('sidebarOverlay');
    const hamburgerIcon = document.querySelector('.hamburger-icon');
    const closeIcon = document.querySelector('.hamburger-close');
    
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
        if (hamburgerIcon) hamburgerIcon.style.display = 'inline';
        if (closeIcon) closeIcon.style.display = 'none';
        document.body.style.overflow = '';
    }
}

function initSidebar() {
    console.log("📱 Initializing sidebar...");
    
    const sidebarBtns = document.querySelectorAll('.sidebar-btn');
    sidebarBtns.forEach(btn => {
        btn.removeEventListener('click', handleSidebarClick);
        btn.addEventListener('click', handleSidebarClick);
    });
    
    updateSidebarActiveState();
    updateSidebarUserInfo();
    applySidebarRolePermissions();
    
    console.log("✅ Sidebar initialized");
}

function handleSidebarClick(e) {
    const btn = e.currentTarget;
    const tabId = btn.getAttribute('data-tab');
    if (tabId) {
        switchTab(tabId);
        closeSidebar();
        updateSidebarActiveState();
        updateMobileNavTitle(tabId);
    }
}

function updateSidebarActiveState() {
    const activeTab = document.querySelector('.tab-content.active')?.id;
    if (!activeTab) return;
    
    const tabId = activeTab.replace('tab-', '');
    const sidebarBtns = document.querySelectorAll('.sidebar-btn');
    
    sidebarBtns.forEach(btn => {
        const btnTab = btn.getAttribute('data-tab');
        if (btnTab === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function updateSidebarUserInfo() {
    if (!currentUser) return;
    
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const sidebarUserRole = document.getElementById('sidebarUserRole');
    const sidebarClassInfo = document.getElementById('sidebarClassInfo');
    
    if (sidebarAvatar) {
        const photoUrl = currentUser.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.nama || 'User')}&background=00bcd4&color=fff&size=100`;
        sidebarAvatar.src = photoUrl;
    }
    if (sidebarUserName) {
        sidebarUserName.textContent = currentUser.nama || currentUser.email;
    }
    if (sidebarUserRole) {
        let roleText = currentUser.role?.toUpperCase() || 'SISWA';
        if (currentUser.role === 'developer') roleText = 'DEVELOPER';
        sidebarUserRole.textContent = roleText;
    }
    
    if (sidebarClassInfo) {
        if (currentUser.role === 'siswa' && currentUser.kelas) {
            const classIcon = getClassIconForHeader(currentUser.kelas);
            sidebarClassInfo.innerHTML = `${classIcon} ${currentUser.kelas}`;
            sidebarClassInfo.style.display = 'block';
        } else if (currentUser.role === 'guru' && currentUser.subject) {
            sidebarClassInfo.innerHTML = `📖 ${currentUser.subject}`;
            sidebarClassInfo.style.display = 'block';
        } else {
            sidebarClassInfo.style.display = 'none';
        }
    }
}

function updateMobileNavTitle(tabId) {
    const titleMap = {
        'dashboard': '📊 Dashboard',
        'attendance': '📋 Absensi',
        'students': '👨‍🎓 Data Siswa',
        'users': '👥 Manajemen User',
        'rekap': '📊 Rekap Absensi',
        'friends': '👥 Teman',
        'chat': '💬 Chat',
        'logs': '📋 Log Aktivitas',
        'config': '⚙️ Pengaturan',
        'guide': '📘 Panduan'
    };
    const navTitle = document.getElementById('mobileNavTitle');
    if (navTitle && titleMap[tabId]) {
        navTitle.textContent = titleMap[tabId];
    }
}

function applySidebarRolePermissions() {
    if (!currentUser) return;
    
    const role = currentUser.role;
    const isAdminOrDev = (role === 'admin' || role === 'developer');
    const isGuruOrDev = (role === 'admin' || role === 'guru' || role === 'developer');
    
    const sidebarBtns = document.querySelectorAll('.sidebar-btn');
    sidebarBtns.forEach(btn => {
        const btnTab = btn.getAttribute('data-tab');
        const hasRoleAdmin = btn.classList.contains('role-admin');
        const hasRoleGuru = btn.classList.contains('role-guru');
        const hasRoleDeveloper = btn.classList.contains('role-developer');
        
        // Tombol Pengaturan (config)
        if (btnTab === 'config') {
            if (isGuruOrDev) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
            return;
        }
        
        // Tombol Log Aktivitas (logs)
        if (btnTab === 'logs') {
            if (isGuruOrDev) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
            return;
        }
        
        // Tombol Manajemen User (users)
        if (btnTab === 'users') {
            if (isGuruOrDev) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
            return;
        }
        
        // Tombol dengan class role-developer
        if (hasRoleDeveloper && role === 'developer') {
            btn.style.display = 'flex';
            return;
        }
        
        // Tombol dengan class role-admin
        if (hasRoleAdmin && !isAdminOrDev) {
            btn.style.display = 'none';
            return;
        }
        
        // Tombol dengan class role-guru
        if (hasRoleGuru && !isGuruOrDev) {
            btn.style.display = 'none';
            return;
        }
        
        // Default: tampilkan semua tombol lainnya
        btn.style.display = 'flex';
    });
}

// ======================== FUNGSI KHUSUS UNTUK CHAT RENDER ========================

/**
 * Memastikan chat container siap dan merender chat dengan retry mechanism
 */
function forceRenderChat() {
    console.log("💬 forceRenderChat called - Chat render retry count:", chatRenderRetryCount);
    
    const chatPanel = document.getElementById('chatPanel');
    if (!chatPanel) {
        console.error("❌ chatPanel element not found!");
        if (chatRenderRetryCount < MAX_CHAT_RENDER_RETRY) {
            chatRenderRetryCount++;
            console.log(`⏳ Retrying chat render in 500ms (${chatRenderRetryCount}/${MAX_CHAT_RENDER_RETRY})...`);
            setTimeout(() => forceRenderChat(), 500);
        }
        return;
    }
    
    // Reset retry counter on success
    chatRenderRetryCount = 0;
    
    // Bersihkan container
    chatPanel.innerHTML = '<div class="chat-loading" style="text-align: center; padding: 40px; color: var(--text-muted);">⏳ Memuat fitur chat...</div>';
    
    // Pastikan container terlihat
    chatPanel.style.display = 'block';
    chatPanel.style.minHeight = '500px';
    
    // Inisialisasi chat system jika belum
    if (typeof initChatSystem === 'function' && !window._chatInitialized) {
        console.log("💬 Initializing chat system from forceRenderChat...");
        window._chatInitialized = true;
        initChatSystem();
        // Beri waktu untuk inisialisasi
        setTimeout(() => {
            if (typeof renderChatInterface === 'function') {
                renderChatInterface('chatPanel');
            }
            if (typeof loadChatList === 'function') {
                setTimeout(() => loadChatList(), 300);
            }
        }, 500);
    } else if (typeof renderChatInterface === 'function') {
        console.log("💬 Rendering chat interface...");
        renderChatInterface('chatPanel');
        if (typeof loadChatList === 'function') {
            setTimeout(() => loadChatList(), 300);
        }
    } else {
        console.warn("❌ renderChatInterface not available yet");
        chatPanel.innerHTML = '<div class="chat-loading" style="text-align: center; padding: 40px; color: var(--text-muted);">❌ Gagal memuat fitur chat. Silakan refresh halaman.</div>';
    }
}

/**
 * Fungsi untuk memeriksa dan memastikan chat container sudah ter-render dengan benar
 */
function ensureChatRendered() {
    const chatPanel = document.getElementById('chatPanel');
    if (!chatPanel) return false;
    
    // Cek apakah chat container sudah memiliki struktur chat-container
    const hasChatContainer = chatPanel.querySelector('.chat-container');
    if (!hasChatContainer) {
        console.log("⚠️ Chat container not found in chatPanel, forcing render...");
        forceRenderChat();
        return false;
    }
    
    // Cek apakah chat list sudah terisi
    const chatList = document.getElementById('chatList');
    if (chatList && (chatList.innerHTML.includes('Memuat chat') || chatList.children.length === 0)) {
        console.log("⚠️ Chat list not loaded, reloading...");
        if (typeof loadChatList === 'function') {
            loadChatList();
        }
    }
    
    return true;
}

// ======================== INISIALISASI DASHBOARD ========================

function initApp() {
    console.log("🚀 initApp dipanggil - Current user:", currentUser?.nama, "Role:", currentUser?.role);
    
    if (!currentUser) {
        console.log("❌ No currentUser, showing auth section");
        const authSection = document.getElementById('auth-section');
        const dashboardSection = document.getElementById('dashboard-section');
        if (authSection) authSection.style.display = 'flex';
        if (dashboardSection) dashboardSection.style.display = 'none';
        return;
    }
    
    // ========== VALIDASI DAN PERBAIKAN DATA USER ==========
    validateAndFixCurrentUser();
    
    const authSection = document.getElementById('auth-section');
    const dashboardSection = document.getElementById('dashboard-section');
    if (authSection) authSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';
    
    // Update UI utama
    updateUserInterface();
    applyRolePermissions();
    initSidebar();
    updateSidebarUserInfo();
    loadSchoolLogo();
    updateSchoolLogoUI();
    setupChartYearListener();
    
    // Setup realtime listener untuk foto profil
    setupPhotoRealtimeListener();
    
    // ========== FORCE UPDATE SETELAH DELAY ==========
    setTimeout(() => {
        console.log("🔄 Force re-update UI after 1 second...");
        updateUserInterface();
        if (typeof updateSidebarUserInfo === 'function') {
            updateSidebarUserInfo();
        }
        applyRolePermissions();
    }, 1000);
    
    // ========== FORCE UPDATE SETELAH 3 DETIK (UNTUK JAGA-JAGA) ==========
    setTimeout(() => {
        console.log("🔄 Second force re-update UI after 3 seconds...");
        updateUserInterface();
        if (typeof updateSidebarUserInfo === 'function') {
            updateSidebarUserInfo();
        }
    }, 3000);
    
    console.log("🔧 Starting to populate all filters (with improved retry)...");
    populateAllFiltersWithRetry();
    
    try {
        if (clockInterval) clearInterval(clockInterval);
        clockInterval = setInterval(updateClock, 1000);
        updateClock();
        console.log("✅ Clock started");
    } catch (err) {
        console.error("Clock initialization error:", err);
    }
    
    window.dispatchEvent(new CustomEvent('uiReady', { detail: { currentUser } }));
    
    const renderTables = () => {
        if (typeof renderTable === 'function') {
            try { renderTable(); } catch(e) { console.warn("renderTable error:", e); }
        }
        if (typeof renderStudentsTable === 'function') {
            try { renderStudentsTable(); } catch(e) { console.warn("renderStudentsTable error:", e); }
        }
        if (typeof renderCodesTable === 'function') {
            try { renderCodesTable(); } catch(e) { console.warn("renderCodesTable error:", e); }
        }
        if (typeof renderUsersTable === 'function') {
            try { renderUsersTable(); } catch(e) { console.warn("renderUsersTable error:", e); }
        }
    };
    
    if (window.dbData && window.dbData.attendance && window.dbData.users) {
        renderTables();
    } else {
        window.addEventListener('dataReady', function onDataReady() {
            window.removeEventListener('dataReady', onDataReady);
            renderTables();
            setTimeout(() => populateAllFiltersWithRetry(), 200);
        });
    }
    
    switchTab('dashboard');
    
    // ========== FLOATING BUTTONS - PASTIKAN MUNCUL UNTUK SEMUA USER ==========
    setTimeout(() => {
        // Tombol Chat - selalu tampil untuk semua user yang login
        const floatingChatBtn = document.getElementById('floatingChatBtn');
        if (floatingChatBtn) {
            floatingChatBtn.style.display = 'flex';
            console.log("✅ Floating chat button shown");
        }
        
        // Tombol Friends - selalu tampil untuk semua user yang login
        const floatingFriendsBtn = document.getElementById('floatingFriendsBtn');
        if (floatingFriendsBtn) {
            floatingFriendsBtn.style.display = 'flex';
            console.log("✅ Floating friends button shown");
        }
        
        // Tombol Status - selalu tampil untuk semua user yang login
        const floatingStatusBtn = document.getElementById('floatingStatusBtn');
        if (floatingStatusBtn) {
            floatingStatusBtn.style.display = 'flex';
            console.log("✅ Floating status button shown");
        }
        
        // Tombol Pengumuman - hanya untuk admin, guru, developer
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
            const floatingAnnouncementBtn = document.getElementById('floatingAnnouncementBtn');
            if (floatingAnnouncementBtn) {
                floatingAnnouncementBtn.style.display = 'flex';
                console.log("✅ Floating announcement button shown");
            }
        }
    }, 500);
    
    if (typeof initAnnouncementSystem === 'function') {
        setTimeout(() => initAnnouncementSystem(), 500);
    }
    
    if (typeof initSystemConfig === 'function') {
        initSystemConfig();
    } else {
        initSystemConfigManual();
    }
    
    if (typeof initDelayEventListeners === 'function') {
        initDelayEventListeners();
    } else {
        initManualDelayListeners();
    }
    
    if (typeof initGlobalDelayListeners === 'function') {
        initGlobalDelayListeners();
    }
    
    console.log("✅ initApp completed - event 'uiReady' dispatched");
}

function populateAllFiltersWithRetry() {
    populateRetryCount = 0;
    
    function attemptPopulate() {
        const hasPopulateFilters = typeof window.populateFilters === 'function';
        
        if (!hasPopulateFilters) {
            if (populateRetryCount < MAX_POPULATE_RETRY) {
                populateRetryCount++;
                console.log(`⏳ populateFilters not available yet, retry ${populateRetryCount}/${MAX_POPULATE_RETRY}...`);
                setTimeout(attemptPopulate, 1000);
            } else {
                console.error("❌ populateFilters still not available after max retries!");
            }
            return;
        }
        
        console.log("✅ populateFilters found, executing all populate functions...");
        
        try { window.populateFilters(); } catch(e) { console.warn("populateFilters error:", e); }
        try { if (window.populateDateFilter) window.populateDateFilter(); } catch(e) { console.warn("populateDateFilter error:", e); }
        try { if (window.populateStudentFilters) window.populateStudentFilters(); } catch(e) { console.warn("populateStudentFilters error:", e); }
        try { if (window.populateKelasOptions) window.populateKelasOptions(); } catch(e) { console.warn("populateKelasOptions error:", e); }
        try { if (window.populateJurusanOptions) window.populateJurusanOptions(); } catch(e) { console.warn("populateJurusanOptions error:", e); }
        
        setTimeout(() => {
            if (typeof window.renderTable === 'function') {
                try { window.renderTable(); } catch(e) {}
            }
        }, 100);
    }
    
    setTimeout(attemptPopulate, 500);
}

// ======================== EVENT LISTENER UNTUK MODUL LAIN ========================
if (typeof window !== 'undefined') {
    window.addEventListener('dataReady', () => {
        console.log("📊 dataReady received, initializing rekap if needed");
        if (typeof initRekap === 'function' && !window._rekapInitialized) {
            window._rekapInitialized = true;
            initRekap();
        }
        setTimeout(() => {
            if (typeof window.populateFilters === 'function') {
                try { window.populateFilters(); } catch(e) {}
            }
            if (typeof window.populateDateFilter === 'function') {
                try { window.populateDateFilter(); } catch(e) {}
            }
            if (typeof window.populateStudentFilters === 'function') {
                try { window.populateStudentFilters(); } catch(e) {}
            }
        }, 200);
    });
}

window.addEventListener('uiReady', (e) => {
    if (e.detail.currentUser && typeof initFriendsSystem === 'function' && !window._friendsInitialized) {
        console.log("👥 uiReady received, initializing friends system");
        window._friendsInitialized = true;
        initFriendsSystem();
    }
});

window.addEventListener('uiReady', (e) => {
    if (e.detail.currentUser && typeof initChatSystem === 'function' && !window._chatInitialized) {
        console.log("💬 uiReady received, initializing chat system");
        window._chatInitialized = true;
        initChatSystem();
        setTimeout(() => {
            if (typeof renderChatInterface === 'function') {
                renderChatInterface('chatPanel');
            }
        }, 500);
    }
});

window.addEventListener('uiReady', (e) => {
    if (e.detail.currentUser && typeof initStatusSystem === 'function' && !window._statusInitialized) {
        console.log("📸 uiReady received, initializing status system");
        window._statusInitialized = true;
        initStatusSystem();
    }
});

window.addEventListener('uiReady', (e) => {
    const user = e.detail.currentUser;
    if (user && (user.role === 'admin' || user.role === 'developer') && typeof initSensorStatusListener === 'function' && !window._sensorInitialized) {
        console.log("🔍 uiReady received, initializing sensor status listener");
        window._sensorInitialized = true;
        initSensorStatusListener();
    }
});

// ======================== FUNGSI LAINNYA ========================

function setupChartYearListener() {
    const yearSelect = document.getElementById('chartYearSelect');
    if (yearSelect) {
        yearSelect.style.display = 'none';
    }
}

/**
 * UPDATE USER INTERFACE - Versi lengkap dengan update navbar user
 * Memperbaiki masalah nama user dan role yang tidak sinkron
 */
function updateUserInterface() {
    if (!currentUser) {
        console.warn("updateUserInterface: currentUser is null!");
        return;
    }
    
    console.log("🎨 updateUserInterface called for user:", currentUser.nama, "Role:", currentUser.role);
    
    // ========== UPDATE USER PROFILE DISPLAY (Header) ==========
    const userProfileDisplay = document.getElementById('userProfileDisplay');
    if (userProfileDisplay) {
        userProfileDisplay.textContent = currentUser.nama || currentUser.email || 'User';
        console.log("✅ userProfileDisplay updated to:", userProfileDisplay.textContent);
    }
    
    // ========== UPDATE EMAIL DI MODAL PROFIL ==========
    const profileEmail = document.getElementById('profileEmail');
    if (profileEmail) {
        profileEmail.textContent = currentUser.email || '';
    }
    
    // ========== UPDATE ROLE DISPLAY DI HEADER ==========
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    if (userRoleDisplay) {
        let roleText = '';
        let roleIcon = '';
        
        switch(currentUser.role) {
            case 'developer':
                roleText = 'DEVELOPER';
                roleIcon = '👨‍💻';
                break;
            case 'admin':
                roleText = 'ADMIN';
                roleIcon = '👑';
                break;
            case 'guru':
                roleText = 'GURU';
                roleIcon = '👨‍🏫';
                break;
            default:
                roleText = 'SISWA';
                roleIcon = '👨‍🎓';
                break;
        }
        
        userRoleDisplay.textContent = `${roleIcon} ${roleText}`;
        userRoleDisplay.className = `role-badge role-${currentUser.role}`;
        console.log("✅ userRoleDisplay updated to:", roleText);
    }
    
    // ========== UPDATE NAVBAR USER (PENTING UNTUK MENU DROPDOWN) ==========
    const navbarUserName = document.getElementById('navbarUserName');
    if (navbarUserName) {
        navbarUserName.textContent = currentUser.nama || currentUser.email || 'User';
        console.log("✅ navbarUserName updated to:", navbarUserName.textContent);
    }
    
    const navbarUserRole = document.getElementById('navbarUserRole');
    if (navbarUserRole) {
        let roleText = '';
        switch(currentUser.role) {
            case 'developer': roleText = 'DEVELOPER'; break;
            case 'admin': roleText = 'ADMIN'; break;
            case 'guru': roleText = 'GURU'; break;
            default: roleText = 'SISWA';
        }
        navbarUserRole.textContent = roleText;
        console.log("✅ navbarUserRole updated to:", roleText);
    }
    
    // ========== UPDATE CLASS DISPLAY ==========
    const userClassDisplay = document.getElementById('userClassDisplay');
    if (userClassDisplay) {
        if (currentUser.role === 'siswa' && currentUser.kelas) {
            const classIcon = getClassIconForHeader(currentUser.kelas);
            userClassDisplay.innerHTML = `${classIcon} ${currentUser.kelas}`;
            userClassDisplay.style.display = 'inline-flex';
        } else if (currentUser.role === 'guru' && currentUser.subject) {
            userClassDisplay.innerHTML = `📖 ${currentUser.subject}`;
            userClassDisplay.style.display = 'inline-flex';
        } else {
            userClassDisplay.style.display = 'none';
        }
    }
    
    // ========== UPDATE NAVBAR AVATAR ==========
    const navbarAvatar = document.getElementById('navbarAvatar');
    if (navbarAvatar) {
        const photoUrl = currentUser.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.nama || 'User')}&background=00bcd4&color=fff&size=100`;
        navbarAvatar.src = photoUrl;
        console.log("✅ navbarAvatar updated");
    }
    
    // Refresh semua avatar
    refreshAllAvatars();
    
    // Update sidebar user info juga
    if (typeof updateSidebarUserInfo === 'function') {
        updateSidebarUserInfo();
    }
}

function initManualDelayListeners() {
    console.log("🔧 initManualDelayListeners dipanggil");
    const delayMinutesInput = document.getElementById('delayMinutesValue');
    const delayHoursSelect = document.getElementById('delayHoursValue');
    const delayUnitSelect = document.getElementById('delayUnit');
    
    if (delayMinutesInput) {
        delayMinutesInput.removeEventListener('input', updateDelayFromMinutes);
        delayMinutesInput.addEventListener('input', updateDelayFromMinutes);
    }
    if (delayHoursSelect) {
        delayHoursSelect.removeEventListener('change', updateDelayFromHours);
        delayHoursSelect.addEventListener('change', updateDelayFromHours);
    }
    if (delayUnitSelect) {
        delayUnitSelect.removeEventListener('change', toggleDelayInput);
        delayUnitSelect.addEventListener('change', toggleDelayInput);
    }
    setTimeout(() => {
        if (typeof toggleDelayInput === 'function') toggleDelayInput();
    }, 100);
}

function initSystemConfigManual() {
    console.log("🔧 initSystemConfigManual dipanggil");
    if (typeof db !== 'undefined' && db) {
        db.ref('system_config/schoolName').on('value', snapshot => {
            const name = snapshot.val();
            const display = name || 'Sistem Absensi';
            const headerTitle = document.getElementById('schoolNameDisplay');
            if (headerTitle) headerTitle.textContent = display;
            const inputField = document.getElementById('inputSchoolName');
            if (inputField) inputField.value = name || '';
        });
    } else {
        console.warn("Firebase db not available for system config");
        const headerTitle = document.getElementById('schoolNameDisplay');
        if (headerTitle) headerTitle.textContent = 'Sistem Absensi';
    }
}

function formatDelayText(delayMinutes) {
    if (!delayMinutes && delayMinutes !== 0) return '-';
    const hours = Math.floor(delayMinutes / 60);
    const minutes = delayMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours} jam ${minutes} menit`;
    if (hours > 0) return `${hours} jam`;
    return `${minutes} menit`;
}

// ======================== LOGO SEKOLAH (SUPABASE INTEGRATION) ========================
function loadSchoolLogo() {
    if (typeof db === 'undefined' || !db) {
        console.warn("Firebase db not available for loading logo");
        return;
    }
    const headerLogo = document.getElementById('headerSchoolLogo');
    const previewLogo = document.getElementById('schoolLogoPreview');
    const btnRemove = document.getElementById('btnRemoveLogo');
    const defaultIcon = 'https://ui-avatars.com/api/?name=S&background=00bcd4&color=fff&size=80';
    
    db.ref('system_config/schoolLogo').on('value', (snapshot) => {
        const logoUrl = snapshot.val();
        
        if (logoUrl && logoUrl !== '' && logoUrl !== 'null' && logoUrl !== 'undefined') {
            const testImg = new Image();
            testImg.onload = () => {
                if (headerLogo) {
                    headerLogo.src = logoUrl;
                    headerLogo.style.display = 'block';
                    headerLogo.classList.remove('skeleton');
                }
                if (previewLogo) {
                    previewLogo.src = logoUrl;
                    previewLogo.classList.remove('skeleton');
                }
                if (btnRemove && currentUser && (currentUser.role === 'admin' || currentUser.role === 'developer')) {
                    btnRemove.style.display = 'inline-block';
                }
                console.log("🏫 Logo sekolah loaded:", logoUrl);
            };
            testImg.onerror = () => {
                console.warn("Logo URL tidak valid atau gagal dimuat:", logoUrl);
                if (headerLogo) {
                    headerLogo.src = defaultIcon;
                    headerLogo.style.display = 'block';
                }
                if (previewLogo) previewLogo.src = defaultIcon;
                if (btnRemove) btnRemove.style.display = 'none';
            };
            testImg.src = logoUrl;
        } else {
            if (headerLogo) {
                headerLogo.src = defaultIcon;
                headerLogo.style.display = 'block';
            }
            if (previewLogo) previewLogo.src = defaultIcon;
            if (btnRemove) btnRemove.style.display = 'none';
        }
    });
}

async function uploadSchoolLogo(input) {
    if (!currentUser) {
        showToast('Anda harus login!', 'error');
        return;
    }
    if (currentUser.role !== 'admin' && currentUser.role !== 'developer') {
        showToast('⛔ Hanya Admin atau Developer yang dapat mengubah logo sekolah!', 'error');
        return;
    }
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    if (!file.type.match('image.*')) {
        showToast('❌ Hanya file gambar yang diperbolehkan!', 'error');
        input.value = '';
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast('❌ Ukuran gambar maksimal 2MB!', 'error');
        input.value = '';
        return;
    }
    
    const previewImg = document.getElementById('schoolLogoPreview');
    const headerImg = document.getElementById('headerSchoolLogo');
    
    if (previewImg) {
        previewImg.classList.add('skeleton');
        previewImg.style.opacity = '0.5';
    }
    if (headerImg) headerImg.classList.add('skeleton');
    showToast('📤 Mengunggah logo sekolah ke Supabase...', 'neutral');
    
    try {
        if (typeof uploadWithFallback === 'undefined') {
            throw new Error('Fungsi uploadWithFallback tidak tersedia. Pastikan supabase-config.js sudah dimuat.');
        }
        
        const result = await uploadWithFallback(file, 'school');
        
        if (typeof deleteOldSchoolLogo === 'function') {
            await deleteOldSchoolLogo(result.url);
        } else {
            console.warn('deleteOldSchoolLogo function not available, skipping old logo deletion');
        }
        
        await db.ref('system_config/schoolLogo').set(result.url);
        
        if (previewImg) {
            previewImg.src = result.url;
            previewImg.classList.remove('skeleton');
            previewImg.style.opacity = '1';
        }
        if (headerImg) {
            headerImg.src = result.url;
            headerImg.classList.remove('skeleton');
            headerImg.style.display = 'block';
        }
        
        const btnRemove = document.getElementById('btnRemoveLogo');
        if (btnRemove) btnRemove.style.display = 'inline-block';
        
        const fallbackMsg = result.isFallback ? ' (via ImgBB fallback)' : '';
        showToast(`✅ Logo sekolah berhasil diperbarui!${fallbackMsg}`, 'success');
        
        if (typeof logActivity === 'function') {
            logActivity('upload_school_logo', `Upload logo sekolah${result.isFallback ? ' (fallback ImgBB)' : ' (Supabase)'}`);
        }
        
        if (result.isFallback) {
            console.warn('Supabase gagal, menggunakan ImgBB sebagai fallback');
            setTimeout(() => {
                showToast('ℹ️ Catatan: Logo disimpan via ImgBB (fallback)', 'info');
            }, 2000);
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showToast('❌ Gagal upload: ' + error.message, 'error');
        if (previewImg) {
            previewImg.classList.remove('skeleton');
            previewImg.style.opacity = '1';
        }
        if (headerImg) headerImg.classList.remove('skeleton');
    } finally {
        input.value = '';
    }
}

async function removeSchoolLogo() {
    if (!currentUser) {
        showToast('Anda harus login!', 'error');
        return;
    }
    if (currentUser.role !== 'admin' && currentUser.role !== 'developer') {
        showToast('⛔ Hanya Admin atau Developer yang dapat menghapus logo sekolah!', 'error');
        return;
    }
    if (!confirm('⚠️ Yakin ingin menghapus logo sekolah?\n\nLogo akan kembali ke default.')) return;
    
    const btn = document.getElementById('btnRemoveLogo');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Menghapus...';
    }
    
    try {
        const snapshot = await db.ref('system_config/schoolLogo').once('value');
        const oldLogoUrl = snapshot.val();
        
        await db.ref('system_config/schoolLogo').remove();
        
        if (oldLogoUrl && oldLogoUrl.includes(SUPABASE_URL) && typeof deleteFromSupabase === 'function') {
            await deleteFromSupabase(oldLogoUrl);
            console.log("✅ Logo sekolah dihapus dari Supabase");
        }
        
        showToast('✅ Logo sekolah berhasil dihapus', 'success');
        
        if (typeof logActivity === 'function') {
            logActivity('remove_school_logo', 'Menghapus logo sekolah');
        }
        
        const defaultIcon = 'https://ui-avatars.com/api/?name=S&background=00bcd4&color=fff&size=80';
        const previewImg = document.getElementById('schoolLogoPreview');
        const headerImg = document.getElementById('headerSchoolLogo');
        if (previewImg) previewImg.src = defaultIcon;
        if (headerImg) headerImg.src = defaultIcon;
        if (btn) btn.style.display = 'none';
        
    } catch (err) {
        console.error('Remove logo error:', err);
        showToast('❌ Gagal menghapus logo: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🗑️ Hapus Logo';
        }
    }
}

function updateSchoolLogoUI() {
    const logoSettingGroup = document.getElementById('logoSettingGroup');
    if (logoSettingGroup && currentUser) {
        const uploadHint = logoSettingGroup.querySelector('.logo-upload-hint');
        const removeBtn = document.getElementById('btnRemoveLogo');
        const previewWrapper = logoSettingGroup.querySelector('.logo-preview-wrapper');
        const isAdminOrDev = (currentUser.role === 'admin' || currentUser.role === 'developer');
        if (!isAdminOrDev) {
            if (uploadHint) uploadHint.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'none';
            if (previewWrapper) {
                previewWrapper.style.cursor = 'default';
                previewWrapper.removeAttribute('onclick');
            }
        } else {
            if (uploadHint) uploadHint.style.display = 'block';
            if (previewWrapper) {
                previewWrapper.style.cursor = 'pointer';
                previewWrapper.setAttribute('onclick', "document.getElementById('logoFileInput').click()");
            }
            db.ref('system_config/schoolLogo').once('value', (snapshot) => {
                if (removeBtn) {
                    if (snapshot.val()) removeBtn.style.display = 'inline-block';
                    else removeBtn.style.display = 'none';
                }
            });
        }
    }
}

// ======================== FRIENDS & CHAT UI ========================
function toggleFriendsModal() {
    const modal = document.getElementById('modal-friends');
    if (modal) {
        modal.classList.add('open');
        if (typeof renderFriendsPanel === 'function') renderFriendsPanel();
        else console.warn("renderFriendsPanel not found");
    }
}

function openChatModal() {
    const modal = document.getElementById('modal-chat');
    if (modal) {
        modal.classList.add('open');
        if (typeof renderChatInterface === 'function') renderChatInterface();
        else console.warn("renderChatInterface not found");
    }
}

// ======================== ROLE PERMISSIONS ========================
function applyRolePermissions() {
    if (!currentUser) return;
    const role = currentUser.role;
    console.log("🎭 Apply role permissions untuk role:", role);
    
    const isAdminOrDev = (role === 'admin' || role === 'developer');
    const isGuruOrDev = (role === 'admin' || role === 'guru' || role === 'developer');
    
    // ========== UNTUK ELEMEN DENGAN CLASS role-admin ==========
    document.querySelectorAll('.role-admin').forEach(el => {
        if (isAdminOrDev) {
            el.style.display = '';
            el.style.visibility = 'visible';
            el.style.opacity = '1';
        } else {
            el.style.display = 'none';
        }
    });
    
    // ========== UNTUK ELEMEN DENGAN CLASS role-guru ==========
    document.querySelectorAll('.role-guru').forEach(el => {
        if (isGuruOrDev) {
            el.style.display = '';
            el.style.visibility = 'visible';
            el.style.opacity = '1';
        } else {
            el.style.display = 'none';
        }
    });
    
    // ========== BUTTON PENGUMUMAN ==========
    const btnAnnouncement = document.querySelector('.btn-announcement');
    if (btnAnnouncement) {
        btnAnnouncement.style.display = isGuruOrDev ? 'inline-flex' : 'none';
    }
    
    // ========== FLOATING BUTTONS ==========
    const floatingChatBtn = document.getElementById('floatingChatBtn');
    if (floatingChatBtn) {
        floatingChatBtn.style.display = 'flex';
    }
    
    const floatingFriendsBtn = document.getElementById('floatingFriendsBtn');
    if (floatingFriendsBtn) {
        floatingFriendsBtn.style.display = 'flex';
    }
    
    const floatingStatusBtn = document.getElementById('floatingStatusBtn');
    if (floatingStatusBtn) {
        floatingStatusBtn.style.display = 'flex';
    }
    
    const floatingAnnouncementBtn = document.getElementById('floatingAnnouncementBtn');
    if (floatingAnnouncementBtn) {
        floatingAnnouncementBtn.style.display = isGuruOrDev ? 'flex' : 'none';
    }
    
    // ========== NAV TABS (DESKTOP) ==========
    const navTabs = document.getElementById('nav-tabs-container');
    if (navTabs) {
        const allTabBtns = document.querySelectorAll('.tab-btn');
        
        if (role === 'siswa') {
            allTabBtns.forEach(btn => {
                const btnText = btn.textContent || '';
                if (btnText.includes('Pengaturan') || 
                    btnText.includes('Config') || 
                    btnText.includes('Manajemen User') ||
                    btnText.includes('Log Aktivitas')) {
                    btn.style.display = 'none';
                } else {
                    btn.style.display = '';
                }
            });
        } else {
            allTabBtns.forEach(btn => {
                const hasRoleDeveloper = btn.classList.contains('role-developer');
                const hasRoleAdmin = btn.classList.contains('role-admin');
                const hasRoleGuru = btn.classList.contains('role-guru');
                
                let shouldShow = true;
                
                if (hasRoleDeveloper && role !== 'developer') {
                    shouldShow = false;
                }
                else if (hasRoleAdmin && !isAdminOrDev) {
                    shouldShow = false;
                }
                else if (hasRoleGuru && !isGuruOrDev) {
                    shouldShow = false;
                }
                
                btn.style.display = shouldShow ? '' : 'none';
            });
        }
    }
    
    // ========== FORCE SHOW UNTUK CONFIG DAN LOGS DI DESKTOP ==========
    setTimeout(() => {
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
            const configBtn = document.querySelector('.tab-btn[onclick*="switchTab(\'config\')"]');
            if (configBtn) {
                configBtn.style.display = '';
                configBtn.style.visibility = 'visible';
                configBtn.style.opacity = '1';
                console.log("✅ Config button force shown");
            }
            
            const logsBtn = document.querySelector('.tab-btn[onclick*="switchTab(\'logs\')"]');
            if (logsBtn) {
                logsBtn.style.display = '';
                logsBtn.style.visibility = 'visible';
                logsBtn.style.opacity = '1';
                console.log("✅ Logs button force shown");
            }
        }
    }, 200);
    
    if (typeof applySidebarRolePermissions === 'function') {
        applySidebarRolePermissions();
    }
    
    updateSchoolLogoUI();
    updateUserInterface();
}

function updateClock() {
    const clockEl = document.getElementById('clock');
    if (clockEl) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID');
        const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        clockEl.innerHTML = `${timeStr}<br><small>${dateStr}</small>`;
    }
}

// ======================== SWITCH TAB (DIPERBAIKI UNTUK CHAT) ========================
function switchTab(tabId) {
    console.log("📑 Switching to tab:", tabId);
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) targetTab.classList.add('active');
    else console.warn(`Tab content #tab-${tabId} not found`);
    const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
    if (activeBtn) activeBtn.classList.add('active');
    
    updateSidebarActiveState();
    updateMobileNavTitle(tabId);
    
    setTimeout(() => {
        if (tabId === 'dashboard') {
            renderDashboard();
        } else if (tabId === 'attendance' && typeof renderTable === 'function') {
            if (typeof window.populateFilters === 'function') {
                try { window.populateFilters(); } catch(e) {}
            }
            if (typeof window.populateDateFilter === 'function') {
                try { window.populateDateFilter(); } catch(e) {}
            }
            renderTable();
        } else if (tabId === 'students' && typeof renderStudentsTable === 'function') {
            if (typeof window.populateStudentFilters === 'function') {
                try { window.populateStudentFilters(); } catch(e) {}
            }
            renderStudentsTable();
        } else if (tabId === 'users' && typeof renderUsersTable === 'function') {
            renderUsersTable();
        } else if (tabId === 'rekap' && typeof loadRekap === 'function') {
            loadRekap();
        } else if (tabId === 'friends') {
            if (typeof loadFriendRequests === 'function') loadFriendRequests();
            if (typeof loadFriendsList === 'function') loadFriendsList();
        } else if (tabId === 'chat') {
            // ========== PERBAIKAN UNTUK CHAT ==========
            console.log("💬 Switching to chat tab, calling forceRenderChat...");
            // Bersihkan container terlebih dahulu
            const chatPanel = document.getElementById('chatPanel');
            if (chatPanel) {
                chatPanel.innerHTML = '<div class="chat-loading" style="text-align: center; padding: 40px; color: var(--text-muted);">⏳ Memuat fitur chat...</div>';
            }
            // Panggil forceRenderChat untuk memastikan chat tampil
            forceRenderChat();
        } else if (tabId === 'logs') {
            if (typeof initLogsSystem === 'function') {
                initLogsSystem();
            } else {
                console.warn("initLogsSystem not available yet");
            }
            if (typeof renderLogsTable === 'function') {
                renderLogsTable();
            } else {
                console.warn("renderLogsTable not available yet, will retry...");
                setTimeout(() => {
                    if (typeof renderLogsTable === 'function') {
                        renderLogsTable();
                    }
                }, 500);
            }
        } else if (tabId === 'config') {
            if (typeof initAllSettings === 'function') {
                initAllSettings();
            }
            if (typeof renderClassesList === 'function') {
                renderClassesList();
            }
            if (typeof renderMajorsList === 'function') {
                renderMajorsList();
            }
        }
    }, 50);
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) { console.warn("Toast element not found, message:", msg); return; }
    toast.textContent = msg;
    toast.style.borderLeftColor = type === 'error' ? 'var(--danger)' : type === 'warning' ? 'var(--warning)' : 'var(--primary)';
    toast.style.backgroundColor = type === 'error' ? 'rgba(244, 67, 54, 0.1)' : type === 'warning' ? 'rgba(255, 152, 0, 0.1)' : 'rgba(76, 175, 80, 0.1)';
    toast.className = 'toast show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}

// ======================== DASHBOARD MODERN FUNCTIONS ========================

function debugAttendanceData() {
    console.log("========== DEBUG DATA ABSENSI ==========");
    console.log("dbData:", dbData);
    console.log("dbData.attendance:", dbData.attendance);
    if (dbData.attendance && dbData.attendance.length > 0) {
        console.log("Jumlah data absensi:", dbData.attendance.length);
        console.log("Sample data pertama:", dbData.attendance[0]);
        const byMonth = {};
        const availableYears = [];
        dbData.attendance.forEach(rec => {
            if (rec.date) {
                const date = new Date(rec.date);
                const year = date.getFullYear();
                const monthYear = `${year}-${date.getMonth()+1}`;
                if (!availableYears.includes(year)) availableYears.push(year);
                if (!byMonth[monthYear]) byMonth[monthYear] = { hadir: 0, izin: 0, alpha: 0 };
                const status = rec.status || (rec.timeOut ? 'Pulang' : (rec.timeIn ? 'Hadir' : 'Unknown'));
                if (status === 'Hadir' || status === 'Pulang') byMonth[monthYear].hadir++;
                else if (status === 'Izin' || status === 'Sakit') byMonth[monthYear].izin++;
                else if (status === 'Alpha') byMonth[monthYear].alpha++;
            }
        });
        console.log("Data per bulan:", byMonth);
        console.log("Tahun yang tersedia di data:", availableYears);
    } else {
        console.warn("TIDAK ADA DATA ABSENSI!");
    }
    console.log("========================================");
}

function updateYearDropdownOptions() {
    const yearSelect = document.getElementById('chartYearSelect');
    if (yearSelect) yearSelect.style.display = 'none';
}

function renderDashboard() {
    console.log("📊 Rendering modern dashboard...");
    if (!dbData || !dbData.attendance) {
        console.log("⏳ Data absensi belum siap, schedule ulang renderDashboard...");
        setTimeout(() => renderDashboard(), 500);
        return;
    }
    if (dbData.attendance.length === 0) {
        console.warn("⚠️ Belum ada data absensi");
        const kehadiranElem = document.getElementById('statKehadiranBulan');
        if (kehadiranElem) kehadiranElem.innerText = '0';
        const transaksiElem = document.getElementById('statTotalTransaksi');
        if (transaksiElem) transaksiElem.innerText = '0';
        const totalSiswaElem = document.getElementById('statTotalSiswa');
        if (totalSiswaElem && dbData.users) totalSiswaElem.innerText = dbData.users.length;
        const totalUsersElem = document.getElementById('statTotalUsers');
        if (totalUsersElem && dbData.users_auth) totalUsersElem.innerText = dbData.users_auth.length;
        setTimeout(() => updateDashboardChart(), 100);
        renderRecentActivities();
        renderDashboardTasks();
        return;
    }
    debugAttendanceData();
    updateYearDropdownOptions();
    
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthAttendance = dbData.attendance.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d >= startMonth && d <= endMonth;
    });
    const totalHadirBulan = monthAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    console.log(`📊 Bulan ini: ${totalHadirBulan} kehadiran dari ${monthAttendance.length} transaksi`);
    const kehadiranElem = document.getElementById('statKehadiranBulan');
    if (kehadiranElem) kehadiranElem.innerText = totalHadirBulan;
    
    const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthAttendance = dbData.attendance.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d >= startLastMonth && d <= endLastMonth;
    });
    const lastHadir = lastMonthAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    let trend = totalHadirBulan - lastHadir;
    let trendText = trend >= 0 ? `+${trend}` : `${trend}`;
    let trendClass = trend >= 0 ? 'positive' : 'negative';
    const trendElem = document.getElementById('statTrendKehadiran');
    if (trendElem) {
        trendElem.innerHTML = `${trendText}%`;
        trendElem.className = `stat-change ${trendClass}`;
    }
    
    const transaksiElem = document.getElementById('statTotalTransaksi');
    if (transaksiElem) transaksiElem.innerText = monthAttendance.length;
    const totalSiswaElem = document.getElementById('statTotalSiswa');
    if (totalSiswaElem && dbData.users) totalSiswaElem.innerText = dbData.users.length;
    const totalUsersElem = document.getElementById('statTotalUsers');
    if (totalUsersElem && dbData.users_auth) totalUsersElem.innerText = dbData.users_auth.length;
    
    setTimeout(() => updateDashboardChart(), 100);
    renderRecentActivities();
    renderDashboardTasks();
    console.log("✅ Dashboard rendered successfully");
}

function updateDashboardChart() {
    if (dashboardChartRetryTimeout) {
        clearTimeout(dashboardChartRetryTimeout);
        dashboardChartRetryTimeout = null;
    }

    let canvas = document.getElementById('weeklyBarChart');
    if (!canvas) canvas = document.getElementById('dashboardBarChart');
    if (!canvas) {
        console.warn("⚠️ Canvas chart tidak ditemukan, coba lagi nanti...");
        dashboardChartRetryTimeout = setTimeout(() => updateDashboardChart(), 500);
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!dbData || !dbData.attendance) {
        console.log("⏳ Data absensi belum siap untuk chart, retry...");
        dashboardChartRetryTimeout = setTimeout(() => updateDashboardChart(), 500);
        return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const weeks = [[], [], [], [], []];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const weekIndex = Math.floor((d - 1) / 7);
        if (weekIndex < 5) weeks[weekIndex].push(d);
    }
    while (weeks.length > 0 && weeks[weeks.length-1].length === 0) weeks.pop();

    const weeklyHadir = new Array(weeks.length).fill(0);
    const weeklyIzin = new Array(weeks.length).fill(0);
    const weeklyAlpha = new Array(weeks.length).fill(0);

    const monthAttendance = dbData.attendance.filter(rec => {
        if (!rec.date) return false;
        const d = new Date(rec.date);
        return d.getFullYear() === year && d.getMonth() === month;
    });

    monthAttendance.forEach(rec => {
        const day = new Date(rec.date).getDate();
        let weekIdx = Math.floor((day - 1) / 7);
        if (weekIdx >= weeks.length) weekIdx = weeks.length - 1;
        if (weekIdx < 0) weekIdx = 0;

        let status = rec.status || '';
        if (status === 'Hadir' || status === 'Pulang') {
            weeklyHadir[weekIdx]++;
        } else if (status === 'Izin' || status === 'Sakit') {
            weeklyIzin[weekIdx]++;
        } else if (status === 'Alpha') {
            weeklyAlpha[weekIdx]++;
        } else if (rec.timeIn) {
            weeklyHadir[weekIdx]++;
        }
    });

    const weekLabels = weeks.map((days, idx) => {
        if (days.length === 0) return `Minggu ${idx+1}`;
        const start = days[0];
        const end = days[days.length-1];
        return `${start}-${end}`;
    });

    if (dashboardChart) {
        try { dashboardChart.destroy(); } catch(e) {}
        dashboardChart = null;
    }

    try {
        dashboardChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weekLabels,
                datasets: [
                    { label: 'Hadir', data: weeklyHadir, backgroundColor: '#00bcd4', borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.8 },
                    { label: 'Izin/Sakit', data: weeklyIzin, backgroundColor: '#ff9800', borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.8 },
                    { label: 'Alpha', data: weeklyAlpha, backgroundColor: '#f44336', borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.8 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: '#ccc', font: { size: 11 } } },
                    tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} kali` } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#333' }, ticks: { color: '#ccc', stepSize: 1 } },
                    x: { ticks: { color: '#ccc', autoSkip: true } }
                }
            }
        });
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        console.log(`✅ Dashboard chart berhasil di-update untuk ${monthNames[month]} ${year}`);
    } catch (err) {
        console.error("❌ Gagal membuat chart:", err);
    }
}

function renderRecentActivities() {
    const container = document.getElementById('recentActivitiesList');
    if (!container) return;
    const recent = dbData.attendance ? [...dbData.attendance].slice(0, 5) : [];
    if (recent.length === 0) {
        container.innerHTML = '<div class="activity-item"><div class="activity-detail">Belum ada aktivitas</div></div>';
        return;
    }
    let html = '';
    recent.forEach(act => {
        const avatar = act.status === 'Hadir' ? '✅' : (act.status === 'Pulang' ? '🏠' : '📝');
        const name = act.nama || 'Siswa';
        const desc = act.status === 'Hadir' ? `Masuk ${act.timeIn || ''}` : (act.status === 'Pulang' ? `Pulang ${act.timeOut || ''}` : act.status);
        const time = act.date;
        html += `
            <div class="activity-item">
                <div class="activity-avatar">${avatar}</div>
                <div class="activity-detail">
                    <div class="activity-name">${escapeHtmlString(name)}</div>
                    <div class="activity-desc">${desc}</div>
                    <div class="activity-time">${time}</div>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderDashboardTasks() {
    const container = document.getElementById('dashboardTasksList');
    if (!container) return;
    db.ref('announcements/active').once('value', (snapshot) => {
        const data = snapshot.val();
        let tasksHtml = '';
        if (data) {
            const announcements = Object.values(data).slice(0, 3);
            announcements.forEach(ann => {
                tasksHtml += `
                    <div class="task-item">
                        <div class="task-check"></div>
                        <div class="task-info">
                            <div class="task-title">${escapeHtmlString(ann.title)}</div>
                            <div class="task-meta">${ann.priority === 'high' ? '⚠️ Penting' : '📢 Pengumuman'}</div>
                        </div>
                    </div>
                `;
            });
        }
        if (!tasksHtml) tasksHtml = '<div class="task-item">Tidak ada pengumuman aktif</div>';
        container.innerHTML = tasksHtml;
    }).catch(() => {
        container.innerHTML = '<div class="task-item">Gagal memuat pengumuman</div>';
    });
}

// ======================== PROFIL & MODALS ========================
function openProfileModal() {
    const modal = document.getElementById('modal-profile');
    if (!modal) return;
    modal.classList.add('open');
    if (!currentUser) return;
    const profileImg = document.getElementById('profileImg');
    if (profileImg) {
        profileImg.src = currentUser.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.nama || 'User')}&background=random`;
    }
    const profileNameInput = document.getElementById('profileNameInput');
    if (profileNameInput) profileNameInput.value = currentUser.nama || '';
    const profileEmail = document.getElementById('profileEmail');
    if (profileEmail) profileEmail.textContent = currentUser.email || '';
    const profileKelas = document.getElementById('profileKelas');
    if (profileKelas) profileKelas.value = currentUser.kelas || '';
    const profileJurusan = document.getElementById('profileJurusan');
    if (profileJurusan) profileJurusan.value = currentUser.jurusan || '';
    const profileSubject = document.getElementById('profileSubject');
    if (profileSubject) profileSubject.value = currentUser.subject || '';

    const nameInput = document.getElementById('profileNameInput');
    const kelasInput = document.getElementById('profileKelas');
    const jurusanInput = document.getElementById('profileJurusan');
    const subjectGroup = document.getElementById('group-subject');
    const saveBtn = document.querySelector('#modal-profile .btn-save');
    let delayGroup = document.getElementById('group-profile-delay');
    if (!delayGroup) {
        const jurusanDiv = document.getElementById('profileJurusan')?.parentElement;
        if (jurusanDiv && currentUser.role === 'siswa') {
            const newDelayGroup = document.createElement('div');
            newDelayGroup.className = 'form-group';
            newDelayGroup.id = 'group-profile-delay';
            newDelayGroup.innerHTML = `<label>⏰ Delay Pulang</label><input type="text" id="profileDelay" placeholder="60 menit" readonly style="background:#2c2c2c; color:#4a90e2; font-weight:bold;"><small class="text-small">*Waktu minimal untuk absen pulang</small>`;
            jurusanDiv.insertAdjacentElement('afterend', newDelayGroup);
            delayGroup = newDelayGroup;
        }
    }
    if (currentUser.role === 'siswa') {
        if (nameInput) { nameInput.readOnly = true; nameInput.style.cssText = 'border:none;background:transparent;color:#888'; }
        if (kelasInput) { kelasInput.readOnly = true; kelasInput.style.cssText = 'border:none;background:transparent'; }
        if (jurusanInput) { jurusanInput.readOnly = true; jurusanInput.style.cssText = 'border:none;background:transparent'; }
        if (subjectGroup) subjectGroup.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
        if (delayGroup) delayGroup.style.display = 'block';
        updateProfileDelayDisplay();
    } else {
        if (nameInput) { nameInput.readOnly = false; nameInput.style.cssText = 'border:1px solid var(--border);background:#2c2c2c;color:#fff'; }
        if (kelasInput) { kelasInput.readOnly = false; kelasInput.style.cssText = 'border:1px solid var(--border);background:#2c2c2c'; }
        if (jurusanInput) { jurusanInput.readOnly = false; jurusanInput.style.cssText = 'border:1px solid var(--border);background:#2c2c2c'; }
        if (subjectGroup) subjectGroup.style.display = 'block';
        if (saveBtn) saveBtn.style.display = 'block';
        if (delayGroup) delayGroup.style.display = 'none';
    }
}

function openForgotPasswordModal() {
    const modal = document.getElementById('modal-forgot');
    if (modal) {
        modal.classList.add('open');
        const emailInput = document.getElementById('forgotEmail');
        if (emailInput) emailInput.value = '';
        emailInput?.focus();
    }
}

function openChangePasswordModal() {
    const modal = document.getElementById('modal-change-pass');
    if (modal) {
        modal.classList.add('open');
        const oldPass = document.getElementById('cpOld');
        const newPass = document.getElementById('cpNew');
        const confirmPass = document.getElementById('cpConfirm');
        if (oldPass) oldPass.value = '';
        if (newPass) newPass.value = '';
        if (confirmPass) confirmPass.value = '';
        oldPass?.focus();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
}

// ======================== UPDATE PROFIL (DENGAN LOG) ========================
function handleUpdateProfileInfo() {
    if (!currentUser) { showToast('Anda harus login terlebih dahulu!', 'error'); return; }
    if (currentUser.role === 'siswa') { showToast('Siswa tidak dapat mengubah data profil. Hubungi Admin/Guru.', 'error'); return; }
    const newNama = document.getElementById('profileNameInput').value.trim();
    const newKelas = document.getElementById('profileKelas').value.toUpperCase();
    const newJurusan = document.getElementById('profileJurusan').value;
    const newSubject = document.getElementById('profileSubject').value;
    if (!newNama) { showToast('Nama wajib diisi!', 'error'); return; }
    const btn = document.querySelector('#modal-profile .btn-save');
    if (!btn) return;
    const originalText = btn.innerText;
    btn.innerText = '💾 Menyimpan...';
    btn.disabled = true;
    
    const oldNama = currentUser.nama;
    const oldKelas = currentUser.kelas;
    const oldJurusan = currentUser.jurusan;
    const oldSubject = currentUser.subject;
    
    const updateData = { nama: newNama, kelas: newKelas, jurusan: newJurusan, subject: newSubject };
    db.ref(`users_auth/${currentUser.uid}`).update(updateData)
        .then(() => {
            currentUser.nama = newNama;
            currentUser.kelas = newKelas;
            currentUser.jurusan = newJurusan;
            currentUser.subject = newSubject;
            if (typeof saveUserToLocalStorage === 'function') saveUserToLocalStorage(currentUser);
            showToast('✅ Profil berhasil diperbarui');
            
            if (typeof logActivity === 'function') {
                let changes = [];
                if (oldNama !== newNama) changes.push(`nama: ${oldNama} → ${newNama}`);
                if (oldKelas !== newKelas) changes.push(`kelas: ${oldKelas} → ${newKelas}`);
                if (oldJurusan !== newJurusan) changes.push(`jurusan: ${oldJurusan} → ${newJurusan}`);
                if (oldSubject !== newSubject) changes.push(`subject: ${oldSubject} → ${newSubject}`);
                if (changes.length) {
                    logActivity('update_profile', `Memperbarui profil: ${changes.join(', ')}`);
                } else {
                    logActivity('update_profile', 'Memperbarui profil (tanpa perubahan data)');
                }
            }
            
            document.getElementById('userProfileDisplay').textContent = newNama;
            if (currentUser.role === 'siswa' && currentUser.fpId) {
                db.ref(`users/${currentUser.fpId}`).update({ nama: newNama, kelas: newKelas, jurusan: newJurusan });
            }
            closeModal('modal-profile');
            if (typeof window.populateFilters === 'function') {
                try { window.populateFilters(); } catch(e) {}
            }
            if (typeof renderStudentsTable === 'function') {
                try { renderStudentsTable(); } catch(e) {}
            }
            if (typeof renderUsersTable === 'function') {
                try { renderUsersTable(); } catch(e) {}
            }
        })
        .catch(err => { console.error('Update profile error:', err); showToast('❌ Gagal update: ' + err.message, 'error'); })
        .finally(() => { btn.innerText = originalText; btn.disabled = false; });
}

function handleChangePassword(e) {
    e.preventDefault();
    const newPass = document.getElementById('cpNew').value;
    const confirmPass = document.getElementById('cpConfirm').value;
    if (newPass !== confirmPass) { showToast('Password baru tidak cocok!', 'error'); return; }
    if (newPass.length < 6) { showToast('Password minimal 6 karakter!', 'error'); return; }
    const btn = document.querySelector('#modal-change-pass button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
    auth.currentUser.updatePassword(newPass)
        .then(() => { 
            showToast('✅ Password berhasil diubah'); 
            closeModal('modal-change-pass'); 
            document.getElementById('cpNew').value = ''; 
            document.getElementById('cpConfirm').value = '';
        })
        .catch(err => {
            console.error('Change password error:', err);
            if (err.code === 'auth/requires-recent-login') showToast('⚠️ Silakan logout dan login kembali untuk ubah password.', 'error');
            else if (err.code === 'auth/weak-password') showToast('Password terlalu lemah. Gunakan minimal 6 karakter.', 'error');
            else showToast('❌ Gagal: ' + err.message, 'error');
        })
        .finally(() => { if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; } });
}

// ======================== UPLOAD PROFILE PHOTO (SUPABASE) DENGAN PERBAIKAN ========================
async function uploadProfilePhoto(input) {
    if (!input.files || !input.files[0]) return;
    
    const imgEl = document.getElementById('profileImg');
    if (!imgEl) {
        showToast('Buka modal profil terlebih dahulu (klik "Profil Saya")', 'error');
        input.value = '';
        return;
    }
    
    const file = input.files[0];
    if (!file.type.match('image.*')) {
        showToast('Hanya file gambar yang diperbolehkan!', 'error');
        input.value = '';
        return;
    }
    if (file.size > 2 * 1024 * 1024) {
        showToast('Ukuran gambar maksimal 2MB!', 'error');
        input.value = '';
        return;
    }
    
    const originalSrc = imgEl.src;
    imgEl.style.opacity = '0.5';
    showToast('📤 Mengunggah ke Supabase...', 'neutral');
    
    try {
        if (typeof uploadWithFallback === 'undefined') {
            throw new Error('Fungsi uploadWithFallback tidak tersedia. Pastikan supabase-config.js sudah dimuat.');
        }
        
        const result = await uploadWithFallback(file, 'profiles', currentUser.uid);
        
        if (typeof deleteOldProfilePhoto === 'function') {
            await deleteOldProfilePhoto(currentUser.uid, result.url);
        } else {
            console.warn('deleteOldProfilePhoto function not available, skipping old photo deletion');
        }
        
        await db.ref(`users_auth/${currentUser.uid}`).update({ photoUrl: result.url });
        
        // Update currentUser object
        const oldPhotoUrl = currentUser.photoUrl;
        currentUser.photoUrl = result.url;
        
        // Simpan ke localStorage
        if (typeof saveUserToLocalStorage === 'function') {
            saveUserToLocalStorage(currentUser);
        }
        
        // ========== PERBAIKAN: Refresh semua avatar dengan force ==========
        refreshAllAvatars();
        
        // Juga update modal profile image
        imgEl.src = result.url;
        
        const fallbackMsg = result.isFallback ? ' (via ImgBB fallback)' : '';
        showToast(`✅ Foto profil berhasil diperbarui!${fallbackMsg}`, 'success');
        
        // LOG: Upload foto profil
        if (typeof logActivity === 'function') {
            logActivity('upload_profile_photo', `Upload foto profil${result.isFallback ? ' (fallback ImgBB)' : ' (Supabase)'}`);
        }
        
        // Optional: Tampilkan info jika menggunakan fallback
        if (result.isFallback) {
            console.warn('Supabase gagal, menggunakan ImgBB sebagai fallback');
            setTimeout(() => {
                showToast('ℹ️ Catatan: Gambar disimpan via ImgBB (fallback)', 'info');
            }, 2000);
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showToast('❌ Gagal upload: ' + error.message, 'error');
        imgEl.src = originalSrc;
    } finally {
        imgEl.style.opacity = '1';
        input.value = '';
    }
}

function processForgot() {
    const email = document.getElementById('forgotEmail').value.trim();
    if (!email) { showToast('Masukkan email terlebih dahulu!', 'error'); return; }
    const btn = document.querySelector('#modal-forgot .btn-save');
    if (btn) { btn.innerText = '📧 Mengirim...'; btn.disabled = true; }
    auth.sendPasswordResetEmail(email)
        .then(() => { showToast(`✅ Link reset password telah dikirim ke ${email}`); closeModal('modal-forgot'); })
        .catch(error => {
            console.error('Forgot password error:', error);
            if (error.code === 'auth/user-not-found') showToast('❌ Email tersebut belum terdaftar!', 'error');
            else if (error.code === 'auth/invalid-email') showToast('❌ Format email tidak valid!', 'error');
            else showToast('❌ Gagal mengirim: ' + error.message, 'error');
        })
        .finally(() => { if (btn) { btn.innerText = 'Kirim Link'; btn.disabled = false; } });
}

// ======================== REGISTER & GENERATE UI ========================
function toggleRegisterInput() {
    const typeRadio = document.querySelector('input[name="regRoleType"]:checked');
    if (!typeRadio) return;
    const type = typeRadio.value;
    const idGroup = document.getElementById('group-reg-id');
    const namaGroup = document.getElementById('group-reg-nama');
    const subjectGroup = document.getElementById('group-reg-subject');
    const detailsGroup = document.getElementById('group-siswa-details');
    const codeInput = document.getElementById('regCode');
    if (type === 'siswa') {
        if (idGroup) idGroup.style.display = 'block';
        if (detailsGroup) detailsGroup.style.display = 'block';
        if (namaGroup) namaGroup.style.display = 'none';
        if (subjectGroup) subjectGroup.style.display = 'none';
        if (codeInput) codeInput.placeholder = '🔑 Kode Unik (Siswa)';
        if (document.getElementById('regKelas')) document.getElementById('regKelas').required = true;
        if (document.getElementById('regJurusan')) document.getElementById('regJurusan').required = true;
    } else {
        if (idGroup) idGroup.style.display = 'none';
        if (detailsGroup) detailsGroup.style.display = 'none';
        if (namaGroup) namaGroup.style.display = 'block';
        if (subjectGroup) subjectGroup.style.display = 'block';
        if (document.getElementById('regKelas')) document.getElementById('regKelas').required = false;
        if (document.getElementById('regJurusan')) document.getElementById('regJurusan').required = false;
        if (codeInput) codeInput.placeholder = '🔑 Kode Unik (Guru)';
    }
}

function toggleGenerateInput() {
    const typeRadio = document.querySelector('input[name="genTarget"]:checked');
    if (!typeRadio) return;
    const type = typeRadio.value;
    const selectGroup = document.getElementById('group-select-siswa');
    const desc = document.getElementById('gen-desc');
    if (type === 'siswa') {
        if (selectGroup) selectGroup.style.display = 'block';
        if (desc) desc.innerText = '🔒 Kode akan dikunci ke ID Siswa terpilih.';
    } else {
        if (selectGroup) selectGroup.style.display = 'none';
        if (desc) desc.innerText = '🔓 Kode bebas digunakan oleh Guru mana saja.';
    }
}

// ======================== PENGATURAN NAMA SEKOLAH (DENGAN LOG) ========================
function saveSchoolName() {
    if (!currentUser) { showToast('Anda harus login!', 'error'); return; }
    const newSchoolName = document.getElementById('inputSchoolName').value.trim();
    if (!newSchoolName) { showToast('Nama sekolah tidak boleh kosong!', 'error'); return; }
    if (currentUser.role !== 'admin' && currentUser.role !== 'developer') {
        showToast('⛔ Hanya Admin atau Developer yang bisa mengubah nama sekolah.', 'error');
        return;
    }
    
    let oldSchoolName = '';
    const schoolNameRef = db.ref('system_config/schoolName');
    schoolNameRef.once('value').then(snapshot => {
        oldSchoolName = snapshot.val() || 'Sistem Absensi';
    }).catch(() => {});
    
    const btn = event?.target;
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
    schoolNameRef.set(newSchoolName)
        .then(() => { 
            showToast('✅ Nama sekolah berhasil diperbarui'); 
            const headerTitle = document.getElementById('schoolNameDisplay'); 
            if (headerTitle) headerTitle.textContent = newSchoolName;
            
            if (typeof logActivity === 'function') {
                logActivity('save_school_name', `Mengubah nama sekolah dari "${oldSchoolName}" menjadi "${newSchoolName}"`);
            }
        })
        .catch(err => { console.error('Save school name error:', err); showToast('❌ Gagal update: ' + err.message, 'error'); })
        .finally(() => { if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; } });
}

function initSystemConfig() {
    if (typeof db === 'undefined' || !db) { console.warn("Firebase db not available for system config"); initSystemConfigManual(); return; }
    db.ref('system_config/schoolName').on('value', snapshot => {
        const name = snapshot.val();
        const display = name || 'Sistem Absensi';
        const headerTitle = document.getElementById('schoolNameDisplay');
        if (headerTitle) headerTitle.textContent = display;
        const inputField = document.getElementById('inputSchoolName');
        if (inputField && inputField.value !== name) inputField.value = name || '';
    });
}

// ======================== RENDER TABEL USERS ========================
function renderUsersTable() {
    const tbody = document.getElementById('tbody-users');
    if (!tbody) return;
    const searchInput = document.getElementById('searchUser');
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    tbody.innerHTML = '';
    if (!dbData.users_auth || dbData.users_auth.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">📭 Tidak ada pengguna ditemukan.${search ? '<br><small>Coba kata kunci lain</small>' : ''}NonNull</div></div>`;
        return;
    }
    let data = dbData.users_auth.filter(u => u.nama && u.nama.toLowerCase().includes(search));
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px; color:#888;">🔍 Tidak ada pengguna yang cocok dengan pencarian.${search ? '<br><small>Coba kata kunci lain</small>' : ''}</div></div>`;
        return;
    }
    data.forEach(u => {
        const isMe = (currentUser && currentUser.uid === u.uid);
        const avatar = u.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nama || 'User')}&background=random&color=fff&size=32`;
        let roleHtml = '', actionsHtml = '-';
        const isDeveloper = (u.role === 'developer');
        
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'developer') && !isMe && !isDeveloper) {
            roleHtml = `<select class="form-control" onchange="updateUserRole('${u.uid}', this.value)" style="background:#2c2c2c; color:white; border:1px solid #444; padding:5px; border-radius:4px; font-size:0.8rem;">
                <option value="siswa" ${u.role === 'siswa' ? 'selected' : ''}>📚 Siswa</option>
                <option value="guru" ${u.role === 'guru' ? 'selected' : ''}>👨‍🏫 Guru</option>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Admin</option>
            </select>`;
            actionsHtml = `<button class="btn-icon delete" onclick="deleteUser('${u.uid}', '${escapeHtmlString(u.nama)}')" title="Hapus User" style="background:transparent; border:none; cursor:pointer; color:#f44336; font-size:18px;">🗑️</button>`;
        } else {
            let roleClass = 'role-siswa', roleIcon = '📚';
            if (u.role === 'admin') { roleClass = 'role-admin'; roleIcon = '👑'; }
            else if (u.role === 'guru') { roleClass = 'role-guru'; roleIcon = '👨‍🏫'; }
            else if (u.role === 'developer') { roleClass = 'role-developer'; roleIcon = '👨‍💻'; }
            roleHtml = `<span class="role-badge ${roleClass}">${roleIcon} ${u.role.toUpperCase()}</span>`;
            if (isMe) roleHtml += ` <small style="color:#4a90e2;">(Anda)</small>`;
        }
        let detailText = '';
        if (u.role === 'siswa') detailText = `${u.kelas || '-'} / ${u.jurusan || '-'}`;
        else if (u.role === 'guru') detailText = u.subject || '-';
        else if (u.role === 'developer') detailText = 'Developer (Paten)';
        else detailText = '-';
        tbody.innerHTML += `<tr>
            <td style="text-align:center;"><img src="${avatar}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;"></div>
            <td><strong>${escapeHtmlString(u.nama)}</strong>${isMe ? '<br><small style="color:#4a90e2;">Akun Anda</small>' : ''}</div>
            <td style="color:#aaa; font-size:0.9rem;">${u.email || '-'}</div>
            <td>${roleHtml}</div>
            <td style="color:#888; font-size:0.85rem;">${escapeHtmlString(detailText)}</div></div>
            <td style="text-align:center;">${actionsHtml}</div></div>
        `;
    });
    console.log(`📊 renderUsersTable: ${data.length} users displayed`);
}

function escapeHtmlString(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================== FUNGSI DELAY UNTUK PROFIL ========================
function updateProfileDelayDisplay() {
    if (!currentUser || currentUser.role !== 'siswa' || !currentUser.fpId) return;
    const studentData = dbData.users?.find(u => u.id == currentUser.fpId);
    const profileDelay = document.getElementById('profileDelay');
    if (profileDelay) {
        if (studentData && studentData.delayOut) {
            profileDelay.value = formatDelayText(studentData.delayOut);
            profileDelay.style.color = '#4a90e2';
        } else {
            profileDelay.value = formatDelayText(60);
            profileDelay.style.color = '#888';
        }
    }
}

// ======================== CLEANUP ========================
function cleanupUI() {
    if (clockInterval) clearInterval(clockInterval);
    uiInitialized = false;
    if (dashboardChart) { 
        try { dashboardChart.destroy(); } catch(e) {}
        dashboardChart = null; 
    }
    if (dashboardChartRetryTimeout) {
        clearTimeout(dashboardChartRetryTimeout);
        dashboardChartRetryTimeout = null;
    }
    if (typeof cleanupSensorStatus === 'function') {
        cleanupSensorStatus();
    }
    // Bersihkan listener foto profil
    if (photoRefreshListenerAttached && currentUser && currentUser.uid) {
        db.ref(`users_auth/${currentUser.uid}/photoUrl`).off('value');
        photoRefreshListenerAttached = false;
    }
    console.log("🧹 UI cleanup completed");
}

// ======================== EKSPOR KE GLOBAL ========================
window.initApp = initApp;
window.switchTab = switchTab;
window.showToast = showToast;
window.closeModal = closeModal;
window.openProfileModal = openProfileModal;
window.openForgotPasswordModal = openForgotPasswordModal;
window.openChangePasswordModal = openChangePasswordModal;
window.handleUpdateProfileInfo = handleUpdateProfileInfo;
window.handleChangePassword = handleChangePassword;
window.uploadProfilePhoto = uploadProfilePhoto;
window.processForgot = processForgot;
window.toggleRegisterInput = toggleRegisterInput;
window.toggleGenerateInput = toggleGenerateInput;
window.saveSchoolName = saveSchoolName;
window.renderUsersTable = renderUsersTable;
window.updateProfileDelayDisplay = updateProfileDelayDisplay;
window.cleanupUI = cleanupUI;
window.loadSchoolLogo = loadSchoolLogo;
window.uploadSchoolLogo = uploadSchoolLogo;
window.removeSchoolLogo = removeSchoolLogo;
window.updateSchoolLogoUI = updateSchoolLogoUI;
window.toggleFriendsModal = toggleFriendsModal;
window.openChatModal = openChatModal;
window.renderDashboard = renderDashboard;
window.updateDashboardChart = updateDashboardChart;
window.setupChartYearListener = setupChartYearListener;
window.updateYearDropdownOptions = updateYearDropdownOptions;
window.getClassIconForHeader = getClassIconForHeader;
window.forceRenderChat = forceRenderChat;
window.ensureChatRendered = ensureChatRendered;
window.refreshAllAvatars = refreshAllAvatars;
window.setupPhotoRealtimeListener = setupPhotoRealtimeListener;
window.validateAndFixCurrentUser = validateAndFixCurrentUser;

// ======================== SIDEBAR EXPORTS ========================
window.toggleSidebar = toggleSidebar;
window.closeSidebar = closeSidebar;
window.initSidebar = initSidebar;
window.updateSidebarUserInfo = updateSidebarUserInfo;
window.updateMobileNavTitle = updateMobileNavTitle;
window.applySidebarRolePermissions = applySidebarRolePermissions;

// Debug function
window.debugAttendanceData = debugAttendanceData;

console.log("✅ ui.js V5.18 loaded - User name & role sync fixed!");