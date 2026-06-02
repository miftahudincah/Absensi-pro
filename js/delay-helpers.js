// delay-helpers.js - VERSION 1.0
// Helper functions untuk delay input (dipisah dari index.html)
// ============================================================================

/**
 * Setup semua event listener untuk delay inputs
 * Fungsi ini akan dipanggil saat DOM ready
 */
function setupDelayEventListeners() {
    console.log("🔧 Setting up delay event listeners...");
    
    // Delay hours options
    var dh = document.getElementById('delayHoursValue');
    if (dh && dh.children.length === 0) {
        for (var i = 1; i <= 24; i++) {
            dh.innerHTML += '<option value="' + i + '">' + i + ' Jam</option>';
        }
    }
    
    // Global delay hours options
    var gh = document.getElementById('globalDelayHoursValue');
    if (gh && gh.children.length === 0) {
        for (var j = 1; j <= 24; j++) {
            gh.innerHTML += '<option value="' + j + '">' + j + '</option>';
        }
    }
    
    // Event listeners untuk delay inputs
    var dm = document.getElementById('delayMinutesValue');
    if (dm && !dm._listenerAdded) {
        dm.addEventListener('input', function() {
            var h = document.getElementById('newDelay');
            if (h) h.value = this.value;
        });
        dm._listenerAdded = true;
    }
    
    var dh2 = document.getElementById('delayHoursValue');
    if (dh2 && !dh2._listenerAdded) {
        dh2.addEventListener('change', function() {
            var h = document.getElementById('newDelay');
            if (h) h.value = this.value * 60;
        });
        dh2._listenerAdded = true;
    }
    
    var du = document.getElementById('delayUnit');
    if (du && !du._listenerAdded) {
        du.addEventListener('change', function() {
            if (typeof toggleDelayInput === 'function') toggleDelayInput();
        });
        du._listenerAdded = true;
    }
    
    var gdm = document.getElementById('globalDelayMinutesValue');
    if (gdm && !gdm._listenerAdded) {
        gdm.addEventListener('input', function() {
            var h = document.getElementById('globalDelayHidden');
            if (h) h.value = this.value;
        });
        gdm._listenerAdded = true;
    }
    
    var gdh2 = document.getElementById('globalDelayHoursValue');
    if (gdh2 && !gdh2._listenerAdded) {
        gdh2.addEventListener('change', function() {
            var h = document.getElementById('globalDelayHidden');
            if (h) h.value = this.value * 60;
        });
        gdh2._listenerAdded = true;
    }
    
    var gdu = document.getElementById('globalDelayUnit');
    if (gdu && !gdu._listenerAdded) {
        gdu.addEventListener('change', function() {
            if (typeof toggleGlobalDelayInput === 'function') toggleGlobalDelayInput();
        });
        gdu._listenerAdded = true;
    }
    
    setTimeout(function() {
        if (typeof toggleDelayInput === 'function') toggleDelayInput();
        if (typeof toggleGlobalDelayInput === 'function') toggleGlobalDelayInput();
    }, 100);
}

/**
 * Setup rekap custom range handler
 */
function setupRekapCustomRangeHandler() {
    var periodSelect = document.getElementById('rekapPeriod');
    var customRangeGroup = document.getElementById('customRangeGroup');
    
    if (periodSelect && customRangeGroup) {
        var today = new Date();
        var startDate = new Date();
        startDate.setDate(today.getDate() - 30);
        
        var startInput = document.getElementById('rekapStartDate');
        var endInput = document.getElementById('rekapEndDate');
        
        if (startInput && !startInput.value) {
            startInput.value = startDate.toISOString().split('T')[0];
        }
        if (endInput && !endInput.value) {
            endInput.value = today.toISOString().split('T')[0];
        }
        
        function toggleCustomRange() {
            customRangeGroup.style.display = periodSelect.value === 'custom' ? 'flex' : 'none';
        }
        
        periodSelect.addEventListener('change', toggleCustomRange);
        toggleCustomRange();
    }
}

// Ekspor ke global
window.setupDelayEventListeners = setupDelayEventListeners;
window.setupRekapCustomRangeHandler = setupRekapCustomRangeHandler;

console.log("✅ delay-helpers.js loaded");