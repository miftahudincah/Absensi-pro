// wow-effects.js - VERSION 1.0
// Efek keren untuk membuat web lebih WOW
// ============================================================================

// ==================== CONFETTI EFFECT ====================
class ConfettiEffect {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.isActive = false;
        this.animationId = null;
        this.init();
    }

    init() {
        // Buat canvas jika belum ada
        if (!document.getElementById('confetti-canvas')) {
            const canvas = document.createElement('canvas');
            canvas.id = 'confetti-canvas';
            document.body.appendChild(canvas);
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.resize();
            window.addEventListener('resize', () => this.resize());
        } else {
            this.canvas = document.getElementById('confetti-canvas');
            this.ctx = this.canvas.getContext('2d');
        }
    }

    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }

    shoot(duration = 2000) {
        if (this.isActive) return;
        
        this.isActive = true;
        this.canvas.classList.add('active');
        this.particles = [];
        
        // Buat 150 partikel confetti
        for (let i = 0; i < 150; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height - this.canvas.height,
                size: Math.random() * 8 + 4,
                speedX: (Math.random() - 0.5) * 8,
                speedY: Math.random() * 12 + 8,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 10,
                color: `hsl(${Math.random() * 360}, 70%, 60%)`
            });
        }
        
        this.animate();
        
        // Hentikan setelah durasi tertentu
        setTimeout(() => {
            this.stop();
        }, duration);
    }

    animate() {
        if (!this.isActive) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        let allGrounded = true;
        
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.x += p.speedX;
            p.y += p.speedY;
            p.rotation += p.rotationSpeed;
            
            // Gesekan udara
            p.speedY += 0.3;
            p.speedX *= 0.99;
            
            // Pantul ke tanah
            if (p.y > this.canvas.height - p.size) {
                p.y = this.canvas.height - p.size;
                p.speedY = -p.speedY * 0.5;
                if (Math.abs(p.speedY) < 1) {
                    p.speedY = 0;
                }
            }
            
            if (p.y < this.canvas.height - p.size) {
                allGrounded = false;
            }
            
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.rotate(p.rotation * Math.PI / 180);
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            this.ctx.restore();
        }
        
        if (allGrounded) {
            this.stop();
        } else {
            this.animationId = requestAnimationFrame(() => this.animate());
        }
    }

    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.canvas.classList.remove('active');
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// ==================== COUNT UP ANIMATION ====================
class CountUp {
    constructor(element, start, end, duration = 1000, suffix = '') {
        this.element = element;
        this.start = start;
        this.end = end;
        this.duration = duration;
        this.suffix = suffix;
        this.current = start;
        this.interval = null;
    }

    start() {
        const range = this.end - this.start;
        const stepTime = Math.abs(Math.floor(this.duration / range));
        const step = range > 0 ? 1 : -1;
        let current = this.start;
        
        this.element.classList.add('count-up');
        
        this.interval = setInterval(() => {
            current += step;
            this.element.textContent = current + this.suffix;
            
            if ((step > 0 && current >= this.end) || (step < 0 && current <= this.end)) {
                this.element.textContent = this.end + this.suffix;
                clearInterval(this.interval);
                this.interval = null;
                setTimeout(() => {
                    this.element.classList.remove('count-up');
                }, 500);
            }
        }, stepTime);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

// ==================== PARTICLE BACKGROUND ====================
class ParticleBackground {
    constructor() {
        this.particles = [];
        this.animationId = null;
        this.init();
    }

    init() {
        // Cek apakah sudah ada container
        if (document.querySelector('.particles-bg')) return;
        
        const container = document.createElement('div');
        container.className = 'particles-bg';
        document.body.appendChild(container);
        
        // Buat 50 partikel
        for (let i = 0; i < 50; i++) {
            this.createParticle(container);
        }
        
        this.animate();
    }

    createParticle(container) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.width = Math.random() * 4 + 1 + 'px';
        particle.style.height = particle.style.width;
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = Math.random() * 10 + 10 + 's';
        particle.style.opacity = Math.random() * 0.5 + 0.1;
        container.appendChild(particle);
        this.particles.push(particle);
    }

    animate() {
        // Partikel akan bergerak sendiri via CSS
        // Tidak perlu animasi tambahan
    }

    stop() {
        const container = document.querySelector('.particles-bg');
        if (container) container.remove();
    }
}

// ==================== TOAST WITH PROGRESS ====================
function showToastWow(message, type = 'success', duration = 3000) {
    // Hapus toast lama
    const existingToast = document.querySelector('.toast-wow');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-wow';
    
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    
    toast.innerHTML = `
        ${icon} <span>${message}</span>
        <div class="toast-progress"></div>
    `;
    
    document.body.appendChild(toast);
    
    // Force reflow
    toast.offsetHeight;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==================== SKELETON LOADING ====================
function showSkeleton(elementId, type = 'card', duration = 1000) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const originalHTML = element.innerHTML;
    let skeletonHTML = '';
    
    if (type === 'card') {
        skeletonHTML = `
            <div class="skeleton skeleton-card" style="height: 120px;"></div>
        `;
    } else if (type === 'table') {
        skeletonHTML = `
            <div class="skeleton skeleton-text" style="width: 100%;"></div>
            <div class="skeleton skeleton-text" style="width: 95%;"></div>
            <div class="skeleton skeleton-text" style="width: 90%;"></div>
            <div class="skeleton skeleton-text" style="width: 85%;"></div>
        `;
    } else if (type === 'avatar') {
        skeletonHTML = `<div class="skeleton skeleton-avatar"></div>`;
    }
    
    element.innerHTML = skeletonHTML;
    
    setTimeout(() => {
        element.innerHTML = originalHTML;
    }, duration);
}

// ==================== NUMBER COUNTER FOR STATS ====================
function animateStatsNumbers() {
    const statNumbers = document.querySelectorAll('.stat-number');
    
    statNumbers.forEach(el => {
        const target = parseInt(el.textContent) || 0;
        if (target > 0 && !el.hasAttribute('data-animated')) {
            el.setAttribute('data-animated', 'true');
            const countUp = new CountUp(el, 0, target, 800, '');
            countUp.start();
        }
    });
}

// ==================== HOOVER REVEAL ON CARDS ====================
function addHoverRevealToCards() {
    const cards = document.querySelectorAll('.stat-card-new, .chart-col, .class-col');
    cards.forEach(card => {
        card.classList.add('hover-reveal');
    });
}

// ==================== GLASS EFFECT ON ACTIVE TAB ====================
function addGlassEffectToActiveTab() {
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab) {
        activeTab.classList.add('glass-card');
    }
}

// ==================== CELEBRATION ON ATTENDANCE ====================
function celebrateAttendance(studentName) {
    const confetti = new ConfettiEffect();
    confetti.shoot(2500);
    showToastWow(`🎉 Selamat! ${studentName} berhasil absen!`, 'success', 3000);
    
    // Tambahkan efek suara jika diizinkan
    try {
        const audio = new Audio('data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==');
        audio.volume = 0.2;
        audio.play().catch(() => {});
    } catch(e) {}
}

// ==================== INIT ALL WOW EFFECTS ====================
function initWowEffects() {
    console.log('✨ Initializing WOW effects...');
    
    // Particle background
    const particles = new ParticleBackground();
    
    // Animate stats numbers
    setTimeout(animateStatsNumbers, 500);
    
    // Add hover reveal to cards
    addHoverRevealToCards();
    
    // Add glass effect to active tab
    addGlassEffectToActiveTab();
    
    // Add pulse ring to avatars
    const avatars = document.querySelectorAll('.navbar-avatar, .student-avatar');
    avatars.forEach(avatar => {
        avatar.parentElement?.classList.add('avatar-ring');
    });
    
    // Add neon effect to buttons
    const buttons = document.querySelectorAll('.btn-action, .btn-primary, .btn-save');
    buttons.forEach(btn => {
        btn.classList.add('neon-btn');
    });
    
    // Add animated border to cards
    const mainCards = document.querySelectorAll('.stat-card-new');
    mainCards.forEach((card, index) => {
        if (index < 4) { // Only first 4 cards
            card.classList.add('animated-border');
        }
    });
    
    console.log('✅ WOW effects initialized!');
}

// ==================== OBSERVER FOR NEW ELEMENTS ====================
const wowObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) {
                    // Animate new stat numbers
                    if (node.classList && node.classList.contains('stat-number')) {
                        const target = parseInt(node.textContent) || 0;
                        if (target > 0) {
                            const countUp = new CountUp(node, 0, target, 800, '');
                            countUp.start();
                        }
                    }
                    
                    // Add pulse to new announcement
                    if (node.classList && node.classList.contains('announcement-item')) {
                        node.classList.add('slide-in-right');
                    }
                    
                    // Add bounce to new chat message
                    if (node.classList && node.classList.contains('chat-message')) {
                        node.classList.add('bounce-in');
                    }
                }
            });
        }
    });
});

wowObserver.observe(document.body, { childList: true, subtree: true });

// ==================== AUTO INIT ====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWowEffects);
} else {
    initWowEffects();
}

// Expose functions globally
window.ConfettiEffect = ConfettiEffect;
window.CountUp = CountUp;
window.ParticleBackground = ParticleBackground;
window.showToastWow = showToastWow;
window.showSkeleton = showSkeleton;
window.animateStatsNumbers = animateStatsNumbers;
window.celebrateAttendance = celebrateAttendance;
window.initWowEffects = initWowEffects;