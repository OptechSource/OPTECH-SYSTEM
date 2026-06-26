
var SHEET='';
var ci=false,ct=null;
var recs=[],leaveRecs=[],leaveCredits={},salaryRates={},memos=[],employees=[];
var adminLoggedIn=false;
var currentEditEmp = null;
var DEFAULT_CREDITS={VL:15,SL:15,EL:5,ML:105,PL:7};
var START_HOUR=8,START_MIN=0,GRACE_MIN=15; // 8:00 AM, grace until 8:15

function gs(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}}
function ss(k,v){try{localStorage.setItem(k,v);}catch(e){}}


// ============================================
// FRONTEND DATA SYNC MODULE FOR TITO TRACKER
// Add this to your existing HTML file
// ============================================

const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzTpL8qSp9ihelUZtXf70JR-KkWPvwmxR3gUrTIuuTjYBcLvs0ArGq0cEIQUIq4uuFiCA/exec';

// Store current user session
let currentUser = {
  id: null,
  name: null,
  department: null
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  loadEmployees();
  setupEventListeners();
});

// Setup event listeners for buttons
function setupEventListeners() {
  // Clock In button
  document.querySelector('.btn-in').addEventListener('click', handleClockIn);
  
  // Clock Out button  
  document.querySelector('.btn-out').addEventListener('click', handleClockOut);
  
  // Leave request form
  document.querySelector('#leaveForm').addEventListener('submit', handleLeaveRequest);
}

// Handle Clock In
async function handleClockIn() {
  if (!currentUser.id) {
    alert('Please select employee first');
    return;
  }
  
  const data = {
    action: 'clockIn',
    employeeId: currentUser.id,
    employeeName: currentUser.name,
    device: 'Web',
    location: getLocation() // Optional: add geolocation
  };
  
  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
       body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Update UI
      updateClockDisplay(result.timestamp, 'IN');
      // Save to localStorage as backup
      localStorage.setItem('lastClockIn', JSON.stringify(result));
      alert('Clock-in successful: ' + result.timestamp);
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    console.error('Clock-in failed:', error);
    // Fallback: save to localStorage for later sync
    saveToLocalQueue(data);
    alert('Saved locally - will sync when online');
  }
}

// Handle Clock Out
async function handleClockOut() {
  if (!currentUser.id) {
    alert('Please select employee first');
    return;
  }
  
  const data = {
    action: 'clockOut',
    employeeId: currentUser.id
  };
  
  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {'Content-Type': 'application/json'}
    });
    
    const result = await response.json();
    
    if (result.success) {
      updateClockDisplay(result.timestamp, 'OUT');
      updateTotalHours(result.totalHours);
      localStorage.removeItem('lastClockIn');
      alert('Clock-out successful. Total hours: ' + result.totalHours);
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    console.error('Clock-out failed:', error);
    saveToLocalQueue(data);
  }
}

// Handle Leave Request
async function handleLeaveRequest(e) {
  e.preventDefault();
  
  const formData = {
    action: 'requestLeave',
    employeeId: currentUser.id,
    employeeName: currentUser.name,
    leaveType: document.querySelector('#leaveType').value,
    startDate: document.querySelector('#startDate').value,
    endDate: document.querySelector('#endDate').value,
    days: calculateDays(),
    reason: document.querySelector('#reason').value
  };
  
  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify(formData),
      headers: {'Content-Type': 'application/json'}
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Leave request submitted successfully!');
      e.target.reset();
    }
  } catch (error) {
    console.error('Leave request failed:', error);
    saveToLocalQueue(formData);
  }
}

// Load employees from Google Sheet
async function loadEmployees() {
  try {
    const response = await fetch(`${GAS_WEB_APP_URL}?action=getEmployees`);
    const result = await response.json();
    
    if (result.success) {
      populateEmployeeSelect(result.employees);
    }
  } catch (error) {
    console.error('Failed to load employees:', error);
  }
}

// Offline queue for later sync
function saveToLocalQueue(data) {
  let queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
  queue.push({...data, timestamp: new Date().toISOString()});
  localStorage.setItem('syncQueue', JSON.stringify(queue));
}

// Sync offline queue when back online
async function syncOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');
  if (queue.length === 0) return;
  
  const newQueue = [];
  
  for (const item of queue) {
    try {
      const response = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify(item),
        headers: {'Content-Type': 'application/json'}
      });
      
      const result = await response.json();
      if (!result.success) newQueue.push(item);
    } catch (error) {
      newQueue.push(item);
    }
  }
  
  localStorage.setItem('syncQueue', JSON.stringify(newQueue));
}

// Auto-sync when online
window.addEventListener('online', syncOfflineQueue);

function init(){
  SHEET=gs('tito_url');
  var ui=document.getElementById('url-inp');if(ui)ui.value=SHEET;
  try{recs=JSON.parse(gs('tito_recs'))||[];}catch(e){recs=[];}
  try{leaveRecs=JSON.parse(gs('tito_leave'))||[];}catch(e){leaveRecs=[];}
  try{leaveCredits=JSON.parse(gs('tito_credits'))||{};}catch(e){leaveCredits={};}
  try{salaryRates=JSON.parse(gs('tito_salary'))||{};}catch(e){salaryRates={};}
  try{memos=JSON.parse(gs('tito_memos'))||[];}catch(e){memos=[];}
  try{employees=JSON.parse(gs('tito_employees'))||[];}catch(e){employees=[];}
  updSync();updStats();updPendingCount();updMemoCount();
  setInterval(tick,1000);tick();
  var today=new Date().toISOString().split('T')[0];
  document.getElementById('fl-start').value=today;
  document.getElementById('fl-end').value=today;
  var now=new Date(),y=now.getFullYear(),m=now.getMonth();
  document.getElementById('pay-start').value=new Date(y,m,1).toISOString().split('T')[0];
  document.getElementById('pay-end').value=new Date(y,m+1,0).toISOString().split('T')[0];
}

function tick(){
  var n=new Date();
  document.getElementById('clk').textContent=n.toLocaleTimeString('en-PH');
  document.getElementById('dt').textContent=n.toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  if(ci&&ct)setMsg('Elapsed: '+((n-ct)/3600000).toFixed(2)+' hrs');
}

function updSync(){
  var b=document.getElementById('sync-b');if(!b)return;
  if(SHEET){b.textContent='Connected';b.className='badge b-ok';}
  else{b.textContent='Offline only';b.className='badge b-warn';}
}

function updPendingCount(){
  var p=leaveRecs.filter(function(r){return r.status==='Pending';}).length;
  var el=document.getElementById('pending-count');
  if(el){el.textContent=p;el.style.display=p>0?'inline':'none';}
}

function updMemoCount(){
  var m=memos.length;
  var el=document.getElementById('memo-count');
  if(el){el.textContent=m;el.style.display=m>0?'inline':'none';}
}

function setMsg(t){var e=document.getElementById('msg');if(e)e.textContent=t;}

function sw(id,btn){
  document.querySelectorAll('.tab').forEach(function(b){b.classList.remove('active');});
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  btn.classList.add('active');
  document.getElementById('pg-'+id).classList.add('active');
  if(id==='log')renderLog();
  if(id==='dtr')renderDTR();
  if(id==='leave')renderLeaveBalance();
  if(id==='admin')renderAdminPanel();
  if(id==='memo')renderMemos();
}

function checkOther(){
  var sel=document.getElementById('ot-reason').value;
  document.getElementById('ot-other-wrap').style.display=sel==='Others'?'block':'none';
}

function calcLateMins(clockInTime){
  var lateThreshold=new Date(clockInTime);
  lateThreshold.setHours(8,15,59,999); // Grace period until 8:15:59
  if(clockInTime <= lateThreshold) return 0;
  
  // Rule: 8:16 or later = 1 hour (60 mins) deduction
  return 60;
}

function doIn(){
  var name=document.getElementById('ename').value.trim();
  if(!name){setMsg('Please enter your name first.');return;}
  ci=true;ct=new Date();
  var lateMins=calcLateMins(ct);
  document.getElementById('st-b').textContent='Clocked in';
  document.getElementById('st-b').className='badge b-in';
  document.getElementById('bin').disabled=true;
  document.getElementById('bout').disabled=false;
  document.getElementById('ot-box').classList.add('show');
  if(lateMins>0){
    document.getElementById('late-badge-wrap').style.display='inline';
    document.getElementById('late-badge').textContent='Late '+lateMins+' min';
    document.getElementById('late-box').classList.add('show');
    document.getElementById('late-mins').textContent=lateMins;
    setMsg('Time in at '+ct.toLocaleTimeString('en-PH')+' — ⚠️ '+lateMins+' minute(s) late!');
    
    // Add event listener to save and print when reason is entered
    var lr = document.getElementById('late-reason');
    lr.onkeydown = function(e) {
      if(e.key === 'Enter') {
        saveAndPrintLateMemo(name, lateMins, lr.value.trim());
      }
    };
  } else {
    document.getElementById('late-badge-wrap').style.display='none';
    document.getElementById('late-box').classList.remove('show');
    setMsg('Time in at '+ct.toLocaleTimeString('en-PH')+' ✅ On time');
  }
}

function saveAndPrintLateMemo(name, lateMins, reason) {
  var dept=document.getElementById('edept').value.trim()||'—';
  var memo={date:new Date().toLocaleDateString('en-PH'),name:name,dept:dept,
    timeIn:new Date().toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}),
    lateMins:lateMins,reason:reason||'No reason provided',id:Date.now()};
  memos.push(memo);
  ss('tito_memos',JSON.stringify(memos));
  updMemoCount();
  renderMemos();
  printMemo(memos.length - 1);
  setMsg('Memo saved and print triggered.');
}

function getOTRemark(){
  var sel=document.getElementById('ot-reason').value;
  if(!sel)return '';
  if(sel==='Others'){var o=document.getElementById('ot-other').value.trim();return o?'Others: '+o:'Others';}
  return sel;
}

function doOut(){
  if(!ci)return;
  var now=new Date();
  var name=document.getElementById('ename').value.trim()||'Employee';
  var dept=document.getElementById('edept').value.trim()||'—';
  var hrs=(now-ct)/3600000;
  
  // Lunch break deduction (12:00 - 1:00)
  var lunchStart = new Date(ct); lunchStart.setHours(12,0,0,0);
  var lunchEnd = new Date(ct); lunchEnd.setHours(13,0,0,0);
  if(ct < lunchEnd && now > lunchStart) {
    var overlapStart = Math.max(ct, lunchStart);
    var overlapEnd = Math.min(now, lunchEnd);
    var overlapHrs = (overlapEnd - overlapStart) / 3600000;
    if(overlapHrs > 0) hrs -= overlapHrs;
  }

  // Regular hours: 8:00 AM to 6:00 PM (10 hours gross, 9 hours net after lunch)
  var workEnd = new Date(ct); workEnd.setHours(18,0,0,0);
  var regHrs = 0, otHrs = 0;
  if(now <= workEnd) {
    regHrs = hrs;
  } else {
    regHrs = (workEnd - ct) / 3600000;
    // deduct lunch from reg if it happened before 6pm
    if(ct < lunchEnd && workEnd > lunchStart) {
        var overlapStart = Math.max(ct, lunchStart);
        var overlapEnd = Math.min(workEnd, lunchEnd);
        var overlapHrs = (overlapEnd - overlapStart) / 3600000;
        if(overlapHrs > 0) regHrs -= overlapHrs;
    }
    otHrs = (now - workEnd) / 3600000;
  }
  var reg = Math.max(0, regHrs), ot = Math.max(0, otHrs);
  hrs = reg + ot;
  var otRemark=ot>0?getOTRemark():'';
  var lateMins=calcLateMins(ct);
  var lateReason=lateMins>0?document.getElementById('late-reason').value.trim():'';

  var rec={date:ct.toLocaleDateString('en-PH'),name:name,dept:dept,
    timeIn:ct.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}),
    timeOut:now.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}),
    hours:parseFloat(hrs.toFixed(2)),reg:parseFloat(reg.toFixed(2)),ot:parseFloat(ot.toFixed(2)),
    otRemark:otRemark,lateMins:lateMins,lateReason:lateReason};
  recs.push(rec);ss('tito_recs',JSON.stringify(recs));

  // Memo is now auto-generated on Time In


  ci=false;ct=null;
  document.getElementById('st-b').textContent='Clocked out';
  document.getElementById('st-b').className='badge b-out';
  document.getElementById('bin').disabled=false;
  document.getElementById('bout').disabled=true;
  document.getElementById('ot-box').classList.remove('show');
  document.getElementById('late-box').classList.remove('show');
  document.getElementById('late-badge-wrap').style.display='none';
  document.getElementById('ot-reason').value='';
  document.getElementById('ot-other').value='';
  document.getElementById('ot-other-wrap').style.display='none';
  document.getElementById('late-reason').value='';
  updStats();

  if(SHEET){
    setMsg('Saving...');
    fetch(SHEET,{method:'POST',mode:'no-cors',body:JSON.stringify(rec)})
      .then(function(){setMsg('Saved! '+hrs.toFixed(2)+' hrs'+(lateMins>0?' | ⚠️ Late '+lateMins+'min':'')+(otRemark?' | OT: '+otRemark:''));})
      .catch(function(){setMsg('Saved locally. Sheets sync failed.');});
  }else{setMsg('Saved locally — '+hrs.toFixed(2)+' hrs'+(lateMins>0?' | ⚠️ Late '+lateMins+' min':'')+(otRemark?' | OT: '+otRemark:''));}
}

function updStats(){
  document.getElementById('sd').textContent=recs.length;
  document.getElementById('sh').textContent=recs.reduce(function(a,r){return a+r.hours;},0).toFixed(2);
  document.getElementById('sr').textContent=recs.reduce(function(a,r){return a+r.reg;},0).toFixed(2);
  document.getElementById('so').textContent=recs.reduce(function(a,r){return a+r.ot;},0).toFixed(2);
}

function renderLog(){
  var tb=document.getElementById('log-tb');
  if(!recs.length){tb.innerHTML='<tr><td colspan="9" style="text-align:center;color:#999;padding:2rem;">No records yet.</td></tr>';return;}
  tb.innerHTML=recs.map(function(r){
    var lateCell=r.lateMins>0?'<span class="badge b-late">'+r.lateMins+' min</span>':'-';
    var rc=r.lateMins>0?' class="late-row"':'';
    return '<tr'+rc+'><td>'+r.date+'</td><td>'+r.name+'</td><td>'+r.dept+'</td><td>'+r.timeIn+'</td><td>'+r.timeOut+'</td><td class="reg">'+r.hours.toFixed(2)+'</td><td class="ot">'+(r.ot>0?r.ot.toFixed(2):'-')+'</td><td>'+lateCell+'</td><td style="color:#633806;">'+(r.otRemark||'-')+'</td></tr>';
  }).join('');
}

function loadSheet(){
  if(!SHEET){alert('Set your Google Sheets URL in Settings first.');return;}
  var tb=document.getElementById('log-tb');
  tb.innerHTML='<tr><td colspan="9" style="text-align:center;padding:1rem;">Loading...</td></tr>';
  fetch(SHEET).then(function(r){return r.json();}).then(function(d){
    var rows=d.data||[];
    if(!rows.length){tb.innerHTML='<tr><td colspan="9" style="text-align:center;color:#999;padding:2rem;">No records yet.</td></tr>';return;}
    tb.innerHTML=rows.map(function(r){
      return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td><td>'+r[3]+'</td><td>'+r[4]+'</td><td class="reg">'+parseFloat(r[5]||0).toFixed(2)+'</td><td class="ot">'+(parseFloat(r[7]||0)>0?parseFloat(r[7]).toFixed(2):'-')+'</td><td>'+(r[9]||'-')+'</td><td style="color:#633806;">'+(r[8]||'-')+'</td></tr>';
    }).join('');
  }).catch(function(){tb.innerHTML='<tr><td colspan="9" style="text-align:center;color:#999;padding:1rem;">Could not load.</td></tr>';});
}

function exportCSV(){
  if(!recs.length){alert('No records to export.');return;}
  var csv='Date,Name,Department,Time In,Time Out,Hours,Regular,Overtime,OT Remarks,Late (min),Late Reason\n';
  recs.forEach(function(r){csv+=r.date+','+r.name+','+r.dept+','+r.timeIn+','+r.timeOut+','+r.hours+','+r.reg+','+r.ot+','+(r.otRemark||'')+','+(r.lateMins||0)+','+(r.lateReason||'')+'\n';});
  dl(csv,'TITO-Records.csv');
}

// LEAVE
function checkMedCert(){
  var type=document.getElementById('fl-type').value;
  var days=parseFloat(document.getElementById('fl-days').value)||1;
  var box=document.getElementById('medcert-box');
  if(type==='SL'&&days>=2){box.style.display='block';}
  else{box.style.display='none';}
}

function getCredits(name){
  var c=leaveCredits[name]||{};
  return {VL:c.VL!==undefined?c.VL:DEFAULT_CREDITS.VL,SL:c.SL!==undefined?c.SL:DEFAULT_CREDITS.SL,
    EL:c.EL!==undefined?c.EL:DEFAULT_CREDITS.EL,ML:c.ML!==undefined?c.ML:DEFAULT_CREDITS.ML,PL:c.PL!==undefined?c.PL:DEFAULT_CREDITS.PL};
}

function getUsed(name){
  var used={VL:0,SL:0,EL:0,ML:0,PL:0};
  leaveRecs.filter(function(r){return r.name===name&&r.status==='Approved';}).forEach(function(r){
    if(used[r.type]!==undefined)used[r.type]+=parseFloat(r.days||0);
  });
  return used;
}

function renderLeaveBalance(){
  var name=document.getElementById('leave-name').value.trim();
  if(!name)return;
  var credits=getCredits(name),used=getUsed(name);
  document.getElementById('bal-vl').textContent=(credits.VL-used.VL).toFixed(1);
  document.getElementById('bal-sl').textContent=(credits.SL-used.SL).toFixed(1);
  document.getElementById('bal-el').textContent=(credits.EL-used.EL).toFixed(1);
  document.getElementById('bal-ml').textContent=(credits.ML-used.ML).toFixed(1);
  document.getElementById('bal-pl').textContent=(credits.PL-used.PL).toFixed(1);
  renderMyLeaveHistory(name);
}

function renderMyLeaveHistory(name){
  var tb=document.getElementById('leave-tb');
  var f=leaveRecs.filter(function(r){return r.name===name;});
  if(!f.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:#999;padding:1.5rem;">No leave records yet.</td></tr>';return;}
  var icons={VL:'🟢',SL:'🔵',EL:'🟡',ML:'🟣',PL:'🟤'};
  var colors={VL:'#1B5E20',SL:'#0D47A1',EL:'#F57F17',ML:'#4A148C',PL:'#BF360C'};
  tb.innerHTML=f.map(function(r){
    var sc=r.status==='Approved'?'b-approved':r.status==='Declined'?'b-declined':'b-pending';
    var mc=r.needsMedCert?'<span class="badge b-pending">Required</span>':'-';
    return '<tr><td>'+r.filed+'</td><td><span style="color:'+colors[r.type]+';font-weight:600;">'+icons[r.type]+' '+r.type+'</span></td><td>'+r.days+'</td><td>'+r.start+'</td><td>'+r.end+'</td><td>'+(r.reason||'—')+'</td><td>'+mc+'</td><td><span class="badge '+sc+'">'+r.status+'</span></td></tr>';
  }).join('');
}

function fileLeave(){
  var name=document.getElementById('fl-name').value.trim();
  var type=document.getElementById('fl-type').value;
  var days=parseFloat(document.getElementById('fl-days').value)||1;
  var start=document.getElementById('fl-start').value;
  var end=document.getElementById('fl-end').value;
  var reason=document.getElementById('fl-reason').value.trim();
  var msg=document.getElementById('leave-msg');
  var needsMedCert=type==='SL'&&days>=2;
  if(!name){msg.textContent='Please enter your name.';msg.style.color='#993C1D';return;}
  if(!start||!end){msg.textContent='Please select dates.';msg.style.color='#993C1D';return;}
  
  // Rule 3: Advance filing (1-2 days before)
  var today = new Date(); today.setHours(0,0,0,0);
  var startD = new Date(start); startD.setHours(0,0,0,0);
  var diffDays = Math.ceil((startD - today) / (1000 * 60 * 60 * 24));
  if(diffDays < 1){
    msg.textContent='Leave must be filed at least 1-2 days in advance.';
    msg.style.color='#993C1D'; return;
  }

  // Rule 2: Conflict check
  var hasConflict = leaveRecs.some(function(r){
    if(r.status === 'Declined') return false;
    var rStart = new Date(r.start);
    var rEnd = new Date(r.end);
    return (startD <= rEnd && new Date(end) >= rStart);
  });

  var credits=getCredits(name),used=getUsed(name);
  var remaining=credits[type]-used[type];
  if(days>remaining){msg.textContent='Insufficient '+type+' balance. Remaining: '+remaining.toFixed(1)+' days.';msg.style.color='#993C1D';return;}
  
  var rec={filed:new Date().toLocaleDateString('en-PH'),name:name,type:type,days:days,start:start,end:end,reason:reason,status:'Pending',needsMedCert:needsMedCert, conflict:hasConflict};
  leaveRecs.push(rec);ss('tito_leave',JSON.stringify(leaveRecs));
  var medNote=needsMedCert?' Please prepare a Medical Certificate from your doctor.':'';
  msg.textContent='Leave request submitted! Waiting for admin approval.'+medNote;
  msg.style.color='#085041';
  updPendingCount();
  document.getElementById('leave-name').value=name;
  renderLeaveBalance();
}

// PAYROLL
function fmt(n){return '₱'+parseFloat(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');}

// PAYROLL LOGIN
function payrollLogin(){
  var pw=document.getElementById('payroll-pw').value;
  var stored=gs('tito_payroll_pw')||'payroll123';
  if(pw===stored){
    document.getElementById('payroll-lock').style.display='none';
    document.getElementById('payroll-panel').style.display='block';
  }else{document.getElementById('payroll-pw-msg').textContent='Incorrect password.';}
}

function payrollLogout(){
  document.getElementById('payroll-lock').style.display='block';
  document.getElementById('payroll-panel').style.display='none';
  document.getElementById('payroll-pw').value='';
  document.getElementById('payroll-pw-msg').textContent='';
}

function autoFillRate(){
  var name=document.getElementById('pay-name').value.trim();
  if(salaryRates[name]){
    document.getElementById('pay-rate').value=salaryRates[name].rate||'';
    document.getElementById('pay-wdays').value=salaryRates[name].days||22;
  }
}

function computePayroll(){
  var name=document.getElementById('pay-name').value.trim();
  var rate=parseFloat(document.getElementById('pay-rate').value)||0;
  var workDays=parseFloat(document.getElementById('pay-wdays').value)||22;
  var start=document.getElementById('pay-start').value;
  var end=document.getElementById('pay-end').value;
  var msg=document.getElementById('pay-msg');
  if(!name){msg.textContent='Please enter employee name.';return;}
  if(!rate){msg.textContent='Please enter monthly rate.';return;}
  if(!start||!end){msg.textContent='Please set period dates.';return;}
  msg.textContent='';

  var startD=new Date(start),endD=new Date(end);
  var periodRecs=recs.filter(function(r){
    if(r.name!==name)return false;
    var parts=r.date.split('/');
    if(parts.length===3){var d=new Date(parts[2],parts[0]-1,parts[1]);return d>=startD&&d<=endD;}
    return false;
  });

  var daysWorked=periodRecs.length;
  var totalOTHrs=periodRecs.reduce(function(a,r){return a+r.ot;},0);
  var totalLateMins=periodRecs.reduce(function(a,r){return a+(r.lateMins||0);},0);
  var dailyRate=rate/workDays;
  var hourlyRate=dailyRate/8;
  var otRate=hourlyRate*1.25;
  var minuteRate=hourlyRate/60;
  var basicPay=dailyRate*daysWorked;
  var otPay=otRate*totalOTHrs;
  var lateDeduct=minuteRate*totalLateMins;
  var grossPay=basicPay+otPay-lateDeduct;

  // Update late label to show total hours deducted instead of just minutes
  var totalLateHrs = totalLateMins / 60;
  document.getElementById('ps-latemins-label').textContent = totalLateMins + " min (" + totalLateHrs.toFixed(1) + " hr)";

  document.getElementById('ps-period').textContent='Period: '+start+' to '+end;
  document.getElementById('ps-name').textContent=name;
  document.getElementById('ps-mrate').textContent=fmt(rate)+'/month';
  document.getElementById('ps-daysworked').textContent=daysWorked+' day(s)';
  document.getElementById('ps-dailyrate').textContent=fmt(dailyRate)+'/day';
  document.getElementById('ps-hrlyrate').textContent=fmt(hourlyRate)+'/hr';
  document.getElementById('ps-basic').textContent=fmt(basicPay);
  document.getElementById('ps-othrs').textContent=totalOTHrs.toFixed(2)+' hrs';
  document.getElementById('ps-otrate').textContent=fmt(otRate)+'/hr';
  document.getElementById('ps-otpay').textContent=fmt(otPay);
  document.getElementById('ps-latemins-label').textContent=totalLateMins;
  document.getElementById('ps-latededuct').textContent='-'+fmt(lateDeduct);
  document.getElementById('ps-gross').textContent=fmt(grossPay);
  document.getElementById('payslip-result').style.display='block';
}

function printPayslip(){
  var logo = document.querySelector('.header img').src;
  var name = document.getElementById('ps-name').textContent;
  var period = document.getElementById('ps-period').textContent;
  var mrate = document.getElementById('ps-mrate').textContent;
  var days = document.getElementById('ps-daysworked').textContent;
  var drate = document.getElementById('ps-dailyrate').textContent;
  var hrate = document.getElementById('ps-hrlyrate').textContent;
  var basic = document.getElementById('ps-basic').textContent;
  var othrs = document.getElementById('ps-othrs').textContent;
  var otrate = document.getElementById('ps-otrate').textContent;
  var otpay = document.getElementById('ps-otpay').textContent;
  var lateLabel = document.getElementById('ps-latemins-label').textContent;
  var latededuct = document.getElementById('ps-latededuct').textContent;
  var gross = document.getElementById('ps-gross').textContent;

  var printWin = window.open('', '', 'width=800,height=900');
  var content = `
    <html>
    <head>
      <title>Print Payslip</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #222; }
        .payslip-box { border: 2px solid #0F6E56; padding: 30px; border-radius: 12px; }
        .logo { text-align: center; margin-bottom: 20px; }
        .logo img { max-height: 80px; }
        .header-info { text-align: center; margin-bottom: 20px; }
        .title { font-size: 22px; font-weight: 700; color: #0F6E56; margin-bottom: 5px; }
        .hr { border-top: 1px solid #eee; margin: 15px 0; }
        .hr-bold { border-top: 2px solid #0F6E56; margin: 15px 0; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; }
        .total-row { display: flex; justify-content: space-between; padding: 12px 0; font-size: 18px; font-weight: 700; color: #0F6E56; }
        .label { color: #666; font-size: 12px; text-transform: uppercase; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="payslip-box">
        <div class="logo"><img src="${logo}"></div>
        <div class="header-info">
          <div class="title">PAYSLIP</div>
          <div style="font-size: 14px; color: #666;">${period}</div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <div><div class="label">Employee</div><div style="font-size: 16px; font-weight: 600;">${name}</div></div>
          <div style="text-align: right;"><div class="label">Monthly Rate</div><div style="font-size: 16px; font-weight: 600; color: #0F6E56;">${mrate}</div></div>
        </div>
        <div class="hr"></div>
        <div class="label">Earnings</div>
        <div class="row"><span>Days worked</span><span>${days}</span></div>
        <div class="row"><span>Daily rate</span><span>${drate}</span></div>
        <div class="row"><span>Hourly rate</span><span>${hrate}</span></div>
        <div class="row" style="font-weight: 600;"><span>Basic pay</span><span>${basic}</span></div>
        <div class="hr"></div>
        <div class="label">Overtime (1.25×)</div>
        <div class="row"><span>OT hours</span><span>${othrs}</span></div>
        <div class="row"><span>OT rate</span><span>${otrate}</span></div>
        <div class="row" style="font-weight: 600;"><span>OT pay</span><span>${otpay}</span></div>
        <div class="hr"></div>
        <div class="label">Deductions</div>
        <div class="row"><span>Late deduction (${lateLabel})</span><span style="color: #993C1D;">${latededuct}</span></div>
        <div class="hr-bold"></div>
        <div class="total-row"><span>GROSS PAY</span><span>${gross}</span></div>
        <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px;">
          <div style="border-top: 1px solid #ccc; width: 200px; text-align: center; padding-top: 5px;">Employee Signature</div>
          <div style="border-top: 1px solid #ccc; width: 200px; text-align: center; padding-top: 5px;">Approved By</div>
        </div>
      </div>
      <script>window.onload = function() { window.print(); window.close(); };<\/script>
    </body>
    </html>
  `;
  printWin.document.write(content);
  printWin.document.close();
}

function printMemo(i){
  var logo = document.querySelector('.header img').src;
  var memo = memos[i];
  var printWin = window.open('', '', 'width=800,height=600');
  var content = `
    <html>
    <head>
      <title>Print Memo</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; }
        .memo-box { border: 2px solid #000; padding: 30px; }
        .logo { text-align: center; margin-bottom: 20px; }
        .logo img { max-height: 60px; }
        .hr { border-top: 1px solid #000; margin: 20px 0; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #eee; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 8px 0; }
      </style>
    </head>
    <body>
      <div class="memo-box">
        <div class="logo"><img src="${logo}"></div>
        <div style="font-size: 20px; font-weight: 700; text-align: center; margin-bottom: 20px;">📝 MEMO — Late Arrival</div>
        <div class="hr"></div>
        <table>
          <tr><td style="width: 150px;">To:</td><td><strong>${memo.name}</strong></td></tr>
          <tr><td>Department:</td><td>${memo.dept}</td></tr>
          <tr><td>Date:</td><td>${memo.date}</td></tr>
          <tr><td>Time In:</td><td>${memo.timeIn} (${memo.lateMins} min late)</td></tr>
          <tr><td>Reason:</td><td>${memo.reason || 'No reason provided'}</td></tr>
        </table>
        <div class="hr"></div>
        <p>This memo serves as a formal notice of your late arrival. Official start time is 8:00 AM.</p>
        <div style="margin-top: 50px; display: flex; justify-content: space-between;">
          <div>Noted by: _______________________<br><small>Supervisor</small></div>
          <div>Received by: _______________________<br><small>Employee</small></div>
        </div>
      </div>
      <script>window.onload = function() { window.print(); window.close(); };<\/script>
    </body>
    </html>
  `;
  printWin.document.write(content);
  printWin.document.close();
}

function saveSalary(){
  var name=document.getElementById('sal-name').value.trim();
  var rate=parseFloat(document.getElementById('sal-rate').value)||0;
  var days=parseFloat(document.getElementById('sal-wdays').value)||22;
  var msg=document.getElementById('sal-msg');
  if(!name||!rate){msg.textContent='Please enter name and rate.';return;}
  salaryRates[name]={rate:rate,days:days};
  ss('tito_salary',JSON.stringify(salaryRates));
  msg.textContent='Saved! '+name+' — '+fmt(rate)+'/month';
  msg.style.color='#085041';
}

// MEMOS
function renderMemos(){
  var list=document.getElementById('memo-list');
  var empty=document.getElementById('memo-empty');
  if(!memos.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=memos.map(function(m,i){
    return '<div class="memo-box"><div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;"><div><div style="font-size:16px;font-weight:700;color:#F57F17;margin-bottom:4px;">📝 MEMO — Late Arrival</div><div class="sm">Generated: '+m.date+'</div></div><div><button class="btn btn-primary" onclick="printMemo('+i+')" style="font-size:12px;padding:5px 10px;margin-right:5px;">🖨️ Print</button><button class="btn" onclick="deleteMemo('+i+')" style="font-size:12px;padding:5px 10px;color:#999;">🗑 Delete</button></div></div><div class="hr"></div><table style="width:100%;font-size:13px;"><tr><td style="padding:5px 0;color:#666;width:140px;">To:</td><td><strong>'+m.name+'</strong></td></tr><tr><td style="padding:5px 0;color:#666;">Department:</td><td>'+m.dept+'</td></tr><tr><td style="padding:5px 0;color:#666;">Date:</td><td>'+m.date+'</td></tr><tr><td style="padding:5px 0;color:#666;">Time In:</td><td>'+m.timeIn+' <span class="badge b-late">'+m.lateMins+' min late</span></td></tr><tr><td style="padding:5px 0;color:#666;">Reason given:</td><td>'+(m.reason||'No reason provided')+'</td></tr></table><div class="hr"></div>    <div style="font-size:13px;line-height:1.8;">This memo serves as a formal notice of your late arrival. Please be reminded that the official start time is <strong>8:00 AM</strong>. Repeated tardiness may result in further disciplinary action.</div><div style="margin-top:12px;font-size:13px;display:flex;gap:40px;flex-wrap:wrap;"><div>Noted by: _______________________<br><span style="font-size:11px;color:#999;">Supervisor</span></div><div>Received by: _______________________<br><span style="font-size:11px;color:#999;">Employee</span></div></div></div>';
  }).join('');
}

function deleteMemo(i){
  if(confirm('Delete this memo?')){memos.splice(i,1);ss('tito_memos',JSON.stringify(memos));updMemoCount();renderMemos();}
}

// ADMIN
function adminLogin(){
  var pw=document.getElementById('admin-pw').value;
  var stored=gs('tito_admin_pw')||'tito3';
  if(pw===stored){
    adminLoggedIn=true;
    document.getElementById('admin-lock').style.display='none';
    document.getElementById('admin-panel').style.display='block';
    document.getElementById('settings-tab').style.display='inline-block';
    renderAdminPanel();
  }else{document.getElementById('admin-pw-msg').textContent='Incorrect password.';}
}

function adminLogout(){
  adminLoggedIn=false;
  document.getElementById('admin-lock').style.display='block';
  document.getElementById('admin-panel').style.display='none';
  document.getElementById('admin-pw').value='';
  document.getElementById('admin-pw-msg').textContent='';
  document.getElementById('settings-tab').style.display='none';
  // hide settings page if currently shown
  document.getElementById('pg-settings').classList.remove('active');
}

function renderAdminPanel(){if(!adminLoggedIn)return;renderEmpMaster();renderPendingTable();renderAllLeaveTable();}

function renderEmpMaster(){
  var tb=document.getElementById('emp-master-tb');
  if(!employees.length){tb.innerHTML='<tr><td colspan="12" style="text-align:center;color:#999;padding:1.5rem;">No employees found.</td></tr>';return;}
  tb.innerHTML=employees.map(function(e, i){
    var credits = leaveCredits[e.name] || DEFAULT_CREDITS;
    var rate = salaryRates[e.name] || {rate:0, days:22};
    return '<tr><td>'+(e.id||'—')+'</td><td><strong>'+e.name+'</strong></td><td>'+(e.dept||'—')+'</td><td><span class="badge b-neutral">'+(e.status||'—')+'</span></td><td>'+(e.hired||'—')+'</td><td>'+fmt(rate.rate)+'</td><td>'+credits.VL+'</td><td>'+credits.SL+'</td><td>'+credits.EL+'</td><td>'+credits.ML+'</td><td>'+credits.PL+'</td><td><button class="btn btn-approve" onclick="showEditEmpModal('+i+')">✏️ Edit</button></td></tr>';
  }).join('');
}

function showAddEmpModal(){
  currentEditEmp = null;
  document.getElementById('modal-title').textContent = "Add New Employee";
  document.getElementById('m-id').value = "";
  document.getElementById('m-name').value = "";
  document.getElementById('m-dept').value = "";
  document.getElementById('m-hired').value = "";
  document.getElementById('m-status').value = "Probationary";
  document.getElementById('m-rate').value = "";
  document.getElementById('m-wdays').value = "22";
  document.getElementById('m-vl').value = "15";
  document.getElementById('m-sl').value = "15";
  document.getElementById('m-el').value = "5";
  document.getElementById('m-ml').value = "105";
  document.getElementById('m-pl').value = "7";
  document.getElementById('emp-modal').style.display = "block";
  document.getElementById('modal-bg').style.display = "block";
}

function showEditEmpModal(i){
  currentEditEmp = i;
  var e = employees[i];
  var credits = leaveCredits[e.name] || DEFAULT_CREDITS;
  var rate = salaryRates[e.name] || {rate:0, days:22};
  document.getElementById('modal-title').textContent = "Edit Employee: " + e.name;
  document.getElementById('m-id').value = e.id || "";
  document.getElementById('m-name').value = e.name;
  document.getElementById('m-dept').value = e.dept || "";
  document.getElementById('m-hired').value = e.hired || "";
  document.getElementById('m-status').value = e.status || "Probationary";
  document.getElementById('m-rate').value = rate.rate;
  document.getElementById('m-wdays').value = rate.days;
  document.getElementById('m-vl').value = credits.VL;
  document.getElementById('m-sl').value = credits.SL;
  document.getElementById('m-el').value = credits.EL;
  document.getElementById('m-ml').value = credits.ML;
  document.getElementById('m-pl').value = credits.PL;
  document.getElementById('emp-modal').style.display = "block";
  document.getElementById('modal-bg').style.display = "block";
}

function closeEmpModal(){
  document.getElementById('emp-modal').style.display = "none";
  document.getElementById('modal-bg').style.display = "none";
}

function saveEmp(){
  var id = document.getElementById('m-id').value.trim();
  var name = document.getElementById('m-name').value.trim();
  var dept = document.getElementById('m-dept').value.trim();
  var hired = document.getElementById('m-hired').value;
  var status = document.getElementById('m-status').value;
  var rate = parseFloat(document.getElementById('m-rate').value) || 0;
  var days = parseFloat(document.getElementById('m-wdays').value) || 22;
  var vl = parseFloat(document.getElementById('m-vl').value) || 0;
  var sl = parseFloat(document.getElementById('m-sl').value) || 0;
  var el = parseFloat(document.getElementById('m-el').value) || 0;
  var ml = parseFloat(document.getElementById('m-ml').value) || 0;
  var pl = parseFloat(document.getElementById('m-pl').value) || 0;

  if(!name){alert("Name is required."); return;}

  var empData = {id: id, name: name, dept: dept, hired: hired, status: status};
  if(currentEditEmp !== null) {
    employees[currentEditEmp] = empData;
  } else {
    employees.push(empData);
  }

  salaryRates[name] = {rate: rate, days: days};
  leaveCredits[name] = {VL: vl, SL: sl, EL: el, ML: ml, PL: pl};

  ss('tito_employees', JSON.stringify(employees));
  ss('tito_salary', JSON.stringify(salaryRates));
  ss('tito_credits', JSON.stringify(leaveCredits));

  renderAdminPanel();
  closeEmpModal();
}

function renderPendingTable(){
  var tb=document.getElementById('pending-tb');
  var pending=leaveRecs.filter(function(r){return r.status==='Pending';});
  if(!pending.length){tb.innerHTML='<tr><td colspan="10" style="text-align:center;color:#999;padding:1.5rem;">No pending requests. ✅</td></tr>';return;}
  var icons={VL:'🟢',SL:'🔵',EL:'🟡',ML:'🟣',PL:'🟤'};
  tb.innerHTML=pending.map(function(r){
    var idx=leaveRecs.indexOf(r);
    var mc=r.needsMedCert?'<span class="badge b-pending">Required</span>':'-';
    var conf=r.conflict?'<span class="badge b-warn">Conflict</span>':'-';
    return '<tr><td>'+r.filed+'</td><td><strong>'+r.name+'</strong></td><td>'+icons[r.type]+' '+r.type+'</td><td>'+r.days+'</td><td>'+r.start+'</td><td>'+r.end+'</td><td>'+(r.reason||'—')+'</td><td>'+mc+'</td><td>'+conf+'</td><td style="white-space:nowrap;"><button class="btn btn-approve" onclick="approveLeave('+idx+')">✅ Approve</button> <button class="btn btn-decline" onclick="declineLeave('+idx+')">❌ Decline</button></td></tr>';
  }).join('');
}

function renderAllLeaveTable(){
  var tb=document.getElementById('all-leave-tb');
  if(!leaveRecs.length){tb.innerHTML='<tr><td colspan="11" style="text-align:center;color:#999;padding:1.5rem;">No records yet.</td></tr>';return;}
  var icons={VL:'🟢',SL:'🔵',EL:'🟡',ML:'🟣',PL:'🟤'};
  tb.innerHTML=leaveRecs.map(function(r,idx){
    var sc=r.status==='Approved'?'b-approved':r.status==='Declined'?'b-declined':'b-pending';
    var mc=r.needsMedCert?'<span class="badge b-pending">Required</span>':'-';
    var conf=r.conflict?'<span class="badge b-warn">Conflict</span>':'-';
    var actions=r.status==='Pending'?'<button class="btn btn-approve" onclick="approveLeave('+idx+')" style="margin-right:4px;">✅</button><button class="btn btn-decline" onclick="declineLeave('+idx+')">❌</button>':'—';
    return '<tr><td>'+r.filed+'</td><td>'+r.name+'</td><td>'+icons[r.type]+' '+r.type+'</td><td>'+r.days+'</td><td>'+r.start+'</td><td>'+r.end+'</td><td>'+(r.reason||'—')+'</td><td>'+mc+'</td><td>'+conf+'</td><td><span class="badge '+sc+'">'+r.status+'</span></td><td>'+actions+'</td></tr>';
  }).join('');
}

function approveLeave(idx){leaveRecs[idx].status='Approved';ss('tito_leave',JSON.stringify(leaveRecs));updPendingCount();renderAdminPanel();}
function declineLeave(idx){leaveRecs[idx].status='Declined';ss('tito_leave',JSON.stringify(leaveRecs));updPendingCount();renderAdminPanel();}

function correctLog(){
  var name=document.getElementById('corr-name').value.trim();
  var dateStr=document.getElementById('corr-date').value;
  var timeIn=document.getElementById('corr-in').value;
  var timeOut=document.getElementById('corr-out').value;
  var dept=document.getElementById('corr-dept').value.trim();
  var otRemark=document.getElementById('corr-ot').value.trim();
  var lateMins=parseInt(document.getElementById('corr-late').value)||0;
  var msg=document.getElementById('corr-msg');

  if(!name||!dateStr||!timeIn||!timeOut){msg.textContent='Please fill all required fields.';return;}
  
  var d = new Date(dateStr);
  var formattedDate = (d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear();
  
  // Parse times to calculate hours
  var inParts = timeIn.split(':');
  var outParts = timeOut.split(':');
  var dIn = new Date(2000,0,1,inParts[0],inParts[1]);
  var dOut = new Date(2000,0,1,outParts[0],outParts[1]);
  if(dOut < dIn) dOut.setDate(dOut.getDate()+1);
  var hrs = (dOut - dIn)/3600000;
  
  // Lunch break deduction (12:00 - 1:00)
  var lStart = new Date(2000,0,1,12,0);
  var lEnd = new Date(2000,0,1,13,0);
  if(dIn < lEnd && dOut > lStart) {
    var oStart = new Date(Math.max(dIn, lStart));
    var oEnd = new Date(Math.min(dOut, lEnd));
    var oHrs = (oEnd - oStart) / 3600000;
    if(oHrs > 0) hrs -= oHrs;
  }

  // Regular hours: 8:00 AM to 6:00 PM
  var wEnd = new Date(2000,0,1,18,0);
  var regHrs = 0, otHrs = 0;
  if(dOut <= wEnd) {
    regHrs = hrs;
  } else {
    regHrs = (wEnd - dIn) / 3600000;
    if(dIn < lEnd && wEnd > lStart) {
        var oStart = new Date(Math.max(dIn, lStart));
        var oEnd = new Date(Math.min(wEnd, lEnd));
        var oHrs = (oEnd - oStart) / 3600000;
        if(oHrs > 0) regHrs -= oHrs;
    }
    otHrs = (dOut - wEnd) / 3600000;
  }
  var reg = Math.max(0, regHrs), ot = Math.max(0, otHrs);
  hrs = reg + ot;

  var rec={date:formattedDate,name:name,dept:dept||'—',
    timeIn:timeIn, timeOut:timeOut,
    hours:parseFloat(hrs.toFixed(2)),reg:parseFloat(reg.toFixed(2)),ot:parseFloat(ot.toFixed(2)),
    otRemark:otRemark,lateMins:lateMins,lateReason:'Admin Correction'};

  // Check if record exists for this name and date to update, else push
  var existingIdx = recs.findIndex(function(r){return r.name===name && r.date===formattedDate;});
  if(existingIdx >= 0){
    recs[existingIdx] = rec;
    msg.textContent='Updated existing record for '+name+' on '+formattedDate;
  } else {
    recs.push(rec);
    msg.textContent='Added new record for '+name+' on '+formattedDate;
  }
  ss('tito_recs',JSON.stringify(recs));
  updStats();
}

function setCredits(){
  var name=document.getElementById('admin-name').value.trim();
  var msg=document.getElementById('admin-msg');
  if(!name){msg.textContent='Please enter employee name.';return;}
  leaveCredits[name]={VL:parseFloat(document.getElementById('admin-vl').value)||15,SL:parseFloat(document.getElementById('admin-sl').value)||15,
    EL:parseFloat(document.getElementById('admin-el').value)||5,ML:parseFloat(document.getElementById('admin-ml').value)||105,PL:parseFloat(document.getElementById('admin-pl').value)||7};
  ss('tito_credits',JSON.stringify(leaveCredits));
  msg.textContent='Leave credits saved for '+name+'!';msg.style.color='#085041';
}

function changePW(){
  var pw=document.getElementById('new-pw').value.trim();
  var msg=document.getElementById('pw-msg');
  if(!pw){msg.textContent='Please enter a new password.';return;}
  ss('tito_admin_pw',pw);msg.textContent='Password changed!';msg.style.color='#085041';
  document.getElementById('new-pw').value='';
}

function exportLeaveCSV(){
  if(!leaveRecs.length){alert('No leave records to export.');return;}
  var csv='Date Filed,Name,Type,Days,Start,End,Reason,Med Cert Required,Status\n';
  leaveRecs.forEach(function(r){csv+=r.filed+','+r.name+','+r.type+','+r.days+','+r.start+','+r.end+','+(r.reason||'')+(r.needsMedCert?',Yes':',No')+','+r.status+'\n';});
  dl(csv,'Leave-Records.csv');
}

function dl(content,filename){
  var a=document.createElement('a');
  a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(content);
  a.download=filename;a.click();
}

function renderDTR(){
  var name=document.getElementById('ename').value.trim()||'—';
  var dept=document.getElementById('edept').value.trim()||'—';
  document.getElementById('dtr-n').textContent=name;
  document.getElementById('dtr-d').textContent=dept;
  var f=recs.filter(function(r){return r.name===name;});
  var tb=document.getElementById('dtr-tb');
  if(!f.length){tb.innerHTML='<tr><td colspan="8" style="text-align:center;color:#999;padding:1rem;">No records for '+name+'.</td></tr>';
    document.getElementById('dtr-r').textContent='0.00';document.getElementById('dtr-o').textContent='0.00';document.getElementById('dtr-late').textContent='0';}
  else{
    var tr=0,to=0,tl=0;
    tb.innerHTML=f.map(function(r){tr+=r.reg;to+=r.ot;tl+=(r.lateMins||0);
      var lateCell=r.lateMins>0?'<span class="badge b-late">'+r.lateMins+'</span>':'-';
      return '<tr'+(r.lateMins>0?' class="late-row"':'')+'><td>'+r.date+'</td><td>'+r.timeIn+'</td><td>'+r.timeOut+'</td><td class="reg">'+r.hours.toFixed(2)+'</td><td class="reg">'+r.reg.toFixed(2)+'</td><td class="ot">'+(r.ot>0?r.ot.toFixed(2):'-')+'</td><td>'+lateCell+'</td><td style="color:#633806;">'+(r.otRemark||'-')+'</td></tr>';
    }).join('');
    document.getElementById('dtr-r').textContent=tr.toFixed(2);
    document.getElementById('dtr-o').textContent=to.toFixed(2);
    document.getElementById('dtr-late').textContent=tl;
  }
  if(name!=='—'){
    var used=getUsed(name);
    document.getElementById('dtr-vl').textContent=used.VL.toFixed(1);
    document.getElementById('dtr-sl').textContent=used.SL.toFixed(1);
    document.getElementById('dtr-el').textContent=used.EL.toFixed(1);
    document.getElementById('dtr-ml').textContent=used.ML.toFixed(1);
    document.getElementById('dtr-pl').textContent=used.PL.toFixed(1);
  }
}

function saveURL(){
  var val=document.getElementById('url-inp').value.trim();
  SHEET=val;ss('tito_url',val);updSync();
  var msg=document.getElementById('url-msg');
  if(!val){if(msg)msg.textContent='URL cleared.';return;}
  if(msg)msg.textContent='Testing...';
  fetch(SHEET).then(function(r){return r.json();}).then(function(d){
    if(msg)msg.textContent='Connected! Rows: '+(d.data?d.data.length:0);
    document.getElementById('sync-b').textContent='Connected';
    document.getElementById('sync-b').className='badge b-ok';
  }).catch(function(){if(msg)msg.textContent='Could not connect.';});
}

function changePayrollPW(){
  var pw=document.getElementById('new-payroll-pw').value.trim();
  var msg=document.getElementById('payroll-pw-change-msg');
  if(!pw){msg.textContent='Please enter a new password.';return;}
  ss('tito_payroll_pw',pw);
  msg.textContent='Payroll password changed!';msg.style.color='#085041';
  document.getElementById('new-payroll-pw').value='';
}

function clearURL(){SHEET='';ss('tito_url','');document.getElementById('url-inp').value='';updSync();document.getElementById('url-msg').textContent='URL cleared.';}

init();
