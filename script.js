// ==========================================
// 1. KONEKSI DATABASE (FINAL)
// ==========================================
const supabaseUrl = 'https://hysjbwysizpczgcsqvuv.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5c2pid3lzaXpwY3pnY3NxdnV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM5MjA2MTYsImV4cCI6MjA3OTQ5NjYxNn0.sLSfXMn9htsinETKUJ5IAsZ2l774rfeaNNmB7mVQcR4';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

// GLOBAL VARS
let globalData = []; 
let myTeamData = []; 
let sortState = { col: 'joinDate', dir: 'desc' }; 

// ==========================================
// 2. INISIALISASI
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    const path = window.location.pathname;
    const isLoggedIn = sessionStorage.getItem('isLoggedIn');
    
    if (!isLoggedIn && !path.includes('index.html')) {
        window.location.href = 'index.html'; return;
    }

    if (isLoggedIn) await loadData(); 

    if (path.includes('index.html')) {
        document.getElementById('loginButton').addEventListener('click', doLogin);
    } else if (path.includes('dashboard.html')) {
        renderDashboard();
    } else if (path.includes('list.html')) {
        initList();
    } else if (path.includes('network.html')) {
        initNetwork();
    }
});

// ==========================================
// 3. DATA LOGIC
// ==========================================
async function loadData() {
    try {
        const { data, error } = await db.from('members').select('*');
        if(error) throw error;
        
        globalData = data.map(m => ({
            uid: String(m.UID || m.uid).trim(),
            name: (m.Nama || m.nama || m.name || '-').trim(),
            upline: String(m.Upline || m.upline || '').trim(),
            joinDate: new Date(m.TanggalBergabung || m.tanggalbergabung || m.joinDate)
        }));

        const myUid = sessionStorage.getItem('userUid');
        if(myUid) {
            const me = globalData.find(m => m.uid === myUid);
            const downlines = getDownlinesRecursive(myUid);
            myTeamData = me ? [me, ...downlines] : [];
        }
    } catch (e) { console.error(e); }
}

function getDownlinesRecursive(parentUid) {
    let list = [];
    const children = globalData.filter(m => m.upline === parentUid);
    children.forEach(child => {
        list.push(child);
        list = list.concat(getDownlinesRecursive(child.uid));
    });
    return list;
}

// Fungsi Hitung Total Downline untuk 1 Orang (Dipakai di Network)
function countTotalTeam(uid) {
    let count = 0;
    const children = globalData.filter(m => m.upline === uid);
    count += children.length;
    children.forEach(child => {
        count += countTotalTeam(child.uid);
    });
    return count;
}

// ==========================================
// 4. LOGIN
// ==========================================
async function doLogin() {
    const uid = document.getElementById('loginUid').value.trim();
    const btn = document.getElementById('loginButton');
    const err = document.getElementById('error');

    if(!uid) { err.innerText = "Masukkan UID"; return; }
    btn.innerText = "Memproses..."; btn.disabled = true; 

    await loadData(); 

    const user = globalData.find(m => m.uid === uid);
    if(user) {
        sessionStorage.setItem('isLoggedIn', 'true');
        sessionStorage.setItem('userUid', user.uid);
        window.location.href = 'dashboard.html';
    } else {
        err.innerText = "UID Tidak Terdaftar";
        btn.innerText = "MASUK"; btn.disabled = false;
    }
}

function logout() { sessionStorage.clear(); window.location.href = 'index.html'; }

// ==========================================
// 5. DASHBOARD
// ==========================================
function renderDashboard() {
    const myUid = sessionStorage.getItem('userUid');
    const me = globalData.find(m => m.uid === myUid);
    if(!me) { logout(); return; }

    document.getElementById('mName').innerText = me.name;
    document.getElementById('mUid').innerText = me.uid;
    
    const upline = globalData.find(m => m.uid === me.upline);
    document.getElementById('mRefName').innerText = upline ? upline.name : '-';
    document.getElementById('mRefUid').innerText = upline ? upline.uid : '-';

    document.getElementById('totalMembers').innerText = myTeamData.length;

    // Logic Target
    const now = new Date();
    const d = now.getDate(); const m = now.getMonth(); const y = now.getFullYear();
    let pStart, prevEnd, label;

    if (d === 31) {
        pStart = new Date(y, m + 1, 1);
        prevEnd = new Date(y, m, 30, 23, 59, 59);
        label = "PERIODE 1 (BULAN DEPAN)";
    } else if (d <= 15) {
        pStart = new Date(y, m, 1);
        prevEnd = new Date(y, m, 0, 23, 59, 59);
        label = `PERIODE 1 (${getMonthName(m)})`;
    } else {
        pStart = new Date(y, m, 16);
        prevEnd = new Date(y, m, 15, 23, 59, 59);
        label = `PERIODE 2 (${getMonthName(m)})`;
    }

    document.getElementById('currentPeriodLabel').innerText = label;

    const countPrev = myTeamData.filter(x => x.joinDate <= prevEnd).length;
    const countNew = myTeamData.filter(x => x.joinDate >= pStart).length;
    const target = Math.ceil(countPrev / 2);
    let gap = target - countNew;
    if(gap < 0) gap = 0;

    document.getElementById('prevPeriodCount').innerText = countPrev;
    document.getElementById('targetCount').innerText = target;
    document.getElementById('newMemberCount').innerText = countNew;
    document.getElementById('gapCount').innerText = gap;

    // Chart
    const ctx = document.getElementById('growthChart').getContext('2d');
    const p1S = new Date(y, m, 1); const p1E = new Date(y, m, 15, 23,59,59);
    const p2S = new Date(y, m, 16); const p2E = new Date(y, m+1, 0, 23,59,59);
    const c1 = myTeamData.filter(x => x.joinDate >= p1S && x.joinDate <= p1E).length;
    const c2 = myTeamData.filter(x => x.joinDate >= p2S && x.joinDate <= p2E).length;

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Periode 1', 'Periode 2'],
            datasets: [{
                label: 'Pertumbuhan',
                data: [c1, c2],
                backgroundColor: ['#D4AF37', '#333'],
                borderColor: '#D4AF37', borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, grid: {color:'#333'} }, x: { grid: {display:false} } },
            plugins: { legend: {display:false} }
        }
    });
}

// ==========================================
// 6. LIST
// ==========================================
function initList() {
    window.sortData = (col) => {
        if(sortState.col === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        else { sortState.col = col; sortState.dir = 'asc'; }
        renderTable();
    };
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('membersTableBody');
    const { col, dir } = sortState;

    const sorted = [...myTeamData].sort((a, b) => {
        let valA = a[col]; let valB = b[col];
        if (col === 'joinDate') return dir === 'asc' ? valA - valB : valB - valA;
        valA = valA.toLowerCase(); valB = valB.toLowerCase();
        if(valA < valB) return dir === 'asc' ? -1 : 1;
        if(valA > valB) return dir === 'asc' ? 1 : -1;
        return 0;
    });

    let html = '';
    sorted.forEach((m, i) => {
        const d = m.joinDate;
        const dateStr = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        const refUid = m.upline ? m.upline : '-';
        html += `<tr><td>${i + 1}</td><td>${m.name}</td><td>${m.uid}</td><td>${refUid}</td><td>${dateStr}</td></tr>`;
    });
    tbody.innerHTML = html;
}

// ==========================================
// 7. NETWORK (UPDATE: WARNA KHUSUS + GARIS PUTIH)
// ==========================================
function initNetwork() {
    const myUid = sessionStorage.getItem('userUid');
    const $ = go.GraphObject.make;
    
    const diagram = $(go.Diagram, "networkDiagram", {
        layout: $(go.TreeLayout, { angle: 0, layerSpacing: 80, nodeSpacing: 20 }),
        "undoManager.isEnabled": true, 
        "initialContentAlignment": go.Spot.Center
    });

    // --- NODE TEMPLATE (KOTAK) ---
    diagram.nodeTemplate = $(go.Node, "Auto",
        $(go.Shape, "RoundedRectangle", 
            { 
                fill: "#000", // Background Hitam
            },
            // Binding Warna Garis (Stroke)
            new go.Binding("stroke", "strokeColor"),
            // Binding Ketebalan Garis
            new go.Binding("strokeWidth", "strokeWidth")
        ),
        $(go.TextBlock, { margin: 8, stroke: "#fff", font: "12px sans-serif" }, // Teks Putih
        new go.Binding("text", "label"))
    );

    // --- LINK TEMPLATE (GARIS PENGHUBUNG) ---
    diagram.linkTemplate = $(go.Link, 
        { routing: go.Link.Orthogonal, corner: 5 }, 
        $(go.Shape, { strokeWidth: 1, stroke: "white" }) // Garis Putih
    );

    // Persiapan Data Node
    const nodes = myTeamData.map(m => {
        const d = m.joinDate;
        const dStr = `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`;
        
        // HITUNG JUMLAH TIM (ANAK BUAH)
        const totalTeam = countTotalTeam(m.uid);
        
        // LOGIKA WARNA (Lebih dari sama dengan 5 = Emas)
        const isGold = totalTeam >= 5;

        return { 
            key: m.uid, 
            label: `${m.uid} / ${m.name} / ${dStr}`,
            strokeColor: isGold ? "#ffd700" : "#ffffff", // Emas atau Putih
            strokeWidth: isGold ? 2 : 1 // Emas lebih tebal
        };
    });

    const links = myTeamData
        .filter(m => m.upline && m.upline !== "")
        .map(m => ({ from: m.upline, to: m.uid }));

    diagram.model = new go.GraphLinksModel(nodes, links);

    const myNode = diagram.findNodeForKey(myUid);
    if(myNode) { 
        diagram.centerRect(myNode.actualBounds); 
        myNode.isSelected = true; 
    }
    
    window.downloadNetworkImage = function() {
        const img = diagram.makeImage({ scale: 2, background: "#000", maxSize: new go.Size(Infinity, Infinity) });
        const link = document.createElement('a'); link.href = img.src; link.download = 'jaringan_dvteam.png';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };
}

function getMonthName(idx) {
    return ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"][idx];
}
