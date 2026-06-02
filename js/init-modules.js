// init-modules.js - VERSION 1.0
// Inisialisasi semua modul setelah DOM ready
// ============================================================================

/**
 * Inisialisasi semua modul setelah DOM ready
 */
function initializeAllModules() {
    console.log("🚀 Initializing all modules...");
    
    // Inisialisasi modul satu per satu
    setTimeout(function() {
        if (typeof initRekapPerSiswa === 'function') { 
            initRekapPerSiswa(); 
            console.log("✅ Rekap per Siswa initialized"); 
        }
    }, 100);
    
    setTimeout(function() {
        if (typeof initAISummary === 'function') { 
            initAISummary(); 
            console.log("✅ AI Summary initialized"); 
        }
    }, 300);
    
    setTimeout(function() {
        if (typeof initAIAssistant === 'function') { 
            initAIAssistant(); 
            console.log("✅ AI Assistant initialized"); 
        }
    }, 500);
    
    setTimeout(function() {
        if (typeof initChatSystem === 'function' && !window._chatInitialized) { 
            window._chatInitialized = true; 
            initChatSystem(); 
            console.log("✅ Chat System initialized");
        }
    }, 700);
    
    setTimeout(function() {
        if (typeof initFriendsSystem === 'function' && !window._friendsInitialized) { 
            window._friendsInitialized = true; 
            initFriendsSystem(); 
            console.log("✅ Friends System initialized");
        }
    }, 900);
    
    setTimeout(function() {
        if (typeof initStatusSystem === 'function' && !window._statusInitialized) { 
            window._statusInitialized = true; 
            initStatusSystem(); 
            console.log("✅ Status System initialized");
        }
    }, 1100);
}

/**
 * Override switchTab untuk menambahkan handler tambahan
 */
function setupSwitchTabOverride() {
    var originalSwitchTab = window.switchTab;
    if (originalSwitchTab) {
        window.switchTab = function(tabId) {
            originalSwitchTab(tabId);
            
            if (tabId === 'announcement_list') { 
                setTimeout(function() {
                    if (typeof renderFullAnnouncementList === 'function') {
                        renderFullAnnouncementList();
                    }
                }, 100);
            }
            
            if (tabId === 'chat') { 
                setTimeout(function() { 
                    if (typeof forceRenderChat === 'function') forceRenderChat(); 
                }, 100);
            }
            
            if (tabId === 'friends') { 
                setTimeout(function() { 
                    if (typeof loadFriendRequests === 'function') loadFriendRequests(); 
                    if (typeof loadFriendsList === 'function') loadFriendsList(); 
                }, 100);
            }
        };
    }
}

// Ekspor ke global
window.initializeAllModules = initializeAllModules;
window.setupSwitchTabOverride = setupSwitchTabOverride;

console.log("✅ init-modules.js loaded");