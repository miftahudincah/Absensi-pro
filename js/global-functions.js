// global-functions.js - VERSION 1.0
// Fungsi global yang digunakan di seluruh aplikasi
// ============================================================================

/**
 * Menampilkan toast notification
 * @param {string} msg - Pesan yang akan ditampilkan
 * @param {string} type - Tipe notifikasi ('success', 'error', 'info')
 */
function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (t) {
        t.textContent = msg;
        t.style.borderLeftColor = type === 'error' ? '#f44336' : '#00bcd4';
        t.className = 'toast show';
        setTimeout(function() {
            t.className = t.className.replace('show', '');
        }, 3000);
    }
}

/**
 * Menutup modal berdasarkan ID
 * @param {string} id - ID modal yang akan ditutup
 */
function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('open');
}

/**
 * Toggle modal friends
 */
function toggleFriendsModal() {
    var modal = document.getElementById('modal-friends');
    if (modal) {
        modal.classList.add('open');
        if (typeof renderFriendsPanel === 'function') renderFriendsPanel();
    }
}

/**
 * Buka modal chat
 */
function openChatModal() {
    var modal = document.getElementById('modal-chat');
    if (modal) {
        modal.classList.add('open');
        if (typeof renderChatInterface === 'function') renderChatInterface('chatModalPanel');
    }
}

/**
 * Buka modal AI Summary
 */
function openAISummaryModal() {
    if (typeof window.openAISummaryModal === 'function') {
        window.openAISummaryModal();
    } else {
        console.log("openAISummaryModal not ready");
    }
}

/**
 * Buka modal AI Assistant
 */
function openAIAssistantModal() {
    if (typeof window.openAIAssistantModal === 'function') {
        window.openAIAssistantModal();
    } else {
        console.log("openAIAssistantModal not ready");
    }
}

/**
 * Tutup modal AI Assistant
 */
function closeAIAssistantModal() {
    var modal = document.getElementById('modal-ai-assistant');
    if (modal) modal.classList.remove('open');
    if (typeof window.closeAIAssistantModal === 'function') {
        window.closeAIAssistantModal();
    }
}

// Ekspor ke global
window.showToast = showToast;
window.closeModal = closeModal;
window.toggleFriendsModal = toggleFriendsModal;
window.openChatModal = openChatModal;
window.openAISummaryModal = openAISummaryModal;
window.openAIAssistantModal = openAIAssistantModal;
window.closeAIAssistantModal = closeAIAssistantModal;

console.log("✅ global-functions.js loaded");