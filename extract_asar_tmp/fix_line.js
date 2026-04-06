const fs = require('fs');
const path = 'e:/AIEnglish/SmartLearnPro/src/views/ExamView.jsx';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');
// Line 832 is index 831
lines[831] = '            toast.success(`已加入闪卡：${added}，跳过重复：${skipped}`);';
fs.writeFileSync(path, lines.join('\n'), 'utf8');
console.log('Fixed line 832');
