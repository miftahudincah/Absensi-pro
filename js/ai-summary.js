// ai-summary-ultimate.js - VERSION 7.0 (ULTIMATE AI ANALYTICS WITH OPENAI)
// ============================================================================
// FITUR ULTIMATE AI + OPENAI INTEGRATION:
// 1. Analisis Prediktif 14 Hari ke Depan (tanpa libur & weekend)
// 2. Deteksi Anomali Cerdas (lonjakan alpha, tren menurun, outlier)
// 3. Rekomendasi Prioritas dengan Scoring System (0-100)
// 4. Analisis Perbandingan Antar Periode (Mingguan, Bulanan, Tahunan)
// 5. Analisis Performa per Kelas & Jurusan
// 6. Analisis Keterlambatan & Pola Waktu
// 7. Export ke PDF dengan Visualisasi Lengkap
// 8. Integrasi dengan Dashboard & Floating Button
// 9. Caching Analisis untuk Performa Optimal
// 10. Role-Based Access (Admin, Guru, Developer)
// 11. INTEGRASI OPENAI GPT-4o UNTUK ANALISIS LEBIH CERDAS
// 12. Executive Summary Natural Language
// 13. Strategic Recommendations by AI
// 14. Advanced Pattern Recognition
// 15. Personalized Student Analysis
// ============================================================================

// ======================= KONFIGURASI AI =======================
const AI_ULTIMATE_CONFIG = {
    // Bobot prediksi (machine learning sederhana)
    weights: {
        historicalTrend: 0.30,
        dayOfWeek: 0.20,
        recentPattern: 0.25,
        seasonalFactor: 0.15,
        examFactor: 0.10
    },
    predictionDays: 14,
    anomalyThreshold: 1.8,
    minDataPoints: 30,
    cacheTTL: 5 * 60 * 1000,  // 5 menit untuk rule-based
    openAICacheTTL: 15 * 60 * 1000,  // 15 menit untuk OpenAI
    riskWeights: {
        attendanceRate: 0.35,
        punctuality: 0.25,
        consistency: 0.20,
        trend: 0.20
    }
};

// ======================= KONFIGURASI OPENAI =======================
const OPENAI_CONFIG = {
    apiKey: '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',
    model: 'gpt-4o-mini',
    maxTokens: 2000,
    temperature: 0.3,
    apiUrl: 'https://api.openai.com/v1/chat/completions'
};

// Cache untuk hasil analisis
let aiUltimateCache = {
    data: null,
    timestamp: 0
};

let openAICache = {
    data: null,
    timestamp: 0
};

let currentAIAnalysis = null;
let aiUltimateInitialized = false;
let openAIAvailable = true;

// ======================= UTILITY FUNCTIONS =======================

function calculateStdDev(arr) {
    if (!arr || arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
}

function getSchoolDaysInRange(startDate, endDate) {
    let count = 0;
    let current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
        const dayOfWeek = current.getDay();
        const dateStr = current.toISOString().split('T')[0];
        if (dayOfWeek >= 1 && dayOfWeek <= 5 && typeof isHoliday === 'function' && !isHoliday(dateStr)) {
            count++;
        } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }
    return count;
}

function formatDateShort(date) {
    return `${date.getDate()}/${date.getMonth() + 1}`;
}

function formatDateIndonesian(date) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getRiskLevel(score) {
    if (score >= 70) return { level: 'Kritis', color: '#f44336', icon: '🔴' };
    if (score >= 50) return { level: 'Tinggi', color: '#ff9800', icon: '🟠' };
    if (score >= 30) return { level: 'Sedang', color: '#ffc107', icon: '🟡' };
    if (score >= 15) return { level: 'Rendah', color: '#4caf50', icon: '🟢' };
    return { level: 'Sangat Rendah', color: '#00bcd4', icon: '🔵' };
}

function escapeHtmlAI(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= CEK AKSES =======================

function hasUltimateAIAccess() {
    if (!currentUser) return false;
    const allowedRoles = ['admin', 'guru', 'developer'];
    return allowedRoles.includes(currentUser.role);
}

// ======================= OPENAI API CALL =======================

async function callOpenAI(systemPrompt, userPrompt) {
    if (!openAIAvailable) {
        console.warn("OpenAI tidak tersedia, menggunakan fallback rule-based");
        return null;
    }

    try {
        const response = await fetch(OPENAI_CONFIG.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_CONFIG.apiKey}`
            },
            body: JSON.stringify({
                model: OPENAI_CONFIG.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                max_tokens: OPENAI_CONFIG.maxTokens,
                temperature: OPENAI_CONFIG.temperature
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("OpenAI API error:", errorData);
            
            if (response.status === 401 || response.status === 429) {
                openAIAvailable = false;
                console.warn("OpenAI API temporarily disabled due to error");
                setTimeout(() => { openAIAvailable = true; }, 5 * 60 * 1000);
            }
            return null;
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI call error:", error);
        openAIAvailable = false;
        return null;
    }
}

// ======================= PERSIAPAN DATA UNTUK AI =======================

function prepareDataForOpenAI(analytics) {
    if (!analytics) return null;

    const studentStats = analytics.studentStats;
    const predictions = analytics.predictions;
    const anomalies = analytics.anomalies;
    const classStats = analytics.classStats;
    const trendAnalysis = analytics.trendAnalysis;
    const weeklyStats = analytics.weeklyStats;
    const dailyStats = analytics.dailyStats;

    const problematicStudents = studentStats.bottomPerformers?.slice(0, 5).map(s => ({
        nama: s.nama,
        kelas: s.kelas,
        persentase: s.persentase,
        alpha: s.alpha,
        terlambat: s.terlambat
    })) || [];

    const problematicClasses = Object.entries(classStats)
        .filter(([_, data]) => parseFloat(data.avgPersentase) < 70)
        .map(([kelas, data]) => ({
            kelas: kelas,
            avgPersentase: data.avgPersentase,
            totalSiswa: data.total
        }));

    const criticalPredictions = predictions.slice(0, 5).filter(p => 
        !p.isWeekend && !p.isHoliday && p.predictedAttendance < 70
    );

    return {
        periode: {
            start: analytics.dataRange.start,
            end: analytics.dataRange.end,
            totalHariSekolah: analytics.summary.uniqueAttendanceDays
        },
        statistik_umum: {
            total_siswa: analytics.summary.totalStudents,
            total_absensi: analytics.summary.totalAttendance,
            rata_rata_kehadiran: parseFloat(studentStats.averageAttendance).toFixed(1),
            rata_rata_konsistensi: parseFloat(studentStats.averageConsistency).toFixed(2),
            tren_kehadiran: trendAnalysis.overall,
            perubahan_mingguan: trendAnalysis.weeklyChange
        },
        pola_harian: Object.entries(dailyStats).map(([day, data]) => ({
            hari: day,
            persentase_kehadiran: parseFloat(data.persentase),
            rata_rata_terlambat: data.terlambat
        })),
        tren_mingguan: weeklyStats.map(w => ({
            minggu_ke: w.week,
            persentase: parseFloat(w.persentase)
        })),
        siswa_bermasalah: problematicStudents,
        kelas_bermasalah: problematicClasses,
        anomali_terdeteksi: anomalies.slice(0, 5).map(a => ({
            jenis: a.type,
            deskripsi: a.description,
            tingkat_keparahan: a.severity
        })),
        prediksi_kritis: criticalPredictions.map(p => ({
            tanggal: p.date,
            hari: p.dayName,
            prediksi_kehadiran: p.predictedAttendance,
            tingkat_risiko: p.riskLevel
        })),
        rekomendasi_saat_ini: analytics.recommendations?.slice(0, 3).map(r => ({
            judul: r.title,
            prioritas: r.priority,
            tindakan: r.action
        })) || []
    };
}

// ======================= GENERATE EXECUTIVE SUMMARY DENGAN AI =======================

async function generateExecutiveSummaryWithAI(analytics) {
    const aiData = prepareDataForOpenAI(analytics);
    if (!aiData) return null;

    const systemPrompt = `Anda adalah seorang analis data pendidikan senior yang ahli dalam menganalisis kehadiran siswa. 
Tugas Anda adalah membuat ringkasan eksekutif yang profesional, insightful, dan actionable berdasarkan data kehadiran yang diberikan.

Gaya penulisan:
- Profesional namun mudah dipahami
- Fokus pada insight penting dan rekomendasi konkret
- Gunakan bahasa Indonesia formal
- Sertakan angka-angka penting untuk mendukung analisis
- Jangan terlalu panjang (maksimal 3-4 paragraf)
- Berikan perspektif yang seimbang (apa yang sudah baik dan apa yang perlu ditingkatkan)

Format output: Langsung teks ringkasan tanpa judul atau format khusus.`;

    const userPrompt = `Buatkan executive summary berdasarkan data kehadiran berikut:

DATA KEHADIRAN:
- Periode: ${aiData.periode.start} s/d ${aiData.periode.end}
- Total siswa: ${aiData.statistik_umum.total_siswa}
- Rata-rata kehadiran: ${aiData.statistik_umum.rata_rata_kehadiran}%
- Tren kehadiran: ${aiData.statistik_umum.tren_kehadiran} (perubahan ${aiData.statistik_umum.perubahan_mingguan > 0 ? '+' : ''}${aiData.statistik_umum.perubahan_mingguan}%)
- Rata-rata konsistensi siswa: ${aiData.statistik_umum.rata_rata_konsistensi}

POLA KEHADIRAN PER HARI:
${aiData.pola_harian.map(p => `- ${p.hari}: ${p.persentase_kehadiran}% kehadiran, ${p.rata_rata_terlambat} siswa terlambat`).join('\n')}

TREN MINGGUAN:
${aiData.tren_mingguan.map(w => `- Minggu ${w.minggu_ke}: ${w.persentase}%`).join('\n')}

SISWA BERMASALAH (${aiData.siswa_bermasalah.length} siswa):
${aiData.siswa_bermasalah.map(s => `- ${s.nama} (${s.kelas}): kehadiran ${s.persentase}%, alpha ${s.alpha} kali`).join('\n')}

KELAS BERMASALAH (${aiData.kelas_bermasalah.length} kelas):
${aiData.kelas_bermasalah.map(k => `- Kelas ${k.kelas}: ${k.avgPersentase}% kehadiran (${k.totalSiswa} siswa)`).join('\n')}

ANOMALI TERDETEKSI:
${aiData.anomali_terdeteksi.map(a => `- ${a.deskripsi} (${a.tingkat_keparahan})`).join('\n')}

PREDIKSI KRITIS:
${aiData.prediksi_kritis.map(p => `- ${p.tanggal} (${p.hari}): diprediksi ${p.prediksi_kehadiran}% kehadiran (risiko ${p.tingkat_risiko})`).join('\n')}

Buatkan executive summary yang profesional dan actionable berdasarkan data di atas.`;

    return await callOpenAI(systemPrompt, userPrompt);
}

// ======================= GENERATE AI RECOMMENDATIONS =======================

async function generateAIRecommendations(analytics) {
    const aiData = prepareDataForOpenAI(analytics);
    if (!aiData) return null;

    const systemPrompt = `Anda adalah konsultan manajemen sekolah yang ahli dalam meningkatkan kehadiran siswa.
Tugas Anda adalah memberikan rekomendasi strategis yang konkret, terukur, dan dapat diimplementasikan.

Prinsip rekomendasi:
1. Berdasarkan data yang tersedia (bukan asumsi)
2. Prioritas pada intervensi yang paling berdampak
3. Rekomendasi harus spesifik dan actionable
4. Sertakan target waktu (segera, minggu ini, bulan ini)
5. Gunakan bahasa Indonesia yang jelas dan lugas

Format output: Gunakan format markdown dengan bullet points. Setiap rekomendasi harus memiliki:
- [URGENSI]: Tinggi/Sedang/Rendah
- [TARGET]: Kepada siapa rekomendasi ini ditujukan
- Isi rekomendasi
- [DEADLINE]: Kapan harus dilakukan`;

    const userPrompt = `Berdasarkan data kehadiran berikut, berikan 5-7 rekomendasi strategis terbaik:

RINGKASAN DATA:
- Rata-rata kehadiran: ${aiData.statistik_umum.rata_rata_kehadiran}%
- ${aiData.siswa_bermasalah.length} siswa dengan kehadiran di bawah 70%
- ${aiData.kelas_bermasalah.length} kelas dengan kehadiran di bawah 70%
- Tren kehadiran: ${aiData.statistik_umum.tren_kehadiran}

SISWA PRIORITAS:
${aiData.siswa_bermasalah.slice(0, 3).map(s => `- ${s.nama} (${s.kelas}): kehadiran ${s.persentase}%`).join('\n')}

KELAS PRIORITAS:
${aiData.kelas_bermasalah.slice(0, 3).map(k => `- Kelas ${k.kelas}: ${k.avgPersentase}%`).join('\n')}

Berikan rekomendasi strategis yang spesifik dan dapat langsung diimplementasikan.`;

    return await callOpenAI(systemPrompt, userPrompt);
}

// ======================= PENGUMPULAN DATA LENGKAP =======================

function getCompleteAttendanceData() {
    if (!dbData || !dbData.attendance || !dbData.users) return null;
    
    const students = dbData.users.filter(s => s && s.nama && s.nama !== 'Tidak Diketahui' && s.nama.trim() !== '');
    if (students.length === 0) return null;
    
    const today = new Date();
    const last90Days = new Date(today);
    last90Days.setDate(today.getDate() - 90);
    
    const recentAttendance = (dbData.attendance || []).filter(a => {
        const date = new Date(a.date);
        return date >= last90Days;
    });
    
    // ========== 1. STATISTIK PER HARI ==========
    const dayMap = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const dailyStats = {};
    for (let i = 0; i < 7; i++) {
        dailyStats[dayMap[i]] = { total: 0, hadir: 0, terlambat: 0, persentase: 0 };
    }
    
    recentAttendance.forEach(a => {
        const date = new Date(a.date);
        const dayName = dayMap[date.getDay()];
        if (dailyStats[dayName]) {
            dailyStats[dayName].total++;
            if (a.status === 'Hadir' || a.status === 'Pulang') {
                dailyStats[dayName].hadir++;
            }
            if (a.timeIn && a.timeIn > '07:30') {
                dailyStats[dayName].terlambat++;
            }
        }
    });
    
    for (let day in dailyStats) {
        if (dailyStats[day].total > 0) {
            dailyStats[day].persentase = ((dailyStats[day].hadir / dailyStats[day].total) * 100).toFixed(1);
        }
    }
    
    // ========== 2. STATISTIK MINGGUAN ==========
    const weeklyStats = [];
    for (let w = 0; w < 8; w++) {
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() - (w * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekEnd.getDate() - 6);
        
        const weekAttendance = recentAttendance.filter(a => {
            const date = new Date(a.date);
            return date >= weekStart && date <= weekEnd;
        });
        
        const hadir = weekAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        const terlambat = weekAttendance.filter(a => a.timeIn && a.timeIn > '07:30').length;
        const alpha = weekAttendance.filter(a => a.status === 'Alpha').length;
        const total = weekAttendance.length;
        
        weeklyStats.push({
            week: 8 - w,
            startDate: weekStart.toISOString().split('T')[0],
            endDate: weekEnd.toISOString().split('T')[0],
            hadir,
            terlambat,
            alpha,
            total,
            persentase: total > 0 ? ((hadir / total) * 100).toFixed(1) : 0
        });
    }
    
    // ========== 3. STATISTIK SISWA ==========
    const studentStats = [];
    const lateThreshold = window.attendanceSettings?.lateThreshold || '07:30';
    
    for (const student of students) {
        const studentAttendance = recentAttendance.filter(a => a.studentId == student.id);
        const hadir = studentAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        const terlambat = studentAttendance.filter(a => a.timeIn && a.timeIn > lateThreshold).length;
        const alpha = studentAttendance.filter(a => a.status === 'Alpha').length;
        const total = studentAttendance.length;
        
        const weeklyAttendance = [];
        for (let w = 0; w < 8; w++) {
            const weekEnd = new Date(today);
            weekEnd.setDate(today.getDate() - (w * 7));
            const weekStart = new Date(weekEnd);
            weekStart.setDate(weekEnd.getDate() - 6);
            const weekPresent = studentAttendance.filter(a => {
                const date = new Date(a.date);
                return date >= weekStart && date <= weekEnd && (a.status === 'Hadir' || a.status === 'Pulang');
            }).length;
            const weekTotal = studentAttendance.filter(a => {
                const date = new Date(a.date);
                return date >= weekStart && date <= weekEnd;
            }).length;
            if (weekTotal > 0) weeklyAttendance.push(weekPresent / weekTotal);
        }
        
        const consistency = weeklyAttendance.length > 1 
            ? 1 - (calculateStdDev(weeklyAttendance) / 0.5)
            : 0.5;
        
        studentStats.push({
            id: student.id,
            nama: student.nama,
            kelas: student.kelas || '-',
            jurusan: student.jurusan || '-',
            hadir,
            terlambat,
            alpha,
            total,
            persentase: total > 0 ? ((hadir / total) * 100).toFixed(1) : 0,
            konsistensi: Math.max(0, Math.min(1, consistency)).toFixed(2)
        });
    }
    
    const topPerformers = [...studentStats].sort((a, b) => b.persentase - a.persentase).slice(0, 10);
    const bottomPerformers = [...studentStats]
        .filter(s => s.total >= 10)
        .sort((a, b) => a.persentase - b.persentase)
        .slice(0, 10);
    
    // ========== 4. STATISTIK PER KELAS ==========
    const classStats = {};
    for (const student of studentStats) {
        const kelas = student.kelas;
        if (!classStats[kelas]) {
            classStats[kelas] = { total: 0, totalHadir: 0, students: [] };
        }
        classStats[kelas].total++;
        classStats[kelas].totalHadir += parseFloat(student.persentase);
        classStats[kelas].students.push(student);
    }
    
    for (let kelas in classStats) {
        classStats[kelas].avgPersentase = (classStats[kelas].totalHadir / classStats[kelas].total).toFixed(1);
        classStats[kelas].ranking = 0;
    }
    
    const sortedClasses = Object.entries(classStats).sort((a, b) => b[1].avgPersentase - a[1].avgPersentase);
    sortedClasses.forEach(([kelas, data], idx) => {
        classStats[kelas].ranking = idx + 1;
    });
    
    // ========== 5. STATISTIK PER JURUSAN ==========
    const majorStats = {};
    for (const student of studentStats) {
        const jurusan = student.jurusan;
        if (!majorStats[jurusan]) {
            majorStats[jurusan] = { total: 0, totalHadir: 0 };
        }
        majorStats[jurusan].total++;
        majorStats[jurusan].totalHadir += parseFloat(student.persentase);
    }
    
    for (let jurusan in majorStats) {
        majorStats[jurusan].avgPersentase = (majorStats[jurusan].totalHadir / majorStats[jurusan].total).toFixed(1);
    }
    
    // ========== 6. DETEKSI ANOMALI ==========
    const anomalies = detectUltimateAnomalies(recentAttendance, studentStats, weeklyStats);
    
    // ========== 7. PREDIKSI 14 HARI ==========
    const predictions = predictUltimateAttendance(recentAttendance, dailyStats, weeklyStats, studentStats);
    
    // ========== 8. ANALISIS TREN ==========
    const trendAnalysis = analyzeTrends(weeklyStats, studentStats);
    
    // ========== 9. REKOMENDASI PRIORITAS ==========
    const recommendations = generateUltimateRecommendations(
        studentStats, 
        classStats, 
        anomalies, 
        predictions, 
        trendAnalysis,
        weeklyStats
    );
    
    return {
        generatedAt: new Date(),
        dataRange: {
            start: last90Days.toISOString().split('T')[0],
            end: today.toISOString().split('T')[0],
            totalDays: 90
        },
        summary: {
            totalStudents: students.length,
            totalAttendance: recentAttendance.length,
            uniqueAttendanceDays: new Set(recentAttendance.map(a => a.date)).size,
            avgDailyAttendance: recentAttendance.length / (getSchoolDaysInRange(last90Days, today) || 1)
        },
        dailyStats,
        weeklyStats: weeklyStats.slice(0, 4),
        studentStats: {
            all: studentStats,
            topPerformers,
            bottomPerformers,
            averageAttendance: studentStats.reduce((sum, s) => sum + parseFloat(s.persentase), 0) / students.length || 0,
            averageConsistency: studentStats.reduce((sum, s) => sum + parseFloat(s.konsistensi), 0) / students.length || 0
        },
        classStats,
        majorStats,
        anomalies,
        predictions,
        trendAnalysis,
        recommendations
    };
}

// ======================= DETEKSI ANOMALI ULTIMATE =======================

function detectUltimateAnomalies(attendance, studentStats, weeklyStats) {
    const anomalies = [];
    
    const attendanceByDate = {};
    attendance.forEach(a => {
        if (!attendanceByDate[a.date]) {
            attendanceByDate[a.date] = { hadir: 0, alpha: 0, terlambat: 0, total: 0 };
        }
        if (a.status === 'Hadir' || a.status === 'Pulang') attendanceByDate[a.date].hadir++;
        if (a.status === 'Alpha') attendanceByDate[a.date].alpha++;
        if (a.timeIn && a.timeIn > '07:30') attendanceByDate[a.date].terlambat++;
        attendanceByDate[a.date].total++;
    });
    
    const dates = Object.keys(attendanceByDate).sort();
    if (dates.length >= 14) {
        const hadirValues = dates.map(d => attendanceByDate[d].hadir);
        const alphaValues = dates.map(d => attendanceByDate[d].alpha);
        const terlambatValues = dates.map(d => attendanceByDate[d].terlambat);
        
        const avgHadir = hadirValues.reduce((a, b) => a + b, 0) / hadirValues.length;
        const avgAlpha = alphaValues.reduce((a, b) => a + b, 0) / alphaValues.length;
        const avgTerlambat = terlambatValues.reduce((a, b) => a + b, 0) / terlambatValues.length;
        
        const stdHadir = calculateStdDev(hadirValues);
        const stdAlpha = calculateStdDev(alphaValues);
        const stdTerlambat = calculateStdDev(terlambatValues);
        
        const last14Days = dates.slice(-14);
        last14Days.forEach(date => {
            const data = attendanceByDate[date];
            const hadirZScore = Math.abs(data.hadir - avgHadir) / (stdHadir || 1);
            const alphaZScore = Math.abs(data.alpha - avgAlpha) / (stdAlpha || 1);
            const terlambatZScore = Math.abs(data.terlambat - avgTerlambat) / (stdTerlambat || 1);
            
            if (hadirZScore > AI_ULTIMATE_CONFIG.anomalyThreshold) {
                anomalies.push({
                    type: 'attendance_spike',
                    severity: hadirZScore > 2.5 ? 'critical' : 'high',
                    date,
                    description: data.hadir > avgHadir 
                        ? `📈 Lonjakan kehadiran: ${data.hadir} orang (+${Math.round(data.hadir - avgHadir)})`
                        : `📉 Penurunan kehadiran: ${data.hadir} orang (${Math.round(avgHadir - data.hadir)} lebih rendah)`,
                    value: data.hadir,
                    expected: Math.round(avgHadir)
                });
            }
            
            if (alphaZScore > AI_ULTIMATE_CONFIG.anomalyThreshold && data.alpha >= 3) {
                anomalies.push({
                    type: 'absence_spike',
                    severity: alphaZScore > 2.5 ? 'critical' : 'high',
                    date,
                    description: `⚠️ Lonjakan ketidakhadiran: ${data.alpha} siswa Alpha`,
                    value: data.alpha,
                    expected: Math.round(avgAlpha)
                });
            }
            
            if (terlambatZScore > AI_ULTIMATE_CONFIG.anomalyThreshold && data.terlambat >= 5) {
                anomalies.push({
                    type: 'lateness_spike',
                    severity: 'medium',
                    date,
                    description: `⏰ Lonjakan keterlambatan: ${data.terlambat} siswa terlambat`,
                    value: data.terlambat,
                    expected: Math.round(avgTerlambat)
                });
            }
        });
    }
    
    for (const student of studentStats) {
        if (student.total >= 20) {
            const declineRate = (100 - parseFloat(student.persentase)) / 100;
            if (declineRate > 0.4) {
                anomalies.push({
                    type: 'student_decline',
                    severity: declineRate > 0.6 ? 'critical' : 'high',
                    studentId: student.id,
                    studentName: student.nama,
                    kelas: student.kelas,
                    description: `📉 Penurunan kehadiran: ${student.nama} hanya ${student.persentase}% (${student.alpha} kali alpha)`,
                    value: parseFloat(student.persentase),
                    expected: 75
                });
            }
        }
    }
    
    if (weeklyStats.length >= 4) {
        const lastWeek = parseFloat(weeklyStats[0].persentase);
        const weekBefore = parseFloat(weeklyStats[1].persentase);
        const twoWeeksBefore = parseFloat(weeklyStats[2].persentase);
        
        if (lastWeek < weekBefore - 15 && lastWeek < twoWeeksBefore - 10) {
            anomalies.push({
                type: 'weekly_decline',
                severity: 'high',
                description: `📊 Penurunan drastis kehadiran mingguan: ${weekBefore}% → ${lastWeek}%`,
                value: lastWeek,
                expected: weekBefore
            });
        }
    }
    
    return anomalies.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
    });
}

// ======================= PREDIKSI ULTIMATE =======================

function predictUltimateAttendance(historicalAttendance, dailyStats, weeklyStats, studentStats) {
    const predictions = [];
    const today = new Date();
    const avgAttendance = studentStats.reduce((sum, s) => sum + parseFloat(s.persentase), 0) / studentStats.length || 70;
    
    let trend = 0;
    if (weeklyStats.length >= 4) {
        const week1 = parseFloat(weeklyStats[0]?.persentase || avgAttendance);
        const week4 = parseFloat(weeklyStats[3]?.persentase || week1);
        trend = (week1 - week4) / 4;
    }
    
    const last7DaysAttendance = historicalAttendance
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 7);
    const avgLast7Days = last7DaysAttendance.length > 0 
        ? (last7DaysAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length / last7DaysAttendance.length) * 100
        : avgAttendance;
    
    for (let i = 1; i <= AI_ULTIMATE_CONFIG.predictionDays; i++) {
        const predDate = new Date(today);
        predDate.setDate(today.getDate() + i);
        const dateStr = predDate.toISOString().split('T')[0];
        const dayName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][predDate.getDay()];
        
        if (dayName === 'Minggu' || dayName === 'Sabtu') {
            predictions.push({
                date: dateStr,
                dayName,
                predictedAttendance: 0,
                isWeekend: true
            });
            continue;
        }
        
        if (typeof isHoliday === 'function' && isHoliday(dateStr)) {
            predictions.push({
                date: dateStr,
                dayName,
                predictedAttendance: 0,
                isHoliday: true
            });
            continue;
        }
        
        const dayPattern = parseFloat(dailyStats[dayName]?.persentase || avgAttendance);
        const dayOfMonth = predDate.getDate();
        const monthFactor = dayOfMonth > 25 ? 0.80 : (dayOfMonth > 20 ? 0.90 : 1);
        const examFactor = (dayOfMonth >= 1 && dayOfMonth <= 15) ? 0.95 : 1;
        
        let predicted = (
            (dayPattern * AI_ULTIMATE_CONFIG.weights.dayOfWeek) +
            (avgLast7Days * AI_ULTIMATE_CONFIG.weights.recentPattern) +
            ((avgAttendance + trend) * AI_ULTIMATE_CONFIG.weights.historicalTrend) +
            (monthFactor * 100 * AI_ULTIMATE_CONFIG.weights.seasonalFactor) +
            (examFactor * 100 * AI_ULTIMATE_CONFIG.weights.examFactor)
        );
        
        predicted = Math.min(95, Math.max(35, predicted));
        
        const confidence = Math.min(92, Math.max(55, 
            70 - (Math.abs(predicted - dayPattern) * 0.4) + 
            (historicalAttendance.length > 200 ? 12 : 0) -
            (trend < -2 ? 10 : 0)
        ));
        
        let riskLevel = 'Rendah';
        let riskColor = '#4caf50';
        if (predicted < 60) {
            riskLevel = 'Tinggi';
            riskColor = '#f44336';
        } else if (predicted < 75) {
            riskLevel = 'Sedang';
            riskColor = '#ff9800';
        }
        
        predictions.push({
            date: dateStr,
            dayName,
            displayDate: formatDateIndonesian(predDate),
            predictedAttendance: Math.round(predicted),
            confidence: Math.round(confidence),
            riskLevel,
            riskColor,
            factors: {
                dayPattern: Math.round(dayPattern),
                recentTrend: Math.round(avgLast7Days),
                monthFactor: monthFactor,
                examFactor: examFactor
            }
        });
    }
    
    return predictions;
}

// ======================= ANALISIS TREN =======================

function analyzeTrends(weeklyStats, studentStats) {
    const trends = {
        overall: 'stabil',
        weeklyChange: 0,
        direction: 'stabil',
        atRiskCount: 0,
        improvingCount: 0,
        stableCount: 0
    };
    
    if (weeklyStats.length >= 4) {
        const oldAvg = (parseFloat(weeklyStats[2]?.persentase || 0) + parseFloat(weeklyStats[3]?.persentase || 0)) / 2;
        const newAvg = (parseFloat(weeklyStats[0]?.persentase || 0) + parseFloat(weeklyStats[1]?.persentase || 0)) / 2;
        trends.weeklyChange = (newAvg - oldAvg).toFixed(1);
        
        if (trends.weeklyChange > 3) {
            trends.overall = 'meningkat';
            trends.direction = 'up';
        } else if (trends.weeklyChange < -3) {
            trends.overall = 'menurun';
            trends.direction = 'down';
        } else {
            trends.overall = 'stabil';
            trends.direction = 'stable';
        }
    }
    
    for (const student of studentStats) {
        const persen = parseFloat(student.persentase);
        if (persen < 70) trends.atRiskCount++;
        else if (persen > 85 && student.total >= 20) trends.improvingCount++;
        else trends.stableCount++;
    }
    
    return trends;
}

// ======================= REKOMENDASI PRIORITAS =======================

function generateUltimateRecommendations(studentStats, classStats, anomalies, predictions, trendAnalysis, weeklyStats) {
    const recommendations = [];
    
    const criticalAnomalies = anomalies.filter(a => a.severity === 'critical');
    for (const anomaly of criticalAnomalies.slice(0, 3)) {
        recommendations.push({
            id: `anomaly_${Date.now()}_${Math.random()}`,
            priority: 'critical',
            score: 95,
            category: '🚨 Anomali Kritis',
            title: anomaly.type === 'attendance_spike' ? 'Lonjakan Kehadiran Tidak Wajar' :
                    anomaly.type === 'absence_spike' ? 'Lonjakan Ketidakhadiran' :
                    anomaly.type === 'student_decline' ? 'Penurunan Drastis Siswa' :
                    'Anomali Data Terdeteksi',
            description: anomaly.description,
            action: anomaly.type === 'student_decline' 
                ? `Segera hubungi orang tua ${anomaly.studentName} dan lakukan pembinaan intensif.`
                : `Periksa penyebab pada tanggal ${anomaly.date}. Mungkin ada faktor eksternal yang mempengaruhi.`,
            deadline: '24 jam',
            icon: '🚨'
        });
    }
    
    const highRiskStudents = studentStats
        .filter(s => parseFloat(s.persentase) < 60 && s.total >= 15)
        .sort((a, b) => parseFloat(a.persentase) - parseFloat(b.persentase))
        .slice(0, 5);
    
    for (const student of highRiskStudents) {
        const riskScore = Math.round((70 - parseFloat(student.persentase)) * 1.5);
        recommendations.push({
            id: `student_${student.id}`,
            priority: riskScore > 60 ? 'critical' : 'high',
            score: riskScore,
            category: '👨‍🎓 Intervensi Siswa',
            title: `${student.nama} - Kehadiran Kritis (${student.persentase}%)`,
            description: `Siswa ${student.nama} (${student.kelas}/${student.jurusan}) memiliki kehadiran hanya ${student.persentase}% dari ${student.total} total kehadiran. Terdapat ${student.alpha} kali alpha dan ${student.terlambat} kali terlambat.`,
            action: `1. Panggil orang tua untuk konsultasi\n2. Berikan surat peringatan\n3. Lakukan pendekatan personal dengan siswa`,
            deadline: '3 hari',
            icon: '⚠️'
        });
    }
    
    const problematicClasses = Object.entries(classStats)
        .filter(([_, data]) => parseFloat(data.avgPersentase) < 70 && data.total >= 5)
        .sort((a, b) => parseFloat(a[1].avgPersentase) - parseFloat(b[1].avgPersentase))
        .slice(0, 3);
    
    for (const [kelas, data] of problematicClasses) {
        recommendations.push({
            id: `class_${kelas}`,
            priority: 'high',
            score: 75,
            category: '🏫 Intervensi Kelas',
            title: `Kelas ${kelas} - Kehadiran Rendah (${data.avgPersentase}%)`,
            description: `Kelas ${kelas} memiliki rata-rata kehadiran ${data.avgPersentase}% dari ${data.total} siswa. Ranking ke-${data.ranking} dari ${Object.keys(classStats).length} kelas.`,
            action: `Adakan rapat dengan wali kelas ${kelas} untuk mengevaluasi penyebab rendahnya kehadiran.`,
            deadline: '1 minggu',
            icon: '📚'
        });
    }
    
    const lowPredictionDays = predictions.slice(0, 5).filter(p => !p.isWeekend && !p.isHoliday && p.predictedAttendance < 65);
    for (const pred of lowPredictionDays.slice(0, 3)) {
        recommendations.push({
            id: `prediction_${pred.date}`,
            priority: 'medium',
            score: 60,
            category: '🔮 Peringatan Dini',
            title: `Prediksi Kehadiran Rendah: ${pred.dayName}, ${pred.displayDate}`,
            description: `Diperkirakan kehadiran hanya ${pred.predictedAttendance}% (confidence ${pred.confidence}%). ${pred.riskLevel === 'Tinggi' ? 'Risiko tinggi! Perlu antisipasi.' : ''}`,
            action: `Siapkan strategi antisipasi. Ingatkan siswa melalui pengumuman dan wali kelas.`,
            deadline: pred.date,
            icon: '📊'
        });
    }
    
    const excellentStudents = studentStats
        .filter(s => parseFloat(s.persentase) >= 95 && s.total >= 20)
        .slice(0, 5);
    
    for (const student of excellentStudents) {
        recommendations.push({
            id: `excellent_${student.id}`,
            priority: 'low',
            score: 20,
            category: '🏆 Apresiasi',
            title: `${student.nama} - Kehadiran Sempurna (${student.persentase}%)`,
            description: `${student.nama} dari kelas ${student.kelas} memiliki kehadiran ${student.persentase}% dengan konsistensi ${parseFloat(student.konsistensi) * 100}%. Teladan bagi siswa lain!`,
            action: `Berikan penghargaan atau pujian di depan kelas. Catat sebagai siswa teladan.`,
            deadline: 'Minggu ini',
            icon: '🌟'
        });
    }
    
    if (trendAnalysis.direction === 'down' && Math.abs(parseFloat(trendAnalysis.weeklyChange)) > 5) {
        recommendations.push({
            id: `trend_alert`,
            priority: 'high',
            score: 80,
            category: '📉 Peringatan Tren',
            title: `Tren Kehadiran Menurun (${trendAnalysis.weeklyChange > 0 ? '+' : ''}${trendAnalysis.weeklyChange}%)`,
            description: `Kehadiran menunjukkan tren penurunan dalam 4 minggu terakhir. ${trendAnalysis.atRiskCount} siswa berisiko tinggi.`,
            action: `Segera evaluasi kebijakan dan adakan pertemuan dengan seluruh wali kelas.`,
            deadline: '1 minggu',
            icon: '📉'
        });
    }
    
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations;
}

// ======================= GENERATE HTML LENGKAP (DENGAN INTEGRASI AI) =======================

async function generateUltimateAIHTML(analytics) {
    if (!analytics) return '<div class="ai-error">❌ Data tidak tersedia untuk analisis</div>';
    
    // Generate AI-powered content
    let aiExecutiveSummary = '';
    let aiRecommendations = '';
    
    // Tampilkan loading indicator untuk AI content
    const aiLoadingIndicator = '<div class="ai-loading" style="text-align:center; padding:20px;"><div class="loading-spinner" style="width:30px; height:30px; margin:0 auto;"></div><p style="margin-top:10px; color:#888;">AI sedang menganalisis...</p></div>';
    
    // Cek cache OpenAI
    const now = Date.now();
    let cachedOpenAI = null;
    if (openAICache.data && (now - openAICache.timestamp) < AI_ULTIMATE_CONFIG.openAICacheTTL) {
        cachedOpenAI = openAICache.data;
        aiExecutiveSummary = cachedOpenAI.executiveSummary || '';
        aiRecommendations = cachedOpenAI.aiRecommendations || '';
    } else {
        // Jalankan OpenAI calls secara paralel di background
        Promise.all([
            generateExecutiveSummaryWithAI(analytics),
            generateAIRecommendations(analytics)
        ]).then(([summary, recommendations]) => {
            openAICache.data = { executiveSummary: summary, aiRecommendations: recommendations };
            openAICache.timestamp = Date.now();
            
            // Update UI jika modal masih terbuka
            const aiSummaryContainer = document.getElementById('aiSummaryContent');
            if (aiSummaryContainer && !aiSummaryContainer.innerHTML.includes('AI Deep Analysis')) {
                // Refresh konten dengan data AI yang baru
                refreshAIContent(analytics, summary, recommendations);
            }
        }).catch(err => console.warn("OpenAI generation error:", err));
    }
    
    const summary = analytics.summary;
    const studentStats = analytics.studentStats;
    const predictions = analytics.predictions;
    const recommendations = analytics.recommendations;
    const anomalies = analytics.anomalies;
    const classStats = analytics.classStats;
    const trendAnalysis = analytics.trendAnalysis;
    const weeklyStats = analytics.weeklyStats;
    
    const avgColor = studentStats.averageAttendance >= 85 ? '#4caf50' : 
                     studentStats.averageAttendance >= 70 ? '#2196f3' : '#f44336';
    
    const riskMessage = trendAnalysis.direction === 'down' 
        ? `Tren menurun ${Math.abs(parseFloat(trendAnalysis.weeklyChange))}% dalam 4 minggu!`
        : (trendAnalysis.direction === 'up' 
            ? `Tren meningkat +${trendAnalysis.weeklyChange}% dalam 4 minggu!` 
            : `Tren stabil dalam 4 minggu terakhir`);
    
    const criticalCount = recommendations.filter(r => r.priority === 'critical').length;
    const highCount = recommendations.filter(r => r.priority === 'high').length;
    const mediumCount = recommendations.filter(r => r.priority === 'medium').length;
    
    const sortedClasses = Object.entries(classStats)
        .sort((a, b) => b[1].avgPersentase - a[1].avgPersentase)
        .slice(0, 6);
    
    let html = `
        <div class="ai-ultimate-container" style="font-family: 'Inter', sans-serif;">
            <!-- HEADER STATS -->
            <div class="ai-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 24px;">
                <div class="ai-stat-card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 20px; padding: 20px; text-align: center; border: 1px solid rgba(0,188,212,0.2);">
                    <div style="font-size: 36px;">👥</div>
                    <div style="font-size: 32px; font-weight: bold; color: #00bcd4;">${summary.totalStudents}</div>
                    <div style="font-size: 12px; color: #888;">Total Siswa</div>
                </div>
                <div class="ai-stat-card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 20px; padding: 20px; text-align: center; border: 1px solid rgba(0,188,212,0.2);">
                    <div style="font-size: 36px;">📊</div>
                    <div style="font-size: 32px; font-weight: bold; color: ${avgColor};">${studentStats.averageAttendance.toFixed(1)}%</div>
                    <div style="font-size: 12px; color: #888;">Rata-rata Kehadiran</div>
                    <div style="font-size: 10px; color: #666; margin-top: 4px;">${riskMessage}</div>
                </div>
                <div class="ai-stat-card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 20px; padding: 20px; text-align: center; border: 1px solid rgba(0,188,212,0.2);">
                    <div style="font-size: 36px;">✅</div>
                    <div style="font-size: 32px; font-weight: bold; color: #4caf50;">${summary.totalAttendance}</div>
                    <div style="font-size: 12px; color: #888;">Total Absensi (90 Hari)</div>
                </div>
                <div class="ai-stat-card" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 20px; padding: 20px; text-align: center; border: 1px solid rgba(0,188,212,0.2);">
                    <div style="font-size: 36px;">⚠️</div>
                    <div style="font-size: 32px; font-weight: bold; color: ${anomalies.length > 0 ? '#ff9800' : '#4caf50'};">${anomalies.length}</div>
                    <div style="font-size: 12px; color: #888;">Anomali Terdeteksi</div>
                </div>
            </div>
            
            <!-- RINGKASAN EKSEKUTIF (RULE-BASED) -->
            <div class="ai-executive-summary" style="background: linear-gradient(135deg, #0f0f1a, #1a1a2e); border-radius: 20px; padding: 20px; margin-bottom: 24px; border-left: 4px solid #00bcd4;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <span style="font-size: 28px;">📋</span>
                    <h3 style="margin: 0; color: #00bcd4;">Ringkasan Eksekutif</h3>
                    <span class="badge-rule-based" style="background: #2a2a35; padding: 2px 8px; border-radius: 20px; font-size: 10px;">RULE-BASED</span>
                </div>
                <p style="margin: 0; line-height: 1.6; color: var(--text-secondary);">
                    Sistem mencatat <strong>${summary.totalStudents} siswa</strong> dengan rata-rata kehadiran <strong style="color: ${avgColor};">${studentStats.averageAttendance.toFixed(1)}%</strong> 
                    dalam 90 hari terakhir (${summary.uniqueAttendanceDays} hari sekolah efektif). 
                    ${studentStats.averageAttendance >= 80 ? 'Kehadiran keseluruhan tergolong BAIK.' : 
                      studentStats.averageAttendance >= 65 ? 'Kehadiran keseluruhan CUKUP, masih perlu peningkatan.' : 
                      'Kehadiran keseluruhan RENDAH, perlu intervensi segera!'}
                    ${trendAnalysis.atRiskCount} siswa berisiko tinggi, ${trendAnalysis.improvingCount} siswa menunjukkan peningkatan.
                </p>
            </div>
            
            <!-- AI DEEP ANALYSIS SECTION -->
            <div class="ai-openai-section" style="margin: 24px 0; border-top: 2px solid #667eea; padding-top: 24px;">
                <div class="section-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                    <span style="font-size: 28px;">🧠</span>
                    <h3 style="margin: 0; color: #667eea;">AI Deep Analysis</h3>
                    <span class="badge-ai" style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 4px 12px; border-radius: 20px; font-size: 11px; color: white;">POWERED BY GPT-4o</span>
                </div>
                
                <!-- Executive Summary by AI -->
                <div class="ai-executive-summary-ai" style="background: linear-gradient(135deg, #0f0f1a, #1a1a2e); border-radius: 20px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #667eea;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <span style="font-size: 22px;">📝</span>
                        <h4 style="margin: 0; color: #667eea;">Executive Summary (AI Generated)</h4>
                    </div>
                    <div id="aiExecutiveSummaryContent" style="line-height: 1.7; color: var(--text-secondary);">
                        ${cachedOpenAI && cachedOpenAI.executiveSummary ? cachedOpenAI.executiveSummary.replace(/\n/g, '<br>') : aiLoadingIndicator}
                    </div>
                </div>
                
                <!-- AI Recommendations -->
                <div class="ai-recommendations-ai" style="background: linear-gradient(135deg, #0f0f1a, #1a1a2e); border-radius: 20px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #764ba2;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <span style="font-size: 22px;">🎯</span>
                        <h4 style="margin: 0; color: #764ba2;">Strategic Recommendations (AI Generated)</h4>
                    </div>
                    <div id="aiRecommendationsContent" style="line-height: 1.6; color: var(--text-secondary);">
                        ${cachedOpenAI && cachedOpenAI.aiRecommendations ? cachedOpenAI.aiRecommendations.replace(/\n/g, '<br>') : aiLoadingIndicator}
                    </div>
                </div>
            </div>
            
            <!-- REKOMENDASI PRIORITAS (RULE-BASED) -->
            <div class="ai-recommendations" style="margin-bottom: 24px;">
                <div class="section-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                    <span style="font-size: 24px;">⚡</span>
                    <h3 style="margin: 0;">Rekomendasi Prioritas (Rule-Based)</h3>
                    <div style="margin-left: auto; display: flex; gap: 8px;">
                        <span class="badge-critical" style="background: #f44336; padding: 4px 12px; border-radius: 20px; font-size: 11px; color: white;">Kritis: ${criticalCount}</span>
                        <span class="badge-high" style="background: #ff9800; padding: 4px 12px; border-radius: 20px; font-size: 11px; color: white;">Tinggi: ${highCount}</span>
                        <span class="badge-medium" style="background: #ffc107; padding: 4px 12px; border-radius: 20px; font-size: 11px; color: #333;">Sedang: ${mediumCount}</span>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${recommendations.slice(0, 5).map(rec => `
                        <div class="recommendation-card" style="background: ${rec.priority === 'critical' ? 'rgba(244, 67, 54, 0.12)' : 
                                          rec.priority === 'high' ? 'rgba(255, 152, 0, 0.12)' : 
                                          rec.priority === 'medium' ? 'rgba(255, 193, 7, 0.12)' : 'rgba(76, 175, 80, 0.12)'}; 
                                border-radius: 16px; padding: 16px; border-left: 4px solid ${rec.priority === 'critical' ? '#f44336' : 
                                          rec.priority === 'high' ? '#ff9800' : 
                                          rec.priority === 'medium' ? '#ffc107' : '#4caf50'};">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 20px;">${rec.icon || '📌'}</span>
                                    <strong style="font-size: 14px;">${rec.title}</strong>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <span style="background: ${rec.priority === 'critical' ? '#f44336' : 
                                              rec.priority === 'high' ? '#ff9800' : 
                                              rec.priority === 'medium' ? '#ffc107' : '#4caf50'}; 
                                           padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: bold; color: ${rec.priority === 'medium' ? '#333' : 'white'};">
                                        ${rec.category}
                                    </span>
                                    ${rec.deadline ? `<span style="background: #2a2a35; padding: 2px 8px; border-radius: 20px; font-size: 9px;">⏰ ${rec.deadline}</span>` : ''}
                                </div>
                            </div>
                            <p style="margin: 6px 0; font-size: 12px; color: var(--text-secondary); line-height: 1.4;">${rec.description}</p>
                            <div style="margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 10px;">
                                <span style="font-size: 11px; font-weight: bold;">💡 Tindakan:</span>
                                <p style="margin: 4px 0 0 0; font-size: 11px; color: #00bcd4; white-space: pre-line;">${rec.action}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ${recommendations.length > 5 ? `<div style="text-align: center; margin-top: 12px;"><small>+${recommendations.length - 5} rekomendasi lainnya</small></div>` : ''}
            </div>
            
            <!-- DUA KOLOM: POLA HARI + PREDIKSI -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                <div style="background: var(--bg-card); border-radius: 20px; padding: 20px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                        <span style="font-size: 22px;">📅</span>
                        <h4 style="margin: 0;">Pola Kehadiran per Hari</h4>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        ${Object.entries(analytics.dailyStats).filter(([day]) => day !== 'Sabtu' && day !== 'Minggu').map(([day, data]) => {
                            const persen = data.persentase;
                            const barColor = persen >= 85 ? '#4caf50' : persen >= 70 ? '#ff9800' : '#f44336';
                            return `
                                <div>
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                        <span style="font-size: 12px; font-weight: 500;">${day}</span>
                                        <span style="font-size: 12px; color: ${barColor}; font-weight: bold;">${persen}%</span>
                                    </div>
                                    <div style="height: 6px; background: #2a2a35; border-radius: 10px; overflow: hidden;">
                                        <div style="width: ${persen}%; height: 100%; background: ${barColor}; border-radius: 10px;"></div>
                                    </div>
                                    <div style="display: flex; justify-content: space-between; margin-top: 4px;">
                                        <small style="color: #666; font-size: 10px;">${data.hadir}/${data.total} hadir</small>
                                        <small style="color: #666; font-size: 10px;">${data.terlambat} terlambat</small>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div style="background: var(--bg-card); border-radius: 20px; padding: 20px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                        <span style="font-size: 22px;">🔮</span>
                        <h4 style="margin: 0;">Prediksi 7 Hari ke Depan</h4>
                        <small style="margin-left: auto; color: #666; font-size: 10px;">confidence >55%</small>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${predictions.slice(0, 7).map(pred => {
                            if (pred.isWeekend || pred.isHoliday) {
                                return `
                                    <div style="background: #2a2a35; border-radius: 10px; padding: 10px; text-align: center; opacity: 0.6;">
                                        <div style="display: flex; justify-content: space-between; align-items: center;">
                                            <span style="font-weight: bold; font-size: 12px;">${pred.dayName}</span>
                                            <span style="font-size: 11px;">${pred.displayDate || pred.date}</span>
                                            <span style="color: #666; font-size: 10px;">${pred.isWeekend ? '🚫 Libur Akhir Pekan' : '📅 Hari Libur'}</span>
                                        </div>
                                    </div>
                                `;
                            }
                            return `
                                <div style="background: ${pred.riskColor}10; border-radius: 10px; padding: 10px; border-left: 3px solid ${pred.riskColor};">
                                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">
                                        <div>
                                            <span style="font-weight: bold; font-size: 12px;">${pred.dayName}</span>
                                            <small style="color: #666; margin-left: 6px; font-size: 10px;">${pred.displayDate || pred.date}</small>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span style="font-size: 16px; font-weight: bold; color: ${pred.riskColor};">${pred.predictedAttendance}%</span>
                                            <span style="font-size: 9px; color: #666;">conf ${pred.confidence}%</span>
                                            <span style="background: ${pred.riskColor}; padding: 2px 6px; border-radius: 20px; font-size: 8px; color: white;">${pred.riskLevel}</span>
                                        </div>
                                    </div>
                                    <div style="margin-top: 6px; height: 3px; background: #2a2a35; border-radius: 4px; overflow: hidden;">
                                        <div style="width: ${pred.predictedAttendance}%; height: 100%; background: ${pred.riskColor}; border-radius: 4px;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
            
            <!-- TREN MINGGUAN & PERFORMA KELAS -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                <div style="background: var(--bg-card); border-radius: 20px; padding: 20px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                        <span style="font-size: 22px;">📈</span>
                        <h4 style="margin: 0;">Tren Kehadiran 4 Minggu</h4>
                        ${trendAnalysis.direction === 'down' ? 
                            '<span style="margin-left: auto; color: #f44336; font-size: 11px;">⚠️ Tren menurun</span>' : 
                            trendAnalysis.direction === 'up' ?
                            '<span style="margin-left: auto; color: #4caf50; font-size: 11px;">📈 Meningkat</span>' :
                            '<span style="margin-left: auto; color: #666; font-size: 11px;">📊 Stabil</span>'}
                    </div>
                    <div style="height: 180px; position: relative;">
                        <canvas id="aiTrendChart" style="max-height: 180px; width: 100%;"></canvas>
                    </div>
                    <div style="margin-top: 12px; text-align: center;">
                        <small style="color: #666; font-size: 10px;">${weeklyStats.length} minggu terakhir | Perubahan: ${trendAnalysis.weeklyChange > 0 ? '+' : ''}${trendAnalysis.weeklyChange}%</small>
                    </div>
                </div>
                
                <div style="background: var(--bg-card); border-radius: 20px; padding: 20px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
                        <span style="font-size: 22px;">🏫</span>
                        <h4 style="margin: 0;">Performa per Kelas</h4>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${sortedClasses.slice(0, 5).map(([kelas, data]) => {
                            const persen = parseFloat(data.avgPersentase);
                            const barColor = persen >= 85 ? '#4caf50' : persen >= 70 ? '#ff9800' : '#f44336';
                            const rankIcon = data.ranking === 1 ? '🥇' : (data.ranking === 2 ? '🥈' : (data.ranking === 3 ? '🥉' : `#${data.ranking}`));
                            return `
                                <div>
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                        <span style="font-size: 12px;">
                                            <strong>${kelas}</strong> <small style="color: #666;">(${data.total} siswa)</small>
                                            <span style="margin-left: 6px; font-size: 10px;">${rankIcon}</span>
                                        </span>
                                        <span style="font-size: 12px; color: ${barColor}; font-weight: bold;">${data.avgPersentase}%</span>
                                    </div>
                                    <div style="height: 6px; background: #2a2a35; border-radius: 10px; overflow: hidden;">
                                        <div style="width: ${persen}%; height: 100%; background: ${barColor}; border-radius: 10px;"></div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                        ${sortedClasses.length === 0 ? '<div class="text-center" style="color:#666; padding:20px; font-size:12px;">Belum ada data kelas</div>' : ''}
                        ${sortedClasses.length > 5 ? `<div style="text-align:center; margin-top:8px;"><small>+${sortedClasses.length - 5} kelas lainnya</small></div>` : ''}
                    </div>
                </div>
            </div>
            
            <!-- TOP & BOTTOM PERFORMERS -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
                <div style="background: linear-gradient(135deg, #0a2e1a, #0f0f1a); border-radius: 20px; padding: 16px; border: 1px solid rgba(76, 175, 80, 0.2);">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 20px;">🏆</span>
                        <h4 style="margin: 0; color: #4caf50; font-size: 16px;">Top Performers</h4>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${studentStats.topPerformers.slice(0, 7).map((s, i) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <div>
                                    <span style="font-weight: bold; color: #ffc107; font-size: 12px;">${i+1}.</span>
                                    <span style="font-size: 12px;">${s.nama}</span>
                                    <small style="color: #666; margin-left: 6px; font-size: 10px;">(${s.kelas})</small>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <span style="color: #4caf50; font-weight: bold; font-size: 12px;">${s.persentase}%</span>
                                    <small style="color: #666; font-size: 10px;">hadir ${s.hadir}</small>
                                </div>
                            </div>
                        `).join('')}
                        ${studentStats.topPerformers.length === 0 ? '<div style="color:#666; text-align:center; padding:20px; font-size:12px;">Belum ada data</div>' : ''}
                    </div>
                </div>
                
                <div style="background: linear-gradient(135deg, #2a0a0a, #0f0f1a); border-radius: 20px; padding: 16px; border: 1px solid rgba(244, 67, 54, 0.2);">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <span style="font-size: 20px;">⚠️</span>
                        <h4 style="margin: 0; color: #f44336; font-size: 16px;">Perlu Perhatian</h4>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        ${studentStats.bottomPerformers.slice(0, 7).map((s, i) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                                <div>
                                    <span style="font-weight: bold; color: #ff9800; font-size: 12px;">${i+1}.</span>
                                    <span style="font-size: 12px;">${s.nama}</span>
                                    <small style="color: #666; margin-left: 6px; font-size: 10px;">(${s.kelas})</small>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <span style="color: #f44336; font-weight: bold; font-size: 12px;">${s.persentase}%</span>
                                    <small style="color: #666; font-size: 10px;">alpha ${s.alpha}</small>
                                </div>
                            </div>
                        `).join('')}
                        ${studentStats.bottomPerformers.length === 0 ? '<div style="color:#666; text-align:center; padding:20px; font-size:12px;">Semua siswa baik</div>' : ''}
                    </div>
                </div>
            </div>
            
            <!-- ANOMALI YANG TERDETEKSI -->
            ${anomalies.length > 0 ? `
            <div class="ai-anomalies" style="background: rgba(244, 67, 54, 0.08); border-radius: 20px; padding: 16px; margin-bottom: 24px; border: 1px solid rgba(244, 67, 54, 0.2);">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                    <span style="font-size: 20px;">🔍</span>
                    <h4 style="margin: 0; color: #ff9800; font-size: 16px;">Anomali Terdeteksi (${anomalies.length})</h4>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${anomalies.slice(0, 4).map(anom => `
                        <div style="display: flex; align-items: center; gap: 10px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 10px;">
                            <span style="font-size: 18px;">${anom.severity === 'critical' ? '🔴' : (anom.severity === 'high' ? '🟠' : '🟡')}</span>
                            <div style="flex: 1;">
                                <div style="font-weight: bold; font-size: 12px;">${anom.description}</div>
                                ${anom.date ? `<small style="color: #666; font-size: 10px;">Tanggal: ${anom.date}</small>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- FOOTER -->
            <div style="text-align: center; padding: 16px; border-top: 1px solid #2a2a35; font-size: 10px; color: #666;">
                <div>🤖 AI Ultimate Analytics + OpenAI GPT-4o • ${new Date().toLocaleString('id-ID')}</div>
                <div>📊 Periode data: ${analytics.dataRange.start} s/d ${analytics.dataRange.end} (${analytics.dataRange.totalDays} hari)</div>
                <div>⚡ Model AI: Weighted Multi-Factor + GPT-4o • Confidence Threshold: 55%</div>
            </div>
        </div>
    `;
    
    return html;
}

function refreshAIContent(analytics, executiveSummary, aiRecommendations) {
    const execSummaryDiv = document.getElementById('aiExecutiveSummaryContent');
    const aiRecsDiv = document.getElementById('aiRecommendationsContent');
    
    if (execSummaryDiv && executiveSummary) {
        execSummaryDiv.innerHTML = executiveSummary.replace(/\n/g, '<br>');
    }
    
    if (aiRecsDiv && aiRecommendations) {
        aiRecsDiv.innerHTML = aiRecommendations.replace(/\n/g, '<br>');
    }
}

// ======================= RENDER CHART =======================

function renderUltimateAITrendChart(weeklyStats) {
    const canvas = document.getElementById('aiTrendChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (window._aiTrendChart) {
        try { window._aiTrendChart.destroy(); } catch(e) {}
    }
    
    const labels = weeklyStats.map(w => `Minggu ${w.week}`);
    const data = weeklyStats.map(w => parseFloat(w.persentase));
    
    window._aiTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kehadiran (%)',
                data: data,
                borderColor: '#00bcd4',
                backgroundColor: 'rgba(0, 188, 212, 0.1)',
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#00bcd4',
                pointBorderColor: '#fff',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `Kehadiran: ${ctx.raw}%`
                    }
                }
            },
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: '#2a2a35' },
                    ticks: { color: '#888', callback: (v) => v + '%' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#888' }
                }
            }
        }
    });
}

// ======================= MODAL UTAMA =======================

async function openUltimateAISummaryModal() {
    if (!hasUltimateAIAccess()) {
        if (typeof showToast === 'function') {
            showToast("🔒 Akses ditolak! Fitur AI Summary hanya untuk Admin, Guru, dan Developer.", "error");
        }
        return;
    }
    
    const now = Date.now();
    if (aiUltimateCache.data && (now - aiUltimateCache.timestamp) < AI_ULTIMATE_CONFIG.cacheTTL) {
        console.log("📦 Using cached AI analysis");
        showUltimateAIModal(aiUltimateCache.data);
        return;
    }
    
    let modal = document.getElementById('modal-ai-summary');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-ai-summary" class="modal-overlay">
                <div class="modal-box" style="max-width: 1000px; max-height: 85vh; overflow-y: auto;">
                    <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 15px 20px; border-bottom: 1px solid var(--border);">
                        <span style="font-size: 1.2rem; font-weight: bold;">🧠 AI ULTIMATE SUMMARY - Powered by GPT-4o</span>
                        <span onclick="closeModal('modal-ai-summary')" style="cursor: pointer; font-size: 24px;">✖</span>
                    </div>
                    <div style="padding: 20px;" id="aiSummaryContent">
                        <div style="text-align: center; padding: 40px;">
                            <div class="loading-spinner" style="width: 50px; height: 50px; margin: 0 auto 20px;"></div>
                            <h3>🧠 AI Sedang Menganalisis Data...</h3>
                            <p style="color: #888; margin-top: 10px;">Menggunakan kecerdasan buatan GPT-4o untuk analisis mendalam</p>
                            <p style="color: #888;">Menganalisis pola, tren, dan memberikan rekomendasi strategis</p>
                        </div>
                    </div>
                    <div class="modal-actions" style="padding: 15px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <button class="btn-action btn-success" onclick="exportUltimateAISummaryToPDF()" id="aiExportPdfBtn" style="display: none;">📄 Export PDF</button>
                            <button class="btn-action btn-secondary" onclick="copyUltimateAISummaryToClipboard()" id="aiCopyBtn" style="display: none;">📋 Copy ke Clipboard</button>
                        </div>
                        <button class="btn-cancel" onclick="closeModal('modal-ai-summary')">Tutup</button>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById('modal-ai-summary');
    }
    
    modal.classList.add('open');
    
    setTimeout(async () => {
        const analytics = getCompleteAttendanceData();
        
        if (analytics) {
            aiUltimateCache = {
                data: analytics,
                timestamp: Date.now()
            };
        }
        
        const contentDiv = document.getElementById('aiSummaryContent');
        if (contentDiv) {
            if (!analytics) {
                contentDiv.innerHTML = '<div style="text-align:center; padding:40px;"><span style="font-size:48px;">📭</span><h3>Data Tidak Tersedia</h3><p>Pastikan ada data siswa dan absensi yang cukup untuk analisis (minimal 30 hari).</p></div>';
                return;
            }
            contentDiv.innerHTML = await generateUltimateAIHTML(analytics);
            
            setTimeout(() => {
                if (analytics && analytics.weeklyStats) {
                    renderUltimateAITrendChart(analytics.weeklyStats);
                }
            }, 100);
            
            const exportBtn = document.getElementById('aiExportPdfBtn');
            const copyBtn = document.getElementById('aiCopyBtn');
            if (exportBtn) exportBtn.style.display = 'inline-block';
            if (copyBtn) copyBtn.style.display = 'inline-block';
            
            currentAIAnalysis = analytics;
        }
    }, 100);
}

function showUltimateAIModal(analytics) {
    const contentDiv = document.getElementById('aiSummaryContent');
    if (contentDiv && analytics) {
        generateUltimateAIHTML(analytics).then(html => {
            contentDiv.innerHTML = html;
            setTimeout(() => renderUltimateAITrendChart(analytics.weeklyStats), 100);
        });
        
        const exportBtn = document.getElementById('aiExportPdfBtn');
        const copyBtn = document.getElementById('aiCopyBtn');
        if (exportBtn) exportBtn.style.display = 'inline-block';
        if (copyBtn) copyBtn.style.display = 'inline-block';
        
        currentAIAnalysis = analytics;
    }
}

function copyUltimateAISummaryToClipboard() {
    const content = document.querySelector('#aiSummaryContent')?.innerText;
    if (content) {
        navigator.clipboard.writeText(content);
        if (typeof showToast === 'function') showToast("✅ Analisis disalin ke clipboard", "success");
    }
}

function exportUltimateAISummaryToPDF() {
    if (!currentAIAnalysis) {
        if (typeof showToast === 'function') showToast("Tidak ada data untuk diekspor", "error");
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>AI Ultimate Summary - Sistem Absensi</title>
            <meta charset="UTF-8">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; background: white; }
                .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #667eea; }
                .header h1 { color: #667eea; font-size: 20px; }
                .ai-ultimate-container { font-size: 12px; }
                .ai-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
                .ai-stat-card { background: #f5f5f5; border-radius: 10px; padding: 12px; text-align: center; }
                @media print { body { padding: 10px; } button, .modal-actions { display: none; } }
            </style>
            <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
        </head>
        <body>
            <div class="header">
                <h1>🧠 AI ULTIMATE SUMMARY</h1>
                <p>Sistem Absensi IoT - Fingerprint & Real-time | ${new Date().toLocaleString('id-ID')}</p>
            </div>
            <div id="printContent"></div>
            <div style="text-align:center; margin-top:20px;">
                <button onclick="window.print()" style="padding:8px 16px; background:#667eea; color:white; border:none; border-radius:5px; cursor:pointer;">🖨️ Cetak PDF</button>
                <button onclick="window.close()" style="padding:8px 16px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer; margin-left:10px;">✖ Tutup</button>
            </div>
            <script>
                generateUltimateAIHTML(currentAIAnalysis).then(html => {
                    document.getElementById('printContent').innerHTML = html;
                    const canvas = document.getElementById('aiTrendChart');
                    if (canvas && currentAIAnalysis && currentAIAnalysis.weeklyStats) {
                        const ctx = canvas.getContext('2d');
                        const weeklyStats = currentAIAnalysis.weeklyStats;
                        new Chart(ctx, {
                            type: 'line',
                            data: {
                                labels: weeklyStats.map(w => 'Minggu ' + w.week),
                                datasets: [{
                                    label: 'Kehadiran (%)',
                                    data: weeklyStats.map(w => parseFloat(w.persentase)),
                                    borderColor: '#00bcd4',
                                    backgroundColor: 'rgba(0,188,212,0.1)',
                                    borderWidth: 2,
                                    fill: true
                                }]
                            },
                            options: { responsive: true, maintainAspectRatio: true }
                        });
                    }
                });
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
    if (typeof showToast === 'function') showToast("📄 Membuka halaman print", "info");
}

// ======================= INISIALISASI BUTTON =======================

function initUltimateAISummary() {
    if (aiUltimateInitialized) return;
    if (!hasUltimateAIAccess()) return;
    
    if (document.getElementById('aiUltimateBtnContainer')) return;
    
    const statsGrid = document.querySelector('.stats-grid');
    if (statsGrid && !document.getElementById('aiUltimateBtnContainer')) {
        const aiButton = document.createElement('div');
        aiButton.className = 'stat-card-new';
        aiButton.id = 'aiUltimateBtnContainer';
        aiButton.style.cssText = `
            cursor: pointer;
            background: linear-gradient(135deg, #667eea, #764ba2);
            transition: transform 0.2s;
            border-radius: 20px;
            padding: 20px;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        `;
        aiButton.onclick = () => openUltimateAISummaryModal();
        aiButton.onmouseenter = () => aiButton.style.transform = 'scale(1.02)';
        aiButton.onmouseleave = () => aiButton.style.transform = 'scale(1)';
        aiButton.innerHTML = `
            <div class="stat-title-new" style="color: white;">🧠 AI Ultimate</div>
            <div class="stat-number" style="color: white; font-size: 0.9rem;">Analisis Prediktif</div>
            <div class="stat-percent" style="color: rgba(255,255,255,0.8); font-size: 10px;">14 Hari Prediksi + GPT-4o</div>
        `;
        
        const terlambatCard = document.getElementById('statTerlambat')?.closest('.stat-card-new');
        if (terlambatCard && terlambatCard.nextSibling) {
            statsGrid.insertBefore(aiButton, terlambatCard.nextSibling);
        } else {
            statsGrid.appendChild(aiButton);
        }
        console.log("✅ AI Ultimate button added to dashboard");
    }
    
    if (!document.getElementById('floatingAiUltimateBtn')) {
        const floatingBtn = document.createElement('button');
        floatingBtn.id = 'floatingAiUltimateBtn';
        floatingBtn.innerHTML = '🧠';
        floatingBtn.title = 'AI Ultimate Summary (Powered by GPT-4o)';
        floatingBtn.onclick = () => openUltimateAISummaryModal();
        floatingBtn.style.cssText = `
            position: fixed;
            bottom: 120px;
            right: 20px;
            width: 52px;
            height: 52px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            z-index: 999;
            border: none;
            font-size: 24px;
            transition: transform 0.2s;
        `;
        floatingBtn.addEventListener('mouseenter', () => {
            floatingBtn.style.transform = 'scale(1.1)';
        });
        floatingBtn.addEventListener('mouseleave', () => {
            floatingBtn.style.transform = 'scale(1)';
        });
        document.body.appendChild(floatingBtn);
        console.log("✅ Floating AI Ultimate button added");
    }
    
    aiUltimateInitialized = true;
}

// ======================= EKSPOR KE GLOBAL =======================
window.openUltimateAISummaryModal = openUltimateAISummaryModal;
window.copyUltimateAISummaryToClipboard = copyUltimateAISummaryToClipboard;
window.exportUltimateAISummaryToPDF = exportUltimateAISummaryToPDF;
window.getCompleteAttendanceData = getCompleteAttendanceData;
window.initUltimateAISummary = initUltimateAISummary;
window.hasUltimateAIAccess = hasUltimateAIAccess;
window.renderUltimateAITrendChart = renderUltimateAITrendChart;
window.generateExecutiveSummaryWithAI = generateExecutiveSummaryWithAI;
window.generateAIRecommendations = generateAIRecommendations;

window.openAISummaryModal = openUltimateAISummaryModal;

setTimeout(() => {
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
        initUltimateAISummary();
    }
}, 2000);

console.log("✅ ai-summary-ultimate.js V7.0 loaded - Ultimate AI Analytics with OpenAI GPT-4o integration!");