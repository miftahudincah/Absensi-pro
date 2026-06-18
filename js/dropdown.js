// dropdown.js - VERSION 1.0
// Fungsi untuk mengelola dropdown menu
// ============================================================================

/**
 * Toggle dropdown menu
 * @param {string} dropdownId - ID dari dropdown container
 */
function toggleDropdown(dropdownId) {
    var dropdown = document.getElementById(dropdownId);
    var content = dropdown.querySelector('.dropdown-content');
    var isOpen = content.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) {
        content.classList.add('open');
        var overlay = document.getElementById('dropdownOverlay');
        if (overlay) overlay.classList.add('active');
    }
}

/**
 * Menutup semua dropdown yang terbuka
 */
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-content').forEach(function(c) {
        c.classList.remove('open');
    });
    var overlay = document.getElementById('dropdownOverlay');
    if (overlay) overlay.classList.remove('active');
}

/**
 * Setup event listener untuk menutup dropdown dengan tombol ESC
 */
function setupDropdownKeyboardListener() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeAllDropdowns();
    });
}

// Ekspor ke global
window.toggleDropdown = toggleDropdown;
window.closeAllDropdowns = closeAllDropdowns;
window.setupDropdownKeyboardListener = setupDropdownKeyboardListener;

// Auto setup keyboard listener
setupDropdownKeyboardListener();

console.log("✅ dropdown.js loaded");