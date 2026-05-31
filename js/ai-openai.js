// ai-openai.js - VERSION 1.0 (INTEGRASI OPENAI UNTUK AI SUMMMARY SUPER POWERFULL)
// Integrasi OpenAI API untuk analisis kehadiran yang lebih cerdas
// Fitur:
// - Analisis Natural Language Processing (NLP) dari data kehadiran
// - Rekomendasi strategi peningkatan kehadiran berbasis AI
// - Deteksi pola kompleks yang tidak terlihat oleh rule-based
// - Prediksi akurat menggunakan GPT-4o-mini
// - Auto-summarization laporan eksekutif
// - Saran intervensi personal untuk setiap siswa bermasalah
// ============================================================================

// Konfigurasi OpenAI
const OPENAI_CONFIG = {
    apiKey: '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',
    model: 'gpt-4o-mini',
    maxTokens: 2000,
    temperature: 0.3,
    apiUrl: 'https://api.openai.com/v1/chat/completions'
};

let openAIAvailable = true;
let openAIAnalysisCache = null;
let openAICacheTimestamp = 0;
const OPENAI_CACHE_TTL = 15 * 60 * 1000; // 15 menit cache untuk analisis OpenAI

// ======================= FUNGSI UTILITY =======================

/**
 * Memanggil API OpenAI untuk analisis
 * @param {string} systemPrompt - System prompt untuk AI
 * @param {string} userPrompt - User prompt untuk AI
 * @returns {Promise<string>} - Response dari OpenAI
 */
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
            
            // Jika error karena quota habis atau auth error, nonaktifkan sementara
            if (response.status === 401 || response.status === 429) {
                openAIAvailable = false;
                console.warn("OpenAI API temporarily disabled due to error");
                setTimeout(() => { openAIAvailable = true; }, 5 * 60 * 1000); // Coba lagi setelah 5 menit
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

// ======================= PREPARE DATA UNTUK AI =======================

/**
 * Menyiapkan data analisis dalam format yang bisa dipahami AI
 */
function prepareAIDataForOpenAI(analytics) {
    if (!analytics) return null;

    // Ambil data penting
    const summary = analytics.summary;
    const studentStats = analytics.studentStats;
    const predictions = analytics.predictions;
    const anomalies = analytics.anomalies;
    const classStats = analytics.classStats;
    const trendAnalysis = analytics.trendAnalysis;
    const weeklyStats = analytics.weeklyStats;
    const dailyStats = analytics.dailyStats;

    // Siapkan data siswa bermasalah (top 5 terendah)
    const problematicStudents = studentStats.bottomPerformers?.slice(0, 5).map(s => ({
        nama: s.nama,
        kelas: s.kelas,
        persentase: s.persentase,
        alpha: s.alpha,
        terlambat: s.terlambat
    })) || [];

    // Siapkan data kelas bermasalah
    const problematicClasses = Object.entries(classStats)
        .filter(([_, data]) => parseFloat(data.avgPersentase) < 70)
        .map(([kelas, data]) => ({
            kelas: kelas,
            avgPersentase: data.avgPersentase,
            totalSiswa: data.total
        }));

    // Siapkan data prediksi mendatang (3 hari ke depan yang perlu perhatian)
    const criticalPredictions = predictions.slice(0, 5).filter(p => 
        !p.isWeekend && !p.isHoliday && p.predictedAttendance < 70
    );

    // Format data untuk AI
    const aiData = {
        periode: {
            start: analytics.dataRange.start,
            end: analytics.dataRange.end,
            totalHariSekolah: summary.uniqueAttendanceDays
        },
        statistik_umum: {
            total_siswa: summary.totalStudents,
            total_absensi: summary.totalAttendance,
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
            persentase: parseFloat(w.persentase),
            perubahan_dari_minggu_sebelumnya: null
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

    return aiData;
}

// ======================= GENERATE EXECUTIVE SUMMARY DENGAN OPENAI =======================

/**
 * Membuat executive summary yang natural dan insightful menggunakan AI
 */
async function generateExecutiveSummaryWithAI(analytics) {
    const aiData = prepareAIDataForOpenAI(analytics);
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

PREDIKSI KRITIS (3 hari ke depan):
${aiData.prediksi_kritis.map(p => `- ${p.tanggal} (${p.hari}): diprediksi ${p.prediksi_kehadiran}% kehadiran (risiko ${p.tingkat_risiko})`).join('\n')}

Buatkan executive summary yang profesional dan actionable berdasarkan data di atas.`;

    const result = await callOpenAI(systemPrompt, userPrompt);
    return result;
}

// ======================= GENERATE ACTIONABLE RECOMMENDATIONS DENGAN AI =======================

/**
 * Membuat rekomendasi strategis menggunakan AI
 */
async function generateAIRecommendations(analytics) {
    const aiData = prepareAIDataForOpenAI(analytics);
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
- [DEADLINE]: Kapan harus dilakukan

Contoh format:
**[URGENSI: Tinggi] [TARGET: Wali Kelas X RPL]**
Lakukan home visit atau panggilan orang tua untuk 3 siswa dengan kehadiran <60%
*[DEADLINE: 1 minggu]*`;

    const userPrompt = `Berdasarkan data kehadiran berikut, berikan 5-7 rekomendasi strategis terbaik untuk meningkatkan kehadiran siswa:

RINGKASAN DATA:
- Rata-rata kehadiran: ${aiData.statistik_umum.rata_rata_kehadiran}% (target minimal 85%)
- ${aiData.siswa_bermasalah.length} siswa dengan kehadiran di bawah 70%
- ${aiData.kelas_bermasalah.length} kelas dengan kehadiran di bawah 70%
- Tren kehadiran: ${aiData.statistik_umum.tren_kehadiran}

SISWA PRIORITAS INTERVENSI:
${aiData.siswa_bermasalah.slice(0, 3).map(s => `- ${s.nama} (${s.kelas}): kehadiran ${s.persentase}%, perlu intervensi segera`).join('\n')}

KELAS PRIORITAS:
${aiData.kelas_bermasalah.slice(0, 3).map(k => `- Kelas ${k.kelas}: ${k.avgPersentase}%, perlu evaluasi khusus`).join('\n')}

ANOMALI PERHATIAN:
${aiData.anomali_terdeteksi.slice(0, 3).map(a => `- ${a.deskripsi}`).join('\n')}

PREDIKSI:
${aiData.prediksi_kritis.slice(0, 3).map(p => `- ${p.tanggal}: risiko ${p.tingkat_risiko} (${p.prediksi_kehadiran}%)`).join('\n')}

Berikan rekomendasi strategis yang spesifik dan dapat langsung diimplementasikan.`;

    const result = await callOpenAI(systemPrompt, userPrompt);
    return result;
}

// ======================= ANALISIS PERSONAL UNTUK SISWA =======================

/**
 * Analisis personal untuk siswa tertentu menggunakan AI
 * @param {Object} studentData - Data siswa beserta riwayat kehadirannya
 * @returns {Promise<string>} - Analisis personal
 */
async function generatePersonalStudentAnalysis(studentData) {
    const systemPrompt = `Anda adalah konselor pendidikan yang ahli dalam membantu siswa meningkatkan kehadiran sekolah.
Tugas Anda adalah memberikan analisis personal dan saran konstruktif untuk siswa berdasarkan data kehadiran mereka.

Gaya penulisan:
- Empatik dan suportif, tidak menghakimi
- Fokus pada solusi dan motivasi
- Gunakan bahasa Indonesia yang mudah dipahami siswa
- Sertakan apresiasi untuk hal-hal positif yang sudah dilakukan
- Berikan saran konkret yang bisa dilakukan siswa

Format output: Langsung teks analisis (1-2 paragraf) tanpa judul khusus.`;

    const userPrompt = `Analisiskan kehadiran siswa berikut dan berikan saran yang membangun:

Nama: ${studentData.nama}
Kelas: ${studentData.kelas}
Persentase kehadiran: ${studentData.persentase}%
Total kehadiran: ${studentData.hadir} dari ${studentData.totalDays} hari
Alpha (tanpa keterangan): ${studentData.alpha} kali
Terlambat: ${studentData.terlambat} kali
Konsistensi: ${(studentData.konsistensi * 100).toFixed(1)}%

Jika ada catatan khusus dari guru, sertakan dalam analisis. Berikan saran yang membangun dan memotivasi.`;

    const result = await callOpenAI(systemPrompt, userPrompt);
    return result;
}

// ======================= PREDIKSI LANJUTAN DENGAN AI =======================

/**
 * Prediksi kehadiran lanjutan dengan analisis faktor eksternal
 * @param {Object} analytics - Data analisis lengkap
 * @returns {Promise<string>} - Analisis prediksi dengan insight
 */
async function generateAdvancedPredictionWithAI(analytics) {
    const aiData = prepareAIDataForOpenAI(analytics);
    if (!aiData) return null;

    const systemPrompt = `Anda adalah ahli forecasting dengan spesialisasi di bidang pendidikan.
Tugas Anda adalah menganalisis pola kehadiran dan memberikan prediksi dengan insight tentang faktor-faktor yang mungkin mempengaruhi.

Output harus mencakup:
1. Analisis pola yang terdeteksi dari data historis
2. Faktor-faktor yang mungkin mempengaruhi tren
3. Prediksi untuk 7-14 hari ke depan dengan confidence level
4. Saran mitigasi untuk hari-hari dengan risiko rendah

Format output: Gunakan struktur yang jelas dengan sub-bagian, bahasa Indonesia profesional.`;

    const userPrompt = `Berdasarkan data kehadiran berikut, berikan analisis prediksi yang mendalam:

DATA HISTORIS 90 HARI:
- Rata-rata kehadiran: ${aiData.statistik_umum.rata_rata_kehadiran}%
- Tren: ${aiData.statistik_umum.tren_kehadiran}
- Perubahan mingguan: ${aiData.statistik_umum.perubahan_mingguan}%

POLA PER HARI:
${aiData.pola_harian.map(p => `- ${p.hari}: ${p.persentase_kehadiran}% (rata-rata terlambat: ${p.rata_rata_terlambat} siswa)`).join('\n')}

TREN MINGGUAN:
${aiData.tren_mingguan.map(w => `- Minggu ${w.minggu_ke}: ${w.persentase}%`).join('\n')}

ANOMALI:
${aiData.anomali_terdeteksi.slice(0, 5).map(a => `- ${a.deskripsi}`).join('\n')}

PREDIKSI DASAR:
${aiData.prediksi_kritis.map(p => `- ${p.tanggal}: ${p.prediksi_kehadiran}% (${p.tingkat_risiko})`).join('\n')}

Berikan analisis mendalam tentang pola yang terdeteksi dan prediksi yang lebih akurat dengan mempertimbangkan faktor-faktor eksternal (seperti hari menjelang ujian, hari setelah libur, dll).`;

    const result = await callOpenAI(systemPrompt, userPrompt);
    return result;
}

// ======================= GENERATE FULL AI REPORT =======================

/**
 * Generate laporan AI lengkap dengan semua analisis
 * @param {Object} analytics - Data analisis dari getCompleteAttendanceData()
 * @returns {Promise<Object>} - Laporan lengkap dengan berbagai komponen AI
 */
async function generateFullAIReport(analytics) {
    if (!analytics) return null;

    // Cek cache
    const now = Date.now();
    if (openAIAnalysisCache && (now - openAICacheTimestamp) < OPENAI_CACHE_TTL) {
        console.log("📦 Using cached OpenAI analysis");
        return openAIAnalysisCache;
    }

    console.log("🤖 Generating full AI report with OpenAI...");

    // Tampilkan loading indicator di UI jika diperlukan
    if (typeof showToast === 'function') {
        showToast("🧠 AI sedang menganalisis data dengan kecerdasan buatan...", "info");
    }

    // Jalankan semua analisis AI secara paralel
    const [executiveSummary, aiRecommendations, advancedPrediction] = await Promise.all([
        generateExecutiveSummaryWithAI(analytics),
        generateAIRecommendations(analytics),
        generateAdvancedPredictionWithAI(analytics)
    ]);

    const aiReport = {
        timestamp: Date.now(),
        openAIAvailable: openAIAvailable,
        executiveSummary: executiveSummary,
        aiRecommendations: aiRecommendations,
        advancedPrediction: advancedPrediction,
        disclaimer: "Analisis ini dihasilkan oleh AI (GPT-4o-mini) berdasarkan data kehadiran. Gunakan sebagai referensi, tetap lakukan verifikasi manual untuk keputusan penting."
    };

    // Simpan ke cache
    openAIAnalysisCache = aiReport;
    openAICacheTimestamp = now;

    return aiReport;
}

// ======================= INTEGRASI DENGAN UI (MODAL AI SUMMARY) =======================

/**
 * Render AI Summary dengan integrasi OpenAI
 * Override dari fungsi di ai-summary.js
 */
async function renderAISummaryWithOpenAI(analytics) {
    if (!analytics) {
        return generateUltimateAIHTML(null);
    }

    // Generate AI report dari OpenAI
    const aiReport = await generateFullAIReport(analytics);
    
    // Data dasar dari rule-based analytics
    const baseHTML = generateUltimateAIHTML(analytics);
    
    // Jika OpenAI berhasil, tambahkan section AI Analysis
    let openAISection = '';
    
    if (aiReport && aiReport.openAIAvailable && aiReport.executiveSummary) {
        openAISection = `
            <div class="ai-openai-section" style="margin: 24px 0; border-top: 2px solid #667eea; padding-top: 24px;">
                <div class="section-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                    <span style="font-size: 28px;">🧠</span>
                    <h3 style="margin: 0; color: #667eea;">AI Deep Analysis (Powered by GPT-4o)</h3>
                    <span class="badge-ai" style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 4px 12px; border-radius: 20px; font-size: 11px; color: white;">AI GENERATED</span>
                </div>
                
                <!-- Executive Summary -->
                <div class="ai-executive-summary" style="background: linear-gradient(135deg, #0f0f1a, #1a1a2e); border-radius: 20px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #667eea;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <span style="font-size: 24px;">📋</span>
                        <h4 style="margin: 0; color: #667eea;">Executive Summary</h4>
                    </div>
                    <div style="line-height: 1.7; color: var(--text-secondary);">
                        ${aiReport.executiveSummary.replace(/\n/g, '<br>')}
                    </div>
                </div>
                
                <!-- AI Recommendations -->
                ${aiReport.aiRecommendations ? `
                <div class="ai-recommendations-section" style="background: linear-gradient(135deg, #0f0f1a, #1a1a2e); border-radius: 20px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #764ba2;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <span style="font-size: 24px;">🎯</span>
                        <h4 style="margin: 0; color: #764ba2;">Strategic Recommendations by AI</h4>
                    </div>
                    <div style="line-height: 1.6; color: var(--text-secondary);">
                        ${aiReport.aiRecommendations.replace(/\n/g, '<br>')}
                    </div>
                </div>
                ` : ''}
                
                <!-- Advanced Prediction -->
                ${aiReport.advancedPrediction ? `
                <div class="ai-prediction-section" style="background: linear-gradient(135deg, #0f0f1a, #1a1a2e); border-radius: 20px; padding: 20px; border-left: 4px solid #00bcd4;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <span style="font-size: 24px;">🔮</span>
                        <h4 style="margin: 0; color: #00bcd4;">Advanced Prediction & Pattern Analysis</h4>
                    </div>
                    <div style="line-height: 1.6; color: var(--text-secondary);">
                        ${aiReport.advancedPrediction.replace(/\n/g, '<br>')}
                    </div>
                </div>
                ` : ''}
                
                <!-- Disclaimer -->
                <div style="margin-top: 16px; padding: 12px; background: rgba(102, 126, 234, 0.1); border-radius: 12px; font-size: 11px; color: #888; text-align: center;">
                    ${aiReport.disclaimer}
                </div>
            </div>
        `;
    } else if (!aiReport?.openAIAvailable) {
        openAISection = `
            <div class="ai-fallback-notice" style="margin: 24px 0; padding: 20px; background: rgba(255, 152, 0, 0.1); border-radius: 20px; text-align: center; border-left: 4px solid #ff9800;">
                <span style="font-size: 32px;">⚠️</span>
                <h4 style="margin: 10px 0 5px 0; color: #ff9800;">OpenAI API Temporarily Unavailable</h4>
                <p style="color: var(--text-muted); font-size: 13px;">Menampilkan analisis rule-based (Ultimate Analytics) sebagai alternatif.</p>
                <p style="color: var(--text-muted); font-size: 11px; margin-top: 8px;">Coba lagi nanti untuk analisis AI yang lebih mendalam.</p>
            </div>
        `;
    }
    
    // Gabungkan dengan base HTML
    const finalHTML = baseHTML.replace('</div>', openAISection + '</div>');
    
    return finalHTML;
}

// ======================= OVERRIDE FUNGSI MODAL =======================

/**
 * Override openUltimateAISummaryModal untuk menggunakan OpenAI
 */
async function openAISummaryModalWithOpenAI() {
    if (!hasUltimateAIAccess()) {
        if (typeof showToast === 'function') {
            showToast("🔒 Akses ditolak! Fitur AI Summary hanya untuk Admin, Guru, dan Developer.", "error");
        }
        return;
    }
    
    // Cek cache
    const now = Date.now();
    if (openAIAnalysisCache && (now - openAICacheTimestamp) < OPENAI_CACHE_TTL) {
        console.log("📦 Using cached OpenAI analysis for modal");
        showAIModalWithData(openAIAnalysisCache);
        return;
    }
    
    // Tampilkan loading
    let modal = document.getElementById('modal-ai-summary');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-ai-summary" class="modal-overlay">
                <div class="modal-box" style="max-width: 950px; max-height: 85vh; overflow-y: auto;">
                    <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                        <span style="font-size: 1.2rem;">🧠 AI DEEP ANALYSIS - Powered by OpenAI GPT-4o</span>
                        <span onclick="closeModal('modal-ai-summary')" style="cursor: pointer; font-size: 24px;">✖</span>
                    </div>
                    <div style="padding: 20px;" id="aiSummaryContent">
                        <div style="text-align: center; padding: 40px;">
                            <div class="loading-spinner" style="width: 50px; height: 50px; margin: 0 auto 20px;"></div>
                            <h3>🧠 AI Sedang Menganalisis Data...</h3>
                            <p style="color: #888; margin-top: 10px;">Menggunakan kecerdasan buatan GPT-4o untuk analisis mendalam</p>
                            <p style="color: #888;">Menganalisis pola, tren, dan memberikan rekomendasi strategis</p>
                            <div style="margin-top: 20px;">
                                <div style="width: 80%; height: 4px; background: #2a2a35; border-radius: 4px; overflow: hidden; margin: 0 auto;">
                                    <div style="width: 60%; height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); border-radius: 4px; animation: loading 1s ease-in-out infinite;"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions" style="padding: 15px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <button class="btn-action btn-success" onclick="exportAISummaryToPDF()" id="aiExportPdfBtn" style="display: none;">📄 Export PDF</button>
                            <button class="btn-action btn-secondary" onclick="copyAISummaryToClipboard()" id="aiCopyBtn" style="display: none;">📋 Copy ke Clipboard</button>
                        </div>
                        <button class="btn-cancel" onclick="closeModal('modal-ai-summary')">Tutup</button>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById('modal-ai-summary');
    }
    
    modal.classList.add('open');
    
    // Proses analisis di background dengan OpenAI
    setTimeout(async () => {
        const analytics = getCompleteAttendanceData();
        
        let contentHTML;
        if (analytics) {
            contentHTML = await renderAISummaryWithOpenAI(analytics);
            openAIAnalysisCache = analytics; // Simpan analytics untuk ekspor
            openAICacheTimestamp = Date.now();
        } else {
            contentHTML = '<div style="text-align:center; padding:40px;"><span style="font-size:48px;">📭</span><h3>Data Tidak Tersedia</h3><p>Pastikan ada data siswa dan absensi yang cukup untuk analisis (minimal 30 hari).</p></div>';
        }
        
        const contentDiv = document.getElementById('aiSummaryContent');
        if (contentDiv) {
            contentDiv.innerHTML = contentHTML;
            
            // Render chart jika ada canvas
            setTimeout(() => {
                const canvas = document.getElementById('aiTrendChart');
                if (canvas && analytics && analytics.weeklyStats) {
                    renderUltimateAITrendChart(analytics.weeklyStats);
                }
            }, 100);
            
            const exportBtn = document.getElementById('aiExportPdfBtn');
            const copyBtn = document.getElementById('aiCopyBtn');
            if (exportBtn) exportBtn.style.display = 'inline-block';
            if (copyBtn) copyBtn.style.display = 'inline-block';
        }
    }, 100);
}

function showAIModalWithData(analytics) {
    const contentDiv = document.getElementById('aiSummaryContent');
    if (contentDiv && analytics) {
        renderAISummaryWithOpenAI(analytics).then(html => {
            contentDiv.innerHTML = html;
            setTimeout(() => {
                const canvas = document.getElementById('aiTrendChart');
                if (canvas && analytics.weeklyStats) {
                    renderUltimateAITrendChart(analytics.weeklyStats);
                }
            }, 100);
        });
        
        const exportBtn = document.getElementById('aiExportPdfBtn');
        const copyBtn = document.getElementById('aiCopyBtn');
        if (exportBtn) exportBtn.style.display = 'inline-block';
        if (copyBtn) copyBtn.style.display = 'inline-block';
    }
}

// ======================= EKSPOR KE GLOBAL =======================

// Override fungsi utama AI Summary
window.openUltimateAISummaryModal = openAISummaryModalWithOpenAI;
window.openAISummaryModal = openAISummaryModalWithOpenAI;
window.generateFullAIReport = generateFullAIReport;
window.generatePersonalStudentAnalysis = generatePersonalStudentAnalysis;
window.renderAISummaryWithOpenAI = renderAISummaryWithOpenAI;
window.callOpenAI = callOpenAI;

console.log("✅ ai-openai.js V1.0 loaded - OpenAI integration for super powerful AI analysis!");